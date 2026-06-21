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

# Import decomposed modules
from tool_schemas import TOOLS_SCHEMA
from workspace_helpers import (
    save_frontend_snippet, search_frontend_snippets,
    get_safe_workspace_path, sync_workspace_to_local,
    get_workspace_files_dict, cleanup_local_workspace,
    ensure_active_project
)
from hud_parser import HudStreamParser
from tool_executor import get_tool_label, run_matplotlib_script
from system_prompt import BASE_SYSTEM_PROMPT

# Shared laptop responses channel: { email: asyncio.Future }
LAPTOP_CHANNELS = {}
# Shared mobile responses channel: { request_id: asyncio.Future }
MOBILE_CHANNELS = {}
# Shared confirmation responses channel: { request_id: asyncio.Future }
CONFIRMATION_CHANNELS = {}


def analyze_dependencies(tool_calls: list) -> dict:
    dependencies = {tc["id"]: set() for tc in tool_calls}
    for j in range(len(tool_calls)):
        tc_b = tool_calls[j]
        name_b = tc_b["function"]["name"]
        try:
            args_b = json.loads(tc_b["function"]["arguments"] or "{}")
        except:
            args_b = {}
        for i in range(j):
            tc_a = tool_calls[i]
            name_a = tc_a["function"]["name"]
            try:
                args_a = json.loads(tc_a["function"]["arguments"] or "{}")
            except:
                args_a = {}
            if name_b == "workspace_syntax_check" and name_a in ("workspace_write_file", "workspace_edit_file"):
                if args_b.get("file_path") == args_a.get("file_path") and args_b.get("file_path"):
                    dependencies[tc_b["id"]].add(tc_a["id"])
            if name_b == "read_email" and name_a == "check_email":
                dependencies[tc_b["id"]].add(tc_a["id"])
            if name_b == "play_spotify_selection" and name_a == "search_spotify":
                dependencies[tc_b["id"]].add(tc_a["id"])
            if name_b in ("workspace_write_file", "workspace_edit_file") and name_a == "workspace_read_file":
                if args_b.get("file_path") == args_a.get("file_path") and args_b.get("file_path"):
                    dependencies[tc_b["id"]].add(tc_a["id"])
    return dependencies




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
    consulted_sources = []
    web_search_called = False
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
    system_prompt = BASE_SYSTEM_PROMPT

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

            async def execute_tool_call(tc):
                nonlocal web_search_called
                try:
                    name = tc["function"]["name"]
                    args_str = tc["function"]["arguments"]
                    try:
                        args = json.loads(args_str or "{}")
                    except:
                        args = {}

                    if name in {"web_search", "web_fetch", "web_search_parallel", "web_fetch_parallel", "web_search_deep", "browse_and_extract_tool"}:
                        web_search_called = True
                        import urllib.parse
                        if name == "web_search" or name == "web_search_deep":
                            q = args.get("query", "")
                            if q:
                                consulted_sources.append({
                                    "title": f"DuckDuckGo Search: {q}",
                                    "url": f"https://duckduckgo.com/?q={urllib.parse.quote(q)}"
                                })
                        elif name == "web_fetch":
                            u = args.get("url", "")
                            if u:
                                consulted_sources.append({"title": u, "url": u})
                        elif name == "web_search_parallel":
                            for q in args.get("queries", []):
                                if q:
                                    consulted_sources.append({
                                        "title": f"DuckDuckGo Search: {q}",
                                        "url": f"https://duckduckgo.com/?q={urllib.parse.quote(q)}"
                                    })
                        elif name == "web_fetch_parallel":
                            for u in args.get("urls", []):
                                if u:
                                    consulted_sources.append({"title": u, "url": u})
                        elif name == "browse_and_extract_tool":
                            u = args.get("url", "")
                            q = args.get("query", "")
                            if u:
                                consulted_sources.append({"title": u, "url": u})
                            elif q:
                                consulted_sources.append({
                                    "title": f"DuckDuckGo Search: {q}",
                                    "url": f"https://duckduckgo.com/?q={urllib.parse.quote(q)}"
                                })

                    tc_id = tc["id"]
                    tool_label = get_tool_label(name, args)

                    # Interactive confirmation with Always Allow support
                    CONFIRMATION_REQUIRED_TOOLS = {"mobile_send_sms", "mobile_create_calendar_event", "mobile_create_contact"}
                    if name in CONFIRMATION_REQUIRED_TOOLS:
                        from memory_engine import check_trusted, set_trusted_action
                        trust_status = check_trusted(user_id, name)
                        if "trusted" not in trust_status:
                            import uuid
                            confirm_req_id = str(uuid.uuid4())
                            loop = asyncio.get_running_loop()
                            confirm_future = loop.create_future()
                            CONFIRMATION_CHANNELS[confirm_req_id] = confirm_future
                        
                            label_map = {
                                "mobile_send_sms": "Send SMS",
                                "mobile_create_calendar_event": "Create Calendar Event",
                                "mobile_create_contact": "Create Contact"
                            }
                            if client_websocket:
                                await client_websocket.send_text(json.dumps({
                                    "type": "tool_confirm_request",
                                    "request_id": confirm_req_id,
                                    "tool_name": name,
                                    "label": label_map.get(name, name)
                                }))
                                await client_websocket.send_text(json.dumps({
                                    "type": "agent_thought",
                                    "content": f"Waiting for user confirmation to execute: {name}..."
                                }))
                                try:
                                    confirm_payload = await asyncio.wait_for(confirm_future, timeout=120.0)
                                    confirm_choice = confirm_payload.get("confirm", False)
                                    always_allow = confirm_payload.get("always_allow", False)
                                
                                    if not confirm_choice:
                                        if confirm_req_id in CONFIRMATION_CHANNELS:
                                            del CONFIRMATION_CHANNELS[confirm_req_id]
                                        raise Exception("Action rejected by user, Sir.")
                                
                                    if always_allow:
                                        set_trusted_action(user_id, name, True, "User clicked Always Allow in chat screen")
                                        await client_websocket.send_text(json.dumps({
                                            "type": "agent_thought",
                                            "content": f"Tool '{name}' marked as always allowed."
                                        }))
                                except asyncio.TimeoutError:
                                    if confirm_req_id in CONFIRMATION_CHANNELS:
                                        del CONFIRMATION_CHANNELS[confirm_req_id]
                                    raise Exception("Action confirmation timed out (120s limit).")
                                finally:
                                    if confirm_req_id in CONFIRMATION_CHANNELS:
                                        del CONFIRMATION_CHANNELS[confirm_req_id]
                            else:
                                raise Exception("No active connection to prompt confirmation, Sir.")


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
                        if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": hud_msg}))

                    try:
                        # --- Web Research ---
                        if name == "web_search":
                            q = args.get("query", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Searching the web for: {q}"}))
                            search_res = await web_search(q)
                            tool_output = json.dumps(search_res)
                            if isinstance(search_res, list):
                                for r in search_res:
                                    if isinstance(r, dict) and r.get("url") and "error" not in r:
                                        consulted_sources.append({"title": r.get("title") or r.get("url"), "url": r.get("url")})
                        elif name == "web_fetch":
                            u = args.get("url", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Fetching URL content: {u}"}))
                            fetch_res = await web_fetch(u)
                            tool_output = json.dumps(fetch_res)
                            if isinstance(fetch_res, dict) and fetch_res.get("url") and "error" not in fetch_res:
                                consulted_sources.append({"title": fetch_res.get("url"), "url": fetch_res.get("url")})
                        elif name == "web_search_parallel":
                            queries = args.get("queries", [])
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Searching multiple queries in parallel..."}))
                            search_res = await web_search_parallel(queries)
                            tool_output = json.dumps(search_res)
                            if isinstance(search_res, list):
                                for sub_list in search_res:
                                    if isinstance(sub_list, list):
                                        for r in sub_list:
                                            if isinstance(r, dict) and r.get("url") and "error" not in r:
                                                consulted_sources.append({"title": r.get("title") or r.get("url"), "url": r.get("url")})
                        elif name == "web_fetch_parallel":
                            urls = args.get("urls", [])
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Fetching multiple URLs in parallel..."}))
                            fetch_res = await web_fetch_parallel(urls)
                            tool_output = json.dumps(fetch_res)
                            if isinstance(fetch_res, list):
                                for r in fetch_res:
                                    if isinstance(r, dict) and r.get("url") and "error" not in r:
                                        consulted_sources.append({"title": r.get("url"), "url": r.get("url")})
                        elif name == "web_search_deep":
                            q = args.get("query", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Performing deep web search for: {q}"}))
                            deep_res = await web_search_deep(q)
                            tool_output = json.dumps(deep_res)
                            if isinstance(deep_res, list):
                                for r in deep_res:
                                    if isinstance(r, dict) and r.get("url") and "error" not in r:
                                        consulted_sources.append({"title": r.get("title") or r.get("url"), "url": r.get("url")})
                        elif name == "browse_and_extract_tool":
                            u = args.get("url", "")
                            q = args.get("query", "")
                            if u:
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Fetching URL: {u}"}))
                                fetch_res = await web_fetch(u)
                                tool_output = fetch_res.get("content", fetch_res.get("error", "No text content."))
                                if isinstance(fetch_res, dict) and fetch_res.get("url") and "error" not in fetch_res:
                                    consulted_sources.append({"title": fetch_res.get("url"), "url": fetch_res.get("url")})
                            else:
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Searching: {q}"}))
                                search_res = await web_search(q)
                                tool_output = json.dumps(search_res)
                                if isinstance(search_res, list):
                                    for r in search_res:
                                        if isinstance(r, dict) and r.get("url") and "error" not in r:
                                            consulted_sources.append({"title": r.get("title") or r.get("url"), "url": r.get("url")})

                        elif name == "compact_chat_history":
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": "Compacting chat history..."}))
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "token", "content": "\n|-------- COMPACTION PROCESSING --------|\n"}))
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
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "context_sync", "percent": new_percent}))
                        
                            confirm_msg = "\n[Chat history has been successfully compacted, Sir.]\n|-------- COMPACTION ENDED ---------|\n"
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "token", "content": confirm_msg}))
                            tool_output = f"Chat history successfully compacted. Compaction Summary: {summary}"

                        elif name == "run_matplotlib_script":
                            c = args.get("code", "")
                            t = args.get("title", "chart")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Running Matplotlib script..."}))
                            tool_output = run_matplotlib_script(c, t)

                        # --- Memory & RAG ---
                        elif name == "query_rag":
                            q = args.get("query", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Retrieving RAG document matches..."}))
                            if document_id:
                                docs = query_scoped_rag_vector(q, user_id, document_id, threshold=-1.0)
                            else:
                                docs = query_rag_vector(q, user_id, threshold=0.15)
                            tool_output = json.dumps(docs)
                        elif name == "list_indexed_documents":
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Listing all permanently indexed documents..."}))
                            docs = list_rag_documents(user_id)
                            tool_output = json.dumps(docs)
                        elif name == "delete_indexed_document":
                            doc_id_to_del = args.get("document_id")
                            filename_to_del = args.get("filename")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Deleting matching RAG chunks..."}))
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
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Rendering file: {f}"}))
                            tool_output = server_create_file(f, d, c, ft)
                        elif name == "convert_file":
                            fp = args.get("file_path", "")
                            tf = args.get("target_format", "")
                            od = args.get("output_directory", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Converting: {os.path.basename(fp)}"}))
                            tool_output = server_convert_file(fp, tf, od)

                        # --- Email (Gmail) ---
                        elif name == "check_email":
                            q = args.get("query", "")
                            l = args.get("label", "INBOX")
                            mr = args.get("max_results", 5)
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Checking emails..."}))
                            tool_output = check_email(q, l, mr)
                        elif name == "read_email":
                            eid = args.get("email_id", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Reading email content..."}))
                            tool_output = read_email(eid)
                        elif name == "send_email":
                            to = args.get("to", "")
                            sub = args.get("subject", "")
                            body = args.get("body", "")
                            cc = args.get("cc", "")
                            bcc = args.get("bcc", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Sending email..."}))
                            tool_output = send_email(to, sub, body, cc, bcc)
                        elif name == "save_draft":
                            to = args.get("to", "")
                            sub = args.get("subject", "")
                            body = args.get("body", "")
                            cc = args.get("cc", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Saving draft..."}))
                            tool_output = save_draft(to, sub, body, cc)
                        elif name == "reply_to_email":
                            eid = args.get("email_id", "")
                            body = args.get("body", "")
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Replying to thread..."}))
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
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Sending remote playback command..."}))
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
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Executing command on laptop: {cmd}"}))
                        
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
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Requesting device action: {name}"}))
                        
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
                            if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": "Listing active workspace files..."}))
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
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Reading workspace file: {file_path}"}))
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
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Writing workspace file: {file_path}"}))
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
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Editing workspace file: {file_path}"}))
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
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Deleting workspace file: {file_path}"}))
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
                                if client_websocket: await client_websocket.send_text(json.dumps({"type": "hud_log", "content": f"Checking syntax of: {file_path}"}))
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


                    if client_websocket:
                        await client_websocket.send_text(json.dumps({
                            "type": "tool_success",
                            "node_id": tc_id
                        }))
                        short_res = str(tool_output)[:120] + '...' if len(str(tool_output)) > 120 else str(tool_output)
                        await client_websocket.send_text(json.dumps({
                            "type": "agent_thought",
                            "content": f"Completed {name} successfully. Result: {short_res}"
                        }))
                    return (tc_id, tool_output, True)
                except Exception as e:
                    if client_websocket:
                        await client_websocket.send_text(json.dumps({
                            "type": "tool_failed",
                            "node_id": tc_id
                        }))
                        await client_websocket.send_text(json.dumps({
                            "type": "agent_thought",
                            "content": f"Error in {name}: {str(e)}"
                        }))
                    return (tc_id, f'Error executing tool {name}: {str(e)}', False)

            # Build workflow plan for client
            nodes_plan = []
            for tc in current_tool_calls:
                tc_name = tc["function"]["name"]
                try:
                    tc_args = json.loads(tc["function"]["arguments"] or "{}")
                except:
                    tc_args = {}
                nodes_plan.append({
                    "id": tc["id"],
                    "label": get_tool_label(tc_name, tc_args),
                    "status": "pending"
                })

            if client_websocket:
                await client_websocket.send_text(json.dumps({
                    "type": "tool_plan",
                    "nodes": nodes_plan
                }))

            deps = analyze_dependencies(current_tool_calls)
            completed_ids = set()
            running_ids = set()
            failed_ids = set()
            tool_outputs = {}

            while len(completed_ids) + len(failed_ids) < len(current_tool_calls):
                ready_tcs = []
                for tc in current_tool_calls:
                    tc_id = tc["id"]
                    if tc_id not in completed_ids and tc_id not in failed_ids and tc_id not in running_ids:
                        if deps[tc_id].issubset(completed_ids):
                            ready_tcs.append(tc)

                if not ready_tcs:
                    break

                # Execute ready tools in parallel
                tasks = [execute_tool_call(tc) for tc in ready_tcs]
                for tc in ready_tcs:
                    running_ids.add(tc["id"])

                results = await asyncio.gather(*tasks)

                for tc_id, out, success in results:
                    running_ids.remove(tc_id)
                    tool_outputs[tc_id] = out
                    if success:
                        completed_ids.add(tc_id)
                    else:
                        failed_ids.add(tc_id)

            # Append results back in exact sequence
            for tc in current_tool_calls:
                tc_id = tc["id"]
                tool_output = tool_outputs.get(tc_id, "Error: Node execution skipped or dependency failed.")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": tool_output
                })
        except Exception as e:
            yield json.dumps({"type": "error", "content": f"Agent loop failed: {str(e)}"})
            return

    # Format and append consulted sources if any web search tool was called
    if web_search_called or consulted_sources:
        if not consulted_sources:
            consulted_sources.append({"title": "Google Search", "url": "https://www.google.com"})
        seen_urls = set()
        unique_sources = []
        for s in consulted_sources:
            if s["url"] not in seen_urls:
                seen_urls.add(s["url"])
                unique_sources.append(s)
        if unique_sources:
            sources_str = "||".join([f"{s['title'].replace('|', '-').replace('<', '').replace('>', '')}|{s['url']}" for s in unique_sources])
            sources_tag = f'\n\n<Sources data="{sources_str}" />'
            yield json.dumps({"type": "token", "content": sources_tag})
