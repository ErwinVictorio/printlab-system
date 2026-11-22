import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { CalendarDays, Film, Image, LockKeyhole, Upload } from 'lucide-react'
import { money } from './catalog'
import './Uploads.css'

const limits = {
  'image/jpeg': 25 * 1024 * 1024,
  'image/png': 25 * 1024 * 1024,
  'image/webp': 25 * 1024 * 1024,
  'video/mp4': 100 * 1024 * 1024,
}

const basename = (name) => name.replace(/\.[^.]+$/, '').toLowerCase()
const family = (mime) => mime.split('/')[0]

function validFile(file) {
  return Object.hasOwn(limits, file.type) && file.size > 0 && file.size <= limits[file.type] && [...file.name].length <= 255
}

function queuedFile(file, previewOf) {
  return { id: crypto.randomUUID(), file, state: 'Queued', progress: 0, price: '', previewOf }
}

function priceInCentavos(value) {
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) return 0
  const [pesos, cents = ''] = value.split('.')
  return Number(pesos) * 100 + Number(cents.padEnd(2, '0'))
}

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  const response = error.context
  const payload = await response?.json?.().catch(() => null)
  throw Object.assign(new Error(payload?.error || 'Could not reach the upload service.'), { status: response?.status })
}

function put(ticket, file, progress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', ticket.url)
    request.timeout = 10 * 60 * 1000
    for (const [name, value] of Object.entries(ticket.headers)) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100))
    }
    request.onload = () => {
      if ((request.status >= 200 && request.status < 300) || request.status === 412) resolve()
      else reject(Object.assign(new Error(`R2 rejected the upload (HTTP ${request.status}).`), { status: request.status }))
    }
    request.onerror = () => reject(new Error('Could not reach R2. Check the network and bucket CORS settings.'))
    request.ontimeout = () => reject(new Error('Upload timed out. Try again.'))
    request.send(file)
  })
}

