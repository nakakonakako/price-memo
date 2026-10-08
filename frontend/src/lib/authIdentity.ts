import { resetStoresCacheForUser } from '@/features/stores/api/storesCache'
import { resetCatalogSync } from '@/lib/catalogSync'
import type { Session } from '@supabase/supabase-js'

let currentUserId: string | null = null

export function sessionUserId(session: Session | null): string | null {
  return session?.user?.id ?? null
}

/** Invalidate shared caches when the authenticated user id changes (not token refresh). */
export function applyAuthIdentity(session: Session | null): void {
  const nextUserId = sessionUserId(session)
  if (nextUserId === currentUserId) return
  currentUserId = nextUserId
  resetStoresCacheForUser(nextUserId)
  resetCatalogSync()
}

export function getCurrentAuthUserId(): string | null {
  return currentUserId
}

/** @internal test helper */
export function resetAuthIdentityForTests(): void {
  currentUserId = null
}
