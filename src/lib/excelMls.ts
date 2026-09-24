/**
 * SMART MLS Excel/CSV → editable MlsDraft[] (client-side SheetJS).
 * Does not touch the database — Admin publishes after preview.
 */

import * as XLSX from 'xlsx'
import type { MlsDraft } from './pdfMls'
import type { ListingType } from './types'

/** City (lowercase) → CT ZIP when export has no ZIP column. */
export const CT_CITY_ZIP: Record<string, string> = {
  stamford: '06902',
  bridgeport: '06604',
  fairfield: '06824',
  'new haven': '06511',
  westport: '06880',
  'new canaan': '06840',
  guilford: '06437',
  brookfield: '06804',
  bethel: '06801',
  darien: '06820',
  bethlehem: '06751',
  norwalk: '06851',
  trumbull: '06611',
  shelton: '06484',
  milford: '06460',
  stratford: '06615',
  greenwich: '06830',
  danbury: '06810',
  ridgefield: '06877',
  wilton: '06897',
  weston: '06883',
  easton: '06612',
  monroe: '06468',
}

const SKIP_STATUS_RE = /\b(CLSD|CLOSED|SOLD|WITHDRAWN|EXPIRED|CANCEL)\b/i
const RENT_HINT_RE = /\b(rent|rental|lease|\/\s*mo|per\s*month|monthly)\b/i
const URL_RE = /https?:\/\/[^\s"'<>]+/gi

function cellStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const want of keys) {
    const wantN = normalizeHeader(want)
    for (const [k, v] of Object.entries(row)) {
      if (normalizeHeader(k) === wantN) {
        if (v == null) return ''
        return String(v).trim()
      }
    }
  }
  return ''
}

function normalizeHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Find first column whose header matches any of the needles (substring). */
function cellByHeaderMatch(row: Record<string, unknown>, needles: RegExp[]): string {
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeHeader(k)
    if (needles.some((re) => re.test(nk))) {
      if (v == null) return ''
      return String(v).trim()
    }
  }
  return ''
}

