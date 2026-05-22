# YouTube Q&A Bot

A full-stack web app that lets you paste any YouTube URL and chat with an AI about the video's content.

## Features

- 🔐 Authentication — sign up, log in, log out with JWT + bcrypt
- 🎬 YouTube transcript fetching — no API key required
- 💬 Real-time streaming chat — answers stream token-by-token via SSE
- ⚡ Fast & free AI — powered by Groq (llama-3.3-70b-versatile)
- 🎨 Modern dark UI — smooth animations and clean design

## Setup

### 1. Backend

```bash
cd backend

# Create a .env file
copy .env.example .env
# Edit .env and add your GROQ_API_KEY (get one free at console.groq.com)

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

### 3. Open the app

Go to **http://localhost:5173**, create an account, paste a YouTube URL, and start asking questions.

## Usage

1. Sign up for an account (stored locally with hashed password)
2. Paste a YouTube video URL (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
3. Click **Analyze** — the transcript is fetched in seconds
4. Ask any question in the chat — answers stream in real-time with timestamp references

## Tech Stack

| Layer        | Tech                              |
|--------------|-----------------------------------|
| Backend      | FastAPI + Python 3.13             |
| AI           | Groq (llama-3.3-70b-versatile)    |
| Auth         | JWT (python-jose) + bcrypt        |
| Transcripts  | youtube-transcript-api            |
| Frontend     | React 18 + Vite                   |
| Streaming    | Server-Sent Events (SSE)          |

## Project Structure

```
youtube-qa/
├── backend/
│   ├── main.py              # FastAPI server, auth & AI endpoints
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    └── src/
        ├── App.jsx          # Main app shell + chat UI
        ├── AuthPage.jsx     # Sign in / sign up UI
        ├── AuthContext.jsx  # Auth state management
        ├── main.jsx
        └── index.css        # Modern dark theme
```

## License

MIT
