import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Camera, CalendarDays, ChevronDown, Eye, EyeOff, Footprints, Images, LayoutDashboard, LockKeyhole, LogOut, MapPin, Search, ShoppingBag, X } from 'lucide-react'
import { events, media, dateLabel, money } from './catalog'
import { supabase } from './lib/supabase'
import './Storefront.css'
import PublishedGallery from './PublishedGallery'
import { CustomerPurchases, LiveCheckout, PaymentDialog } from './Purchases'
import { usePublishedEvents } from './usePublishedEvents'

const categories = [
  ['Fun Run', Footprints, 'Search race photos by BIB'],
  ['Photoman', Images, 'Event photography and video'],
  ['Photobooth', Camera, 'Portraits from your celebration'],
]

function Brand() {
  return <Link to="/" className="brand"><Camera aria-hidden="true" /> JR PRINT<span>LAB</span></Link>
}

function SearchForm({ query = '', category, date }) {
  return <form action="/events" className="search">
    <Search size={20} aria-hidden="true" />
    {category && <input type="hidden" name="category" value={category} />}{date && <input type="hidden" name="date" value={date} />}<input name="q" aria-label="Search event name or BIB number" placeholder="Event name or BIB number" defaultValue={query} />
    <button className="primary">Search</button>
  </form>
}

function EventCards({ items }) {
  if (!items.length) return <p role="status" className="panel">No events match your search.</p>
  return <div className="cards">{items.map((event) => (
    <Link className="event-card" key={event.slug} to={`/events/${event.slug}`}>
      {event.cover ? <img src={event.cover} alt="" loading="lazy" /> : <div className="event-cover-placeholder" aria-hidden="true"><Camera size={38} /></div>}
      <div className="event-info">
        <span className="tag" data-category={event.category}>{event.category}</span>
        <h3>{event.title}</h3>
        <p><CalendarDays size={16} /> {dateLabel(event.date)}{event.location && ' · ' + event.location}</p>
      </div>
    </Link>
  ))}</div>
}

function DiscoveryHero({ featured }) {
  return <section className="discovery-hero">
    <div className="discovery-copy">
      <h1>Every event.<br /><em>Your moment.</em></h1>
      <p>From race day to the dance floor, find the event photos you want to keep.</p>
      <SearchForm />
    </div>
    <Link className="discovery-photo" to={featured ? `/events/${featured.slug}` : "/events"}>
      <img src={featured?.cover ?? events[0].cover} alt="" fetchPriority="high" />
      <span><Footprints size={18} aria-hidden="true" /> {featured ? featured.title : 'Browse events'}</span>
    </Link>
  </section>
}

function Home() {
  const published = usePublishedEvents()
  const featured = published.events.slice(0, 3)
  return <>
    <DiscoveryHero featured={featured[0]} />
    <section aria-label="Event categories" className="categories">{categories.map(([label, Icon, description]) => (
      <Link to={`/events?category=${encodeURIComponent(label)}`} key={label}><Icon aria-hidden="true" /><span><b>{label}</b><small>{description}</small></span></Link>
    ))}</section>
    <section className="section catalog-section">
      <div className="section-heading"><h2>Featured events</h2><Link to="/events">View all events</Link></div>
      <LiveEventCards catalog={published} items={featured} />

    </section>
  </>
}
function LiveEventCards({ catalog, items }) {
  if (catalog.loading) return <p className="panel" role="status">Loading events…</p>
  if (catalog.error) return <p className="panel" role="alert">Events are temporarily unavailable. Please refresh and try again.</p>
  if (!catalog.events.length) return <p className="panel">No events are published yet.</p>
  return <EventCards items={items} />
}

