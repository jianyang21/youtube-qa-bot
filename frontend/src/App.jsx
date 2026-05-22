import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import AuthPage from './AuthPage'

const SUGGESTIONS = [
  'Summarize this video',
  'What are the main points?',
  'What problems does it solve?',
  'Give me key takeaways',
]

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatWords(n) {
  return n > 1000 ? `${(n / 1000).toFixed(1)}k words` : `${n} words`
}

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function authHeader() {
  const token = localStorage.getItem('yt_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`message${isUser ? ' user' : ''}`}>
      <div className={`avatar ${isUser ? 'avatar-user' : 'avatar-ai'}`}>
        {isUser ? 'You' : '▶'}
      </div>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-ai'}`}>
        {msg.content || ''}
        {msg.streaming && <span className="cursor" />}
      </div>
    </div>
  )
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-pill"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="user-avatar">{getInitials(user.username)}</div>
        <span className="user-name">{user.username}</span>
        <svg className={`chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="user-dropdown">
          <div className="dropdown-header">
            <div className="dropdown-name">{user.username}</div>
            <div className="dropdown-email">{user.email}</div>
          </div>
          <div className="dropdown-divider" />
          <button
            className="dropdown-item danger"
            onClick={() => { setOpen(false); onLogout() }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const { user, loading, logout } = useAuth()
  const [url, setUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const chatEndRef = useRef(null)
  const questionRef = useRef(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendQuestion = useCallback(async (q) => {
    const text = q.trim()
    if (!text || asking || !transcript) return
    setQuestion('')
    setAsking(true)
    const userMsg = { id: Date.now(), role: 'user', content: text }
    const aiMsg = { id: Date.now() + 1, role: 'ai', content: '', streaming: true }
    setMessages(prev => [...prev, userMsg, aiMsg])
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ question: text, transcript, video_title: videoInfo?.title || 'this video' }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Request failed') }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'text') {
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: m.content + event.content } : m))
            } else if (event.type === 'done') {
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, streaming: false } : m))
            } else if (event.type === 'error') {
              setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: `Error: ${event.content}`, streaming: false } : m))
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === aiMsg.id ? { ...m, content: `Error: ${err.message}`, streaming: false } : m))
    } finally {
      setAsking(false)
      questionRef.current?.focus()
    }
  }, [asking, transcript, videoInfo])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">▶</div>
      </div>
    )
  }

  if (!user) return <AuthPage />

  const handleAnalyze = async (e) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    setAnalyzing(true)
    setAnalyzeError('')
    setVideoInfo(null)
    setTranscript('')
    setMessages([])
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to analyze video')
      setVideoInfo(data)
      setTranscript(data.transcript)
    } catch (err) {
      setAnalyzeError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleReset = () => {
    setUrl('')
    setVideoInfo(null)
    setTranscript('')
    setMessages([])
    setAnalyzeError('')
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">▶</div>
          <div>
            <div className="header-title">YouTube Q&A</div>
            <div className="header-subtitle">AI-powered video analysis</div>
          </div>
        </div>
        <UserMenu user={user} onLogout={logout} />
      </header>

      <div className="url-section">
        <form className="url-form" onSubmit={handleAnalyze}>
          <input
            className="url-input"
            type="text"
            placeholder="Paste a YouTube URL…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={analyzing}
          />
          {videoInfo ? (
            <button type="button" className="btn btn-ghost" onClick={handleReset}>New Video</button>
          ) : (
            <button type="submit" className="btn btn-accent" disabled={analyzing || !url.trim()}>
              {analyzing ? <><span className="spinner" />Analyzing…</> : 'Analyze'}
            </button>
          )}
        </form>

        {analyzeError && <div className="error-banner">⚠ {analyzeError}</div>}

        {videoInfo && (
          <div className="video-card">
            {videoInfo.thumbnail ? (
              <img
                className="video-thumbnail"
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="video-thumb-placeholder">🎬</div>
            )}
            <div className="video-meta">
              <div className="video-title">{videoInfo.title}</div>
              <div className="video-author">{videoInfo.author}</div>
              <div className="video-stats">
                <span className="stat-pill">⏱ {formatDuration(videoInfo.duration_seconds)}</span>
                <span className="stat-pill">📝 {formatWords(videoInfo.word_count)}</span>
                <span className="stat-pill ready">✓ Transcript ready</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-area">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            {videoInfo ? (
              <>
                <h2>Ready — ask anything</h2>
                <p>The transcript is loaded. Try one of these to get started:</p>
                <div className="chips">
                  {SUGGESTIONS.map(s => (
                    <button key={s} className="chip" onClick={() => sendQuestion(s)}>{s}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2>No video loaded</h2>
                <p>Paste a YouTube URL above and hit Analyze to get started.</p>
              </>
            )}
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="input-row">
        <textarea
          ref={questionRef}
          className="question-input"
          placeholder={videoInfo ? 'Ask anything about the video…' : 'Load a video first…'}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(question) } }}
          disabled={!videoInfo || asking}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={() => sendQuestion(question)}
          disabled={!videoInfo || asking || !question.trim()}
          title="Send (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
