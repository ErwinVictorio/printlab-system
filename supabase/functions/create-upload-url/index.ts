import { endpoint, limits, reply, storage, uuid } from '../_shared/r2.ts'

Deno.serve(endpoint(async (body, userId, db) => {
  const { eventId, name, type, size, priceCentavos, previewOf } = body
  const format = typeof type === 'string' && Object.hasOwn(limits, type) ? limits[type as keyof typeof limits] : null
  if (typeof eventId !== 'string' || !uuid.test(eventId) || typeof name !== 'string'
    || !name.trim() || [...name].length > 255 || !format || typeof size !== 'number'
    || !Number.isInteger(size) || size < 1 || size > format.bytes) {
    return reply({ error: 'Choose a JPG, PNG, WebP (25 MB max), or MP4 (100 MB max).' }, 400)
  }
  if (priceCentavos !== undefined && (typeof priceCentavos !== 'number' || !Number.isInteger(priceCentavos)
    || priceCentavos < 1 || priceCentavos > 99999999)) {
    return reply({ error: 'Enter a valid price in Philippine pesos.' }, 400)
  }
  if (previewOf !== undefined && (typeof previewOf !== 'string' || !uuid.test(previewOf) || priceCentavos !== undefined)) {
    return reply({ error: 'Invalid preview request.' }, 400)
  }
  const id = crypto.randomUUID()
  const key = `events/${eventId}/${previewOf ? 'previews' : 'originals'}/${id}.${format.extension}`
  const { r2, url } = storage(key)
  url.searchParams.set('X-Amz-Expires', '300')
  const headers = { 'Content-Type': type as string, 'If-None-Match': '*' }
  const signed = await r2.sign(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Length': String(size) },
    aws: { signQuery: true, allHeaders: true },
  })
  const signature = new URL(signed.url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? []
  if (!['content-length', 'content-type', 'if-none-match'].every((header) => signature.includes(header))) {
    return reply({ error: 'The Edge runtime did not sign all required R2 upload headers.' }, 503)
  }
  const reservation = {
    upload_id: id, uploader: userId, target_event: eventId, storage_key: key,
    original_name: name.trim(), content_type: type, content_size: size,
  }
  const { error } = previewOf
    ? await db.rpc('reserve_r2_preview', { ...reservation, original_id: previewOf })
    : await db.rpc('reserve_r2_upload', { ...reservation, price: priceCentavos ?? null })
  if (error?.code === '42501') return reply({ error: 'You do not have upload access to this event.' }, 403)
  if (error?.code === 'P0001') return reply({ error: 'Hourly upload limit reached. Try again later.' }, 429)
  if (error) return reply({ error: 'Could not reserve upload in Supabase.', code: error.code }, 503)
  return reply({ id, url: signed.url, headers })
}))



