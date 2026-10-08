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
  { id: 'basic-flow', title: '基本の流れ', englishTitle: 'Basics' },
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

        <div className="min-w-0 flex-1 space-y-8 lg:max-w-[42rem] lg:space-y-10">
          <GuideMobileToc onNavigate={scrollToSection} />

          <GuideSectionBlock section={GUIDE_SECTIONS[0]}>
            <GuideSteps>
              <GuideStep
                n={1}
                title="品目を登録"
                body="比較したい商品を登録します。"
              />
              <GuideStep
                n={2}
                title="価格を記録"
                body="値段と内容量を入力します。"
              />
              <GuideStep
                n={3}
                title="比較"
                body="最安値や値段推移を確認します。"
              />
            </GuideSteps>
          </GuideSectionBlock>

          <GuideSectionBlock section={GUIDE_SECTIONS[1]}>
            <p className="text-sm leading-relaxed text-stone-700">
              店頭で見る品目リストです。
            </p>
            <MockStatCells />
            <p className="text-sm leading-relaxed text-stone-700">
              店名を入れると、その店の記録だけで集計します。
            </p>
            <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
              <span className="rounded px-1 py-0.5 text-xs text-stone-400">
                フォルダへ
              </span>
              <span className="text-stone-500">開いたカードだけ表示</span>
            </div>
            <GuideDeviceCompare
              rows={[
                {
                  label: '並べ替え',
                  pc: 'ドラッグ',
                  mobile: '—',
                },
                {
                  label: 'メモから外す',
                  pc: 'ゴミ箱へドラッグ',
                  mobile: '左スワイプ',
                },
              ]}
            />
          </GuideSectionBlock>

          <GuideSectionBlock section={GUIDE_SECTIONS[2]}>
            <p className="text-sm leading-relaxed text-stone-700">
              品目名は商品ごと、店名は店舗ごとの記録をまとめます。
            </p>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="pointer-events-none inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600"
                  aria-hidden
                >
                  <SearchIcon />
                </span>
                <p className="min-w-0 flex-1 text-sm text-stone-700">
                  虫眼鏡で品目名と店名を横断検索できます。
                </p>
              </div>

              <MockFolderCard />

              <MockRecordActions />

              <p className="text-sm text-stone-700">
                検索入力から、未登録の名前をそのまま追加できます。
              </p>

              <MockReadingKana />

              <GuideDeviceCompare
                rows={[
                  {
                    label: '削除',
                    pc: 'ドラッグ中に現れるゴミ箱へドロップ',
                    mobile: '左スワイプ',
                  },
                ]}
              />
            </div>
          </GuideSectionBlock>

          <GuideSectionBlock section={GUIDE_SECTIONS[3]}>
            <p className="text-sm leading-relaxed text-stone-700">
              品目ごとの単価推移をグラフで確認できます。
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <TrendEntryCard
                label="PC"
                body="フォルダの品目カードから開きます。"
              >
                <span
                  className="pointer-events-none inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-600"
                  aria-hidden
                >
                  <ChartIcon className="h-4 w-4" />
                </span>
              </TrendEntryCard>
              <TrendEntryCard
                label="スマホ"
                body="「値段推移」タブから品目を選びます。"
              >
                <MockMobileTrendsEntry />
              </TrendEntryCard>
            </div>

            <GuideSteps>
              <GuideStep
                n={1}
                title="グラフの記録を見る"
                body="各点を押して記録の詳細を確認します。"
              />
              <GuideStep
                n={2}
                title="店舗を選んで絞る"
                body="店舗一覧から店を選びます。"
              />
              <GuideStep
                n={3}
                title="全体へ戻す"
                body="同じ店をもう一度選ぶか「すべて表示」で全店舗に戻ります。"
              />
            </GuideSteps>
          </GuideSectionBlock>
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
                  className="absolute left-[0.72rem] top-7 bottom-0 w-px border-l border-dashed border-stone-300"
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
                className={`group flex items-start gap-2 py-2 pr-2 transition-colors ${
                  active ? 'text-stone-900' : 'text-stone-500'
                }`}
              >
                <span
                  className={`w-6 shrink-0 text-xs font-semibold tabular-nums leading-5 ${
                    active ? 'text-stone-900' : 'text-stone-400'
                  }`}
                >
                  {num}
                </span>
                <span
                  className={`min-w-0 text-sm leading-5 underline decoration-stone-300 underline-offset-[3px] ${
                    active
                      ? 'font-medium decoration-stone-600 decoration-2'
                      : 'decoration-1 group-hover:text-stone-700'
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
      <details className="rounded-md border border-stone-200 bg-white">
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
                <span className="mr-1.5 text-xs tabular-nums text-stone-400">
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

function GuideSectionBlock({
  section,
  children,
}: {
  section: GuideSection
  children: ReactNode
}) {
  const index = GUIDE_SECTIONS.findIndex((s) => s.id === section.id)
  return (
    <section aria-labelledby={`${section.id}-heading`} className="space-y-4">
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
      className={`${SECTION_SCROLL_MARGIN} rounded-lg border border-stone-200/80 bg-stone-100 px-4 py-3 shadow-sm`}
    >
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-sm font-semibold tabular-nums tracking-wide text-stone-500">
          {sectionNumber(index)}
        </span>
        <span
          id={`${section.id}-heading`}
          className="text-lg font-semibold text-stone-900 lg:text-xl"
        >
          {section.title}
        </span>
        <span className="font-serif text-sm italic text-stone-400/90">
          {section.englishTitle}
        </span>
      </span>
    </h2>
  )
}

function GuideSteps({ children }: { children: ReactNode }) {
  return <ol className="space-y-3">{children}</ol>
}

function GuideStep({
  n,
  title,
  body,
}: {
  n: number
  title: string
  body: string
}) {
  return (
    <li className="flex gap-3 rounded-md border border-stone-200 bg-white px-4 py-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white"
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-stone-900">{title}</p>
        <p className="text-sm leading-relaxed text-stone-700">{body}</p>
      </div>
    </li>
  )
}

function MockStatCells() {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="inline-grid grid-cols-3 gap-3 sm:gap-4">
        <StatCellMock label="平均" value="¥1.6" />
        <StatCellMock label="最安" value="¥1.4" highlight />
        <StatCellMock label="直近" value="¥1.5" />
      </div>
      <div className="mt-1 inline-grid grid-cols-3 gap-3 sm:gap-4">
        <p className="col-span-2 truncate text-[9px] text-stone-400">
          イオン
        </p>
        <p className="text-[9px] text-stone-400">2026-03-01</p>
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

function MockFolderCard() {
  return (
    <div className="space-y-1.5" aria-hidden>
      <div
        className="pointer-events-none relative overflow-hidden rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40 shadow-sm"
      >
        <div
          className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90"
        />
        <div className="flex min-h-[4rem] items-center px-4 pb-2 pt-4">
          <span className="min-w-0 truncate px-1 text-base font-semibold text-stone-900">
            牛乳
          </span>
          <div className="ml-auto flex shrink-0 items-start gap-0.5 pl-1">
            <div className="flex flex-col items-center gap-0.5">
              <span className="rounded-md px-1.5 py-1 tabular-nums text-sm text-stone-500">
                12
              </span>
              <span className="max-w-[4.5rem] text-center text-[10px] leading-tight text-stone-500">
                押すとプレビューを経ず詳細へ
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg font-medium text-stone-700"
              >
                ＋
              </span>
              <span className="text-[10px] text-stone-500">記録を追加</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockReadingKana() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-700"
      aria-hidden
    >
      <span className="rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600">
        牛乳（ぎゅうにゅう）
      </span>
      <span className="text-stone-400">→</span>
      <span className="font-medium text-stone-900">牛乳</span>
      <span className="text-xs text-stone-500">並び・検索で読み利用</span>
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

function GuideDeviceCompare({
  rows,
}: {
  rows: { label: string; pc: string; mobile: string }[]
}) {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200 text-sm">
      <div className="grid grid-cols-3 border-b border-stone-200 bg-stone-50 font-medium text-stone-900">
        <div className="px-3 py-2" />
        <div className="border-l border-stone-200 px-3 py-2">PC</div>
        <div className="border-l border-stone-200 px-3 py-2">スマホ</div>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-3 border-t border-stone-100 text-stone-700 first:border-t-0"
        >
          <div className="px-3 py-2 font-medium text-stone-900">{row.label}</div>
          <div className="border-l border-stone-100 px-3 py-2">{row.pc}</div>
          <div className="border-l border-stone-100 px-3 py-2">{row.mobile}</div>
        </div>
      ))}
    </div>
  )
}

function MockRecordActions() {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-2 py-1">
      <div className="flex min-w-0 items-center gap-0.5">
        <div className="min-w-0 flex-1 py-2">
          <p className="text-sm font-medium text-stone-900">
            2026-03-01 · イオン
          </p>
          <p className="text-xs text-stone-600">¥398 / 1000ml（¥0.40/ml）</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 py-1" aria-hidden>
          <div className="flex min-w-0 items-center gap-1">
            <span
              className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md text-stone-600"
            >
              <CopyIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-xs leading-snug text-stone-600">
              内容を引き継いで新しい記録を作成
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <span
              className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-md text-stone-600"
            >
              <PencilIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 text-xs leading-snug text-stone-600">
              保存済みの記録を変更
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrendEntryCard({
  label,
  body,
  children,
}: {
  label: string
  body: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border border-stone-200 bg-white p-3">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      <p className="text-sm leading-relaxed text-stone-700">{body}</p>
    </div>
  )
}