export function parsePrice(raw: string): number {
  const s = String(raw || '')
  // Prefer $ amount after LP: / CP: etc.
  const dollar = s.match(/\$\s*([\d,]+(?:\.\d+)?)/)
  if (dollar) {
    const n = Number(dollar[1].replace(/,/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  const digits = s.replace(/[^\d.]/g, '')
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
}

export function cleanAddress(raw: string): string {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** '2/1' → full + 0.5 * half; also accepts plain numbers / decimals. */
export function parseBaths(raw: string): number {
  const s = String(raw || '').trim()
  if (!s) return 0
  const slash = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (slash) {
    return Number(slash[1]) + 0.5 * Number(slash[2])
  }
  const n = Number(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function parseMlsNumber(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  // strip leading zeros for integer string id, but keep significant digits
  const asInt = String(Number(digits))
  if (!Number.isFinite(Number(digits)) || asInt === 'NaN') return null
  return asInt
}

function guessType(status: string, propertyType: string, price: number): ListingType {
  const blob = `${status} ${propertyType}`
  if (RENT_HINT_RE.test(blob)) return 'rent'
  if (price > 0 && price < 20000) return 'rent'
  return 'sale'
}

function extractPhotoUrls(raw: string): string[] {
  if (!raw || !/https?:\/\//i.test(raw)) return []
  const found = raw.match(URL_RE) || []
  const urls: string[] = []
  for (const u of found) {
    const cleaned = u.replace(/[),.;]+$/g, '')
    if (/^https?:\/\//i.test(cleaned) && !urls.includes(cleaned)) urls.push(cleaned)
  }
  return urls
}

function zipForCity(city: string, zipCol: string): string {
  const fromCol = String(zipCol || '')
    .replace(/\D/g, '')
    .slice(0, 5)
  if (fromCol.length === 5) return fromCol
  const key = city.trim().toLowerCase().replace(/\s+/g, ' ')
  return CT_CITY_ZIP[key] || ''
}

function shouldSkipStatus(status: string): boolean {
  return SKIP_STATUS_RE.test(status)
}

export type ExcelParseResult = {
  drafts: MlsDraft[]
  skippedNoMls: number
  skippedStatus: number
  totalRows: number
}

/** Map one SMART MLS export row → MlsDraft or null if skipped. */
export function rowToDraft(row: Record<string, unknown>, index: number): MlsDraft | 'no_mls' | 'bad_status' {
  const mlsRaw = cellStr(row, 'MLS Number', 'MLS#', 'MLS No', 'MLS')
  const mlsNum = parseMlsNumber(mlsRaw)
  if (!mlsNum) return 'no_mls'

  const status = cellStr(row, 'Status')
  if (shouldSkipStatus(status)) return 'bad_status'

  const propertyType = cellStr(row, 'Property Type')
  const price = parsePrice(cellStr(row, 'List/Closed Price', 'List Price', 'Price'))
  const address = cleanAddress(cellStr(row, 'Address'))
  const city = cellStr(row, 'City')
  const zipCol = cellStr(row, 'ZIP', 'Zip', 'Zip Code', 'Postal Code')
  const zip = zipForCity(city, zipCol)
  const beds = Number(cellStr(row, 'Beds Total', 'Beds', 'Bedrooms')) || 0
  const baths = parseBaths(cellStr(row, 'Baths', 'Bathrooms'))
  const sqft = cellStr(row, 'Sq Ft Total', 'SQFT Est Heated Above Grade', 'Sq Ft')
  const style = cellStr(row, 'Style')
  const year = cellStr(row, 'Year Built')
  const agent = cellStr(row, 'List Agent/Team Name w/ Biz Card', 'List Agent')

  const photoRaw =
    cellStr(row, 'Small Photo') ||
    cellByHeaderMatch(row, [/photo/, /image/, /url/])
  const photoUrls = extractPhotoUrls(photoRaw)

  const type = guessType(status, propertyType, price)
  const parts = [
    `MLS #${mlsNum}`,
    status || null,
    propertyType || null,
    style || null,
    sqft ? `${sqft} sq ft` : null,
    year ? `Built ${year}` : null,
    agent ? `List agent: ${agent}` : null,
  ].filter(Boolean)

  return {
    key: `mls_${mlsNum}_${index}`,
    id: `mls_${mlsNum}`,
    type,
    address,
    city,
    state: 'CT',
    zip,
    beds,
    baths,
    price,
    pets: 'no',
    description: parts.join(' · '),
    include: true,
    photoDataUrls: photoUrls,
  }
}

function sheetRowsFromWorkbook(wb: XLSX.WorkBook): Record<string, unknown>[] {
  const name = wb.SheetNames[0]
  if (!name) return []
  const sheet = wb.Sheets[name]
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, unknown>[]
}

export function parseMlsRows(rows: Record<string, unknown>[]): ExcelParseResult {
  const drafts: MlsDraft[] = []
  let skippedNoMls = 0
  let skippedStatus = 0
  for (let i = 0; i < rows.length; i++) {
    const result = rowToDraft(rows[i], i)
    if (result === 'no_mls') {
      skippedNoMls += 1
      continue
    }
    if (result === 'bad_status') {
      skippedStatus += 1
      continue
    }
    drafts.push(result)
  }
  return { drafts, skippedNoMls, skippedStatus, totalRows: rows.length }
}

/** Parse .xlsx / .xls / .csv File in the browser (or Node Buffer via File-like). */
export async function parseMlsSpreadsheet(file: File): Promise<ExcelParseResult> {
  if (!file) throw new Error('No spreadsheet selected.')
  if (file.size === 0) throw new Error('File is empty.')
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('File is larger than 25 MB. Export a smaller sheet or CSV.')
  }

  const buf = await file.arrayBuffer()
  const name = (file.name || '').toLowerCase()
  let wb: XLSX.WorkBook
  try {
    if (name.endsWith('.csv')) {
      const text = new TextDecoder('utf-8').decode(buf)
      wb = XLSX.read(text, { type: 'string', raw: false })
    } else {
      wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false })
    }
  } catch (err) {
    throw new Error(
      `Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const rows = sheetRowsFromWorkbook(wb)
  if (!rows.length) {
    throw new Error('Spreadsheet has no data rows (expected header row 1).')
  }

  const result = parseMlsRows(rows)
  if (!result.drafts.length) {
    throw new Error(
      `No publishable MLS rows found (${result.totalRows} data row(s); skipped no-MLS: ${result.skippedNoMls}, closed/sold/etc: ${result.skippedStatus}).`,
    )
  }
  return result
}
