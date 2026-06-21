# tool_schemas.py — Extracted tool JSON schemas for the VoxKage agent loop.
# These schemas define the function-calling interface exposed to the LLM.

TOOLS_SCHEMA = [
    # --- Web Search & Research ---
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web using DuckDuckGo for general knowledge, latest news, or current facts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query string."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": "Fetch a URL page and extract its main article text content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The absolute URL to fetch."}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search_parallel",
            "description": "Search the web using DuckDuckGo for multiple queries concurrently in parallel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "queries": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of query strings to search concurrently."
                    }
                },
                "required": ["queries"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch_parallel",
            "description": "Fetch multiple URLs concurrently in parallel and extract main text content from each.",
            "parameters": {
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of absolute URLs to fetch concurrently."
                    }
                },
                "required": ["urls"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "web_search_deep",
            "description": "Perform a deep web search that queries DuckDuckGo and concurrently crawls the top page contents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "browse_and_extract_tool",
            "description": "Navigate to a URL and extract text content. Falls back to search if URL is blank.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Target URL to fetch. Can be blank if query is provided."},
                    "query": {"type": "string", "description": "Optional search query fallback."}
                }
            }
        }
    },
    # --- Memory & RAG ---
    {
        "type": "function",
        "function": {
            "name": "query_rag",
            "description": "Search your own uploaded documents (PDFs, text files) semantically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query describing what to look for."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_indexed_documents",
            "description": "Retrieve a list of all permanently indexed files/documents in the RAG database, including their names, IDs, and chunk counts.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_indexed_document",
            "description": "Delete an indexed document from the RAG database by its document ID or filename to free up vector memory or prepare it for update.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "The unique UUID of the document to delete."},
                    "filename": {"type": "string", "description": "The exact name of the file to delete."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "remember_user",
            "description": "Save a personal fact, preference, or habit about the user autonomously.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": ["identity", "preferences", "habits", "notes"], "description": "Category of fact"},
                    "key": {"type": "string", "description": "Attribute name (e.g. name, location, favorite_song)"},
                    "value": {"type": "string", "description": "Value of the fact."}
                },
                "required": ["category", "key", "value"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "recall_user",
            "description": "Recall personal details or preferences from the user profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Topic keywords (e.g., location, spotify). Leave blank for full profile."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "forget_user",
            "description": "Delete a personal fact, preference, or habit from the user profile.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Category of fact"},
                    "key": {"type": "string", "description": "Attribute name"}
                },
                "required": ["category", "key"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "log_problem",
            "description": "Log an unsolved technical bug or hurdle with its context for self-learning.",
            "parameters": {
                "type": "object",
                "properties": {
                    "problem": {"type": "string", "description": "Short description of the bug/problem."},
                    "context": {"type": "string", "description": "Details about how it occurred."},
                    "attempted": {"type": "string", "description": "What was attempted to resolve it."}
                },
                "required": ["problem", "context"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "log_solution",
            "description": "Log the working solution for a previously logged problem ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "problem_id": {"type": "string", "description": "The ID of the problem returned by log_problem."},
                    "solution": {"type": "string", "description": "Description of the solution."},
                    "what_worked": {"type": "string", "description": "Summary of what worked."},
                    "prevention": {"type": "string", "description": "How to prevent this bug in the future."}
                },
                "required": ["problem_id", "solution", "what_worked"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_memory",
            "description": "Find relevant past experiences, problems, and solutions semantically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_frontend_snippet",
            "description": "Saves a useful frontend code snippet (HTML/CSS/JS) into VoxKage's permanent frontend memory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Short title."},
                    "code": {"type": "string", "description": "The code snippet."},
                    "description": {"type": "string", "description": "Why it's useful and how it works."},
                    "tags": {"type": "string", "description": "Comma-separated tags."}
                },
                "required": ["title", "code", "description", "tags"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_frontend_snippets",
            "description": "Searches the dedicated frontend memory for previously saved code snippets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keywords."}
                },
                "required": ["query"]
            }
        }
    },
    # --- Document Generation ---
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Creates a rich Word document (.docx), Spreadsheet (.xlsx), PowerPoint (.pptx), CSV, or plain text file server-side.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "Name of the file (e.g. report.docx)"},
                    "directory": {"type": "string", "description": "Target folder description or path. Defaults to Downloads."},
                    "content": {"type": "string", "description": "Content. Markdown table for excel, bullet structure for PPT, markdown text for Docx, raw text for text files."},
                    "file_type": {"type": "string", "enum": ["word", "excel", "pptx", "csv", "text", "auto"], "default": "auto"}
                },
                "required": ["filename", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "convert_file",
            "description": "Converts file formats server-side. Supports docx->txt, pdf->txt, xlsx->csv, csv->xlsx.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Absolute path or filename on server."},
                    "target_format": {"type": "string", "enum": ["txt", "csv", "xlsx", "docx"]},
                    "output_directory": {"type": "string", "description": "Target folder description or path."}
                },
                "required": ["file_path", "target_format"]
            }
        }
    },
    # --- Email (Gmail API) ---
    {
        "type": "function",
        "function": {
            "name": "check_email",
            "description": "Read the Gmail inbox or any folder/label, with optional search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Gmail search syntax query (e.g. from:boss)"},
                    "label": {"type": "string", "description": "Label to query (INBOX, UNREAD, SENT, etc.)", "default": "INBOX"},
                    "max_results": {"type": "integer", "description": "Max results to return.", "default": 5}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_email",
            "description": "Get the full text body of a specific email by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID from check_email."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": "Send an email through Gmail with to, subject, body, and optional cc/bcc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address."},
                    "subject": {"type": "string", "description": "Email subject."},
                    "body": {"type": "string", "description": "Plain text or HTML body."},
                    "cc": {"type": "string", "description": "Optional CC addresses."},
                    "bcc": {"type": "string", "description": "Optional BCC addresses."}
                },
                "required": ["to", "subject", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "save_draft",
            "description": "Save a Gmail draft for later sending.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address."},
                    "subject": {"type": "string", "description": "Draft subject."},
                    "body": {"type": "string", "description": "Draft body content."},
                    "cc": {"type": "string", "description": "Optional CC addresses."}
                },
                "required": ["to", "subject", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reply_to_email",
            "description": "Reply to an existing email thread in Gmail by its message ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID to reply to."},
                    "body": {"type": "string", "description": "The reply body text."}
                },
                "required": ["email_id", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_email",
            "description": "Move a specific email to the trash by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID to delete."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_emails_bulk",
            "description": "Delete multiple emails matching a Gmail search query in bulk.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Gmail search query to match emails to delete."},
                    "max_delete": {"type": "integer", "description": "Max emails to delete.", "default": 20}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_email_read",
            "description": "Mark a specific email as read.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_email_unread",
            "description": "Mark a specific email as unread.",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "archive_email",
            "description": "Archive a specific email (remove from inbox).",
            "parameters": {
                "type": "object",
                "properties": {
                    "email_id": {"type": "string", "description": "The message ID."}
                },
                "required": ["email_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_email_stats",
            "description": "Get inbox statistics: total, unread, sent counts.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    # --- GitHub API ---
    {
        "type": "function",
        "function": {
            "name": "github_get_profile",
            "description": "Fetch a GitHub user's profile information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "GitHub username. Leave blank for authenticated user."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_list_my_repos",
            "description": "List the authenticated user's GitHub repositories.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max repos to return.", "default": 10},
                    "sort": {"type": "string", "description": "Sort key: updated, created, pushed, full_name.", "default": "updated"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_create_repo",
            "description": "Create a new GitHub repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Repository name."},
                    "description": {"type": "string", "description": "Repository description."},
                    "private": {"type": "boolean", "description": "Whether the repo is private.", "default": True}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_actions_list",
            "description": "List recent GitHub Actions workflow runs for a repository.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Repository name (owner/repo format)."},
                    "limit": {"type": "integer", "description": "Max runs to return.", "default": 10}
                },
                "required": ["repo"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_actions_get",
            "description": "Get details of a specific GitHub Actions workflow run.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Repository name (owner/repo format)."},
                    "run_id": {"type": "string", "description": "The workflow run ID."}
                },
                "required": ["repo", "run_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "github_get_job_logs",
            "description": "Retrieve logs for a specific GitHub Actions job.",
            "parameters": {
                "type": "object",
                "properties": {
                    "repo": {"type": "string", "description": "Repository name (owner/repo format)."},
                    "job_id": {"type": "string", "description": "The job ID."}
                },
                "required": ["repo", "job_id"]
            }
        }
    },
    # --- Spotify (Remote Laptop Control) ---
    {
        "type": "function",
        "function": {
            "name": "search_spotify",
            "description": "Search Spotify for tracks, albums, artists, or playlists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query string."},
                    "type": {"type": "string", "description": "Type of search: track, album, artist, playlist.", "default": "track"},
                    "limit": {"type": "integer", "description": "Max results.", "default": 5}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "play_spotify_selection",
            "description": "Play a specific result number from the last Spotify search results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer", "description": "Result number from search (1-indexed)."}
                },
                "required": ["number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "play_user_playlist",
            "description": "Play one of the user's named Spotify playlists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "playlist_name": {"type": "string", "description": "Name of the playlist to play (e.g., 'scenarios', 'true end???')."}
                },
                "required": ["playlist_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "media_control",
            "description": "Control media playback: play, pause, next, previous, shuffle, repeat, volume.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["play", "pause", "next", "previous", "shuffle", "repeat", "volume_up", "volume_down", "mute"], "description": "Playback action."}
                },
                "required": ["action"]
            }
        }
    },
    # --- Laptop Remote Execution ---
    {
        "type": "function",
        "function": {
            "name": "laptop_command",
            "description": "Execute a PowerShell command on the user's connected Windows laptop via the VoxKage Laptop Daemon.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "PowerShell command to execute remotely."}
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_application",
            "description": "Open an installed application on the user's connected laptop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "Application name (e.g. Chrome, Discord, VS Code)."}
                },
                "required": ["app_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "close_application",
            "description": "Close a running application on the user's connected laptop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "Application name to close."}
                },
                "required": ["app_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_datetime",
            "description": "Get the current date and time.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    # --- Workspace / Code Playground ---
    {
        "type": "function",
        "function": {
            "name": "workspace_list_files",
            "description": "List all files currently present in the active code playground workspace.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_read_file",
            "description": "Read and retrieve the full contents of a workspace file by its relative path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative file path within the workspace."}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_write_file",
            "description": "Create or overwrite a file in the active workspace with specified content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative file path within the workspace."},
                    "content": {"type": "string", "description": "Full content to write to the file."}
                },
                "required": ["file_path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_edit_file",
            "description": "Edit a workspace file by search-and-replace. Replaces only the first matching occurrence of search_content with replace_content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative file path."},
                    "search_content": {"type": "string", "description": "Exact text block to find and replace."},
                    "replace_content": {"type": "string", "description": "Replacement text block."}
                },
                "required": ["file_path", "search_content", "replace_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_delete_file",
            "description": "Delete a file from the active workspace by its relative path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative file path."}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "workspace_syntax_check",
            "description": "Run a syntax check on a workspace file (HTML tag matching, JS bracket balancing, CSS brace matching).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Relative file path to check."}
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compact_chat_history",
            "description": "Compact the chat history into a dense summary, reducing the context window memory usage.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_matplotlib_script",
            "description": "Execute a Python script containing matplotlib plotting commands, capture the resulting figure, and return it as a base64-encoded markdown image tag directly in the chat response. Use this when the user requests a chart, plot, regression line, or machine learning visualization. The code should plot on plt (matplotlib.pyplot) and do NOT call plt.show() or plt.savefig() as the tool will capture and close the plot automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The python code containing matplotlib/numpy/pandas/scikit-learn operations and plotting commands (e.g. plt.plot(...))."},
                    "title": {"type": "string", "description": "A short descriptive title for the image alt text."}
                },
                "required": ["code", "title"]
            }
        }
    },
    # --- Mobile Device Control Tools ---
    {
        "type": "function",
        "function": {
            "name": "mobile_get_contacts",
            "description": "Fetch/query the user's phone contact book, sir. Supports searching by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Optional name string to filter contacts."},
                    "limit": {"type": "integer", "description": "Max contacts to fetch.", "default": 50}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_create_contact",
            "description": "Insert a new contact card into the user's phone contact book, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "firstName": {"type": "string", "description": "First name of the contact."},
                    "lastName": {"type": "string", "description": "Optional last name."},
                    "phone": {"type": "string", "description": "Phone number."},
                    "email": {"type": "string", "description": "Optional email address."}
                },
                "required": ["firstName"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_calendar_events",
            "description": "Read scheduled events from the user's phone calendar between dates, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "startDate": {"type": "string", "description": "ISO date string (e.g. 2026-06-20T10:00:00Z). Defaults to now."},
                    "endDate": {"type": "string", "description": "ISO date string. Defaults to 7 days from now."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_create_calendar_event",
            "description": "Add a new calendar meeting or event on the user's phone calendar, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Event title."},
                    "startDate": {"type": "string", "description": "ISO date string of start time."},
                    "endDate": {"type": "string", "description": "ISO date string of end time."},
                    "location": {"type": "string", "description": "Optional event location."},
                    "notes": {"type": "string", "description": "Optional meeting notes or description."}
                },
                "required": ["title", "startDate", "endDate"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_show_notification",
            "description": "Show a local push notification alert on the user's phone, sir. Can be scheduled with delay.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Notification title."},
                    "body": {"type": "string", "description": "Notification description/body message."},
                    "delaySeconds": {"type": "integer", "description": "Optional delay in seconds before showing."}
                },
                "required": ["title", "body"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_location",
            "description": "Fetch the user's current GPS location coordinates (latitude and longitude) from the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_device_stats",
            "description": "Get current battery level, battery state, network connection type, and hardware model specifications of the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_trigger_haptic",
            "description": "Trigger tactile vibration feedback (buzz) on the user's phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "style": {"type": "string", "enum": ["light", "medium", "heavy", "success", "warning", "error"], "default": "medium"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_launch_intent",
            "description": "Android-specific tool to trigger standard intents like opening settings, Wi-Fi, location, maps, or calling, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "description": "Intent action settings/wifi/location or generic intent string."},
                    "data": {"type": "string", "description": "Optional intent data (e.g. geo:12.9716,77.5946 or tel:9876543210)."}
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_share_file",
            "description": "Share a file path or URL via native share sheet on the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "uri": {"type": "string", "description": "Local URI or web URL to share."},
                    "title": {"type": "string", "description": "Optional title for share dialog."},
                    "mimeType": {"type": "string", "description": "Optional file MIME type."}
                },
                "required": ["uri"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_print_pdf",
            "description": "Render HTML text or code to PDF and trigger printing on the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "html": {"type": "string", "description": "HTML content to render."},
                    "printDirectly": {"type": "boolean", "description": "Whether to launch print dialog directly.", "default": False}
                },
                "required": ["html"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_send_sms",
            "description": "Send an SMS text message to one or more phone numbers from the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "recipients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of phone numbers."
                    },
                    "message": {"type": "string", "description": "Text message content."}
                },
                "required": ["recipients", "message"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_set_screen_keep_awake",
            "description": "Enable or disable keeping the screen awake indefinitely on the phone, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "enable": {"type": "boolean", "description": "True to activate keep-awake, False to deactivate."}
                },
                "required": ["enable"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_speak_text",
            "description": "Speak text aloud using the device's native Text-to-Speech (TTS) engine, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The text to synthesize and read aloud."},
                    "language": {"type": "string", "description": "Language code. Defaults to 'en'."},
                    "pitch": {"type": "number", "description": "Vocal pitch scale (0.5 to 2.0)."},
                    "rate": {"type": "number", "description": "Vocal speaking rate speed (0.5 to 2.0)."}
                },
                "required": ["text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mobile_get_media_library",
            "description": "Retrieve recent photo assets metadata from the user's phone media library, sir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Max assets to return. Defaults to 10.", "default": 10}
                }
            }
        }
    }
]
