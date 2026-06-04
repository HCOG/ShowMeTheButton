from fastapi import APIRouter
import os

router = APIRouter()


@router.get("/health")
async def health_check():
    # Report which LLM provider is configured
    if os.getenv("OPENAI_API_KEY"):
        provider = "openai"
    elif os.getenv("MINIMAX_API_KEY"):
        provider = "minimax"
    else:
        provider = "ollama"

    return {
        "status": "healthy",
        "service": "show-me-agent",
        "llm_provider": provider,
    }
