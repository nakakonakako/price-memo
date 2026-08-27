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
import { listFolders } from '@/features/folders/api/foldersApi'
import type { PriceFolder } from '@/features/folders/types'
import { listRecords } from '@/features/records/api/recordsApi'
import type { PriceRecord, PriceUnit } from '@/features/records/types'
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

export function TrendsPage() {
  const [folders, setFolders] = useState<PriceFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unit, setUnit] = useState<PriceUnit>('g')
  const [basis, setBasis] = useState<PriceBasis>('per_100')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setFoldersLoading(true)
      try {
        const list = await listFolders()
        if (cancelled) return
        setFolders(list)
        setFolderId((prev) => prev ?? list[0]?.id ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'フォルダの取得に失敗')
        }
      } finally {
        if (!cancelled) setFoldersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!folderId) {
      setRecords([])
      return
    }
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
          setError(err instanceof Error ? err.message : 'レコードの取得に失敗')
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
    'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500'

  const skipped = records.filter((r) => r.unit !== unit).length

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-stone-900">値段推移</h2>
        <p className="text-sm text-stone-600">
          フォルダ内の厳密単価の推移と、店舗ごとの平均を比較します。
        </p>
      </div>

      {foldersLoading ? (
        <p className="text-sm text-stone-500">フォルダを読み込み中...</p>
      ) : folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
          先にフォルダと厳密レコードを追加してください。
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-stone-500">フォルダ</span>
              <select
                className={fieldClass}
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value)}
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
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
                <option value="per_unit">単位あたり（円/{unitLabel(unit)}）</option>
                {supportsPerHundred(unit) && (
                  <option value="per_100">100{unitLabel(unit)}あたり</option>
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
            <p className="rounded-md border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-stone-500">
              この条件のレコードがありません。記録タブで追加してください。
            </p>
          ) : (
            <>
              {skipped > 0 && (
                <p className="text-xs text-stone-500">
                  単位が異なる {skipped} 件はグラフから除外しています。
                </p>
              )}

              <div className="h-[280px] w-full rounded-md border border-stone-200 bg-white/70 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartRows}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e7e5e4"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#78716c' }}
                      tickMargin={8}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#78716c' }}
                      tickMargin={4}
                      width={48}
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
                        r: 4,
                        fill: '#1c1917',
                        stroke: '#ffffff',
                        strokeWidth: 2,
                      }}
                      activeDot={{ r: 6, fill: '#0f766e' }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-stone-800">
                  店舗比較（安い順・{valueLabel}）
                </h3>
                <div className="overflow-x-auto border border-stone-200 bg-white/70">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">店舗</th>
                        <th className="px-3 py-2 font-medium">件数</th>
                        <th className="px-3 py-2 font-medium">平均</th>
                        <th className="px-3 py-2 font-medium">最安</th>
                        <th className="px-3 py-2 font-medium">最高</th>
                        <th className="px-3 py-2 font-medium">直近</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {summaries.map((s) => (
                        <tr key={s.store}>
                          <td className="px-3 py-2 font-medium text-stone-900">
                            {s.store}
                          </td>
                          <td className="px-3 py-2 text-stone-600">{s.count}</td>
                          <td className="px-3 py-2 text-stone-800">
                            {formatYen(s.avg, 2)}
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {formatYen(s.min, 2)}
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {formatYen(s.max, 2)}
                          </td>
                          <td className="px-3 py-2 text-stone-600">
                            {s.latestDate} · {formatYen(s.latestValue, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
