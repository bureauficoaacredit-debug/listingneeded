/** v68: shared number input for the calculators. */
export function NumField({ label, value, onChange, prefix, suffix, step = 'any', hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
  step?: string
  hint?: string
}) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <span className="calc-input">
        {prefix ? <em>{prefix}</em> : null}
        <input type="number" inputMode="decimal" step={step} min={0} value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix ? <em>{suffix}</em> : null}
      </span>
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}
export const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}
