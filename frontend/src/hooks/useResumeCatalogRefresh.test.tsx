// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useResumeCatalogRefresh } from './useResumeCatalogRefresh'
import {
  resetResumeSyncForTests,
  triggerResumeSyncForTests,
} from '@/lib/resumeSync'

function Probe({
  active,
  onRefresh,
}: {
  active: boolean
  onRefresh: () => void | Promise<void>
}) {
  useResumeCatalogRefresh({ active, onRefresh })
  return null
}

async function flushResumeSync() {
  await act(async () => {
    triggerResumeSyncForTests()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('useResumeCatalogRefresh', () => {
  beforeEach(() => {
    resetResumeSyncForTests()
  })

  afterEach(() => {
    cleanup()
    resetResumeSyncForTests()
  })

  it('refreshes when active and a resume burst arrives', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Probe active onRefresh={onRefresh} />)

    await flushResumeSync()
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })

  it('defers refresh for a hidden tab until it becomes active', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const view = render(<Probe active={false} onRefresh={onRefresh} />)

    await flushResumeSync()
    expect(onRefresh).not.toHaveBeenCalled()

    view.rerender(<Probe active onRefresh={onRefresh} />)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })

  it('runs a queued refresh after the in-flight refresh completes', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    const onRefresh = vi.fn().mockImplementation(() => gate)
    render(<Probe active onRefresh={onRefresh} />)

    await flushResumeSync()
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    await act(async () => {
      triggerResumeSyncForTests()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
      await gate
      await Promise.resolve()
    })

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2))
  })

  it('coalesces duplicate generations for the same burst', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Probe active onRefresh={onRefresh} />)

    await act(async () => {
      triggerResumeSyncForTests()
      triggerResumeSyncForTests()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })

  it('tracks active changes through rerenders', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    function Harness() {
      const [active, setActive] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setActive(true)}>show</button>
          <Probe active={active} onRefresh={onRefresh} />
        </>
      )
    }
    const view = render(<Harness />)

    await flushResumeSync()
    expect(onRefresh).not.toHaveBeenCalled()

    act(() => {
      view.getByRole('button', { name: 'show' }).click()
    })
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })
})
