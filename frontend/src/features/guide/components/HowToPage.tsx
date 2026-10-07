import type { ReactNode } from 'react'
import {
  formatYen,
  perHundredPrice,
  unitLabel,
  unitPrice,
} from '@/features/records/utils/unitPrice'

const EXAMPLE_G_PRICE = 298
const EXAMPLE_G_AMOUNT = 500
const EXAMPLE_PIECE_PRICE = 198
const EXAMPLE_PIECE_AMOUNT = 6

const exampleGPerUnit = unitPrice(EXAMPLE_G_PRICE, EXAMPLE_G_AMOUNT)!
const exampleGPerHundred = perHundredPrice(
  EXAMPLE_G_PRICE,
  EXAMPLE_G_AMOUNT,
  'g',
)!
const examplePiecePerUnit = unitPrice(
  EXAMPLE_PIECE_PRICE,
  EXAMPLE_PIECE_AMOUNT,
)!

export function HowToPage() {
  return (
    <section className="space-y-10 text-stone-800 lg:space-y-12">
      {/* 1. 概要 */}
      <header className="space-y-3">
        <h2 className="text-2xl font-semibold text-stone-900 lg:text-3xl">
          単価メモとは
        </h2>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          スーパーやドラッグストアで買い物するとき、品目ごとの単価を記録・比較するためのアプリです。
          値段と内容量から厳密な単価を計算し、店舗や時期による違いを把握できます。
        </p>
      </header>

      {/* 2. 基本3ステップ */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          基本の流れ
        </h3>
        <ol className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StepCard
            n={1}
            title="品目をフォルダに登録"
            body="比較したい商品（鶏むね・牛乳など）を品目名フォルダとして登録します。"
          />
          <StepCard
            n={2}
            title="値段と内容量を記録"
            body="購入日・店名・総額・内容量・単位を入力して記録します。買い物メモからその場で保存もできます。"
          />
          <StepCard
            n={3}
            title="単価で比較"
            body="記録から単価を計算し、平均・最安・推移グラフで店舗や時期の違いを確認します。"
          />
        </ol>
      </div>

      {/* 3. 買い物メモ */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          買い物メモ
        </h3>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          店頭で見るためのリストです。フォルダに登録した品目だけを載せ、過去の統計を見ながらその場で値段を試算できます。
          フォルダタブで棚を作っても、メモに載せない限り店頭一覧には出ません。
        </p>
        <ol className="space-y-3">
          <FlowStep
            n={1}
            title="品目をメモに載せる"
            body="「メモを追加」で品目名を入力。未掲載の既存フォルダが候補に出ます（ひらがな入力でもカタカナ名にヒット）。候補から選ぶか「追加」で新規作成でき、追加した品目は一覧の一番上に来ます。"
          />
          <FlowStep
            n={2}
            title="統計を確認する"
            body="閉じたカードをタップして開き、平均・最安・直近の統計を確認します。複数単位がある場合は単位切替ボタンで切り替えられます。"
          />
          <FlowStep
            n={3}
            title="値段を入力して試算"
            body="確認日・店名・値段（総額）・内容量を入力すると、試算単価が表示されます。保存しなくても試算だけ利用できます。"
          />
          <FlowStep
            n={4}
            title="統計に残す"
            body="「統計に残す」でフォルダの記録として保存します。店名は保存時に必須です。保存後はフォルダ側の平均・最安・直近も更新されます。"
          />
        </ol>
        <ul className="space-y-1 text-sm text-stone-600">
          <li>
            店名を入れると、平均・最安・直近はその店の記録だけで計算されます（未入力時は全体）。
          </li>
          <li>
            カードを開いたとき、品目名の右に「フォルダへ」が出ます。押すとその品目のフォルダ詳細を開きます（カードは開いたまま）。
          </li>
          <li>メモから外しても、フォルダ本体と記録は残ります。</li>
        </ul>
      </div>

      {/* 4. フォルダ */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          フォルダ
        </h3>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          品目名・店名のカタログと、価格記録の本棚です。画面上部で品目名と店名を切り替えられます。
        </p>
        <GuideTable
          headers={['', '品目名', '店名']}
          rows={[
            ['役割', '比較したい商品の棚', '店舗名の正規カタログ'],
            [
              '一覧',
              '品目カード（琥珀色）',
              '店名カード（緑色）',
            ],
            [
              'プレビュー',
              'カードをタップで直近 3 件',
              'カードをタップで直近 3 件',
            ],
            [
              '詳細',
              'その品目の全記録（購入日の新しい順）',
              'その店の全記録（全品目横断）',
            ],
          ]}
        />
        <p className="text-base text-stone-700 lg:text-lg">主な操作</p>
        <ul className="list-inside list-disc space-y-1.5 text-base text-stone-700 lg:text-lg">
          <li>
            プレビュー下の「すべての記録を見る」または件数バッジから詳細一覧へ進みます
          </li>
          <li>虫眼鏡でフォルダ名・店舗名をまとめて検索できます</li>
          <li>詳細一覧では記録の複製・編集ができ、並べ替えはありません</li>
          <li>品目カードの ＋ から記録を追加できます</li>
        </ul>
      </div>

      {/* 5. 値段推移 */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          値段推移
        </h3>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          品目ごとの単価の推移をグラフで確認し、店舗で絞り込んで比較できます。
        </p>
        <p className="text-sm text-stone-600 lg:text-base">
          <span className="hidden lg:inline">
            PC ではフォルダタブの品目カードにあるグラフボタンから開きます。カタログが左半分に寄り、右半分に推移パネルが表示されます。
          </span>
          <span className="lg:hidden">
            スマホでは「値段推移」タブから、品目を選んでグラフを表示します。
          </span>
        </p>
        <ol className="list-inside list-decimal space-y-1.5 text-base text-stone-700 lg:text-lg">
          <li>上からグラフ、記録の詳細、店舗一覧の順に表示されます</li>
          <li>
            <span className="hidden lg:inline">
              グラフ上で横軸の位置に合わせると、記録の詳細が表示されます
            </span>
            <span className="lg:hidden">
              グラフの点をタップすると記録の詳細が表示されます
            </span>
          </li>
          <li>
            店舗一覧から店を選ぶと、その店の記録だけでグラフを表示できます
          </li>
          <li>
            もう一度同じ店を選ぶか「すべて表示」で全店舗に戻せます
          </li>
        </ol>
      </div>

      {/* 6. 記録の入力 */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          記録の入力
        </h3>
        <p className="text-sm text-stone-600 lg:text-base">
          フォルダ・買い物メモで共通の入力項目です。
        </p>
        <GuideTable
          headers={['項目', '内容']}
          rows={[
            [
              '購入日 / 確認日',
              'いつ確認・購入したか（メモでは「確認日」）',
            ],
            [
              '店舗',
              'カタログから選ぶか新規登録。メモ保存時は必須',
            ],
            ['値段', '税込など、その場で見た総額（円・整数）'],
            [
              '数量 / 内容量',
              'パックの量（g・ml・個など）。単位とセットで単価を計算',
            ],
            ['単位', 'g / ml / 個、または「その他…」で自由入力'],
            ['メモ', '任意の補足'],
          ]}
        />
        <p className="text-sm text-stone-600">
          単位「その他…」を選ぶと、内容量の下に自由入力欄が出ます。
        </p>
      </div>

      {/* 7. PC / スマホの操作の違い */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          PC とスマホの操作
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OpsCard title="PC（1024px 以上）">
            <ul className="list-inside list-disc space-y-1.5">
              <li>買い物メモ: ドラッグで並べ替え、右端の削除ゾーンへドロップでメモから外す（削除ゾーンはドラッグ中のみ表示）</li>
              <li>フォルダ: 品目・店名・記録はドラッグ中だけ右側に出るゴミ箱へドロップで削除</li>
              <li>値段推移: フォルダタブのグラフボタンから横並びパネルで表示</li>
            </ul>
          </OpsCard>
          <OpsCard title="スマホ">
            <ul className="list-inside list-disc space-y-1.5">
              <li>買い物メモ: カードを左へ十分スワイプでメモから外す（途中で止めると元に戻ります）</li>
              <li>フォルダ: 品目・店名カード、記録行は左スワイプで削除（記録ありのフォルダ削除は確認あり）</li>
              <li>値段推移: 専用タブから品目を選んで表示</li>
            </ul>
          </OpsCard>
        </div>
        <p className="text-sm text-stone-600">
          長くスクロールしたときは、買い物メモ・フォルダ・記録詳細で右下の ↑ からページ上部へ戻れます。
        </p>
      </div>

      {/* 8. 単価の考え方 */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          単価の考え方
        </h3>
        <p className="text-base text-stone-700 lg:text-lg">
          記録は「総額（円）」÷「内容量」で単価を計算します。
        </p>
        <div className="space-y-3 rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-base text-stone-700">
          <p>
            <span className="font-medium text-stone-900">例（g）</span>{' '}
            総額 {formatYen(EXAMPLE_G_PRICE, 0)}・内容量 {EXAMPLE_G_AMOUNT}g
            <br />
            単価 {formatYen(exampleGPerUnit, 2)}/{unitLabel('g')}
            {exampleGPerHundred != null && (
              <>
                {' '}
                · 100{unitLabel('g')}あたり{' '}
                {formatYen(exampleGPerHundred, 1)}
              </>
            )}
          </p>
          <p>
            <span className="font-medium text-stone-900">例（個）</span>{' '}
            総額 {formatYen(EXAMPLE_PIECE_PRICE, 0)}・内容量{' '}
            {EXAMPLE_PIECE_AMOUNT}個
            <br />
            単価 {formatYen(examplePiecePerUnit, 2)}/{unitLabel('piece')}
          </p>
        </div>
        <p className="text-sm text-stone-600">
          g や ml は 100 単位あたりの表示にも切り替えられます。フォルダ名の末尾に（よみがな）を付けると、名前順の並び替えに使えます。
        </p>
      </div>
    </section>
  )
}

function StepCard({
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
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-stone-900">{title}</p>
        <p className="text-sm leading-relaxed text-stone-700">{body}</p>
      </div>
    </li>
  )
}

function FlowStep({
  n,
  title,
  body,
}: {
  n: number
  title: string
  body: string
}) {
  return (
    <li className="flex gap-3 border-b border-stone-100 pb-3 last:border-b-0 last:pb-0">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-sm font-semibold text-stone-800"
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-stone-900">{title}</p>
        <p className="text-sm leading-relaxed text-stone-700 lg:text-base">
          {body}
        </p>
      </div>
    </li>
  )
}

function GuideTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200">
      <table className="w-full min-w-[280px] border-collapse text-left text-sm lg:text-base">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2 font-medium text-stone-900 first:whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-stone-100 last:border-b-0"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-2 align-top text-stone-700 [overflow-wrap:anywhere]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OpsCard({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
      <p className="mb-2 font-medium text-stone-900">{title}</p>
      {children}
    </div>
  )
}
