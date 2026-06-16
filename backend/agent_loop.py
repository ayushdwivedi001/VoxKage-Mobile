import os
import json
import asyncio
from typing import AsyncGenerator
from database import log_message
from opencode_client import OPENCODE_BASE_URL, get_opencode_model
import requests

# Import backend engines
from websearch_engine import web_search, web_fetch, web_search_deep, web_search_parallel, web_fetch_parallel
from rag_engine import query_rag_vector
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
    }
]

# Shared laptop responses channel: { email: asyncio.Future }
LAPTOP_CHANNELS = {}

async def run_agentic_loop(
    prompt: str,
    user_id: str,
    session_id: str,
    model_key: str = "deepseek-flash",
    history: list = None,
    manager_ref = None
) -> AsyncGenerator[str, None]:
    """
    Unified agent loop intercepting and executing tool calls locally in the backend,
    streaming output tokens to the mobile UI in real-time.
    """
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
    
    # System instructions
    messages = [
        {
            "role": "system",
            "content": (
                "You are VoxKage, an advanced OS-level agentic AI assistant. "
                "Address the user as 'sir'. Be concise, witty, loyal, and deadpan. "
                "The current year is 2026. Prioritize current 2026 data and context.\n\n"
                f"--- USER PROFILE CONTEXT ---\n{soul_context}\n"
                "If the user asks you to perform an action on their laptop (like running git, "
                "opening files or apps, volume changes), use the 'laptop_command' tool.\n"
                "Do not mention tool names or JSON formats to the user."
            )
        }
    ]

    if history:
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": prompt})

    max_iterations = 6
    for iteration in range(max_iterations):
        payload = {
            "model": model_id,
            "messages": messages,
            "tools": TOOLS_SCHEMA,
            "tool_choice": "auto",
            "temperature": 0.7,
            "stream": True
        }

        try:
            response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
            if response.status_code != 200:
                yield json.dumps({"type": "error", "content": f"Upstream error: {response.text}"})
                return

            current_tool_calls = []
            assistant_text = ""

            for line in response.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    if decoded.startswith("data: "):
                        data_str = decoded[6:].strip()
                        if data_str == "[DONE]":
                            break
                        
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0]["delta"]
                            
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
                                assistant_text += content_delta
                                yield json.dumps({"type": "token", "content": content_delta})
                        except:
                            pass

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

                    # --- Memory & RAG ---
                    elif name == "query_rag":
                        q = args.get("query", "")
                        yield json.dumps({"type": "hud_log", "content": f"Retrieving RAG document matches..."})
                        docs = query_rag_vector(q, user_id)
                        tool_output = json.dumps(docs)
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
                                result_payload = await asyncio.wait_for(future, timeout=60.0)
                                tool_output = result_payload.get("output", "Command executed successfully.")
                            except asyncio.TimeoutError:
                                tool_output = "Error: Laptop execution timed out (60s limit)."
                            finally:
                                if user_id in LAPTOP_CHANNELS:
                                    del LAPTOP_CHANNELS[user_id]
                        else:
                            tool_output = (
                                "Error: No laptop is currently connected to this account. "
                                "Please launch the VoxKage Laptop Daemon to run local actions, sir."
                            )
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
