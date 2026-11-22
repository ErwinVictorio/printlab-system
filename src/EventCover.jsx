import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { supabase } from './lib/supabase'

const bucket = 'event-covers'
const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export default function EventCover({ event, onSaved }) {
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (!event.cover_path) return
    let active = true
    supabase.storage.from(bucket).createSignedUrl(event.cover_path, 600).then(({ data, error }) => {
      if (active) setImage({ path: event.cover_path, url: data?.signedUrl, error })
    })
    return () => { active = false }
  }, [event.cover_path])

  async function save(submit) {
    submit.preventDefault()
    if (busy) return
    const form = submit.currentTarget
    const file = new FormData(form).get('cover')
    const extension = Object.hasOwn(formats, file.type) ? formats[file.type] : null
    if (!extension || !file.size || file.size > 5 * 1024 * 1024) {
      setMessage({ error: true, text: 'Choose a JPG, PNG, or WebP image up to 5 MB.' })
      return
    }
    setBusy(true)
    setMessage(null)
    const storage = supabase.storage.from(bucket)
    const path = `${event.id}/${crypto.randomUUID()}.${extension}`
    try {
      const uploaded = await storage.upload(path, file, { contentType: file.type })
      if (uploaded.error) throw uploaded.error
      let query = supabase.from('events').update({ cover_path: path }).eq('id', event.id).neq('status', 'archived')
      query = event.cover_path ? query.eq('cover_path', event.cover_path) : query.is('cover_path', null)
      const updated = await query.select('cover_path').single()
      if (updated.error) {
        await storage.remove([path])
        throw updated.error
      }
      onSaved(path)
      form.reset()
      setMessage({ text: 'Cover photo saved.' })
      if (event.cover_path) await storage.remove([event.cover_path])
    } catch {
      setMessage({ error: true, text: 'Could not save the cover photo. Refresh and try again.' })
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-panel stack event-cover-settings">
    <h2><ImagePlus size={21} aria-hidden="true" /> Cover photo</h2>
    <div className="event-cover-settings-layout">
      <form className="stack" onSubmit={save}>
        <p>Appears on the event card and event page once published.</p>
        <label>{event.cover_path ? 'Replace cover photo' : 'Choose cover photo'}
          <input type="file" name="cover" accept="image/jpeg,image/png,image/webp" required disabled={busy} />
        </label>
        <small>JPG, PNG, or WebP up to 5 MB. Use a wide photo for the best fit.</small>
        <button type="submit" className="admin-action" disabled={busy}>{busy ? 'Saving…' : 'Save cover photo'}</button>
        {message && <p role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      </form>
      {event.cover_path && image?.path === event.cover_path && (image.error
        ? <p role="status">Cover preview is unavailable.</p>
        : <img src={image.url} alt={`Current cover for ${event.title}`} />)}
    </div>
  </section>
}
