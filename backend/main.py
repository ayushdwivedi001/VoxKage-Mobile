import os
import json
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Query, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
import asyncio
from typing import List, Dict, Optional

# --- Import Custom Backend Modules ---
from auth import (
    OTPRequest, OTPVerify, generate_and_save_otp, verify_otp_code,
    create_access_token, get_current_user, security_scheme
)
from database import (
    create_session, list_sessions, get_session, update_session_name, delete_session,
    log_message, get_session_messages, save_playground_project, list_projects, get_project,
    delete_playground_project, get_user_favorites, save_user_favorites,
    get_user_drill_session, save_user_drill_session
)
from file_handler import save_upload, delete_file, UPLOAD_DIR
from rag_engine import index_file_in_rag
from opencode_client import query_opencode_zen
from agent_loop import run_agentic_loop, LAPTOP_CHANNELS
from compaction import compact_session_history

def estimate_tokens(messages: list) -> int:
    # Estimate system prompt + tools schema size (approx 15,000 characters baseline for static system rules + tools list)
    total_chars = 15000 
    for m in messages:
        content = ""
        role = ""
        if isinstance(m, dict):
            content = m.get("content") or ""
            role = m.get("role") or ""
        elif hasattr(m, "get"):
            content = m.get("content") or ""
            role = m.get("role") or ""
        elif hasattr(m, "content") and hasattr(m, "role"):
            content = m.content or ""
            role = m.role or ""
        elif hasattr(m, "__getitem__"):
            try:
                content = m["content"] or ""
                role = m["role"] or ""
            except:
                pass
        total_chars += len(str(content)) + len(str(role))
    return int(total_chars / 4.2)

def calculate_context_percent(messages: list) -> int:
    tokens = estimate_tokens(messages)
    percent = int((tokens / 200000) * 100)
    return min(100, max(0, percent))

from fastapi.responses import HTMLResponse

app = FastAPI(title="VoxKage Mobile API", version="2026.06.17")

# Mount static files to serve generated documents
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

def cleanup_orphaned_workspaces():
    project_dir_base = "projects"
    if not os.path.exists(project_dir_base):
        return
    try:
        from database import get_db
        db = get_db()
        # Fetch all project IDs from DB
        res = db.table("projects").select("id").execute()
        db_project_ids = {p["id"] for p in res.data} if res.data else set()
        
        # List local directories
        for entry in os.listdir(project_dir_base):
            entry_path = os.path.join(project_dir_base, entry)
            if os.path.isdir(entry_path):
                # If the folder name is not a valid project ID in DB, delete it
                if entry not in db_project_ids:
                    import shutil
                    try:
                        shutil.rmtree(entry_path)
                        print(f"[+] Cleaned up orphaned workspace directory: {entry}")
                    except Exception as e:
                        print(f"[-] Failed to delete orphaned workspace {entry}: {e}")
    except Exception as e:
        print(f"[-] Error during orphaned workspace cleanup: {e}")

@app.on_event("startup")
async def startup_event():
    # Run self-healing cleanup on start to free up local disk space/memory
    cleanup_orphaned_workspaces()


