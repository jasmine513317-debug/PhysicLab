export function formatNumber(value:number, significantDigits=6):string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const magnitude = Math.abs(value)
  if (magnitude < 0.0001 || magnitude >= 1_000_000) return value.toExponential(3)
  return Number(value.toPrecision(significantDigits)).toString()
}
