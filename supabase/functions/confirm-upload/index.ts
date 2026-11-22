import { endpoint, mayUpload, reply, storage, uuid } from '../_shared/r2.ts'

function matchesType(bytes: Uint8Array, mime: string) {
  const ascii = (offset: number, count: number) => String.fromCharCode(...bytes.slice(offset, offset + count))
  switch (mime) {
    case 'image/jpeg': return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    case 'image/png': return bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
    case 'video/mp4': return ascii(4, 4) === 'ftyp'
    default: return false
  }
}

Deno.serve(endpoint(async (body, userId, db) => {
  const { id } = body
  if (typeof id !== 'string' || !uuid.test(id)) return reply({ error: 'Invalid upload ID.' }, 400)
  const { data: intent, error } = await db.from('upload_intents')
    .select('id,event_id,object_key,mime_type,size_bytes,confirmed_at,expires_at,preview_of')
    .eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!intent) return reply({ error: 'Upload not found.' }, 404)
  if (!await mayUpload(db, intent.event_id)) return reply({ error: 'You no longer have upload access to this event.' }, 403)
  if (intent.confirmed_at) return reply({ id, confirmed: true })
  if (Date.now() > Date.parse(intent.expires_at) + 15 * 60 * 1000) {
    return reply({ error: 'Upload verification expired. Start a new upload.' }, 410)
  }

  const { r2, url } = storage(intent.object_key)
  const head = await r2.fetch(url, { method: 'HEAD' })
  if (head.status === 404) return reply({ error: 'The file has not reached R2 yet.' }, 409)
  if (!head.ok) throw new Error('R2 metadata check failed')
  if (Number(head.headers.get('Content-Length')) !== intent.size_bytes || head.headers.get('Content-Type') !== intent.mime_type) {
    return reply({ error: 'The uploaded file size or type does not match the request.' }, 422)
  }
  if (intent.preview_of) {
    const original = await db.from('upload_intents').select('object_key').eq('id', intent.preview_of).single()
    if (original.error) throw original.error
    const source = storage(original.data.object_key)
    const sourceHead = await source.r2.fetch(source.url, { method: 'HEAD' })
    if (!sourceHead.ok) throw new Error('Original metadata check failed')
    if (head.headers.get('ETag') && head.headers.get('ETag') === sourceHead.headers.get('ETag')) {
      return reply({ error: 'The preview is identical to the original. Choose a separate edited file.' }, 422)
    }
  }
  const sample = await r2.fetch(url, { headers: { Range: 'bytes=0-31' } })
  if (sample.status !== 206) {
    await sample.body?.cancel()
    throw new Error('R2 range check failed')
  }
  if (!matchesType(new Uint8Array(await sample.arrayBuffer()), intent.mime_type)) {
    return reply({ error: 'The file contents do not match the selected format.' }, 422)
  }

  const update = await db.from('upload_intents').update({ confirmed_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId).is('confirmed_at', null)
  if (update.error?.code === '23505') return reply({ error: 'This original already has a verified preview.' }, 409)
  if (update.error) throw update.error
  return reply({ id, confirmed: true })
}))


