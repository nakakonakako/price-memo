import { describe, expect, it } from 'vitest'
import { createVisibleLoadTracker } from './visibleLoad'

describe('createVisibleLoadTracker', () => {
  it('ends only after all visible loads finish', () => {
    const tracker = createVisibleLoadTracker()
    tracker.begin()
    tracker.begin()
    expect(tracker.end()).toBe(false)
    expect(tracker.end()).toBe(true)
    expect(tracker.end()).toBe(true)
  })

  it('resets the counter', () => {
    const tracker = createVisibleLoadTracker()
    tracker.begin()
    tracker.reset()
    expect(tracker.end()).toBe(true)
  })
})
