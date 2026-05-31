# Demo Backend

This directory contains the FastAPI backend service for the Angular demo application.

## Structure

```
demo-backend/
├── src/
│   ├── api/              # API routes
│   ├── services/         # Business logic
│   └── main.py          # FastAPI app
├── requirements.txt
└── pyproject.toml
```

## Getting Started

```bash
cd demo-backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## API Endpoints

- `POST /api/image/process` - Image processing
- `POST /api/form/submit` - Form submission
- `GET /api/health` - Health check

See main [README.md](../README.md) for more information.
