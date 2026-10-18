// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { requestExternalSync, resetExternalSyncForTests } from '@/lib/externalSync'
import { useExternalCatalogRefresh } from './useExternalCatalogRefresh'

function Probe({
  active,
  onRefresh,
}: {
  active: boolean
  onRefresh: (tables: ReadonlySet<'price_records'>) => void | Promise<void>
}) {
  useExternalCatalogRefresh({
    active,
    tables: ['price_records'],
    onRefresh,
  })
  return null
}

async function sendRecordChange() {
  await act(async () => {
    requestExternalSync(['price_records'])
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}

describe('useExternalCatalogRefresh', () => {
  afterEach(() => {
    cleanup()
    resetExternalSyncForTests()
  })

  it('defers a hidden keep-alive tab until it becomes active', async () => {
    const onRefresh = vi.fn()
    const view = render(<Probe active={false} onRefresh={onRefresh} />)

    await sendRecordChange()
    expect(onRefresh).not.toHaveBeenCalled()

    view.rerender(<Probe active onRefresh={onRefresh} />)
    await act(async () => Promise.resolve())
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('queues an invalidation received during a refresh', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const onRefresh = vi.fn().mockImplementationOnce(() => gate).mockResolvedValue(undefined)
    render(<Probe active onRefresh={onRefresh} />)

    await sendRecordChange()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await sendRecordChange()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
      await gate
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('does not remount form drafts when server refreshes run', async () => {
    const onRefresh = vi.fn()
    function FormProbe() {
      const [draft, setDraft] = useState('draft')
      useExternalCatalogRefresh({
        active: true,
        tables: ['price_records'],
        onRefresh,
      })
      return (
        <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
      )
    }
    const view = render(<FormProbe />)
    const input = view.getByLabelText('draft') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'in progress' } })
    await sendRecordChange()

    expect((view.getByLabelText('draft') as HTMLInputElement).value).toBe('in progress')
  })
})
