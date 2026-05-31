from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "demo-backend"
    }

@router.get("/")
async def root():
    return {"message": "Health check endpoint"}
