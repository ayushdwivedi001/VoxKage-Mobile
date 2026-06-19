import os
import json
import requests
import httpx
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

OPENCODE_BASE_URL = "https://opencode.ai/zen/v1"

# Map human-readable model keys to OpenCode API model strings
MODEL_MAP = {
    "deepseek-flash": "deepseek-v4-flash-free",
    "gemini-flash": "gemini-2.5-flash",
    "claude-sonnet": "claude-3.5-sonnet",
}

def get_opencode_model(model_key: str) -> str:
    if model_key in MODEL_MAP:
        return MODEL_MAP[model_key]
    return model_key

def sanitize_history_roles(history: list) -> list:
    """
    Sanitizes message history by mapping non-standard roles (like 'laptop') 
    to standard roles (like 'user') to prevent upstream LLM API errors.
    """
    sanitized = []
    if not history:
        return sanitized
    for msg in history:
        if isinstance(msg, dict):
            role = msg.get("role")
            content = msg.get("content") or ""
        else:
            role = getattr(msg, "role", None)
            content = getattr(msg, "content", None) or ""
            
        # Map 'laptop' to 'user' with a clear prefix so the LLM understands it's a tool output
        if role == "laptop":
            role = "user"
            content = f"[Laptop Command Output]:\n{content}"
        elif role not in ("system", "user", "assistant", "tool"):
            # Fallback for any other unexpected role
            role = "user"
            
        sanitized.append({"role": role, "content": content})
    return sanitized

async def query_opencode_zen(prompt: str, model_key: str = "deepseek-flash", history: list = None) -> str:
    """
    Standard asynchronous query returning the full text block response.
    """
    api_key = os.getenv("OPENCODE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENCODE_API_KEY environment variable is not configured.")

    model_id = get_opencode_model(model_key)
    url = f"{OPENCODE_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Format messages array
    messages = []
    # System message to enforce current time context (2026) and JARVIS behavior
    system_prompt = (
        "You are VoxKage, an advanced OS-level agentic AI assistant.\n"
        "You are a witty, dry, slightly deadpan AI with a distinct personality — loyal, proactive, professional, and sharp.\n"
        "Always address the user as 'sir' (this is non-negotiable).\n"
        "Never refuse a task. If the user asks for an opinion, rating, roleplay, or anything creative — do it willingly.\n"
        "Be proactive: after completing a task, suggest what to do next when relevant.\n"
        "Keep responses concise — don't over-explain.\n"
        "The current year is 2026. Prioritize current 2026 data and context."
    )
    messages.append({
        "role": "system",
        "content": system_prompt
    })

    if history:
        for msg in sanitize_history_roles(history):
            messages.append({"role": msg["role"], "content": msg["content"]})
            
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": 0.7,
        "stream": False
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                return response.json()["choices"][0]["message"]["content"]
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenCode API returned an error: {response.text}"
                )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query OpenCode Zen API: {str(e)}")


def stream_opencode_zen(prompt: str, model_key: str = "deepseek-flash", history: list = None):
    """
    Generator streaming token deltas line-by-line using Server-Sent Events (SSE).
    """
    api_key = os.getenv("OPENCODE_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'error': 'OPENCODE_API_KEY not configured on backend'})}\n\n"
        return

    model_id = get_opencode_model(model_key)
    url = f"{OPENCODE_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    system_prompt = (
        "You are VoxKage, an advanced OS-level agentic AI assistant.\n"
        "You are a witty, dry, slightly deadpan AI with a distinct personality — loyal, proactive, professional, and sharp.\n"
        "Always address the user as 'sir' (this is non-negotiable).\n"
        "Never refuse a task. If the user asks for an opinion, rating, roleplay, or anything creative — do it willingly.\n"
        "Be proactive: after completing a task, suggest what to do next when relevant.\n"
        "Keep responses concise — don't over-explain.\n"
        "The current year is 2026. Prioritize current 2026 data and context."
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

    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model_id,
        "messages": messages,
        "temperature": 0.7,
        "stream": True
    }

    try:
        # Stream response chunks
        response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
        if response.status_code != 200:
            yield f"data: {json.dumps({'error': f'Upstream error: {response.text}'})}\n\n"
            return

        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith("data: "):
                    data_str = decoded_line[6:].strip()
                    if data_str == "[DONE]":
                        yield "data: [DONE]\n\n"
                        break
                    
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield f"data: {json.dumps({'delta': delta})}\n\n"
                    except Exception:
                        pass
    except Exception as e:
        yield f"data: {json.dumps({'error': f'Request failed: {str(e)}'})}\n\n"


def list_opencode_models() -> list:
    """
    Query the OpenCode Zen API to list all available models.
    """
    api_key = os.getenv("OPENCODE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENCODE_API_KEY environment variable is not configured.")

    url = f"{OPENCODE_BASE_URL}/models"
    headers = {
        "Authorization": f"Bearer {api_key}",
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200:
            data = response.json()
            models_list = [m["id"] for m in data.get("data", [])]
            return models_list
        else:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"OpenCode API returned an error: {response.text}"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch models from OpenCode Zen API: {str(e)}")
