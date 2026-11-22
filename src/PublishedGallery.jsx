import { useEffect, useState } from 'react'
import { money } from './catalog'
import { supabase } from './lib/supabase'

export default function PublishedGallery({ slug, onAdd, cart, eventTitle }) {
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    let active = true
    async function load() {
      const { data, error } = await supabase.functions.invoke('public-previews', { body: { slug, offset: page * 24 } })
      if (active) setResult({ page, attempt, data, error })
    }
    void load()
    return () => { active = false }
  }, [slug, page, attempt])

  if (result?.page !== page || result.attempt !== attempt) return <p className="panel" role="status">Loading previews…</p>
  if (result.error) return <div className="panel stack"><p role="alert">Previews are temporarily unavailable.</p><button className="primary" onClick={() => setAttempt(attempt + 1)}>Retry</button></div>
  const { previews, hasMore } = result.data
  return <section className="stack">
    <h2>Photo and video previews</h2>
    {!previews.length && <p className="panel">No previews available on this page.</p>}
    <div className="cards">{previews.map((item) => <article className="event-card" key={item.id}>
      {item.mimeType === 'video/mp4'
        ? <video className="public-preview-video" src={item.url} controls preload="metadata" aria-label={item.name} />
        : <img src={item.url} alt={item.name} loading="lazy" />}
      <div className="event-info"><b>{item.name}</b><p>{money.format(item.price / 100)}</p><button className="primary" disabled={cart.includes(item.id)} onClick={() => onAdd({ id: item.id, name: item.name, price: item.price, eventTitle })}>{cart.includes(item.id) ? 'In cart' : 'Add to cart'}</button></div>
    </article>)}</div>
    {(page > 0 || hasMore) && <div className="section-heading">
      <button className="primary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
      <button className="primary" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </section>
}

