# tool_executor.py — Tool label generation and robust async image fetching.
# Extracted from agent_loop.py to isolate display logic and heavy imports.


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
    elif name.startswith("workspace_"):
        parts = name.split("_")
        action = parts[1].capitalize() if len(parts) > 1 else name
        file_path = args.get("file_path", "")
        return f"{action} file: {file_path}"
    else:
        return name.replace("_", " ").title()


# File extensions that React Native Image component can render natively
RENDERABLE_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")

# URL patterns that are always hotlink-blocked or unreliable
BLOCKED_URL_PATTERNS = [
    "bing.com/th",
    "tse1.mm.bing.net",
    "encrypted-tbn",
    "gstatic.com",
    "facebook.com",
    "instagram.com",
    "twimg.com",
    "pbs.twimg.com",
    "data:image",
    ".svg",
    ".ogg",
    ".pdf",
    ".tiff",
    ".tif",
]


def is_renderable_image_url(url: str) -> bool:
    """
    Returns True if this URL is likely to render correctly in React Native's <Image>.
    Wikimedia CDN thumbnail URLs always end with a proper image extension.
    Rejects SVG, PDF, TIFF, OGG and hotlink-blocked CDN patterns.
    """
    if not url or not url.startswith("https://"):
        return False
    lower = url.lower()
    if any(blocked in lower for blocked in BLOCKED_URL_PATTERNS):
        return False
    # Must end with a renderable image extension OR be a known Wikimedia thumb URL
    has_ext = any(lower.endswith(ext) or (ext + "?") in lower for ext in RENDERABLE_IMAGE_EXTENSIONS)
    is_wikimedia = "upload.wikimedia.org" in lower
    is_ddg_image = "duckduckgo.com/i/" in lower
    return has_ext or is_wikimedia or is_ddg_image


def validate_and_deduplicate(urls: list, limit: int) -> list:
    """
    Filter, validate, deduplicate and prioritize image URLs.
    Wikimedia CDN URLs are always placed first (highest reliability).
    """
    wikimedia_urls = []
    other_urls = []
    seen = set()

    for url in urls:
        url = url.strip()
        if not url or url in seen:
            continue
        if not is_renderable_image_url(url):
            continue
        seen.add(url)
        if "upload.wikimedia.org" in url or "commons.wikimedia.org" in url:
            wikimedia_urls.append(url)
        else:
            other_urls.append(url)

    combined = wikimedia_urls + other_urls
    return combined[:limit]


