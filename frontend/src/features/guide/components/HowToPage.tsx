import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ChartIcon } from '@/components/icons/ChartIcon'
import { CopyIcon } from '@/components/icons/CopyIcon'
import { PencilIcon } from '@/components/icons/PencilIcon'
import { SearchIcon } from '@/components/icons/SearchIcon'
import {
  GuideAnnotationList,
  GuideBeforeAfter,
  GuideDeviceFrame,
  GuideMarker,
} from './GuideAnnotation'
import {
  GUIDE_THEMES,
  GuideThemeContext,
  useGuideTheme,
  type GuideThemeName,
} from './guideTheme'

const GuideTrendSample = lazy(() =>
  import('./GuideTrendSample').then((m) => ({ default: m.GuideTrendSample })),
)

type GuideSection = {
  id: string
  title: string
  englishTitle: string
  theme: GuideThemeName
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'features',
    title: 'このアプリでできること',
    englishTitle: 'Overview',
    theme: 'stone',
  },
  {
    id: 'shopping-memo',
    title: '買い物メモ',
    englishTitle: 'Shopping memo',
    theme: 'teal',
  },
  { id: 'folders', title: 'フォルダ', englishTitle: 'Folders', theme: 'amber' },
  {
    id: 'price-trends',
    title: '値段推移',
    englishTitle: 'Price trends',
    theme: 'sky',
  },
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

          <GuideSectionShell section={GUIDE_SECTIONS[0]}>
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

          <GuideSectionShell section={GUIDE_SECTIONS[1]}>
            <GuideLead>
              買う品目のリストとして使い、店頭で価格を比べながら新しい品目を追加し、その場で記録を残せます。
            </GuideLead>

            <div>
              <MockOpenedMemoCard />
              <GuideAnnotationList
                label="買い物メモの注釈"
                items={MEMO_ANNOTATIONS}
              />
            </div>

            <GuideDivider>
              <p className="mb-3 text-xs font-semibold tracking-wide text-stone-600">
                端末ごとの操作
              </p>
              <div className="space-y-3">
                <GuideDeviceFrame label="PC：ドラッグで並べ替え">
                  <GuideBeforeAfter
                    actionLabel="ドラッグ"
                    before={
                      <div className="space-y-1.5">
                        <MemoRowCard name="牛乳" dragging />
                        <MemoRowCard name="卵" />
                      </div>
                    }
                    after={
                      <div className="space-y-1.5">
                        <MemoRowCard name="卵" />
                        <MemoRowCard name="牛乳" />
                      </div>
                    }
                  />
                </GuideDeviceFrame>
                <GuideDeviceFrame label="PC：ゴミ箱へドラッグでメモから外す">
                  <TrashDragScene
                    card={<MemoRowCard name="牛乳" dragging />}
                    caption="ドラッグ中だけゴミ箱が表示されます。ゴミ箱に落とすとメモから外れます。"
                  />
                </GuideDeviceFrame>
                <GuideDeviceFrame label="スマホ：左スワイプでメモから外す">
                  <GuideBeforeAfter
                    actionLabel="左へスワイプ"
                    before={<SwipeRow name="牛乳" hint />}
                    after={<SwipeRow name="牛乳" revealed actionText="外す" />}
                  />
                </GuideDeviceFrame>
              </div>
            </GuideDivider>
          </GuideSectionShell>

          <GuideSectionShell section={GUIDE_SECTIONS[2]}>
            <GuideLead>
              品目名フォルダは商品ごと、店名フォルダは店舗ごとに記録をまとめます。
            </GuideLead>

            <div>
              <MockFolderCardAnnotated />
              <GuideAnnotationList
                label="フォルダの注釈"
                items={FOLDER_ANNOTATIONS}
              />
            </div>

            <GuideDivider>
              <KanaBlock />
            </GuideDivider>

            <GuideDivider>
              <p className="mb-3 text-xs font-semibold tracking-wide text-stone-600">
                削除操作
              </p>
              <div className="space-y-3">
                <GuideDeviceFrame label="PC：ドラッグ中だけゴミ箱が表示">
                  <TrashDragScene
                    card={<FolderRowCard name="牛乳" dragging />}
                    caption="ドラッグ中だけゴミ箱が表示されます。ゴミ箱に落とすとフォルダを削除します。"
                  />
                </GuideDeviceFrame>
                <GuideDeviceFrame label="スマホ：左スワイプで削除">
                  <GuideBeforeAfter
                    actionLabel="左へスワイプ"
                    before={<SwipeRow name="牛乳" folder hint />}
                    after={
                      <SwipeRow name="牛乳" folder revealed actionText="削除" />
                    }
                  />
                </GuideDeviceFrame>
              </div>
            </GuideDivider>
          </GuideSectionShell>

          <GuideSectionShell section={GUIDE_SECTIONS[3]}>
            <GuideLead>
              品目ごとの単価推移をグラフで確認できます。店舗を選んで絞り込み、もう一度選ぶか「すべて表示」で全体に戻せます。
            </GuideLead>

            <div className="grid gap-3 sm:grid-cols-2">
              <TrendEntryCard label="PC">
                <MockPcFolderRow />
                <GuideAnnotationList
                  label="PC の入口"
                  singleColumn
                  items={[
                    {
                      n: 1,
                      text: 'フォルダ行のグラフボタンから開きます。',
                    },
                  ]}
                />
              </TrendEntryCard>
              <TrendEntryCard label="スマホ">
                <MockMobileTrendsEntry />
                <GuideAnnotationList
                  label="スマホの入口"
                  singleColumn
                  items={[
                    {
                      n: 1,
                      text: '「値段推移」タブでフォルダを選びます。',
                    },
                  ]}
                />
              </TrendEntryCard>
            </div>

            <GuideDivider>
              <p className="mb-1 text-sm font-semibold text-stone-800">
                操作できるサンプル
              </p>
              <p className="mb-3 text-sm leading-relaxed text-stone-600">
                実際の画面と同じグラフです。店舗一覧で店舗を選ぶと絞り込まれ、「すべて表示」で戻ります。グラフの点を選ぶと記録の詳細が出ます。サンプルの記録は保存されません。
              </p>
              <Suspense
                fallback={
                  <p className="rounded-lg border border-stone-200 bg-white/70 px-3 py-6 text-center text-sm text-stone-500">
                    グラフを読み込み中...
                  </p>
                }
              >
                <GuideTrendSample />
              </Suspense>
            </GuideDivider>
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