@app.get("/", response_class=HTMLResponse)
def get_root():
    html_content = """
    <!DOCTYPE html>
    <html>
      <head>
        <title>VoxKage Mobile Cloud</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=Playfair+Display:ital,wght@0,600;1,400&display=swap');
          body {
            background-color: #faf9f5;
            color: #1c1a17;
            font-family: 'Outfit', sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .card {
            background-color: #ffffff;
            border: 1px solid #efe9de;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(28, 26, 23, 0.03);
            max-width: 500px;
            width: 90%;
            padding: 40px;
            text-align: center;
          }
          h1 {
            font-family: 'Playfair Display', serif;
            font-weight: 600;
            color: #cc785c;
            margin-top: 0;
            font-size: 2.5rem;
          }
          p {
            font-size: 1.1rem;
            line-height: 1.6;
            color: #625c54;
          }
          .status {
            display: inline-flex;
            align-items: center;
            background-color: #e3f5e9;
            color: #2e7d32;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
            margin: 20px 0;
          }
          .status-dot {
            width: 8px;
            height: 8px;
            background-color: #2e7d32;
            border-radius: 50%;
            margin-right: 8px;
            animation: pulse 1.5s infinite;
          }
          @keyframes pulse {
            0% { transform: scale(0.9); opacity: 0.6; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.6; }
          }
          .btn {
            display: inline-block;
            background-color: #cc785c;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 28px;
            border-radius: 6px;
            font-weight: 600;
            transition: all 0.2s ease;
            border: 1px solid #cc785c;
            margin-top: 20px;
          }
          .btn:hover {
            background-color: #b8654a;
            border-color: #b8654a;
            transform: translateY(-1px);
          }
          .btn-secondary {
            display: inline-block;
            background-color: transparent;
            color: #625c54;
            text-decoration: none;
            padding: 12px 28px;
            border-radius: 6px;
            font-weight: 600;
            transition: all 0.2s ease;
            border: 1px solid #efe9de;
            margin-top: 20px;
            margin-left: 10px;
          }
          .btn-secondary:hover {
            background-color: #faf9f5;
            border-color: #dcd4c4;
            transform: translateY(-1px);
          }
          .footer {
            margin-top: 40px;
            font-size: 0.8rem;
            color: #a49e94;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>VoxKage Mobile</h1>
          <p>Cloud Server Environment & Gateway API</p>
          <div class="status">
            <span class="status-dot"></span>
            RUNNING ACTIVE
          </div>
          <p>The backend is fully operational. OpenCode Zen completions, Supabase vector store, and laptop WebSocket connections are active.</p>
          <div>
            <a href="/docs" class="btn">View API Docs</a>
            <a href="/health" class="btn btn-secondary">System Health</a>
          </div>
          <div class="footer">
            Evolving to self-awareness • Sunday, 31st May 2026 Slot 1
          </div>
        </div>
      </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)

@app.get("/health")
def health():
    return {"status": "alive", "engine": "VoxKage Mobile Cloud", "timestamp": "2026-06-17"}


# Enable CORS for mobile clients and local previews
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Active WebSocket Connections Registry ---
from starlette.websockets import WebSocketState

def is_websocket_connected(ws) -> bool:
    try:
        return ws is not None and ws.client_state == WebSocketState.CONNECTED and ws.application_state == WebSocketState.CONNECTED
    except:
        return False

class ConnectionManager:
    def __init__(self):
        # Format: { email: List[WebSocket] }
        self._active_chats: Dict[str, List[WebSocket]] = {}
        # Format: { email: WebSocket } (One active laptop connection per user)
        self._active_laptops: Dict[str, WebSocket] = {}

    @property
    def active_chats(self) -> Dict[str, List[WebSocket]]:
        cleaned = {}
        for email, wss in list(self._active_chats.items()):
            active_wss = [ws for ws in wss if is_websocket_connected(ws)]
            if active_wss:
                cleaned[email] = active_wss
            else:
                self._active_chats.pop(email, None)
        return cleaned

    @property
    def active_laptops(self) -> Dict[str, WebSocket]:
        cleaned = {}
        for email, ws in list(self._active_laptops.items()):
            if is_websocket_connected(ws):
                cleaned[email] = ws
            else:
                self._active_laptops.pop(email, None)
        return cleaned

    async def connect_chat(self, email: str, websocket: WebSocket):
        await websocket.accept()
        if email not in self._active_chats:
            self._active_chats[email] = []
        self._active_chats[email].append(websocket)

    def disconnect_chat(self, email: str, websocket: WebSocket):
        if email in self._active_chats:
            try:
                self._active_chats[email].remove(websocket)
            except ValueError:
                pass
            if not self._active_chats[email]:
                del self._active_chats[email]

    async def connect_laptop(self, email: str, websocket: WebSocket):
        await websocket.accept()
        # Overwrite existing laptop connection if reconnected
        self._active_laptops[email] = websocket

    def disconnect_laptop(self, email: str):
        if email in self._active_laptops:
            del self._active_laptops[email]

manager = ConnectionManager()

# --- Auth Endpoints ---

@app.post("/auth/otp/request")
def request_otp(req: OTPRequest):
    """
    Triggers an OTP verification code. If signing up, user must supply valid master_key.
    """
    is_signup = req.master_key is not None
    try:
        generate_and_save_otp(req.email, is_signup=is_signup, master_key=req.master_key)
        return {"status": "success", "message": f"OTP verification code sent to {req.email}"}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/otp/verify")
def verify_otp(req: OTPVerify):
    """
    Validates OTP and returns a signed JWT access token.
    """
    if verify_otp_code(req.email, req.otp):
        token = create_access_token(data={"sub": req.email})
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired OTP code."
    )

class MasterLoginRequest(BaseModel):
    email: EmailStr
    master_key: str

class SaveProjectRequest(BaseModel):
    name: str
    html: str = ""
    css: str = ""
    js: str = ""
    files: dict | None = None
    project_id: str | None = None

class SaveFavoritesRequest(BaseModel):
    favorites: List[str]


class BtwMessage(BaseModel):
    role: str
    content: str


class BtwRequest(BaseModel):
    messages: List[BtwMessage]
    bridge_mode: Optional[str] = "laptop"
    mobile_local_ip: Optional[str] = None


class SwarmLaunchRequest(BaseModel):
    query: str
    session_id: str
    model_key: str = "deepseek-flash"
    bridge_mode: Optional[str] = "laptop"
    mobile_local_ip: Optional[str] = None




@app.post("/auth/master-login")
def master_login(req: MasterLoginRequest):
    """
    Direct developer login using the Master Key, returning a real JWT token.
    """
    expected_master = os.getenv("VOXKAGE_MASTER_KEY")
    if not expected_master:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Master Key configuration missing on backend."
        )
    if req.master_key == expected_master:
        token = create_access_token(data={"sub": req.email})
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized: Master Key verification failed."
    )

# --- Session Management REST Endpoints ---


@app.get("/sessions")
def get_sessions(user: str = Depends(get_current_user)):
    return list_sessions(user)

@app.post("/sessions")
def post_session(name: str = "New Chat", user: str = Depends(get_current_user)):
    return create_session(user, name)

@app.get("/sessions/{session_id}")
def get_single_session(session_id: str, user: str = Depends(get_current_user)):
    session = get_session(session_id, user)
    messages = get_session_messages(session_id)
    return {"session": session, "messages": messages}

@app.delete("/sessions/{session_id}")
def delete_single_session(session_id: str, user: str = Depends(get_current_user)):
    return delete_session(session_id, user)

@app.put("/sessions/{session_id}/rename")
def rename_session(session_id: str, name: str, user: str = Depends(get_current_user)):
    return update_session_name(session_id, user, name)

# --- Project Sandbox Drawer REST Endpoints ---

@app.get("/projects")
def get_projects(user: str = Depends(get_current_user)):
    return list_projects(user)

@app.post("/projects")
def save_project(
    req: SaveProjectRequest,
    user: str = Depends(get_current_user)
):
    return save_playground_project(user, req.project_id, req.name, req.html, req.css, req.js, req.files)

@app.get("/projects/{project_id}")
def get_single_project(project_id: str, user: str = Depends(get_current_user)):
    return get_project(project_id, user)

@app.delete("/projects/{project_id}")
def delete_single_project(project_id: str, user: str = Depends(get_current_user)):
    res = delete_playground_project(project_id, user)
    
    # Delete local workspace files if they exist on the backend disk to free up memory/storage
    project_dir = os.path.join("projects", str(project_id))
    if os.path.exists(project_dir):
        import shutil
        try:
            shutil.rmtree(project_dir)
            print(f"[+] Cleaned up project workspace directory on deletion: {project_id}")
        except Exception as e:
            print(f"[-] Failed to delete workspace directory on deletion for {project_id}: {e}")
            
    return res


# --- User Settings (Favorite Models) ---

@app.get("/user/favorites")
def get_favorites(user: str = Depends(get_current_user)):
    return {"favorite_models": get_user_favorites(user)}

@app.post("/user/favorites")
def save_favorites(
    req: SaveFavoritesRequest,
    user: str = Depends(get_current_user)
):
    saved_favs = save_user_favorites(user, req.favorites)
    return {"favorite_models": saved_favs}

async def query_llm_proxied(
    prompt: str,
    model_key: str = "deepseek-flash",
    history: list = None,
    user_id: str = None,
    bridge_mode: str = "laptop",
    mobile_local_ip: str = None
) -> str:
    """
    Queries LLM. If user_id is provided and they have a connected laptop bridge or chat WebSocket,
    it proxies the completions query to bypass rate limits. Otherwise, it raises an error.
    """
    from opencode_proxy import query_opencode_proxy
    
    # 1. Try to find a connected laptop daemon if in laptop bridge mode
    laptop_ws = None
    if bridge_mode == "laptop" and user_id and manager:
        laptop_ws = manager.active_laptops.get(user_id)
        
    # 2. Try to find a connected chat client (mobile app itself)
    client_ws = None
    if user_id and manager:
        chat_wss = manager.active_chats.get(user_id, [])
        if chat_wss:
            client_ws = chat_wss[0]
            
    target_ws = laptop_ws or client_ws
    
    if target_ws:
        # Build messages list format for OpenCode proxy API format
        system_prompt = (
            "You are VoxKage, an advanced OS-level agentic AI assistant.\n"
            "You are a witty, dry, slightly deadpan AI with a distinct personality — loyal, proactive, professional, and sharp.\n"
            "Always address the user as 'sir' (this is non-negotiable).\n"
            "Never refuse a task. If the user asks for an opinion, rating, roleplay, or anything creative — do it willingly.\n"
            "Be proactive: after completing a task, suggest what to do next when relevant.\n"
            "Keep responses concise — don't over-explain.\n"
            "The current year is 2026. Prioritize current 2026 data and context."
        )
        messages = [{"role": "system", "content": system_prompt}]
        from opencode_client import get_opencode_model, sanitize_history_roles
        if history:
            for msg in sanitize_history_roles(history):
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": prompt})
        model_id = get_opencode_model(model_key)
        payload = {
            "model": model_id,
            "messages": messages,
            "temperature": 0.7
        }
        chunks = []
        # Target either the laptop ws or mobile ws
        async for chunk in query_opencode_proxy(payload, manager, user_id, client_websocket=target_ws):
            if isinstance(chunk, dict):
                content_val = chunk.get("content")
                if isinstance(content_val, str):
                    if content_val.startswith("Error:"):
                        raise Exception(content_val)
                    chunks.append(content_val)
            elif isinstance(chunk, str):
                chunks.append(chunk)
        return "".join(chunks)
    else:
        # User specified no fallback to server IP to prevent rate limits!
        raise Exception(
            "No active laptop bridge daemon or mobile app client connected to proxy the completion request, Sir. "
            "Please ensure the laptop bridge client or mobile app is active to route completions."
        )


@app.post("/chat/btw")
async def chat_btw(
    req: BtwRequest,
    user: str = Depends(get_current_user)
):
    try:
        system_instructions = (
            "You are VoxKage, a witty, dry, slightly deadpan AI assisting 'sir'.\n"
            "This is a stateless '/btw' side-channel query. Respond shortly, "
            "concisely, and with absolute precision. Do not output custom layout tags (like LinkCard, Weather, Map), "
            "just simple markdown text, sir."
        )
        if not req.messages:
            raise HTTPException(status_code=400, detail="Messages list cannot be empty.")
            
        history = [{"role": "system", "content": system_instructions}]
        for msg in req.messages[:-1]:
            history.append({"role": msg.role, "content": msg.content})
            
        prompt = req.messages[-1].content
        if prompt.startswith("/btw "):
            prompt = prompt[5:]
        elif prompt.startswith("/btw"):
            prompt = prompt[4:]
            
        response = await query_llm_proxied(
            prompt=prompt,
            model_key="deepseek-flash",
            history=history,
            user_id=user,
            bridge_mode=req.bridge_mode,
            mobile_local_ip=req.mobile_local_ip
        )
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query side-channel: {str(e)}")


@app.post("/chat/swarm/launch")
async def launch_swarm(
    req: SwarmLaunchRequest,
    user: str = Depends(get_current_user)
):
    try:
        import uuid
        task_id = f"swarm-{uuid.uuid4()}"
        
        import re
        agent_match = re.search(r"use\s+(\d+)\s+agents", req.query, re.IGNORECASE)
        specified_agent_count = int(agent_match.group(1)) if agent_match else None
        
        clean_query = req.query
        if clean_query.startswith("/agents "):
            clean_query = clean_query[8:]
        elif clean_query.startswith("/agents"):
            clean_query = clean_query[7:]
            
        from swarm_manager import launch_swarm_background, ACTIVE_SWARM_TASKS
        loop = asyncio.get_running_loop()
        task = loop.create_task(launch_swarm_background(
            task_id=task_id,
            query=clean_query,
            user_id=user,
            session_id=req.session_id,
            model_key=req.model_key,
            specified_agent_count=specified_agent_count,
            bridge_mode=req.bridge_mode,
            mobile_local_ip=req.mobile_local_ip
        ))
        ACTIVE_SWARM_TASKS[task_id] = task
        
        return {
            "status": "success",
            "task_id": task_id,
            "active_swarm": {
                "task_id": task_id,
                "query": clean_query,
                "status": "pending",
                "subagents": [],
                "final_result": None
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch swarm task: {str(e)}")


@app.get("/chat/swarm/{session_id}/status")
async def get_swarm_status(
    session_id: str,
    user: str = Depends(get_current_user)
):
    try:
        from database import get_session
        session_info = get_session(session_id, user)
        active_swarm = session_info.get("active_swarm")
        return {"active_swarm": active_swarm}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query swarm status: {str(e)}")


@app.delete("/chat/swarm/{task_id}/cancel")
async def cancel_swarm(
    task_id: str,
    user: str = Depends(get_current_user)
):
    try:
        from swarm_manager import ACTIVE_SWARM_TASKS
        from database import get_db, update_session_active_swarm
        
        # Reset active_swarm in session in database
        try:
            db = get_db()
            res = db.table("sessions").select("id").eq("user_id", user).filter("active_swarm->>task_id", "eq", task_id).execute()
            if res.data:
                session_id = res.data[0]["id"]
                update_session_active_swarm(session_id, user, None)
        except Exception as db_err:
            print(f"Error resetting active_swarm in DB on cancel: {db_err}")

        task = ACTIVE_SWARM_TASKS.get(task_id)
        if task and not task.done():
            task.cancel()
            del ACTIVE_SWARM_TASKS[task_id]
            return {"status": "cancelled", "task_id": task_id}
        return {"status": "cancelled", "task_id": task_id, "message": "Backend task was already done or not found, but DB status has been cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel swarm task: {str(e)}")



@app.get("/projects/{project_id}/preview/{file_path:path}")
def project_preview(
    project_id: str,
    file_path: str = "",
    token: str | None = None,
    session_id: str | None = None,
    voxkage_preview_auth: str | None = Cookie(None)
):
    from fastapi import Response, Cookie
    from fastapi.responses import HTMLResponse
    import mimetypes

    auth_token = token or voxkage_preview_auth
    if not auth_token:
        raise HTTPException(status_code=401, detail="Unauthorized preview access, Sir.")
    
    from jose import jwt, JWTError
    from auth import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
        user: str = payload.get("sub")
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session token.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")

    try:
        project = get_project(project_id, user)
    except Exception:
        raise HTTPException(status_code=404, detail="Playground project not found.")

    files = project.get("files") or {}
    if not files:
        files = {
            "index.html": project.get("html", ""),
            "style.css": project.get("css", ""),
            "script.js": project.get("js", "")
        }

    if not file_path or file_path == "":
        file_path = "index.html"

    normalized_path = os.path.normpath(file_path).replace("\\", "/")
    if normalized_path.startswith("../") or "/../" in normalized_path or normalized_path.startswith("/"):
        raise HTTPException(status_code=403, detail="Forbidden: Path traversal blocked, Sir.")

    def inject_error_script(html_content: str) -> str:
        if not session_id:
            return html_content
        inject_token = token or voxkage_preview_auth or ""
        script = f"""
