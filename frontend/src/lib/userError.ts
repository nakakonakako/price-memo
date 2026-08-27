function readField(err: unknown, key: string): string {
  if (err && typeof err === 'object' && key in err) {
    const v = (err as Record<string, unknown>)[key]
    if (typeof v === 'string') return v
  }
  return ''
}

function rawMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return readField(err, 'message')
}

function looksLikeAppMessage(msg: string): boolean {
  if (!msg) return false
  // Japanese copy we throw ourselves
  if (/[ぁ-んァ-ヶ一-龥]/.test(msg) && !/violates|constraint|PGRST|SQL/i.test(msg)) {
    return true
  }
  return false
}

/**
 * Map API / DB errors to short Japanese explanations for UI.
 * Technical Postgres / PostgREST messages are never shown as-is.
 */
export function toUserMessage(
  err: unknown,
  fallback = '操作に失敗しました。しばらくしてからもう一度お試しください。',
): string {
  const code = readField(err, 'code')
  const msg = rawMessage(err)
  const details = readField(err, 'details')
  const blob = `${code} ${msg} ${details}`

  if (
    code === '23505' ||
    /duplicate key|unique constraint|already exists/i.test(blob)
  ) {
    if (/price_folders|user_id_name|folders.*name/i.test(blob)) {
      return '同じ名前のフォルダがすでにあります。別の名前にするか、既存のフォルダを選んでください。'
    }
    return 'すでに同じ内容が登録されています。'
  }

  if (code === '23503' || /foreign key/i.test(blob)) {
    return '関連するデータが見つからないため、操作できませんでした。'
  }

  if (
    code === '42501' ||
    /permission denied|row-level security|JWT|not authenticated/i.test(blob)
  ) {
    return '権限がないか、ログインの有効期限が切れている可能性があります。再度ログインしてください。'
  }

  if (/Failed to fetch|NetworkError|network/i.test(blob)) {
    return '通信に失敗しました。接続を確認してからもう一度お試しください。'
  }

  if (looksLikeAppMessage(msg)) return msg

  return fallback
}
