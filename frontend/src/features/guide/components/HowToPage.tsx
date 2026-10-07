import type { ReactNode } from 'react'

const TOC_ITEMS: { id: string; label: string }[] = [
  { id: 'basic-flow', label: '基本の流れ' },
  { id: 'shopping-memo', label: '買い物メモ' },
  { id: 'folders', label: 'フォルダ' },
  { id: 'price-trends', label: '値段推移' },
  { id: 'record-input', label: '記録の入力' },
  { id: 'pc-mobile', label: 'PCとスマホ' },
]

const RECORD_FIELDS: { term: string; desc: string }[] = [
  { term: '購入日 / 確認日', desc: '記録した日' },
  { term: '店舗', desc: '価格を確認した店' },
  { term: '値段', desc: '商品の総額' },
  { term: '数量 / 内容量', desc: '重さ・容量・個数' },
  { term: '単位', desc: 'g / ml / 個 など' },
  { term: 'メモ', desc: '任意の補足' },
]

export function HowToPage() {
  return (
    <section className="space-y-8 text-stone-800 lg:space-y-10">
      <div
        className="rounded-lg border border-stone-200 bg-stone-50 px-5 py-8 text-center"
        aria-label="アプリの概要"
      >
        <p className="text-base font-medium leading-relaxed text-stone-900 sm:text-lg lg:text-xl">
          商品単価を{' '}
          <span className="font-semibold">記録</span>
          <HeroArrow />
          <span className="font-semibold">比較</span>
          {' '}できるアプリです
        </p>
      </div>

      <GuideToc />

      <div className="space-y-4">
        <GuideHeading id="basic-flow">基本の流れ</GuideHeading>
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
      </div>

      <div className="space-y-4">
        <GuideHeading id="shopping-memo">買い物メモ</GuideHeading>
        <p className="text-sm leading-relaxed text-stone-700 lg:text-base">
          店頭で見る品目リストです。フォルダに登録した商品だけを載せます。
        </p>
        <GuideSteps>
          <GuideStep
            n={1}
            title="品目を載せる"
            body="「メモを追加」で品目を選ぶか新規作成します。"
          />
          <GuideStep
            n={2}
            title="値段を試算"
            body="確認日・店名・値段・内容量を入れて単価を確認します。"
          />
          <GuideStep
            n={3}
            title="統計に残す"
            body="必要なら「統計に残す」で記録を保存します。"
          />
        </GuideSteps>
        <details className="rounded-md border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-900">
            便利な使い方
          </summary>
          <ul className="space-y-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-700">
            <li>カードを開くと平均・最安・直近が見えます。</li>
            <li>店名を入れると、その店の記録だけで集計します。</li>
            <li>開いたカードに「フォルダへ」が出ます。</li>
            <li>メモから外しても、フォルダと記録は残ります。</li>
          </ul>
        </details>
      </div>

      <div className="space-y-4">
        <GuideHeading id="folders">フォルダ</GuideHeading>
        <p className="text-sm leading-relaxed text-stone-700 lg:text-base">
          品目名は商品ごと、店名は店舗ごとの記録をまとめます。
        </p>
        <FolderCompare />
        <ul className="space-y-1.5 text-sm text-stone-700 lg:text-base">
          <li>虫眼鏡で品目名と店名を横断検索できます。</li>
          <li>品目カードの ＋ から記録を追加できます。</li>
          <li>カードを開くと直近の記録が見えます。</li>
          <li>「すべての記録を見る」で詳細一覧へ進みます。</li>
        </ul>
      </div>

      <div className="space-y-4">
        <GuideHeading id="price-trends">値段推移</GuideHeading>
        <p className="text-sm leading-relaxed text-stone-700 lg:text-base">
          品目ごとの単価推移をグラフで確認できます。
        </p>
        <div className="space-y-2 text-sm text-stone-700 lg:text-base">
          <p>
            <span className="hidden font-medium text-stone-900 lg:inline">
              PC:
            </span>
            <span className="hidden lg:inline">
              {' '}
              フォルダの品目カードにある
              <MockGraphButton />
              から開きます。
            </span>
            <span className="font-medium text-stone-900 lg:hidden">スマホ:</span>
            <span className="lg:hidden">「値段推移」タブから品目を選びます。</span>
          </p>
        </div>
        <GuideSteps>
          <GuideStep
            n={1}
            title="店舗を選ぶ"
            body="店舗一覧から店を選びます。"
          />
          <GuideStep
            n={2}
            title="もう一度選ぶ"
            body="同じ店を選ぶか「すべて表示」で全店舗に戻ります。"
          />
        </GuideSteps>
      </div>

      <div className="space-y-4">
        <GuideHeading id="record-input">記録の入力</GuideHeading>
        <p className="text-sm text-stone-600">
          フォルダと買い物メモで共通の項目です。
        </p>
        <RecordFields />
        <details className="rounded-md border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-900">
            単位「その他…」
          </summary>
          <p className="border-t border-stone-100 px-4 py-3 text-sm text-stone-700">
            選ぶと内容量の下に自由入力欄が出ます。
          </p>
        </details>
      </div>

      <div className="space-y-4">
        <GuideHeading id="pc-mobile">PCとスマホ</GuideHeading>
        <DeviceCompare />
      </div>

      <details className="rounded-md border border-stone-200 bg-white">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-900">
          見つけにくい機能
        </summary>
        <ul className="space-y-2 border-t border-stone-100 px-4 py-3 text-sm text-stone-700">
          <li>
            品目・店舗の検索入力から、未登録の名前をそのまま追加できます。
          </li>
          <li>フォルダの虫眼鏡は、品目名と店名をまとめて検索します。</li>
          <li>
            品目名の末尾に読み仮名を付けられます。例:{' '}
            <span className="whitespace-nowrap">牛乳（ぎゅうにゅう）</span>
            {' '}→ 一覧では「牛乳」、並び順と検索では読みを使います。
          </li>
          <li>単位は「その他…」で自由に入力できます。</li>
          <li>買い物メモでカードを開いたときだけ「フォルダへ」が出ます。</li>
        </ul>
      </details>
    </section>
  )
}