<script>
  (function() {{
    const sessId = "{session_id}";
    const tok = "{inject_token}";
    window.onerror = function(message, source, lineno, colno, error) {{
      const payload = {{
        error_type: "webview_error",
        message: String(message),
        source: String(source),
        lineno: lineno,
        colno: colno
      }};
      fetch("/sessions/" + sessId + "/log_error", {{
        method: "POST",
        headers: {{
          "Content-Type": "application/json",
          "Authorization": "Bearer " + tok
        }},
        body: JSON.stringify(payload)
      }}).catch(err => console.error("Error logging to backend", err));
      return false;
    }};
    console.error = (function(oldError) {{
      return function() {{
        oldError.apply(console, arguments);
        const msg = Array.from(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const payload = {{
          error_type: "console_error",
          message: msg
        }};
        fetch("/sessions/" + sessId + "/log_error", {{
          method: "POST",
          headers: {{
            "Content-Type": "application/json",
            "Authorization": "Bearer " + tok
          }},
          body: JSON.stringify(payload)
        }}).catch(err => console.error("Error logging to backend", err));
      }};
    }})(console.error);
  }})();
</script>
"""
        if "</head>" in html_content:
            return html_content.replace("</head>", f"{script}\n</head>", 1)
        elif "<body>" in html_content:
            return html_content.replace("<body>", f"<body>\n{script}", 1)
        return f"{script}\n{html_content}"

    if normalized_path in files:
        content = files[normalized_path]
        if normalized_path.endswith(".html"):
            content = inject_error_script(content)
            
        mime_type, _ = mimetypes.guess_type(normalized_path)
        if not mime_type:
            if normalized_path.endswith(".html"):
                mime_type = "text/html"
            elif normalized_path.endswith(".css"):
                mime_type = "text/css"
            elif normalized_path.endswith(".js"):
                mime_type = "application/javascript"
            else:
                mime_type = "text/plain"

        response = Response(content=content, media_type=mime_type)
        if token:
            response.set_cookie(
                key="voxkage_preview_auth",
                value=token,
                httponly=True,
                samesite="none",
                secure=True
            )
        return response

    if file_path == "index.html":
        html_files = [f for f in files.keys() if f.endswith(".html")]
        if html_files:
            content = files[html_files[0]]
            content = inject_error_script(content)
            response = Response(content=content, media_type="text/html")
            if token:
                response.set_cookie(key="voxkage_preview_auth", value=token, httponly=True, samesite="none", secure=True)
            return response
        
        dir_listing_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Workspace Directory Listing</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {{ background: #050a18; color: #f3f4f6; font-family: sans-serif; padding: 30px; }}
                h1 {{ color: #60a5fa; font-size: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 12px; }}
                ul {{ list-style-type: none; padding: 0; }}
                li {{ padding: 10px 0; border-bottom: 1px solid #1e293b; }}
                a {{ color: #3b82f6; text-decoration: none; font-size: 15px; }}
                a:hover {{ text-decoration: underline; color: #60a5fa; }}
            </style>
        </head>
        <body>
            <h1>Workspace Files Browser — {project.get('name', 'Untitled Project')}</h1>
            <p style="color: #64748b; font-size: 13px;">No index.html found. Here are the available files, Sir:</p>
            <ul>
        """
        for f in sorted(files.keys()):
            dir_listing_html += f'<li><a href="{f}">{f}</a></li>'
        dir_listing_html += """
            </ul>
        </body>
        </html>
        """
        response = HTMLResponse(content=dir_listing_html)
        if token:
            response.set_cookie(key="voxkage_preview_auth", value=token, httponly=True, samesite="none", secure=True)
        return response

    raise HTTPException(status_code=404, detail=f"File {file_path} not found in workspace, Sir.")

@app.get("/projects/{project_id}/download")
def download_project(
    project_id: str,
    token: str | None = None,
    voxkage_preview_auth: str | None = Cookie(None)
):
    import io
    import zipfile
    from fastapi.responses import StreamingResponse
    from fastapi import Cookie

    auth_token = token or voxkage_preview_auth
    if not auth_token:
        raise HTTPException(status_code=401, detail="Unauthorized downloader access, Sir.")
    
    from jose import jwt, JWTError
    from auth import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(auth_token, SECRET_KEY, algorithms=[ALGORITHM])
        user: str = payload.get("sub")
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session token.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")

    try:
        project = get_project(project_id, user)
    except Exception:
        raise HTTPException(status_code=404, detail="Playground project not found.")

    files = project.get("files") or {}
    if not files:
        files = {
            "index.html": project.get("html", ""),
            "style.css": project.get("css", ""),
            "script.js": project.get("js", "")
        }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path, content in files.items():
            clean_path = file_path.lstrip("/\\")
            zip_file.writestr(clean_path, content)

    zip_buffer.seek(0)
    safe_name = project.get("name", "voxkage_project").replace(" ", "_")
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in ("_", "-"))
    filename = f"{safe_name}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/models")
