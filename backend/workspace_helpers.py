# workspace_helpers.py — Workspace file management and project initialization helpers.
# Extracted from agent_loop.py to keep workspace logic separate from the main agent orchestrator.

import os
import json
from memory_engine import remember_user


def save_frontend_snippet(user_id: str, title: str, code: str, description: str, tags: str) -> str:
    val = {
        "code": code,
        "description": description,
        "tags": [t.strip().lower() for t in tags.split(",")]
    }
    return remember_user(user_id, "frontend_snippets", title, json.dumps(val))

def search_frontend_snippets(user_id: str, query: str) -> str:
    from database import get_db
    db = get_db()
    res = db.table("user_memories").select("*").eq("user_id", user_id).eq("category", "frontend_snippets").execute()
    memories = res.data or []
    if not memories:
        return "No frontend snippets found."
    
    query_lower = query.lower()
    results = []
    for m in memories:
        try:
            val = json.loads(m["value"])
            searchable = f"{m['key']} {val.get('description', '')} {' '.join(val.get('tags', []))}".lower()
            if query_lower in searchable:
                results.append({
                    "title": m["key"],
                    "code": val.get("code", ""),
                    "description": val.get("description", ""),
                    "tags": val.get("tags", [])
                })
        except:
            continue
            
    if not results:
        return f"No snippets found matching '{query}'."
        
    out = f"Found {len(results)} matching frontend snippets:\n\n"
    for r in results:
        out += f"--- {r['title']} ---\n"
        out += f"Tags: {', '.join(r['tags'])}\n"
        out += f"Description: {r['description']}\n"
        out += f"Code:\n{r['code']}\n\n"
    return out

def get_safe_workspace_path(base_dir: str, file_path: str) -> str:
    clean_relative = file_path.lstrip("/\\")
    resolved_path = os.path.abspath(os.path.join(base_dir, clean_relative))
    if not resolved_path.startswith(os.path.abspath(base_dir)):
        raise PermissionError("Path traversal attempt detected.")
    return resolved_path

def sync_workspace_to_local(project_id: str, files_dict: dict):
    base_dir = os.path.join("projects", str(project_id))
    os.makedirs(base_dir, exist_ok=True)
    # Clear directory first to avoid stale files from previous runs
    for root, dirs, files in os.walk(base_dir, topdown=False):
        for name in files:
            try:
                os.remove(os.path.join(root, name))
            except:
                pass
        for name in dirs:
            try:
                os.rmdir(os.path.join(root, name))
            except:
                pass
    
    for rel_path, content in files_dict.items():
        try:
            safe_path = get_safe_workspace_path(base_dir, rel_path)
            os.makedirs(os.path.dirname(safe_path), exist_ok=True)
            with open(safe_path, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            print(f"Error syncing {rel_path} to local: {e}")

def get_workspace_files_dict(project_id: str) -> dict:
    base_dir = os.path.join("projects", str(project_id))
    files_dict = {}
    if not os.path.exists(base_dir):
        return files_dict
    
    for root, _, files in os.walk(base_dir):
        for name in files:
            full_path = os.path.join(root, name)
            rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    files_dict[rel_path] = f.read()
            except Exception as e:
                print(f"Error reading {rel_path} from local: {e}")
    return files_dict

def cleanup_local_workspace(project_id: str):
    base_dir = os.path.join("projects", str(project_id))
    if os.path.exists(base_dir):
        import shutil
        try:
            shutil.rmtree(base_dir)
        except Exception as e:
            print(f"Error cleaning up workspace {project_id}: {e}")

def ensure_active_project(user_id: str, session_id: str, active_project_box: list) -> str:
    if active_project_box and active_project_box[0] is not None:
        project_id = active_project_box[0].get("id")
        if project_id:
            return project_id

    from database import get_session, save_playground_project
    try:
        session_info = get_session(session_id, user_id)
        session_name = session_info.get("name", "New Chat")
    except Exception:
        session_name = "Workspace Project"

    project_name = f"Playground - {session_name}"
    
    new_proj = save_playground_project(
        user_id=user_id,
        project_id=None,
        name=project_name,
        html="<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Preview</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <h1>Live Preview Workspace</h1>\n  <script src=\"script.js\"></script>\n</body>\n</html>",
        css="body {\n  background-color: #0f172a;\n  color: #f8fafc;\n  font-family: sans-serif;\n  padding: 20px;\n}",
        js="// JavaScript code here",
        files={}
    )
    
    if len(active_project_box) > 0:
        active_project_box[0] = new_proj
    else:
        active_project_box.append(new_proj)
        
    project_id = new_proj.get("id")
    sync_workspace_to_local(project_id, new_proj.get("files") or {})
    return project_id