function GuideSectionShell({
  section,
  children,
}: {
  section: GuideSection
  children: ReactNode
}) {
  const index = GUIDE_SECTIONS.findIndex((s) => s.id === section.id)
  const theme = GUIDE_THEMES[section.theme]
  return (
    <GuideThemeContext.Provider value={theme}>
      <section
        aria-labelledby={`${section.id}-heading`}
        className={`space-y-5 rounded-xl border p-4 sm:p-5 ${theme.surface}`}
      >
        <SectionHeading section={section} index={index} />
        {children}
      </section>
    </GuideThemeContext.Provider>
  )
}

function SectionHeading({
  section,
  index,
}: {
  section: GuideSection
  index: number
}) {
  const theme = useGuideTheme()
  return (
    <h2
      id={section.id}
      className={`${SECTION_SCROLL_MARGIN} -mx-1 rounded-lg border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(0,0,0,0.04)] ${theme.heading}`}
    >
      <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span
          className={`text-sm font-bold tabular-nums tracking-wider ${theme.number}`}
        >
          {sectionNumber(index)}
        </span>
        <span
          id={`${section.id}-heading`}
          className="text-lg font-bold text-stone-900 lg:text-xl"
        >
          {section.title}
        </span>
        <span className="font-serif text-sm italic text-stone-500">
          {section.englishTitle}
        </span>
      </span>
    </h2>
  )
}

function GuideLead({ children }: { children: ReactNode }) {
  const theme = useGuideTheme()
  return (
    <div
      className={`relative rounded-lg border px-4 py-3 pl-5 ${theme.leadBg}`}
    >
      <span
        className={`absolute bottom-2.5 left-0 top-2.5 w-1 rounded-full ${theme.leadBar}`}
        aria-hidden
      />
      <p className="text-[15px] leading-relaxed text-stone-700">{children}</p>
    </div>
  )
}

function GuideDivider({ children }: { children: ReactNode }) {
  const theme = useGuideTheme()
  return (
    <div className={`border-t border-dotted pt-5 ${theme.divider}`}>
      {children}
    </div>
  )
}

