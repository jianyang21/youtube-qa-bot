import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('yt_token')
    if (!token) { setLoading(false); return }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setUser(data)
        else localStorage.removeItem('yt_token')
      })
      .catch(() => localStorage.removeItem('yt_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = (token, userData) => {
    localStorage.setItem('yt_token', token)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('yt_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