function Events() {
  const published = usePublishedEvents()
  const catalog = published.events
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const date = params.get('date') ?? ''
  const items = catalog.filter((event) => (!category || event.category === category) && (!date || date === event.date)
    && (event.title.toLowerCase().includes(query.trim().toLowerCase())
      || (event.cover && media.some((item) => item.event === event.slug && item.bib === query.trim()))))
  function filter(name, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next)
  }
  return <section className="section">
    <h1>Browse events</h1>
    <p className="event-intro">Search by event name, date, category, or race BIB number.</p>
    <div className="browse-filters"><SearchForm key={query} query={query} category={category} date={date} />
      <label>Category <select value={category} onChange={(e) => filter('category', e.target.value)}>
        <option value="">All categories</option>{categories.map(([name]) => <option key={name}>{name}</option>)}
      </select></label>
      <label>Event date <input type="date" value={date} onChange={(e) => filter('date', e.target.value)} /></label>
      {(query || category || date) && <Link to="/events">Clear filters</Link>}
    </div>
    <LiveEventCards catalog={published} items={items} />
  </section>
}

function Preview({ item, onClose, onAdd, selected }) {
  const dialog = useRef(null)
  useEffect(() => { dialog.current.showModal() }, [])
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="preview-title">
    <div className="section-heading"><h2 id="preview-title">{item.name}</h2>
      <button aria-label="Close preview" onClick={() => dialog.current.close()}><X size={20} /></button>
    </div>
    <img className="preview" src={item.image} alt={item.name} />
    <button className="primary" disabled={selected} onClick={() => onAdd(item.id)}>
      {selected ? 'In cart' : `Add to cart · ${money.format(item.price / 100)}`}
    </button>
  </dialog>
}

function Gallery({ cart, onAdd, liveCart, onAddLive }) {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const [preview, setPreview] = useState(null)
  const published = usePublishedEvents(slug)
  const liveEvent = published.events[0]
  const event = liveEvent ?? events.find((event) => event.slug === slug)
  const bib = params.get('bib') ?? ''
  const items = media.filter((item) => item.event === slug && (!bib || item.bib === bib))
  if (!event && published.loading) return <p className="section" role="status">Loading event…</p>
  if (!event && published.error) return <p className="section" role="alert">The event is temporarily unavailable.</p>
  if (!event) return <Missing />
  return <section className="section">
<Link className="back-link" to="/events"><ArrowLeft size={16} aria-hidden="true" /> All events</Link>
    <div className="gallery-cover">{event.cover && <img src={event.cover} alt="" />}<div className="gallery-heading">
      <span className="tag" data-category={event.category}>{event.category}</span>
      <h1>{event.title}</h1><div className="gallery-meta"><span><CalendarDays size={16} />{dateLabel(event.date)}</span>{event.location && <span><MapPin size={16} />{event.location}</span>}</div><p>{event.description}</p>
    </div>
    </div>
    {!liveEvent && event.category === 'Fun Run' && <section className="bib-panel" aria-labelledby="bib-title"><div><h2 id="bib-title">Find your race photos</h2><p>Use the BIB number from your race bib.</p></div><form className="search" onSubmit={(e) => {
      e.preventDefault()
      const value = new FormData(e.currentTarget).get('bib').trim()
      setParams(value ? { bib: value } : {})
    }}>
      <Search size={20} aria-hidden="true" /><input key={bib} name="bib" inputMode="numeric" pattern="[0-9]+" aria-label="BIB number" placeholder="Enter BIB number" defaultValue={bib} />
      <button className="primary">Find photos</button>
    </form></section>}
    {liveEvent ? <PublishedGallery key={slug} slug={slug} eventTitle={event.title} cart={liveCart.map((item) => item.id)} onAdd={onAddLive} /> : <> <div className="gallery-results"><h2>Event photos</h2>{bib && <button className="back-link" type="button" onClick={() => setParams({})}>Clear BIB filter</button>}</div><p className="notice" role="status">{items.length} sample {items.length === 1 ? 'photo' : 'photos'}{bib && ` for BIB ${bib}`}</p>
    <div className="cards">{items.map((item) => <article className="event-card" key={item.id}>
      <button className="image-button" onClick={() => setPreview(item)} aria-label={`Preview ${item.name}`}><img src={item.image} alt="" /></button>
      <div className="event-info section-heading"><div><b>{item.name}</b><p>{money.format(item.price / 100)}</p></div>
        <button className="primary" disabled={cart.includes(item.id)} onClick={() => onAdd(item.id)}>{cart.includes(item.id) ? 'In cart' : 'Add to cart'}</button>
      </div>
    </article>)}</div>
    {preview && <Preview item={preview} onClose={() => setPreview(null)} onAdd={onAdd} selected={cart.includes(preview.id)} />}</>}
  </section>
}

