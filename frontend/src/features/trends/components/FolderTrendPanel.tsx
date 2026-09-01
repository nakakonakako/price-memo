import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { listRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord, PriceUnit } from '@/features/records/types'
import { toUserMessage } from '@/lib/userError'
import {
  formatYen,
  supportsPerHundred,
  unitLabel,
} from '@/features/records/utils/unitPrice'
import {
  dominantUnit,
  summarizeByStore,
  toChronologicalChartData,
  toTrendPoints,
  type PriceBasis,
  type StoreSummary,
  type TrendPoint,
} from '../utils/aggregate'

type Props = {
  folderId: string
  folderName?: string
  /** When set, chart follows parent data (e.g. folder tab) without refetching. */
  records?: PriceRecord[]
  recordsLoading?: boolean
  compact?: boolean
}

export function FolderTrendPanel({
  folderId,
  records: recordsProp,
  recordsLoading: recordsLoadingProp,
  compact = false,
}: Props) {
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const [fetchedRecords, setFetchedRecords] = useState<PriceRecord[]>([])
  const [fetchLoading, setFetchLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [unit, setUnit] = useState<PriceUnit>('g')
  const [basis, setBasis] = useState<PriceBasis>('per_100')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const initializedFolderRef = useRef<string | null>(null)
  const hadRecordsRef = useRef(false)

  const usesExternalRecords = recordsProp !== undefined

  useEffect(() => {
    if (usesExternalRecords) return
    let cancelled = false
    ;(async () => {
      setFetchLoading(true)
      setFetchError(null)
      try {
        const list = await listRecords(folderId)
        if (cancelled) return
        setFetchedRecords(list)
      } catch (err) {
        if (!cancelled) {
          setFetchError(toUserMessage(err, 'レコードの取得に失敗しました。'))
        }
      } finally {
        if (!cancelled) setFetchLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderId, usesExternalRecords])

  const records = recordsProp ?? fetchedRecords
  const recordsLoading = recordsLoadingProp ?? fetchLoading
  const error = fetchError

  useEffect(() => {
    if (initializedFolderRef.current !== folderId) {
      initializedFolderRef.current = folderId
      hadRecordsRef.current = false
    }
    if (records.length === 0) return
    if (!hadRecordsRef.current) {
      const dom = dominantUnit(records)
      if (dom) {
        setUnit(dom)
        setBasis(supportsPerHundred(dom) ? 'per_100' : 'per_unit')
      }
      hadRecordsRef.current = true
    }
  }, [folderId, records])

  useEffect(() => {
    setSelectedIndex(null)
  }, [folderId, unit, basis, records])

  const unitsInFolder = useMemo(() => {
    return [...new Set(records.map((r) => r.unit.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'ja'),
    )
  }, [records])

  const effectiveBasis: PriceBasis = supportsPerHundred(unit)
    ? basis
    : 'per_unit'

  const points = useMemo(
    () => toTrendPoints(records, unit, effectiveBasis),
    [records, unit, effectiveBasis],
  )

  const chartRows = useMemo(
    () => toChronologicalChartData(points),
    [points],
  )

  const summaries = useMemo(() => summarizeByStore(points), [points])

  const selectedPoint: TrendPoint | null =
    selectedIndex != null ? (points[selectedIndex] ?? null) : null

  const valueLabel =
    effectiveBasis === 'per_100'
      ? `円/100${unitLabel(unit)}`
      : `円/${unitLabel(unit)}`

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const skipped = records.filter((r) => r.unit !== unit).length
  const chartHeight = compact ? 220 : 320
  const useStoreCards = compact || isMobile

  const basisLabel =
    effectiveBasis === 'per_100' ? '100単位あたり' : '単位あたり'

  const filterControls = (
    <>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-stone-500">単位</span>
        <select
          className={fieldClass}
          value={unit}
          onChange={(e) => {
            const next = e.target.value as PriceUnit
            setUnit(next)
            if (!supportsPerHundred(next)) setBasis('per_unit')
          }}
          disabled={unitsInFolder.length === 0}
        >
          {(unitsInFolder.length > 0 ? unitsInFolder : ['g']).map((u) => (
            <option key={u} value={u}>
              {unitLabel(u)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-stone-500">表示</span>
        <select
          className={fieldClass}
          value={effectiveBasis}
          onChange={(e) => setBasis(e.target.value as PriceBasis)}
          disabled={!supportsPerHundred(unit)}
        >
          <option value="per_unit">単位あたり</option>
          {supportsPerHundred(unit) && (
            <option value="per_100">100単位あたり</option>
          )}
        </select>
      </label>
    </>
  )

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white/80 p-3 shadow-sm">
      {isMobile ? (
        <div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800"
            aria-expanded={filtersOpen}
          >
            <span>
              {unitLabel(unit)} · {basisLabel}
            </span>
            <span
              className={`text-stone-400 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
              aria-hidden
            >
              ▾
            </span>
          </button>
          {filtersOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">{filterControls}</div>
          )}
        </div>
      ) : (
        <div
          className={`grid gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-3'}`}
        >
          {filterControls}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {recordsLoading ? (
        <p className="text-sm text-stone-500">読み込み中...</p>
      ) : points.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-stone-50/80 px-3 py-6 text-center text-sm text-stone-500">
          この条件のレコードがありません。
        </p>
      ) : (
        <>
          {skipped > 0 && (
            <p className="text-xs text-stone-500">
              単位が異なる {skipped} 件はグラフから除外しています。
            </p>
          )}

          <div
            className="w-full rounded-md border border-stone-200 bg-white/70 p-2"
            style={{ height: chartHeight }}
            onMouseLeave={() => {
              if (!isMobile) setSelectedIndex(null)
            }}
            onClick={() => {
              if (isMobile) setSelectedIndex(null)
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartRows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onMouseMove={(state) => {
                  if (isMobile) return
                  const idx = state?.activeTooltipIndex
                  if (typeof idx === 'number') setSelectedIndex(idx)
                }}
              >
                {!isMobile && (
                  <Tooltip
                    content={() => null}
                    cursor={{ stroke: '#d6d3d1', strokeWidth: 1 }}
                    isAnimationActive={false}
                  />
                )}
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e7e5e4"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#78716c' }}
                  tickMargin={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#78716c' }}
                  tickMargin={4}
                  width={44}
                  tickFormatter={(v: number) =>
                    Number.isFinite(v) ? String(Math.round(v * 10) / 10) : ''
                  }
                />
                <Line
                  type="linear"
                  dataKey="value"
                  name={valueLabel}
                  stroke="#1c1917"
                  strokeWidth={2.5}
                  connectNulls
                  isAnimationActive={false}
                  style={{ pointerEvents: 'none' }}
                  dot={(props) => {
                    const { cx, cy, index } = props
                    if (cx == null || cy == null || index == null) return null
                    const active = selectedIndex === index
                    const hitR = isMobile ? 18 : 10
                    const visR = isMobile ? 6 : 3
                    return (
                      <g key={`dot-${index}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={hitR}
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isMobile) setSelectedIndex(index)
                          }}
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={active ? visR + 2 : visR}
                          fill={active ? '#0f766e' : '#1c1917'}
                          stroke="#ffffff"
                          strokeWidth={2}
                          pointerEvents="none"
                        />
                      </g>
                    )
                  }}
                  activeDot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <PointDetail
            point={selectedPoint}
            valueLabel={valueLabel}
            hint={points.length > 0}
            hoverMode={!isMobile}
          />

          <StoreComparison
            summaries={summaries}
            valueLabel={valueLabel}
            compact={compact}
            useCards={useStoreCards}
          />
        </>
      )}
    </div>
  )
}

function PointDetail({
  point,
  valueLabel,
  hint,
  hoverMode,
}: {
  point: TrendPoint | null
  valueLabel: string
  hint: boolean
  hoverMode: boolean
}) {
  if (!point) {
    if (!hint) return null
    return (
      <p className="rounded-md border border-dashed border-stone-200 bg-stone-50/80 px-3 py-2 text-center text-xs text-stone-500">
        {hoverMode
          ? 'グラフ上で横軸の位置に合わせると記録の詳細が表示されます'
          : 'グラフの点をタップすると記録の詳細が表示されます'}
      </p>
    )
  }

  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm">
      <p className="font-medium text-stone-900">
        {point.date} · {point.store}
      </p>
      <p className="mt-1 font-semibold tabular-nums text-stone-900">
        {formatYen(point.value, 2)}
        <span className="ml-1 text-xs font-normal text-stone-500">
          {valueLabel}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-stone-600">
        {formatYen(point.price, 0)} / {point.amount}
        {unitLabel(point.unit)}
      </p>
    </div>
  )
}

function StoreComparison({
  summaries,
  valueLabel,
  compact,
  useCards,
}: {
  summaries: StoreSummary[]
  valueLabel: string
  compact: boolean
  useCards: boolean
}) {
  if (useCards) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-stone-800">
          店舗比較（{valueLabel}）
        </h4>
        <ul className="space-y-2">
          {summaries.map((s) => (
            <li
              key={s.store}
              className="rounded-md border border-stone-200 bg-white/70 px-3 py-2.5 text-sm"
            >
              <p className="truncate font-medium text-stone-900">{s.store}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-stone-700">
                <div>
                  <dt className="text-xs text-stone-500">件数</dt>
                  <dd className="text-sm">{s.count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">平均</dt>
                  <dd className="text-sm font-medium text-stone-900">
                    {formatYen(s.avg, 2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">最安</dt>
                  <dd className="text-sm">{formatYen(s.min, 2)}</dd>
                </div>
                {!compact ? (
                  <>
                    <div>
                      <dt className="text-xs text-stone-500">最高</dt>
                      <dd className="text-sm">{formatYen(s.max, 2)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-stone-500">直近</dt>
                      <dd className="text-sm">
                        {s.latestDate} · {formatYen(s.latestValue, 2)}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt className="text-xs text-stone-500">直近</dt>
                    <dd className="text-sm">
                      {s.latestDate} · {formatYen(s.latestValue, 2)}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium text-stone-800">
        店舗比較（{valueLabel}）
      </h4>
      <div
        className={`overflow-x-auto border border-stone-200 bg-white/70 ${
          compact ? 'max-h-48 overflow-y-auto' : ''
        }`}
      >
        <table className="w-full table-fixed text-left text-base">
          <thead className="sticky top-0 border-b border-stone-200 bg-stone-50 text-sm text-stone-600">
            <tr>
              <th className="w-[34%] px-2 py-2 font-medium">店舗</th>
              <th className="w-[10%] px-2 py-2 font-medium">件</th>
              <th className="w-[18%] px-2 py-2 font-medium">平均</th>
              <th className="w-[18%] px-2 py-2 font-medium">最安</th>
              {!compact && (
                <>
                  <th className="w-[10%] px-2 py-2 font-medium">最高</th>
                  <th className="w-[10%] px-2 py-2 font-medium">直近</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-sm">
            {summaries.map((s) => (
              <tr key={s.store}>
                <td className="truncate px-2 py-2 font-medium text-stone-900">
                  {s.store}
                </td>
                <td className="px-2 py-2 text-stone-700">{s.count}</td>
                <td className="px-2 py-2 font-medium text-stone-900">
                  {formatYen(s.avg, 2)}
                </td>
                <td className="px-2 py-2 text-stone-700">
                  {formatYen(s.min, 2)}
                </td>
                {!compact && (
                  <>
                    <td className="px-2 py-2 text-stone-700">
                      {formatYen(s.max, 2)}
                    </td>
                    <td className="px-2 py-2 text-stone-700">
                      <span className="block truncate">
                        {s.latestDate} · {formatYen(s.latestValue, 2)}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