const FEATURE_TILE_MARKERS = {
  list: 'bg-gradient-to-b from-stone-300/90 to-stone-400/70',
  compare: 'bg-gradient-to-b from-teal-300/90 to-teal-500/70',
  history: 'bg-gradient-to-b from-amber-300/90 to-sky-400/70',
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

const MEMO_ANNOTATIONS = [
  {
    n: 1,
    text: '「フォルダへ」は開いたカードにだけ表示され、その品目のフォルダを開きます。',
  },
  { n: 2, text: '平均・最安・直近の単価です。' },
  { n: 3, text: '店名を入れると、その店の記録だけで集計します。' },
  { n: 4, text: '入力した価格と内容量を統計に保存します。' },
] as const

const FOLDER_ANNOTATIONS = [
  { n: 1, text: '品目名と店名の表示を切り替えます。' },
  { n: 2, text: '品目名と店名を横断して検索します。' },
  { n: 3, text: '追加順と名前順を切り替えます。' },
  { n: 4, text: '青いタイルで新しいフォルダを追加します。' },
  { n: 5, text: '件数を押すとフォルダの詳細が開きます。' },
  { n: 6, text: 'フォルダカードの＋で記録を追加します。' },
  { n: 7, text: '記録を複製します。' },
  { n: 8, text: '記録を編集します。' },
] as const

/**
 * Inert static mock of an opened FolderMemoCard. The real card can call
 * createRecord, so it is never mounted here; layout/spacing/classes mirror it.
 */
function MockOpenedMemoCard() {
  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-700'

  return (
    <div
      className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm ring-1 ring-stone-400"
      aria-hidden
    >
      <div className="px-3 py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-1.5 lg:flex-1">
            <span className="shrink-0 rotate-90 text-stone-400">▸</span>
            <p className="min-w-0 flex-1 truncate text-left text-base font-semibold text-stone-900 sm:text-lg">
              牛乳
            </p>
            <GuideMarker n={1} />
            <span className="shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-xs text-stone-400">
              フォルダへ
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 text-center lg:shrink-0">
            <GuideMarker n={2} />
            <div>
              <div className="inline-grid grid-cols-3 gap-3 sm:gap-4 lg:grid">
                <StatCellMock label="平均" value="¥1.6" />
                <StatCellMock label="最安" value="¥1.4" highlight />
                <StatCellMock label="直近" value="¥1.5" />
              </div>
              <div className="mt-0.5 inline-grid grid-cols-3 gap-3 sm:gap-4 lg:grid">
                <p className="col-span-2 truncate text-[9px] text-stone-400">
                  イオン
                </p>
                <p className="text-[9px] text-stone-400">2026-03-01</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-stone-200/80 bg-white/50 px-3 py-3">
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:gap-x-3">
          <div className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">確認日</span>
            <div className={fieldClass}>2026-03-08</div>
          </div>
          <div className="min-w-0 space-y-1">
            <span className="flex items-center gap-1.5 text-xs text-stone-500">
              店名
              <GuideMarker n={3} />
            </span>
            <div className={fieldClass}>イオン</div>
          </div>
          <div className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">値段</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                ¥
              </span>
              <div className={`${fieldClass} pl-7`}>398</div>
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <span className="text-xs text-stone-500">内容量</span>
            <div className="flex min-w-0 overflow-hidden rounded-md border border-stone-300 bg-white">
              <div className="min-w-0 flex-1 px-2 py-2 text-sm text-stone-700">
                1000
              </div>
              <div className="w-14 shrink-0 border-l border-stone-200 bg-stone-50 px-2 py-2 text-sm text-stone-700">
                ml
              </div>
            </div>
          </div>
          <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
            <span className="text-xs text-stone-500">補足など</span>
            <div className={`${fieldClass} min-h-[38px]`} />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-1 sm:justify-end">
            <GuideMarker n={4} />
            <span className="inline-flex h-[42px] w-full items-center justify-center rounded-md bg-stone-900 px-4 text-sm text-white sm:w-auto sm:whitespace-nowrap">
              統計に残す
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-md border border-stone-200 bg-white px-4 py-3">
          <p className="text-base text-stone-900">
            今の単価{' '}
            <span className="text-lg font-bold">¥0.40</span>{' '}
            <span className="text-sm text-stone-500">(円/ml)</span>
          </p>
          <ul className="space-y-1 text-sm text-stone-700">
            <MockCompareLine label="平均" baseline="¥1.6" diff="¥1.2" />
            <MockCompareLine label="最安" baseline="¥1.4" diff="¥1.0" />
            <MockCompareLine label="直近" baseline="¥1.5" diff="¥1.1" />
          </ul>
        </div>
      </div>
    </div>
  )
}

function MockCompareLine({
  label,
  baseline,
  diff,
}: {
  label: string
  baseline: string
  diff: string
}) {
  return (
    <li>
      {label} {baseline} との差{' '}
      <span className="font-semibold text-teal-800">{diff}（安い）</span>
    </li>
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

function MemoRowCard({ name, dragging }: { name: string; dragging?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2.5 shadow-sm ${
        dragging ? 'ring-1 ring-stone-400' : ''
      }`}
      aria-hidden
    >
      <span className="shrink-0 text-stone-400">▸</span>
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-stone-900">
        {name}
      </span>
      <span className="shrink-0 text-stone-400">⠿</span>
    </div>
  )
}

function FolderRowCard({ name, dragging }: { name: string; dragging?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40 shadow-sm ${
        dragging ? 'ring-1 ring-stone-400' : ''
      }`}
      aria-hidden
    >
      <div className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90" />
      <div className="flex min-h-[3.5rem] items-center px-4 pb-2 pt-4">
        <span className="min-w-0 truncate px-1 text-base font-semibold text-stone-900">
          {name}
        </span>
      </div>
    </div>
  )
}

function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/** Shared PC drag scene: the trash is only shown while a card is being dragged. */
function TrashDragScene({
  card,
  caption,
}: {
  card: ReactNode
  caption: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2" aria-hidden>
        <div className="min-w-0 flex-1">{card}</div>
        <span className="shrink-0 text-xl leading-none text-red-600">→</span>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-red-400 bg-red-50 text-red-600 sm:h-20 sm:w-20">
          <TrashIcon className="h-8 w-8 sm:h-10 sm:w-10" />
        </div>
      </div>
      <p className="text-xs leading-snug text-stone-700">{caption}</p>
    </div>
  )
}

function SwipeRow({
  name,
  folder,
  hint,
  revealed,
  actionText,
}: {
  name: string
  folder?: boolean
  hint?: boolean
  revealed?: boolean
  actionText?: string
}) {
  const cardClass = folder
    ? 'border-amber-200/90 bg-amber-50'
    : 'border-stone-200 bg-white'
  return (
    <div className="flex items-stretch gap-0" aria-hidden>
      <div
        className={`flex min-h-[3rem] min-w-0 flex-1 items-center gap-1.5 border px-3 py-2.5 shadow-sm ${cardClass} ${
          revealed ? 'rounded-l-lg border-r-0' : 'rounded-lg'
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-stone-900">
          {name}
        </span>
        {hint && (
          <span className="shrink-0 text-xs font-medium text-stone-600">
            ← スワイプ
          </span>
        )}
      </div>
      {revealed && (
        <div className="flex w-16 shrink-0 items-center justify-center rounded-r-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-700">
          {actionText}
        </div>
      )}
    </div>
  )
}

function MockFolderCardAnnotated() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-md border border-stone-300 bg-white p-0.5">
            <span className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white">
              品目名
            </span>
            <span className="rounded px-3 py-1.5 text-sm text-stone-700">
              店名
            </span>
          </div>
          <GuideMarker n={1} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600">
            <SearchIcon />
          </span>
          <GuideMarker n={2} />
          <span className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-600">
            追加順
            <span className="text-[10px] text-stone-400">▼</span>
          </span>
          <GuideMarker n={3} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        <div className="relative flex min-h-[4rem] w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-sky-200/90 bg-gradient-to-b from-sky-50 via-sky-50/90 to-sky-100/50 shadow-sm">
          <div className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-sky-300/70 bg-sky-200/80" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-sky-500 text-xl font-light leading-none text-sky-700">
            ＋
          </span>
          <GuideMarker n={4} />
        </div>

        <div className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-amber-400/80 bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40 shadow-md">
          <div className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90" />
          <div className="flex flex-col gap-2 px-4 pb-2 pt-4">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-y-1">
              <span className="min-w-0 truncate px-1 text-base font-semibold text-stone-900">
                牛乳
              </span>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-stone-400/70">
                <PencilIcon className="h-3.5 w-3.5" />
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
                <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-stone-600 lg:inline-flex">
                  <ChartIcon className="h-4 w-4" />
                </span>
                <span className="rounded-md px-1.5 py-1 tabular-nums text-sm text-stone-500">
                  12
                </span>
                <GuideMarker n={5} />
                <span className="ml-1.5 shrink-0 rotate-90 text-stone-400">▸</span>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg font-medium text-stone-700">
                  ＋
                </span>
                <GuideMarker n={6} />
              </div>
            </div>
          </div>
          <div className="border-t border-amber-200/70 bg-white/80 px-3 py-3">
            <div className="rounded-md border border-stone-200 bg-white px-2 py-1">
              <div className="flex min-w-0 items-center gap-0.5">
                <div className="min-w-0 flex-1 py-2">
                  <p className="text-sm font-medium text-stone-900">
                    2026-03-01 · イオン
                  </p>
                  <p className="text-xs text-stone-600">
                    ¥398 / 1000ml（¥0.40/ml）
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-stone-600">
                    <CopyIcon className="h-5 w-5" />
                  </span>
                  <GuideMarker n={7} />
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md text-stone-600">
                    <PencilIcon className="h-6 w-6" />
                  </span>
                  <GuideMarker n={8} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Semantics (folderName.ts / FoldersPage): a trailing （reading） is split from
 * the name; the list shows only the name, while search matches the reading and
 * name order uses the reading as sort key.
 */
function KanaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-base font-semibold text-stone-900">
      {children}
    </span>
  )
}

function KanaBlock() {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-stone-800">
        読み仮名を使った検索と並べ替え
      </p>
      <p className="text-sm leading-relaxed text-stone-600">
        フォルダ名の末尾に（読み仮名）を付けて保存します。
      </p>

      <div className="space-y-1" aria-hidden>
        <span className="text-xs text-stone-500">フォルダ名</span>
        <div className="rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-800">
          牛乳（ぎゅうにゅう）
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <KanaStage
          title="保存後の表示"
          result={<KanaChip>牛乳</KanaChip>}
        />
        <KanaStage
          title="検索・名前順"
          result={<KanaChip>ぎゅうにゅう</KanaChip>}
        />
      </div>
    </div>
  )
}

function KanaStage({ title, result }: { title: string; result: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-stone-200 bg-white/80 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-stone-500">{title}</p>
        <div className="flex items-center gap-2">
          <span className="text-stone-400" aria-hidden>
            →
          </span>
          {result}
        </div>
      </div>
    </div>
  )
}

function MockPcFolderRow() {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-amber-200/90 bg-gradient-to-b from-amber-50 via-amber-50/90 to-amber-100/40 shadow-sm"
      aria-hidden
    >
      <div className="absolute left-4 top-0 h-2 w-12 rounded-b-sm border border-t-0 border-amber-300/70 bg-amber-200/90" />
      <div className="flex min-h-[3.5rem] flex-wrap items-center gap-y-1 px-4 pb-2 pt-4">
        <span className="min-w-[4.5rem] truncate px-1 text-sm font-semibold text-stone-900">
          鶏むね肉
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/90 text-stone-900 ring-1 ring-stone-400">
            <ChartIcon className="h-4 w-4" />
          </span>
          <GuideMarker n={1} />
          <span className="rounded-md px-1.5 py-1 tabular-nums text-sm text-stone-500">
            12
          </span>
          <span className="shrink-0 text-stone-400">▸</span>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg font-medium text-stone-700">
            ＋
          </span>
        </div>
      </div>
    </div>
  )
}

function MockMobileTrendsEntry() {
  const tabs = ['買い物メモ', 'フォルダ', '値段推移']
  return (
    <div className="w-full min-w-0 space-y-2" aria-hidden>
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) =>
          tab === '値段推移' ? (
            <span key={tab} className="inline-flex items-center gap-1">
              <span className="rounded-md bg-stone-900 px-2 py-1 text-xs text-white">
                {tab}
              </span>
              <GuideMarker n={1} />
            </span>
          ) : (
            <span
              key={tab}
              className="rounded-md px-2 py-1 text-xs text-stone-600"
            >
              {tab}
            </span>
          ),
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-stone-500">フォルダ</p>
        <div className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700">
          鶏むね肉
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
      <p className="text-xs font-semibold text-stone-600">{label}</p>
      {children}
    </div>
  )
}
