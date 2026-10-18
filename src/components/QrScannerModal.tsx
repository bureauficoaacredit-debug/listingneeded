import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getQrCodes } from '../lib/store'

/**
 * v61: in-page QR scanner (full-screen). Rear camera via getUserMedia; decodes with the native BarcodeDetector when the
 * browser has it (Android Chrome), otherwise jsQR (iPhone Safari), which is only downloaded when this modal opens.
 * A scan goes straight to the listing form with that code's plan; other codes open the paid form (link offered, never auto-opened).
 */
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type JsQr = typeof import('jsqr').default

const SITE_HOSTS = /^(www\.)?listingneeded\.com$|^listingneeded(-[a-z0-9-]+)?\.vercel\.app$/i

async function nativeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  if (!BD) return null
  try {
    const fmts = (await BD.getSupportedFormats?.()) ?? ['qr_code']
    return fmts.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null
  } catch {
    return null
  }
}

let jsqrPromise: Promise<JsQr> | null = null
const loadJsQr = () => (jsqrPromise ??= import('jsqr').then((m) => m.default))

/** Decode from a video frame or image: native first, jsQR fallback on a downscaled canvas. */
async function decode(src: HTMLVideoElement | HTMLImageElement, det: Detector | null, canvas: HTMLCanvasElement, maxSide: number): Promise<string | null> {
  if (det) {
    try {
      const r = await det.detect(src)
      if (r[0]?.rawValue) return r[0].rawValue
      if (src instanceof HTMLVideoElement) return null
    } catch {
      /* fall through to jsQR */
    }
  }
  const w0 = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth
  const h0 = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight
  if (!w0 || !h0) return null
  const s = Math.min(1, maxSide / Math.max(w0, h0))
  const w = Math.round(w0 * s)
  const h = Math.round(h0 * s)
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  g.drawImage(src, 0, 0, w, h)
  const jsQR = await loadJsQr()
  const img = g.getImageData(0, 0, w, h)
  const hit = jsQR(img.data, w, h, { inversionAttempts: src instanceof HTMLVideoElement ? 'dontInvert' : 'attemptBoth' })
  return hit?.data || null
}

export default function QrScannerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const doneRef = useRef(false)
  const [camError, setCamError] = useState('')
  const [starting, setStarting] = useState(true)
  const [photoMsg, setPhotoMsg] = useState('')

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const close = useCallback(() => {
    doneRef.current = true
    stop()
    onClose()
  }, [onClose, stop])

  const handle = useCallback(
    (text: string) => {
      if (doneRef.current) return
      doneRef.current = true
      stop()
      if (navigator.vibrate) navigator.vibrate(60)
      let url: URL | null = null
      try {
        url = new URL(text.trim())
      } catch {
        url = null
      }
      onClose()
      if (url && /^https?:$/.test(url.protocol) && SITE_HOSTS.test(url.hostname)) {
        const route = url.hash.startsWith('#/') ? url.hash.slice(1) : `${url.pathname}${url.search}` || '/'
        const q = new URLSearchParams(route.split('?')[1] || '')
        // straight to the upload form with the scanned code's plan (the form handles a free promo that has ended)
        if (q.get('plan') === 'free') return navigate('/list?plan=free&src=qr')
        if (q.get('src') === 'qr-paid') {
          // paid code → paid upload form (if the admin paused the paid QR, it's the same regular paid form)
          void getQrCodes()
            .then((c) => navigate(c.paid.enabled && !c.paid.hidden ? '/list?src=qr-paid' : '/list'))
            .catch(() => navigate('/list'))
          return
        }
        return navigate(route.startsWith('/list') || route.startsWith('/listing/') ? route : '/list')
      }
      // any other code: the regular paid upload form, with an optional "Open scanned link"
      navigate('/list', { state: { scannedLink: text.trim() } })
    },
    [navigate, onClose, stop],
  )

  // camera + scan loop
  useEffect(() => {
    let raf = 0
    let last = 0
    let cancelled = false
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError('This browser can’t open the camera here. Take a photo of the QR code instead.')
        setStarting(false)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current!
        v.srcObject = stream
        v.setAttribute('playsinline', 'true')
        v.muted = true
        await v.play().catch(() => {})
        setStarting(false)
        const det = await nativeDetector()
        if (!det) void loadJsQr()
        const tick = async (t: number) => {
          if (cancelled || doneRef.current) return
          if (t - last > 180 && v.readyState >= 2) {
            last = t
            const txt = await decode(v, det, canvasRef.current!, 640).catch(() => null)
            if (txt) return handle(txt)
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        const name = (e as { name?: string })?.name || ''
        setCamError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Camera access is blocked. Allow the camera for listingneeded.com in your browser settings, or take a photo of the QR code instead.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found on this device. Take a photo of the QR code instead.'
              : 'The camera couldn’t start. Take a photo of the QR code instead.',
        )
        setStarting(false)
      }
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stop()
    }
  }, [handle, stop])

  // Esc closes; lock page scroll behind the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [close])

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setPhotoMsg('Reading the photo…')
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      doneRef.current = false
      const txt = await decode(img, await nativeDetector(), canvasRef.current!, 1400)
      if (txt) {
        setPhotoMsg('')
        handle(txt)
      } else setPhotoMsg('No QR code found in that photo. Try again a little closer, with the whole code in the picture.')
    } catch {
      setPhotoMsg('Couldn’t read that photo. Try another one.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="qrs" role="dialog" aria-modal="true" aria-label="Scan a QR code">
      <video ref={videoRef} className="qrs-video" playsInline muted autoPlay hidden={!!camError} />
      <canvas ref={canvasRef} hidden />
      <div className="qrs-top">
        <span className="qrs-title">Scan the QR code</span>
        <button type="button" className="qrs-close" onClick={close} aria-label="Close scanner">✕</button>
      </div>

      {camError ? (
        <div className="qrs-panel">
          <p className="qrs-panel-title">Camera not available</p>
          <p>{camError}</p>
        </div>
      ) : (
        <div className="qrs-frame" aria-hidden="true">
          <span /><span /><span /><span />
          <i className="qrs-laser" />
        </div>
      )}

      {(
        <div className="qrs-bottom">
          <p className="qrs-hint">{starting ? 'Starting camera…' : camError ? '' : 'Point your camera at the QR code on the For Sale sign.'}</p>
          <label className="btn qrs-photo">
            Take a photo of the QR code
            <input type="file" accept="image/*" capture="environment" className="visually-hidden-input" onChange={(e) => { void onPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
          </label>
          {photoMsg ? <p className="qrs-msg" role="status">{photoMsg}</p> : null}
        </div>
      )}
    </div>
  )
}