function HeroArrow() {
  return (
    <span
      className="mx-1.5 inline-flex flex-col items-center align-middle text-stone-400 sm:mx-2"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 48"
        className="h-8 w-5 sm:h-10 sm:w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M12 4v32M6 28l6 8 6-8" />
      </svg>
    </span>
  )
}

function GuideToc() {
  return (
    <nav aria-label="目次">
      <details className="rounded-md border border-stone-200 bg-white lg:hidden">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-stone-900">
          目次
        </summary>
        <ul className="space-y-1.5 border-t border-stone-100 px-4 py-3 text-sm">
          {TOC_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-stone-700 underline-offset-2 hover:text-stone-900 hover:underline"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
      <ul className="hidden flex-wrap gap-x-4 gap-y-2 text-sm lg:flex">
        {TOC_ITEMS.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="text-stone-700 underline-offset-2 hover:text-stone-900 hover:underline"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function GuideHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="scroll-mt-[var(--app-header-h,7.75rem)] rounded-md bg-stone-100 px-4 py-2.5 text-lg font-semibold text-stone-900 lg:text-xl"
    >
      {children}
    </h3>
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

function FolderCompare() {
  return (
    <div className="overflow-hidden rounded-md border border-stone-200 text-sm">
      <div className="grid grid-cols-3 border-b border-stone-200 bg-stone-50 font-medium text-stone-900">
        <div className="px-3 py-2" />
        <div className="border-l border-stone-200 px-3 py-2">品目名</div>
        <div className="border-l border-stone-200 px-3 py-2">店名</div>
      </div>
      <div className="grid grid-cols-3 text-stone-700">
        <div className="px-3 py-2 font-medium text-stone-900">比較単位</div>
        <div className="border-l border-stone-100 px-3 py-2">商品ごと</div>
        <div className="border-l border-stone-100 px-3 py-2">店舗ごと</div>
      </div>
      <div className="grid grid-cols-3 border-t border-stone-100 text-stone-700">
        <div className="px-3 py-2 font-medium text-stone-900">記録の見方</div>
        <div className="border-l border-stone-100 px-3 py-2">
          その品目の記録
        </div>
        <div className="border-l border-stone-100 px-3 py-2">
          その店の記録
        </div>
      </div>
    </div>
  )
}

function MockGraphButton() {
  return (
    <span
      className="mx-1 inline-flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-white text-stone-600"
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
        <path d="M2 12h2V8H2v4zm4 0h2V5H6v7zm4 0h2V2h-2v10z" />
      </svg>
    </span>
  )
}

function RecordFields() {
  return (
    <>
      <dl className="space-y-2 lg:hidden">
        {RECORD_FIELDS.map((field) => (
          <div
            key={field.term}
            className="rounded-md border border-stone-200 bg-white px-3 py-2.5"
          >
            <dt className="text-sm font-medium text-stone-900">{field.term}</dt>
            <dd className="mt-0.5 text-sm text-stone-700">{field.desc}</dd>
          </div>
        ))}
      </dl>
      <div className="hidden overflow-hidden rounded-md border border-stone-200 lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th
                scope="col"
                className="w-[40%] px-3 py-2 font-medium text-stone-900"
              >
                項目
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-stone-900">
                説明
              </th>
            </tr>
          </thead>
          <tbody>
            {RECORD_FIELDS.map((field) => (
              <tr
                key={field.term}
                className="border-b border-stone-100 last:border-b-0"
              >
                <td className="px-3 py-2 align-top font-medium text-stone-900">
                  {field.term}
                </td>
                <td className="px-3 py-2 align-top text-stone-700">
                  {field.desc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DeviceCompare() {
  const rows: { label: string; pc: string; mobile: string }[] = [
    {
      label: 'メモから外す',
      pc: '削除ゾーンへドラッグ',
      mobile: '左スワイプ',
    },
    {
      label: 'メモの並べ替え',
      pc: 'ドラッグ',
      mobile: 'なし',
    },
    {
      label: '値段推移',
      pc: 'フォルダのグラフボタン',
      mobile: '値段推移タブ',
    },
  ]

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
          <div className="px-3 py-2 font-medium text-stone-900">
            {row.label}
          </div>
          <div className="border-l border-stone-100 px-3 py-2">{row.pc}</div>
          <div className="border-l border-stone-100 px-3 py-2">
            {row.mobile}
          </div>
        </div>
      ))}
    </div>
  )
}
