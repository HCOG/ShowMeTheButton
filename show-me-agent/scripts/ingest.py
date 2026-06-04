"""
Knowledge base ingestion script.
Walks docs/ directory, chunks markdown files, and upserts into ChromaDB.

Usage (from show-me-agent/):
    python -m scripts.ingest [--docs-path PATH] [--force]
"""
import os
import sys
import re
import hashlib
import argparse
from typing import List

# Add parent to path so we can import engine
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engine.rag import upsert_chunks, collection_size


DEFAULT_DOCS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "docs")


def _chunk_markdown(text: str, max_chars: int = 800) -> List[str]:
    """
    Split markdown into chunks:
    1. Split on H2/H3 headings first (natural section breaks)
    2. If a section is still > max_chars, split on double-newline (paragraphs)
    """
    # Split on ## or ### headings, keeping the heading in the chunk
    sections = re.split(r'(?=\n#{2,3} )', text)
    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) <= max_chars:
            chunks.append(section)
        else:
            # Further split on paragraphs
            paragraphs = re.split(r'\n\n+', section)
            current = ""
            for para in paragraphs:
                if len(current) + len(para) + 2 <= max_chars:
                    current = (current + "\n\n" + para).strip()
                else:
                    if current:
                        chunks.append(current)
                    current = para.strip()
            if current:
                chunks.append(current)
    return chunks


def ingest_docs(docs_path: str, force: bool = False) -> int:
    docs_path = os.path.abspath(docs_path)
    if not os.path.isdir(docs_path):
        print(f"ERROR: docs path not found: {docs_path}")
        sys.exit(1)

    all_chunks = []

    for root, _, files in os.walk(docs_path):
        for fname in sorted(files):
            if not fname.endswith(".md"):
                continue

            fpath = os.path.join(root, fname)
            rel = os.path.relpath(fpath, docs_path)

            with open(fpath, encoding="utf-8") as f:
                content = f.read().strip()

            if not content:
                continue

            chunks = _chunk_markdown(content)
            for i, chunk in enumerate(chunks):
                # Stable ID based on content hash so re-running is idempotent
                chunk_id = hashlib.md5(f"{rel}:{i}:{chunk[:64]}".encode()).hexdigest()
                all_chunks.append({
                    "chunk_id": chunk_id,
                    "text": chunk,
                    "source": rel,
                })

    print(f"Found {len(all_chunks)} chunks from {docs_path}")
    print("Upserting into ChromaDB (this may take a moment for embeddings)…")

    # Batch upsert in groups of 50 to avoid large payloads
    batch_size = 50
    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i : i + batch_size]
        upsert_chunks(batch)
        print(f"  Upserted {min(i + batch_size, len(all_chunks))}/{len(all_chunks)}")

    total = collection_size()
    print(f"\n✅ Done. Collection now has {total} chunks.")
    return len(all_chunks)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest docs into ChromaDB")
    parser.add_argument("--docs-path", default=DEFAULT_DOCS_PATH,
                        help="Path to docs directory")
    parser.add_argument("--force", action="store_true",
                        help="Re-ingest even if collection already has data")
    args = parser.parse_args()

    size = collection_size()
    if size > 0 and not args.force:
        print(f"Collection already has {size} chunks. Use --force to re-ingest.")
        sys.exit(0)

    ingest_docs(args.docs_path, force=args.force)
