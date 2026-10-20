/** User-facing copy when a mutation matched zero rows or the target is gone. */
export const MISSING_TARGET_MESSAGE =
  '対象を確認できませんでした。もう一度お試しください。'

export const RECORD_FOLDER_MISSING_MESSAGE =
  '選択した品目が見つかりません。もう一度お試しください。'

export type AppErrorKind = 'MissingTarget'

export class AppError extends Error {
  readonly kind: AppErrorKind

  constructor(kind: AppErrorKind, message: string) {
    super(message)
    this.name = 'AppError'
    this.kind = kind
  }
}

export function createMissingTargetError(
  message = MISSING_TARGET_MESSAGE,
): AppError {
  return new AppError('MissingTarget', message)
}

export function isMissingTargetError(err: unknown): err is AppError {
  return err instanceof AppError && err.kind === 'MissingTarget'
}

function readErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string') return code
  }
  return ''
}

/** Map PostgREST / RPC no-row outcomes to a typed missing-target error. */
export function normalizeMutationError(err: unknown): unknown {
  const code = readErrorCode(err)
  if (code === 'PGRST116' || code === 'P0002') {
    return createMissingTargetError()
  }
  return err
}

export function assertRowsAffected(
  rows: unknown[] | null | undefined,
  message = MISSING_TARGET_MESSAGE,
): void {
  if (!rows || rows.length === 0) {
    throw createMissingTargetError(message)
  }
}

export function isPriceRecordFolderFkViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = readErrorCode(err)
  if (code !== '23503') return false
  const message =
    typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : ''
  const details =
    typeof (err as { details?: unknown }).details === 'string'
      ? (err as { details: string }).details
      : ''
  const blob = `${message} ${details}`.toLowerCase()
  return (
    blob.includes('folder_id') ||
    blob.includes('price_folders') ||
    /price_records_folder/i.test(blob)
  )
}

export function normalizeCreateRecordError(err: unknown): unknown {
  if (isPriceRecordFolderFkViolation(err)) {
    return createMissingTargetError(RECORD_FOLDER_MISSING_MESSAGE)
  }
  return err
}
