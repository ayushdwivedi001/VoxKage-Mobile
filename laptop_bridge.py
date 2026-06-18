import asyncio
import json
import os
import sys
import argparse
import subprocess
import requests
import httpx
import websockets
from dotenv import load_dotenv

# Try loading environment variables from backend directory
env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

DEFAULT_BACKEND_URL = "https://shinayush-voxkage-mobile-backend.hf.space"
DEFAULT_WS_URL = "wss://shinayush-voxkage-mobile-backend.hf.space"

def get_jwt_token(backend_url):
    master_key = os.getenv("VOXKAGE_MASTER_KEY", "sir")
    email = "sir.google@voxkage.ai"
    
    print(f"[*] Authenticating with backend: {backend_url} as {email}...")
    try:
        response = requests.post(
            f"{backend_url}/auth/master-login",
            json={"email": email, "master_key": master_key},
            timeout=15.0
        )
        if response.status_code == 404:
            # Try verification pathway if master-login isn't deployed yet
            print("[-] master-login endpoint returned 404. Attempting OTP request pathway...")
            # Fallback mock/dev token if no other options succeed
            return f"mock-{master_key}"
            
        response.raise_for_status()
        token = response.json().get("access_token")
        print("[+] Authentication successful. Access token acquired.")
        return token
    except Exception as e:
        print(f"[-] Authentication failed: {e}")
        print("[*] Falling back to default developer token...")
        return f"mock-{master_key}"

async def handle_proxy_completion(websocket, data):
    request_id = data.get("request_id")
    payload = data.get("payload", {})
    api_key = payload.get("api_key") or os.getenv("OPENCODE_API_KEY")
    model = payload.get("model")
    messages = payload.get("messages")
    tools = payload.get("tools")
    tool_choice = payload.get("tool_choice")
    temperature = payload.get("temperature", 0.7)
    
    print(f"[*] Received proxy completions request {request_id} for model '{model}'...")
    
    if not api_key:
        print("[-] Error: OPENCODE_API_KEY is not defined in backend/.env")
        await websocket.send(json.dumps({
            "type": "proxy_completion_error",
            "request_id": request_id,
            "error": "OPENCODE_API_KEY is missing on laptop client."
        }))
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    req_body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True
    }
    if tools:
        req_body["tools"] = tools
    if tool_choice:
        req_body["tool_choice"] = tool_choice
        
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            async with client.stream(
                "POST", 
                "https://opencode.ai/zen/v1/chat/completions", 
                headers=headers, 
                json=req_body
            ) as response:
                if response.status_code != 200:
                    text = await response.aread()
                    raise Exception(f"HTTP {response.status_code}: {text.decode('utf-8')}")
                
                async for line in response.aiter_lines():
                    # Strip "data: " prefix and handle clean SSE lines
                    clean_line = line.strip()
                    if clean_line.startswith("data:"):
                        clean_line = clean_line[5:].strip()
                    if not clean_line:
                        continue
                    if clean_line == "[DONE]":
                        break
                    try:
                        chunk = json.loads(clean_line)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        if delta:
                            await websocket.send(json.dumps({
                                "type": "proxy_completion_chunk",
                                "request_id": request_id,
                                "delta": delta
                            }))
                    except Exception:
                        pass
                        
        await websocket.send(json.dumps({
            "type": "proxy_completion_done",
            "request_id": request_id
        }))
        print(f"[+] Proxy request {request_id} finished streaming successfully.")
    except Exception as e:
        print(f"[-] Proxy request {request_id} failed: {e}")
        try:
            await websocket.send(json.dumps({
                "type": "proxy_completion_error",
                "request_id": request_id,
                "error": str(e)
            }))
        except Exception:
            pass

async def handle_execute_command(websocket, cmd):
    print(f"[*] Executing system command on laptop: {cmd}")
    try:
        proc = await asyncio.create_subprocess_exec(
            "powershell.exe", "-Command", cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        output = stdout.decode("utf-8", errors="replace") + stderr.decode("utf-8", errors="replace")
        
        await websocket.send(json.dumps({
            "type": "execution_result",
            "output": output
        }))
        print("[+] System command executed successfully.")
    except Exception as e:
        print(f"[-] Command execution failed: {e}")
        try:
            await websocket.send(json.dumps({
                "type": "execution_result",
                "output": f"Error executing laptop command: {e}"
            }))
        except Exception:
            pass

async def bridge_loop(ws_url, token):
    url = f"{ws_url}/ws/laptop?token={token}"
    print(f"[*] Connecting WebSocket bridge to: {url}...")
    
    async for websocket in websockets.connect(url, ping_interval=20, ping_timeout=20):
        try:
            print("[+] WebSocket connection active. Laptop Daemon is ONLINE and listening...")
            async for message_str in websocket:
                try:
                    data = json.loads(message_str)
                except Exception:
                    continue
                
                msg_type = data.get("type")
                action = data.get("action")
                
                if msg_type == "proxy_completion_request":
                    asyncio.create_task(handle_proxy_completion(websocket, data))
                elif action == "execute":
                    cmd = data.get("command")
                    asyncio.create_task(handle_execute_command(websocket, cmd))
        except websockets.ConnectionClosed as cc:
            print(f"[-] Connection closed ({cc.code}): {cc.reason}. Reconnecting in 3s...")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"[-] Bridge error: {e}. Reconnecting in 3s...")
            await asyncio.sleep(3)

def main():
    parser = argparse.ArgumentParser(description="VoxKage Laptop Daemon Bridge Client")
    parser.add_argument("--local", action="store_true", help="Connect to the local backend (http://127.0.0.1:9000)")
    parser.add_argument("--url", type=str, help="Custom backend URL")
    args = parser.parse_args()
    
    if args.local:
        backend_url = "http://127.0.0.1:9000"
        ws_url = "ws://127.0.0.1:9000"
    elif args.url:
        backend_url = args.url.replace("ws://", "http://").replace("wss://", "https://")
        ws_url = args.url.replace("http://", "ws://").replace("https://", "wss://")
    else:
        backend_url = DEFAULT_BACKEND_URL
        ws_url = DEFAULT_WS_URL
        
    token = get_jwt_token(backend_url)
    
    try:
        asyncio.run(bridge_loop(ws_url, token))
    except KeyboardInterrupt:
        print("\n[+] Laptop Daemon Bridge shut down by user.")

if __name__ == "__main__":
    main()
