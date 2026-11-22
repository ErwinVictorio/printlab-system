import { endpoint, reply, storage, uuid } from '../_shared/r2.ts'

const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)

Deno.serve(endpoint(async (body, userId, db, isOwner) => {
  const { action, orderId } = body
  if (action === 'open') {
    const { ids, checkoutKey, total } = body
    if (!isUuid(checkoutKey) || !Array.isArray(ids) || ids.length < 1 || ids.length > 30
      || !ids.every(isUuid) || new Set(ids).size !== ids.length || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 1) {
      return reply({ error: 'Invalid checkout.' }, 400)
    }
    const result = await db.rpc('open_purchase', { buyer: userId, request_key: checkoutKey, originals: ids, expected_total: total })
    if (result.error?.code === '22023') return reply({ error: result.error.message }, 409)
    if (result.error) throw result.error
    return reply({ id: result.data })
  }

  if (!isUuid(orderId)) return reply({ error: 'Invalid order.' }, 400)
  if (action === 'submit') {
    const reference = typeof body.reference === 'string' && body.reference.length <= 80
      ? body.reference.trim().toUpperCase().replace(/[ -]/g, '') : ''
    if (!/^[A-Z0-9]{4,64}$/.test(reference)) return reply({ error: 'Enter a valid transaction reference.' }, 400)
    const result = await db.from('purchase_orders').update({
      status: 'pending_verification', reference_number: reference, submitted_at: new Date().toISOString(),
    }).eq('id', orderId).eq('buyer_id', userId).eq('status', 'awaiting_payment').select('id').maybeSingle()
    if (result.error?.code === '23505') return reply({ error: 'This payment reference has already been submitted.' }, 409)
    if (result.error) throw result.error
    if (!result.data) {
      const existing = await db.from('purchase_orders').select('id').eq('id', orderId).eq('buyer_id', userId)
        .eq('reference_number', reference).maybeSingle()
      if (existing.error) throw existing.error
      if (!existing.data) return reply({ error: 'This order is unavailable for payment submission.' }, 409)
    }
    return reply({ submitted: true })
  }

  if (action === 'approve' || action === 'reject') {
    if (!isOwner) return reply({ error: 'Owner access required.' }, 403)
    const result = await db.from('purchase_orders').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_at: new Date().toISOString(), reviewed_by: userId,
    }).eq('id', orderId).eq('status', 'pending_verification').select('id').maybeSingle()
    if (result.error) throw result.error
    if (!result.data) return reply({ error: 'This order has already been reviewed or is unavailable.' }, 409)
    return reply({ reviewed: true })
  }

  if ((action === 'download' || action === 'view') && isUuid(body.itemId)) {
    const order = await db.from('purchase_orders').select('id').eq('id', orderId)
      .eq('buyer_id', userId).eq('status', 'approved').maybeSingle()
    if (order.error) throw order.error
    if (!order.data) return reply({ error: 'An approved purchase is required.' }, 403)
    const item = await db.from('purchase_items').select('original_id,file_name')
      .eq('id', body.itemId).eq('order_id', orderId).maybeSingle()
    if (item.error) throw item.error
    if (!item.data) return reply({ error: 'Purchased file not found.' }, 404)
    const file = await db.from('upload_intents').select('object_key,event_id,mime_type').eq('id', item.data.original_id)
      .is('preview_of', null).not('confirmed_at', 'is', null).is('object_deleted_at', null).maybeSingle()
    if (file.error) throw file.error
    if (!file.data?.object_key.startsWith(`events/${file.data.event_id}/originals/`)) return reply({ error: 'Original is unavailable.' }, 404)
    const { r2, url } = storage(file.data.object_key)
    url.searchParams.set('X-Amz-Expires', '120')
    const name = item.data.file_name.replace(/[^a-zA-Z0-9._ -]/g, '_')
    url.searchParams.set('response-content-disposition', `${action === 'view' ? 'inline' : 'attachment'}; filename="${name}"`)
    const signed = await r2.sign(url, { method: 'GET', aws: { signQuery: true } })
    return reply({ url: signed.url, mimeType: file.data.mime_type })
  }
  return reply({ error: 'Invalid purchase action.' }, 400)
}, false))

