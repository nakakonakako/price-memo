/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { applyAuthIdentity } from '@/lib/authIdentity'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  session: Session | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let authListenerHandled = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authListenerHandled = true
      applyAuthIdentity(session)
      setSession(session)
      setIsLoading(false)
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!authListenerHandled) {
        applyAuthIdentity(session)
        setSession(session)
        setIsLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
