import os
import sys
import socket

# Force IPv4 to bypass Jio/Airtel IPv6 SNI connection resets when talking to huggingface.co
orig_getaddrinfo = socket.getaddrinfo
socket.getaddrinfo = lambda host, port, family=0, *args, **kwargs: orig_getaddrinfo(host, port, socket.AF_INET, *args, **kwargs)

from huggingface_hub import HfApi

# Try loading from .env
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))
except ImportError:
    pass

HF_TOKEN = os.getenv("HF_TOKEN")
REPO_ID = "ShinAyush/voxkage-mobile-backend"

def run_deployment():
    print(f"[*] Initializing deployment to HF Space: {REPO_ID}...")
    
    if not HF_TOKEN:
        print("[-] Error: HF_TOKEN environment key is missing.")
        sys.exit(1)
        
    api = HfApi(token=HF_TOKEN)
    
    backend_path = os.path.join(os.path.dirname(__file__), "backend")
    if not os.path.exists(backend_path):
        print(f"[-] Error: Backend directory not found at {backend_path}")
        sys.exit(1)
        
    try:
        print("[*] Uploading folder contents. This might take a few moments...")
        # Exclude local caches or temporary files
        api.upload_folder(
            folder_path=backend_path,
            repo_id=REPO_ID,
            repo_type="space",
            ignore_patterns=["__pycache__/*", "*.pyc", ".env", "data/*"]
        )
        print("\n[+] Deployment successfully pushed!")
        print(f"[+] Your API is building and will run soon at: https://huggingface.co/spaces/{REPO_ID}")
    except Exception as e:
        print(f"[-] Deployment failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_deployment()
