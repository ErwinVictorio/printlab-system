import { endpoint, reply, storage, uuid } from '../_shared/r2.ts'

Deno.serve(endpoint(async (body, _userId, db) => {
  const { eventId } = body
  if (typeof eventId !== 'string' || !uuid.test(eventId)) return reply({ error: 'Invalid event.' }, 400)
  const preparation = await db.rpc('prepare_event_deletion', { target_event: eventId })
  if (preparation.error?.code === '22023') return reply({ error: preparation.error.message }, 409)
  if (preparation.error) throw preparation.error
  const event = preparation.data[0]
  if (!event) return reply({ deleted: true })
  if (event.ready_at && Date.parse(event.ready_at) > Date.now()) {
    return reply({ deleted: false, readyAt: event.ready_at })
  }

  for (let batch = 0; batch < 5; batch++) {
    const { data, error } = await db.from('upload_intents').select('id,object_key')
      .eq('event_id', eventId).is('object_deleted_at', null).order('id').limit(10)
    if (error) throw error
    for (let start = 0; start < data.length; start += 5) {
      await Promise.all(data.slice(start, start + 5).map(async ({ object_key }) => {
        const prefix = `events/${eventId}/`
        if (!object_key.startsWith(prefix) || !/^(originals|previews)\/[a-f0-9-]+\.(jpg|png|webp|mp4)$/.test(object_key.slice(prefix.length))) {
          throw new Error('Unexpected object key')
        }
        const { r2, url } = storage(object_key)
        const result = await r2.fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(10000) })
        await result.body?.cancel()
        if (!result.ok && result.status !== 404) throw new Error('Could not delete R2 object')
      }))
    }
    if (data.length) {
      const marked = await db.from('upload_intents').update({ object_deleted_at: new Date().toISOString() })
        .eq('event_id', eventId).in('id', data.map((row) => row.id))
      if (marked.error) throw marked.error
    }
    if (data.length < 10) {
      const finished = await db.rpc('finish_event_deletion', { target_event: eventId })
      if (finished.error) throw finished.error
      return reply({ deleted: true })
    }
  }

  return reply({ deleted: false })
}))


