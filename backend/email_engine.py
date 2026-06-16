import os
import json
import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

# Paths
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_PATH = os.path.join(BACKEND_DIR, 'credentials.json')
TOKEN_PATH = os.path.join(BACKEND_DIR, 'gmail_token.json')

_email_cache = {}

def get_gmail_service():
    """
    Authenticates and returns the Gmail API service.
    First tries loading from environment variables: GOOGLE_GMAIL_TOKEN and GOOGLE_CREDENTIALS.
    Failing that, falls back to credentials.json and gmail_token.json files in the backend directory.
    """
    creds = None
    
    # 1. Try environment variables (for serverless cloud deployments)
    env_token = os.getenv("GOOGLE_GMAIL_TOKEN")
    env_creds = os.getenv("GOOGLE_CREDENTIALS")
    
    if env_token:
        try:
            token_info = json.loads(env_token)
            creds = Credentials.from_authorized_user_info(token_info, SCOPES)
            logger.info("Loaded Gmail credentials from environment variable token.")
        except Exception as e:
            logger.error(f"Failed to load GOOGLE_GMAIL_TOKEN from environment: {e}")

    # 2. Try local files
    if not creds:
        if os.path.exists(TOKEN_PATH):
            try:
                creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
                logger.info("Loaded Gmail credentials from local token file.")
            except Exception as e:
                logger.error(f"Error loading gmail token file: {e}")

    # 3. Refresh or authenticate if credentials are not valid
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                logger.info("Refreshed expired Gmail credentials.")
            except Exception as e:
                logger.error(f"Failed to refresh Gmail token: {e}")
                creds = None
                
        if not creds:
            if env_creds:
                try:
                    client_config = json.loads(env_creds)
                    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
                    # Note: run_local_server won't work headlessly on HF spaces. 
                    # If this happens, we must raise a clear auth exception.
                    raise Exception("Gmail token expired/missing. Please authenticate via local desktop VoxKage first.")
                except Exception as e:
                    raise Exception(f"Failed to initialize auth flow from environment: {e}")
            elif os.path.exists(CREDENTIALS_PATH):
                raise Exception("Gmail token expired/missing. Please launch VoxKage on your desktop to complete OAuth login, sir.")
            else:
                raise FileNotFoundError("Missing Google OAuth credentials (credentials.json/gmail_token.json). Please check setup.")

        # Save refreshed/new token if we have a path to write to
        try:
            if os.path.exists(os.path.dirname(TOKEN_PATH)):
                with open(TOKEN_PATH, 'w') as token:
                    token.write(creds.to_json())
        except Exception as e:
            logger.error(f"Could not save refreshed token to disk: {e}")

    return build('gmail', 'v1', credentials=creds)

def check_email(query: str = "", label: str = "INBOX", max_results: int = 5) -> str:
    """Reads inbox or searches, returning metadata and caching contents."""
    global _email_cache
    try:
        service = get_gmail_service()
        
        q = query
        label_ids = []
        if label.upper() == "UNREAD":
            q = f"is:unread {query}".strip()
            label_ids = ["INBOX"]
        elif label.upper() == "INBOX":
            label_ids = ["INBOX"]
        elif label.upper() != "":
            label_ids = [label.upper()]

        results = service.users().messages().list(userId='me', labelIds=label_ids, q=q, maxResults=max_results).execute()
        messages = results.get('messages', [])

        if not messages:
            return f"No emails found matching query '{query}' in label '{label}'."

        output = []
        for i, msg in enumerate(messages):
            msg_id = msg['id']
            full_msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            
            headers = full_msg.get('payload', {}).get('headers', [])
            subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), 'No Subject')
            sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown Sender')
            snippet = full_msg.get('snippet', '')
            
            body_text = ""
            payload = full_msg.get('payload', {})
            
            def _extract_text(parts):
                text = ""
                for part in parts:
                    if part.get('mimeType') == 'text/plain':
                        data = part.get('body', {}).get('data')
                        if data:
                            text += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                    elif part.get('parts'):
                        text += _extract_text(part.get('parts'))
                return text
            
            if payload.get('mimeType') == 'text/plain':
                data = payload.get('body', {}).get('data')
                if data:
                    body_text = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            else:
                body_text = _extract_text(payload.get('parts', []))
            
            _email_cache[msg_id] = {
                "subject": subject,
                "sender": sender,
                "snippet": snippet,
                "body": body_text or snippet,
            }
            
            output.append(f"[{i+1}] ID: {msg_id} | From: {sender} | Subj: {subject} | Snippet: {snippet}")
            
        return "Found Emails:\n" + "\n".join(output)

    except Exception as e:
        logger.error(f"Gmail read error: {e}")
        return f"Failed to check Gmail: {str(e)}"

