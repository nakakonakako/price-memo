import type { ReactNode } from 'react'
import { useGuideTheme } from './guideTheme'

/** 18px numbered dot placed in normal flow next to its target. */
export function GuideMarker({ n }: { n: number }) {
  const theme = useGuideTheme()
  return (
    <span
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-xs font-bold leading-none tabular-nums ${theme.marker}`}
      aria-hidden
    >
      {n}
    </span>
  )
}

export type GuideAnnotationItem = {
  n: number
  text: ReactNode
}

function GuideAnnotationItems({
  items,
  start,
}: {
  items: readonly GuideAnnotationItem[]
  start?: number
}) {
  return (
    <ol start={start} className="space-y-2">
      {items.map((item) => (
        <li key={item.n} className="flex min-w-0 items-start gap-2">
          <span className="mt-[3px]">
            <GuideMarker n={item.n} />
          </span>
          <span className="min-w-0 text-sm leading-snug text-stone-700">
            {item.text}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Explanations in normal flow. Single column on mobile; from sm the items are
 * split into two columns (1..ceil(n/2), then the rest). The two groups are
 * sequential in the DOM so reading order stays numeric.
 */
export function GuideAnnotationList({
  items,
  label,
  singleColumn = false,
}: {
  items: readonly GuideAnnotationItem[]
  label: string
  singleColumn?: boolean
}) {
  if (singleColumn || items.length < 2) {
    return (
      <div role="group" aria-label={label} className="mt-3">
        <GuideAnnotationItems items={items} />
      </div>
    )
  }
  const split = Math.ceil(items.length / 2)
  return (
    <div
      role="group"
      aria-label={label}
      className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 sm:items-start"
    >
      <GuideAnnotationItems items={items.slice(0, split)} />
      <GuideAnnotationItems items={items.slice(split)} start={items[split].n} />
    </div>
  )
}

/** Before -> after diagram: stacks vertically on mobile, horizontal from sm. */
export function GuideBeforeAfter({
  before,
  after,
  beforeLabel = '操作前',
  afterLabel = '操作後',
  actionLabel,
}: {
  before: ReactNode
  after: ReactNode
  beforeLabel?: string
  afterLabel?: string
  actionLabel: string
}) {
  const theme = useGuideTheme()
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-2">
      <DiagramPanel label={beforeLabel}>{before}</DiagramPanel>
      <div
        className={`flex shrink-0 flex-row items-center justify-center gap-1.5 text-xs font-medium sm:flex-col sm:gap-0 ${theme.emphasis}`}
        aria-hidden
      >
        <span className="text-lg leading-none sm:hidden">↓</span>
        <span className="hidden text-xl leading-none sm:inline">→</span>
        <span className="sm:mt-0.5 sm:max-w-[4.5rem] sm:text-center">
          {actionLabel}
        </span>
      </div>
      <DiagramPanel label={afterLabel}>{after}</DiagramPanel>
    </div>
  )
}

function DiagramPanel({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      {children}
    </div>
  )
}

export function GuideDeviceFrame({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2.5 rounded-lg border border-stone-200 bg-white/70 p-2.5 sm:p-3">
      <p className="text-xs font-semibold text-stone-600">{label}</p>
      {children}
    </div>
  )
}
