import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Clock3, QrCode, X } from 'lucide-react'
import { money } from './catalog'
import { supabase } from './lib/supabase'
import { purchaseAction, purchaseColumns, purchaseStatus } from './lib/purchases'
import { OrderPaymentQr } from './PaymentQr'

export function LiveCheckout({ items, session }) {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const key = useRef(null)
  const total = items.reduce((amount, item) => amount + item.price, 0)

  async function open() {
    if (busy) return
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setMessage('')
    try {
      const { id } = await purchaseAction({ action: 'open', checkoutKey: key.current, ids: items.map((item) => item.id), total })
      navigate(`/purchases/${id}`, { state: { showPayment: true } })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel stack">
    <h2>Payment method</h2>
    {session
      ? <button className="primary" disabled={busy} onClick={open}>{busy ? 'Preparing checkout…' : 'Continue to QR payment'}</button>
      : <Link className="primary" to="/login?next=checkout">Sign in to continue</Link>}
    {message && <p role="alert">{message}</p>}
  </section>
}

export function PaymentDialog({ order, busy, error, onSubmit, onOpen, demo = false, openInitially = false }) {
  const dialog = useRef(null)
  const opened = useRef(false)
  const [showQr, setShowQr] = useState(false)
  useEffect(() => {
    if (openInitially && !opened.current) {
      opened.current = true
      dialog.current.showModal()
    }
  }, [openInitially])
  return <>
    <button type="button" className="primary payment-open" onClick={() => {
      onOpen?.()
      dialog.current.showModal()
    }}><QrCode size={18} aria-hidden="true" /> {demo ? 'Preview QR payment' : 'Pay via ' + order.payment_type}</button>
    <dialog className="payment-dialog" ref={dialog} aria-labelledby="payment-dialog-title"
      onCancel={(event) => { if (busy) event.preventDefault() }} onClose={() => setShowQr(false)}>
      <div className="payment-dialog-header">
        <div><h2 id="payment-dialog-title">{showQr ? 'Pay by QR' : 'Select payment method'}</h2><p>{demo ? 'Sample checkout' : 'Order ' + order.id.slice(0, 8).toUpperCase()}</p></div>
        <button type="button" aria-label="Close payment dialog" disabled={busy} onClick={() => dialog.current.close()}><X size={20} /></button>
      </div>
      <div className="payment-dialog-body">
        <div className="payment-total"><span>Total due</span><strong>{money.format(order.total_centavos / 100)}</strong></div>
        {!showQr ? <button type="button" className="payment-method-option" onClick={() => setShowQr(true)}>
          <span className="payment-method-icon"><QrCode size={20} aria-hidden="true" /></span>
          <span><strong>{demo ? 'Sample QR payment' : order.payment_type}</strong><small>{demo ? 'Preview the checkout layout' : 'Scan QR and submit a reference'}</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button> : <>
        <button type="button" className="payment-method-back" disabled={busy} onClick={() => setShowQr(false)}>
          <ArrowLeft size={16} aria-hidden="true" /> Payment methods
        </button>
        {demo ? <div className="payment-scan stack">
          <div className="payment-demo-qr"><QrCode size={68} aria-hidden="true" /><strong>Sample QR area</strong></div>
          <p>Choose an item from a published event to pay and submit a reference.</p>
        </div> : <OrderPaymentQr order={order} />}
        <form className="payment-reference" onSubmit={demo ? (event) => event.preventDefault() : onSubmit}>
          <label>Payment reference number<input name="reference" disabled={demo} required minLength={4} maxLength={80}
            autoComplete="off" spellCheck={false} placeholder="Reference from your payment app" /></label>
          <p className="payment-manual"><Clock3 size={17} aria-hidden="true" /><span>The owner checks your payment. Downloads appear in My Purchases after approval.</span></p>
          {error && <p role="alert" className="payment-error">{error}</p>}
          <button className="primary" disabled={busy || demo}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
        </form>
        </>}
      </div>
    </dialog>
  </>
}

export function CustomerPurchases({ session, sessionReady, orderId, onSubmitted }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(null)
  const [revision, refresh] = useState(0)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')
  const [original, setOriginal] = useState(null)
  const buyerId = session?.user.id
  const current = snapshot?.buyerId === buyerId && snapshot?.orderId === orderId && snapshot?.revision === revision ? snapshot : null

  useEffect(() => {
    if (!buyerId) return
    const controller = new AbortController()
    async function load() {
      const query = supabase.from('purchase_orders').select(purchaseColumns).eq('buyer_id', buyerId)
        .order('created_at', { ascending: false }).limit(orderId ? 1 : 100)
      if (orderId) query.eq('id', orderId)
      const result = await query.abortSignal(controller.signal)
      if (!controller.signal.aborted) setSnapshot({ buyerId, orderId, revision, ...result })
    }
    void load()
    return () => controller.abort()
  }, [buyerId, orderId, revision])

  async function submit(event, order) {
    event.preventDefault()
    setBusy(order.id)
    setMessage('')
    try {
      await purchaseAction({ action: 'submit', orderId: order.id, reference: new FormData(event.currentTarget).get('reference') })
      onSubmitted(order.purchase_items.map((item) => item.original_id))
      navigate('/purchases', { replace: true })
      refresh((value) => value + 1)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(null)
    }
  }

  async function originalAction(order, item, action) {
    setBusy(item.id)
    setMessage('')
    try {
      const { url, mimeType } = await purchaseAction({ action, orderId: order.id, itemId: item.id })
      if (action === 'download') window.location.assign(url)
      else setOriginal({ itemId: item.id, url, mimeType })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(null)
    }
  }

  if (!sessionReady) return <p className="section" role="status">Checking your account…</p>
  if (!session) return <section className="section stack"><h1>My Purchases</h1><Link to="/login?next=purchases">Sign in to view your purchases</Link></section>
  return <section className="section stack">
    <div className="section-heading"><h1>{orderId ? 'Purchase details' : 'My Purchases'}</h1>
      {orderId ? <Link to="/purchases">My Purchases</Link> : <button type="button" onClick={() => refresh((value) => value + 1)}>Refresh</button>}
    </div>
    {message && current?.data?.[0]?.status !== 'awaiting_payment' && <p role="alert">{message}</p>}
    {!current ? <p role="status">Loading purchases…</p> : current.error ? <p role="alert">Could not load purchases.</p> :
      !current.data.length ? <p className="panel">{orderId ? 'Purchase unavailable.' : 'You have no purchases yet.'}</p> :
      current.data.map((order) => <article className="panel stack" key={order.id}>
        <div className="section-heading"><h2>{purchaseStatus[order.status]}</h2><strong>{money.format(order.total_centavos / 100)}</strong></div>
        <p>Order {order.id.slice(0, 8).toUpperCase()} · {new Date(order.created_at).toLocaleDateString()}</p>
        <ul className="stack">{order.purchase_items.map((item) => <li className="stack" key={item.id}><div className="section-heading">
          <span><b>{item.file_name}</b><small>{item.event_title} · {money.format(item.price_centavos / 100)}</small></span>
          {order.status === 'approved' && <div className="event-row-actions">
            <button type="button" disabled={Boolean(busy)} onClick={() => original?.itemId === item.id ? setOriginal(null) : originalAction(order, item, 'view')}>
              {original?.itemId === item.id ? 'Hide original' : 'View original'}
            </button>
            <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => originalAction(order, item, 'download')}>
              {busy === item.id ? 'Preparing…' : 'Download original'}
            </button>
          </div>}
          </div>
          {order.status === 'approved' && original?.itemId === item.id && (original.mimeType === 'video/mp4'
            ? <video className="public-preview-video" controls src={original.url} aria-label={item.file_name} />
            : <img className="preview" src={original.url} alt={item.file_name} />)}
        </li>)}</ul>
        {order.reference_number && <p>Payment reference {order.reference_number}</p>}
        {order.status === 'pending_verification' && <p>JR PRINTLAB will check the payment. Your downloads will appear here after approval.</p>}
        {order.status === 'rejected' && <p>JR PRINTLAB could not verify this payment.</p>}
        {order.status === 'awaiting_payment' && (orderId
          ? <PaymentDialog order={order} openInitially={location.state?.showPayment === true} busy={Boolean(busy)} error={message} onOpen={() => setMessage('')}
            onSubmit={(event) => submit(event, order)} />
          : <Link to={`/purchases/${order.id}`}>Continue payment</Link>)}
      </article>)}
  </section>
}

export function OwnerPurchases({ pendingOnly, revision }) {
  const [snapshot, setSnapshot] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')
  const current = snapshot?.pendingOnly === pendingOnly && snapshot?.revision === revision && snapshot?.refresh === refresh ? snapshot : null

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      const query = supabase.from('purchase_orders').select(purchaseColumns).neq('status', 'awaiting_payment')
        .order('submitted_at', { ascending: false }).limit(100)
      if (pendingOnly) query.eq('status', 'pending_verification')
      const result = await query.abortSignal(controller.signal)
      if (!controller.signal.aborted) setSnapshot({ pendingOnly, revision, refresh, ...result })
    }
    void load()
    return () => controller.abort()
  }, [pendingOnly, revision, refresh])

  async function review(order, action) {
    const confirmation = action === 'approve'
      ? `Confirm that you received ${money.format(order.total_centavos / 100)} for reference ${order.reference_number}. This unlocks the originals for the buyer.`
      : `Reject payment reference ${order.reference_number}?`
    if (!window.confirm(confirmation)) return
    setBusy(order.id)
    setMessage('')
    try {
      await purchaseAction({ action, orderId: order.id })
      setMessage(action === 'approve' ? 'Approved. The buyer can now download the originals.' : 'Payment rejected.')
      setRefresh((value) => value + 1)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(null)
    }
  }

  return <section className="admin-panel stack">
    <h2>{pendingOnly ? 'Pending QR payments' : 'Submitted orders'}</h2>
    {pendingOnly && <p>Match the reference, amount, and recipient against your payment app before approving.</p>}
    {message && <p role="status">{message}</p>}
    {!current ? <p role="status">Loading orders…</p> : current.error ? <p role="alert">Could not load orders.</p> :
      !current.data.length ? <p>No matching orders.</p> : current.data.map((order) => (
        <article className="panel stack" key={order.id}>
          <div className="section-heading"><h3>Order {order.id.slice(0, 8).toUpperCase()}</h3><b>{money.format(order.total_centavos / 100)}</b></div>
          <p>{purchaseStatus[order.status]} · {order.payment_type} · {order.recipient}</p>
          <p>Reference <strong>{order.reference_number}</strong></p>
          <small>{new Date(order.submitted_at).toLocaleString()}</small>
          <ul>{order.purchase_items.map((item) => <li key={item.id}>{item.file_name} · {item.event_title}</li>)}</ul>
          {order.status === 'pending_verification' && <div className="event-row-actions">
            <button className="admin-action" disabled={Boolean(busy)} onClick={() => review(order, 'approve')}>Approve payment</button>
            <button className="admin-outline" disabled={Boolean(busy)} onClick={() => review(order, 'reject')}>Reject</button>
          </div>}
        </article>
      ))}
  </section>
}







