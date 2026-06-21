import asyncio
import uuid
import json
import os
from typing import AsyncGenerator

# Global registry of client completion streams: { request_id: asyncio.Queue }
PROXY_REQUESTS = {}

async def query_opencode_proxy(
    payload: dict,
    manager_ref,
    user_id: str,
    client_websocket = None,
    timeout: float = 180.0
) -> AsyncGenerator[str, None]:
    """
    Delegates OpenCode completions stream query to a client (laptop daemon or mobile app)
    to route requests through residential/cellular IPs, bypassing server rate limits.
    """
    request_id = f"proxy_{uuid.uuid4()}"
    queue = asyncio.Queue()
    PROXY_REQUESTS[request_id] = queue

    # Check if Laptop Daemon is connected
    laptop_ws = None
    if manager_ref and hasattr(manager_ref, "active_laptops"):
        laptop_ws = manager_ref.active_laptops.get(user_id)

    # Gather candidate websockets in order of priority:
    # 1. Laptop Daemon WebSocket
    # 2. Provided client_websocket
    # 3. Any active chat WebSocket connections for the user
    candidates = []
    if laptop_ws:
        candidates.append((laptop_ws, "laptop"))
    if client_websocket and client_websocket not in [c[0] for c in candidates]:
        candidates.append((client_websocket, "client_websocket"))
    
    if manager_ref and hasattr(manager_ref, "active_chats"):
        chat_wss = manager_ref.active_chats.get(user_id, [])
        for ws in chat_wss:
            if ws not in [c[0] for c in candidates]:
                candidates.append((ws, "chat_websocket"))

    # Prepare proxy request payload (sends configured API key securely to user's local connection)
    api_key = os.getenv("OPENCODE_API_KEY")
    req_payload = {
        "type": "proxy_completion_request",
        "request_id": request_id,
        "payload": {
            "model": payload.get("model"),
            "messages": payload.get("messages"),
            "tools": payload.get("tools"),
            "tool_choice": payload.get("tool_choice"),
            "temperature": payload.get("temperature", 0.7),
            "stream": True,
            "api_key": api_key
        }
    }

    success_sent = False
    last_err = "No active WebSocket connection available to route proxy completion."
    
    for ws, ws_type in candidates:
        try:
            await ws.send_text(json.dumps(req_payload))
            success_sent = True
            break
        except Exception as e:
            last_err = f"Failed to send to {ws_type}: {e}"
            # Disconnect and clean up the stale websocket reference
            if manager_ref:
                try:
                    if ws_type == "laptop" and hasattr(manager_ref, "disconnect_laptop"):
                        manager_ref.disconnect_laptop(user_id)
                    elif ws_type == "chat_websocket" and hasattr(manager_ref, "disconnect_chat"):
                        manager_ref.disconnect_chat(user_id, ws)
                except Exception as clean_err:
                    print(f"Error cleaning up socket during fallback: {clean_err}")

    if not success_sent:
        if request_id in PROXY_REQUESTS:
            del PROXY_REQUESTS[request_id]
        yield {"content": f"Error: Failed to transmit completion request to client proxy: {last_err}"}
        return

    # Read the streamed chunks pushed back by the client to the registry queue
    try:
        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=timeout)
            except asyncio.TimeoutError:
                yield {"content": "Error: Client proxy completion request timed out."}
                break

            status = msg.get("status")
            if status == "chunk":
                delta = msg.get("delta")
                if delta:
                    yield delta
            elif status == "done":
                break
            elif status == "error":
                err_msg = msg.get("error", "Unknown client error")
                yield {"content": f"Error: Client-side completion failed: {err_msg}"}
                break
    finally:
        if request_id in PROXY_REQUESTS:
            del PROXY_REQUESTS[request_id]
