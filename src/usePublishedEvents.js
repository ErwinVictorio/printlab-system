import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const empty = { events: [], loading: Boolean(supabase), error: false }

export function usePublishedEvents(slug) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!supabase) return
    const controller = new AbortController()
    async function load() {
      let query = supabase.from('events')
        .select('slug,title,event_date,location,description,cover_path,event_categories(name)')
        .eq('status', 'published')
        .order('event_date', { ascending: false }).order('slug')
      if (slug) query = query.eq('slug', slug)
      const events = []
      let error
      for (let offset = 0; ; offset += 200) {
        const page = await query.range(offset, offset + 199).abortSignal(controller.signal)
        error = page.error
        if (error) break
        const paths = page.data.map((row) => row.cover_path).filter(Boolean)
        const signed = paths.length ? await supabase.storage.from('event-covers').createSignedUrls(paths, 600) : null
        const covers = new Map(signed?.data?.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]))
        events.push(...page.data.map((row) => ({
          slug: row.slug, title: row.title, date: row.event_date, location: row.location,
          cover: covers.get(row.cover_path), description: row.description, category: row.event_categories?.name ?? 'Event',
        })))
        if (page.data.length < 200 || slug) break
      }
      if (!controller.signal.aborted) setResult({ slug, events, loading: false, error: Boolean(error) })
    }
    void load()
    return () => controller.abort()
  }, [slug])
  return result && result.slug === slug ? result : empty
}

