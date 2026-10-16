/** Shared copy for the in-app「データの取り扱い」dialog (Auth + データ管理). */
export const DATA_HANDLING_DISCLOSURE_TEST_ID = 'data-handling-disclosure-content'

export function DataHandlingDisclosureContent() {
  return (
    <div
      className="space-y-4 text-sm leading-6 text-stone-700"
      data-testid={DATA_HANDLING_DISCLOSURE_TEST_ID}
    >
      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">1. 取得する情報と利用目的</h3>
        <p>
          本アプリでは、利用者が登録した商品フォルダ、店舗情報、価格記録、買い物メモを取得・保存します。
        </p>
        <p>
          価格記録には、購入日、価格、数量、単位、任意で入力されたメモなどが含まれます。
        </p>
        <p>
          これらの情報は、商品の単価比較、価格推移の表示、店舗別の記録管理、買い物メモの提供に使用します。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">2. データの保存先と外部サービス</h3>
        <p>
          登録されたデータは、Supabaseが提供するデータベースに保存します。データへのアクセスは利用者ごとに制限し、他の利用者による閲覧や変更を防止する仕組みを設けています。
        </p>
        <p>
          認証にはGoogleの認証サービスおよびSupabase Authを使用します。ログイン状態の維持に必要な情報はブラウザに保存され、画面表示や入力途中の情報はアプリの利用中に一時的に保持されます。
        </p>
        <p>
          レシート管理アプリとの連携機能では、利用者がレシート明細の検索を実行した場合に限り、当該利用者の購入履歴を参照します。
        </p>
        <p>本アプリからGoogle Geminiへのデータ送信は行いません。</p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">3. データの保持と削除</h3>
        <p>
          登録された商品フォルダ、価格記録、店舗情報、買い物メモについて、保存期限や定期的な自動削除は設定していません。
        </p>
        <p>
          利用者は、アプリ内の操作により個別のデータを削除できます。また、データ管理機能から、本アプリに登録したデータを一括削除できます。
        </p>
        <p>
          削除処理は、データベースに保存された対象データに対して実行されます。ただし、バックアップやサービス運用上のログについては、削除後も一定期間情報が残る場合があります。
        </p>
      </section>
    </div>
  )
}
