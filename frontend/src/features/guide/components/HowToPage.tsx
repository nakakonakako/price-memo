import { useMediaQuery } from '@/hooks/useMediaQuery'

export function HowToPage() {
  const isMobile = useMediaQuery('(max-width: 1023px)')

  return (
    <section className="space-y-8 text-stone-800 lg:space-y-10">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold text-stone-900 lg:text-3xl">
          単価メモとは
        </h2>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          スーパーやドラッグストアで買い物するとき、品目ごとの単価を記録・比較するためのアプリです。
          内容量と値段から厳密な単価を計算し、店舗や時期による値段の違いを把握できます。
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          買い物メモ
        </h3>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          店頭で見るためのリストです。フォルダに登録した品目をメモに載せ、現場で値段を入力できます。
        </p>
        <ul className="list-inside list-disc space-y-2 text-base text-stone-700 lg:text-lg">
          <li>「メモを追加」から品目名を入力。未掲載の既存フォルダが候補に出ます（ひらがな入力でもカタカナ名にヒット）</li>
          <li>候補から選ぶか「追加」で新規作成。一致しなければ新規作成できます</li>
          <li>カードをタップして開き、確認日・店名・値段（総額）・内容量を入力すると試算単価が表示されます</li>
          <li>「統計に残す」でフォルダの記録として保存（店名は保存時に必須）</li>
          <li>単位は g / ml / 個 のほか「その他…」で自由入力（内容量の下に欄が出ます）</li>
          <li>保存するとフォルダ側の記録にも残り、平均・最安・直近の統計が更新されます</li>
          <li>店名を入れると、その店の記録だけに絞った統計を表示できます</li>
          {isMobile ? (
            <li>閉じたカードはタップで入力フォームを開きます。左にスワイプするとメモから外れます（フォルダ自体は残ります）</li>
          ) : (
            <>
              <li>閉じたカードをタップして入力フォームを開きます</li>
              <li>ドラッグで並べ替え、右側の削除エリアへドロップでメモから外せます</li>
            </>
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">フォルダ</h3>
        <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
          品目名・店名のカタログと、価格記録の本棚です。
        </p>
        <ul className="list-inside list-disc space-y-2 text-base text-stone-700 lg:text-lg">
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
          <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
            値段推移（PC）
          </h3>
          <p className="text-base leading-relaxed text-stone-700 lg:text-lg">
            フォルダタブのグラフボタンから、品目ごとの単価の推移を確認できます。
            スマホでは「値段推移」タブから同様のグラフを表示します。
          </p>
          <ul className="list-inside list-disc space-y-2 text-base text-stone-700 lg:text-lg">
            <li>上からグラフ、記録の詳細、店舗一覧の順に表示されます</li>
            <li>グラフ上で横軸の位置に合わせると、記録の詳細が表示されます</li>
            <li>店舗一覧から店を選ぶと、その店の記録だけでグラフを表示できます</li>
            <li>もう一度同じ店を選ぶか「すべて表示」で全店舗に戻せます</li>
          </ul>
        </div>
      )}

      {isMobile && (
        <div className="space-y-3">
          <h3 className="text-xl font-semibold text-stone-900">値段推移</h3>
          <p className="text-base leading-relaxed text-stone-700">
            フォルダを選ぶと、単価の推移グラフと店舗一覧が表示されます。
          </p>
          <ul className="list-inside list-disc space-y-2 text-base text-stone-700">
            <li>上からグラフ、記録の詳細、店舗一覧の順に表示されます</li>
            <li>グラフの点をタップすると記録の詳細が表示されます</li>
            <li>店舗一覧から店をタップすると、その店の記録だけでグラフを表示できます</li>
            <li>もう一度同じ店をタップすると全店舗に戻せます</li>
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          記録の入力（フォルダ・メモ共通）
        </h3>
        <ul className="list-inside list-disc space-y-2 text-base text-stone-700 lg:text-lg">
          <li>
            <strong>購入日 / 確認日</strong> … いつ確認・購入したか（メモでは「確認日」）
          </li>
          <li>
            <strong>店舗</strong> … カタログから選ぶか新規登録。メモ保存時は必須
          </li>
          <li>
            <strong>値段</strong> … 税込など、その場で見た総額（円・整数）
          </li>
          <li>
            <strong>数量 / 内容量</strong> … パックの量（g・ml・個など）。単位とセットで単価を計算
          </li>
          <li>
            <strong>単位</strong> … プリセット以外は「その他…」→ 内容量の下の欄に入力。確定は欄からフォーカスが外れたとき
          </li>
          <li>
            <strong>メモ（任意）</strong> … 補足メモ
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        <h3 className="text-xl font-semibold text-stone-900 lg:text-2xl">
          単価の考え方
        </h3>
        <ul className="list-inside list-disc space-y-2 text-base text-stone-700 lg:text-lg">
          <li>記録は「総額（円）」と「内容量（g・ml など）」から単価を計算します</li>
          <li>g や ml などは 100 単位あたりの表示にも切り替えできます</li>
          <li>フォルダ名の末尾に（よみがな）を付けると、名前順の並び替えに使えます</li>
        </ul>
      </div>
    </section>
  )
}
