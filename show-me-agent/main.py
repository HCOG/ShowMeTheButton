from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import query, health, knowledge, docs
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))

app = FastAPI(
    title="ShowMeTheButton Agent",
    description="LLM-powered UI element locator service",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(query.router, prefix="/api/v1", tags=["Query"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["Knowledge"])
app.include_router(docs.router, prefix="/api/v1", tags=["Docs"])


@app.get("/")
async def root():
    return {
        "message": "ShowMeTheButton Agent API",
        "version": "0.1.0",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AGENT_PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port, reload=True)
