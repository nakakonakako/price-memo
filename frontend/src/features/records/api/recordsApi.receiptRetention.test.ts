import { describe, expect, it, vi } from 'vitest'
import { recordToCopyFormState, recordToFormState, parseRecordForm } from '../components/recordFormUtils'
import type { PriceRecord, PriceRecordInput } from '../types'

const { from, getUser } = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from, auth: { getUser } } }))
vi.mock('@/features/stores/api/storesCache', () => ({ ensureStore: async (name: string) => name }))
vi.mock('@/lib/catalogSync', () => ({ bumpRecordsRevision: vi.fn() }))
import { createRecord, updateRecord } from './recordsApi'

const record: PriceRecord = {
  id: 'record', user_id: 'user', folder_id: 'folder', recorded_at: '2026-01-01',
  store_name: 'store', price: 100, amount: 2, unit: 'g', note: null,
  receipt_item_id: 'existing-receipt', label_image_path: null, sort_order: 0,
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

describe('record receipt reference retention', () => {
  it('edits a linked record without sending a reference update', async () => {
    const update = vi.fn().mockReturnValue({ eq: () => ({ select: () => ({ single: async () => ({ data: record, error: null }) }) }) })
    from.mockReturnValue({ update })
    const input = parseRecordForm('folder', { ...recordToFormState(record), price: '120' }) as PriceRecordInput
    const result = await updateRecord(record.id, input)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ price: 120 }))
    expect(update.mock.calls[0][0]).not.toHaveProperty('receipt_item_id')
    expect(result.receipt_item_id).toBe('existing-receipt')
  })

  it.each(['new', 'copy'])('creates a %s record without copying a reference', async (kind) => {
    getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: null })
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { ...record, receipt_item_id: null }, error: null }) }) })
    from.mockReturnValue({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }), insert })
    const input = kind === 'copy' ? parseRecordForm('folder', recordToCopyFormState(record)) as PriceRecordInput : { folder_id: 'folder', recorded_at: '2026-01-01', store_name: 'store', price: 100, amount: 2, unit: 'g' }
    await createRecord(input)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ receipt_item_id: null, price: 100 }))
  })
})
