import json
import asyncio
from database import get_db, log_message
from opencode_proxy import query_opencode_proxy
from opencode_client import get_opencode_model

async def compact_session_history(
    session_id: str,
    user_id: str,
    model_key: str,
    manager_ref,
    client_websocket=None
) -> str:
    """
    Summarizes the chat history using the active session model, deletes old message logs,
    and inserts a single compacted brief message in the database.
    """
    # 1. Fetch all database messages for the session
    db = get_db()
    res = db.table("messages").select("*").eq("session_id", session_id).order("timestamp", desc=False).execute()
    messages = res.data or []
    if not messages:
        return "No messages to compact."

    # Send progress: 10%
    if client_websocket:
        try:
            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": 10}))
        except Exception:
            pass

    # 2. Format history into a plain text block
    history_lines = []
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if content.startswith("[COMPACTED CONTEXT BRIEF:"):
            history_lines.append(f"--- PREVIOUS COMPACTED CONTEXT BRIEF ---\n{content}\n")
        else:
            history_lines.append(f"{role.upper()}: {content}")
    history_text = "\n\n".join(history_lines)

    # Send progress: 20%
    if client_websocket:
        try:
            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": 20}))
        except Exception:
            pass

    # 3. Instruct model to summarize history
    system_instr = (
        "You are a professional compiler. Your job is to summarize the chat history between the user and VoxKage (an advanced agentic AI assistant) into a single dense context brief.\n"
        "Extract all key facts about the user, completed laptop commands, modified files, active projects, decisions made, and pending action items.\n"
        "Keep the summary extremely detailed, precise, and developer-oriented. Do not lose critical technical details, file modifications, or decisions made.\n"
        "Output ONLY the detailed developer summary. Do not include any conversational filler, intro, or outro."
    )

    payload = {
        "model": get_opencode_model(model_key),
        "messages": [
            {"role": "system", "content": system_instr},
            {"role": "user", "content": f"Here is the chat history to compact:\n\n{history_text}"}
        ],
        "temperature": 0.3
    }

    summary_chunks = []
    # Send progress: 30%
    if client_websocket:
        try:
            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": 30}))
        except Exception:
            pass

    # Delegate completion to proxy client
    try:
        async for chunk in query_opencode_proxy(
            payload=payload,
            manager_ref=manager_ref,
            user_id=user_id,
            client_websocket=client_websocket,
            timeout=180.0
        ):
            if isinstance(chunk, dict):
                err_msg = chunk.get("content")
                if err_msg and err_msg.startswith("Error:"):
                    raise Exception(err_msg)
                delta = chunk.get("content", "")
                if delta:
                    summary_chunks.append(delta)
                    progress = min(80, 30 + len(summary_chunks) // 5)
                    if client_websocket:
                        try:
                            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": progress}))
                        except Exception:
                            pass
    except Exception as e:
        print(f"[-] Compaction query failed: {e}")
        raise e

    summary_text = "".join(summary_chunks).strip()
    if not summary_text:
        raise Exception("Failed to generate compaction summary: empty response from model.")

    # Send progress: 85%
    if client_websocket:
        try:
            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": 85}))
        except Exception:
            pass

    # 4. Perform transaction: delete old messages and insert compacted assistant brief
    try:
        db.table("messages").delete().eq("session_id", session_id).execute()
    except Exception as e:
        raise Exception(f"Database error deleting old history: {e}")

    # Send progress: 95%
    if client_websocket:
        try:
            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": 95}))
        except Exception:
            pass

    compacted_content = f"[COMPACTED CONTEXT BRIEF:\n{summary_text}\n]"
    try:
        db.table("messages").insert({
            "session_id": session_id,
            "role": "assistant",
            "content": compacted_content
        }).execute()
    except Exception as e:
        raise Exception(f"Database error saving compacted brief: {e}")

    # Send progress: 100%
    if client_websocket:
        try:
            await client_websocket.send_text(json.dumps({"type": "compaction_progress", "progress": 100}))
        except Exception:
            pass

    return summary_text
