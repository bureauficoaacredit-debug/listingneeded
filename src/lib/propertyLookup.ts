export type PropertyFacts = {
  found: boolean
  beds?: number | null
  baths?: number | null
  sqft?: number | null
  yearBuilt?: number | null
  matchedAddress?: string
  source?: string
  reason?: string
}

/** Public-record lookup (server API). Never throws — returns { found:false } on any problem. */
export async function lookupPropertyFacts(
  q: { address: string; city: string; state: string; zip: string },
  signal?: AbortSignal,
): Promise<PropertyFacts> {
  try {
    const res = await fetch('/api/property-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
      signal,
    })
    if (!res.ok) return { found: false }
    return (await res.json()) as PropertyFacts
  } catch {
    return { found: false }
  }
}
