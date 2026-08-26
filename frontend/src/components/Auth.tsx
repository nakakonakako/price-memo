import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function Auth() {
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      })
      if (error) throw error
    } catch (error) {
      console.error('Login error:', error)
      alert('ログインに失敗しました。もう一度お試しください。')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="text-xs tracking-wide text-stone-500">機能 B · 厳密単価比較</p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          単価メモ
        </h1>
        <p className="text-sm text-stone-600">
          比較したい商品を手動フォルダで管理するためにログインしてください。
          （AI家計簿と同じ Google アカウントで入れます）
        </p>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {isLoading ? '処理中...' : 'Googleでログイン'}
        </button>
      </div>
    </div>
  )
}
