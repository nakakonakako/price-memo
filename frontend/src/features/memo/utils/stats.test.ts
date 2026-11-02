import { describe, expect, it } from 'vitest'
import {
  comparisonDiffFontClass,
  formatComparisonDiffLabel,
  parseTrialPriceInput,
  trialDisplayValue,
} from './stats'

describe('formatComparisonDiffLabel', () => {
  it('uses explicit yen for equal diffs', () => {
    expect(formatComparisonDiffLabel(0)).toBe('±0円')
    expect(formatComparisonDiffLabel(0.002)).toBe('±0円')
  })

  it('keeps signed yen and direction for non-zero diffs', () => {
    expect(formatComparisonDiffLabel(75)).toBe('+75円↑')
    expect(formatComparisonDiffLabel(-12.5)).toBe('-12.5円↓')
  })

  it('formats large positive diffs on one label string', () => {
    expect(formatComparisonDiffLabel(1234520.2)).toBe('+1,234,520.2円↑')
  })
})

describe('comparisonDiffFontClass', () => {
  it('shrinks font class for long mobile labels', () => {
    const short = comparisonDiffFontClass('+75円↑', false)
    const long = comparisonDiffFontClass('+1,234,520.2円↑', false)
    expect(short).toContain('text-base')
    expect(long).toContain('text-[10px]')
    expect(long).toContain('whitespace-nowrap')
  })
})

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
