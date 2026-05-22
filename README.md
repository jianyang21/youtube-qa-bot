# YouTube Q&A

Paste any YouTube URL, and ask questions about the video content using Claude AI.

## Features

- Fetches YouTube transcripts automatically (no API key needed)
- Streams AI answers in real-time using Claude Opus 4.7
- Prompt caching — repeated questions on the same video are fast & cheap
- Works with any video that has captions/subtitles

## Setup

### 1. Backend

```bash
cd backend

# Create a .env file
copy .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

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

Go to **http://localhost:5173**

## Usage

1. Paste a YouTube video URL (e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
2. Click **Analyze** — the transcript is fetched in seconds
3. Ask any question in the chat input
4. Answers stream in real-time with timestamp references

## Tech Stack

| Layer    | Tech                        |
|----------|-----------------------------|
| Backend  | FastAPI + Python             |
| AI       | Claude Opus 4.7 (Anthropic) |
| Transcripts | youtube-transcript-api   |
| Frontend | React + Vite                |
| Streaming | Server-Sent Events (SSE)   |
| Caching  | Anthropic prompt caching    |
