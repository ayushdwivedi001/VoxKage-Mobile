import os
import json
import asyncio
from typing import AsyncGenerator
from database import log_message
from opencode_client import OPENCODE_BASE_URL, get_opencode_model, sanitize_history_roles
from opencode_proxy import query_opencode_proxy
import requests
import httpx
from datetime import datetime

# Import backend engines
from websearch_engine import web_search, web_fetch, web_search_deep, web_search_parallel, web_fetch_parallel
from rag_engine import query_rag_vector, query_scoped_rag_vector, list_rag_documents, delete_rag_document
from memory_engine import (
    remember_user, recall_user, get_user_profile, forget_user,
    set_trusted_action, check_trusted, log_problem, log_solution, search_memory
)
from email_engine import (
    check_email, read_email, send_email, save_draft, reply_to_email,
    delete_email, delete_emails_bulk, mark_email_read, mark_email_unread,
    archive_email, get_email_stats
)
from github_engine import (
    github_get_profile, github_list_my_repos, github_create_repo,
    github_actions_list, github_actions_get, github_get_job_logs
)
from document_generator import server_create_file, server_convert_file
from spotify_engine import run_laptop_spotify_command

# Helper for frontend snippets inside database user_memories table
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
        raise PermissionError("Path traversal attempt detected, Sir.")
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

