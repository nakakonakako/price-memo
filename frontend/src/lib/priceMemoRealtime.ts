import { supabase } from '@/lib/supabase'
import {
  isPriceMemoOperation,
  isPriceMemoTable,
  PRICE_MEMO_TABLES,
  type PriceMemoTable,
} from './externalSync'

type Listener = (table: PriceMemoTable) => void
type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'

type SubscriptionLease = {
  userId: string
  channel: ReturnType<typeof supabase.channel>
  listeners: Set<Listener>
  leaseCount: number
  cleanupTimer: ReturnType<typeof setTimeout> | null
  active: boolean
  subscribed: boolean
}

let currentLease: SubscriptionLease | null = null

function emitAllTables(lease: SubscriptionLease): void {
  for (const listener of lease.listeners) {
    for (const table of PRICE_MEMO_TABLES) listener(table)
  }
}

function disposeLease(lease: SubscriptionLease): void {
  lease.active = false
  lease.listeners.clear()
  if (lease.cleanupTimer !== null) clearTimeout(lease.cleanupTimer)
  lease.cleanupTimer = null
  if (currentLease === lease) currentLease = null
  void supabase.removeChannel(lease.channel)
}

function createLease(userId: string, listener: Listener): SubscriptionLease {
  const normalizedUserId = userId.toLowerCase()
  const lease: SubscriptionLease = {
    userId: normalizedUserId,
    channel: supabase.channel(`price-memo:user:${normalizedUserId}`, {
      config: { private: true },
    }),
    listeners: new Set([listener]),
    leaseCount: 1,
    cleanupTimer: null,
    active: true,
    subscribed: false,
  }

  lease.channel
    .on('broadcast', { event: 'price-memo-change' }, (message) => {
      if (!lease.active) return
      const payload: unknown = message.payload
      if (typeof payload !== 'object' || payload === null) return
      const table = Reflect.get(payload, 'table')
      const operation = Reflect.get(payload, 'operation')
      if (!isPriceMemoTable(table) || !isPriceMemoOperation(operation)) return
      for (const subscribedListener of lease.listeners) {
        subscribedListener(table)
      }
    })
    .subscribe((status: ChannelStatus) => {
      if (!lease.active) return
      lease.subscribed = status === 'SUBSCRIBED'
      if (lease.subscribed) emitAllTables(lease)
    })

  currentLease = lease
  return lease
}

/** One private user channel shared across StrictMode effect replays. */
export function subscribePriceMemoRealtime(
  userId: string,
  listener: Listener,
): () => void {
  let lease = currentLease
  if (lease && lease.userId !== userId.toLowerCase()) {
    disposeLease(lease)
    lease = null
  }

  if (lease) {
    if (lease.cleanupTimer !== null) clearTimeout(lease.cleanupTimer)
    lease.cleanupTimer = null
    lease.leaseCount += 1
    lease.listeners.add(listener)
    if (lease.subscribed) {
      for (const table of PRICE_MEMO_TABLES) listener(table)
    }
  } else {
    lease = createLease(userId, listener)
  }

  const activeLease = lease
  let released = false
  return () => {
    if (released) return
    released = true
    activeLease.listeners.delete(listener)
    activeLease.leaseCount -= 1
    if (activeLease.leaseCount !== 0 || !activeLease.active) return

    // React StrictMode replays effects synchronously; defer final removal by one turn.
    activeLease.cleanupTimer = setTimeout(() => disposeLease(activeLease), 0)
  }
}

/** @internal test helper */
export function resetPriceMemoRealtimeForTests(): void {
  if (currentLease) disposeLease(currentLease)
}
