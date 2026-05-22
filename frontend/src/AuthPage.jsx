import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = mode === 'login'
        ? { email, password }
        : { email, password, username }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong.')
      login(data.access_token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => { setMode(next); setError('') }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">▶</div>
          <span className="auth-brand-name">YouTube Q&A</span>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`auth-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => switchMode('register')}
            type="button"
          >
            Sign Up
          </button>
        </div>

        <div className="auth-heading-block">
          <h1 className="auth-heading">
            {mode === 'login' ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="auth-sub">
            {mode === 'login'
              ? 'Sign in to start asking questions about any YouTube video.'
              : 'Join to analyze YouTube videos with AI — free, no credit card.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-field">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                placeholder="Your display name"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus={mode === 'login'}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? <><span className="spinner" />{mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === 'login'
            ? <>Don't have an account? <button type="button" onClick={() => switchMode('register')}>Sign up free</button></>
            : <>Already have an account? <button type="button" onClick={() => switchMode('login')}>Sign in</button></>}
        </p>
      </div>
    </div>
  )
}
