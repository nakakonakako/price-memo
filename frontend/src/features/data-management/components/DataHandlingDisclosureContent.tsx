/** Shared copy for the in-app「データの取り扱い」dialog (Auth + データ管理). */
export const DATA_HANDLING_DISCLOSURE_TEST_ID = 'data-handling-disclosure-content'

export function DataHandlingDisclosureContent() {
  return (
    <div
      className="space-y-4 text-sm leading-6 text-stone-700"
      data-testid={DATA_HANDLING_DISCLOSURE_TEST_ID}
    >
      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">保存するデータと目的</h3>
        <p>
          単価メモ（price-memo）では、ログイン中のあなたが入力したフォルダ名・店舗名・買い物メモ、価格記録（日付・価格・量・単位、任意のメモ、任意のレシート明細への参照）を Supabase に保存し、厳密な単価比較・値段推移・店舗別の閲覧・買い物メモに利用します。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">ログインと外部サービス</h3>
        <p>
          ログインは Google OAuth（Supabase Auth）を使います。アプリの内容データは Supabase のデータベースに保存されます。価格記録の追加画面で、任意の「レシート明細の検索」を行う場合のみ、あなた自身のレシートアプリ（receipt-manager）側の行を読み取り専用で参照します（検索しない限りアクセスしません）。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">ブラウザ上の一時的な状態</h3>
        <p>
          画面に表示しているデータや入力途中の内容は、利用中のみブラウザ内に一時的に保持されます。フォルダ名・店舗名・価格記録・買い物メモなど、登録したアプリデータは Supabase のデータベースに保存されます。ログイン状態（セッション）の情報は、Supabase の認証クライアントによりブラウザ側で保持・更新されます。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">AI（Gemini）への送信</h3>
        <p>
          現行の price-memo のフロントエンド・バックエンド実装から、Google Gemini へあなたのデータを送る処理はありません。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">保存期間と削除</h3>
        <p>
          フォルダ・価格記録・買い物メモ・店舗名など、price-memo に登録した主なデータには、自動削除や有効期限の設定はありません。フォルダ・記録・店舗・買い物メモは、画面から個別に削除できます。データ管理画面の「すべてのデータを削除」は、あなたの price-memo 用4テーブル（フォルダ・価格記録・買い物メモ・店舗名）を一括削除する操作です。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">ログアウトと削除の関係</h3>
        <p>
          ログアウトはセッションを終えるだけで、Supabase に保存した price-memo データは削除しません。データ削除を実行しても、ログアウトは行われず、Supabase Auth のアカウントは残ります。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">一括削除の対象外</h3>
        <p>
          一括削除の対象は price-memo の4テーブルのみです。Google / Supabase Auth のアカウントや、レシートアプリ側のレシート・CSV・チャット等のデータは削除されません。
        </p>
      </section>

      <section className="space-y-1">
        <h3 className="font-medium text-stone-900">バックアップ・ログについて</h3>
        <p>
          画面上の削除やデータベース上の削除は、Supabase に保存されている price-memo の登録データを対象とします。バックアップやサービス提供者側の運用ログに残るコピーは、この削除の対象外であり、削除後も直ちにすべて消えるとは限りません。
        </p>
      </section>
    </div>
  )
}
