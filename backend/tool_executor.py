# tool_executor.py — Tool label generation and matplotlib script execution.
# Extracted from agent_loop.py to isolate display logic and heavy scientific imports.


def get_tool_label(name: str, args: dict) -> str:
    if name == "web_search":
        return f"Search: '{args.get('query', '')}'"
    elif name == "web_fetch":
        return f"Fetch URL: {args.get('url', '')}"
    elif name == "web_search_parallel":
        return "Parallel Search"
    elif name == "web_fetch_parallel":
        return "Parallel Fetch"
    elif name == "web_search_deep":
        return f"Deep Search: '{args.get('query', '')}'"
    elif name == "browse_and_extract_tool":
        target = args.get("url") or args.get("query") or ""
        return f"Extract: '{target}'"
    elif name == "laptop_command":
        return f"Laptop Cmd: {args.get('command', '')}"
    elif name == "mobile_send_sms":
        return f"SMS to {args.get('phone_number', '')}"
    elif name == "mobile_create_calendar_event":
        return f"Calendar: {args.get('title', '')}"
    elif name == "mobile_create_contact":
        return f"Contact: {args.get('name', '')}"
    elif name == "mobile_get_contacts":
        return "Get Contacts"
    elif name == "mobile_get_calendar_events":
        return "Get Calendar"
    elif name == "mobile_show_notification":
        return f"Notify: {args.get('title', '')}"
    elif name == "mobile_get_location":
        return "Get GPS Location"
    elif name == "mobile_get_device_stats":
        return "Device Stats"
    elif name == "mobile_trigger_haptic":
        return "Haptic Feedback"
    elif name == "mobile_launch_intent":
        return f"Launch Settings: {args.get('action', '')}"
    elif name == "mobile_share_file":
        return f"Share: {args.get('file_path', '')}"
    elif name == "mobile_print_pdf":
        return f"Print PDF: {args.get('file_path', '')}"
    elif name == "mobile_set_screen_keep_awake":
        return "Keep Screen Awake"
    elif name == "mobile_speak_text":
        return "Speak Text"
    elif name == "mobile_get_media_library":
        return "Get Media Library"
    elif name == "mobile_open_url":
        return f"Open URL: {args.get('url', '')}"
    elif name == "remember_user":
        return f"Remember Fact: {args.get('key', '')}"
    elif name == "recall_user":
        return "Recall Fact"
    elif name == "forget_user":
        return f"Forget Fact: {args.get('key', '')}"
    elif name == "query_rag":
        return f"RAG Query: '{args.get('query', '')}'"
    elif name == "list_indexed_documents":
        return "List RAG Docs"
    elif name == "delete_indexed_document":
        return "Delete RAG Doc"
    elif name == "create_file":
        return f"Create File: {args.get('filename', '')}"
    elif name == "convert_file":
        return f"Convert: {args.get('file_path', '')}"
    elif name == "run_matplotlib_script":
        return "Generate Chart"
    elif name.startswith("workspace_"):
        parts = name.split("_")
        action = parts[1].capitalize() if len(parts) > 1 else name
        file_path = args.get("file_path", "")
        return f"{action} file: {file_path}"
    else:
        return name.replace("_", " ").title()


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


def fetch_images_for_query(query: str, limit: int = 5) -> str:
    """
    Fetches authentic image URLs from Wikipedia/Wikimedia Commons API (primary),
    or Bing Images HTML parser (fallback), or DuckDuckGo (final fallback).
    Returns a comma-separated list of image URLs, Sir.
    """
    import urllib.request
    import json
    import re
    import urllib.parse

    urls = []

    # 1. Wikipedia/Wikimedia Commons API
    try:
        search_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&format=json"
        req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode('utf-8'))
            search_results = data.get("query", {}).get("search", [])
            
            if search_results:
                page_titles = [item["title"] for item in search_results[:limit]]
                for title in page_titles:
                    img_url = f"https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles={urllib.parse.quote(title)}&piprop=original&format=json"
                    img_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(img_req, timeout=3) as img_resp:
                        img_data = json.loads(img_resp.read().decode('utf-8'))
                        pages = img_data.get("query", {}).get("pages", {})
                        for page_id in pages:
                            orig = pages[page_id].get("original", {})
                            if orig.get("source"):
                                urls.append(orig["source"])
    except Exception as e:
        print(f"Wikipedia API failed: {e}")

    # 2. Bing Images Scraper (Extremely reliable and high-res!)
    if len(urls) < limit:
        try:
            bing_url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(bing_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            with urllib.request.urlopen(req, timeout=4) as response:
                html = response.read().decode('utf-8', errors='ignore')
                murls = re.findall(r'&quot;murl&quot;:&quot;(http[^&]+)&quot;', html)
                for mu in murls:
                    if mu not in urls:
                        urls.append(mu)
                        if len(urls) >= limit:
                            break
        except Exception as e:
            print(f"Bing Image scraper failed: {e}")

    # 3. DuckDuckGo Scraper Fallback
    if len(urls) < limit:
        try:
            ddg_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}+images"
            req = urllib.request.Request(ddg_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            with urllib.request.urlopen(req, timeout=4) as response:
                html = response.read().decode('utf-8', errors='ignore')
                found_srcs = re.findall(r'src="([^"]*?bing\.net/th[^"]*?)"', html)
                for src in found_srcs:
                    full_src = src if src.startswith("http") else "https:" + src
                    if full_src not in urls:
                        urls.append(full_src)
                        if len(urls) >= limit:
                            break
        except Exception as e:
            print(f"DuckDuckGo Image scraper failed: {e}")

    # Deduplicate and limit
    final_urls = []
    for u in urls:
        if u not in final_urls:
            final_urls.append(u)
    final_urls = final_urls[:limit]

    if not final_urls:
        return "Error: No authentic images found for this query, Sir."

    return ",".join(final_urls)
