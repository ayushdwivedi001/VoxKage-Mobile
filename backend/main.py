import os
import json
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from typing import List, Dict

# --- Import Custom Backend Modules ---
from auth import (
    OTPRequest, OTPVerify, generate_and_save_otp, verify_otp_code,
    create_access_token, get_current_user, security_scheme
)
from database import (
    create_session, list_sessions, get_session, update_session_name, delete_session,
    log_message, get_session_messages, save_playground_project, list_projects, get_project
)
from file_handler import save_upload, delete_file, UPLOAD_DIR
from rag_engine import index_file_in_rag
from opencode_client import query_opencode_zen
from agent_loop import run_agentic_loop, LAPTOP_CHANNELS

from fastapi.responses import HTMLResponse

app = FastAPI(title="VoxKage Mobile API", version="2026.06.17")

# Mount static files to serve generated documents
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

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

@app.get("/models")
def get_models():
    """
    Fetch active models from OpenCode Zen API or return standard default fallbacks.
    """
    import os
    import requests
    api_key = os.getenv("OPENCODE_API_KEY")
    default_models = ["deepseek-v4-flash-free", "gemini-2.5-flash", "claude-3.5-sonnet"]
    if not api_key:
        return {"models": default_models}
    try:
        response = requests.get(
            "https://opencode.ai/zen/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            models = [m["id"] for m in data.get("data", [])]
            if models:
                return {"models": models}
    except Exception as e:
        print(f"Error calling OpenCode Zen models API: {e}")
    return {"models": default_models}


# Enable CORS for mobile clients and local previews
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Active WebSocket Connections Registry ---
class ConnectionManager:
    def __init__(self):
        # Format: { email: List[WebSocket] }
        self.active_chats: Dict[str, List[WebSocket]] = {}
        # Format: { email: WebSocket } (One active laptop connection per user)
        self.active_laptops: Dict[str, WebSocket] = {}

    async def connect_chat(self, email: str, websocket: WebSocket):
        await websocket.accept()
        if email not in self.active_chats:
            self.active_chats[email] = []
        self.active_chats[email].append(websocket)

    def disconnect_chat(self, email: str, websocket: WebSocket):
        if email in self.active_chats:
            self.active_chats[email].remove(websocket)
            if not self.active_chats[email]:
                del self.active_chats[email]

    async def connect_laptop(self, email: str, websocket: WebSocket):
        await websocket.accept()
        # Overwrite existing laptop connection if reconnected
        self.active_laptops[email] = websocket

    def disconnect_laptop(self, email: str):
        if email in self.active_laptops:
            del self.active_laptops[email]

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
    name: str, 
    html: str = "", 
    css: str = "", 
    js: str = "", 
    project_id: str | None = None, 
    user: str = Depends(get_current_user)
):
    return save_playground_project(user, project_id, name, html, css, js)

@app.get("/projects/{project_id}")
def get_single_project(project_id: str, user: str = Depends(get_current_user)):
    return get_project(project_id, user)

# --- File Upload & RAG Indexing Endpoint ---

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: str = Depends(get_current_user)
):
    """
    Receives file uploads, saves them, and indexes their contents in Supabase pgvector database.
    """
    file_path = save_upload(file)
    try:
        # Index document vectors
        result = index_file_in_rag(file_path, file.filename, user)
        # Clean up local file after indexing
        delete_file(file_path)
        return result
    except Exception as e:
        delete_file(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to process and index upload: {str(e)}")

# --- WebSocket Chat Streaming Server ---

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

    try:
        # Fetch current session details to check default names
        session_info = get_session(session_id, user)
        messages_history = get_session_messages(session_id)

        while True:
            # Receive user text query
            data = await websocket.receive_text()
            payload_data = json.loads(data)
            query = payload_data.get("message", "").strip()
            model_key = payload_data.get("model", "deepseek-flash")

            if not query:
                continue

            # Log user query to database
            log_message(session_id, "user", query)

            # Prepare chat query history
            formatted_history = []
            for msg in messages_history[-10:]: # Limit context window history to last 10 messages
                formatted_history.append({"role": msg["role"], "content": msg["content"]})

            # Stream Agentic Loop response to client
            full_response = ""
            async_generator = run_agentic_loop(
                prompt=query,
                user_id=user,
                session_id=session_id,
                model_key=model_key,
                history=formatted_history,
                manager_ref=manager
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

            # Signal chunk stream complete
            await websocket.send_text(json.dumps({"type": "done"}))

            # --- Auto-generate Session Title ---
            # If session is named "New Chat", generate a smart title using the first message
            if session_info.get("name") == "New Chat":
                try:
                    title_prompt = f"Summarize this query into a short, creative 3-5 word title for a chat thread (do not include quotes): '{query}'"
                    generated_title = query_opencode_zen(title_prompt, model_key).strip().replace('"', '')
                    if generated_title:
                        update_session_name(session_id, user, generated_title)
                        session_info["name"] = generated_title
                        await websocket.send_text(json.dumps({"type": "rename", "name": generated_title}))
                except Exception as e:
                    print(f"⚠️ Failed to auto-generate session title: {e}")

    except WebSocketDisconnect:
        manager.disconnect_chat(user, websocket)
    except Exception as e:
        print(f"WebSocket Error: {e}")
        manager.disconnect_chat(user, websocket)


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
                
                # Check if it's a command execution response
                if payload_data.get("type") == "execution_result":
                    future = LAPTOP_CHANNELS.get(user)
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
