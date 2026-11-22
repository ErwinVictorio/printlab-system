import { useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import { supabase } from './lib/supabase'
import './PaymentQr.css'

const bucket = 'merchant-qr'
const paymentTypes = ['QR Ph', 'GCash', 'Maya', 'Bank QR']
const formats = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const maxSize = 2 * 1024 * 1024

async function loadQr() {
  const { data, error } = await supabase.from('merchant_qr').select('payment_type,recipient,image_path').eq('id', true).maybeSingle()
  if (error) throw error
  if (!data) return null
  const image = await supabase.storage.from(bucket).createSignedUrl(data.image_path, 600)
  if (image.error) throw image.error
  return { ...data, url: image.data.signedUrl }
}

function useMerchantQr() {
  const [result, setResult] = useState(null)
  useEffect(() => {
    let active = true
    if (!supabase) return
    loadQr().then(
      (qr) => { if (active) setResult({ qr }) },
      () => { if (active) setResult({ error: true }) },
    )
    return () => { active = false }
  }, [])
  return supabase ? result : { error: true }
}

function QrImage({ qr }) {
  return <figure className="merchant-qr-image">
    <img src={qr.url} alt={`${qr.payment_type} payment QR for ${qr.recipient}`} />
    <figcaption><strong>{qr.payment_type}</strong><span>{qr.recipient}</span></figcaption>
  </figure>
}

export default function PaymentQrSettings() {
  const result = useMerchantQr()
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const qr = saved ?? result?.qr

  async function save(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const file = fields.get('qr')
    const recipient = fields.get('recipient').trim()
    setFailed(true)
    if (!recipient) return setMessage('Enter the recipient name.')
    if (file.size && (!Object.hasOwn(formats, file.type) || file.size > maxSize)) {
      return setMessage('Choose a PNG or JPG image up to 2 MB.')
    }
    if (!file.size && !qr) return setMessage('Select a QR image.')
    setBusy(true)
    setMessage('')
    try {
      let path = qr?.image_path
      if (file.size) {
        path = `qr/${crypto.randomUUID()}.${formats[file.type]}`
        const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type })
        if (error) throw error
      }
      const { error } = await supabase.from('merchant_qr').upsert({
        id: true, payment_type: fields.get('paymentType'), recipient, image_path: path,
      })
      if (error) throw error
      setSaved(await loadQr())
      form.elements.qr.value = ''
      setFailed(false)
      setMessage('Payment QR saved.')
    } catch {
      setMessage('Could not save or load the payment QR. Refresh and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!result) return <p role="status">Loading payment settings…</p>
  if (result.error) return <p role="alert">Payment settings are temporarily unavailable. Refresh the page to retry.</p>
  return <section className="admin-panel stack merchant-qr-settings">
    <h2><QrCode size={22} aria-hidden="true" /> Payment QR</h2>
    <div className="merchant-qr-layout">
      <form className="stack" onSubmit={save}>
        <label>Payment type<select name="paymentType" defaultValue={qr?.payment_type ?? 'QR Ph'}>
          {paymentTypes.map((type) => <option key={type}>{type}</option>)}
        </select></label>
        <label>Recipient name<input name="recipient" required maxLength={100} defaultValue={qr?.recipient ?? ''} placeholder="Name shown in the payment app" /></label>
        <label>{qr ? 'Replace QR image' : 'Upload QR image'}<input type="file" name="qr" accept="image/png,image/jpeg" required={!qr} /></label>
        <small>PNG or JPG, up to 2 MB. Use a clear merchant QR from your payment app.</small>
        <button className="admin-action" disabled={busy}>{busy ? 'Saving…' : 'Save payment QR'}</button>
        {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      </form>
      {qr && <QrImage qr={qr} />}
    </div>
  </section>
}

export function OrderPaymentQr({ order }) {
  const [result, setResult] = useState(null)
  useEffect(() => {
    let active = true
    async function load() {
      const image = await supabase.storage.from(bucket).createSignedUrl(order.qr_path, 600)
      if (active) setResult({ path: order.qr_path, url: image.data?.signedUrl, error: image.error })
    }
    void load()
    return () => { active = false }
  }, [order.qr_path])

  return <section className="payment-scan stack" aria-label="Merchant QR">
    <p>Scan with your payment app and send the exact amount.</p>
    {result?.path !== order.qr_path ? <p role="status">Loading payment QR…</p>
      : result.error ? <p role="alert">Could not load the payment QR. Refresh before paying.</p>
        : <QrImage qr={{ ...order, url: result.url }} />}
  </section>
}