export default function Uploads({ event, onUploaded, onBusyChange }) {
  const [queue, setQueue] = useState([])
  const [batchPrice, setBatchPrice] = useState('')
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [previewMessage, setPreviewMessage] = useState('')
  const [history, setHistory] = useState([])
  const [historyError, setHistoryError] = useState(false)
  const [revision, refresh] = useState(0)
  const locked = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      const records = []
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await supabase.from('upload_intents').select('id,file_name,mime_type,price_centavos,confirmed_at')
          .eq('event_id', event.id).is('preview_of', null).not('confirmed_at', 'is', null)
          .order('confirmed_at', { ascending: false }).order('id').range(offset, offset + 99).abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error) {
          setHistoryError(true)
          return
        }
        if (data.length) {
          const previews = await supabase.from('upload_intents').select('preview_of')
            .in('preview_of', data.map((item) => item.id)).not('confirmed_at', 'is', null).abortSignal(controller.signal)
          if (controller.signal.aborted) return
          if (previews.error) {
            setHistoryError(true)
            return
          }
          const ready = new Set(previews.data.map((item) => item.preview_of))
          records.push(...data.map((item) => ({ ...item, previewReady: ready.has(item.id) })))
        }
        if (data.length < 100) break
      }
      setHistory(records)
      setHistoryError(false)
    }
    void load()
    return () => controller.abort()
  }, [event.id, revision])

  function addFiles(files, original) {
    if (locked.current || !files.length) return
    const valid = files.filter((file) => validFile(file)
      && (!original || family(file.type) === family(original.mime_type)))
    const setFeedback = original ? setPreviewMessage : setMessage
    setFeedback(valid.length === files.length ? '' : `${files.length - valid.length} file(s) skipped because of format, size, or filename.`)
    setQueue((previous) => [...previous.filter((item) => item.state !== 'Uploaded'),
      ...valid.map((file) => queuedFile(file, original?.id))])
  }

  function select(change, original) {
    addFiles(Array.from(change.target.files), original)
    change.target.value = ''
  }

  function selectPreviews(change) {
    const files = Array.from(change.target.files)
    change.target.value = ''
    if (locked.current || !files.length) return
    const taken = new Set(queue.map((row) => row.previewOf))
    const added = []
    const unmatched = []
    for (const file of files) {
      const name = basename(file.name).replace(/[-_ ]preview$/, '')
      const matches = validFile(file) ? history.filter((item) =>
        basename(item.file_name) === name && family(item.mime_type) === family(file.type)) : []
      const original = matches.length === 1 ? matches[0] : null
      if (!original || original.previewReady || taken.has(original.id)) {
        unmatched.push(file.name)
        continue
      }
      taken.add(original.id)
      added.push(queuedFile(file, original.id))
    }
    setQueue((previous) => [...previous.filter((row) => row.state !== 'Uploaded'), ...added])
    setPreviewMessage(`${added.length} preview(s) matched.${unmatched.length
      ? ` ${unmatched.length} skipped: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? ', …' : ''}. For duplicate names, attach the preview to the correct original below.`
      : ''}`)
  }
  async function upload(items) {
    if (locked.current) return
    if (items.some((item) => !item.previewOf && !priceInCentavos(item.price))) {
      setMessage('Enter a price greater than ₱0 for every selected file.')
      return
    }
    setMessage('')
    locked.current = true
    setRunning(true)
    onBusyChange?.(true)
    function patch(id, fields) {
      setQueue((previous) => previous.map((item) => item.id === id ? { ...item, ...fields } : item))
    }
    let uploaded = false
    try {
      for (const item of items) {
        const { id, file } = item
        let ticket = item.ticket
        let sent = item.sent
        try {
          patch(id, { state: sent ? 'Verifying' : 'Preparing', error: '' })
          if (!ticket || (!sent && Date.now() > ticket.deadline)) {
            ticket = await invoke('create-upload-url', { eventId: event.id, name: file.name, type: file.type, size: file.size, ...(item.previewOf ? { previewOf: item.previewOf } : { priceCentavos: priceInCentavos(item.price) }) })
            ticket.deadline = Date.now() + 4 * 60 * 1000
            patch(id, { ticket })
          }
          if (!sent) {
            patch(id, { state: 'Uploading', progress: 0 })
            await put(ticket, file, (progress) => patch(id, { progress }))
            sent = true
            patch(id, { sent, progress: 100, state: 'Verifying' })
          }
          await invoke('confirm-upload', { id: ticket.id })
          patch(id, { state: 'Uploaded', ticket: null })
          uploaded = true
        } catch (error) {
          const reset = error.status === 410 || (sent && error.status === 409)
          patch(id, { state: 'Failed', error: error.message, ticket: reset ? null : ticket, sent: reset ? false : sent })
        }
      }
      if (uploaded) {
        refresh((value) => value + 1)
        onUploaded?.()
      }
    } finally {
      locked.current = false
      setRunning(false)
      onBusyChange?.(false)
    }
  }

  const originals = queue.filter((item) => !item.previewOf)
  const queued = originals.filter((item) => item.state === 'Queued')
  const queuedPreviews = queue.filter((item) => item.previewOf && item.state === 'Queued')
  return <div className="upload-workspace">
    <div className="upload-context"><CalendarDays size={18} aria-hidden="true" /><span>Event</span><strong>{event.title}</strong></div>
    <section className="upload-step panel stack" aria-labelledby="originals-heading">
      <div className="upload-step-heading">
        <span className="upload-step-number" aria-hidden="true">1</span>
        <div><h2 id="originals-heading">Upload originals</h2><p>Add the full-quality files and set a price for each one.</p></div>
        <span className="upload-status"><LockKeyhole size={14} aria-hidden="true" /> Private</span>
      </div>
    <form className="stack" onSubmit={(submitEvent) => {
      submitEvent.preventDefault()
      void upload(queued)
    }}>
    <label className="upload-file-picker" onDragOver={(drag) => drag.preventDefault()} onDrop={(drop) => {
      drop.preventDefault()
      addFiles(Array.from(drop.dataTransfer.files))
    }}>
      <span><Upload size={18} aria-hidden="true" /> Choose or drop multiple original files</span>
      <small>JPG, PNG or WebP up to 25 MB · MP4 up to 100 MB</small>
      <input type="file" accept={Object.keys(limits).join(',')} multiple onChange={(change) => select(change)} disabled={running} />
    </label>
    {message && <p role="status">{message}</p>}
    {queued.length > 1 && <div className="upload-batch-controls">
      <label>Batch price (PHP)<input type="text" inputMode="decimal" value={batchPrice} placeholder="150.00"
        disabled={running} onChange={(change) => setBatchPrice(change.target.value)} /></label>
      <button type="button" className="admin-outline" disabled={running || !priceInCentavos(batchPrice)} onClick={() =>
        setQueue((previous) => previous.map((item) => !item.previewOf && item.state === 'Queued'
          ? { ...item, price: batchPrice } : item))}>Apply to {queued.length} originals</button>
    </div>}
    {originals.length > 0 && <ul className="stack">{originals.map((item) => <li key={item.id}>
      <div className="section-heading"><b>{item.previewOf ? 'Preview · ' : 'Original · '}{item.file.name}</b><span role="status">{item.state}</span></div>
      {!item.previewOf && <label>Price for {item.file.name} (PHP)
        <input type="text" inputMode="decimal" placeholder="0.00" value={item.price}
          required={item.state === 'Queued'} pattern="[0-9]{1,6}(\.[0-9]{1,2})?"
          disabled={running || Boolean(item.ticket) || item.state === 'Uploaded'}
          onChange={(change) => setQueue((previous) => previous.map((row) => row.id === item.id ? { ...row, price: change.target.value } : row))} />
      </label>}
      {item.state === 'Uploading' && <progress aria-label={`Uploading ${item.file.name}`} value={item.progress} max="100" />}
      {item.error && <p role="alert">{item.error}</p>}
      {item.state === 'Failed' && <><button type="button" className="primary" disabled={running} onClick={() => upload([item])}>Retry</button>
        <button type="button" disabled={running} onClick={() => setQueue((previous) => previous.filter((row) => row.id !== item.id))}>Remove from queue</button></>}
    </li>)}</ul>}
    {queued.length > 0 && <button className="primary" type="submit" disabled={running}>Upload {queued.length} {queued.length === 1 ? 'original' : 'originals'}</button>}
    </form>
    </section>
    <section className="upload-step panel stack" aria-labelledby="previews-heading">
      <div className="upload-step-heading">
        <span className="upload-step-number" aria-hidden="true">2</span>
        <div><h2 id="previews-heading">Add customer previews</h2><p>Choose a separate watermarked photo or short video clip for each original. Customers can see it when the event is published.</p></div>
      </div>
      {previewMessage && <p role="status">{previewMessage}</p>}
    {history.some((item) => !item.previewReady) && !historyError && <div className="upload-batch-controls">
      <label className="upload-preview-picker"><span>Choose multiple previews</span>
        <small>Match filenames: IMG001.jpg → IMG001-preview.webp</small>
        <input type="file" accept={Object.keys(limits).join(',')} multiple disabled={running} onChange={selectPreviews} />
      </label>
      {queuedPreviews.length > 0 && <button type="button" className="primary" disabled={running} onClick={() => upload(queuedPreviews)}>
        Upload {queuedPreviews.length} {queuedPreviews.length === 1 ? 'preview' : 'previews'}
      </button>}
    </div>}
    {historyError ? <p role="status">Upload history is unavailable. Check the Supabase migration.</p> :
      history.length ? <ul className="stack">{history.map((item) => {
        const ready = item.previewReady
        const pending = queue.find((row) => row.previewOf === item.id)
        const Icon = item.mime_type === 'video/mp4' ? Film : Image
        const price = item.price_centavos == null ? 'Price not set' : money.format(item.price_centavos / 100)
        return <li key={item.id} className="upload-original stack">
          <div className="upload-original-heading">
            <span className="upload-type-icon"><Icon size={19} aria-hidden="true" /></span>
            <div><b>{item.file_name}</b><small>{price} · Uploaded {new Date(item.confirmed_at).toLocaleString()}</small></div>
            <span className="upload-status" data-ready={ready ? 'true' : undefined}>{ready ? 'Preview verified' : pending ? 'Preview selected' : 'Needs preview'}</span>
          </div>
          {ready ? null : pending ? <div className="stack">
            <p><b>Preview:</b> {pending.file.name} · <span role="status">{pending.state}</span></p>
            {pending.state === 'Uploading' && <progress aria-label="Uploading preview" value={pending.progress} max="100" />}
            {pending.error && <p role="alert">{pending.error}</p>}
            {['Queued', 'Failed'].includes(pending.state) && <div className="section-heading">
              <button type="button" className="primary" disabled={running} onClick={() => upload([pending])}>
                {pending.state === 'Failed' ? 'Retry preview upload' : 'Upload preview'}
              </button>
              <button type="button" disabled={running} onClick={() => setQueue((previous) => previous.filter((row) => row.id !== pending.id))}>Choose another file</button>
            </div>}
          </div> : <label className="upload-preview-picker"><span><Upload size={16} aria-hidden="true" /> Add {item.mime_type === 'video/mp4' ? 'video' : 'photo'} preview</span>
            <input type="file" accept={item.mime_type === 'video/mp4' ? 'video/mp4' : 'image/jpeg,image/png,image/webp'}
              disabled={running} onChange={(change) => select(change, item)} />
          </label>}
        </li>
      })}</ul> : <p className="upload-empty">Upload an original in Step 1. It will appear here when verified.</p>}
    </section>
  </div>
}