async def fetch_images_for_query(query: str, limit: int = 5) -> str:
    """
    Two-Tier JSON-Only Image Fetcher — zero scraping, zero CAPTCHAs.

    TIER 1 — Wikipedia Thumbnail API:
      Searches Wikipedia for pages matching the query, then batch-fetches
      resized JPEG/PNG thumbnails (pithumbsize=800px) via the pageimages API.
      These are official article images from Wikimedia CDN. ALWAYS renderable.

    TIER 2 — Wikimedia Commons File Search:
      Uses gsrnamespace=6 (files only) to search Commons directly.
      Filters to JPEG/PNG/WEBP only to avoid SVG/TIFF/OGG render failures.

    TIER 3 — DuckDuckGo Instant Answer API (official JSON endpoint):
      Hits api.duckduckgo.com?format=json — no scraping, no CAPTCHA.
      Returns entity image + related topic icons.

    All three tiers fire IN PARALLEL via asyncio.gather() with 9s total timeout.
    Results are validated, deduplicated, and Wikimedia URLs are always placed first.

    This completely eliminates the Bing/DDG scraping failures that were causing
    the 'Unexpected character: P' (HTML CAPTCHA page) and image load errors.
    """
    import asyncio
    import json
    import urllib.parse

    all_urls = []

    async def _safe_get_json(session, url: str, headers: dict = None):
        """Fetch JSON from a URL. Returns None on any error — never raises."""
        try:
            async with session.get(url, headers=headers or {}) as resp:
                if resp.status == 200:
                    ct = resp.headers.get("Content-Type", "")
                    if "json" in ct or "javascript" in ct or ct == "":
                        return await resp.json(content_type=None)
                    # If non-JSON content-type returned (e.g. HTML CAPTCHA page), skip
                    print(f"[fetch_images] Non-JSON response ({ct}) from: {url[:60]}")
        except Exception as e:
            print(f"[fetch_images] GET failed — {url[:60]}: {e}")
        return None

    WP_HEADERS = {
        "User-Agent": "VoxKage/2.0 (https://voxkage.ai; contact@voxkage.ai) python-aiohttp"
    }

    async def tier0_ddgs_images(query: str, count: int) -> list:
        """
        DuckDuckGo image search via the already-installed ddgs package — TIER 0 (Primary).
        The ddgs.images() method returns direct JPG/PNG/WEBP URLs with no CAPTCHA,
        no HTML scraping, and no rate limiting for reasonable volumes.
        This is the most reliable source for real, renderable image URLs.
        """
        found = []
        try:
            from ddgs import DDGS

            def _run():
                with DDGS() as ddgs:
                    return list(ddgs.images(query, max_results=count * 2))

            results = await asyncio.to_thread(_run)
            for r in results:
                url = r.get("image", "") or r.get("thumbnail", "")
                if url and is_renderable_image_url(url) and url not in found:
                    found.append(url)
        except Exception as e:
            print(f"[fetch_images] Tier0 DDGS images error: {e}")
        return found

    async def tier1_wikipedia_thumbnails(session, query: str, count: int) -> list:
        """
        Wikipedia Thumbnail API — TIER 1.
        Returns resized JPEG/PNG thumbnails guaranteed to render in React Native.
        Step 1: Search for relevant page titles.
        Step 2: Batch-fetch all thumbnails in ONE API call (no N+1).
        """
        found = []
        try:
            encoded = urllib.parse.quote(query)
            # Step 1: Search — get matching page titles
            search_url = (
                f"https://en.wikipedia.org/w/api.php"
                f"?action=query&list=search&srsearch={encoded}"
                f"&format=json&srlimit={min(count * 2, 12)}"
            )
            data = await _safe_get_json(session, search_url, WP_HEADERS)
            if not data:
                return found

            titles = [r["title"] for r in data.get("query", {}).get("search", [])]
            if not titles:
                return found

            # Step 2: Batch pageimages — ONE call, resized thumbnails at 800px
            titles_param = urllib.parse.quote("|".join(titles[:count + 2]))
            img_url = (
                f"https://en.wikipedia.org/w/api.php"
                f"?action=query&titles={titles_param}"
                f"&prop=pageimages&piprop=original|thumbnail&pithumbsize=800"
                f"&format=json"
            )
            img_data = await _safe_get_json(session, img_url, WP_HEADERS)
            if not img_data:
                return found

            pages = img_data.get("query", {}).get("pages", {})
            for page_id, page in pages.items():
                # Prefer thumbnail (always JPEG at specified size) over original (may be SVG)
                src = (
                    page.get("thumbnail", {}).get("source")
                    or page.get("original", {}).get("source")
                )
                if src and src not in found:
                    found.append(src)
        except Exception as e:
            print(f"[fetch_images] Tier1 Wikipedia thumbnails error: {e}")
        return found

    async def tier2_wikimedia_commons(session, query: str, count: int) -> list:
        """
        Wikimedia Commons File Search — TIER 2.
        gsrnamespace=6 restricts results to File: namespace only (actual images).
        Strictly filters to JPEG/PNG/WEBP — no SVG/OGG/PDF.
        """
        found = []
        try:
            encoded = urllib.parse.quote(query)
            url = (
                f"https://commons.wikimedia.org/w/api.php"
                f"?action=query&generator=search"
                f"&gsrsearch={encoded}&gsrnamespace=6"
                f"&prop=imageinfo&iiprop=url"
                f"&format=json&gsrlimit={min(count * 2, 12)}"
            )
            data = await _safe_get_json(session, url, WP_HEADERS)
            if not data:
                return found

            pages = data.get("query", {}).get("pages", {})
            for page_id, page in pages.items():
                for info in page.get("imageinfo", []):
                    src = info.get("url", "")
                    if not src:
                        continue
                    lower = src.lower()
                    # Strictly allow only renderable formats
                    if any(lower.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                        if src not in found:
                            found.append(src)
        except Exception as e:
            print(f"[fetch_images] Tier2 Wikimedia Commons error: {e}")
        return found

    async def tier3_duckduckgo_instant(session, query: str) -> list:
        """
        DuckDuckGo Instant Answer JSON API — TIER 3.
        Official endpoint: api.duckduckgo.com?format=json
        Returns entity image from DDG knowledge graph. Zero scraping, zero CAPTCHA.
        """
        found = []
        try:
            encoded = urllib.parse.quote(query)
            # Use no_redirect=1 and no_html=1 to guarantee clean JSON response
            url = (
                f"https://api.duckduckgo.com/"
                f"?q={encoded}&format=json&no_redirect=1&no_html=1&t=VoxKage"
            )
            data = await _safe_get_json(session, url)
            if not data:
                return found

            # Entity image (most reliable)
            img = data.get("Image", "")
            if img and img.startswith("https://"):
                found.append(img)

            # RelatedTopics icons (smaller but real images)
            for topic in data.get("RelatedTopics", [])[:8]:
                if not isinstance(topic, dict):
                    continue
                icon = topic.get("Icon", {})
                if not isinstance(icon, dict):
                    continue
                icon_url = icon.get("URL", "")
                if icon_url and icon_url.startswith("https://") and icon_url not in found:
                    found.append(icon_url)
        except Exception as e:
            print(f"[fetch_images] Tier3 DDG Instant error: {e}")
        return found

    # --- Main execution: all 3 tiers run in parallel ---
    try:
        import aiohttp

        connector = aiohttp.TCPConnector(limit=12)
        timeout = aiohttp.ClientTimeout(total=9, connect=4, sock_connect=4, sock_read=8)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            t0, t1, t2, t3 = await asyncio.gather(
                tier0_ddgs_images(query, limit),
                tier1_wikipedia_thumbnails(session, query, limit),
                tier2_wikimedia_commons(session, query, limit),
                tier3_duckduckgo_instant(session, query),
                return_exceptions=True
            )

        for result in [t0, t1, t2, t3]:
            if isinstance(result, list):
                all_urls.extend(result)

    except ImportError:
        # aiohttp not available — synchronous urllib fallback (server may not have aiohttp)
        print("[fetch_images] aiohttp unavailable, falling back to sync urllib")
        import urllib.request
        try:
            encoded = urllib.parse.quote(query)
            search_url = (
                f"https://en.wikipedia.org/w/api.php"
                f"?action=query&list=search&srsearch={encoded}&format=json&srlimit=6"
            )
            req = urllib.request.Request(search_url, headers={"User-Agent": "VoxKage/2.0"})
            with urllib.request.urlopen(req, timeout=9) as resp:
                data = json.loads(resp.read().decode())
                titles = [r["title"] for r in data.get("query", {}).get("search", [])]
                if titles:
                    titles_param = urllib.parse.quote("|".join(titles[:6]))
                    img_url = (
                        f"https://en.wikipedia.org/w/api.php"
                        f"?action=query&titles={titles_param}"
                        f"&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json"
                    )
                    req2 = urllib.request.Request(img_url, headers={"User-Agent": "VoxKage/2.0"})
                    with urllib.request.urlopen(req2, timeout=9) as resp2:
                        img_data = json.loads(resp2.read().decode())
                        pages = img_data.get("query", {}).get("pages", {})
                        for pid, page in pages.items():
                            src = page.get("thumbnail", {}).get("source") or page.get("original", {}).get("source")
                            if src:
                                all_urls.append(src)
        except Exception as e:
            print(f"[fetch_images] urllib fallback error: {e}")

    except Exception as e:
        print(f"[fetch_images] aiohttp session error: {e}")

    # Final pass: validate, deduplicate, prioritize Wikimedia CDN
    final_urls = validate_and_deduplicate(all_urls, limit)

    # Validate image existence to filter out deleted/missing (404) URLs from Wikimedia/Wikipedia
    verified_urls = []
    if final_urls:
        try:
            import aiohttp
            async def _verify_one(session, url):
                headers = {"User-Agent": "VoxKage/2.0 (https://voxkage.ai; contact@voxkage.ai) python-aiohttp"}
                try:
                    async with session.head(url, headers=headers, timeout=2.0, allow_redirects=True) as resp:
                        if resp.status == 200:
                            return url, True
                        # Some sites return 405 Method Not Allowed or 403 for HEAD, try GET
                        if resp.status in (405, 403, 401, 301, 302):
                            async with session.get(url, headers=headers, timeout=2.0) as gresp:
                                return url, gresp.status == 200
                        print(f"[fetch_images] verification HEAD failed ({resp.status}) for: {url}")
                except Exception as e:
                    # Fallback to GET on exception
                    try:
                        async with session.get(url, headers=headers, timeout=2.0) as gresp:
                            return url, gresp.status == 200
                    except Exception as ge:
                        print(f"[fetch_images] verification GET fallback failed for {url}: {ge}")
                return url, False

            async with aiohttp.ClientSession(
                connector=aiohttp.TCPConnector(limit=10),
                timeout=aiohttp.ClientTimeout(total=4.0)
            ) as verify_session:
                tasks = [_verify_one(verify_session, u) for u in final_urls]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for res in results:
                    if isinstance(res, tuple):
                        url, is_ok = res
                        if is_ok:
                            verified_urls.append(url)
                        else:
                            print(f"[fetch_images] Filtered out dead URL (404/error): {url}")
        except Exception as e:
            print(f"[fetch_images] URL verification process crashed: {e}")
            verified_urls = final_urls
    else:
        verified_urls = final_urls

    if not verified_urls:
        return "Error: No images found. The image APIs returned no results for this query."

    print(f"[fetch_images] Returning {len(verified_urls)} validated URLs for: '{query}'")
    return ",".join(verified_urls)