def read_email(email_id: str) -> str:
    """Retrieves full text of a specific email by ID."""
    global _email_cache
    if email_id in _email_cache:
        data = _email_cache[email_id]
        return f"From: {data['sender']}\nSubject: {data['subject']}\n\n{data['body']}"
    
    try:
        service = get_gmail_service()
        msg = service.users().messages().get(userId='me', id=email_id, format='full').execute()
        snippet = msg.get('snippet', '')
        
        headers = msg.get('payload', {}).get('headers', [])
        subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), 'No Subject')
        sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown Sender')
        
        body_text = ""
        payload = msg.get('payload', {})
        def _extract_text(parts):
            text = ""
            for part in parts:
                if part.get('mimeType') == 'text/plain':
                    data = part.get('body', {}).get('data')
                    if data:
                        text += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                elif part.get('parts'):
                    text += _extract_text(part.get('parts'))
            return text
        
        if payload.get('mimeType') == 'text/plain':
            data = payload.get('body', {}).get('data')
            if data:
                body_text = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        else:
            body_text = _extract_text(payload.get('parts', []))
            
        return f"From: {sender}\nSubject: {subject}\n\n{body_text or snippet}"
    except Exception as e:
        return f"Failed to get email summary: {str(e)}"

def send_email(to: str, subject: str, body: str, cc: str = "", bcc: str = "") -> str:
    """Sends an email."""
    try:
        service = get_gmail_service()
        message = MIMEMultipart()
        message["to"] = to
        message["subject"] = subject
        if cc:
            message["cc"] = cc
        if bcc:
            message["bcc"] = bcc
        message.attach(MIMEText(body, "plain"))
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return f"✅ Email sent successfully, sir.\n   To      : {to}\n   Subject : {subject}"
    except Exception as e:
        return f"❌ Failed to send email: {e}"

def save_draft(to: str, subject: str, body: str, cc: str = "") -> str:
    """Saves a draft email."""
    try:
        service = get_gmail_service()
        message = MIMEMultipart()
        message["to"] = to
        message["subject"] = subject
        if cc:
            message["cc"] = cc
        message.attach(MIMEText(body, "plain"))
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        draft = service.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
        return f"📝 Draft saved, sir.\n   Draft ID : {draft['id']}\n   To       : {to}\n   Subject  : {subject}"
    except Exception as e:
        return f"❌ Failed to save draft: {e}"

def reply_to_email(email_id: str, body: str) -> str:
    """Replies to an existing email thread."""
    try:
        service = get_gmail_service()
        original = service.users().messages().get(userId="me", id=email_id, format="full").execute()
        headers = original.get("payload", {}).get("headers", [])
        subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "Re: (no subject)")
        sender = next((h["value"] for h in headers if h["name"].lower() == "from"), "")
        thread_id = original.get("threadId", "")

        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        message = MIMEText(body)
        message["to"] = sender
        message["subject"] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw, "threadId": thread_id}).execute()
        return f"✅ Reply sent to {sender}."
    except Exception as e:
        return f"❌ Failed to send reply: {e}"

def delete_email(email_id: str) -> str:
    """Deletes a specific email by moving it to trash."""
    try:
        service = get_gmail_service()
        service.users().messages().trash(userId="me", id=email_id).execute()
        return f"🗑️ Email {email_id} moved to Trash."
    except Exception as e:
        return f"❌ Failed to delete email: {e}"

def delete_emails_bulk(query: str, max_delete: int = 20) -> str:
    """Deletes multiple emails matching query."""
    try:
        max_delete = min(max_delete, 50)
        service = get_gmail_service()
        results = service.users().messages().list(userId="me", q=query, maxResults=max_delete).execute()
        messages = results.get("messages", [])
        if not messages:
            return f"No emails found matching '{query}'."

        ids = [m["id"] for m in messages]
        service.users().messages().batchModify(userId="me", body={"ids": ids, "addLabelIds": ["TRASH"]}).execute()
        return f"🗑️ {len(ids)} email(s) moved to Trash (query: '{query}')."
    except Exception as e:
        return f"❌ Failed to bulk delete: {e}"

def mark_email_read(email_id: str) -> str:
    """Marks email as read."""
    try:
        service = get_gmail_service()
        service.users().messages().modify(userId="me", id=email_id, body={"removeLabelIds": ["UNREAD"]}).execute()
        return f"✅ Email {email_id} marked as read."
    except Exception as e:
        return f"❌ Failed to mark as read: {e}"

def mark_email_unread(email_id: str) -> str:
    """Marks email as unread."""
    try:
        service = get_gmail_service()
        service.users().messages().modify(userId="me", id=email_id, body={"addLabelIds": ["UNREAD"]}).execute()
        return f"✅ Email {email_id} marked as unread."
    except Exception as e:
        return f"❌ Failed to mark as unread: {e}"

def archive_email(email_id: str) -> str:
    """Archives an email."""
    try:
        service = get_gmail_service()
        service.users().messages().modify(userId="me", id=email_id, body={"removeLabelIds": ["INBOX"]}).execute()
        return f"📦 Email {email_id} archived."
    except Exception as e:
        return f"❌ Failed to archive: {e}"

def get_email_stats() -> str:
    """Returns inbox stats."""
    try:
        service = get_gmail_service()
        labels_to_check = {
            "INBOX": "Inbox total",
            "UNREAD": "Unread",
            "SPAM": "Spam",
            "CATEGORY_PROMOTIONS": "Promotions",
            "CATEGORY_SOCIAL": "Social",
            "CATEGORY_UPDATES": "Updates",
        }
        lines = ["📊 Gmail Stats:"]
        for label_id, label_name in labels_to_check.items():
            try:
                result = service.users().messages().list(userId='me', labelIds=[label_id], maxResults=1).execute()
                count = result.get("resultSizeEstimate", 0)
                lines.append(f"   {label_name:20s}: ~{count}")
            except Exception:
                pass
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Failed to get stats: {e}"
