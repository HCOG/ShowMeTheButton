"""
Unified guide endpoint.

POST /api/v1/guide
  Given a user's natural-language request and the current page's UI elements,
  the LLM decides whether the request is:

    • "single"  — find one element and fly the cursor to it  (e.g. "where is the export button?")
    • "journey" — the user described a goal that needs several steps  (e.g. "I want to export a PDF report")

  The response shape differs accordingly so the SDK can handle each case.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import os, json, time, httpx

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────

class ElementInfo(BaseModel):
    id: str
    label: str
    type: str
    text: Optional[str] = None


class GuideContext(BaseModel):
    url: Optional[str] = None
    timestamp: Optional[int] = None


class GuideRequest(BaseModel):
    query: str
    elements: List[ElementInfo]
    context: Optional[GuideContext] = None


class SingleResult(BaseModel):
    target_id: str
    confidence: float
    reasoning: str


class JourneyStep(BaseModel):
    title: str
    description: str
    query: str
    hint: Optional[str] = None


class GuideResponse(BaseModel):
    success: bool
    type: Optional[str] = None          # "single" | "journey"
    result: Optional[SingleResult] = None
    steps: Optional[List[JourneyStep]] = None
    error: Optional[str] = None
    latency_ms: Optional[int] = None


# ── Prompt ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a smart UI navigation assistant.

Given a user's request and the available UI elements on the current page,
decide whether the request needs ONE action (single) or MULTIPLE steps (journey).

Decision rules
--------------
• SINGLE  – user asks to find/click/go-to ONE specific thing:
  "where is the export button", "show me settings", "click submit", "find the menu"

• JOURNEY – user describes a GOAL or task requiring several actions:
  "I want to export a report as PDF", "help me create a new user account",
  "how do I change my password", "I need to submit this form"

Response format
---------------
For SINGLE, return ONLY this JSON:
{
  "type": "single",
  "target_id": "<id from elements list>",
  "confidence": <0.0–1.0>,
  "reasoning": "<one sentence in the same language as the query>"
}

For JOURNEY, return ONLY this JSON (2–6 steps, no more):
{
  "type": "journey",
  "steps": [
    {
      "title": "<short action title>",
      "description": "<one sentence: what to do and why>",
      "query": "<natural-language phrase to locate the element for this step>",
      "hint": "<optional tooltip shown when cursor arrives, or null>"
    }
  ]
}

Rules:
- Return ONLY valid JSON — no markdown, no explanation outside the JSON
- Titles and descriptions must be in the SAME LANGUAGE as the user's query
- Journey "query" fields must relate to elements that actually exist in the provided list
- If nothing matches well for single, still pick the closest and lower the confidence
"""

USER_PROMPT_TEMPLATE = """User request: "{query}"

Available UI elements on this page:
{elements_json}

Decide: single or journey? Return JSON only."""


def _build_prompt(query: str, elements: list) -> str:
    simplified = [
        {"id": e.get("id"), "label": e.get("label"), "type": e.get("type"), "text": e.get("text", "")}
        for e in elements
    ]
    return USER_PROMPT_TEMPLATE.format(
        query=query,
        elements_json=json.dumps(simplified, ensure_ascii=False, indent=2),
    )


def _parse(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


def _raise_for_app_error(data: dict, provider: str) -> None:
    """Some providers (MiniMax) return HTTP 200 even for app-level errors and
    signal failure via a nested `base_resp` object. Raise RuntimeError with a
    clear message so callers surface a useful error instead of `KeyError: 'choices'`.
    """
    base = data.get("base_resp")
    if isinstance(base, dict) and base.get("status_code", 0) not in (0, None):
        raise RuntimeError(
            f"{provider} API error {base.get('status_code')}: {base.get('status_msg', 'unknown')}"
        )
    if "choices" not in data:
        preview = json.dumps(data, ensure_ascii=False)[:300]
        raise RuntimeError(f"{provider} response missing 'choices': {preview}")


# ── LLM callers ───────────────────────────────────────────────────────────────

async def _call_openai(query: str, elements: list) -> dict:
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
                    {"role": "user",   "content": _build_prompt(query, elements)},
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        return _parse(resp.json()["choices"][0]["message"]["content"])


async def _call_minimax(query: str, elements: list) -> dict:
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
                    {"role": "user",   "content": _build_prompt(query, elements)},
                ],
                "temperature": 0.1,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        _raise_for_app_error(data, "MiniMax")
        return _parse(data["choices"][0]["message"]["content"])


async def _call_ollama(query: str, elements: list) -> dict:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model    = os.getenv("OLLAMA_MODEL", "llama3.2")
    prompt   = SYSTEM_PROMPT + "\n\n" + _build_prompt(query, elements)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{base_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
        )
        resp.raise_for_status()
        return _parse(resp.json()["response"])


async def _ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


def _keyword_fallback(query: str, elements: list) -> dict:
    """Single-element keyword match when no LLM is configured."""
    from engine.llm_selector import _keyword_match
    result = _keyword_match(query, elements)
    return {"type": "single", **result}


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/guide", response_model=GuideResponse)
async def handle_guide(req: GuideRequest):
    if not req.query.strip():
        return GuideResponse(success=False, error="Query cannot be empty")
    if not req.elements:
        return GuideResponse(success=False, error="No elements provided")

    elements_dict = [e.model_dump() for e in req.elements]
    start = time.time()

    try:
        if os.getenv("OPENAI_API_KEY"):
            data = await _call_openai(req.query, elements_dict)
        elif os.getenv("MINIMAX_API_KEY"):
            data = await _call_minimax(req.query, elements_dict)
        elif await _ollama_available():
            data = await _call_ollama(req.query, elements_dict)
        else:
            data = _keyword_fallback(req.query, elements_dict)

        latency_ms = int((time.time() - start) * 1000)
        guide_type = data.get("type", "single")

        if guide_type == "journey":
            raw_steps = data.get("steps", [])
            steps = [
                JourneyStep(
                    title=s.get("title", ""),
                    description=s.get("description", ""),
                    query=s.get("query", ""),
                    hint=s.get("hint"),
                )
                for s in raw_steps
            ]
            return GuideResponse(success=True, type="journey", steps=steps, latency_ms=latency_ms)

        else:  # "single"
            return GuideResponse(
                success=True,
                type="single",
                result=SingleResult(
                    target_id=data.get("target_id", ""),
                    confidence=float(data.get("confidence", 0.8)),
                    reasoning=data.get("reasoning", ""),
                ),
                latency_ms=latency_ms,
            )

    except json.JSONDecodeError as e:
        return GuideResponse(success=False, error=f"LLM returned invalid JSON: {e}")
    except httpx.HTTPStatusError as e:
        return GuideResponse(success=False, error=f"LLM API error {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        return GuideResponse(success=False, error=str(e))
