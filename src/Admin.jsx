import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { BarChart3, CalendarDays, Camera, ClipboardList, House, Images, LogOut, QrCode, Search, Settings, ShoppingCart } from 'lucide-react'
import { dateLabel, money } from './catalog'
import { supabase } from './lib/supabase'
import './Admin.css'
import OwnerEventForm from './OwnerEventForm'
import Uploads from './Uploads'
import PaymentQrSettings from './PaymentQr'
import { OwnerPurchases } from './Purchases'

const eventPageSize = 10

const pages = {
  dashboard: ['Dashboard', House],
  orders: ['Orders', ClipboardList],
  payments: ['Payment Verification', QrCode],
  events: ['Events', CalendarDays],
  media: ['Media Library', Images],
  'audit-logs': ['Audit Logs', BarChart3],
  settings: ['Settings', Settings],
}

function Panel({ title, icon: Icon, to, children, className = '' }) {
  return <section className={`admin-panel ${className}`}>
    <div className="admin-panel-title"><h2><Icon size={20} />{title}</h2>{to && <Link to={to}>View all</Link>}</div>
    {children}
  </section>
}

function Table({ headings, rows, empty }) {
  return <div className="admin-table-wrap"><table className="admin-table">
    <thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map(([key, ...cells]) => <tr key={key}>
      {cells.map((cell, index) => <td key={headings[index]}>{cell}</td>)}
    </tr>) : <tr><td colSpan={headings.length} className="admin-empty">{empty}</td></tr>}</tbody>
  </table></div>
}

function Badge({ value }) {
  return <span className="admin-badge" data-status={value}>{value}</span>
}

function MediaUpload({ events, onUploaded }) {
  const [eventId, setEventId] = useState('')
  const [busy, setBusy] = useState(false)
  const eligible = (events?.data ?? []).filter((event) => event.status !== 'archived')
  const event = eligible.find((item) => item.id === eventId)

  return <>
    <Panel title="Upload photos or videos" icon={Images}>
      {!events ? <p role="status">Loading events…</p> : events.error ? <p role="alert">Could not load events. Try Refresh.</p> :
        eligible.length ? <label>Event
          <select value={event?.id ?? ''} disabled={busy} onChange={(change) => setEventId(change.target.value)}>
            <option value="" disabled>Select an event</option>
            {eligible.map((item) => <option key={item.id} value={item.id}>{item.title} · {dateLabel(item.event_date)}</option>)}
          </select>
        </label> : <p>Choose <Link to="/owner/events">Events</Link> to create a draft first.</p>}
    </Panel>
    {event && <Uploads key={event.id} event={event} onUploaded={onUploaded} onBusyChange={setBusy} />}
  </>
}

