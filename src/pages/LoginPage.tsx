import { useState, type FormEvent } from 'react'
import { BrandMark } from '../components/BrandMark'
import { Button, Input } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../lib/toast'

export function LoginPage() {
  const { login } = useAuth()
  const toast = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const err = await login(username.trim(), password)
      if (err) {
        setError(err)
        toast.error(err)
      } else {
        toast.success('مرحباً بك')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-veggies-bg" aria-hidden>
        <img src="/images/veggies-hero.png" alt="" />
      </div>
      <div className="login-card">
        <div className="login-logo">
          <BrandMark size={72} variant="app" />
        </div>
        <h1>خضرة</h1>
        <p className="login-sub">إدارة محلك ببساطة</p>
        <form className="login-form" onSubmit={onSubmit}>
          <Input
            label="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
          <Input
            label="كلمة المرور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && (
            <div className="field-error" style={{ textAlign: 'center' }}>
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </Button>
        </form>
      </div>
    </div>
  )
}
