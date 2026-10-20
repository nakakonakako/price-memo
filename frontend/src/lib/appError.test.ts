import { describe, expect, it } from 'vitest'
import {
  MISSING_TARGET_MESSAGE,
  RECORD_FOLDER_MISSING_MESSAGE,
  assertRowsAffected,
  createMissingTargetError,
  isMissingTargetError,
  isPriceRecordFolderFkViolation,
  normalizeCreateRecordError,
  normalizeMutationError,
} from './appError'

describe('appError', () => {
  it('creates MissingTarget app errors', () => {
    const err = createMissingTargetError()
    expect(isMissingTargetError(err)).toBe(true)
    expect(err.message).toBe(MISSING_TARGET_MESSAGE)
  })

  it('uses concise missing-target copy without overlapping refresh or login guidance', () => {
    expect(MISSING_TARGET_MESSAGE).not.toMatch(/ログイン|再取得|権限/)
    expect(RECORD_FOLDER_MISSING_MESSAGE).not.toMatch(/フォルダ|一覧を更新/)
    expect(MISSING_TARGET_MESSAGE).not.toMatch(RECORD_FOLDER_MISSING_MESSAGE)
  })

  it('maps PGRST116 and P0002 to MissingTarget', () => {
    expect(
      isMissingTargetError(
        normalizeMutationError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }),
      ),
    ).toBe(true)
    expect(
      isMissingTargetError(
        normalizeMutationError({ code: 'P0002', message: 'no data found' }),
      ),
    ).toBe(true)
  })

  it('passes through unrelated errors', () => {
    const raw = { code: '23505', message: 'duplicate' }
    expect(normalizeMutationError(raw)).toBe(raw)
  })

  it('throws when delete/update affected zero rows', () => {
    expect(() => assertRowsAffected([])).toThrowError(MISSING_TARGET_MESSAGE)
    expect(() => assertRowsAffected(null)).toThrowError(MISSING_TARGET_MESSAGE)
  })

  it('detects price_records folder foreign key violations only', () => {
    expect(
      isPriceRecordFolderFkViolation({
        code: '23503',
        message: 'insert or update on table "price_records" violates foreign key constraint "price_records_folder_id_fkey"',
      }),
    ).toBe(true)
    expect(
      isPriceRecordFolderFkViolation({
        code: '23503',
        message: 'violates foreign key constraint "price_records_receipt_item_id_fkey"',
      }),
    ).toBe(false)
  })

  it('maps createRecord folder FK violations to folder-missing copy', () => {
    const err = normalizeCreateRecordError({
      code: '23503',
      details: 'Key (folder_id)=(x) is not present in table "price_folders".',
    })
    expect(isMissingTargetError(err)).toBe(true)
    if (isMissingTargetError(err)) {
      expect(err.message).toBe(RECORD_FOLDER_MISSING_MESSAGE)
    }
  })
})
