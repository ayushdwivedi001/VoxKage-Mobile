import os
from supabase import create_client, Client
from fastapi import HTTPException

# --- Supabase Credentials ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_client: Client | None = None

def get_db() -> Client:
    global _client
    if _client is not None:
        return _client

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase credentials (SUPABASE_URL, SUPABASE_KEY) are not set in backend environment."
        )
    try:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return _client
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to Supabase: {str(e)}")

# --- Session Management ---
def create_session(user_id: str, name: str = "New Chat") -> dict:
    db = get_db()
    data = {
        "name": name,
        "user_id": user_id
    }
    res = db.table("sessions").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create session.")
    return res.data[0]

def list_sessions(user_id: str) -> list:
    db = get_db()
    res = db.table("sessions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return res.data or []

def get_session(session_id: str, user_id: str) -> dict:
    db = get_db()
    res = db.table("sessions").select("*").eq("id", session_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found.")
    return res.data[0]

def update_session_name(session_id: str, user_id: str, name: str) -> dict:
    db = get_db()
    res = db.table("sessions").update({"name": name}).eq("id", session_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found or rename failed.")
    return res.data[0]

def delete_session(session_id: str, user_id: str) -> dict:
    db = get_db()
    res = db.table("sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()
    return {"status": "success", "deleted_session_id": session_id}

# --- Messages Management ---
def log_message(session_id: str, role: str, content: str) -> dict:
    db = get_db()
    data = {
        "session_id": session_id,
        "role": role,
        "content": content
    }
    res = db.table("messages").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to log message.")
    return res.data[0]

def get_session_messages(session_id: str) -> list:
    db = get_db()
    res = db.table("messages").select("*").eq("session_id", session_id).order("timestamp", desc=False).execute()
    return res.data or []

# --- Projects Management (Playground Drawer) ---
def save_playground_project(user_id: str, project_id: str | None, name: str, html: str, css: str, js: str) -> dict:
    db = get_db()
    data = {
        "name": name,
        "html": html,
        "css": css,
        "js": js,
        "user_id": user_id,
        "updated_at": "now()"
    }
    if project_id:
        # Update existing
        res = db.table("projects").update(data).eq("id", project_id).eq("user_id", user_id).execute()
    else:
        # Create new
        res = db.table("projects").insert(data).execute()
        
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save playground project.")
    return res.data[0]

def list_projects(user_id: str) -> list:
    db = get_db()
    res = db.table("projects").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
    return res.data or []

def get_project(project_id: str, user_id: str) -> dict:
    db = get_db()
    res = db.table("projects").select("*").eq("id", project_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found.")
    return res.data[0]

def delete_playground_project(project_id: str, user_id: str) -> dict:
    db = get_db()
    res = db.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()
    return {"status": "success", "deleted_project_id": project_id}
