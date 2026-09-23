/**
 * Shared MLS text → draft heuristics (Node + Vite middleware).
 * Keep in sync with src/lib/pdfMls.ts parseMlsCandidates.
 */

const STREET_RE =
  /\b(\d{1,6}\s+[A-Za-z0-9.'\-]+(?:\s+[A-Za-z0-9.'\-]+){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Cir|Circle|Ter|Terrace|Pkwy|Parkway|Hwy|Highway)\.?)\b/gi

const CITY_ST_ZIP_RE =
  /\b([A-Za-z][A-Za-z\s.'-]{1,40}),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/

const PRICE_RE = /(?:\$|USD\s*)([\d,]{3,})(?:\.\d{2})?/g
const BEDS_RE = /\b(\d{1,2})\s*(?:beds?|bedrooms?|bd|br|bds)\b/i
const BATHS_RE = /\b(\d{1,2}(?:\.\d)?)\s*(?:baths?|bathrooms?|ba|bas)\b/i
const RENT_HINT = /\b(for\s+rent|rental|lease|\/\s*mo|per\s+month|monthly)\b/i
const SALE_HINT = /\b(for\s+sale|list\s*price|asking|mls\s*#|sold)\b/i

function parsePriceNear(chunk) {
  let best = 0
  PRICE_RE.lastIndex = 0
  let m
  while ((m = PRICE_RE.exec(chunk)) !== null) {
    const n = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    if (n >= 500 && n <= 50_000_000 && n > best) best = n
  }
  return best
}

function guessType(chunk, price) {
  if (RENT_HINT.test(chunk) && !SALE_HINT.test(chunk)) return 'rent'
  if (SALE_HINT.test(chunk) && !RENT_HINT.test(chunk)) return 'sale'
  if (price > 0 && price < 20000) return 'rent'
  return 'sale'
}

function parseBedsBaths(chunk) {
  const bedsM = chunk.match(BEDS_RE)
  const bathsM = chunk.match(BATHS_RE)
  return {
    beds: bedsM ? Number(bedsM[1]) : 0,
    baths: bathsM ? Number(bathsM[1]) : 0,
  }
}

function parseCityStateZip(chunk) {
  const m = chunk.match(CITY_ST_ZIP_RE)
  if (!m) return { city: '', state: 'CT', zip: '' }
  return { city: m[1].trim(), state: m[2], zip: m[3] }
}

export function parseMlsCandidates(text) {
  const cleaned = String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
  const addresses = []
  STREET_RE.lastIndex = 0
  let m
  while ((m = STREET_RE.exec(cleaned)) !== null) {
    const address = m[1].replace(/\s+/g, ' ').trim()
    if (
      addresses.some(
        (a) =>
          Math.abs(a.index - m.index) < 20 || a.address.toLowerCase() === address.toLowerCase(),
      )
    ) {
      continue
    }
    addresses.push({ index: m.index, address })
  }

  const drafts = []

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

/** Extract text from PDF bytes using pdf-parse (Node), with pdfjs-dist legacy fallback. */
export async function extractPdfTextFromBuffer(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  if (!bytes.length) throw new Error('PDF file is empty.')

  // Preferred: pdf-parse v2 (wraps pdfjs on Node, no Safari worker).
  try {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: bytes })
    try {
      const result = await parser.getText()
      const text = String(result?.text || '')
        .replace(/-- \d+ of \d+ --/g, '')
        .trim()
      if (text) return text
    } finally {
      await parser.destroy().catch(() => {})
    }
  } catch (err) {
    console.warn('pdf-parse failed, trying pdfjs-dist:', err)
  }

  // Fallback: pdfjs-dist legacy on Node (no browser worker).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableWorker: true,
  })
  const pdf = await task.promise
  const pageCount = Number(pdf?.numPages) || 0
  if (pageCount < 1) throw new Error('PDF reported zero pages.')

  const parts = []
  for (let p = 1; p <= pageCount; p++) {
    try {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const items = Array.isArray(content?.items) ? content.items : []
      const line = items
        .map((it) => (it && typeof it === 'object' && typeof it.str === 'string' ? it.str : ''))
        .filter(Boolean)
        .join(' ')
      if (line.trim()) parts.push(line)
    } catch (err) {
      console.warn(`PDF page ${p} text extract failed:`, err)
    }
  }
  return parts.join('\n\n')
}

export async function parseMlsPdfBuffer(buf) {
  const text = await extractPdfTextFromBuffer(buf)
  if (!String(text || '').trim()) {
    throw new Error(
      'PDF had no extractable text (image-only / scanned PDFs need OCR). Try Paste MLS text, or a text-based MLS export.',
    )
  }
  return { text, drafts: parseMlsCandidates(text) }
}
