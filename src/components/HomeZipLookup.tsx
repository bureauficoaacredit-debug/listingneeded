import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import NeighborhoodFacts from './NeighborhoodFacts'

/**
 * v53 homepage "Explore a neighborhood": type a 5-digit ZIP and see the same v52 Neighborhood facts
 * (Census ACS tiles + nearest public schools from the ZIP center) with a link to homes in that ZIP.
 * Nothing is fetched until a ZIP is submitted.
 */
export default function HomeZipLookup() {
  const [draft, setDraft] = useState('')
  const [zip, setZip] = useState('')
  const [error, setError] = useState('')
  const [empty, setEmpty] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const z = draft.trim()
    if (!/^\d{5}$/.test(z)) {
      setError('Enter a 5-digit ZIP code, like 06824.')
      return
    }
    setError('')
    setEmpty(false)
    setZip(z)
  }

  return (
    <section className="home-zip" aria-labelledby="home-zip-title">
      <div className="home-zip-head">
        <div>
          <h2 id="home-zip-title">Explore a neighborhood</h2>
          <p className="meta">Income, home values, rents and nearby public schools for any ZIP code.</p>
        </div>
        <form className="home-zip-form" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor="home-zip-input">ZIP code</label>
          <input
            id="home-zip-input"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="\d{5}"
            maxLength={5}
            placeholder="ZIP code"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.replace(/\D/g, '').slice(0, 5))
              if (error) setError('')
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'home-zip-error' : undefined}
          />
          <button type="submit" className="btn">Explore</button>
        </form>
      </div>
      {error ? <p id="home-zip-error" className="home-zip-error" role="alert">{error}</p> : null}
      {zip && empty ? (
        <p className="home-zip-error" role="status">
          No public data found for ZIP {zip}. <Link to={`/browse?zip=${zip}`}>See homes in this ZIP</Link>
        </p>
      ) : null}
      {zip && !empty ? (
        <NeighborhoodFacts
          key={zip}
          zip={zip}
          onEmpty={() => setEmpty(true)}
          actions={
            <Link className="btn" to={`/browse?zip=${zip}`}>
              See homes in {zip}
            </Link>
          }
        />
      ) : null}
    </section>
  )
}
