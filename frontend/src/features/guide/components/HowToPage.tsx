import { useMediaQuery } from '@/hooks/useMediaQuery'

export function HowToPage() {
  const isMobile = useMediaQuery('(max-width: 1023px)')

  return (
    <section className="space-y-8 text-stone-800">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-stone-900">単価メモとは</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          スーパーやドラッグストアで買い物するとき、品目ごとの単価を記録・比較するためのアプリです。
          内容量と値段から厳密な単価を計算し、店舗や時期による値段の違いを把握できます。
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-900">買い物メモ</h3>
        <p className="text-sm leading-relaxed text-stone-700">
          店頭で見るためのリストです。フォルダに登録した品目をメモに載せ、現場で値段を入力できます。
        </p>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-stone-700">
          <li>「メモを追加」から既存フォルダを選ぶか、新しい品目名で追加</li>
          <li>カードを開いて内容量・値段・店名を入力すると単価が表示されます</li>
          <li>保存するとフォルダ側の記録にも残り、平均・最安・直近の統計が更新されます</li>
          <li>店名を入れると、その店の記録だけに絞った統計を表示できます</li>
          {isMobile ? (
            <li>左にスワイプするとメモから外れます（フォルダ自体は残ります）</li>
          ) : (
            <li>ドラッグで並べ替え、右側の削除エリアへドロップでメモから外せます</li>
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-900">フォルダ</h3>
        <p className="text-sm leading-relaxed text-stone-700">
          品目名・店名のカタログと、価格記録の本棚です。
        </p>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-stone-700">
          <li>
            <strong>品目名</strong> … 鶏むね・牛乳などのフォルダ。中に記録（日付・店・値段・内容量）を追加
          </li>
          <li>
            <strong>店名</strong> … よく行く店舗の一覧。店ごとに記録を確認できます
          </li>
          <li>虫眼鏡ボタンでフォルダ・店舗を検索</li>
          {isMobile ? (
            <li>左スワイプで削除（記録がある場合は確認あり）</li>
          ) : (
            <>
              <li>記録の並べ替えはドラッグ、削除はゴミ箱へドロップ</li>
              <li>グラフボタンで値段推移パネルを横に表示（PC）</li>
            </>
          )}
        </ul>
      </div>

      {!isMobile && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-stone-900">値段推移（PC）</h3>
          <p className="text-sm leading-relaxed text-stone-700">
            フォルダタブのグラフボタンから、品目ごとの単価の推移を確認できます。
            スマホでは「値段推移」タブから同様のグラフを表示します。
          </p>
          <ul className="list-inside list-disc space-y-1.5 text-sm text-stone-700">
            <li>グラフ上で横軸の位置に合わせると、記録の詳細が下に表示されます</li>
            <li>店舗比較で、店ごとの平均・最安などを一覧できます</li>
          </ul>
        </div>
      )}

      {isMobile && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-stone-900">値段推移</h3>
          <p className="text-sm leading-relaxed text-stone-700">
            フォルダを選んで、単価の推移グラフと店舗比較を見られます。グラフの点をタップすると詳細が表示されます。
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-stone-900">単価の考え方</h3>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-stone-700">
          <li>記録は「総額（円）」と「内容量（g・ml など）」から単価を計算します</li>
          <li>g や ml などは 100 単位あたりの表示にも切り替えできます</li>
          <li>フォルダ名の末尾に（よみがな）を付けると、名前順の並び替えに使えます</li>
        </ul>
      </div>
    </section>
  )
}
