import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Uploads from './Uploads'
import EventCover from './EventCover'

function eventSlug(title) {
  return title.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 88).replace(/^-|-$/g, '') || 'event'
}

export default function OwnerEventForm({ userId, eventId, onSaved }) {
  const navigate = useNavigate()
  const [record, setRecord] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      const [categories, event] = await Promise.all([
        supabase.from('event_categories').select('id,name').order('name').abortSignal(controller.signal),
        eventId ? supabase.from('events').select('id,title,slug,event_date,category_id,status,deletion_requested_at,cover_path').eq('id', eventId).maybeSingle().abortSignal(controller.signal) : { data: null },
      ])
      if (!controller.signal.aborted) setRecord({ categories: categories.data ?? [], event: event.data, error: categories.error || event.error })
    }
    void load()
    return () => controller.abort()
  }, [eventId])

  async function save(submit) {
    submit.preventDefault()
    if (busy) return
    const fields = new FormData(submit.currentTarget)
    const values = {
      title: fields.get('title').trim(),
      event_date: fields.get('date'), category_id: fields.get('category'),
    }
    setBusy(true)
    try {
      const columns = 'id,title,slug,event_date,category_id,status,deletion_requested_at,cover_path'
      const insert = (slug) => supabase.from('events').insert({ ...values, slug, owner_id: userId }).select(columns).single()
      const slug = eventSlug(values.title)
      let result = eventId
        ? await supabase.from('events').update(values).eq('id', eventId).select(columns).single()
        : await insert(slug)
      if (!eventId && result.error?.code === '23505') {
        result = await insert(`${slug}-${crypto.randomUUID().slice(0, 8)}`)
      }
      if (result.error) {
        setMessage(result.error.message)
        return
      }
      onSaved()
      if (eventId) {
        setRecord((current) => ({ ...current, event: result.data }))
        setMessage('Event updated.')
      } else {
        navigate(`/owner/events/${result.data.id}/media`)
      }
    } finally {
      setBusy(false)
    }
  }

  async function changeVisibility(event) {
    const status = event.status === 'published' ? 'draft' : 'published'
    setBusy(true)
    setMessage('')
    try {
      const { data, error } = await supabase.from('events').update({ status })
        .eq('id', event.id).eq('status', event.status)
        .select('id,title,slug,event_date,category_id,status,deletion_requested_at,cover_path').single()
      if (error) {
        setMessage('Could not change visibility. Reload the event and try again.')
        return
      }
      setRecord((current) => ({ ...current, event: data }))
      setMessage(status === 'published' ? 'Event published.' : 'Event returned to draft.')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  if (!record) return <p role="status">Loading event form…</p>
  if (record.error || (eventId && !record.event)) return <p role="alert">Event details are unavailable.</p>
  const event = record.event
  const form = <form className="admin-panel stack" onSubmit={save}>
      {!event && <h2>Create an event</h2>}
      <label>Event name<input name="title" required maxLength={150} defaultValue={event?.title} /></label>
      <label>Date<input name="date" type="date" required defaultValue={event?.event_date} /></label>
      <label>Category<select name="category" defaultValue={event?.category_id ?? ''} required>
        <option value="" disabled>Select a category</option>
        {record.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label>
      <button className="admin-action" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Create event and upload'}</button>

    </form>

  return <div className="stack">
    {event ? <>
      <Link to="/owner/events">Back to events</Link>
      <h2>{event.title}</h2>
      {event.status !== 'archived' && <EventCover event={event} onSaved={(coverPath) => {
        setRecord((current) => ({ ...current, event: { ...current.event, cover_path: coverPath } }))
        onSaved()
      }} />}
      {event.status !== 'archived' && <Uploads event={event} onUploaded={onSaved} />}
      {!event.deletion_requested_at && <details className="admin-panel">
        <summary>Edit event details</summary>
        {form}
      </details>}
    </> : form}
    {event && event.status !== 'archived' && <section className="admin-panel stack">
      <h2>Storefront visibility</h2>
      <p>{event.status === 'published' ? 'Published on the customer Events page.' : 'Draft. Publish to show this event on the customer Events page.'} Uploaded originals stay private.</p>
      <div className="section-heading">
        <button className="admin-action" type="button" disabled={busy} onClick={() => changeVisibility(event)}>
          {event.status === 'published' ? 'Unpublish event' : 'Publish event'}
        </button>
        {event.status === 'published' && <Link to={`/events/${event.slug}`}>View public event</Link>}
      </div>
    </section>}
    {message && <p role="status">{message}</p>}

  </div>
}






