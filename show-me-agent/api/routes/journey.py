"""
Journey planning endpoint.

POST /api/v1/journey/plan
  Given a natural-language goal and the current page's UI elements, the LLM
  returns an ordered sequence of steps (query + title + description) that the
  SDK's JourneyRunner will execute one by one.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import os, json, time, httpx

router = APIRouter()


# ── Request / response models ─────────────────────────────────────────────────

class ElementInfo(BaseModel):
    id: str
    label: str
    type: str
    text: Optional[str] = None


class PlanRequest(BaseModel):
    goal: str
    elements: List[ElementInfo]


class PlannedStep(BaseModel):
    title: str
    description: str
    query: str
    hint: Optional[str] = None


class PlanResponse(BaseModel):
    success: bool
    steps: Optional[List[PlannedStep]] = None
    error: Optional[str] = None
    latency_ms: Optional[int] = None


# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a UI workflow planner for a web application assistant.

Given a user's end goal and a list of available UI elements on the current page,
create an ordered sequence of steps to achieve that goal.

Rules:
- Return ONLY valid JSON, no markdown, no text outside the JSON
- 2–7 steps maximum; fewer is better
- Each step must correspond to one interactive UI action (click, select, etc.)
- The "query" field is a natural-language description used to locate the element;
  it must relate to something visible in the provided elements list
- Titles and descriptions should be in the SAME LANGUAGE as the goal
- Do NOT invent steps for elements that clearly don't exist on this page
"""

USER_PROMPT_TEMPLATE = """User's goal: "{goal}"

UI elements currently on the page:
{elements_json}

Return JSON exactly like this (no markdown):
{{
  "steps": [
    {{
      "title": "<short action title>",
      "description": "<one sentence: what the user should do and why>",
      "query": "<natural language to find the element, e.g. 'the export button'>",
      "hint": "<optional tooltip shown when cursor arrives, or null>"
    }}
  ]
}}"""


def _build_prompt(goal: str, elements: list) -> str:
    simplified = [
        {"id": e.get("id"), "label": e.get("label"), "type": e.get("type"), "text": e.get("text", "")}
        for e in elements
    ]
    return USER_PROMPT_TEMPLATE.format(
        goal=goal,
        elements_json=json.dumps(simplified, ensure_ascii=False, indent=2),
    )


def _parse(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


# ── LLM callers (mirror the pattern in llm_selector.py) ──────────────────────

async def _plan_openai(goal: str, elements: list) -> list:
    api_key  = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model    = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_prompt(goal, elements)},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return _parse(content)["steps"]


async def _plan_minimax(goal: str, elements: list) -> list:
    api_key = os.getenv("MINIMAX_API_KEY")
    api_url = os.getenv("MINIMAX_API_URL", "https://api.minimax.chat/v1")
    model   = os.getenv("MINIMAX_MODEL", "MiniMax-Text-01")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{api_url}/text/chatcompletion_v2",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_prompt(goal, elements)},
                ],
                "temperature": 0.2,
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return _parse(content)["steps"]


async def _plan_ollama(goal: str, elements: list) -> list:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model    = os.getenv("OLLAMA_MODEL", "llama3.2")
    prompt   = SYSTEM_PROMPT + "\n\n" + _build_prompt(goal, elements)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{base_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
        )
        resp.raise_for_status()
        return _parse(resp.json()["response"])["steps"]


async def _ollama_available() -> bool:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{base_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


def _keyword_fallback(goal: str, elements: list) -> list:
    """Best-effort fallback when no LLM is configured."""
    return [
        {
            "title": f"执行: {goal[:30]}",
            "description": f'找到与"{goal}"相关的操作元素并点击',
            "query": goal,
            "hint": None,
        }
    ]


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/journey/plan", response_model=PlanResponse)
async def plan_journey(req: PlanRequest):
    if not req.goal.strip():
        return PlanResponse(success=False, error="Goal cannot be empty")
    if not req.elements:
        return PlanResponse(success=False, error="No elements provided")

    elements_dict = [e.model_dump() for e in req.elements]
    start = time.time()

    try:
        if os.getenv("OPENAI_API_KEY"):
            raw_steps = await _plan_openai(req.goal, elements_dict)
        elif os.getenv("MINIMAX_API_KEY"):
            raw_steps = await _plan_minimax(req.goal, elements_dict)
        elif await _ollama_available():
            raw_steps = await _plan_ollama(req.goal, elements_dict)
        else:
            raw_steps = _keyword_fallback(req.goal, elements_dict)

        steps = [
            PlannedStep(
                title=s.get("title", ""),
                description=s.get("description", ""),
                query=s.get("query", ""),
                hint=s.get("hint"),
            )
            for s in raw_steps
        ]
        latency_ms = int((time.time() - start) * 1000)
        return PlanResponse(success=True, steps=steps, latency_ms=latency_ms)

    except json.JSONDecodeError as e:
        return PlanResponse(success=False, error=f"LLM returned invalid JSON: {e}")
    except httpx.HTTPStatusError as e:
        return PlanResponse(success=False, error=f"LLM API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        return PlanResponse(success=False, error=str(e))
