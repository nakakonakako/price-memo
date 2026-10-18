import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MISSING_TARGET_MESSAGE } from '@/lib/appError'
import { applyAuthIdentity, resetAuthIdentityForTests } from '@/lib/authIdentity'

const deleteSelect = vi.fn()
const from = vi.fn()
const publishFolderDeleted = vi.fn()
const bumpFoldersRevision = vi.fn()

vi.mock('@/lib/catalogSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalogSync')>()
  return {
    ...actual,
    publishFolderDeleted: (event: { folderId: string; userId: string }) =>
      publishFolderDeleted(event),
    bumpFoldersRevision: () => bumpFoldersRevision(),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}))

import { deleteFolder } from './foldersApi'

describe('deleteFolder', () => {
  beforeEach(() => {
    resetAuthIdentityForTests()
    from.mockReset()
    deleteSelect.mockReset()
    publishFolderDeleted.mockReset()
    bumpFoldersRevision.mockReset()

    applyAuthIdentity({
      access_token: 'token-a',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-a',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'a@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    })

    deleteSelect.mockResolvedValue({ data: [{ id: 'folder-1' }], error: null })
    from.mockReturnValue({
      delete: () => ({
        eq: () => ({
          select: (...args: unknown[]) => deleteSelect(...args),
        }),
      }),
    })
  })

  afterEach(() => {
    resetAuthIdentityForTests()
  })

  it('notifies folder delete and bumps folders revision after DB success', async () => {
    await deleteFolder('folder-1')

    expect(from).toHaveBeenCalledWith('price_folders')
    expect(deleteSelect).toHaveBeenCalledWith('id')
    expect(publishFolderDeleted).toHaveBeenCalledWith({
      folderId: 'folder-1',
      userId: 'user-a',
    })
    expect(bumpFoldersRevision).not.toHaveBeenCalled()
  })

  it('does not notify when zero rows are deleted', async () => {
    deleteSelect.mockResolvedValueOnce({ data: [], error: null })

    await expect(deleteFolder('folder-1')).rejects.toThrow(MISSING_TARGET_MESSAGE)
    expect(publishFolderDeleted).not.toHaveBeenCalled()
    expect(bumpFoldersRevision).not.toHaveBeenCalled()
  })

  it('does not notify or bump revision when DB delete fails', async () => {
    deleteSelect.mockResolvedValueOnce({ error: { message: 'db down' } })

    await expect(deleteFolder('folder-1')).rejects.toEqual({ message: 'db down' })
    expect(publishFolderDeleted).not.toHaveBeenCalled()
    expect(bumpFoldersRevision).not.toHaveBeenCalled()
  })

  it('does not notify when auth user changed before delete completes', async () => {
    deleteSelect.mockImplementationOnce(async () => {
      applyAuthIdentity({
        access_token: 'token-b',
        refresh_token: 'refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'user-b',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'b@example.com',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      })
      return { data: [{ id: 'folder-1' }], error: null }
    })

    await deleteFolder('folder-1')

    expect(publishFolderDeleted).not.toHaveBeenCalled()
    expect(bumpFoldersRevision).not.toHaveBeenCalled()
  })
})
