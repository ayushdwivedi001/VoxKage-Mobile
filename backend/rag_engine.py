import os
import re
from fastapi import HTTPException
from database import get_db

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

def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list:
    """
    Split text into overlapping chunks.
    """
    chunks = []
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    
    start = 0
    text_len = len(text)
    
    if text_len <= chunk_size:
        return [text]
        
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end]
        chunks.append(chunk)
        start += (chunk_size - overlap)
        
    return chunks

def extract_text_from_file(file_path: str) -> str:
    """
    Load raw text from documents. Supports basic text files and PDFs if pypdf is available.
    """
    _, ext = os.path.splitext(file_path.lower())
    
    if ext in [".txt", ".md", ".json", ".csv"]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
            
    elif ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(file_path)
            text_list = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(text_list)
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="PDF parser 'pypdf' is not installed. Please add it to requirements."
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")
            
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}' for RAG parsing."
        )

def index_file_in_rag(file_path: str, filename: str, user_id: str) -> dict:
    """
    Extracts text, chunks it, generates vector embeddings, and pushes it to Supabase pgvector table.
    """
    text = extract_text_from_file(file_path)
    chunks = chunk_text(text)
    
    if not chunks:
        return {"status": "ignored", "reason": "No text content found in file."}
        
    model = get_embedding_model()
    embeddings = model.encode(chunks)
    
    db = get_db()
    
    records = []
    for i, chunk in enumerate(chunks):
        records.append({
            "filename": filename,
            "content": chunk,
            "embedding": embeddings[i].tolist(), # Convert numpy array to standard list
            "user_id": user_id
        })
        
    res = db.table("rag_documents").insert(records).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save document chunks into database.")
        
    return {"status": "success", "chunks_indexed": len(chunks), "filename": filename}

def query_rag_vector(query: str, user_id: str, top_k: int = 3, threshold: float = 0.45) -> list:
    """
    Computes query embeddings and calls match_documents RPC function in Supabase.
    """
    model = get_embedding_model()
    query_vector = model.encode(query).tolist()
    
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
