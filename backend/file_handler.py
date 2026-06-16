import os
import shutil
import re
from fastapi import UploadFile, HTTPException

UPLOAD_DIR = "/app/data/uploads" if os.path.exists("/app") else "./data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_FILE_SIZE_MB = 10  # Max upload size 10MB

def sanitize_filename(filename: str) -> str:
    """
    Remove path traversal sequences and unwanted characters.
    """
    # Keep alphanumeric, dots, dashes, and underscores
    clean = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    # Prevent path traversal
    clean = os.path.basename(clean)
    return clean

def save_upload(file: UploadFile) -> str:
    """
    Validates size, sanitizes filename, and writes file to uploads directory.
    Returns the absolute file path.
    """
    clean_name = sanitize_filename(file.filename)
    file_path = os.path.join(UPLOAD_DIR, clean_name)

    # Validate size by reading a chunk and checking
    size = 0
    try:
        with open(file_path, "wb") as buffer:
            # Read in 1MB chunks
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_FILE_SIZE_MB * 1024 * 1024:
                    # Clean up partial write
                    buffer.close()
                    os.unlink(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum size limit of {MAX_FILE_SIZE_MB}MB."
                    )
                buffer.write(chunk)
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    return file_path

def delete_file(file_path: str):
    """
    Delete a file from storage safely.
    """
    try:
        if os.path.exists(file_path):
            os.unlink(file_path)
    except Exception as e:
        print(f"Error deleting file {file_path}: {e}")

def clear_all_uploads():
    """
    Clear all stored uploads.
    """
    for name in os.listdir(UPLOAD_DIR):
        file_path = os.path.join(UPLOAD_DIR, name)
        try:
            if os.path.isfile(file_path):
                os.unlink(file_path)
        except Exception as e:
            print(f"Error clearing upload {file_path}: {e}")
