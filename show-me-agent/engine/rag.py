"""
RAG retrieval engine using ChromaDB persistent (embedded) mode.
Stores vector DB on disk at CHROMA_DB_PATH (default: ../knowledge-base/chroma).

Embedding: always uses chromadb's built-in all-MiniLM-L6-v2 (ONNX, ~80 MB,
downloaded once). This ensures ingest and query always use the same model.

MiniMax / OpenAI embeddings are intentionally NOT used here — the LLM call
itself already uses those APIs; keeping embeddings local avoids a second
cloud dependency and eliminates the ingest/query EF mismatch problem.
"""
import os
import chromadb
from typing import List, Optional

COLLECTION_NAME = "show_me_knowledge"
DEFAULT_DB_PATH = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "knowledge-base", "chroma")
)

_client: Optional[chromadb.PersistentClient] = None
_collection = None


def _get_collection():
    global _client, _collection
    if _collection is not None:
        return _collection

    raw = os.getenv("CHROMA_DB_PATH", DEFAULT_DB_PATH)
    db_path = os.path.normpath(os.path.abspath(raw))
    os.makedirs(db_path, exist_ok=True)

    _client = chromadb.PersistentClient(path=db_path)

    # Use chromadb's default embedding (all-MiniLM-L6-v2 via ONNX runtime).
    # NOT passing embedding_function here means chromadb uses its default,
    # which is consistent between ingest and query as long as both use this module.
    _collection = _client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return _collection


def collection_size() -> int:
    return _get_collection().count()


def search(query: str, n_results: int = 3) -> List[str]:
    """
    Return the top-n most relevant document chunks for the given query.
    Returns an empty list if the collection is empty.
    """
    col = _get_collection()
    if col.count() == 0:
        return []

    n_results = min(n_results, col.count())
    results = col.query(query_texts=[query], n_results=n_results)
    docs = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]

    annotated = []
    for doc, meta in zip(docs, metadatas):
        source = meta.get("source", "")
        annotated.append(f"[{source}]\n{doc}")
    return annotated


def upsert_chunks(chunks: List[dict]):
    """
    chunks: list of { "text": str, "source": str, "chunk_id": str }
    """
    col = _get_collection()
    ids = [c["chunk_id"] for c in chunks]
    docs = [c["text"] for c in chunks]
    metas = [{"source": c["source"]} for c in chunks]
    col.upsert(ids=ids, documents=docs, metadatas=metas)