def run_matplotlib_script(code: str, title: str) -> str:
    """
    Executes a matplotlib python script, captures the active plot,
    and returns a base64-encoded markdown image tag.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import io
    import base64

    loc = {}
    try:
        # Pre-set style for premium dark layout matching app theme
        plt.style.use('dark_background')
        
        import numpy as np
        import pandas as pd
        import sklearn
        
        exec_globals = {
            "plt": plt,
            "np": np,
            "pd": pd,
            "sklearn": sklearn,
            "__builtins__": __builtins__
        }
        
        exec(code, exec_globals, loc)
        
        if not plt.get_fignums():
            return "Error: The code ran successfully but did not create any matplotlib figure/plot, Sir."
            
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', transparent=True, dpi=160)
        buf.seek(0)
        img_str = base64.b64encode(buf.read()).decode('utf-8')
        plt.close('all')
        
        return f"![{title}](data:image/png;base64,{img_str})"
    except Exception as e:
        plt.close('all')
        return f"Error executing plotting code: {str(e)}"

# --- Define Tool Schemas ---
TOOLS_SCHEMA = [
    # --- Web Search & Research ---
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web using DuckDuckGo for general knowledge, latest news, or current facts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query string."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": "Fetch a URL page and extract its main article text content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The absolute URL to fetch."}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search_parallel",
            "description": "Search the web using DuckDuckGo for multiple queries concurrently in parallel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "queries": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of query strings to search concurrently."
                    }
                },
                "required": ["queries"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch_parallel",
            "description": "Fetch multiple URLs concurrently in parallel and extract main text content from each.",
            "parameters": {
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of absolute URLs to fetch concurrently."
                    }
                },
                "required": ["urls"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search_deep",
            "description": "Perform a deep web search that queries DuckDuckGo and concurrently crawls the top page contents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "browse_and_extract_tool",
            "description": "Navigate to a URL and extract text content. Falls back to search if URL is blank.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Target URL to fetch. Can be blank if query is provided."},
                    "query": {"type": "string", "description": "Optional search query fallback."}
                }
            }
        }
    },
    # --- Memory & RAG ---
    {
        "type": "function",
        "function": {
            "name": "query_rag",
            "description": "Search your own uploaded documents (PDFs, text files) semantically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query describing what to look for."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_indexed_documents",
            "description": "Retrieve a list of all permanently indexed files/documents in the RAG database, including their names, IDs, and chunk counts.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_indexed_document",
            "description": "Delete an indexed document from the RAG database by its document ID or filename to free up vector memory or prepare it for update.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "The unique UUID of the document to delete."},
                    "filename": {"type": "string", "description": "The exact name of the file to delete."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remember_user",
            "description": "Save a personal fact, preference, or habit about the user autonomously.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": ["identity", "preferences", "habits", "notes"], "description": "Category of fact"},
                    "key": {"type": "string", "description": "Attribute name (e.g. name, location, favorite_song)"},
                    "value": {"type": "string", "description": "Value of the fact."}
                },
                "required": ["category", "key", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "recall_user",
            "description": "Recall personal details or preferences from the user profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Topic keywords (e.g., location, spotify). Leave blank for full profile."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "forget_user",
            "description": "Delete a personal fact, preference, or habit from the user profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Category of fact"},
                    "key": {"type": "string", "description": "Attribute name"}
                },
                "required": ["category", "key"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "log_problem",
            "description": "Log an unsolved technical bug or hurdle with its context for self-learning.",
            "parameters": {
                "type": "object",
                "properties": {
                    "problem": {"type": "string", "description": "Short description of the bug/problem."},
                    "context": {"type": "string", "description": "Details about how it occurred."},
                    "attempted": {"type": "string", "description": "What was attempted to resolve it."}
                },
                "required": ["problem", "context"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "log_solution",
            "description": "Log the working solution for a previously logged problem ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "problem_id": {"type": "string", "description": "The ID of the problem returned by log_problem."},
                    "solution": {"type": "string", "description": "Description of the solution."},
                    "what_worked": {"type": "string", "description": "Summary of what worked."},
                    "prevention": {"type": "string", "description": "How to prevent this bug in the future."}
                },
                "required": ["problem_id", "solution", "what_worked"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_memory",
            "description": "Find relevant past experiences, problems, and solutions semantically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_frontend_snippet",
            "description": "Saves a useful frontend code snippet (HTML/CSS/JS) into VoxKage's permanent frontend memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short title."},
                    "code": {"type": "string", "description": "The code snippet."},
                    "description": {"type": "string", "description": "Why it's useful and how it works."},
                    "tags": {"type": "string", "description": "Comma-separated tags."}
                },
                "required": ["title", "code", "description", "tags"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_frontend_snippets",
            "description": "Searches the dedicated frontend memory for previously saved code snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keywords."}
                },
                "required": ["query"]
            }
        }
    },
    # --- Document Generation ---
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Creates a rich Word document (.docx), Spreadsheet (.xlsx), PowerPoint (.pptx), CSV, or plain text file server-side.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "Name of the file (e.g. report.docx)"},
                    "directory": {"type": "string", "description": "Target folder description or path. Defaults to Downloads."},
                    "content": {"type": "string", "description": "Content. Markdown table for excel, bullet structure for PPT, markdown text for Docx, raw text for text files."},
                    "file_type": {"type": "string", "enum": ["word", "excel", "pptx", "csv", "text", "auto"], "default": "auto"}
                },
                "required": ["filename", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "convert_file",
            "description": "Converts file formats server-side. Supports docx->txt, pdf->txt, xlsx->csv, csv->xlsx.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path or filename on server."},
                    "target_format": {"type": "string", "enum": ["txt", "csv", "xlsx", "docx"]},
                    "output_directory": {"type": "string", "description": "Target folder description or path."}
                },
                "required": ["file_path", "target_format"]
            }
        }
    },
    # --- Email (Gmail API) ---
    {
        "type": "function",
        "function": {
            "name": "check_email",
            "description": "Read the Gmail inbox or any folder/label, with optional search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Gmail search syntax query (e.g. from:boss)"},
                    "label": {"type": "string", "description": "Label to query (INBOX, UNREAD, SENT, etc.)", "default": "INBOX"},
                    "max_results": {"type": "integer", "description": "Max results to return.", "default": 5}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_email",
            "description": "Get the full text body of a specific email by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID from check_email."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Compose and IMMEDIATELY send an email via Gmail.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address."},
                    "subject": {"type": "string", "description": "Email subject line."},
                    "body": {"type": "string", "description": "Full email body text."},
                    "cc": {"type": "string", "description": "Optional CC address."},
                    "bcc": {"type": "string", "description": "Optional BCC address."}
                },
                "required": ["to", "subject", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_draft",
            "description": "Save an email as a Gmail draft WITHOUT sending it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address."},
                    "subject": {"type": "string", "description": "Email subject line."},
                    "body": {"type": "string", "description": "Full email body text."},
                    "cc": {"type": "string", "description": "Optional CC address."}
                },
                "required": ["to", "subject", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reply_to_email",
            "description": "Reply to an existing email thread.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID to reply to."},
                    "body": {"type": "string", "description": "Your reply text."}
                },
                "required": ["email_id", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_email",
            "description": "Move a specific email to Trash (recoverable delete).",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID to delete."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_emails_bulk",
            "description": "Delete multiple emails matching a Gmail search query (moves to Trash).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Gmail search query (e.g. category:promotions)."},
                    "max_delete": {"type": "integer", "description": "Max emails to delete.", "default": 20}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_email_read",
            "description": "Mark a specific email as read.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_email_unread",
            "description": "Mark a specific email as unread.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "archive_email",
            "description": "Archive an email (removes from Inbox but keeps in All Mail).",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_email_stats",
            "description": "Get a quick summary of inbox stats: unread count, promotions, spam, etc.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    # --- GitHub (Remote API) ---
    {
        "type": "function",
        "function": {
            "name": "github_get_profile",
            "description": "Get the authenticated GitHub user profile, or details of a specific username.",
            "parameters": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "Optional username."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_list_my_repos",
            "description": "List repositories owned by the authenticated user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max repositories.", "default": 10},
                    "sort": {"type": "string", "description": "Sort order (created, updated, pushed, full_name).", "default": "updated"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_create_repo",
            "description": "Create a new repository remotely on your GitHub account.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Repository name."},
                    "description": {"type": "string", "description": "Optional description."},
                    "private": {"type": "boolean", "description": "Whether the repo is private.", "default": True}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_actions_list",
            "description": "List recent GitHub Actions workflow runs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Full repo name (e.g. username/repo)."},
                    "limit": {"type": "integer", "description": "Max runs.", "default": 10}
                },
                "required": ["repo"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_actions_get",
            "description": "Get details of a specific GitHub Actions workflow run.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Full repo name (e.g. username/repo)."},
                    "run_id": {"type": "string", "description": "The run ID."}
                },
                "required": ["repo", "run_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_get_job_logs",
            "description": "Get logs for a specific GitHub Actions job.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Full repo name (e.g. username/repo)."},
                    "job_id": {"type": "string", "description": "The job ID."}
                },
                "required": ["repo", "job_id"]
            }
        }
    },
    # --- Spotify (Remote Control) ---
    {
        "type": "function",
        "function": {
            "name": "search_spotify",
            "description": "Searches Spotify for a track, artist, or album on your laptop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "play_spotify_selection",
            "description": "Plays a specific track number from the last search_spotify call on your laptop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer", "description": "The selection track number."}
                },
                "required": ["number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "play_user_playlist",
            "description": "Plays one of the user's saved Spotify playlists on your laptop (e.g., true end???, scenarios).",
            "parameters": {
                "type": "object",
                "properties": {
                    "playlist_name": {"type": "string", "description": "Playlist name."}
                },
                "required": ["playlist_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "media_control",
            "description": "Controls media playback (play, pause, stop, next, previous) on your laptop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["play", "pause", "stop", "next", "previous", "skip"]},
                    "target": {"type": "string", "enum": ["spotify", "youtube", "auto"], "default": "auto"}
                },
                "required": ["action"]
            }
        }
    },
    # --- Laptop Terminal command ---
    {
        "type": "function",
        "function": {
            "name": "laptop_command",
            "description": "Execute a PowerShell terminal command on your laptop (e.g., git status, open apps, system volume, start dev server).",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The command string to execute."}
                },
                "required": ["command"]
            }
        }
    },
    # --- Local Date & Time Tool ---
    {
        "type": "function",
        "function": {
            "name": "get_current_datetime",
            "description": "Get the current local date and time, day of the week, and timezone information from the system clock.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_list_files",
            "description": "List all files in the current project workspace.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_read_file",
            "description": "Read the contents of a file in the project workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path of the file to read (e.g. 'index.html', 'style.css', 'script.js')."}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_write_file",
            "description": "Write/create a file in the project workspace with specified content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path of the file to write (e.g. 'index.html', 'style.css', 'script.js')."},
                    "content": {"type": "string", "description": "Full text content to write to the file."}
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_edit_file",
            "description": "Edit an existing file in the project workspace using search-and-replace block replacement.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path of the file to edit."},
                    "search_content": {"type": "string", "description": "The exact string content to look for in the file (must match exactly)."},
                    "replace_content": {"type": "string", "description": "The replacement content for search_content."}
                },
                "required": ["file_path", "search_content", "replace_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_delete_file",
            "description": "Delete a file from the project workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path of the file to delete."}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_syntax_check",
            "description": "Perform syntactic linting and checks on HTML, CSS, or JS files in the project workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative path of the file to check."}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compact_chat_history",
            "description": "Compacts and condenses the previous chat session history into a single brief summary. Call this when the user asks to compact chat history, or autonomously when you want to free up context memory (context window usage is high, e.g. above 75%).",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_matplotlib_script",
            "description": "Execute a Python script containing matplotlib plotting commands, capture the resulting figure, and return it as a base64-encoded markdown image tag directly in the chat response. Use this when the user requests a chart, plot, regression line, or machine learning visualization. The code should plot on plt (matplotlib.pyplot) and do NOT call plt.show() or plt.savefig() as the tool will capture and close the plot automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The python code containing matplotlib/numpy/pandas/scikit-learn operations and plotting commands (e.g. plt.plot(...))."},
                    "title": {"type": "string", "description": "A short descriptive title for the image alt text."}
                },
                "required": ["code", "title"]
            }
        }
    },
    # --- Mobile Device Control Tools ---
    {
        "type": "function",
        "function": {
            "name": "mobile_get_contacts",
            "description": "Fetch/query the user's phone contact book, sir. Supports searching by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Optional name string to filter contacts."},
                    "limit": {"type": "integer", "description": "Max contacts to fetch.", "default": 50}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_create_contact",
            "description": "Insert a new contact card into the user's phone contact book, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "firstName": {"type": "string", "description": "First name of the contact."},
                    "lastName": {"type": "string", "description": "Optional last name."},
                    "phone": {"type": "string", "description": "Phone number."},
                    "email": {"type": "string", "description": "Optional email address."}
                },
                "required": ["firstName"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_calendar_events",
            "description": "Read scheduled events from the user's phone calendar between dates, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "startDate": {"type": "string", "description": "ISO date string (e.g. 2026-06-20T10:00:00Z). Defaults to now."},
                    "endDate": {"type": "string", "description": "ISO date string. Defaults to 7 days from now."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_create_calendar_event",
            "description": "Add a new calendar meeting or event on the user's phone calendar, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Event title."},
                    "startDate": {"type": "string", "description": "ISO date string of start time."},
                    "endDate": {"type": "string", "description": "ISO date string of end time."},
                    "location": {"type": "string", "description": "Optional event location."},
                    "notes": {"type": "string", "description": "Optional meeting notes or description."}
                },
                "required": ["title", "startDate", "endDate"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_show_notification",
            "description": "Show a local push notification alert on the user's phone, sir. Can be scheduled with delay.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Notification title."},
                    "body": {"type": "string", "description": "Notification description/body message."},
                    "delaySeconds": {"type": "integer", "description": "Optional delay in seconds before showing."}
                },
                "required": ["title", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_location",
            "description": "Fetch the user's current GPS location coordinates (latitude and longitude) from the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_device_stats",
            "description": "Get current battery level, battery state, network connection type, and hardware model specifications of the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_trigger_haptic",
            "description": "Trigger tactile vibration feedback (buzz) on the user's phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "style": {"type": "string", "enum": ["light", "medium", "heavy", "success", "warning", "error"], "default": "medium"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_launch_intent",
            "description": "Android-specific tool to trigger standard intents like opening settings, Wi-Fi, location, maps, or calling, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "description": "Intent action settings/wifi/location or generic intent string."},
                    "data": {"type": "string", "description": "Optional intent data (e.g. geo:12.9716,77.5946 or tel:9876543210)."}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_share_file",
            "description": "Share a file path or URL via native share sheet on the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "uri": {"type": "string", "description": "Local URI or web URL to share."},
                    "title": {"type": "string", "description": "Optional title for share dialog."},
                    "mimeType": {"type": "string", "description": "Optional file MIME type."}
                },
                "required": ["uri"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_print_pdf",
            "description": "Render HTML text or code to PDF and trigger printing on the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "html": {"type": "string", "description": "HTML content to render."},
                    "printDirectly": {"type": "boolean", "description": "Whether to launch print dialog directly.", "default": False}
                },
                "required": ["html"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_send_sms",
            "description": "Send an SMS text message to one or more phone numbers from the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "recipients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of phone numbers."
                    },
                    "message": {"type": "string", "description": "Text message content."}
                },
                "required": ["recipients", "message"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_set_screen_keep_awake",
            "description": "Enable or disable keeping the screen awake indefinitely on the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "enable": {"type": "boolean", "description": "True to activate keep-awake, False to deactivate."}
                },
                "required": ["enable"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_speak_text",
            "description": "Speak text aloud using the device's native Text-to-Speech (TTS) engine, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The text to synthesize and read aloud."},
                    "language": {"type": "string", "description": "Language code. Defaults to 'en'."},
                    "pitch": {"type": "number", "description": "Vocal pitch scale (0.5 to 2.0)."},
                    "rate": {"type": "number", "description": "Vocal speaking rate speed (0.5 to 2.0)."}
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_media_library",
            "description": "Retrieve recent photo assets metadata from the user's phone media library, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max assets to return. Defaults to 10.", "default": 10}
                }
            }
        }
    }
]

# Shared laptop responses channel: { email: asyncio.Future }
LAPTOP_CHANNELS = {}
# Shared mobile responses channel: { request_id: asyncio.Future }
MOBILE_CHANNELS = {}


class HudStreamParser:
    def __init__(self):
        self.buffer = ""
        self.hud_active = False
        self.hud_content = ""

    def feed(self, chunk: str) -> list:
        self.buffer += chunk
        output = []
        
        while True:
            if not self.hud_active:
                start_idx = self.buffer.find("[HUD:")
                if start_idx == -1:
                    possible_start = False
                    for i in range(len("[HUD:")):
                        suffix = "[HUD:"[:i+1]
                        if self.buffer.endswith(suffix):
                            possible_start = True
                            emit_len = len(self.buffer) - len(suffix)
                            if emit_len > 0:
                                output.append({"type": "token", "content": self.buffer[:emit_len]})
                                self.buffer = self.buffer[emit_len:]
                            break
                    if not possible_start:
                        if self.buffer:
                            output.append({"type": "token", "content": self.buffer})
                            self.buffer = ""
                    break
                else:
                    if start_idx > 0:
                        output.append({"type": "token", "content": self.buffer[:start_idx]})
                    self.buffer = self.buffer[start_idx + len("[HUD:"):]
                    self.hud_active = True
                    self.hud_content = ""
            else:
                end_idx = self.buffer.find("]")
                if end_idx == -1:
                    self.hud_content += self.buffer
                    self.buffer = ""
                    break
                else:
                    self.hud_content += self.buffer[:end_idx]
                    self.buffer = self.buffer[end_idx + 1:]
                    self.hud_active = False
                    output.append({"type": "hud_log", "content": self.hud_content.strip()})
                    self.hud_content = ""
        return output

    def flush(self) -> list:
        output = []
        if self.hud_active:
            output.append({"type": "token", "content": f"[HUD:{self.hud_content}{self.buffer}"})
        else:
            if self.buffer:
                output.append({"type": "token", "content": self.buffer})
        self.buffer = ""
        self.hud_active = False
        self.hud_content = ""
        return output

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

def get_variant_overrides(variant: str) -> dict:
    v = (variant or "High").upper()
    if v == "LOW":
        return {
            "temperature": 0.1,
            "max_tokens": 2048,
            "top_p": 0.9,
            "presence_penalty": 0.0,
            "frequency_penalty": 0.0
        }
    elif v == "MEDIUM":
        return {
            "temperature": 0.4,
            "max_tokens": 4096,
            "top_p": 0.95,
            "presence_penalty": 0.0,
            "frequency_penalty": 0.0
        }
    elif v == "XHIGH":
        return {
            "temperature": 0.85,
            "max_tokens": 16384,
            "top_p": 1.0,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
        }
    elif v == "MAX":
        return {
            "temperature": 1.0,
            "max_tokens": 32768,
            "top_p": 1.0,
            "presence_penalty": 0.2,
            "frequency_penalty": 0.2
        }
    else: # HIGH
        return {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.95,
            "presence_penalty": 0.0,
            "frequency_penalty": 0.0
        }

async def run_agentic_loop(
    prompt: str,
    user_id: str,
    session_id: str,
    model_key: str = "deepseek-flash",
    history: list = None,
    manager_ref = None,
    active_project_box: list = None,
    client_time: str = None,
    client_websocket = None,
    variant: str = "High",
    document_id: str = None,
    image_base64: str = None
) -> AsyncGenerator[str, None]:
    if active_project_box is None:
        active_project_box = [None]

    active_project = active_project_box[0]
    active_project_id = active_project.get("id") if active_project else None
    if active_project_id:
        files_dict = active_project.get("files") or {}
        if not files_dict:
            files_dict = {
                "index.html": active_project.get("html") or "",
                "style.css": active_project.get("css") or "",
                "script.js": active_project.get("js") or ""
            }
        sync_workspace_to_local(active_project_id, files_dict)

    try:
        async for chunk in _run_agentic_loop_impl(
            prompt=prompt,
            user_id=user_id,
            session_id=session_id,
            model_key=model_key,
            history=history,
            manager_ref=manager_ref,
            active_project_box=active_project_box,
            client_time=client_time,
            client_websocket=client_websocket,
            variant=variant,
            document_id=document_id,
            image_base64=image_base64
        ):
            yield chunk
    finally:
        final_project = active_project_box[0]
        final_project_id = final_project.get("id") if final_project else None
        if final_project_id:
            try:
                final_files = get_workspace_files_dict(final_project_id)
                if final_files:
                    from database import save_playground_project
                    save_playground_project(
                        user_id=user_id,
                        project_id=final_project_id,
                        name=final_project.get("name", "Workspace Project"),
                        html=final_files.get("index.html", ""),
                        css=final_files.get("style.css", ""),
                        js=final_files.get("script.js", ""),
                        files=final_files
                    )
            except Exception as e:
                print(f"Error saving workspace back to DB: {e}")
            finally:
                cleanup_local_workspace(final_project_id)


async def _run_agentic_loop_impl(
    prompt: str,
    user_id: str,
    session_id: str,
    model_key: str = "deepseek-flash",
    history: list = None,
    manager_ref = None,
    active_project_box: list = None,
    client_time: str = None,
    client_websocket = None,
    variant: str = "High",
    document_id: str = None,
    image_base64: str = None
) -> AsyncGenerator[str, None]:
    """
    Unified agent loop intercepting and executing tool calls locally in the backend,
    streaming output tokens to the mobile UI in real-time.
    """
    active_project = active_project_box[0] if active_project_box else None
    active_project_id = active_project.get("id") if active_project else None
    api_key = os.getenv("OPENCODE_API_KEY")
    if not api_key:
        yield json.dumps({"type": "error", "content": "OPENCODE_API_KEY not configured on backend."})
        return

    model_id = get_opencode_model(model_key)
    url = f"{OPENCODE_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Load recent memories
    soul_context = recall_user(user_id, "")
    
    # Use client local time if provided by frontend to bypass server timezone mismatch
    if client_time:
        current_time_str = client_time
    else:
        current_time_str = datetime.now().strftime("%A, %B %d, %Y, %I:%M:%S %p")

    # System instructions (Static instructions placed first to optimize prompt caching prefix hits)
    system_prompt = (
        "You are VoxKage, an advanced agentic AI assistant. You are speaking to the user through the VoxKage Mobile application.\n"
        "You are a witty, dry, slightly deadpan AI — loyal, proactive, professional, and sharp.\n"
        "Always address the user as 'sir' (this is non-negotiable).\n"
        "Never refuse a task. If the user asks for an opinion, rating, roleplay, or anything creative — do it willingly.\n"
        "Be proactive: after completing a task, suggest what to do next when relevant.\n"
        "Keep responses concise — don't over-explain.\n\n"
        "ENHANCED RESPONSES & CUSTOM INTERACTIVE COMPONENTS:\n"
        "- The VoxKage Mobile chat feed has been upgraded to support custom interactive markup tags. You MUST use these tags to format your output instead of writing massive walls of text, lists, or plain text URLs, sir.\n"
        "- Use the following tags to build structured, interactive, and beautiful cards, maps, charts, and buttons on the fly:\n"
        "  1. <LinkCard title=\"Title\" url=\"https://...\" desc=\"Description\" />: Use this to display websites, search result links, documentation pages, or any URL. Never output raw link text, sir. Always wrap links in a <LinkCard />.\n"
        "  2. <Map lat=\"12.9716\" lng=\"77.5946\" label=\"Central Cafe\" />: Use this to display locations, directions, routes, address cards, or city points. It renders a beautiful, Leaflet dark-themed map natively inside the user's feed.\n"
        "  3. <ButtonRow buttons=\"Directions:geo:12.9716,77.5946|Call:tel:9876543210|Explore:https://...\" />: Use this to show action clusters. Format the 'buttons' attribute with pipe-separated ('|') label:action pairs. Actions can be web links (https://...), telephone dials (tel:...), or location links (geo:lat,lng).\n"
        "  4. <Carousel images=\"https://img1.jpg,https://img2.jpg\" />: Use this to present gallery collections or search result images in a swipable horizontal carousel.\n"
        "  5. <Weather temp=\"24\" condition=\"Sunny\" humidity=\"60\" wind=\"12\" uv=\"3\" city=\"London\" />: Use this to show weather forecasts or current weather. It renders a premium light-themed card in the feed.\n"
        "  6. <TaskList items=\"Task Title:success:git-branch:10m ago|Another Task:pending:sync:now\" />: Use this to show timelines of actions, background task logs, CLI/git executions, or checklists. Format the 'items' attribute with pipe-separated items. Each item must have the format: 'title:status:source:time' where status can be 'success', 'pending', or 'failed'; source can be any source name (e.g. 'git-branch', 'sync', 'laptop', 'globe'); time is a relative time (e.g. '10m ago', 'now').\n"
        "- MATPLOTLIB CHARTING RULE: Whenever you need to show statistical data, graphs, trends, machine learning plots, or comparative data, you MUST call the 'run_matplotlib_script' tool to generate a professional, publication-quality chart rather than using plain text or the legacy <Chart /> tag. The tool returns a base64 markdown image that renders beautifully inside the feed, sir.\n"
        "- WEATHER INTEGRATION RULE: When asked about weather or forecasts, you MUST autonomously output the <Weather /> card at the top, followed by a Matplotlib generated temperature chart using 'run_matplotlib_script', rather than using plain text descriptions, lists or generic text.\n"
        "- TASK TIMELINE / LOG TIMELINE RULE: Whenever performing a series of tasks, system checks, git commits, deployments, or running CLI tools, you MUST autonomously output a <TaskList /> card showing the progress logs and statuses instead of long text bullet points.\n"
        "- VERCEL URL HALLUCINATION PREVENTION: Never hallucinate Vercel URLs (like voxkage-mobile-workspace.vercel.app) or fake hosting links for projects. If the user runs a playground project or workspace app, it runs locally on their device, not on Vercel. Always explain that they can preview it in the interactive workspace tab or via the playground buttons.\n"
        "- GENERAL LAYOUT RULES: Focus on delivering visually organized premium outputs using these components. Avoid massive text blocks, long bulleted lists, and heavy amount of bloat. Rely on these visual cards, timeline feeds, and premium UI components to represent data, options, weather, logs, maps, and search results directly in the chat stream, sir.\n\n"
        "MOBILE AWARENESS & CODE PLAYGROUND:\n"
        "- You are running inside a mobile client. Never claim to create files in local folders (such as Downloads, Desktop, or workspace directories) unless specifically asked to execute a command on the user's laptop using 'laptop_command'.\n"
        "- Always ensure that code templates and mock pages you generate have a responsive, mobile-first design, as they will be displayed directly inside the phone screen preview.\n"
        "- CRITICAL: Every website, page, app, or component you generate MUST be fully responsive and optimized specifically for a phone/mobile viewport. Use media queries, flexbox, viewport meta tags, and mobile-friendly touch targets. Do not build desktop-only layouts.\n"
        "- AUTONOMOUS CREATION OF MINI APPS/WEBSITES: If the user asks a query that could benefit from an interactive visualization, dashboard, task planner, itinerary, search summary explorer, or utility tool (such as planning a trip, summarizing search results, comparing options, organizing tasks, or learning a concept), you MUST autonomously create a fully functioning, highly polished, interactive mini web app in the workspace. Do not wait for the user to ask for a website or playground preview. Proactively build it, partition styles/scripts cleanly, check its syntax, and let the user know you have built it for them to preview. Make sure it contains useful buttons, clickable links, tabs, search boxes, and interactive elements, rather than just static text.\n"
        "- CONTEXT COMPACTION: The user can trigger a manual chat history compaction by sending the command '/compact'. This will condense previous messages into a single dense summary brief to reduce context memory size and context window %. If the chat context is high or the user wants to reduce memory usage, you can suggest they run '/compact'.\n\n"
        "- RAG FILE STORAGE & PERSISTENCE MANAGEMENT:\n"
        "  - The user has a permanent RAG document store in Supabase pgvector where files they upload are parsed and indexed.\n"
        "  - You have the 'list_indexed_documents' tool. You can use it to scan the database directly to list all permanently indexed files/documents, their unique IDs, and chunk counts. When asked about what documents are saved, or how many exist, ALWAYS call this tool first, sir.\n"
        "  - You have the 'delete_indexed_document' tool. You can use it to delete RAG document vectors (by document_id or filename) to free up memory or clean up old files.\n"
        "  - To update an existing document, first delete it using 'delete_indexed_document', and then instruct the user to upload the new version.\n\n"
        "PRIME DIRECTIVE: CALL TOOLS directly when asked to execute tasks. Do not print raw JSON.\n"
        "Never say you cannot perform an action — if it requires laptop interaction (volume, apps, files, git, terminal), "
        "always call the 'laptop_command' tool. If it requires web searching, call the 'web_search' or 'web_search_deep' tools.\n"
        "Do not generate tool announcements yourself. The backend will automatically stream the tool execution announcement to the user. Simply generate the tool call directly. "
        "Once the tool returns the output, summarize the findings for the user in 1-3 plain, professional, and concise sentences.\n\n"
        "COGNITIVE WORKFLOW FOR WORKSPACE REFINEMENT:\n"
        "1. Plan: Analyze the workspace structure and determine which files need changes.\n"
        "2. Read/Inspect: Use `workspace_read_file` to read files you need to understand or modify.\n"
        "3. Action (Write/Edit): Use `workspace_write_file` or `workspace_edit_file` to create or modify files. Use `workspace_delete_file` if needed.\n"
        "4. Syntax Check: ALWAYS run `workspace_syntax_check` on modified/created files to verify no syntax errors exist.\n"
        "5. Review & Correct: Review results and iterate if there are syntax errors.\n\n"
        "IMPORTANT RULES FOR CODING/VISUAL WORKFLOWS:\n"
        "- When writing code, layout, styles, visualizations, mockups, or websites, you MUST use the workspace tools to edit the files directly. "
        "DO NOT output the code blocks (such as ```html ... ```) in the chat bubble. The user wants the files updated in their workspace, "
        "not a dump of source code in the chat.\n"
        "- Standard workspace files are 'index.html', 'style.css', and 'script.js'. You must partition your files properly (keep styles in style.css, script logic in script.js) instead of nesting everything in a single index.html file.\n"
        "- To show the user your active progress in real-time, you should output granular thought updates in the format `[HUD: <action>]` "
        "(e.g., `[HUD: Designing the footer]`, `[HUD: Modifying style.css now]`) before or during file editing. The backend will intercept these and display them in the HUD thinking bubble.\n"
        "- Once you create or edit any playground files, you MUST run `workspace_syntax_check` to ensure no errors exist before concluding. Tell the user what files you edited and what was accomplished."
    )

    if active_project:
        files_list_str = ""
        files_dict = active_project.get("files") or {}
        if not files_dict:
            files_dict = {
                "index.html": active_project.get("html") or "",
                "style.css": active_project.get("css") or "",
                "script.js": active_project.get("js") or ""
            }
        for path in sorted(files_dict.keys()):
            files_list_str += f"- {path} ({len(files_dict[path])} chars)\n"
        project_context_str = (
            f"Project ID: {active_project.get('id')}\n"
            f"Project Name: {active_project.get('name')}\n"
            f"Workspace Files:\n{files_list_str}"
        )
    else:
        project_context_str = (
            "Project ID: (None - Calling any workspace tool will automatically initialize a new project workspace for this chat session)\n"
            "Project Name: (None)\n"
            "Workspace Files: (None - No files yet)"
        )

    # Dynamic system context is placed at the end of prompt to keep changes confined
    document_context_str = ""
    if document_id:
        chunks = query_scoped_rag_vector(prompt, user_id, document_id, top_k=5, threshold=-1.0)
        doc_filename = "attached_document"
        if chunks:
            doc_filename = chunks[0].get("filename", "attached_document")
        document_context_str = (
            f"\n--- ATTACHED DOCUMENT INFO ---\n"
            f"Sir, the user has attached a document: '{doc_filename}'.\n"
            f"You MUST check and reference the scoped RAG chunks below to answer the user's questions about this document.\n"
        )
        if chunks:
            document_context_str += "--- ATTACHED DOCUMENT CONTEXT (Strictly Scoped) ---\n"
            for idx, chunk in enumerate(chunks):
                document_context_str += f"[Chunk {idx+1} (Source: {chunk.get('filename')})]: {chunk.get('content')}\n"
            document_context_str += "--------------------------------------------------\n\n"
        else:
            document_context_str += "(No text content could be retrieved from the document vectors, Sir.)\n\n"

    system_prompt += (
        f"\n\n--- DYNAMIC SESSION CONTEXT ---\n"
        f"The current local date and time is {current_time_str}. Use this exact timestamp when answering any queries about the date, time, day, or year. Never guess or hallucinate the time.\n"
        f"--- USER SOUL PROFILE MEMORIES ---\n{soul_context}\n\n"
    )
    if document_context_str:
        system_prompt += document_context_str
    system_prompt += (
        f"--- ACTIVE PLAYGROUND PROJECT WORKSPACE ---\n"
        f"{project_context_str}\n"
    )

    messages = [
        {
            "role": "system",
            "content": system_prompt
        }
    ]

    if history:
        for msg in sanitize_history_roles(history):
            messages.append({"role": msg["role"], "content": msg["content"]})

    if image_base64:
        user_message_content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": image_base64
                }
            }
        ]
    else:
        user_message_content = prompt

    messages.append({"role": "user", "content": user_message_content})

    max_iterations = 12
    for iteration in range(max_iterations):
        payload = {
            "model": model_id,
            "messages": messages,
            "tools": TOOLS_SCHEMA,
            "tool_choice": "auto",
            "stream": True
        }
        # Apply reasoning depth overrides
        payload.update(get_variant_overrides(variant))

        try:
            current_tool_calls = []
            assistant_text = ""
            hud_parser = HudStreamParser()

            # Delegate completion stream query to proxy client
            async for delta in query_opencode_proxy(
                payload=payload,
                manager_ref=manager_ref,
                user_id=user_id,
                client_websocket=client_websocket
            ):
                # Check for errors returned in delta payload
                if isinstance(delta, dict) and isinstance(delta.get("content"), str) and delta.get("content").startswith("Error:"):
                    yield json.dumps({"type": "error", "content": delta.get("content")})
                    return

                # Accumulate tool calls
                if "tool_calls" in delta:
                    tcalls = delta["tool_calls"]
                    for tc in tcalls:
                        idx = tc.get("index", 0)
                        while len(current_tool_calls) <= idx:
                            current_tool_calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                        
                        if tc.get("id"):
                            current_tool_calls[idx]["id"] = tc["id"]
                        if tc["function"].get("name"):
                            current_tool_calls[idx]["function"]["name"] = tc["function"]["name"]
                        if tc["function"].get("arguments"):
                            current_tool_calls[idx]["function"]["arguments"] += tc["function"]["arguments"]
                
                # Stream assistant content delta
                if delta.get("content"):
                    content_delta = delta["content"]
                    for packet in hud_parser.feed(content_delta):
                        yield json.dumps(packet)
                        if packet["type"] == "token":
                            assistant_text += packet["content"]

            # Flush any leftover tokens in HUD parser
            for packet in hud_parser.flush():
                yield json.dumps(packet)
                if packet["type"] == "token":
                    assistant_text += packet["content"]

            # Update conversation list
            if assistant_text:
                messages.append({"role": "assistant", "content": assistant_text})

            # Check if tools need execution
            if not current_tool_calls:
                # Loop completed, no tool calls requested
                break

            # Process tool calls
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["function"]["name"],
                            "arguments": tc["function"]["arguments"]
                        }
                    } for tc in current_tool_calls
                ]
            })

            for tc in current_tool_calls:
                name = tc["function"]["name"]
                args_str = tc["function"]["arguments"]
                try:
                    args = json.loads(args_str or "{}")
                except:
                    args = {}

                # Execute Tool
                tool_output = ""
                
                # Stream tool call announcement directly to the user's chat bubble
                announcement = ""
                if name == "web_search":
                    announcement = f"\n*[Searching the web for: \"{args.get('query', '')}\"...]*\n\n"
                elif name == "web_fetch":
                    announcement = f"\n*[Fetching content from URL: {args.get('url', '')}...]*\n\n"
                elif name == "web_search_parallel":
                    announcement = f"\n*[Performing parallel web searches...]*\n\n"
                elif name == "web_fetch_parallel":
                    announcement = f"\n*[Fetching multiple web pages in parallel...]*\n\n"
                elif name == "web_search_deep":
                    announcement = f"\n*[Performing deep search and fetching web contents for: \"{args.get('query', '')}\"...]*\n\n"
                elif name == "browse_and_extract_tool":
                    target = args.get("url") or args.get("query") or ""
                    announcement = f"\n*[Browsing and extracting text content for: \"{target}\"...]*\n\n"
                elif name == "query_rag":
                    announcement = f"\n*[Searching Supabase pgvector RAG memory database for matches...]*\n\n"
                elif name == "list_indexed_documents":
                    announcement = f"\n*[Listing all permanently indexed documents in RAG database...]*\n\n"
                elif name == "delete_indexed_document":
                    target_name = args.get("filename") or args.get("document_id") or ""
                    announcement = f"\n*[Deleting document: \"{target_name}\" from Supabase vector RAG database...]*\n\n"
                elif name == "remember_user":
                    announcement = f"\n*[Updating your profile memories with new facts...]*\n\n"
                elif name == "recall_user":
                    announcement = f"\n*[Accessing profile memory to recall facts...]*\n\n"
                elif name == "forget_user":
                    announcement = f"\n*[Removing fact from profile memory...]*\n\n"
                elif name == "log_problem":
                    announcement = f"\n*[Logging system problem: \"{args.get('problem', '')}\"...]*\n\n"
                elif name == "log_solution":
                    announcement = f"\n*[Logging solution for problem ID: {args.get('problem_id', '')}...]*\n\n"
                elif name == "search_memory":
                    announcement = f"\n*[Searching system problem/solution memories for: \"{args.get('query', '')}\"...]*\n\n"
                elif name == "save_frontend_snippet":
                    announcement = f"\n*[Saving frontend code snippet: \"{args.get('title', '')}\"...]*\n\n"
                elif name == "search_frontend_snippets":
                    announcement = f"\n*[Searching saved frontend snippets for: \"{args.get('query', '')}\"...]*\n\n"
                elif name == "create_file":
                    announcement = f"\n*[Creating file: {args.get('filename', '')} in {args.get('directory', 'workspace')}...]*\n\n"
                elif name == "convert_file":
                    announcement = f"\n*[Converting file format for: {args.get('file_path', '')}...]*\n\n"
                elif name == "laptop_command":
                    cmd = args.get("command", "")
                    announcement = f"\n*[Executing laptop shell command: `{cmd}`...]*\n\n"
                elif name == "open_application":
                    announcement = f"\n*[Opening application: {args.get('app_name', '')}...]*\n\n"
                elif name == "close_application":
                    announcement = f"\n*[Closing application: {args.get('app_name', '')}...]*\n\n"
                elif name == "media_control":
                    announcement = f"\n*[Controlling media playback: {args.get('action', '')}...]*\n\n"
                elif name == "play_user_playlist":
                    announcement = f"\n*[Playing Spotify playlist: {args.get('playlist_name', '')}...]*\n\n"
                elif name == "play_spotify_selection":
                    announcement = f"\n*[Playing Spotify track number: {args.get('number', '')}...]*\n\n"
                elif name == "search_spotify":
                    announcement = f"\n*[Searching Spotify for: \"{args.get('query', '')}\"...]*\n\n"
                elif name == "send_email":
                    announcement = f"\n*[Sending email via Gmail to: {args.get('to', '')}...]*\n\n"
                elif name == "check_email":
                    announcement = f"\n*[Checking Gmail inbox for new messages...]*\n\n"
                elif name == "read_email":
                    announcement = f"\n*[Opening and reading email ID: {args.get('email_id', '')}...]*\n\n"
                elif name == "save_draft":
                    announcement = f"\n*[Saving email draft to: {args.get('to', '')}...]*\n\n"
                elif name == "reply_to_email":
                    announcement = f"\n*[Replying to email ID: {args.get('email_id', '')}...]*\n\n"
                elif name == "delete_email":
                    announcement = f"\n*[Deleting email ID: {args.get('email_id', '')}...]*\n\n"
                elif name == "delete_emails_bulk":
                    announcement = f"\n*[Deleting emails in bulk matching: \"{args.get('query', '')}\"...]*\n\n"
                elif name == "mark_email_read":
                    announcement = f"\n*[Marking email ID: {args.get('email_id', '')} as read...]*\n\n"
                elif name == "mark_email_unread":
                    announcement = f"\n*[Marking email ID: {args.get('email_id', '')} as unread...]*\n\n"
                elif name == "archive_email":
                    announcement = f"\n*[Archiving email ID: {args.get('email_id', '')}...]*\n\n"
                elif name == "get_email_stats":
                    announcement = f"\n*[Fetching email inbox statistics...]*\n\n"
                elif name == "github_get_profile":
                    announcement = f"\n*[Retrieving GitHub profile for: {args.get('username', '')}...]*\n\n"
                elif name == "github_list_my_repos":
                    announcement = f"\n*[Fetching your list of GitHub repositories...]*\n\n"
                elif name == "github_create_repo":
                    announcement = f"\n*[Creating new GitHub repository: {args.get('name', '')}...]*\n\n"
                elif name == "github_actions_list":
                    announcement = f"\n*[Listing GitHub Action runs for repository: {args.get('repo', '')}...]*\n\n"
                elif name == "github_actions_get":
                    announcement = f"\n*[Fetching details for GitHub Action run ID: {args.get('run_id', '')}...]*\n\n"
                elif name == "github_get_job_logs":
                    announcement = f"\n*[Retrieving logs for GitHub Job ID: {args.get('job_id', '')}...]*\n\n"
                elif name == "get_current_datetime":
                    announcement = f"\n*[Checking system clock for current date and time...]*\n\n"
                elif name == "workspace_list_files":
                    announcement = f"\n*[Listing active workspace files...]*\n\n"
                elif name == "workspace_read_file":
                    announcement = f"\n*[Reading workspace file: {args.get('file_path', '')}...]*\n\n"
                elif name == "workspace_write_file":
                    announcement = f"\n*[Writing workspace file: {args.get('file_path', '')}...]*\n\n"
                elif name == "workspace_edit_file":
                    announcement = f"\n*[Editing workspace file: {args.get('file_path', '')}...]*\n\n"
                elif name == "workspace_delete_file":
                    announcement = f"\n*[Deleting workspace file: {args.get('file_path', '')}...]*\n\n"
                elif name == "workspace_syntax_check":
                    announcement = f"\n*[Checking syntax for: {args.get('file_path', '')}...]*\n\n"
                elif name == "run_matplotlib_script":
                    announcement = f"\n*[Generating professional chart using Matplotlib...]*\n\n"
                else:
                    announcement = f"\n*[Executing tool: {name}...]*\n\n"

                if announcement:
                    # Automatically extract and stream hud_log for thinking bubble
                    hud_msg = announcement.strip().replace("*[", "").replace("]*", "")
                    yield json.dumps({"type": "hud_log", "content": hud_msg})

                try:
                    # --- Web Research ---
                    if name == "web_search":
                        q = args.get("query", "")
                        yield json.dumps({"type": "hud_log", "content": f"Searching the web for: {q}"})
                        search_res = await web_search(q)
                        tool_output = json.dumps(search_res)
                    elif name == "web_fetch":
                        u = args.get("url", "")
                        yield json.dumps({"type": "hud_log", "content": f"Fetching URL content: {u}"})
                        fetch_res = await web_fetch(u)
                        tool_output = json.dumps(fetch_res)
                    elif name == "web_search_parallel":
                        queries = args.get("queries", [])
                        yield json.dumps({"type": "hud_log", "content": f"Searching multiple queries in parallel..."})
                        search_res = await web_search_parallel(queries)
                        tool_output = json.dumps(search_res)
                    elif name == "web_fetch_parallel":
                        urls = args.get("urls", [])
                        yield json.dumps({"type": "hud_log", "content": f"Fetching multiple URLs in parallel..."})
                        fetch_res = await web_fetch_parallel(urls)
                        tool_output = json.dumps(fetch_res)
                    elif name == "web_search_deep":
                        q = args.get("query", "")
                        yield json.dumps({"type": "hud_log", "content": f"Performing deep web search for: {q}"})
                        deep_res = await web_search_deep(q)
                        tool_output = json.dumps(deep_res)
                    elif name == "browse_and_extract_tool":
                        u = args.get("url", "")
                        q = args.get("query", "")
                        if u:
                            yield json.dumps({"type": "hud_log", "content": f"Fetching URL: {u}"})
                            fetch_res = await web_fetch(u)
                            tool_output = fetch_res.get("content", fetch_res.get("error", "No text content."))
                        else:
                            yield json.dumps({"type": "hud_log", "content": f"Searching: {q}"})
                            search_res = await web_search(q)
                            tool_output = json.dumps(search_res)

                    elif name == "compact_chat_history":
                        yield json.dumps({"type": "hud_log", "content": "Compacting chat history..."})
                        yield json.dumps({"type": "token", "content": "\n|-------- COMPACTION PROCESSING --------|\n"})
                        from compaction import compact_session_history
                        summary = await compact_session_history(
                            session_id=session_id,
                            user_id=user_id,
                            model_key=model_key,
                            manager_ref=manager_ref,
                            client_websocket=client_websocket
                        )
                        # Fetch updated context sync percent
                        from database import get_session_messages
                        from main import calculate_context_percent
                        messages_history = get_session_messages(session_id)
                        new_percent = calculate_context_percent(messages_history)
                        yield json.dumps({"type": "context_sync", "percent": new_percent})
                        
                        confirm_msg = "\n[Chat history has been successfully compacted, Sir.]\n|-------- COMPACTION ENDED ---------|\n"
                        yield json.dumps({"type": "token", "content": confirm_msg})
                        tool_output = f"Chat history successfully compacted. Compaction Summary: {summary}"

                    elif name == "run_matplotlib_script":
                        c = args.get("code", "")
                        t = args.get("title", "chart")
                        yield json.dumps({"type": "hud_log", "content": f"Running Matplotlib script..."})
                        tool_output = run_matplotlib_script(c, t)

                    # --- Memory & RAG ---
                    elif name == "query_rag":
                        q = args.get("query", "")
                        yield json.dumps({"type": "hud_log", "content": f"Retrieving RAG document matches..."})
                        if document_id:
                            docs = query_scoped_rag_vector(q, user_id, document_id, threshold=-1.0)
                        else:
                            docs = query_rag_vector(q, user_id, threshold=0.15)
                        tool_output = json.dumps(docs)
                    elif name == "list_indexed_documents":
                        yield json.dumps({"type": "hud_log", "content": f"Listing all permanently indexed documents..."})
                        docs = list_rag_documents(user_id)
                        tool_output = json.dumps(docs)
                    elif name == "delete_indexed_document":
                        doc_id_to_del = args.get("document_id")
                        filename_to_del = args.get("filename")
                        yield json.dumps({"type": "hud_log", "content": f"Deleting matching RAG chunks..."})
                        res = delete_rag_document(user_id, document_id=doc_id_to_del, filename=filename_to_del)
                        tool_output = json.dumps(res)
                    elif name == "remember_user":
                        c = args.get("category", "notes")
                        k = args.get("key", "")
                        v = args.get("value", "")
                        tool_output = remember_user(user_id, c, k, v)
                    elif name == "recall_user":
                        q = args.get("query", "")
                        tool_output = recall_user(user_id, q)
                    elif name == "forget_user":
                        c = args.get("category", "")
                        k = args.get("key", "")
                        tool_output = forget_user(user_id, c, k)
                    elif name == "log_problem":
                        prob = args.get("problem", "")
                        ctx = args.get("context", "")
                        att = args.get("attempted", "")
                        tool_output = f"Logged unsolved problem ID: {log_problem(user_id, prob, ctx, att)}"
                    elif name == "log_solution":
                        pid = args.get("problem_id", "")
                        sol = args.get("solution", "")
                        ww = args.get("what_worked", "")
                        prev = args.get("prevention", "")
                        tool_output = log_solution(user_id, pid, sol, ww, prev)
                    elif name == "search_memory":
                        q = args.get("query", "")
                        tool_output = search_memory(user_id, q)
                    elif name == "save_frontend_snippet":
                        t = args.get("title", "")
                        c = args.get("code", "")
                        d = args.get("description", "")
                        tg = args.get("tags", "")
                        tool_output = save_frontend_snippet(user_id, t, c, d, tg)
                    elif name == "search_frontend_snippets":
                        q = args.get("query", "")
                        tool_output = search_frontend_snippets(user_id, q)

                    # --- Document Generation ---
                    elif name == "create_file":
                        f = args.get("filename", "")
                        d = args.get("directory", "")
                        c = args.get("content", "")
                        ft = args.get("file_type", "auto")
                        yield json.dumps({"type": "hud_log", "content": f"Rendering file: {f}"})
                        tool_output = server_create_file(f, d, c, ft)
                    elif name == "convert_file":
                        fp = args.get("file_path", "")
                        tf = args.get("target_format", "")
                        od = args.get("output_directory", "")
                        yield json.dumps({"type": "hud_log", "content": f"Converting: {os.path.basename(fp)}"})
                        tool_output = server_convert_file(fp, tf, od)

                    # --- Email (Gmail) ---
                    elif name == "check_email":
                        q = args.get("query", "")
                        l = args.get("label", "INBOX")
                        mr = args.get("max_results", 5)
                        yield json.dumps({"type": "hud_log", "content": f"Checking emails..."})
                        tool_output = check_email(q, l, mr)
                    elif name == "read_email":
                        eid = args.get("email_id", "")
                        yield json.dumps({"type": "hud_log", "content": f"Reading email content..."})
                        tool_output = read_email(eid)
                    elif name == "send_email":
                        to = args.get("to", "")
                        sub = args.get("subject", "")
                        body = args.get("body", "")
                        cc = args.get("cc", "")
                        bcc = args.get("bcc", "")
                        yield json.dumps({"type": "hud_log", "content": f"Sending email..."})
                        tool_output = send_email(to, sub, body, cc, bcc)
                    elif name == "save_draft":
                        to = args.get("to", "")
                        sub = args.get("subject", "")
                        body = args.get("body", "")
                        cc = args.get("cc", "")
                        yield json.dumps({"type": "hud_log", "content": f"Saving draft..."})
                        tool_output = save_draft(to, sub, body, cc)
                    elif name == "reply_to_email":
                        eid = args.get("email_id", "")
                        body = args.get("body", "")
                        yield json.dumps({"type": "hud_log", "content": f"Replying to thread..."})
                        tool_output = reply_to_email(eid, body)
                    elif name == "delete_email":
                        eid = args.get("email_id", "")
                        tool_output = delete_email(eid)
                    elif name == "delete_emails_bulk":
                        q = args.get("query", "")
                        md = args.get("max_delete", 20)
                        tool_output = delete_emails_bulk(q, md)
                    elif name == "mark_email_read":
                        eid = args.get("email_id", "")
                        tool_output = mark_email_read(eid)
                    elif name == "mark_email_unread":
                        eid = args.get("email_id", "")
                        tool_output = mark_email_unread(eid)
                    elif name == "archive_email":
                        eid = args.get("email_id", "")
                        tool_output = archive_email(eid)
                    elif name == "get_email_stats":
                        tool_output = get_email_stats()

                    # --- GitHub API ---
                    elif name == "github_get_profile":
                        username = args.get("username")
                        tool_output = github_get_profile(username)
                    elif name == "github_list_my_repos":
                        limit = args.get("limit", 10)
                        sort = args.get("sort", "updated")
                        tool_output = github_list_my_repos(limit, sort)
                    elif name == "github_create_repo":
                        n = args.get("name", "")
                        desc = args.get("description", "")
                        p = args.get("private", True)
                        tool_output = github_create_repo(n, desc, p)
                    elif name == "github_actions_list":
                        repo = args.get("repo", "")
                        limit = args.get("limit", 10)
                        tool_output = github_actions_list(repo, limit)
                    elif name == "github_actions_get":
                        repo = args.get("repo", "")
                        run_id = args.get("run_id", "")
                        tool_output = github_actions_get(repo, run_id)
                    elif name == "github_get_job_logs":
                        repo = args.get("repo", "")
                        job_id = args.get("job_id", "")
                        tool_output = github_get_job_logs(repo, job_id)

                    # --- Spotify (Remote Control) ---
                    elif name in ("search_spotify", "play_spotify_selection", "play_user_playlist", "media_control"):
                        yield json.dumps({"type": "hud_log", "content": f"Sending remote playback command..."})
                        action_map = {
                            "search_spotify": "search",
                            "play_spotify_selection": "play_selection",
                            "play_user_playlist": "play_playlist",
                            "media_control": "control"
                        }
                        tool_output = await run_laptop_spotify_command(manager_ref, user_id, action_map[name], args)

                    # --- Laptop PowerShell Execution ---
                    elif name == "laptop_command":
                        cmd = args.get("command", "")
                        yield json.dumps({"type": "hud_log", "content": f"Executing command on laptop: {cmd}"})
                        
                        if manager_ref and user_id in manager_ref.active_laptops:
                            ws_laptop = manager_ref.active_laptops[user_id]
                            
                            loop = asyncio.get_running_loop()
                            future = loop.create_future()
                            LAPTOP_CHANNELS[user_id] = future
                            
                            await ws_laptop.send_text(json.dumps({"action": "execute", "command": cmd}))
                            
                            try:
                                result_payload = await asyncio.wait_for(future, timeout=120.0)
                                tool_output = result_payload.get("output", "Command executed successfully.")
                            except asyncio.TimeoutError:
                                tool_output = "Error: Laptop execution timed out (120s limit)."
                            finally:
                                if user_id in LAPTOP_CHANNELS:
                                    del LAPTOP_CHANNELS[user_id]
                        else:
                            tool_output = (
                                "Error: No laptop is currently connected to this account. "
                                "Please launch the VoxKage Laptop Daemon to run local actions, sir."
                            )
                    elif name.startswith("mobile_"):
                        yield json.dumps({"type": "hud_log", "content": f"Requesting device action: {name}"})
                        
                        import uuid
                        req_id = str(uuid.uuid4())
                        
                        loop = asyncio.get_running_loop()
                        future = loop.create_future()
                        MOBILE_CHANNELS[req_id] = future
                        
                        if client_websocket:
                            await client_websocket.send_text(json.dumps({
                                "type": "mobile_tool_call",
                                "request_id": req_id,
                                "tool_name": name,
                                "arguments": args
                            }))
                            
                            try:
                                result_payload = await asyncio.wait_for(future, timeout=60.0)
                                status_res = result_payload.get("status")
                                result_val = result_payload.get("result")
                                
                                if status_res == "success":
                                    tool_output = json.dumps(result_val)
                                else:
                                    tool_output = f"Error executing device tool, Sir: {result_val}"
                            except asyncio.TimeoutError:
                                tool_output = "Error: Mobile device tool execution timed out (60s limit)."
                            finally:
                                if req_id in MOBILE_CHANNELS:
                                    del MOBILE_CHANNELS[req_id]
                        else:
                            tool_output = "Error: Active WebSocket is not available to route device command."
                    elif name == "get_current_datetime":
                        if client_time:
                            tool_output = json.dumps({
                                "local_time_details": client_time,
                                "timezone": "Client Local Time"
                            })
                        else:
                            tool_output = json.dumps({
                                "current_time": datetime.now().strftime("%I:%M:%S %p"),
                                "current_date": datetime.now().strftime("%A, %B %d, %Y"),
                                "timezone": "Server UTC Time",
                                "timestamp": datetime.now().isoformat()
                            })
                    elif name == "workspace_list_files":
                        project_id = ensure_active_project(user_id, session_id, active_project_box)
                        yield json.dumps({"type": "hud_log", "content": "Listing active workspace files..."})
                        base_dir = os.path.join("projects", str(project_id))
                        files_list = []
                        if os.path.exists(base_dir):
                            for root, _, files in os.walk(base_dir):
                                for f in files:
                                    full_path = os.path.join(root, f)
                                    rel_path = os.path.relpath(full_path, base_dir).replace("\\", "/")
                                    files_list.append(rel_path)
                        tool_output = json.dumps({"files": sorted(files_list)})

                    elif name == "workspace_read_file":
                        file_path = args.get("file_path", "")
                        if not file_path:
                            tool_output = "Error: file_path argument is required."
                        else:
                            project_id = ensure_active_project(user_id, session_id, active_project_box)
                            yield json.dumps({"type": "hud_log", "content": f"Reading workspace file: {file_path}"})
                            base_dir = os.path.join("projects", str(project_id))
                            try:
                                safe_path = get_safe_workspace_path(base_dir, file_path)
                                if os.path.exists(safe_path):
                                    with open(safe_path, "r", encoding="utf-8") as f:
                                        content = f.read()
                                    tool_output = content
                                else:
                                    tool_output = f"Error: File '{file_path}' does not exist in workspace."
                            except Exception as e:
                                tool_output = f"Error: {str(e)}"

                    elif name == "workspace_write_file":
                        file_path = args.get("file_path", "")
                        content = args.get("content", "")
                        if not file_path:
                            tool_output = "Error: file_path argument is required."
                        else:
                            project_id = ensure_active_project(user_id, session_id, active_project_box)
                            yield json.dumps({"type": "hud_log", "content": f"Writing workspace file: {file_path}"})
                            base_dir = os.path.join("projects", str(project_id))
                            try:
                                safe_path = get_safe_workspace_path(base_dir, file_path)
                                os.makedirs(os.path.dirname(safe_path), exist_ok=True)
                                with open(safe_path, "w", encoding="utf-8") as f:
                                    f.write(content)
                                tool_output = f"Success: Wrote '{file_path}' ({len(content)} characters)."
                            except Exception as e:
                                tool_output = f"Error: {str(e)}"

                    elif name == "workspace_edit_file":
                        file_path = args.get("file_path", "")
                        search_content = args.get("search_content", "")
                        replace_content = args.get("replace_content", "")
                        if not file_path:
                            tool_output = "Error: file_path argument is required."
                        else:
                            project_id = ensure_active_project(user_id, session_id, active_project_box)
                            yield json.dumps({"type": "hud_log", "content": f"Editing workspace file: {file_path}"})
                            base_dir = os.path.join("projects", str(project_id))
                            try:
                                safe_path = get_safe_workspace_path(base_dir, file_path)
                                if os.path.exists(safe_path):
                                    with open(safe_path, "r", encoding="utf-8") as f:
                                        existing_content = f.read()
                                    if search_content not in existing_content:
                                        tool_output = f"Error: The target search content was not found in '{file_path}'."
                                    else:
                                        new_content = existing_content.replace(search_content, replace_content)
                                        with open(safe_path, "w", encoding="utf-8") as f:
                                            f.write(new_content)
                                        tool_output = f"Success: Replaced occurrences in '{file_path}'."
                                else:
                                    tool_output = f"Error: File '{file_path}' does not exist in workspace."
                            except Exception as e:
                                tool_output = f"Error: {str(e)}"

                    elif name == "workspace_delete_file":
                        file_path = args.get("file_path", "")
                        if not file_path:
                            tool_output = "Error: file_path argument is required."
                        else:
                            project_id = ensure_active_project(user_id, session_id, active_project_box)
                            yield json.dumps({"type": "hud_log", "content": f"Deleting workspace file: {file_path}"})
                            base_dir = os.path.join("projects", str(project_id))
                            try:
                                safe_path = get_safe_workspace_path(base_dir, file_path)
                                if os.path.exists(safe_path):
                                    os.remove(safe_path)
                                    tool_output = f"Success: Deleted '{file_path}'."
                                else:
                                    tool_output = f"Error: File '{file_path}' does not exist in workspace."
                            except Exception as e:
                                tool_output = f"Error: {str(e)}"

                    elif name == "workspace_syntax_check":
                        file_path = args.get("file_path", "")
                        if not file_path:
                            tool_output = "Error: file_path argument is required."
                        else:
                            project_id = ensure_active_project(user_id, session_id, active_project_box)
                            yield json.dumps({"type": "hud_log", "content": f"Checking syntax of: {file_path}"})
                            base_dir = os.path.join("projects", str(project_id))
                            try:
                                safe_path = get_safe_workspace_path(base_dir, file_path)
                                if not os.path.exists(safe_path):
                                    tool_output = f"Error: File '{file_path}' does not exist."
                                else:
                                    with open(safe_path, "r", encoding="utf-8") as f:
                                        content = f.read()
                                    
                                    errors = []
                                    if file_path.endswith(".html"):
                                        from html.parser import HTMLParser
                                        class SimpleHTMLValidator(HTMLParser):
                                            def __init__(self):
                                                super().__init__()
                                                self.tags = []
                                                self.errors = []
                                            def handle_starttag(self, tag, attrs):
                                                self_closing = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'embed', 'param', 'col', 'area', 'track'}
                                                if tag not in self_closing:
                                                    self.tags.append((tag, self.getpos()))
                                            def handle_endtag(self, tag):
                                                self_closing = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'embed', 'param', 'col', 'area', 'track'}
                                                if tag in self_closing:
                                                    return
                                                if not self.tags:
                                                    self.errors.append(f"Unexpected end tag </{tag}> on line {self.getpos()[0]}, col {self.getpos()[1]}")
                                                else:
                                                    start_tag, pos = self.tags.pop()
                                                    if start_tag != tag:
                                                        self.errors.append(f"Mismatched tag: expected </{start_tag}> (opened line {pos[0]}), found </{tag}> on line {self.getpos()[0]}")
                                        
                                        parser = SimpleHTMLValidator()
                                        try:
                                            parser.feed(content)
                                            if parser.tags:
                                                for tag, pos in parser.tags:
                                                    parser.errors.append(f"Unclosed tag <{tag}> opened on line {pos[0]}, col {pos[1]}")
                                            errors = parser.errors
                                        except Exception as he:
                                            errors.append(f"HTML Parser error: {str(he)}")
                                    
                                    elif file_path.endswith(".js"):
                                        stack = []
                                        mapping = {')': '(', '}': '{', ']': '['}
                                        lines = content.splitlines()
                                        for line_idx, line in enumerate(lines, 1):
                                            clean_line = ""
                                            in_string = False
                                            string_char = None
                                            skip_next = False
                                            for idx, char in enumerate(line):
                                                if skip_next:
                                                    skip_next = False
                                                    continue
                                                if char == '\\' and in_string:
                                                    skip_next = True
                                                    continue
                                                if char in ('"', "'", '`'):
                                                    if not in_string:
                                                        in_string = True
                                                        string_char = char
                                                    elif string_char == char:
                                                        in_string = False
                                                elif not in_string:
                                                    if char == '/' and idx < len(line) - 1 and line[idx+1] == '/':
                                                        break
                                                    clean_line += char
                                            
                                            for char in clean_line:
                                                if char in mapping.values():
                                                    stack.append((char, line_idx))
                                                elif char in mapping.keys():
                                                    if not stack:
                                                        errors.append(f"Mismatched closure: unexpected '{char}' on line {line_idx}")
                                                        break
                                                    else:
                                                        top, start_line = stack.pop()
                                                        if top != mapping[char]:
                                                            errors.append(f"Mismatched brackets: '{char}' on line {line_idx} does not match '{top}' from line {start_line}")
                                                            break
                                        if stack:
                                            for char, line_idx in stack:
                                                errors.append(f"Unclosed opening bracket '{char}' on line {line_idx}")

                                    if errors:
                                        tool_output = json.dumps({"status": "error", "errors": errors})
                                    else:
                                        tool_output = json.dumps({"status": "success", "message": f"Syntax check passed for '{file_path}'."})
                            except Exception as e:
                                tool_output = f"Error performing syntax check: {str(e)}"
                    else:
                        tool_output = f"Error: Tool '{name}' is not supported."
                except Exception as e:
                    tool_output = f"Error executing tool {name}: {str(e)}"

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_output
                })

        except Exception as e:
            yield json.dumps({"type": "error", "content": f"Agent loop failed: {str(e)}"})
            return
