import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChartIcon } from '@/components/icons/ChartIcon'
import { CopyIcon } from '@/components/icons/CopyIcon'
import { PencilIcon } from '@/components/icons/PencilIcon'
import { SearchIcon } from '@/components/icons/SearchIcon'

type GuideSection = {
  id: string
  title: string
  englishTitle: string
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'features',
    title: 'このアプリでできること',
    englishTitle: 'Overview',
  },
  { id: 'shopping-memo', title: '買い物メモ', englishTitle: 'Shopping memo' },
  { id: 'folders', title: 'フォルダ', englishTitle: 'Folders' },
  { id: 'price-trends', title: '値段推移', englishTitle: 'Price trends' },
]

const SECTION_SCROLL_MARGIN =
  'scroll-mt-[var(--app-header-h,7.75rem)]'

export function HowToPage() {
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0].id)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const sections = GUIDE_SECTIONS.map((s) => document.getElementById(s.id)).filter(
      Boolean,
    ) as HTMLElement[]

    if (sections.length === 0) return

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -55% 0px',
        threshold: 0,
      },
    )

    for (const section of sections) {
      observerRef.current.observe(section)
    }

    return () => observerRef.current?.disconnect()
  }, [])

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div
      className="text-stone-800 lg:relative lg:left-1/2 lg:right-1/2 lg:-ml-[50vw] lg:-mr-[50vw] lg:w-screen lg:px-4"
    >
      <div className="lg:mx-auto lg:flex lg:max-w-[68rem] lg:gap-10 xl:gap-12">
        <GuideStickyNav activeId={activeId} onNavigate={scrollToSection} />

        <div className="min-w-0 flex-1 space-y-10 lg:max-w-[42rem] lg:space-y-12">
          <GuideMobileToc onNavigate={scrollToSection} />

          <GuideSectionShell section={GUIDE_SECTIONS[0]} surface="warm">
            <GuideLead>
              買い物の品目をリスト化し、店頭で単価を比べ、記録をフォルダやグラフで振り返るためのアプリです。
            </GuideLead>
            <div className="space-y-2.5">
              <FeatureTile
                marker="list"
                title="買い物リストを作る"
                body="比較したい品目をメモに並べ、店頭で迷わず選べます。"
              />
              <FeatureTile
                marker="compare"
                title="値段と内容量で単価を比較"
                body="入力した価格と量から単価を計算し、平均・最安・直近と比べられます。"
              />
              <FeatureTile
                marker="history"
                title="フォルダと値段推移で履歴を振り返る"
                body="品目や店舗ごとに記録をまとめ、グラフで値段の変化を確認できます。"
              />
            </div>
          </GuideSectionShell>

          <GuideSectionShell section={GUIDE_SECTIONS[1]} surface="neutral">
            <GuideLead>
              買う品目のリストとして使い、店頭で価格を比べながら新しい品目を追加し、その場で記録を残せます。
            </GuideLead>

            <div>
              <div className="relative">
                <MockOpenedMemoCard />
                <GuideCallout
                  className="max-sm:hidden right-2 top-[4.5rem] sm:right-4"
                  arrow="top"
                >
                  平均・最安・直近
                </GuideCallout>
                <GuideCallout
                  className="max-sm:hidden left-2 top-[7.75rem] sm:left-4"
                  arrow="top"
                >
                  店名で絞るとその店の記録だけ集計
                </GuideCallout>
                <GuideCallout
                  className="max-sm:hidden right-1 top-3 sm:right-2"
                  arrow="right"
                >
                  開いたときだけ表示
                </GuideCallout>
                <GuideCallout
                  className="max-sm:hidden bottom-14 right-2 sm:bottom-16 sm:right-4"
                  arrow="bottom"
                >
                  入力を統計に保存
                </GuideCallout>
              </div>
              <MemoCardMobileLegend />
            </div>

            <div className="border-t border-dotted border-stone-300/80 pt-5">
              <p className="mb-3 text-xs font-medium tracking-wide text-stone-500">
                端末ごとの操作
              </p>
              <DeviceBehaviorPair
                pc={
                  <DeviceFrame label="PC">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 rounded border border-stone-200 bg-white px-2 py-1.5">
                        <span className="text-[10px] text-stone-400">⠿</span>
                        <span className="flex-1 truncate text-xs font-medium text-stone-800">
                          牛乳
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-500">
                        ドラッグで並べ替え
                      </p>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 rounded border border-dashed border-stone-300 bg-stone-50 px-2 py-1 text-center text-[10px] text-stone-400">
                          ゴミ箱へドロップ
                        </div>
                        <span className="text-lg text-stone-400">🗑</span>
                      </div>
                    </div>
                  </DeviceFrame>
                }
                mobile={
                  <DeviceFrame label="スマホ">
                    <div className="relative overflow-hidden rounded border border-stone-200 bg-white">
                      <div className="flex items-center px-2 py-1.5">
                        <span className="flex-1 truncate text-xs font-medium text-stone-800">
                          牛乳
                        </span>
                      </div>
                      <div
                        className="absolute inset-y-0 right-0 flex w-1/3 items-center justify-center bg-red-50 text-[10px] text-red-600"
                        style={{ transform: 'translateX(30%)' }}
                      >
                        削除
                      </div>
                      <p className="border-t border-stone-100 px-2 py-1 text-[10px] text-stone-500">
                        左スワイプでメモから外す
                      </p>
                    </div>
                  </DeviceFrame>
                }
              />
            </div>
          </GuideSectionShell>

          <GuideSectionShell section={GUIDE_SECTIONS[2]} surface="amber">
            <GuideLead>
              品目名フォルダは商品ごと、店名フォルダは店舗ごとに記録をまとめます。
            </GuideLead>

            <div className="relative space-y-4">
              <div className="flex items-start gap-2">
                <span
                  className="pointer-events-none inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600"
                  aria-hidden
                >
                  <SearchIcon />
                </span>
                <GuideCallout className="static" arrow="none">
                  品目名と店名を横断検索
                </GuideCallout>
              </div>

              <div className="relative">
                <MockFolderCardAnnotated />
              </div>

              <div className="border-t border-dotted border-stone-300/80 pt-4">
                <p className="mb-2 text-xs font-medium text-stone-500">読み仮名</p>
                <MockReadingKana />
              </div>

              <div className="border-t border-dotted border-stone-300/80 pt-4">
                <p className="mb-3 text-xs font-medium tracking-wide text-stone-500">
                  削除操作
                </p>
                <DeviceBehaviorPair
                  pc={
                    <DeviceFrame label="PC">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded border border-stone-200 bg-amber-50/80 px-2 py-1 text-xs text-stone-700">
                          牛乳
                        </div>
                        <span className="text-lg text-stone-400">🗑</span>
                      </div>
                      <p className="mt-1.5 text-[10px] text-stone-500">
                        ドラッグ中にゴミ箱が表示
                      </p>
                    </DeviceFrame>
                  }
                  mobile={
                    <DeviceFrame label="スマホ">
                      <div className="relative overflow-hidden rounded border border-amber-200 bg-amber-50/80">
                        <div className="px-2 py-1.5 text-xs text-stone-700">牛乳</div>
                        <div
                          className="absolute inset-y-0 right-0 flex w-1/3 items-center justify-center bg-red-50 text-[10px] text-red-600"
                          style={{ transform: 'translateX(25%)' }}
                        >
                          削除
                        </div>
                      </div>
                      <p className="mt-1.5 text-[10px] text-stone-500">
                        左スワイプで削除
                      </p>
                    </DeviceFrame>
                  }
                />
              </div>
            </div>
          </GuideSectionShell>

          <GuideSectionShell section={GUIDE_SECTIONS[3]} surface="cool">
            <GuideLead>
              品目ごとの単価推移をグラフで確認できます。店舗を選んで絞り込み、もう一度選ぶか「すべて表示」で全体に戻せます。
            </GuideLead>

            <div className="grid gap-3 sm:grid-cols-2">
              <TrendEntryCard label="PC">
                <div className="relative w-full">
                  <MockPcFolderRow />
                  <GuideCallout
                    className="-top-1 right-0 sm:-right-1"
                    arrow="right"
                  >
                    ここから開く
                  </GuideCallout>
                </div>
              </TrendEntryCard>
              <TrendEntryCard label="スマホ">
                <MockMobileTrendsEntry />
              </TrendEntryCard>
            </div>

            <div className="border-t border-dotted border-stone-300/80 pt-5">
              <MockTrendsScreen />
            </div>
          </GuideSectionShell>
        </div>
      </div>
    </div>
  )
}

function sectionNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}

function GuideStickyNav({
  activeId,
  onNavigate,
}: {
  activeId: string
  onNavigate: (id: string) => void
}) {
  return (
    <nav
      aria-label="目次"
      className="hidden shrink-0 lg:block lg:w-[9.5rem] xl:w-[10.5rem]"
    >
      <ol
        className="sticky top-[var(--app-header-h,7.75rem)] space-y-0 py-1"
      >
        {GUIDE_SECTIONS.map((section, index) => {
          const active = section.id === activeId
          const isLast = index === GUIDE_SECTIONS.length - 1
          const num = sectionNumber(index)
          return (
            <li key={section.id} className="relative">
              {!isLast && (
                <span
                  className={`absolute left-[0.72rem] top-7 bottom-0 w-px border-l border-dashed ${
                    active ? 'border-stone-400' : 'border-stone-300'
                  }`}
                  aria-hidden
                />
              )}
              <a
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  onNavigate(section.id)
                }}
                aria-current={active ? 'location' : undefined}
                className={`group flex items-start gap-2.5 py-2.5 pr-2 transition-colors ${
                  active ? 'text-stone-900' : 'text-stone-500'
                }`}
              >
                <span
                  className={`w-6 shrink-0 text-xs font-bold tabular-nums leading-5 transition-colors ${
                    active ? 'text-stone-900' : 'text-stone-400'
                  }`}
                >
                  {num}
                </span>
                <span
                  className={`min-w-0 text-sm leading-5 underline decoration-stone-300 underline-offset-[4px] transition-colors ${
                    active
                      ? 'font-semibold decoration-stone-700 decoration-2'
                      : 'decoration-1 group-hover:text-stone-700 group-hover:decoration-stone-400'
                  }`}
                >
                  {section.title}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function GuideMobileToc({
  onNavigate,
}: {
  onNavigate: (id: string) => void
}) {
  return (
    <nav aria-label="目次（コンパクト）" className="lg:hidden">
      <details className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-900">
          目次
        </summary>
        <ul className="space-y-1 border-t border-stone-100 px-4 py-3 text-sm">
          {GUIDE_SECTIONS.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault()
                  onNavigate(section.id)
                }}
                className="text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
              >
                <span className="mr-1.5 text-xs font-semibold tabular-nums text-stone-400">
                  {sectionNumber(index)}
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  )
}

const SURFACE_STYLES = {
  warm: 'border-stone-200/90 bg-gradient-to-b from-stone-50 to-white shadow-sm',
  neutral: 'border-stone-200/90 bg-white shadow-sm',
  amber: 'border-amber-200/60 bg-gradient-to-b from-amber-50/30 to-white shadow-sm',
  cool: 'border-stone-200/90 bg-gradient-to-b from-sky-50/20 to-white shadow-sm',
} as const

function GuideSectionShell({
  section,
  surface,
  children,
}: {
  section: GuideSection
  surface: keyof typeof SURFACE_STYLES
  children: ReactNode
}) {
  const index = GUIDE_SECTIONS.findIndex((s) => s.id === section.id)
  return (
    <section
      aria-labelledby={`${section.id}-heading`}
      className={`space-y-5 rounded-xl border p-4 sm:p-5 ${SURFACE_STYLES[surface]}`}
    >
      <SectionHeading section={section} index={index} />
      {children}
    </section>
  )
}

function SectionHeading({
  section,
  index,
}: {
  section: GuideSection
  index: number
}) {
  return (
    <h2
      id={section.id}
      className={`${SECTION_SCROLL_MARGIN} -mx-1 rounded-lg border border-stone-200/70 bg-stone-100/90 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.04)]`}
    >
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-sm font-bold tabular-nums tracking-wider text-amber-700/80">
          {sectionNumber(index)}
        </span>
        <span
          id={`${section.id}-heading`}
          className="text-lg font-bold text-stone-900 lg:text-xl"
        >
          {section.title}
        </span>
        <span className="font-serif text-sm italic text-stone-400/80">
          {section.englishTitle}
        </span>
      </span>
    </h2>
  )
}

function GuideLead({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-lg border border-stone-200/50 bg-stone-50/80 px-4 py-3 pl-5">
      <span
        className="absolute bottom-2.5 left-0 top-2.5 w-1 rounded-full bg-amber-500/70"
        aria-hidden
      />
      <p className="text-[15px] leading-relaxed text-stone-700">{children}</p>
    </div>
  )
}

const FEATURE_TILE_MARKERS = {
  list: 'bg-gradient-to-b from-stone-300/90 to-stone-400/70',
  compare: 'bg-gradient-to-b from-amber-400/80 to-amber-500/70',
  history: 'bg-gradient-to-b from-stone-400/70 to-amber-400/60',
} as const

function FeatureTile({
  marker,
  title,
  body,
}: {
  marker: keyof typeof FEATURE_TILE_MARKERS
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-stone-200/80 bg-white/80 px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <span
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-200/90 bg-stone-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
        aria-hidden
      >
        <span className={`h-4 w-1 rounded-full ${FEATURE_TILE_MARKERS[marker]}`} />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-stone-900">{title}</p>
        <p className="text-sm leading-relaxed text-stone-600">{body}</p>
      </div>
    </div>
  )
}

const MEMO_CARD_ANNOTATIONS = [
  { id: 1, text: '平均・最安・直近' },
  { id: 2, text: '店名で絞るとその店の記録だけ集計' },
  { id: 3, text: '開いたときだけ表示' },
  { id: 4, text: '入力を統計に保存' },
] as const

function MemoCardMobileLegend() {
  return (
    <ul
      className="mt-2.5 grid grid-cols-1 gap-1.5 sm:hidden"
      aria-label="買い物メモモックの注釈"
    >
      {MEMO_CARD_ANNOTATIONS.map((item) => (
        <li key={item.id} className="flex min-w-0 items-start gap-2">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-amber-300/80 bg-amber-50 text-[10px] font-bold tabular-nums text-amber-900"
            aria-hidden
          >
            {item.id}
          </span>
          <span className="min-w-0 text-[11px] leading-snug text-stone-600">
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  )
}

function GuideCallout({
  children,
  className = '',
  arrow = 'top',
}: {
  children: ReactNode
  className?: string
  arrow?: 'top' | 'right' | 'bottom' | 'none'
}) {
  const arrowClass =
    arrow === 'top'
      ? 'before:absolute before:-top-1 before:left-3 before:h-2 before:w-2 before:rotate-45 before:border-l before:border-t before:border-amber-300 before:bg-amber-50'
      : arrow === 'right'
        ? 'before:absolute before:-right-1 before:top-2 before:h-2 before:w-2 before:rotate-45 before:border-r before:border-t before:border-amber-300 before:bg-amber-50'
        : arrow === 'bottom'
          ? 'before:absolute before:-bottom-1 before:left-3 before:h-2 before:w-2 before:rotate-45 before:border-b before:border-r before:border-amber-300 before:bg-amber-50'
          : ''

  const positionClass =
    arrow === 'none'
      ? 'inline-block'
      : 'absolute z-10 inline-block max-w-[9rem] sm:max-w-[10rem]'

  return (
    <span
      className={`${positionClass} relative rounded-md border border-amber-300/80 bg-amber-50 px-2 py-1 text-[10px] font-medium leading-snug text-amber-900 shadow-sm ${arrowClass} ${className}`}
    >
      {children}
    </span>
  )
}

function MockOpenedMemoCard() {
  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-700'

  return (
    <div
      className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm ring-1 ring-stone-400"
      aria-hidden
    >
      <div className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rotate-90 text-stone-400" aria-hidden>▸</span>
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-stone-900">
            牛乳
          </p>
          <span className="shrink-0 rounded px-1 py-0.5 text-xs text-stone-400">
            フォルダへ
          </span>
        </div>
        <div className="mt-2 text-center">
          <div className="inline-grid grid-cols-3 gap-3 sm:gap-4">
            <StatCellMock label="平均" value="¥1.6" />
            <StatCellMock label="最安" value="¥1.4" highlight />
            <StatCellMock label="直近" value="¥1.5" />
          </div>
          <div className="mt-0.5 inline-grid grid-cols-3 gap-3 sm:gap-4">
            <p className="col-span-2 truncate text-[9px] text-stone-400">イオン</p>
            <p className="text-[9px] text-stone-400">2026-03-01</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-stone-200/80 bg-white/50 px-3 py-3">
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <label className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">確認日</span>
            <div className={fieldClass}>2026-03-08</div>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">店名</span>
            <div className={fieldClass}>イオン</div>
          </label>
          <label className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">値段</span>
            <div className={`${fieldClass} pl-7`}>
              <span className="absolute" />
              ¥398
            </div>
          </label>
          <div className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">内容量</span>
            <div className="flex overflow-hidden rounded-md border border-stone-300 bg-white">
              <div className="min-w-0 flex-1 px-2.5 py-2 text-sm text-stone-700">1000</div>
              <div className="w-[4.5rem] shrink-0 border-l border-stone-200 bg-stone-50 px-2 py-2 text-sm text-stone-600">
                ml
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-stone-200 bg-white px-4 py-3">
          <p className="text-base text-stone-900">
            今の単価{' '}
            <span className="text-lg font-bold">¥0.40</span>{' '}
            <span className="text-sm text-stone-500">(円/ml)</span>
          </p>
          <ul className="space-y-1 text-sm text-stone-700">
            <li>平均 ¥1.6 との差 <span className="font-semibold text-teal-800">¥1.2（安い）</span></li>
            <li>最安 ¥1.4 との差 <span className="font-semibold text-teal-800">¥1.0（安い）</span></li>
          </ul>
        </div>

        <div className="flex justify-end">
          <span className="inline-flex h-[42px] items-center rounded-md bg-stone-900 px-4 text-sm text-white">
            統計に残す
          </span>
        </div>
      </div>
    </div>
  )
}

function StatCellMock({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="min-w-[3.5rem]">
      <p className="text-[10px] tracking-wide text-stone-500">{label}</p>
      <p
        className={
          highlight
            ? 'text-lg font-bold tabular-nums leading-tight text-teal-800 sm:text-xl'
            : 'text-lg font-semibold tabular-nums leading-tight text-stone-900 sm:text-xl'
        }
      >
        {value}
      </p>
    </div>
  )
}

function DeviceFrame({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-2.5">
      <p className="mb-2 text-[10px] font-medium text-stone-500">{label}</p>
      {children}
    </div>
  )
}

function DeviceBehaviorPair({
  pc,
  mobile,
}: {
  pc: ReactNode
  mobile: ReactNode
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
      {pc}
      {mobile}
    </div>
  )
}

function MockFolderCardAnnotated() {
  return (
    <div className="space-y-2" aria-hidden>
      <div
        className="relative overflow-hidden rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40 shadow-sm"
      >
        <div
          className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90"
        />
        <div className="flex min-h-[4rem] items-center px-4 pb-2 pt-4">
          <span className="min-w-0 truncate px-1 text-base font-semibold text-stone-900">
            牛乳
          </span>
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-stone-400/70"
            aria-hidden
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-stone-600"
            >
              <ChartIcon className="h-4 w-4" />
            </span>
            <GuideCallout className="!absolute -top-2 right-14 z-10" arrow="top">
              件数で詳細へ
            </GuideCallout>
            <span className="rounded-md px-1.5 py-1 tabular-nums text-sm text-stone-500">
              12
            </span>
            <span className="shrink-0 text-stone-400" aria-hidden>▸</span>
            <GuideCallout className="!absolute -top-2 right-1 z-10" arrow="top">
              記録を追加
            </GuideCallout>
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg font-medium text-stone-700"
            >
              ＋
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-stone-200 bg-white/80 px-2 py-1">
        <div className="flex min-w-0 items-start gap-0.5">
          <div className="min-w-0 flex-1 py-2">
            <p className="text-sm font-medium text-stone-900">2026-03-01 · イオン</p>
            <p className="text-xs text-stone-600">¥398 / 1000ml（¥0.40/ml）</p>
          </div>
          <div className="relative flex shrink-0 items-center" aria-hidden>
            <span
              className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md text-stone-600"
            >
              <CopyIcon className="h-5 w-5" />
            </span>
            <span
              className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md text-stone-600"
            >
              <PencilIcon className="h-6 w-6" />
            </span>
            <GuideCallout className="!absolute -top-8 right-0 z-10 whitespace-nowrap" arrow="bottom">
              複製・編集
            </GuideCallout>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockReadingKana() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-stone-700"
      aria-hidden
    >
      <span className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-xs text-stone-600">
        [ 牛乳（ぎゅうにゅう） ]
      </span>
      <span className="text-stone-400">→</span>
      <span className="font-medium text-stone-900">牛乳</span>
      <span className="text-xs text-stone-500">読み仮名で並び・検索</span>
    </div>
  )
}

function MockPcFolderRow() {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40 shadow-sm"
      aria-hidden
    >
      <div
        className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90"
      />
      <div className="flex min-h-[3.5rem] items-center px-4 pb-2 pt-4">
        <span className="min-w-0 truncate px-1 text-sm font-semibold text-stone-900">
          牛乳
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/90 text-stone-900 ring-1 ring-stone-400"
          >
            <ChartIcon className="h-4 w-4" />
          </span>
          <span className="rounded-md px-1.5 py-1 tabular-nums text-sm text-stone-500">
            12
          </span>
          <span className="shrink-0 text-stone-400" aria-hidden>▸</span>
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg font-medium text-stone-700"
          >
            ＋
          </span>
        </div>
      </div>
    </div>
  )
}

function MockMobileTrendsEntry() {
  const tabs = ['買い物メモ', 'フォルダ', '値段推移', '使い方']
  return (
    <div className="w-full min-w-0 space-y-2" aria-hidden>
      <div className="flex flex-wrap gap-0.5">
        {tabs.map((tab) => (
          <span
            key={tab}
            className={
              tab === '値段推移'
                ? 'rounded-md bg-stone-900 px-2 py-1 text-[10px] text-white'
                : 'rounded-md px-2 py-1 text-[10px] text-stone-600'
            }
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="space-y-0.5">
        <p className="text-[10px] font-medium text-stone-500">フォルダ</p>
        <div className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700">
          牛乳
        </div>
      </div>
    </div>
  )
}

function TrendEntryCard({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-stone-200 bg-white/80 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      {children}
    </div>
  )
}

function MockTrendsScreen() {
  const stores = [
    { name: 'イオン', count: 5, avg: '¥0.42', min: '¥0.38', active: true },
    { name: 'コープ', count: 3, avg: '¥0.45', min: '¥0.41', active: false },
    { name: '業務スーパー', count: 4, avg: '¥0.39', min: '¥0.35', active: false },
  ]

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white/80 p-3 shadow-sm" aria-hidden>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="space-y-1">
          <span className="text-stone-500">単位</span>
          <div className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-stone-700">
            ml
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-stone-500">表示</span>
          <div className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-stone-700">
            単位あたり
          </div>
        </div>
      </div>

      <p className="text-sm text-stone-600">
        <span className="font-medium text-stone-900">「イオン」</span>
        の記録を表示中
        <span className="ml-2 text-stone-500 underline">すべて表示</span>
      </p>

      <div className="relative">
        <GuideCallout className="!absolute -top-2 right-2 z-10" arrow="top">
          店舗で絞る／戻す
        </GuideCallout>
        <div className="rounded-md border border-stone-200 bg-white/70 p-2">
          <svg viewBox="0 0 280 120" className="h-[120px] w-full" aria-hidden>
            <line x1="44" y1="10" x2="44" y2="100" stroke="#e7e5e4" strokeWidth="1" />
            <line x1="44" y1="100" x2="270" y2="100" stroke="#e7e5e4" strokeWidth="1" />
            <polyline
              points="60,80 100,65 140,70 180,55 220,60 260,45"
              fill="none"
              stroke="#1c1917"
              strokeWidth="2.5"
            />
            <circle cx="180" cy="55" r="7" fill="#0f766e" stroke="#fff" strokeWidth="2" />
            <text x="60" y="115" fontSize="9" fill="#78716c">1月</text>
            <text x="140" y="115" fontSize="9" fill="#78716c">2月</text>
            <text x="220" y="115" fontSize="9" fill="#78716c">3月</text>
            <text x="8" y="60" fontSize="9" fill="#78716c">0.4</text>
            <text x="8" y="90" fontSize="9" fill="#78716c">0.3</text>
          </svg>
        </div>
      </div>

      <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm">
        <p className="font-medium text-stone-900">2026-03-01 · イオン</p>
        <p className="mt-1 font-semibold tabular-nums text-stone-900">
          ¥0.40
          <span className="ml-1 text-xs font-normal text-stone-500">円/ml</span>
        </p>
        <p className="mt-0.5 text-xs text-stone-600">¥398 / 1000ml</p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-stone-800">店舗一覧</h4>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {stores.map((s) => (
            <li key={s.name}>
              <div
                className={`rounded-md border px-3 py-2.5 ${
                  s.active
                    ? 'border-stone-800 bg-stone-100 ring-1 ring-stone-800'
                    : 'border-stone-200 bg-white/70'
                }`}
              >
                <p className="truncate text-sm font-medium text-stone-900">{s.name}</p>
                <dl className="mt-1.5 grid grid-cols-3 gap-x-2 text-xs text-stone-700">
                  <div>
                    <dt className="text-stone-500">件数</dt>
                    <dd>{s.count}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">平均</dt>
                    <dd className="font-medium">{s.avg}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">最安</dt>
                    <dd>{s.min}</dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