function Cart({ cart, liveCart, remove, removeLive, session, checkout = false }) {
  const samples = media.filter((item) => cart.includes(item.id)).map((item) => ({
    ...item, eventTitle: events.find((event) => event.slug === item.event).title, sample: true,
  }))
  const items = checkout && liveCart.length ? liveCart : [...liveCart, ...samples]
  const total = money.format(items.reduce((sum, item) => sum + item.price, 0) / 100)
  return <section className="section stack">
    <h1>{checkout ? liveCart.length ? 'Checkout' : 'Checkout preview' : 'Your cart'}</h1>
    {!items.length ? <div className="panel"><p>Your cart is empty.</p><Link to="/events">Browse events</Link></div> :
      <div className="cart-layout">
        <ul className="panel">{items.map((item) => <li className="cart-row" key={item.id}>
          {item.image && <img src={item.image} alt="" />}
          <span><b>{item.name}</b><small>{item.eventTitle}{item.sample ? ' · Sample item' : ''}</small></span>
          <span>{money.format(item.price / 100)}</span>
          {!checkout && <button aria-label={`Remove ${item.name}`} onClick={() => (item.sample ? remove : removeLive)(item.id)}><X size={18} /></button>}
        </li>)}</ul>
        <div className="panel stack">
          <h2>Order summary</h2><div className="section-heading"><span>{checkout ? 'Total' : 'Cart total'}</span><b>{total}</b></div>
          {checkout ? <Link to="/cart">Back to cart</Link> : <Link className="primary" to="/checkout">{liveCart.length ? 'Go to checkout' : 'Preview checkout'}</Link>}
        </div>
      </div>}
    {checkout && liveCart.length > 0 && samples.length > 0 && <p>Sample items are excluded from checkout.</p>}
        {checkout && (liveCart.length ? <LiveCheckout session={session} items={liveCart} /> : samples.length > 0 && <section className="panel stack">
      <h2>Payment method</h2>
      <p>These are sample items. Use the preview to see the payment form.</p>
      <PaymentDialog order={{ total_centavos: samples.reduce((sum, item) => sum + item.price, 0) }} demo />
    </section>)}
  </section>
}

