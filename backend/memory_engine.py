import os
import json
from datetime import datetime
from fastapi import HTTPException
from database import get_db
from rag_engine import get_embedding_model

# --- Track 1: User Soul (Personalization) ---

def remember_user(user_id: str, category: str, key: str, value: str) -> str:
    db = get_db()
    cat = category.lower().strip()
    
    # Upsert data using unique constraint (user_id, category, key)
    data = {
        "user_id": user_id,
        "category": cat,
        "key": key,
        "value": value,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    res = db.table("user_memories").upsert(
        data, 
        on_conflict="user_id,category,key"
    ).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save user memory.")
    return f"[SOUL] Remembered: {category}.{key} = \"{value}\""

def recall_user(user_id: str, query: str = "") -> str:
    db = get_db()
    
    # Fetch all user memories for this user
    query_builder = db.table("user_memories").select("*").eq("user_id", user_id)
    res = query_builder.execute()
    memories = res.data or []
    
    if not memories:
        return "[SOUL] No user profile data saved yet."

    # Simple keyword filtering if query is provided
    filtered = []
    query_words = query.lower().split()
    for m in memories:
        if not query_words:
            filtered.append(m)
            continue
        text = f"{m['category']} {m['key']} {m['value']}".lower()
        if any(word in text for word in query_words):
            filtered.append(m)
            
    if not filtered:
        return f"[SOUL] No user facts found matching '{query}'."

    # Format list
    lines = ["[SOUL] Relevant User Profile Details:"]
    for m in filtered[:12]: # Limit to 12 items for token efficiency
        lines.append(f"  • {m['category']}.{m['key']}: {m['value']}")
        
    return "\n".join(lines)

def get_user_profile(user_id: str) -> str:
    db = get_db()
    res = db.table("user_memories").select("*").eq("user_id", user_id).execute()
    memories = res.data or []
    
    if not memories:
        return "[SOUL] No user profile data saved yet."
        
    categories = {}
    for m in memories:
        cat = m["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(f"{m['key']}: {m['value']}")
        
    lines = ["[SOUL] Complete User Profile:\n"]
    for cat, items in categories.items():
        lines.append(f"=== {cat.capitalize()} ===")
        for item in items:
            lines.append(f"  {item}")
        lines.append("")
        
    return "\n".join(lines)

def forget_user(user_id: str, category: str, key: str) -> str:
    db = get_db()
    res = db.table("user_memories").delete().eq("user_id", user_id).eq("category", category.lower()).eq("key", key).execute()
    if not res.data:
        return f"[SOUL] No entry found for {category}.{key}."
    return f"[SOUL] Removed {category}.{key} from user profile."

def set_trusted_action(user_id: str, action_key: str, trusted: bool, reason: str = "") -> str:
    val = {
        "trusted": trusted,
        "reason": reason or ("user pre-approved" if trusted else "requires verification"),
        "set_at": datetime.utcnow().isoformat()
    }
    return remember_user(user_id, "trusted_actions", action_key, json.dumps(val))

def check_trusted(user_id: str, action_key: str) -> str:
    db = get_db()
    res = db.table("user_memories").select("*").eq("user_id", user_id).eq("category", "trusted_actions").eq("key", action_key).execute()
    if not res.data:
        return f"not_trusted\nAction '{action_key}' requires normal confirmation."
        
    try:
        val = json.loads(res.data[0]["value"])
        if val.get("trusted"):
            return (
                f"trusted\n"
                f"Action '{action_key}' is pre-approved.\n"
                f"Reason: {val.get('reason')}\n"
                f"Proceed without asking for confirmation."
            )
    except:
        pass
    return f"not_trusted\nAction '{action_key}' requires normal confirmation."


# --- Track 2: Problem/Solution Self-Learning ---

def log_problem(user_id: str, problem: str, context: str, attempted: str = "") -> str:
    db = get_db()
    
    # Generate vector embedding for semantic search
    model = get_embedding_model()
    emb = model.encode(f"Problem: {problem}\nContext: {context}\nAttempted: {attempted}").tolist()
    
    data = {
        "problem": problem,
        "context": context,
        "attempted": attempted,
        "status": "unsolved",
        "user_id": user_id,
        "embedding": emb,
        "created_at": datetime.utcnow().isoformat()
    }
    
    res = db.table("problem_memories").insert(data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to log problem.")
        
    return res.data[0]["id"]

def log_solution(user_id: str, problem_id: str, solution: str, what_worked: str, prevention: str = "") -> str:
    db = get_db()
    
    # Fetch original problem to re-embed the completed details
    res_prob = db.table("problem_memories").select("*").eq("id", problem_id).eq("user_id", user_id).execute()
    if not res_prob.data:
        raise HTTPException(status_code=404, detail="Problem memory entry not found.")
        
    prob = res_prob.data[0]
    
    model = get_embedding_model()
    emb = model.encode(
        f"Problem: {prob['problem']}\nContext: {prob['context']}\n"
        f"Solution: {solution}\nWhat worked: {what_worked}\nPrevention: {prevention}"
    ).tolist()
    
    data = {
        "solution": solution,
        "what_worked": what_worked,
        "prevention": prevention,
        "status": "solved",
        "embedding": emb,
        "solved_at": datetime.utcnow().isoformat()
    }
    
    res = db.table("problem_memories").update(data).eq("id", problem_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to record solution.")
        
    return f"[MEMORY] Solution recorded for '{problem_id}'."

def search_memory(user_id: str, query: str, top_k: int = 3, threshold: float = 0.45) -> str:
    """
    Find relevant past experiences and solutions.
    """
    model = get_embedding_model()
    query_vector = model.encode(query).tolist()
    
    db = get_db()
    params = {
        "query_embedding": query_vector,
        "match_threshold": threshold,
        "match_count": top_k,
        "filter_user_id": user_id
    }
    
    try:
        res = db.rpc("match_problems", params).execute()
        memories = res.data or []
    except Exception as e:
        print(f"⚠️ Problem Search Error: {e}")
        return "[MEMORY] Search query failed."

    if not memories:
        return "[MEMORY] No relevant past learnings found. Proceed normally."
        
    lines = [f"[MEMORY] Found {len(memories)} past experiences/solutions:"]
    for i, m in enumerate(memories, 1):
        lines.append(f"--- Experience #{i} [{m['status'].upper()}] ---")
        lines.append(f"Problem: {m['problem']}")
        if m.get("solution"):
            lines.append(f"Solution: {m['solution']}")
        if m.get("prevention"):
            lines.append(f"Prevention: {m['prevention']}")
        lines.append("")
        
    return "\n".join(lines)