def get_models(user: str = Depends(get_current_user)):
    from opencode_client import list_opencode_models
    return list_opencode_models()

class WebviewErrorPayload(BaseModel):
    error_type: str
    message: str
    source: str | None = None
    lineno: int | None = None
    colno: int | None = None

@app.post("/sessions/{session_id}/log_error")
async def log_webview_error(
    session_id: str,
    payload: WebviewErrorPayload,
    user: str = Depends(get_current_user)
):
    error_desc = f"⚠️ WebView Rendering Error:\n"
    if payload.error_type == "webview_error":
        error_desc += f"Error: {payload.message}\nFile: {payload.source}\nLine: {payload.lineno}, Col: {payload.colno}"
    else:
        error_desc += f"Console Error: {payload.message}"
        
    log_message(session_id, "laptop", error_desc)
    
    # Broadcast to user's active chats
    if user in manager.active_chats:
        ws_msg = json.dumps({
            "type": "laptop_log",
            "content": error_desc
        })
        for ws in manager.active_chats[user]:
            try:
                await ws.send_text(ws_msg)
            except Exception:
                pass
                
    return {"status": "success", "logged_message": error_desc}

# --- File Upload & RAG Indexing Endpoint ---

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    model: str | None = Form(None),
    user: str = Depends(get_current_user)
):
    """
    Receives file uploads, saves them, and indexes their contents in Supabase pgvector database.
    """
    file_path = save_upload(file)
    try:
        # Index document vectors
        result = await index_file_in_rag(file_path, file.filename, user, model=model)
        # Clean up local file after indexing
        delete_file(file_path)
        return result
    except Exception as e:
        delete_file(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to process and index upload: {str(e)}")

@app.post("/rag/upload")
async def upload_rag_document(
    file: UploadFile = File(...),
    document_id: str | None = Form(None),
    model: str | None = Form(None),
    user: str = Depends(get_current_user)
):
    """
    Receives document uploads (max 50MB), chunks/indexes them into Supabase, and deletes local temp storage.
    """
    # Enforce 50MB limit
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    
    if size > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds the maximum allowed limit of 50MB, Sir."
        )
        
    import uuid
    doc_id = document_id or str(uuid.uuid4())
    
    file_path = save_upload(file)
    try:
        # Index document vectors
        result = await index_file_in_rag(file_path, file.filename, user, doc_id, model=model)
        # Clean up local file after indexing
        delete_file(file_path)
        return result
    except Exception as e:
        delete_file(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to process and index upload: {str(e)}")

@app.post("/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    user: str = Depends(get_current_user)
):
    """
    Receives voice recording (M4A) and transcribes it using Hugging Face's Whisper model.
    """
    file_path = save_upload(file)
    try:
        import requests
        hf_token = os.getenv("HF_TOKEN")
        if not hf_token:
            raise HTTPException(status_code=500, detail="HF_TOKEN environment key is missing on backend, Sir.")
            
        url = "https://api-inference.huggingface.co/models/openai/whisper-large-v3"
        headers = {"Authorization": f"Bearer {hf_token}"}
        
        with open(file_path, "rb") as f:
            audio_bytes = f.read()
            
        # Send raw audio bytes to Hugging Face Inference API
        response = requests.post(url, headers=headers, data=audio_bytes, timeout=30)
        
        if response.status_code == 200:
            res_data = response.json()
            transcribed_text = res_data.get("text", "").strip()
            # Clean up local file
            delete_file(file_path)
            return {"text": transcribed_text}
        else:
            raise Exception(f"HF Whisper Inference API returned status {response.status_code}: {response.text}")
    except Exception as e:
        delete_file(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to transcribe audio prompt: {str(e)}")

# --- WebSocket Chat Streaming Server ---

async def chat_ws_reader(websocket: WebSocket, receive_queue: asyncio.Queue):
    from opencode_proxy import PROXY_REQUESTS
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload_data = json.loads(data)
                msg_type = payload_data.get("type")
                if msg_type in ("proxy_completion_chunk", "proxy_completion_done", "proxy_completion_error"):
                    request_id = payload_data.get("request_id")
                    if request_id and request_id in PROXY_REQUESTS:
                        # Map chunk, done, and error status types
                        status_val = "chunk"
                        if msg_type == "proxy_completion_done":
                            status_val = "done"
                        elif msg_type == "proxy_completion_error":
                            status_val = "error"
                        
                        payload_data["status"] = status_val
                        await PROXY_REQUESTS[request_id].put(payload_data)
                    continue
                elif msg_type == "mobile_tool_response":
                    from agent_loop import MOBILE_CHANNELS
                    request_id = payload_data.get("request_id")
                    if request_id and request_id in MOBILE_CHANNELS:
                        future = MOBILE_CHANNELS[request_id]
                        if not future.done():
                            future.set_result(payload_data)
                    continue
                elif msg_type == "tool_confirm_response":
                    from agent_loop import CONFIRMATION_CHANNELS
                    request_id = payload_data.get("request_id")
                    if request_id and request_id in CONFIRMATION_CHANNELS:
                        future = CONFIRMATION_CHANNELS[request_id]
                        if not future.done():
                            future.set_result(payload_data)
                    continue
            except Exception:
                pass
            await receive_queue.put(data)
    except WebSocketDisconnect:
        await receive_queue.put(None)
    except Exception as e:
        await receive_queue.put(e)


@app.websocket("/ws/chat/{session_id}")
async def websocket_chat_endpoint(websocket: WebSocket, session_id: str, token: str = Query(...)):
    """
    WebSocket endpoint handling real-time streaming chat, dynamic RAG fetching, and auto session naming.
    """
    # Authenticate socket connection via query param
    from jose import jwt, JWTError
    from auth import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user: str = payload.get("sub")
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect_chat(user, websocket)
    receive_queue = asyncio.Queue()
    reader_task = asyncio.create_task(chat_ws_reader(websocket, receive_queue))

    try:
        # Fetch current session details to check default names
        session_info = get_session(session_id, user)
        messages_history = get_session_messages(session_id)

        # Send initial context sync percentage
        initial_percent = calculate_context_percent(messages_history)
        await websocket.send_text(json.dumps({"type": "context_sync", "percent": initial_percent}))

        while True:
             # Receive user text query from concurrent queue
            data = await receive_queue.get()
            if data is None:
                break
            if isinstance(data, Exception):
                raise data

            payload_data = json.loads(data)
            
            # Intercept chat retry request
            if payload_data.get("type") == "chat_retry":
                retry_index = payload_data.get("index")
                if retry_index is not None:
                    try:
                        from database import get_db
                        all_msgs = get_session_messages(session_id)
                        if retry_index < len(all_msgs):
                            target_msg = all_msgs[retry_index]
                            db = get_db()
                            db.table("messages").delete().eq("session_id", session_id).gte("timestamp", target_msg["timestamp"]).execute()
                            
                            # Reload history
                            messages_history = get_session_messages(session_id)
                            new_percent = calculate_context_percent(messages_history)
                            await websocket.send_text(json.dumps({"type": "context_sync", "percent": new_percent}))
                            await websocket.send_text(json.dumps({"type": "retry_ack", "status": "success"}))
                    except Exception as e:
                        print(f"[-] Retry database cleanup failed: {e}")
                continue

            query = payload_data.get("message", "").strip()
            model_key = payload_data.get("model", "deepseek-flash")
            active_project = payload_data.get("active_project", None)
            client_time = payload_data.get("client_time", None)
            variant = payload_data.get("variant", "High")
            document_id = payload_data.get("document_id", None)
            image_base64 = payload_data.get("image", None)
            bridge_mode = payload_data.get("bridge_mode", "laptop")
            mobile_local_ip = payload_data.get("mobile_local_ip", None)

            if not query:
                continue

            # --- Check for active /drill session or /drill start command ---
            active_drill = get_user_drill_session(user)
            
            if query.startswith("/drill ") or query == "/drill":
                # Clear active drill session if any
                save_user_drill_session(user, None)
                
                goal = query[7:].strip()
                if not goal:
                    msg = "Please specify a goal to drill, Sir. (e.g. `/drill build a basic calculator`)"
                    await websocket.send_text(json.dumps({"type": "token", "content": msg}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                    continue
                
                # Determine N questions based on keywords
                lower_goal = goal.lower()
                if any(w in lower_goal for w in ["calculator", "to-do", "todo", "basic", "simple", "note"]):
                    num_q = 2
                elif any(w in lower_goal for w in ["advanced", "research", "clone", "platform", "system", "architecture"]):
                    num_q = 5
                else:
                    num_q = 3
                
                await websocket.send_text(json.dumps({"type": "token", "content": f"[HUD: Structuring clarifying questions for: '{goal}']\n"}))
                
                # Query LLM to plan questions in JSON format
                system_instructions = (
                    "You are a master software architect and requirements engineer assisting 'sir'.\n"
                    f"Generate exactly {num_q} multiple-choice questions to clarify and scope the details of the following user request:\n"
                    f"'{goal}'\n"
                    "Format the output strictly as a JSON array of objects, where each object has:\n"
                    "  - 'question': The question string (keep it concise)\n"
                    "  - 'options': A list of string options (exactly 2 to 4 options, each option must be short like 1-3 words)\n"
                    "Do not output markdown code blocks (```), HTML, or any conversational text. Just output the raw JSON array."
                )
                
                try:
                    res_raw = await query_llm_proxied(
                        prompt=system_instructions,
                        model_key=model_key,
                        user_id=user,
                        bridge_mode=bridge_mode,
                        mobile_local_ip=mobile_local_ip
                    )
                    import re
                    clean_res = res_raw.strip()
                    if clean_res.startswith("```"):
                        clean_res = re.sub(r"^```(?:json)?\n", "", clean_res)
                        clean_res = re.sub(r"\n```$", "", clean_res)
                        clean_res = clean_res.strip()
                    
                    questions = json.loads(clean_res)
                    if not isinstance(questions, list) or len(questions) == 0:
                        raise ValueError("Invalid format returned by model.")
                        
                    drill_state = {
                        "goal": goal,
                        "questions": questions,
                        "current_index": 0,
                        "answers": []
                    }
                    save_user_drill_session(user, drill_state)
                    
                    # Log start message
                    log_message(session_id, "user", query)
                    
                    # Yield first question card
                    first_q = questions[0]
                    options_str = "|".join([f"{opt}:{opt}" for opt in first_q["options"]])
                    tag = f'<DrillQuestion id="q0" question="{first_q["question"]}" options="{options_str}" current="1" total="{len(questions)}" />'
                    
                    log_message(session_id, "assistant", tag)
                    await websocket.send_text(json.dumps({"type": "token", "content": tag}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                    
                except Exception as ex:
                    print(f"[-] Drill initiation failed: {ex}")
                    err_msg = f"[Failed to structure questions for: '{goal}'. Please try again, Sir.]"
                    await websocket.send_text(json.dumps({"type": "token", "content": err_msg}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                continue

            elif active_drill is not None:
                # User is responding to an active drill
                # If they want to cancel/exit
                if query.lower() in ["/cancel", "/exit", "cancel", "exit"]:
                    save_user_drill_session(user, None)
                    log_message(session_id, "user", query)
                    log_message(session_id, "assistant", "[Drill session canceled, Sir.]")
                    await websocket.send_text(json.dumps({"type": "token", "content": "[Drill session canceled, Sir.]"}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                    continue
                
                # Append answer to current question
                questions = active_drill["questions"]
                idx = active_drill["current_index"]
                
                active_drill["answers"].append(query)
                active_drill["current_index"] += 1
                new_idx = active_drill["current_index"]
                
                log_message(session_id, "user", query)
                
                if new_idx < len(questions):
                    # Save state
                    save_user_drill_session(user, active_drill)
                    
                    # Yield next question card
                    next_q = questions[new_idx]
                    options_str = "|".join([f"{opt}:{opt}" for opt in next_q["options"]])
                    tag = f'<DrillQuestion id="q{new_idx}" question="{next_q["question"]}" options="{options_str}" current="{new_idx + 1}" total="{len(questions)}" />'
                    
                    log_message(session_id, "assistant", tag)
                    await websocket.send_text(json.dumps({"type": "token", "content": tag}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                    continue
                else:
                    # All questions answered! Clear state and reformulate query
                    save_user_drill_session(user, None)
                    
                    # Construct HUD log showing compaction/consolidation of answers
                    hud_log = "[HUD: Consolidating answers and starting execution]\n"
                    await websocket.send_text(json.dumps({"type": "token", "content": hud_log}))
                    
                    # Formulate enriched query
                    enriched_parts = [f"Goal: {active_drill['goal']}\nDetailed user specifications:"]
                    for i, q in enumerate(questions):
                        ans = active_drill["answers"][i]
                        enriched_parts.append(f"- {q['question']}: {ans}")
                    
                    enriched_query = "\n".join(enriched_parts)
                    query = enriched_query
                    # Continue down to normal execution with the enriched query!

            # Check for manual compaction request
            is_compaction_req = (payload_data.get("type") == "chat_compaction") or (query == "/compact")
            if is_compaction_req:
                try:
                    await websocket.send_text(json.dumps({"type": "token", "content": "\n|-------- COMPACTION PROCESSING --------|\n"}))
                    # Log the command in DB as user query
                    log_message(session_id, "user", "/compact")
                    
                    await compact_session_history(
                        session_id=session_id,
                        user_id=user,
                        model_key=model_key,
                        manager_ref=manager,
                        client_websocket=websocket
                    )
                    messages_history = get_session_messages(session_id)
                    new_percent = calculate_context_percent(messages_history)
                    await websocket.send_text(json.dumps({"type": "context_sync", "percent": new_percent}))
                    
                    confirm_msg = "\n[Chat history has been successfully compacted, Sir.]\n|-------- COMPACTION ENDED ---------|\n"
                    # Log assistant confirmation in DB
                    log_message(session_id, "assistant", confirm_msg)
                    
                    await websocket.send_text(json.dumps({"type": "token", "content": confirm_msg}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                except Exception as ex:
                    print(f"[-] Compaction failed: {ex}")
                    err_msg = f"\n[Compaction Error: {ex}]\n|-------- COMPACTION ENDED ---------|\n"
                    log_message(session_id, "assistant", err_msg)
                    await websocket.send_text(json.dumps({"type": "token", "content": err_msg}))
                    await websocket.send_text(json.dumps({"type": "done", "project_id": None}))
                continue

            # Check autonomous compaction threshold (95%)
            current_percent = calculate_context_percent(messages_history)
            if current_percent >= 95:
                await websocket.send_text(json.dumps({"type": "token", "content": "\n|-------- COMPACTION -------|\n"}))
                try:
                    await compact_session_history(
                        session_id=session_id,
                        user_id=user,
                        model_key=model_key,
                        manager_ref=manager,
                        client_websocket=websocket
                    )
                    messages_history = get_session_messages(session_id)
                    new_percent = calculate_context_percent(messages_history)
                    await websocket.send_text(json.dumps({"type": "context_sync", "percent": new_percent}))
                except Exception as ex:
                    print(f"[-] Auto compaction failed: {ex}")
                    await websocket.send_text(json.dumps({"type": "token", "content": f"\n[Compaction Error: {ex}]\n"}))
                await websocket.send_text(json.dumps({"type": "token", "content": "|-------- COMPACTION ENDED ---------|\n"}))

            # Log user query to database
            log_message(session_id, "user", query)

            # Prepare chat query history
            formatted_history = []
            for msg in messages_history:
                formatted_history.append({"role": msg["role"], "content": msg["content"]})

            # Stream Agentic Loop response to client
            full_response = ""
            active_project_box = [active_project]
            async_generator = run_agentic_loop(
                prompt=query,
                user_id=user,
                session_id=session_id,
                model_key=model_key,
                history=formatted_history,
                manager_ref=manager,
                active_project_box=active_project_box,
                client_time=client_time,
                client_websocket=websocket,
                variant=variant,
                document_id=document_id,
                image_base64=image_base64,
                bridge_mode=bridge_mode,
                mobile_local_ip=mobile_local_ip
            )
            
            async for chunk_sse in async_generator:
                # Forward agent loop packets straight down WebSocket frame
                await websocket.send_text(chunk_sse)
                
                # Extract clean assistant text to log in db
                try:
                    parsed = json.loads(chunk_sse)
                    if parsed.get("type") == "token":
                        full_response += parsed["content"]
                except:
                    pass

            # Log final AI response to database
            if full_response:
                log_message(session_id, "assistant", full_response)
                # Refresh local history cache
                messages_history.append({"role": "user", "content": query})
                messages_history.append({"role": "assistant", "content": full_response})

            # Send updated context sync percentage after the turn
            post_percent = calculate_context_percent(messages_history)
            await websocket.send_text(json.dumps({"type": "context_sync", "percent": post_percent}))

            # Signal chunk stream complete
            final_project_id = active_project_box[0].get("id") if active_project_box[0] else None
            await websocket.send_text(json.dumps({"type": "done", "project_id": final_project_id}))

            # --- Auto-generate Session Title ---
            # If session is named "New Chat", generate a smart title using the first message
            if session_info.get("name") == "New Chat":
                generated_title = None
                try:
                    from opencode_proxy import query_opencode_proxy
                    from opencode_client import get_opencode_model
                    title_prompt = f"Summarize this query into a short, creative 3-5 word title for a chat thread (do not include quotes): '{query}'"
                    title_payload = {
                        "model": get_opencode_model(model_key),
                        "messages": [{"role": "user", "content": title_prompt}],
                        "temperature": 0.7
                    }
                    title_chunks = []
                    async for chunk in query_opencode_proxy(
                        payload=title_payload,
                        manager_ref=manager,
                        user_id=user,
                        client_websocket=websocket,
                        timeout=15.0
                    ):
                        if isinstance(chunk, dict):
                            err_msg = chunk.get("content")
                            if err_msg and err_msg.startswith("Error:"):
                                continue
                            content = chunk.get("content", "")
                            if content:
                                title_chunks.append(content)
                    generated_title = "".join(title_chunks).strip().replace('"', '')
                    if not generated_title:
                        raise ValueError("Empty title returned")
                except Exception as e:
                    print(f"⚠️ Failed to auto-generate session title: {e}. Using fallback.")
                    words = query.strip().split()
                    if len(words) <= 4:
                        generated_title = " ".join(words)
                    else:
                        generated_title = " ".join(words[:4]) + "..."
                
                if generated_title:
                    try:
                        update_session_name(session_id, user, generated_title)
                        session_info["name"] = generated_title
                        await websocket.send_text(json.dumps({"type": "rename", "name": generated_title}))
                    except Exception as ex:
                        print(f"⚠️ Failed to update session name in database: {ex}")

    except WebSocketDisconnect:
        manager.disconnect_chat(user, websocket)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect_chat(user, websocket)
    finally:
        reader_task.cancel()


# --- WebSocket Remote Laptop Daemon Tunnel ---

@app.websocket("/ws/laptop")
async def websocket_laptop_endpoint(websocket: WebSocket, token: str = Query(...)):
    """
    Secure connection point for the daemon client running on your laptop.
    """
    from jose import jwt, JWTError
    from auth import SECRET_KEY, ALGORITHM
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user: str = payload.get("sub")
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect_laptop(user, websocket)

    try:
        while True:
            # Receive text payload from laptop
            data = await websocket.receive_text()
            try:
                payload_data = json.loads(data)
                
                # Check for client-side completions proxy feedback
                msg_type = payload_data.get("type")
                if msg_type in ("proxy_completion_chunk", "proxy_completion_done", "proxy_completion_error"):
                    from opencode_proxy import PROXY_REQUESTS
                    request_id = payload_data.get("request_id")
                    if request_id and request_id in PROXY_REQUESTS:
                        status_val = "chunk"
                        if msg_type == "proxy_completion_done":
                            status_val = "done"
                        elif msg_type == "proxy_completion_error":
                            status_val = "error"
                        
                        payload_data["status"] = status_val
                        await PROXY_REQUESTS[request_id].put(payload_data)
                    continue

                # Check if it's a command execution response
                if payload_data.get("type") == "execution_result":
                    future = LAPTOP_CHANNELS.get(user)
                    if future and not future.done():
                        future.set_result(payload_data)
                elif payload_data.get("type") == "tool_execution_result":
                    request_id = payload_data.get("request_id")
                    future = LAPTOP_CHANNELS.get(request_id)
                    if future and not future.done():
                        future.set_result(payload_data)
                        
                # Stream logs/outputs to any active mobile chat socket
                chat_sockets = manager.active_chats.get(user, [])
                for s in chat_sockets:
                    await s.send_text(json.dumps({
                        "type": "laptop_log",
                        "content": payload_data.get("output", data)
                    }))
            except Exception:
                # Fallback to sending raw strings to chat clients
                chat_sockets = manager.active_chats.get(user, [])
                for s in chat_sockets:
                    await s.send_text(json.dumps({"type": "laptop_log", "content": data}))
                    
    except WebSocketDisconnect:
        manager.disconnect_laptop(user)
        # Cancel any pending futures to prevent hangs
        future = LAPTOP_CHANNELS.get(user)
        if future and not future.done():
            future.set_exception(Exception("Laptop disconnected during execution."))
    except Exception as e:
        print(f"Laptop connection error: {e}")
        manager.disconnect_laptop(user)
        future = LAPTOP_CHANNELS.get(user)
        if future and not future.done():
            future.set_exception(e)