function PurchaseDetails(props) {
  const { orderId } = useParams()
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(orderId)) return <Missing />
  return <CustomerPurchases key={orderId} orderId={orderId} {...props} />
}
function Auth({ register = false }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const customerDestination = next === 'checkout' ? '/checkout' : next === 'purchases' ? '/purchases' : '/events'
  const [feedback, setFeedback] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const credentials = { email: values.get('email').trim(), password: values.get('password') }
    setBusy(true)
    setFeedback('')
    try {
      const { data, error } = await (register ? supabase.auth.signUp(credentials) : supabase.auth.signInWithPassword(credentials))
      if (!error && data.session) navigate(data.session.user.app_metadata?.role === 'super_admin' ? '/owner/dashboard' : customerDestination, { replace: true })
      setFeedback(error?.message || (data.session ? 'You are signed in.' : 'Check your email for a confirmation link.'))
    } catch {
      setFeedback('Could not connect to Supabase. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return <section className="customer-auth">
    <div className="auth-photo" aria-hidden="true">
      <img src={events[1].cover} alt="" />
      <div className="auth-photo-brand"><Camera size={24} /><span>JR PRINT<em>LAB</em></span></div>
    </div>
    <div className="auth-content">
      <div className="auth-lock" aria-hidden="true"><LockKeyhole size={21} /></div>
      <h1>{register ? 'Create an account' : 'Sign in'}</h1>
      <p>{register ? 'Start a JR PRINTLAB account.' : 'Enter your email and password to continue.'}</p>
      <form className="stack" onSubmit={submit}>
        <label>Email<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <div className="password-field"><label>Password<input type={showPassword ? 'text' : 'password'} name="password" minLength={register ? 8 : undefined} autoComplete={register ? 'new-password' : 'current-password'} required /></label>
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
        <button className="primary" disabled={busy || !supabase}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        {(feedback || !supabase) && <p role="status">{supabase ? feedback : 'Supabase configuration is missing.'}</p>}
      </form>
      <div className="auth-switch">{register ? 'Already have an account?' : 'New to JR PRINTLAB?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></div>
    </div>
  </section>
}
function Missing() {
  return <section className="section"><h1>Page unavailable</h1><Link to="/events">Browse events</Link></section>
}

function HowItWorks() {
  return <section className="section"><h1>How it works</h1><ol className="panel steps">
    <li>Find your event and add photos to your cart.</li>
    <li>When checkout is available, pay the exact amount using the JR PRINTLAB merchant QR and submit your receipt.</li>
    <li>Download your purchased files after JR PRINTLAB verifies the payment.</li>
  </ol></section>
}

function readCart() {
  try {
    const ids = JSON.parse(localStorage.getItem('jr-printlab-cart'))
    return media.filter((item) => Array.isArray(ids) && ids.includes(item.id)).map((item) => item.id)
  } catch {
    return []
  }
}

function readLiveCart() {
  try {
    const saved = JSON.parse(localStorage.getItem('jr-printlab-live-cart'))
    if (!Array.isArray(saved)) return []
    return saved.filter((item) => /^[0-9a-f-]{36}$/i.test(item?.id) && typeof item.name === 'string'
      && typeof item.eventTitle === 'string' && Number.isSafeInteger(item.price) && item.price > 0).slice(0, 30)
  } catch {
    return []
  }
}

function LegacyOwnerRoute() {
  const { section, eventId } = useParams()
  const sections = { events: 'events', media: 'media', orders: 'orders', payments: 'payments', settings: 'settings', 'audit-logs': 'audit-logs', 'payment-settings': 'settings' }
  return <Navigate replace to={eventId ? `/owner/events/${eventId}/media` : `/owner/${Object.hasOwn(sections, section) ? sections[section] : 'dashboard'}`} />
}

const Admin = lazy(() => import('./Admin'))

function AccountMenu({ user, onSignOut }) {
  const disclosure = useRef(null)
  const trigger = useRef(null)
  const [busy, setBusy] = useState(false)
  const initials = (user.email?.split('@')[0].match(/[a-z0-9]/gi)?.slice(0, 2).join('') || 'JR').toUpperCase()

  useEffect(() => {
    const closeOutside = (event) => {
      if (!disclosure.current?.contains(event.target)) disclosure.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])

  async function signOut() {
    setBusy(true)
    try {
      await onSignOut()
    } finally {
      setBusy(false)
    }
  }

  return <details className="account-disclosure" ref={disclosure} onKeyDown={(event) => {
    if (event.key !== 'Escape' || !disclosure.current.open) return
    disclosure.current.open = false
    trigger.current.focus()
  }}>
    <summary ref={trigger} aria-label="Account menu">
      <span className="store-avatar" aria-hidden="true">{initials}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </summary>
    <div className="account-dropdown">
      <div className="account-identity"><strong>Your account</strong><span>{user.email}</span></div>
      <Link to="/purchases" onClick={() => { disclosure.current.open = false }}><ShoppingBag size={17} aria-hidden="true" />My Purchases</Link>
      {user.app_metadata?.role === 'super_admin' && <Link to="/owner/dashboard" onClick={() => { disclosure.current.open = false }}><LayoutDashboard size={17} aria-hidden="true" />Owner Dashboard</Link>}
      <button type="button" disabled={busy} onClick={signOut}><LogOut size={17} aria-hidden="true" />{busy ? 'Logging out…' : 'Log out'}</button>
    </div>
  </details>
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}

function AppRoutes() {
  const navigate = useNavigate()
  const [cart, setCart] = useState(readCart)
  const [liveCart, setLiveCart] = useState(readLiveCart)
  useEffect(() => { localStorage.setItem('jr-printlab-live-cart', JSON.stringify(liveCart)) }, [liveCart])
  const [session, setSession] = useState(null)
  const [sessionReady, setSessionReady] = useState(!supabase)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  useEffect(() => { localStorage.setItem('jr-printlab-cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      setSession(value)
      setSessionReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  function add(id) { setCart((items) => items.includes(id) ? items : [...items, id]) }
  function remove(id) { setCart((items) => items.filter((item) => item !== id)) }
  function addLive(item) {
    setLiveCart((items) => items.length >= 30 || items.some(({ id }) => id === item.id) ? items : [...items, item])
  }
  function removePurchased(ids) {
    setLiveCart((items) => items.filter((item) => !ids.includes(item.id)))
  }
  const cartCount = cart.length + liveCart.length
  const cartProps = { cart, liveCart, remove, removeLive: (id) => removePurchased([id]), session }
  async function signOut() {
    setSigningOut(true)
    setSignOutError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      navigate('/login', { replace: true })
    } catch {
      setSignOutError('Could not log out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  const ownerProps = { session, sessionReady, signOut, signingOut, signOutError }
  const purchaseProps = { session, sessionReady, onSubmitted: removePurchased }
  return <Routes>
      <Route path="/owner" element={<Navigate replace to="/owner/dashboard" />} />
      <Route path="/owner/:section" element={<Suspense fallback={<p role="status">Loading owner panel…</p>}><Admin {...ownerProps} /></Suspense>} />
      <Route path="/owner/events/:eventId/media" element={<Suspense fallback={<p role="status">Loading owner panel…</p>}><Admin {...ownerProps} /></Suspense>} />
      <Route path="/admin/:section?" element={<LegacyOwnerRoute />} />
      <Route path="/photographer/:section?" element={<LegacyOwnerRoute />} />
      <Route path="/photographer/events/:eventId/media" element={<LegacyOwnerRoute />} />
      <Route path="/photographers/apply" element={<Navigate replace to="/owner/dashboard" />} />
      <Route path="*" element={<>
    <a className="skip" href="#main">Skip to content</a>
    <header className="store-header"><div className="header-inner">
      <Brand />
      <nav aria-label="Main navigation">
        <NavLink to="/events">Events</NavLink><NavLink to="/how-it-works">How it works</NavLink>
        <NavLink className="store-cart" to="/cart" aria-label={`Cart, ${cartCount} items`}><ShoppingBag size={19} aria-hidden="true" /> Cart <span>{cartCount}</span></NavLink>
        {session ? <AccountMenu user={session.user} onSignOut={signOut} /> : <NavLink to="/login">Sign in</NavLink>}
      </nav>
    </div></header>
    <main id="main">
      {signOutError && <p role="alert">{signOutError}</p>}
      <Suspense fallback={<p role="status" className="section">Loading page…</p>}><Routes>
        <Route path="/" element={<Home />} /><Route path="/events" element={<Events />} />
        <Route path="/events/:slug" element={<Gallery cart={cart} onAdd={add} liveCart={liveCart} onAddLive={addLive} />} />
        <Route path="/cart" element={<Cart {...cartProps} />} />
        <Route path="/checkout" element={<Cart {...cartProps} checkout />} />
        <Route path="/purchases" element={<CustomerPurchases {...purchaseProps} />} />
        <Route path="/purchases/:orderId" element={<PurchaseDetails {...purchaseProps} />} />
        <Route path="/login" element={<Auth key="login" />} /><Route path="/register" element={<Auth key="register" register />} />
        <Route path="/how-it-works" element={<HowItWorks />} /><Route path="*" element={<Missing />} />
      </Routes></Suspense>
    </main>
    <footer><Brand />{session?.user.app_metadata?.role === 'super_admin' && <Link to="/owner/dashboard">Owner Dashboard</Link>}</footer>
      </>} />
  </Routes>
}
















