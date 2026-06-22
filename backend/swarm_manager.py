# swarm_manager.py — Backend orchestrator for the /agents multi-agent swarm tasks.
import json
import uuid
import asyncio
from datetime import datetime
from database import get_db, update_session_active_swarm, log_message
from opencode_proxy import query_opencode_proxy
from tool_schemas import TOOLS_SCHEMA
from main import manager
from opencode_client import get_opencode_model

# Import local engines for local fallback tool execution
from websearch_engine import web_search, web_fetch, web_search_deep
from tool_executor import fetch_images_for_query
from rag_engine import query_rag_vector
from memory_engine import recall_user

# Global registry for active swarm tasks: { task_id: asyncio.Task }
ACTIVE_SWARM_TASKS = {}

async def run_subagent_loop(
    task_id: str,
    user_id: str,
    session_id: str,
    subagent: dict,
    model_key: str,
    on_status_update,
    bridge_mode: str = "laptop",
    mobile_local_ip: str = None,
    active_project_box: list = None,
    previous_findings: str = None
) -> str:
    subagent_name = subagent["name"]
    subagent_role = subagent["role"]
    subagent_task = subagent["task"]
    
    is_supervisor = subagent_role == "Supervisor (QA & Compilation)"
    
    if is_supervisor:
        system_content = (
            "You are the Main Agent and Supervisor Coordinator for the VoxKage Swarm.\n"
            "Your role is to review the compiled findings from the subagents, verify if the files (index.html, style.css, script.js) were successfully written to the workspace, fix any bugs or missing/incomplete code directly using your workspace tools, and compile the final report for the user, sir.\n\n"
            "Follow these instructions, sir:\n"
            "1. Read the workspace files (index.html, style.css, script.js) using workspace_read_file to check if they are complete and functional.\n"
            "2. If script.js or any other file is empty, placeholder, or has syntax issues, write the complete, functional code yourself using workspace_write_file.\n"
            "3. Once the app is complete and fully integrated, compile a detailed, presentable final report. Follow the 60/40 visual component rule (use LinkCard, Weather, Map, TaskList, Table, or matplotlib Chart where appropriate, and always include the markdown code blocks of index.html, style.css, script.js so the user's interface renders the 'Open in Playground' button). Maintain a witty, dry, professional, deadpan tone and address the user as 'sir'."
        )
    else:
        system_content = (
            f"You are VoxKage Subagent: {subagent_name}.\n"
            f"Your role is: {subagent_role}.\n"
            f"Your specific task: {subagent_task}\n\n"
            "You have access to tools. Always check if you need to perform a web search or fetch a page to get factual, current (2026) data, sir. "
            "You can also read, write, edit, and check syntax of files in the live preview workspace. "
            "Respond with a complete, structured summary of your findings when you have gathered all necessary information. "
            "Keep your response concise and focused on the task."
        )
        
    # Initialize conversation history with system instructions
    history = [
        {
            "role": "system",
            "content": system_content
        }
    ]
    
    if previous_findings:
        history.append({
            "role": "user",
            "content": f"Here is the context and findings gathered by preceding subagents in this swarm, sir:\n\n{previous_findings}"
        })
        
    laptop_ws = manager.active_laptops.get(user_id) if manager else None
    
    last_turn_had_tools = False
    assistant_text = ""
    
    try:
        # Run the agentic loop (up to 20 turns)
        for turn in range(20):
            model_id = get_opencode_model(model_key)
            payload = {
                "model": model_id,
                "messages": history,
                "tools": TOOLS_SCHEMA,
                "temperature": 0.5
            }
            
            current_tool_calls = []
            assistant_text = ""
            
            await on_status_update(f"Running agent turn {turn + 1}/20...")
            
            # Stream proxy request
            async for delta in query_opencode_proxy(payload, manager, user_id, client_websocket=laptop_ws):
                if isinstance(delta, dict):
                    if isinstance(delta.get("content"), str) and delta.get("content").startswith("Error:"):
                        raise Exception(delta.get("content"))
                    
                    # Accumulate tool calls
                    if "tool_calls" in delta:
                        tcalls = delta["tool_calls"]
                        for tc in tcalls:
                            idx = tc.get("index", 0)
                            while len(current_tool_calls) <= idx:
                                current_tool_calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                            if tc.get("id"):
                                current_tool_calls[idx]["id"] = tc["id"]
                            if tc["function"].get("name"):
                                current_tool_calls[idx]["function"]["name"] = tc["function"]["name"]
                            if tc["function"].get("arguments"):
                                current_tool_calls[idx]["function"]["arguments"] += tc["function"]["arguments"]
                    
                    if delta.get("content"):
                        assistant_text += delta["content"]
                elif isinstance(delta, str):
                    assistant_text += delta
            
            # Parse DSML XML tool calls from assistant_text
            from agent_loop import parse_dsml_tool_calls
            cleaned_text, dsml_calls = parse_dsml_tool_calls(assistant_text)
            if dsml_calls:
                current_tool_calls.extend(dsml_calls)
                # Keep the clean text without XML tool calls
                assistant_text = cleaned_text
                    
            # Process output
            if current_tool_calls:
                last_turn_had_tools = True
                history.append({
                    "role": "assistant",
                    "content": assistant_text or None,
                    "tool_calls": current_tool_calls
                })
                
                # Execute tool calls concurrently
                from agent_loop import execute_tool_call_v2
                
                tool_context = {
                    "web_search_called": False,
                    "consulted_sources": []
                }
                if active_project_box is None:
                    active_project_box = [None]
                
                tasks = []
                for tc in current_tool_calls:
                    tc_name = tc.get("function", {}).get("name", "unknown")
                    args_str = tc.get("function", {}).get("arguments", "{}")
                    try:
                        tc_args = json.loads(args_str)
                    except:
                        tc_args = {}
                    
                    # Intercept for user detailed logs
                    status_msg = f"Executing tool '{tc_name}'..."
                    if tc_name == "workspace_write_file":
                        file_path = tc_args.get("file_path", "")
                        status_msg = f"Writing file '{file_path}' to playground..."
                    elif tc_name == "workspace_edit_file":
                        file_path = tc_args.get("file_path", "")
                        status_msg = f"Editing file '{file_path}' in playground..."
                    elif tc_name == "web_search":
                        query_val = tc_args.get("query", "")
                        status_msg = f"Searching web for: '{query_val}'..."
                    elif tc_name == "web_fetch":
                        url_val = tc_args.get("url", "")
                        status_msg = f"Fetching page: {url_val}..."
                    elif tc_name == "workspace_syntax_check":
                        file_path = tc_args.get("file_path", "")
                        status_msg = f"Validating syntax of '{file_path}'..."
                    
                    await on_status_update(status_msg)
                    
                    tasks.append(
                        execute_tool_call_v2(
                            tc=tc,
                            user_id=user_id,
                            session_id=session_id,
                            active_project_box=active_project_box,
                            client_websocket=None,
                            manager_ref=manager,
                            client_time=None,
                            model_key=model_key,
                            tool_context=tool_context,
                            bridge_mode=bridge_mode,
                            mobile_local_ip=mobile_local_ip
                        )
                    )
                    
                results = await asyncio.gather(*tasks)
                
                tc_names = {tc["id"]: tc["function"]["name"] for tc in current_tool_calls}
                for tc_id, tool_output, success in results:
                    history.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "name": tc_names.get(tc_id, "unknown"),
                        "content": tool_output
                    })
            else:
                last_turn_had_tools = False
                # Just in case there was any stray DSML tag in final output of loop turn
                assistant_text = cleaned_text
                return assistant_text
                
        # Force a final completion turn without tools if last turn had tool calls
        if last_turn_had_tools:
            await on_status_update("Compiling final findings...")
            model_id = get_opencode_model(model_key)
            compilation_history = history + [
                {
                    "role": "system",
                    "content": "You have completed your tool execution turns. Please compile all your findings, code modifications, and results into a final, structured report for the coordinator, sir."
                }
            ]
            payload = {
                "model": model_id,
                "messages": compilation_history,
                "temperature": 0.5
            }
            
            final_text = ""
            async for delta in query_opencode_proxy(payload, manager, user_id, client_websocket=laptop_ws):
                if isinstance(delta, dict):
                    if isinstance(delta.get("content"), str) and delta.get("content").startswith("Error:"):
                        raise Exception(delta.get("content"))
                    if delta.get("content"):
                        final_text += delta["content"]
                elif isinstance(delta, str):
                    final_text += delta
            
            # Clean any leftover DSML XML tags from the compilation text
            from agent_loop import parse_dsml_tool_calls
            final_text, _ = parse_dsml_tool_calls(final_text)
            return final_text or "No findings returned."
            
    finally:
        # Sync changes to database at the end of each subagent's execution
        if active_project_box and active_project_box[0]:
            proj = active_project_box[0]
            proj_id = proj.get("id")
            if proj_id:
                try:
                    from workspace_helpers import get_workspace_files_dict
                    from database import save_playground_project
                    final_files = get_workspace_files_dict(proj_id)
                    if final_files:
                        save_playground_project(
                            user_id=user_id,
                            project_id=proj_id,
                            name=proj.get("name", "Playground Project"),
                            html=final_files.get("index.html") or proj.get("html") or "",
                            css=final_files.get("style.css") or proj.get("css") or "",
                            js=final_files.get("script.js") or proj.get("js") or "",
                            files=final_files
                        )
                        print(f"[+] Saved subagent playground changes for project {proj_id} to DB.")
                except Exception as save_err:
                    print(f"[-] Failed to save subagent playground changes: {save_err}")
                    
    return assistant_text or "No findings returned."


