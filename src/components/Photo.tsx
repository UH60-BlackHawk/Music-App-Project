import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../store'
import { Avatar, Icon, Sheet } from './ui'

const VIEW = 260 // on-screen crop circle, px
const OUT = 320 // saved image size, px (small so it fits comfortably in browser storage)
const MAX_FILE = 15 * 1024 * 1024

/**
 * Your own avatar with a camera badge. Tapping it lets you choose, crop and save a profile photo,
 * or remove the current one. The photo is stored as a small square JPEG on your user record.
 */
export function ProfilePhoto({ size = 84 }: { size?: number }) {
  const me = useStore((s) => s.users.me)
  const updateMe = useStore((s) => s.updateMe)
  const input = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const choose = () => { setErr(''); input.current?.click() }
  const onFile = (f: File | undefined) => {
    if (!f) return
    setErr('')
    if (!f.type.startsWith('image/')) return setErr('That file isn’t an image.')
    if (f.size > MAX_FILE) return setErr('That image is too large. Pick one under 15 MB.')
    setMenu(false)
    setSrc(URL.createObjectURL(f))
  }
  const close = () => { if (src) URL.revokeObjectURL(src); setSrc(null) }

  return (
    <>
      <button className="photo-edit" onClick={() => (me.photo ? setMenu(true) : choose())} aria-label={me.photo ? 'Change profile photo' : 'Add profile photo'}>
        <Avatar user={me} size={size} />
        <span className="photo-badge"><Icon name="camera" size={15} /></span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      {err && <p className="error">{err}</p>}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Profile photo">
        <div className="stack">
          <button className="btn block" onClick={choose}><Icon name="camera" size={16} /> Choose a new photo</button>
          <button className="btn block danger" onClick={() => { updateMe({ photo: undefined }); setMenu(false) }}>Remove photo</button>
          {err && <p className="error">{err}</p>}
        </div>
      </Sheet>

      {src && <Cropper src={src} onCancel={close} onSave={(photo) => { updateMe({ photo }); close() }} onError={() => { close(); setErr('Couldn’t read that image. Try a JPG or PNG.') }} />}
    </>
  )
}

function Cropper({ src, onCancel, onSave, onError }: { src: string; onCancel: () => void; onSave: (dataUrl: string) => void; onError: () => void }) {
  const img = useRef<HTMLImageElement | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    const el = new Image()
    el.onload = () => { img.current = el; setDims({ w: el.naturalWidth, h: el.naturalHeight }) }
    el.onerror = onError
    el.src = src
  }, [src])

  // Image is scaled to cover the circle, then zoomed; offsets are clamped so no gap shows.
  const base = dims ? Math.max(VIEW / dims.w, VIEW / dims.h) : 1
  const dw = dims ? dims.w * base * zoom : VIEW
  const dh = dims ? dims.h * base * zoom : VIEW
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(-(dw - VIEW) / 2, Math.min((dw - VIEW) / 2, p.x)),
    y: Math.max(-(dh - VIEW) / 2, Math.min((dh - VIEW) / 2, p.y)),
  })
  const at = clamp(pos)

  const down = (e: ReactPointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: at.x, py: at.y } }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }))
  }
  const save = () => {
    if (!img.current) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const r = OUT / VIEW
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(img.current, (VIEW / 2 - dw / 2 + at.x) * r, (VIEW / 2 - dh / 2 + at.y) * r, dw * r, dh * r)
    onSave(c.toDataURL('image/jpeg', 0.85))
  }

  return (
    <Sheet open onClose={onCancel} title="Move and zoom">
      <div className="cropper">
        <div className="crop-view" style={{ width: VIEW, height: VIEW }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
          {dims && (
            <img src={src} alt="" draggable={false} style={{ width: dw, height: dh, transform: `translate(calc(-50% + ${at.x}px), calc(-50% + ${at.y}px))` }} />
          )}
          <span className="crop-ring" aria-hidden="true" />
        </div>
        <label className="crop-zoom">
          <Icon name="search" size={16} />
          <input className="range" type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Zoom" />
        </label>
        <p className="fine center">Drag the photo to position it.</p>
        <div className="btn-pair crop-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!dims}><Icon name="check" size={16} /> Save photo</button>
        </div>
      </div>
    </Sheet>
  )
}
