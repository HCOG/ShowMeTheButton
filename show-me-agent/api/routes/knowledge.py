"""
Knowledge base management endpoints.
POST /api/v1/knowledge/ingest  — trigger ingestion from docs/ directory
GET  /api/v1/knowledge/status  — how many chunks are indexed
GET  /api/v1/knowledge/search  — debug: run a raw semantic search
"""
import os
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

DOCS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs")


class IngestResponse(BaseModel):
    success: bool
    message: str
    chunks_total: Optional[int] = None


@router.get("/status")
async def knowledge_status():
    try:
        import engine.rag as rag_module
        raw = os.getenv("CHROMA_DB_PATH", rag_module.DEFAULT_DB_PATH)
        db_path = os.path.abspath(raw)
        col = rag_module._get_collection()
        size = col.count()
        return {"indexed_chunks": size, "ready": size > 0, "db_path": db_path}
    except Exception as e:
        import traceback
        return {"indexed_chunks": 0, "ready": False, "error": str(e), "trace": traceback.format_exc()}


@router.post("/ingest", response_model=IngestResponse)
async def ingest_knowledge(background_tasks: BackgroundTasks, force: bool = False):
    """
    Trigger knowledge base ingestion in the background.
    Returns immediately; poll /status to track progress.
    """
    try:
        from engine.rag import collection_size
        size = collection_size()
        if size > 0 and not force:
            return IngestResponse(
                success=True,
                message=f"Already indexed ({size} chunks). Use ?force=true to re-ingest.",
                chunks_total=size,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    background_tasks.add_task(_run_ingest, force)
    return IngestResponse(success=True, message="Ingestion started in background. Poll /status for progress.")


async def _run_ingest(force: bool):
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from scripts.ingest import ingest_docs
    ingest_docs(DOCS_PATH, force=force)


@router.get("/search")
async def debug_search(q: str = Query(..., description="Search query"), n: int = 3):
    """Debug endpoint: run a raw semantic search and return matching chunks."""
    try:
        from engine.rag import search
        results = search(q, n_results=n)
        return {"query": q, "results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
