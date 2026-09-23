/**
 * Client-side MLS PDF text extract + heuristic property parsing.
 * Uses pdf.js in the browser (Vite-friendly). Output is editable before publish.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ListingType } from './types'

GlobalWorkerOptions.workerSrc = pdfWorker

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

export async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const pdf = await getDocument({ data: buf }).promise
  const parts: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? String((it as { str: string }).str) : ''))
      .filter(Boolean)
      .join(' ')
    parts.push(line)
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
    // Prefer realistic home prices / rents
    if (n >= 500 && n <= 50_000_000 && n > best) best = n
  }
  return best
}

function guessType(chunk: string, price: number): ListingType {
  if (RENT_HINT.test(chunk) && !SALE_HINT.test(chunk)) return 'rent'
  if (SALE_HINT.test(chunk) && !RENT_HINT.test(chunk)) return 'sale'
  // Heuristic: under 20k and not "sale" → likely rent
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
    // Dedupe overlapping / identical nearby
    if (addresses.some((a) => Math.abs(a.index - m!.index) < 20 || a.address.toLowerCase() === address.toLowerCase())) {
      continue
    }
    addresses.push({ index: m.index, address })
  }

  const drafts: MlsDraft[] = []

  if (addresses.length === 0) {
    // Fallback: one blank-ish draft from whole text so admin can fill manually
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
  const text = await extractPdfText(file)
  if (!text.trim()) {
    throw new Error('PDF had no extractable text (scanned image-only PDFs need OCR).')
  }
  return { text, drafts: parseMlsCandidates(text) }
}
