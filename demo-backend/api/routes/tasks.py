from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime
import uuid
import asyncio

router = APIRouter()

class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, processing, completed, failed
    progress: int  # 0-100
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None

class TaskResponse(BaseModel):
    success: bool
    message: str
    task_id: str

tasks: Dict[str, dict] = {}

@router.post("/create")
async def create_task(
    task_type: str,
    action: str,
    params: Optional[dict] = None
):
    task_id = str(uuid.uuid4())
    
    task = {
        "task_id": task_id,
        "type": task_type,
        "action": action,
        "status": "pending",
        "progress": 0,
        "params": params or {},
        "result": None,
        "error": None,
        "created_at": datetime.now().isoformat(),
        "completed_at": None
    }
    
    tasks[task_id] = task
    
    asyncio.create_task(process_task_async(task_id))
    
    return {
        "success": True,
        "message": f"Task {action} created successfully",
        "task_id": task_id
    }

@router.get("/{task_id}")
async def get_task_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return tasks[task_id]

@router.get("/")
async def list_tasks():
    return {
        "tasks": list(tasks.values()),
        "total": len(tasks)
    }

async def process_task_async(task_id: str):
    task = tasks[task_id]
    
    task["status"] = "processing"
    task["progress"] = 10
    
    await asyncio.sleep(2)
    task["progress"] = 30
    
    await asyncio.sleep(2)
    task["progress"] = 60
    
    await asyncio.sleep(2)
    task["progress"] = 90
    
    task["status"] = "completed"
    task["progress"] = 100
    task["result"] = {
        "message": "Task completed successfully",
        "action": task["action"],
        "params": task["params"]
    }
    task["completed_at"] = datetime.now().isoformat()

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if tasks[task_id]["status"] in ["completed", "failed"]:
        raise HTTPException(status_code=400, detail="Task already completed")
    
    tasks[task_id]["status"] = "cancelled"
    tasks[task_id]["completed_at"] = datetime.now().isoformat()
    
    return {
        "success": True,
        "message": "Task cancelled successfully",
        "task_id": task_id
    }

@router.delete("/{task_id}")
async def delete_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    del tasks[task_id]
    
    return {
        "success": True,
        "message": "Task deleted successfully"
    }
