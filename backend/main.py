import os
import re
import json
import httpx
from groq import Groq
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from pathlib import Path

load_dotenv()

app = FastAPI(
    title="YouTube Q&A API",
    description="Built by Devar (jianyang21)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SECRET_KEY = os.getenv("SECRET_KEY", "youtube-qa-dev-secret-change-in-production-xkcd-327")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7
USERS_FILE = Path(__file__).parent / "users.json"
MAX_TRANSCRIPT_CHARS = 80_000

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


# ── Auth helpers ──────────────────────────────────────────────────────────────

def load_users() -> dict:
    if USERS_FILE.exists():
        return json.loads(USERS_FILE.read_text())
    return {}


def save_users(users: dict):
    USERS_FILE.write_text(json.dumps(users, indent=2))


def make_token(email: str, username: str) -> str:
    return jwt.encode(
        {"sub": email, "username": username,
         "exp": datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_token(credentials: HTTPAuthorizationCredentials | None) -> dict | None:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return {"email": payload["sub"], "username": payload["username"]}
    except (JWTError, KeyError):
        return None


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    user = decode_token(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


# ── Request models ─────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AnalyzeRequest(BaseModel):
    url: str


class AskRequest(BaseModel):
    question: str
    transcript: str
    video_title: str = "this video"


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    if len(req.username.strip()) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if "@" not in req.email or "." not in req.email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    users = load_users()
    if req.email.lower() in users:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    users[req.email.lower()] = {
        "username": req.username.strip(),
        "email": req.email.lower(),
        "password": pwd_context.hash(req.password),
    }
    save_users(users)

    token = make_token(req.email.lower(), req.username.strip())
    return {"access_token": token, "user": {"username": req.username.strip(), "email": req.email.lower()}}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    users = load_users()
    user = users.get(req.email.lower())
    if not user or not pwd_context.verify(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = make_token(user["email"], user["username"])
    return {"access_token": token, "user": {"username": user["username"], "email": user["email"]}}


@app.get("/api/auth/me")
async def me(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    user = decode_token(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user


# ── Video helpers ──────────────────────────────────────────────────────────────

def extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:v=)([0-9A-Za-z_-]{11})",
        r"(?:youtu\.be/)([0-9A-Za-z_-]{11})",
        r"(?:embed/)([0-9A-Za-z_-]{11})",
        r"(?:shorts/)([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def fetch_video_info(video_id: str) -> dict:
    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            response = await http.get(oembed_url)
            if response.status_code == 200:
                data = response.json()
                return {
                    "title": data.get("title", "Unknown Title"),
                    "author": data.get("author_name", "Unknown Channel"),
                    "thumbnail": data.get("thumbnail_url", ""),
                }
    except Exception:
        pass
    return {"title": "Unknown Title", "author": "Unknown Channel", "thumbnail": ""}


# ── Main API endpoints ─────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze_video(request: AnalyzeRequest, _user: dict = Depends(require_auth)):
    video_id = extract_video_id(request.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL. Please provide a valid YouTube link.")

    video_info = await fetch_video_info(video_id)

    try:
        ytt = YouTubeTranscriptApi()
        transcript_data = ytt.fetch(video_id)
    except TranscriptsDisabled:
        raise HTTPException(status_code=422, detail="This video has transcripts disabled.")
    except NoTranscriptFound:
        raise HTTPException(status_code=422, detail="No transcript available for this video.")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch transcript: {str(e)}")

    entries = list(transcript_data)
    transcript_text = " ".join(
        f"[{int(e.start//60):02d}:{int(e.start%60):02d}] {e.text}"
        for e in entries
    )

    return {
        "video_id": video_id,
        "title": video_info["title"],
        "author": video_info["author"],
        "thumbnail": video_info["thumbnail"],
        "transcript": transcript_text,
        "duration_seconds": int(entries[-1].start) if entries else 0,
        "word_count": len(transcript_text.split()),
    }


@app.post("/api/ask")
async def ask_question(request: AskRequest, _user: dict = Depends(require_auth)):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not request.transcript.strip():
        raise HTTPException(status_code=400, detail="No transcript provided.")

    transcript = request.transcript[:MAX_TRANSCRIPT_CHARS]

    system_prompt = f"""You are an expert video content analyst. You have been given the full transcript of a YouTube video titled "{request.video_title}".

Your job is to answer questions about this video accurately and helpfully based solely on its transcript. If something is not mentioned in the transcript, say so clearly.

When referencing specific moments, use the timestamps provided in [MM:SS] format.

Video Transcript:
{transcript}"""

    def generate():
        try:
            stream = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": request.question},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield f"data: {json.dumps({'type': 'text', 'content': delta})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'usage': {}})}\n\n"
        except Exception as e:
            err = str(e)
            if "api_key" in err.lower() or "authentication" in err.lower() or "401" in err:
                err = "Invalid API key. Please check your GROQ_API_KEY in the .env file."
            yield f"data: {json.dumps({'type': 'error', 'content': err})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
