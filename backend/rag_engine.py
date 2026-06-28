import os
import re
from fastapi import HTTPException
from database import get_db
from rag_parser import chunk_text, extract_text_async

# Cache the model to avoid loading it on every import
_model = None

def get_embedding_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            # MiniLM-L6-v2 is fast, accurate, and yields 384 dimensions
            _model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Could not load SentenceTransformer embedding model: {str(e)}"
            )
    return _model

async def index_file_in_rag(file_path: str, filename: str, user_id: str, document_id: str = None, model: str = None) -> dict:
    """
    Extracts text, chunks it, generates vector embeddings, and pushes it to Supabase pgvector table.
    """
    text = await extract_text_async(file_path, model=model)
    chunks = chunk_text(text)
    
    if not chunks:
        return {"status": "ignored", "reason": "No text content found in file."}
        
    model = get_embedding_model()
    embeddings = model.encode(chunks)
    
    db = get_db()
    
    records = []
    for i, chunk in enumerate(chunks):
        record = {
            "filename": filename,
            "content": chunk,
            "embedding": embeddings[i].tolist() if hasattr(embeddings[i], "tolist") else list(embeddings[i]),
            "user_id": user_id
        }
        if document_id:
            record["document_id"] = document_id
        records.append(record)
        
    res = db.table("rag_documents").insert(records).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save document chunks into database.")
        
    return {
        "status": "success",
        "chunks_indexed": len(chunks),
        "filename": filename,
        "document_id": document_id
    }

def query_rag_vector(query: str, user_id: str, top_k: int = 3, threshold: float = 0.20) -> list:
    """
    Computes query embeddings and calls match_documents RPC function in Supabase.
    """
    model = get_embedding_model()
    query_enc = model.encode(query)
    query_vector = query_enc.tolist() if hasattr(query_enc, "tolist") else list(query_enc)
    
    db = get_db()
    
    # RPC parameters must match the signature defined in PostgreSQL function
    params = {
        "query_embedding": query_vector,
        "match_threshold": threshold,
        "match_count": top_k,
        "filter_user_id": user_id
    }
    
    try:
        res = db.rpc("match_documents", params).execute()
        return res.data or []
    except Exception as e:
        print(f"⚠️ RAG Query Error: {e}")
        return []

def query_scoped_rag_vector(query: str, user_id: str, document_id: str, top_k: int = 5, threshold: float = 0.10) -> list:
    """
    Computes query embeddings and calls match_document_chunks RPC function in Supabase.
    """
    model = get_embedding_model()
    query_enc = model.encode(query)
    query_vector = query_enc.tolist() if hasattr(query_enc, "tolist") else list(query_enc)
    
    db = get_db()
    
    # RPC parameters must match the signature defined in PostgreSQL function
    params = {
        "query_embedding": query_vector,
        "match_threshold": threshold,
        "match_count": top_k,
        "filter_user_id": user_id,
        "filter_document_id": document_id
    }
    
    try:
        res = db.rpc("match_document_chunks", params).execute()
        return res.data or []
    except Exception as e:
        print(f"⚠️ Scoped RAG Query Error: {e}")
        return []

def list_rag_documents(user_id: str) -> list:
    """
    Retrieves a list of all unique documents indexed in the RAG database for the given user,
    including their filenames, document_ids, and chunk counts.
    """
    db = get_db()
    try:
        res = db.table("rag_documents") \
            .select("filename, document_id") \
            .eq("user_id", user_id) \
            .execute()
        
        records = res.data or []
        if not records:
            return []
            
        summary = {}
        for r in records:
            doc_id = r.get("document_id")
            filename = r.get("filename")
            key = (doc_id, filename)
            if key not in summary:
                summary[key] = 0
            summary[key] += 1
            
        result = []
        for (doc_id, filename), chunk_count in summary.items():
            result.append({
                "document_id": doc_id,
                "filename": filename,
                "chunks_indexed": chunk_count
            })
        return result
    except Exception as e:
        print(f"⚠️ Error listing RAG documents: {e}")
        return []

def delete_rag_document(user_id: str, document_id: str | None = None, filename: str | None = None) -> dict:
    """
    Deletes all vector chunks associated with a specific document_id or filename for the given user.
    """
    if not document_id and not filename:
        return {"status": "error", "message": "Either document_id or filename must be provided."}
        
    db = get_db()
    try:
        query = db.table("rag_documents").delete().eq("user_id", user_id)
        if document_id:
            query = query.eq("document_id", document_id)
        if filename:
            query = query.eq("filename", filename)
            
        res = query.execute()
        deleted_count = len(res.data) if res.data else 0
        return {
            "status": "success",
            "message": "Successfully deleted RAG document chunks.",
            "chunks_removed": deleted_count,
            "document_id": document_id,
            "filename": filename
        }
    except Exception as e:
        print(f"⚠️ Error deleting RAG document: {e}")
        return {"status": "error", "message": f"Failed to delete document chunks: {str(e)}"}

