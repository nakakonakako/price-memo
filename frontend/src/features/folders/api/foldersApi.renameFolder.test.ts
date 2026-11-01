import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isMissingTargetError } from '@/lib/appError'

const single = vi.fn()
const select = vi.fn()
const eq = vi.fn()
const update = vi.fn()
const from = vi.fn()
const bumpFoldersRevision = vi.fn()

vi.mock('@/lib/catalogSync', () => ({
  bumpFoldersRevision: () => bumpFoldersRevision(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}))

import { renameFolder } from './foldersApi'

describe('renameFolder', () => {
  beforeEach(() => {
    single.mockReset()
    select.mockReset()
    eq.mockReset()
    update.mockReset()
    from.mockReset()
    bumpFoldersRevision.mockReset()

    eq.mockReturnValue({ select })
    select.mockReturnValue({ single })
    update.mockReturnValue({ eq })
    from.mockReturnValue({ update })
  })

  it('maps zero-row updates to MissingTarget', async () => {
    single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })

    await expect(renameFolder('folder-1', 'Renamed', null)).rejects.toSatisfy(
      (err: unknown) => isMissingTargetError(err),
    )
    expect(bumpFoldersRevision).not.toHaveBeenCalled()
  })

  it('normalizes an empty reading to null on rename', async () => {
    single.mockResolvedValue({ data: { id: 'folder-1' }, error: null })

    await renameFolder('folder-1', 'Renamed', '   ')

    expect(update).toHaveBeenCalledWith({
      name: 'Renamed',
      reading: null,
      updated_at: expect.any(String),
    })
  })
})
