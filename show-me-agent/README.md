# ShowMeTheButton Agent Service

Backend inference service that processes queries from the frontend SDK.

## Structure

```
show-me-agent/
├── src/
│   ├── api/            # FastAPI routes
│   │   ├── routes/     # API endpoints
│   │   └── middleware/ # CORS, auth, etc.
│   ├── engine/         # Core engines
│   │   ├── intent/     # Intent recognition
│   │   ├── rag/        # RAG retrieval
│   │   └── locator/    # UI analysis
│   ├── llm/           # LLM adapters
│   │   ├── minimax.py
│   │   ├── ollama.py
│   │   └── openai.py
│   ├── storage/       # Vector DB, cache
│   └── models/         # Pydantic models
├── requirements.txt
└── main.py
```

## Getting Started

```bash
cd show-me-agent
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## API Endpoints

- `POST /api/v1/query` - Main query endpoint
- `POST /api/v1/chat` - Chat endpoint
- `GET /api/v1/health` - Health check
- `GET /docs` - Swagger UI

## Environment Variables

See [.env.example](../../.env.example) for required configuration.

See main [README.md](../../README.md) for more information.
