import { describe, expect, it } from 'vitest'
import { parseTrialPriceInput, trialDisplayValue } from './stats'

describe('parseTrialPriceInput', () => {
  it('returns null for empty price input', () => {
    expect(parseTrialPriceInput('')).toBeNull()
    expect(parseTrialPriceInput('   ')).toBeNull()
  })

  it('accepts explicit zero', () => {
    expect(parseTrialPriceInput('0')).toBe(0)
  })
})

describe('trialDisplayValue with parsed price', () => {
  it('computes trial unit price for explicit zero yen', () => {
    const price = parseTrialPriceInput('0')
    expect(price).toBe(0)
    expect(trialDisplayValue(price!, 100, 'g', 'per_100')).toBe(0)
  })

  it('does not treat empty input as zero yen', () => {
    expect(parseTrialPriceInput('')).toBeNull()
  })
})
