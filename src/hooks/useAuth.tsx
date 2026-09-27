import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/api'
import type { SessionUser } from '../types'

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const res = await api.session()
    if (res.ok) setUser(res.data ?? null)
    else setUser(null)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        await refresh()
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password)
    if (!res.ok || !res.data) return res.error || 'فشل تسجيل الدخول'
    setUser(res.data)
    return null
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
