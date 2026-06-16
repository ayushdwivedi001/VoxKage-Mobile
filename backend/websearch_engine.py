import time
import random
import asyncio
from typing import List, Dict, Any

try:
    from duckduckgo_search import DDGS
    HAS_DDG = True
except ImportError:
    HAS_DDG = False

try:
    import trafilatura
    HAS_TRAFILATURA = True
except ImportError:
    HAS_TRAFILATURA = False

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
]

class TTLCache:
    def __init__(self, ttl_seconds: float = 900):
        self.ttl = ttl_seconds
        self.cache = {}

    def get(self, key):
        if key in self.cache:
            val, expire = self.cache[key]
            if time.time() < expire:
                return val
            else:
                del self.cache[key]
        return None

    def set(self, key, value):
        self.cache[key] = (value, time.time() + self.ttl)

search_cache = TTLCache(ttl_seconds=900)
fetch_cache = TTLCache(ttl_seconds=900)

async def web_search(query: str, max_results: int = 10) -> List[Dict[str, Any]]:
    if not HAS_DDG:
        return [{"error": "duckduckgo-search is not installed. Please add it to requirements."}]

    cached = search_cache.get((query, max_results))
    if cached is not None:
        return cached

    def _run_ddg():
        try:
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=max_results))
        except Exception as e:
            print(f"⚠️ DDG execution failed: {e}")
            return []

    try:
        results = await asyncio.to_thread(_run_ddg)
        parsed = []
        for r in results:
            parsed.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", "")
            })
        search_cache.set((query, max_results), parsed)
        return parsed
    except Exception as e:
        return [{"error": f"Failed to execute DuckDuckGo search: {e}"}]

async def web_fetch(url: str) -> Dict[str, Any]:
    if not HAS_AIOHTTP or not HAS_TRAFILATURA:
        return {
            "url": url,
            "error": "aiohttp or trafilatura is not installed. Please add to requirements."
        }

    cached = fetch_cache.get(url)
    if cached is not None:
        return cached

    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.google.com/"
    }

    try:
        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status != 200:
                    return {
                        "url": url,
                        "error": f"HTTP status error: {response.status} {response.reason}"
                    }

                html_content = await response.text(errors='replace')

                def _extract():
                    return trafilatura.extract(
                        html_content,
                        include_links=True,
                        include_images=False,
                        include_tables=True,
                        output_format="markdown"
                    )

                content = await asyncio.to_thread(_extract)

                # Fallback to BeautifulSoup if trafilatura fails
                if not content:
                    try:
                        from bs4 import BeautifulSoup
                        soup = BeautifulSoup(html_content, 'html.parser')
                        for element in soup(["script", "style", "nav", "footer", "header"]):
                            element.decompose()
                        raw_text = soup.get_text(separator="\n")
                        lines = [line.strip() for line in raw_text.splitlines()]
                        content = "\n".join([line for line in lines if line])
                    except Exception:
                        content = ""

                if not content:
                    return {
                        "url": url,
                        "error": "Could not extract clean text content from page."
                    }

                # Cap length to ~50KB to avoid token bloat
                if len(content) > 30000:
                    content = content[:30000] + "\n\n...[Content truncated due to size limits]..."

                result = {
                    "url": url,
                    "status": response.status,
                    "content": content
                }

                fetch_cache.set(url, result)
                return result

    except asyncio.TimeoutError:
        return {"url": url, "error": "Request timed out (15s limit)"}
    except Exception as e:
        return {"url": url, "error": f"Fetch failed: {str(e)}"}

async def web_fetch_parallel(urls: List[str]) -> List[Dict[str, Any]]:
    tasks = [web_fetch(url) for url in urls]
    return list(await asyncio.gather(*tasks))

async def web_search_parallel(queries: List[str]) -> List[List[Dict[str, Any]]]:
    tasks = [web_search(q) for q in queries]
    return list(await asyncio.gather(*tasks))

async def web_search_deep(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    max_results = min(max_results, 5)

    # 1. Run Search
    results = await web_search(query, max_results=max_results)
    if not results or "error" in results[0]:
        return results

    # 2. Get URLs
    urls = [r["url"] for r in results if r.get("url")]
    if not urls:
        return results

    # 3. Concurrently fetch page content
    fetch_results = await web_fetch_parallel(urls)

    # 4. Merge results
    combined = []
    for r in results:
        url = r.get("url")
        matched = next((f for f in fetch_results if f.get("url") == url), None)

        entry = {
            "title": r.get("title", ""),
            "url": url,
            "snippet": r.get("snippet", ""),
        }

        if matched:
            if "error" in matched:
                entry["fetch_error"] = matched["error"]
            else:
                entry["content"] = matched.get("content", "")
        else:
            entry["fetch_error"] = "No content retrieved"

        combined.append(entry)

    return combined
