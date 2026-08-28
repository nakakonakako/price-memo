import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
} from '../utils/aggregate'

type Props = {
  folderId: string
  folderName?: string
  compact?: boolean
  onClose?: () => void
}

export function FolderTrendPanel({
  folderId,
  folderName,
  compact = false,
  onClose,
}: Props) {
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unit, setUnit] = useState<PriceUnit>('g')
  const [basis, setBasis] = useState<PriceBasis>('per_100')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setRecordsLoading(true)
      setError(null)
      try {
        const list = await listRecords(folderId)
        if (cancelled) return
        setRecords(list)
        const dom = dominantUnit(list)
        if (dom) {
          setUnit(dom)
          setBasis(supportsPerHundred(dom) ? 'per_100' : 'per_unit')
        }
      } catch (err) {
        if (!cancelled) {
          setError(toUserMessage(err, 'レコードの取得に失敗しました。'))
        }
      } finally {
        if (!cancelled) setRecordsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderId])

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

  const valueLabel =
    effectiveBasis === 'per_100'
      ? `円/100${unitLabel(unit)}`
      : `円/${unitLabel(unit)}`

  const fieldClass =
    'w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-stone-500'

  const skipped = records.filter((r) => r.unit !== unit).length
  const chartHeight = compact ? 220 : 280

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white/80 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-stone-900">値段推移</h3>
          {folderName && (
            <p className="truncate text-xs text-stone-600">{folderName}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
          >
            閉じる
          </button>
        )}
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-3'}`}>
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
      </div>

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
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartRows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
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
                <Tooltip
                  formatter={(value) => {
                    const n =
                      typeof value === 'number' ? value : Number(value)
                    if (!Number.isFinite(n)) return ['—', valueLabel]
                    return [formatYen(n, 2), valueLabel]
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as
                      | { date?: string; store?: string }
                      | undefined
                    if (!row?.date) return ''
                    return row.store
                      ? `${row.date} · ${row.store}`
                      : row.date
                  }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    borderColor: '#d6d3d1',
                  }}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  name={valueLabel}
                  stroke="#1c1917"
                  strokeWidth={2.5}
                  dot={{
                    r: 3,
                    fill: '#1c1917',
                    stroke: '#ffffff',
                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 5, fill: '#0f766e' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-medium text-stone-800">
              店舗比較（{valueLabel}）
            </h4>
            <div
              className={`overflow-x-auto border border-stone-200 bg-white/70 ${
                compact ? 'max-h-48 overflow-y-auto' : ''
              }`}
            >
              <table className="w-full min-w-[20rem] text-left text-xs">
                <thead className="sticky top-0 border-b border-stone-200 bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">店舗</th>
                    <th className="px-2 py-1.5 font-medium">件</th>
                    <th className="px-2 py-1.5 font-medium">平均</th>
                    <th className="px-2 py-1.5 font-medium">最安</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {summaries.map((s) => (
                    <tr key={s.store}>
                      <td className="px-2 py-1.5 font-medium text-stone-900">
                        {s.store}
                      </td>
                      <td className="px-2 py-1.5 text-stone-600">{s.count}</td>
                      <td className="px-2 py-1.5 text-stone-800">
                        {formatYen(s.avg, 2)}
                      </td>
                      <td className="px-2 py-1.5 text-stone-600">
                        {formatYen(s.min, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
