import { describe, expect, it } from 'vitest'
import { formatNumber } from '../src/numberFormat'

describe('formatNumber', () => {
  it('formats ordinary, zero and negative values', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(-0)).toBe('0')
    expect(formatNumber(12.3456789)).toBe('12.3457')
    expect(formatNumber(-0.125)).toBe('-0.125')
  })

  it('uses scientific notation for very small and very large values', () => {
    expect(formatNumber(0.00000123)).toBe('1.230e-6')
    expect(formatNumber(-0.00009999)).toBe('-9.999e-5')
    expect(formatNumber(123456789)).toBe('1.235e+8')
  })

  it('keeps values at the notation thresholds in ordinary form', () => {
    expect(formatNumber(0.0001)).toBe('0.0001')
    expect(formatNumber(999999.9)).toBe('1000000')
    expect(formatNumber(-999999.9)).toBe('-1000000')
  })

  it('supports an explicit significant digit count', () => {
    expect(formatNumber(12.3456789, 3)).toBe('12.3')
    expect(formatNumber(12.3456789, 9)).toBe('12.3456789')
  })

  it('renders non-finite values as unavailable', () => {
    expect(formatNumber(Number.NaN)).toBe('—')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('—')
  })
})