async def launch_swarm_background(
    task_id: str,
    query: str,
    user_id: str,
    session_id: str,
    model_key: str,
    specified_agent_count: int | None = None,
    bridge_mode: str = "laptop",
    mobile_local_ip: str = None
):
    from main import query_llm_proxied
    try:
        # Step 1: Divide task and decide subagents list
        system_instruction = (
            "You are the Swarm Coordinator for VoxKage.\n"
            "Your task is to analyze the user's query and split it into a set of specialized subagent tasks.\n"
            "Always classify the task: if it's a coding or application building request (e.g., building a todo list app, a dashboard, a weather widget), you MUST dispatch at least 4 to 5 specialized subagents. A standard coding/playground app swarm should consist of:\n"
            "  1. A Researcher (e.g. 'Todo App Researcher' or 'UI/UX Idea Searcher') to find best practices and latest UI/UX trends.\n"
            "  2. An Architect/Planner (e.g. 'System Architect & UI Designer') to create the project blueprint, file specifications, and design structure.\n"
            "  3. HTML Developer (e.g. 'HTML Coder') to write index.html in the playground workspace.\n"
            "  4. CSS Developer (e.g. 'CSS Designer') to write style.css in the playground workspace.\n"
            "  5. JS Developer (e.g. 'JavaScript Programmer') to write script.js in the playground workspace.\n"
            "  6. A QA Verifier (e.g. 'Quality Verifier & Syntax Checker') to run syntax checks and balance the files.\n"
            "Ensure their roles and tasks explicitly state their domain of expertise and file responsibility. For non-coding general research, you must assign at least 3 specialized subagents.\n"
            "Output a JSON object containing the subagents list exactly in this format:\n"
            "{\n"
            "  \"subagents\": [\n"
            "     {\n"
            "       \"name\": \"Agent Name\",\n"
            "       \"role\": \"Role description\",\n"
            "       \"task\": \"The specific topic, query, or file-writing task this agent must perform. Be highly detailed.\"\n"
            "     }\n"
            "  ]\n"
            "}"
        )
        
        prompt = f"User Query: {query}\n"
        if specified_agent_count:
            prompt += f"You MUST use exactly {specified_agent_count} subagents, sir."
        else:
            prompt += "Use a minimum baseline of 3 subagents, sir."
            
        history = [{"role": "system", "content": system_instruction}]
        
        orchestration_response = await query_llm_proxied(prompt=prompt, model_key=model_key, history=history, user_id=user_id)
        
        # Parse output JSON
        try:
            clean_res = orchestration_response.strip()
            if clean_res.startswith("```json"):
                clean_res = clean_res[7:]
            if clean_res.endswith("```"):
                clean_res = clean_res[:-3]
            clean_res = clean_res.strip()
            
            swarm_data = json.loads(clean_res)
            subagents_list = swarm_data.get("subagents", [])
        except Exception as json_err:
            print(f"JSON parsing of swarm orchestration failed: {json_err}. Using default fallback agents.")
            subagents_list = [
                {"name": "Web Researcher", "role": "Searches for primary sources and factual details", "task": f"Research details on: {query}"},
                {"name": "Data Architect", "role": "Structures research data and blueprint", "task": f"Create design blueprint for: {query}"},
                {"name": "Developer Agent", "role": "Implements code structure", "task": f"Implement project files for: {query}"},
                {"name": "Fact Verifier", "role": "Cross-references sources and validates claims", "task": f"Verify correctness and test files for: {query}"}
            ]
            if specified_agent_count and specified_agent_count > 4:
                for idx in range(4, specified_agent_count):
                    subagents_list.append({"name": f"Swarm Assistant {idx-1}", "role": "Assists with task details", "task": f"Examine details on: {query}"})
            elif specified_agent_count and specified_agent_count < 4:
                subagents_list = subagents_list[:specified_agent_count]
                
        subagents = []
        # Add Main Agent (Orchestration) at index 0 (completed)
        subagents.append({
            "id": "agent-0",
            "name": "Main Agent",
            "role": "Orchestrating & Swarm Dispatcher",
            "task": "Analyze query, dispatch subagents, and organize execution track",
            "status": "completed",
            "logs": "Swarm successfully dispatched. Awaiting subagent outputs."
        })
        
        for idx, sa in enumerate(subagents_list):
            subagents.append({
                "id": f"agent-{idx + 1}",
                "name": sa.get("name", sa.get("role", f"Agent {idx + 1}")),
                "role": sa.get("role", "Specialized Agent"),
                "task": sa.get("task", query),
                "status": "pending",
                "logs": "Waiting to start..."
            })
            
        # Add Main Agent (Supervisor) at the end (pending)
        supervisor_idx = len(subagents_list) + 1
        subagents.append({
            "id": f"agent-{supervisor_idx}",
            "name": "Main Agent",
            "role": "Supervisor (QA & Compilation)",
            "task": "Review all subagent outputs, check project playground integration, and compile final presentation.",
            "status": "pending",
            "logs": "Awaiting all subagent completions."
        })
            
        active_swarm = {
            "task_id": task_id,
            "query": query,
            "status": "running",
            "subagents": subagents,
            "final_result": None
        }
        
        # Update database session
        update_session_active_swarm(session_id, user_id, active_swarm)
        
        # Initialize playground project and sync it locally
        from workspace_helpers import ensure_active_project
        active_project_box = [None]
        try:
            ensure_active_project(user_id, session_id, active_project_box)
            print(f"[+] Initialized active workspace project for swarm: {active_project_box[0].get('id') if active_project_box[0] else None}")
        except Exception as e:
            print(f"[-] Failed to initialize active project for swarm: {e}")
        
        # Step 2: Run subagents loops sequentially (including the Supervisor!)
        findings = ["" for _ in subagents]
        previous_findings_accumulator = ""
        
        for idx in range(1, len(subagents)):
            agent = subagents[idx]
            agent["status"] = "running"
            
            if idx == len(subagents) - 1:
                agent["logs"] = "Supervisor initiating review and playground verification..."
            else:
                agent["logs"] = "Agent loop started..."
                
            update_session_active_swarm(session_id, user_id, active_swarm)
            
            # Broadcast live status update
            chat_wss = manager.active_chats.get(user_id, [])
            for ws in chat_wss:
                try:
                    await ws.send_text(json.dumps({
                        "type": "swarm_update",
                        "session_id": session_id,
                        "active_swarm": active_swarm
                    }))
                except:
                    pass
            
            async def status_updater(status_text):
                agent["logs"] = status_text
                # Broadcast live status updates
                chat_wss = manager.active_chats.get(user_id, [])
                for ws in chat_wss:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "swarm_update",
                            "session_id": session_id,
                            "active_swarm": active_swarm
                        }))
                    except:
                        pass
                update_session_active_swarm(session_id, user_id, active_swarm)
                
            try:
                result = await run_subagent_loop(
                    task_id=task_id,
                    user_id=user_id,
                    session_id=session_id,
                    subagent=agent,
                    model_key=model_key,
                    on_status_update=status_updater,
                    bridge_mode=bridge_mode,
                    mobile_local_ip=mobile_local_ip,
                    active_project_box=active_project_box,
                    previous_findings=previous_findings_accumulator
                )
                findings[idx] = result
                agent["status"] = "completed"
                agent["logs"] = "Task complete."
                
                # Append to previous findings accumulator
                previous_findings_accumulator += f"\n--- Output of {agent['name']} ({agent['role']}) ---\n{result}\n"
            except Exception as loop_err:
                agent["status"] = "failed"
                agent["logs"] = f"Failed: {loop_err}"
                findings[idx] = f"Error executing agent task: {loop_err}"
                previous_findings_accumulator += f"\n--- Error of {agent['name']} ({agent['role']}) ---\nFailed: {loop_err}\n"
            finally:
                update_session_active_swarm(session_id, user_id, active_swarm)
                # Broadcast final update for this subagent
                chat_wss = manager.active_chats.get(user_id, [])
                for ws in chat_wss:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "swarm_update",
                            "session_id": session_id,
                            "active_swarm": active_swarm
                        }))
                    except:
                        pass
                        
        # Step 3: Finalize and Notify
        final_report = findings[-1]
        if not final_report or final_report.startswith("Error executing agent task:"):
            final_report = "### Swarm Findings\n" + previous_findings_accumulator
            
        active_swarm["status"] = "completed"
        active_swarm["final_result"] = final_report
        update_session_active_swarm(session_id, user_id, active_swarm)
        
        # Log final assistant message to chat
        log_message(session_id, "assistant", f"Sir, the background research task is finished. Here is the final compiled report:\n\n{final_report}")
        
        # Broadcast completed state
        chat_wss = manager.active_chats.get(user_id, [])
        for ws in chat_wss:
            try:
                await ws.send_text(json.dumps({
                    "type": "swarm_complete",
                    "session_id": session_id,
                    "task_id": task_id,
                    "final_report": final_report,
                    "active_swarm": active_swarm
                }))
            except:
                pass
                
    except Exception as outer_err:
        print(f"Swarm task execution failed: {outer_err}")
        try:
            active_swarm = {
                "task_id": task_id,
                "query": query,
                "status": "failed",
                "subagents": [],
                "final_result": f"Error executing swarm task: {outer_err}"
            }
            update_session_active_swarm(session_id, user_id, active_swarm)
            chat_wss = manager.active_chats.get(user_id, [])
            for ws in chat_wss:
                try:
                    await ws.send_text(json.dumps({
                        "type": "swarm_error",
                        "session_id": session_id,
                        "task_id": task_id,
                        "error": str(outer_err)
                    }))
                except:
                    pass
        except:
            pass
