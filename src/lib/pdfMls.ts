/**
 * Client-side MLS PDF text extract + heuristic property parsing.
 * Uses pdf.js legacy build for Safari / older browsers (Promise.withResolvers polyfill).
 * Worker loaded from jsDelivr CDN matching the installed package version (Vite/Vercel-safe).
 */
import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { ListingType } from './types'

/** Safari < 17.4 and some WebViews lack Promise.withResolvers — belt-and-suspenders. */
function ensurePromiseWithResolvers() {
  const P = Promise as typeof Promise & {
    withResolvers?: <T>() => {
      promise: Promise<T>
      resolve: (value: T | PromiseLike<T>) => void
      reject: (reason?: unknown) => void
    }
  }
  if (typeof P.withResolvers === 'function') return
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

ensurePromiseWithResolvers()

// Exact version CDN worker — avoids Vite hashed ?url module-worker breakage on Safari.
const PDFJS_VERSION = typeof version === 'string' && version ? version : '5.6.205'
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs`

export type MlsDraft = {
  key: string
  type: ListingType
  address: string
  city: string
  state: string
  zip: string
  beds: number
  baths: number
  price: number
  pets: 'no' | 'yes' | 'negotiable'
  description: string
  include: boolean
}

const STREET_RE =
  /\b(\d{1,6}\s+[A-Za-z0-9.'\-]+(?:\s+[A-Za-z0-9.'\-]+){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Cir|Circle|Ter|Terrace|Pkwy|Parkway|Hwy|Highway)\.?)\b/gi

const CITY_ST_ZIP_RE =
  /\b([A-Za-z][A-Za-z\s.'-]{1,40}),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/

const PRICE_RE = /(?:\$|USD\s*)([\d,]{3,})(?:\.\d{2})?/g
const BEDS_RE = /\b(\d{1,2})\s*(?:beds?|bedrooms?|bd|br|bds)\b/i
const BATHS_RE = /\b(\d{1,2}(?:\.\d)?)\s*(?:baths?|bathrooms?|ba|bas)\b/i
const RENT_HINT = /\b(for\s+rent|rental|lease|\/\s*mo|per\s+month|monthly)\b/i
const SALE_HINT = /\b(for\s+sale|list\s*price|asking|mls\s*#|sold)\b/i

function itemText(it: unknown): string {
  if (!it || typeof it !== 'object') return ''
  if ('str' in it && typeof (it as { str: unknown }).str === 'string') {
    return (it as { str: string }).str
  }
  return ''
}

export async function extractPdfText(file: File): Promise<string> {
  ensurePromiseWithResolvers()
  let buf: ArrayBuffer
  try {
    buf = await file.arrayBuffer()
  } catch (err) {
    throw new Error(
      `Could not read PDF file bytes: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  let pdf
  try {
    const task = getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    })
    pdf = await task.promise
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `PDF.js failed to open the file (${msg}). Try another PDF, or export as text-based PDF (not a scan).`,
    )
  }

  const pageCount = Number(pdf?.numPages) || 0
  if (pageCount < 1) {
    throw new Error('PDF reported zero pages.')
  }

  const parts: string[] = []
  for (let p = 1; p <= pageCount; p++) {
    try {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const items = Array.isArray(content?.items) ? content.items : []
      const line = items.map(itemText).filter(Boolean).join(' ')
      if (line.trim()) parts.push(line)
    } catch (err) {
      console.warn(`PDF page ${p} text extract failed:`, err)
    }
  }
  return parts.join('\n\n')
}

function parsePriceNear(chunk: string): number {
  let best = 0
  PRICE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PRICE_RE.exec(chunk)) !== null) {
    const n = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    if (n >= 500 && n <= 50_000_000 && n > best) best = n
  }
  return best
}

function guessType(chunk: string, price: number): ListingType {
  if (RENT_HINT.test(chunk) && !SALE_HINT.test(chunk)) return 'rent'
  if (SALE_HINT.test(chunk) && !RENT_HINT.test(chunk)) return 'sale'
  if (price > 0 && price < 20000) return 'rent'
  return 'sale'
}

function parseBedsBaths(chunk: string): { beds: number; baths: number } {
  const bedsM = chunk.match(BEDS_RE)
  const bathsM = chunk.match(BATHS_RE)
  return {
    beds: bedsM ? Number(bedsM[1]) : 0,
    baths: bathsM ? Number(bathsM[1]) : 0,
  }
}

function parseCityStateZip(chunk: string): { city: string; state: string; zip: string } {
  const m = chunk.match(CITY_ST_ZIP_RE)
  if (!m) return { city: '', state: 'CT', zip: '' }
  return { city: m[1].trim(), state: m[2], zip: m[3] }
}

/**
 * Split PDF text into candidate property drafts using street-address anchors.
 * Always returns at least one editable row when any text exists (even if empty fields).
 */
export function parseMlsCandidates(text: string): MlsDraft[] {
  const cleaned = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ')
  const addresses: { index: number; address: string }[] = []
  STREET_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = STREET_RE.exec(cleaned)) !== null) {
    const address = m[1].replace(/\s+/g, ' ').trim()
    if (
      addresses.some(
        (a) =>
          Math.abs(a.index - m!.index) < 20 || a.address.toLowerCase() === address.toLowerCase(),
      )
    ) {
      continue
    }
    addresses.push({ index: m.index, address })
  }

  const drafts: MlsDraft[] = []

  if (addresses.length === 0) {
    const price = parsePriceNear(cleaned)
    const { beds, baths } = parseBedsBaths(cleaned)
    const loc = parseCityStateZip(cleaned)
    drafts.push({
      key: `pdf_0_${Date.now()}`,
      type: guessType(cleaned, price),
      address: '',
      city: loc.city,
      state: loc.state || 'CT',
      zip: loc.zip,
      beds,
      baths,
      price,
      pets: 'no',
      description: cleaned.slice(0, 500).trim(),
      include: true,
    })
    return drafts
  }

  for (let i = 0; i < addresses.length; i++) {
    const start = addresses[i].index
    const end = i + 1 < addresses.length ? addresses[i + 1].index : cleaned.length
    const chunk = cleaned.slice(start, Math.min(end, start + 1200))
    const price = parsePriceNear(chunk)
    const { beds, baths } = parseBedsBaths(chunk)
    const loc = parseCityStateZip(chunk)
    drafts.push({
      key: `pdf_${i}_${Date.now()}`,
      type: guessType(chunk, price),
      address: addresses[i].address,
      city: loc.city,
      state: loc.state || 'CT',
      zip: loc.zip,
      beds,
      baths,
      price,
      pets: 'no',
      description: chunk.slice(0, 400).trim(),
      include: true,
    })
  }

  return drafts
}

export async function parseMlsPdf(file: File): Promise<{ text: string; drafts: MlsDraft[] }> {
  if (!file) throw new Error('No PDF file selected.')
  if (file.size === 0) throw new Error('PDF file is empty.')
  const text = await extractPdfText(file)
  if (!text.trim()) {
    throw new Error(
      'PDF had no extractable text (image-only / scanned PDFs need OCR). Try a text-based MLS export.',
    )
  }
  return { text, drafts: parseMlsCandidates(text) }
}
