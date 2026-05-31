from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import image, form, health
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="ShowMeTheButton Demo Backend",
    description="Demo backend API for Angular demo application",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost:4201"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(image.router, prefix="/api/image", tags=["Image"])
app.include_router(form.router, prefix="/api/form", tags=["Form"])

@app.get("/")
async def root():
    return {
        "message": "ShowMeTheButton Demo Backend API",
        "version": "0.1.0",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