export default function Admin({ session, sessionReady, signOut, signingOut, signOutError }) {
  const { section: routeSection = 'dashboard', eventId } = useParams()
  const section = eventId ? 'events' : routeSection
  const [snapshot, setSnapshot] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')

  const [revision, setRevision] = useState(0)
  const user = session?.user
  const adminId = user?.app_metadata?.role === 'super_admin' ? user.id : null
  const data = snapshot?.adminId === adminId ? snapshot : null

  useEffect(() => {
    if (!adminId) return
    const controller = new AbortController()
    async function loadEvents() {
      const records = []
      for (let offset = 0; ; offset += 100) {
        const result = await supabase.from('events')
          .select('id,title,event_date,status,deletion_requested_at,event_categories(name)', { count: 'exact' })
          .order('event_date', { ascending: false }).order('id').range(offset, offset + 99).abortSignal(controller.signal)
        if (result.error) return result
        records.push(...result.data)
        if (section !== 'events' || eventId || records.length >= result.count || result.data.length < 100) {
          return { ...result, data: records }
        }
      }
    }
    async function load() {
      const [events, audits, uploadCount, uploads, sales] = await Promise.all([
        loadEvents(),
        supabase.from('audit_logs').select('id,actor_id,action,entity_id,metadata,created_at').order('created_at', { ascending: false }).limit(100).abortSignal(controller.signal),
        supabase.from('upload_intents').select('id', { count: 'exact', head: true }).is('preview_of', null).not('confirmed_at', 'is', null).abortSignal(controller.signal),
        section === 'media' ? supabase.from('upload_intents').select('id,file_name,mime_type,size_bytes,price_centavos,confirmed_at,events(title)').is('preview_of', null).not('confirmed_at', 'is', null).order('confirmed_at', { ascending: false }).limit(100).abortSignal(controller.signal) : Promise.resolve(null),
        section === 'dashboard' ? supabase.rpc('owner_sales_summary').maybeSingle().abortSignal(controller.signal) : Promise.resolve(null),
      ])
      if (controller.signal.aborted) return
      setSnapshot({ adminId, events, audits, uploads, uploadCount, sales })
    }
    void load()
    return () => controller.abort()
  }, [adminId, revision, section, eventId])

  async function deleteEvent(event) {
    if (deletingId || (!event.deletion_requested_at && !window.confirm(
      `Permanently delete "${event.title}" and its uploaded originals and previews? This cannot be undone.`,
    ))) return
    setDeletingId(event.id)
    setMessage('')
    try {
      const { data: result, error } = await supabase.functions.invoke('delete-event', { body: { eventId: event.id } })
      const failure = error ? await error.context?.json?.().catch(() => null) : null
      setMessage(error ? failure?.error || 'Deletion could not finish. Retry from the Events table.'
        : result?.deleted ? `"${event.title}" was deleted.`
        : result?.readyAt ? `Event hidden. Retry deletion after ${new Date(result.readyAt).toLocaleTimeString()}.`
        : 'Some files were removed. Retry to finish deletion.')
      setRevision((value) => value + 1)
    } finally {
      setDeletingId(null)
    }
  }

  if (!sessionReady) return <main id="main"><p className="section" role="status">Checking your session…</p></main>
  if (!user) return <Navigate to="/login" replace />
  if (!adminId) return <main id="main" className="section"><h1>Owner access required</h1><Link to="/">Return to storefront</Link></main>

  const dashboard = section === 'dashboard'
  const matches = (...values) => values.some((value) => String(value ?? '').toLowerCase().includes(search.trim().toLowerCase()))
  const events = (data?.events.data ?? []).filter((event) => matches(event.title, event.status, event.event_categories?.name))
  const audits = (data?.audits.data ?? []).filter((entry) => matches(entry.action, entry.actor_id, entry.entity_id))
  const statusText = (resource, empty) => !data ? 'Loading…' : resource?.error ? 'Data unavailable. Check the Supabase migrations or retry.' : empty
  const totalPages = Math.max(1, Math.ceil(events.length / eventPageSize))
  const activePage = Math.min(page, totalPages)
  const start = (activePage - 1) * eventPageSize
  const visibleEvents = dashboard ? events.slice(0, 4) : events.slice(start, start + eventPageSize)
  const eventsPanel = <Panel title={dashboard ? 'Recent Events' : 'Events'} icon={CalendarDays} to={dashboard ? '/owner/events' : undefined}>
    <Table headings={['Event name', 'Category', 'Date', 'Status', 'Action']} empty={statusText(data?.events, 'No matching events.')}
      rows={visibleEvents.map((event) => [
        event.id, <Link to={`/owner/events/${event.id}/media`}>{event.title}</Link>, event.event_categories?.name ?? '—',
        dateLabel(event.event_date), <Badge value={event.deletion_requested_at ? 'Deletion pending' : event.status} />,
        <div className="event-row-actions">
          {!event.deletion_requested_at && <Link to={`/owner/events/${event.id}/media`}>{event.status === 'archived' ? 'View event' : 'Manage uploads'}</Link>}
          {!dashboard && <button type="button" className="event-delete" disabled={Boolean(deletingId)}
            aria-label={`${event.deletion_requested_at ? 'Retry deletion of' : 'Permanently delete'} ${event.title}`}
            onClick={() => deleteEvent(event)}>
            {deletingId === event.id ? 'Deleting…' : event.deletion_requested_at ? 'Retry deletion' : 'Delete'}
          </button>}
        </div>,
      ])} />
    {!dashboard && events.length > 0 && <nav className="event-pagination" aria-label="Events pagination">
      <span aria-live="polite">Showing {start + 1}–{Math.min(start + eventPageSize, events.length)} of {events.length} · Page {activePage} of {totalPages}</span>
      <div>
        <button type="button" className="admin-outline" disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>Previous</button>
        <button type="button" className="admin-outline" disabled={activePage === totalPages} onClick={() => setPage(activePage + 1)}>Next</button>
      </div>
    </nav>}
  </Panel>
  const catalogError = data && [data.events, data.audits, data.uploadCount].some(({ error }) => error)
  const initials = user.email?.slice(0, 2).toUpperCase() || 'SA'

  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link className="admin-brand" to="/owner/dashboard"><Camera size={32} /><span><b>JR PRINT<em>LAB</em></b><small>Owner Panel</small></span></Link>
      <nav aria-label="Admin navigation">{Object.entries(pages).map(([key, [title, Icon]]) => (
        <NavLink key={key} to={`/owner/${key}`} end><Icon size={20} aria-hidden="true" />{title}</NavLink>
      ))}</nav>
      <div className="admin-sidebar-art" aria-hidden="true"><Camera size={105} /></div>
    </aside>
    <div className="admin-shell">
      <div className="admin-topbar">
        <label className="admin-search"><Search size={18} /><input aria-label="Filter dashboard records" placeholder="Search events, media, audit logs…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label>
        <div className="admin-account"><span className="admin-avatar">{initials}</span><span><b>{user.email}</b><small>Owner</small></span>
          <button type="button" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={signOut}><LogOut size={19} /></button></div>
      </div>
      <main className="admin-main" id="main">
        <div className="admin-heading"><div><h1>{pages[section]?.[0] ?? 'Page unavailable'}</h1>
          {dashboard && <p>Overview of events, orders, payments, and sales for JR PRINTLAB.</p>}</div>
          <button className="admin-outline" onClick={() => setRevision((value) => value + 1)}>Refresh</button>
        </div>
        {catalogError && <p className="admin-alert" role="alert">Some admin data is unavailable. Check that the catalog and admin migrations are applied in Supabase, then refresh.</p>}
        {signOutError && <p className="admin-alert" role="alert">{signOutError}</p>}
        {message && <p className="admin-alert" role="status">{message}</p>}
        {dashboard && <>
          <section className="owner-quick-actions" aria-label="Quick actions">
            <div><h2>Manage your storefront</h2><p>Create an event, add priced media, and publish it to customers.</p></div>
            <div className="owner-quick-links">
              <Link className="admin-action" to="/owner/events"><CalendarDays size={17} />Create event</Link>
              <Link className="admin-outline" to="/owner/media"><Images size={17} />Upload media</Link>
              <Link className="admin-outline" to="/events">View storefront</Link>
            </div>
          </section>
          <div className="admin-kpis">
            {[
              ['Total Orders', data?.sales?.data?.total_orders ?? '—', ShoppingCart, 'pink', 'Submitted orders'],
              ['Total Sales', data?.sales?.data ? money.format(data.sales.data.sales_centavos / 100) : '—', BarChart3, 'cyan', 'Approved payments'],
              ['Verified Uploads', data?.uploadCount.count ?? '—', Images, 'purple', 'Private originals'],
              ['Total Events', data?.events.count ?? '—', CalendarDays, 'gold', 'All event statuses'],
            ].map(([title, value, Icon, color, caption]) => <div className="admin-kpi" key={title} data-color={color}>
              <span className="admin-kpi-icon"><Icon size={24} /></span><div><p>{title}</p><strong>{value}</strong><small>{caption}</small></div>
            </div>)}
          </div>
          <div className="admin-overview">
            <div className="admin-column">{eventsPanel}</div>
            <div className="admin-column">
              <Panel title="Orders and payments" icon={ClipboardList}>
                {data?.sales?.error ? <p className="admin-empty" role="alert">Could not load order totals. Try Refresh.</p> :
                  data?.sales?.data && <p className="admin-empty">{data.sales.data.approved_orders} approved · {data.sales.data.pending_orders} pending verification</p>}
                <Link className="admin-outline owner-status-link" to="/owner/orders">View orders</Link>
                <Link className="admin-outline owner-status-link" to="/owner/payments">Payment verification</Link>
              </Panel>
            </div>
          </div>
        </>}
        {['payments', 'orders'].includes(section) && <OwnerPurchases pendingOnly={section === 'payments'} revision={revision} />}
        {section === 'events' && <div className="stack">
          <OwnerEventForm key={eventId ?? 'new'} userId={adminId} eventId={eventId} onSaved={() => setRevision((value) => value + 1)} />
          {!eventId && eventsPanel}
        </div>}
        {section === 'media' && <div className="stack"><MediaUpload events={data?.events} onUploaded={() => setRevision((value) => value + 1)} /><Panel title="Verified private originals" icon={Images}>
          <Table headings={['File', 'Event', 'Format', 'Price', 'Size', 'Verified']} empty={data?.uploads ? statusText(data.uploads, 'No matching verified uploads.') : 'Loading uploads…'}
            rows={(data?.uploads?.data ?? []).filter((item) => matches(item.file_name, item.events?.title, item.mime_type)).map((item) => [
              item.id, item.file_name, item.events?.title ?? '—', item.mime_type, item.price_centavos == null ? '—' : money.format(item.price_centavos / 100),
              `${new Intl.NumberFormat().format(item.size_bytes)} bytes`, new Date(item.confirmed_at).toLocaleString(),
      ])} />
        </Panel></div>}
        {section === 'audit-logs' && <Panel title="Recent activity" icon={BarChart3}>
          <Table headings={['Action', 'Change', 'Date']} empty={statusText(data?.audits, 'No matching audit entries.')}
            rows={audits.map((entry) => [entry.id, entry.action, `${entry.metadata.previous} → ${entry.metadata.current}`, new Date(entry.created_at).toLocaleString()])} />
        </Panel>}
        {section === 'settings' && <PaymentQrSettings />}
      </main>
    </div>
  </div>
}














