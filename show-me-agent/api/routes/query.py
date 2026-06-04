from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from engine.llm_selector import select_element

router = APIRouter()


class ElementInfo(BaseModel):
    id: str
    label: str
    type: str
    text: Optional[str] = None


class QueryContext(BaseModel):
    url: Optional[str] = None
    timestamp: Optional[int] = None


class QueryRequest(BaseModel):
    query: str
    elements: List[ElementInfo]
    context: Optional[QueryContext] = None
    history: Optional[List[Dict[str, Any]]] = None


class QueryResult(BaseModel):
    target_id: str
    confidence: float
    reasoning: str
    suggestion: Optional[str] = None


class QueryResponse(BaseModel):
    success: bool
    result: Optional[QueryResult] = None
    error: Optional[str] = None
    latency_ms: Optional[int] = None


@router.post("/query", response_model=QueryResponse)
async def handle_query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    elements_dict = [e.model_dump() for e in req.elements]
    context_dict = req.context.model_dump() if req.context else None

    response = await select_element(req.query, elements_dict, context_dict)

    if not response["success"]:
        return QueryResponse(success=False, error=response.get("error"))

    result_data = response["result"]
    return QueryResponse(
        success=True,
        result=QueryResult(
            target_id=result_data["target_id"],
            confidence=result_data["confidence"],
            reasoning=result_data["reasoning"],
        ),
        latency_ms=response.get("latency_ms"),
    )
