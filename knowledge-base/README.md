# Knowledge Base Storage

This directory contains the vector database storage for the RAG system.

## Structure

```
knowledge-base/
├── chroma/              # ChromaDB persistent storage
│   └── ...
└── README.md
```

## Purpose

This directory stores the vector embeddings and metadata for the RAG knowledge base.
The ChromaDB database will be initialized and populated when the agent service starts.

## Initialization

The database is automatically initialized from the markdown files in `../docs/`.

## Note

The `chroma/` directory is gitignored and will be created on first run.
Do not commit this directory to version control.

See main [README.md](../README.md) for more information.
