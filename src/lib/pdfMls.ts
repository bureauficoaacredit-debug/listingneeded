/**
 * MLS candidate parsing (client) + server PDF upload helper.
 * PDF bytes are parsed on the server (/api/parse-mls-pdf) — not Safari pdf.js.
 * Paste-text path uses parseMlsCandidates locally (same heuristics as the API).
 */

import type { ListingType } from './types'

export type MlsDraft = {
  key: string
  /** Stable id for Excel upserts: mls_<MLS Number>. PDF/paste drafts omit this. */
  id?: string
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
  /** External http(s) photo links (do not download). */
  photoDataUrls?: string[]
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
 * Split MLS / sheet text into candidate property drafts using street-address anchors.
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

type ParseApiResponse = {
  text?: string
  drafts?: MlsDraft[]
  error?: string
  source?: string
}

/** Upload PDF to server API; returns drafts for editable preview. No client pdf.js. */
export async function uploadMlsPdf(file: File): Promise<{ text: string; drafts: MlsDraft[] }> {
  if (!file) throw new Error('No PDF file selected.')
  if (file.size === 0) throw new Error('PDF file is empty.')
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('PDF is larger than 10 MB. Split it or use Paste MLS text.')
  }

  let pdfBase64: string
  try {
    const buf = await file.arrayBuffer()
    pdfBase64 = arrayBufferToBase64(buf)
  } catch (err) {
    throw new Error(
      `Could not read PDF file bytes: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  let res: Response
  try {
    res = await fetch('/api/parse-mls-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64, filename: file.name }),
    })
  } catch (err) {
    throw new Error(
      `Could not reach parse API (${err instanceof Error ? err.message : String(err)}). If you are on localhost, run the Vite app so /api/parse-mls-pdf is available, or use Paste MLS text.`,
    )
  }

  let data: ParseApiResponse = {}
  try {
    data = (await res.json()) as ParseApiResponse
  } catch {
    throw new Error(`Parse API returned non-JSON (HTTP ${res.status}).`)
  }

  if (!res.ok) {
    throw new Error(data.error || `Parse API failed (HTTP ${res.status}).`)
  }

  const drafts = Array.isArray(data.drafts) ? data.drafts : []
  if (!drafts.length) {
    throw new Error(data.error || 'Parse API returned no candidates.')
  }
  return { text: data.text || '', drafts }
}

/** Parse pasted MLS / sheet text into editable drafts (no network). */
export function parseMlsPasteText(text: string): { text: string; drafts: MlsDraft[] } {
  const trimmed = text.replace(/\u00a0/g, ' ').trim()
  if (!trimmed) throw new Error('Paste some MLS text first.')
  return { text: trimmed, drafts: parseMlsCandidates(trimmed) }
}
