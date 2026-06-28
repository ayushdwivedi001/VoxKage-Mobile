import json
import asyncio

async def run_laptop_spotify_command(cmd_manager, user_id, action_type, args) -> str:
    """
    Constructs and executes a PowerShell command on the user's laptop (via Laptop Daemon)
    to control Spotify/Media using the desktop's native automation modules.
    """
    if not cmd_manager or user_id not in cmd_manager.active_laptops:
        return (
            "Error: No laptop is currently connected to this account. "
            "Please launch the VoxKage Laptop Daemon to run Spotify remote commands."
        )

    # Map the tool parameters to the python automation command running on desktop
    py_cmd = ""
    if action_type == "search":
        q = args.get("query", "").replace("'", "\\'")
        py_cmd = (
            f"python -c \"from voxkage.automation.spotify_control import search_spotify_app, browse_spotify_search; "
            f"import json; opts = search_spotify_app('{q}'); "
            f"print(json.dumps(opts) if opts else browse_spotify_search('{q}'))\""
        )
    elif action_type == "play_selection":
        num = args.get("number", 1)
        py_cmd = (
            f"python -c \"from voxkage.automation.spotify_control import play_spotify_selection_api; "
            f"print(play_spotify_selection_api({num}))\""
        )
    elif action_type == "play_playlist":
        pname = args.get("playlist_name", "random").replace("'", "\\'")
        py_cmd = (
            f"python -c \"from voxkage.automation.spotify_control import play_user_playlist; "
            f"print(play_user_playlist('{pname}'))\""
        )
    elif action_type == "control":
        act = args.get("action", "play")
        tgt = args.get("target", "auto")
        
        # If it's a specific target or auto
        if tgt == "spotify":
            py_cmd = (
                f"python -c \"from voxkage.automation.spotify_control import control_spotify_app; "
                f"print(control_spotify_app('{act}'))\""
            )
        elif tgt == "youtube":
            py_cmd = (
                f"python -c \"from voxkage.automation.web_agent import control_media_web; "
                f"print(control_media_web('{act}'))\""
            )
        else:
            # Auto: tries both Spotify and Web Media
            py_cmd = (
                f"python -c \"from voxkage.automation.spotify_control import control_spotify_app; "
                f"from voxkage.automation.web_agent import control_media_web; "
                f"print('Spotify:', control_spotify_app('{act}'), '| YouTube:', control_media_web('{act}'))\""
            )
    else:
        return f"Error: Unknown Spotify remote action: {action_type}"

    # Forward the command execution to the laptop
    from agent_loop import LAPTOP_CHANNELS
    ws_laptop = cmd_manager.active_laptops[user_id]
    
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    LAPTOP_CHANNELS[user_id] = future
    
    try:
        # Send execution payload to Laptop
        await ws_laptop.send_text(json.dumps({"action": "execute", "command": py_cmd}))
        
        # Wait for daemon reply with 60s timeout
        result_payload = await asyncio.wait_for(future, timeout=60.0)
        return result_payload.get("output", "Command executed successfully.")
    except asyncio.TimeoutError:
        return "Error: Remote Spotify command execution timed out (60s limit)."
    except Exception as e:
        return f"Error executing remote Spotify command: {str(e)}"
    finally:
        if user_id in LAPTOP_CHANNELS:
            del LAPTOP_CHANNELS[user_id]
