import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { dateLabel } from './catalog'
import Uploads from './Uploads'

const photographerPages = ['Dashboard', 'Events', 'Orders', 'Earnings', 'Settings']
const slug = (value) => value.toLowerCase().replaceAll(' ', '-')

export function Apply({ session }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (!session) return <section className="section"><h1>Become a photographer</h1><Link to="/login">Sign in to apply</Link></section>
  async function apply(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    const { error } = await supabase.from('photographer_profiles').insert({
      user_id: session.user.id,
      display_name: values.get('name').trim(),
      bio: values.get('bio').trim(),
    })
    setMessage(error?.code === '23505' ? 'You have already applied. Check your dashboard for your status.' : error?.message ?? 'Application submitted for review.')
    setBusy(false)
  }
  return <section className="section auth"><h1>Become a photographer</h1>
    <form className="panel stack" onSubmit={apply}>
      <label>Display name<input required name="name" maxLength={100} /></label>
      <label>About your work<textarea name="bio" maxLength={2000} rows={4} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
      <p role="status">{message}</p>
      <Link to="/photographer/dashboard">Photographer dashboard</Link>
    </form>
  </section>
}

export function Dashboard({ session, sessionReady }) {
  const { section = 'dashboard', eventId } = useParams()
  const [record, setRecord] = useState(null)
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState('')
  const user = session?.user

  const pages = photographerPages
  const title = pages.find((page) => slug(page) === section)
  const prefix = '/photographer'
  const current = record?.userId === user?.id && record?.revision === revision ? record : null

  useEffect(() => {
    if (!user) return
    let active = true
    const profiles = supabase.from('photographer_profiles').select('user_id, display_name, approval_status')
    async function load() {
      const [people, events, categories, memberships] = await Promise.all([
        profiles.eq('user_id', user.id),
        supabase.from('events').select('id,title,slug,event_date,status,owner_id').order('event_date', { ascending: false }),
        supabase.from('event_categories').select('id,name').order('name'),
        supabase.from('event_photographers').select('event_id').eq('photographer_id', user.id),
      ])
      if (active) setRecord({
        revision, userId: user.id,
        people: people.data ?? [],
        events: (events.data ?? []).filter((event) => event.owner_id === user.id || memberships.data?.some((member) => member.event_id === event.id)),
        categories: categories.data ?? [],
        error: people.error?.message ?? events.error?.message ?? categories.error?.message ?? memberships.error?.message,
      })
    }
    load()
    return () => { active = false }
  }, [user, revision])

  async function createEvent(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const { error } = await supabase.from('events').insert({
      title: values.get('title').trim(),
      slug: values.get('slug').trim(),
      event_date: values.get('date'),
      category_id: values.get('category'),
      owner_id: user.id,
    })
    setMessage(error?.message ?? 'Event draft created.')
    if (!error) {
      form.reset()
      setRevision((value) => value + 1)
    }
  }

  if (!sessionReady) return <section className="section"><p role="status">Checking your session…</p></section>
  if (!user) return <section className="section"><h1>Sign in required</h1><Link to="/login">Sign in</Link></section>
  const uploadEvent = current?.events.find((event) => event.id === eventId && event.status !== 'archived')
  if (eventId) return <section className="section stack">
    <Link to="/photographer/events">Back to events</Link>
    <h1>{uploadEvent?.title ?? 'Event uploads'}</h1>
    {current?.error ? <p role="alert">Could not load event access. {current.error}</p> :
      !current ? <p role="status">Checking event access…</p> :
      uploadEvent && current.people[0]?.approval_status === 'approved' ? <Uploads key={eventId} event={uploadEvent} /> :
      <p role="status">Upload access is unavailable for this event.</p>}
  </section>

  return <section className="section dashboard">
    <aside className="panel">
      <h2>Photographer</h2>
      <nav aria-label="Dashboard navigation">{pages.map((page) => <NavLink key={page} to={`${prefix}/${slug(page)}`}>{page}</NavLink>)}</nav>
    </aside>
    <div className="stack dashboard-main">
      <h1>{title ?? 'Page unavailable'}</h1>
      {current?.error && <p role="alert">Could not load dashboard data. {current.error}</p>}
      {!current && <p role="status">Loading dashboard…</p>}
      {message && <p role="status">{message}</p>}
      {current && !current.error && <>
        <div className="panel">Application status: <b>{current.people[0]?.approval_status ?? 'Not submitted'}</b>
          {!current.people.length && <> · <Link to="/photographers/apply">Apply</Link></>}</div>
        {section === 'dashboard' && <div className="panel"><h2>Your events</h2><p>{current.events.length} events</p></div>}
        {section === 'events' && <>
          {current.people[0]?.approval_status === 'approved' && <form className="panel stack" onSubmit={createEvent}>
            <h2>Create an event draft</h2>
            <label>Title<input name="title" required maxLength={150} /></label>
            <label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} /></label>
            <label>Date<input name="date" type="date" required /></label>
            <label>Category<select name="category" required>{current.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <button className="primary">Create draft</button>
          </form>}
          <div className="panel stack">{current.events.length ? current.events.map((event) => <div key={event.id}>
            <b>{event.title}</b><small>{dateLabel(event.event_date)} · {event.status}</small>{event.status !== 'archived' && current.people[0]?.approval_status === 'approved' && <Link to={`/photographer/events/${event.id}/media`}>Upload media</Link>}
          </div>) : <p>No events to display.</p>}</div>
        </>}
        {title && !['dashboard', 'events'].includes(section) &&
          <p className="panel">This section will be available when its backend workflow is connected.</p>}
      </>}
    </div>
  </section>
}



