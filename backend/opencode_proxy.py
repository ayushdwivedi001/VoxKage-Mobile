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
    timeout: float = 45.0
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

    target_ws = None
    dest_type = "cloud"
    
    if laptop_ws:
        target_ws = laptop_ws
        dest_type = "laptop"
    elif client_websocket:
        target_ws = client_websocket
        dest_type = "mobile"

    if not target_ws:
        # Fallback to direct cloud completions if no clients are online
        print("[-] DCPR Warning: No connected laptop or phone to proxy completion. Attempting direct query...")
        from opencode_client import stream_opencode_zen, MODEL_MAP
        model_id = payload.get("model", "deepseek-v4-flash-free")
        
        # Reverse map model_id to model_key
        model_key = "deepseek-flash"
        for k, v in MODEL_MAP.items():
            if v == model_id:
                model_key = k
                break
        
        messages = payload.get("messages", [])
        prompt = messages[-1]["content"] if messages else "hello"
        history = [{"role": m["role"], "content": m["content"]} for m in messages[:-1]] if len(messages) > 1 else []

        try:
            for sse_line in stream_opencode_zen(prompt=prompt, model_key=model_key, history=history):
                if sse_line.startswith("data: "):
                    data_str = sse_line[6:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        if "choices" in chunk and chunk["choices"]:
                            delta = chunk["choices"][0].get("delta", {})
                            yield delta
                    except:
                        pass
            return
        except Exception as e:
            yield {"content": f"Error: No clients online and fallback cloud query failed: {e}"}
            return

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

    try:
        await target_ws.send_text(json.dumps(req_payload))
    except Exception as e:
        del PROXY_REQUESTS[request_id]
        yield {"content": f"Error: Failed to transmit completion request to client proxy: {e}"}
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
