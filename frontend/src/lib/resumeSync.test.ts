// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getResumeSyncGeneration,
  installResumeSyncListeners,
  resetResumeSyncForTests,
  subscribeResumeSync,
  triggerResumeSyncForTests,
} from './resumeSync'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

describe('resumeSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetResumeSyncForTests()
    setVisibility('visible')
  })

  afterEach(() => {
    resetResumeSyncForTests()
    vi.useRealTimers()
  })

  it('coalesces burst events into one generation increment', () => {
    const listener = vi.fn()
    subscribeResumeSync(listener)

    triggerResumeSyncForTests()
    triggerResumeSyncForTests()
    triggerResumeSyncForTests()

    expect(listener).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getResumeSyncGeneration()).toBe(1)
  })

  it('queues a resume burst that arrives during dispatch', () => {
    const listener = vi.fn()
    subscribeResumeSync((generation) => {
      listener(generation)
      if (generation === 1) {
        triggerResumeSyncForTests()
      }
    })

    triggerResumeSyncForTests()
    vi.runAllTimers()

    expect(listener).toHaveBeenCalledTimes(2)
    expect(getResumeSyncGeneration()).toBe(2)
  })

  it('notifies on visibilitychange from hidden to visible', () => {
    const teardown = installResumeSyncListeners()
    const listener = vi.fn()
    subscribeResumeSync(listener)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    vi.runAllTimers()
    expect(listener).toHaveBeenCalledTimes(1)
    teardown()
  })

  it('notifies on window focus when the document is visible', () => {
    const teardown = installResumeSyncListeners()
    const listener = vi.fn()
    subscribeResumeSync(listener)

    window.dispatchEvent(new Event('focus'))
    vi.runAllTimers()
    expect(listener).toHaveBeenCalledTimes(1)
    teardown()
  })

  it('notifies on persisted pageshow', () => {
    const teardown = installResumeSyncListeners()
    const listener = vi.fn()
    subscribeResumeSync(listener)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    vi.runAllTimers()
    expect(listener).toHaveBeenCalledTimes(1)
    teardown()
  })
})
