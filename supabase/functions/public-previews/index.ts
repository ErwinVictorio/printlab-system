import { reply, serviceClient, storage } from '../_shared/r2.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return reply({})
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
  const body = await request.json().catch(() => null)
  const slug = body?.slug
  const offset = body?.offset ?? 0
  if (typeof slug !== 'string' || slug.length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647) return reply({ error: 'Invalid event request.' }, 400)
  try {
    const { data, error } = await serviceClient().rpc('list_r2_previews', { event_slug: slug, page_offset: offset })
    if (error) throw error

    const previews = await Promise.all(data.map(async (preview: {
      original_id: string; file_name: string; price_centavos: number; mime_type: string; preview_key: string
    }) => {
      const { r2, url } = storage(preview.preview_key)
      url.searchParams.set('X-Amz-Expires', '600')
      const signed = await r2.sign(url, { method: 'GET', aws: { signQuery: true } })
      return { id: preview.original_id, name: preview.file_name, price: preview.price_centavos, mimeType: preview.mime_type, url: signed.url }
    }))
    return reply({ previews, hasMore: data.length === 24 })
  } catch {
    return reply({ error: 'Previews are temporarily unavailable.' }, 503)
  }
})


