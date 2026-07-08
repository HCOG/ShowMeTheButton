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

from api.llm_utils import parse_llm_json, raise_for_app_error, ollama_available

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
- 2–8 steps maximum — include every action the user genuinely needs to take
  to reach the goal end state. Do NOT artificially compress multiple actions
  into one step (e.g. "fill form and submit" should be two steps if both
  clicks are visible in the elements list)
- Each step must correspond to one interactive UI action (click, select, etc.)
- The "query" field is a natural-language description used to locate the element;
  it must relate to something visible in the provided elements list
- Titles and descriptions MUST be in English (regardless of the goal's language).
  Only the "query" field may quote the user's element labels verbatim.
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
        return parse_llm_json(content)["steps"]


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
        data = resp.json()
        raise_for_app_error(data, "MiniMax")
        content = data["choices"][0]["message"]["content"]
        return parse_llm_json(content)["steps"]


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
        return parse_llm_json(resp.json()["response"])["steps"]



def _keyword_fallback(goal: str, elements: list) -> list:
    """Best-effort fallback when no LLM is configured."""
    return [
        {
            "title": f"Execute: {goal[:30]}",
            "description": f'Click the element matching "{goal}"',
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
        elif await ollama_available():
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


# ══════════════════════════════════════════════════════════════════════════════
# Iterative planning — POST /api/v1/journey/next-step
#
# Instead of planning all steps up front (which fails for multi-page goals where
# later pages aren't visible yet), the runner asks for ONE step at a time. After
# each completed step it re-scans the live DOM and calls this endpoint with the
# history so far. The agent returns the next step, or signals the goal is done.
# ══════════════════════════════════════════════════════════════════════════════

class HistoryItem(BaseModel):
    title: str
    description: Optional[str] = None


class NextStepRequest(BaseModel):
    goal: str
    history: List[HistoryItem] = []
    elements: List[ElementInfo]


class NextStepResponse(BaseModel):
    success: bool
    done: bool = False
    step: Optional[PlannedStep] = None
    reasoning: Optional[str] = None
    error: Optional[str] = None
    latency_ms: Optional[int] = None


NEXT_STEP_SYSTEM_PROMPT = """You are a UI workflow guide operating ONE step at a time.

You are given the user's overall goal, the steps already completed, and the UI
elements visible on the CURRENT page (which may differ from earlier pages because
the user has navigated). Decide the single NEXT step, or whether the goal is done.

Rules:
- Return ONLY valid JSON, no markdown
- The next step's "query" must locate an element that exists in the CURRENT
  elements list — never reference elements from a previous page
- If the goal has already been achieved by the completed steps, set done=true
- If you cannot find a sensible next element on this page, set done=true with a
  reasoning explaining why (do not invent steps)
- Titles/descriptions MUST be in English (regardless of the goal's language).
"""

NEXT_STEP_USER_TEMPLATE = """Overall goal: "{goal}"

Steps already completed ({n_done}):
{history_json}

UI elements on the CURRENT page:
{elements_json}

Return JSON exactly like this (no markdown):
{{
  "done": <true|false>,
  "reasoning": "<why this step, or why we're done>",
  "step": {{
    "title": "<short action title>",
    "description": "<one sentence>",
    "query": "<natural language to locate the element on THIS page>",
    "hint": "<optional tooltip, or null>"
  }}
}}
If done is true, "step" may be null."""


def _build_next_prompt(goal: str, history: list, elements: list) -> str:
    simplified = [
        {"id": e.get("id"), "label": e.get("label"), "type": e.get("type"), "text": e.get("text", "")}
        for e in elements
    ]
    hist = [{"title": h.get("title"), "description": h.get("description", "")} for h in history]
    return NEXT_STEP_USER_TEMPLATE.format(
        goal=goal,
        n_done=len(hist),
        history_json=json.dumps(hist, ensure_ascii=False, indent=2),
        elements_json=json.dumps(simplified, ensure_ascii=False, indent=2),
    )


async def _next_openai(goal: str, history: list, elements: list) -> dict:
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
                    {"role": "system", "content": NEXT_STEP_SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_next_prompt(goal, history, elements)},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        return parse_llm_json(resp.json()["choices"][0]["message"]["content"])


async def _next_minimax(goal: str, history: list, elements: list) -> dict:
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
                    {"role": "system", "content": NEXT_STEP_SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_next_prompt(goal, history, elements)},
                ],
                "temperature": 0.2,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        raise_for_app_error(data, "MiniMax")
        return parse_llm_json(data["choices"][0]["message"]["content"])


async def _next_ollama(goal: str, history: list, elements: list) -> dict:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model    = os.getenv("OLLAMA_MODEL", "llama3.2")
    prompt   = NEXT_STEP_SYSTEM_PROMPT + "\n\n" + _build_next_prompt(goal, history, elements)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{base_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
        )
        resp.raise_for_status()
        return parse_llm_json(resp.json()["response"])


def _next_keyword_fallback(goal: str, history: list, elements: list) -> dict:
    """
    No-LLM fallback: emit a single step on the first call (keyword-locating the
    goal), then declare done. This keeps iterative journeys functional without
    an LLM, degrading to roughly the single-step behaviour.
    """
    if history:
        return {"done": True, "reasoning": "无 LLM 模式：已执行一步引导", "step": None}
    return {
        "done": False,
        "reasoning": "无 LLM 模式：定位与目标最相关的元素",
        "step": {
            "title": f"执行: {goal[:30]}",
            "description": f'找到与"{goal}"相关的操作元素并点击',
            "query": goal,
            "hint": None,
        },
    }


@router.post("/journey/next-step", response_model=NextStepResponse)
async def next_step(req: NextStepRequest):
    if not req.goal.strip():
        return NextStepResponse(success=False, done=True, error="Goal cannot be empty")
    if not req.elements:
        return NextStepResponse(success=False, done=True, error="No elements provided")

    history = [h.model_dump() for h in req.history]
    elements_dict = [e.model_dump() for e in req.elements]
    start = time.time()

    try:
        if os.getenv("OPENAI_API_KEY"):
            data = await _next_openai(req.goal, history, elements_dict)
        elif os.getenv("MINIMAX_API_KEY"):
            data = await _next_minimax(req.goal, history, elements_dict)
        elif await ollama_available():
            data = await _next_ollama(req.goal, history, elements_dict)
        else:
            data = _next_keyword_fallback(req.goal, history, elements_dict)

        latency_ms = int((time.time() - start) * 1000)
        done = bool(data.get("done", False))
        raw_step = data.get("step")
        step = None
        if not done and raw_step:
            step = PlannedStep(
                title=raw_step.get("title", ""),
                description=raw_step.get("description", ""),
                query=raw_step.get("query", ""),
                hint=raw_step.get("hint"),
            )
        # If the model said not-done but gave no usable step, treat as done.
        if not done and step is None:
            done = True

        return NextStepResponse(
            success=True,
            done=done,
            step=step,
            reasoning=data.get("reasoning"),
            latency_ms=latency_ms,
        )

    except json.JSONDecodeError as e:
        return NextStepResponse(success=False, done=True, error=f"LLM returned invalid JSON: {e}")
    except httpx.HTTPStatusError as e:
        return NextStepResponse(success=False, done=True, error=f"LLM API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        return NextStepResponse(success=False, done=True, error=str(e))
