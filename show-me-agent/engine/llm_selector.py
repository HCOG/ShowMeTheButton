"""
LLM-based UI element selector.
Supports OpenAI, MiniMax, and Ollama (auto-detected from env vars).
"""
import os
import json
import time
import httpx
from typing import List, Dict, Any, Optional


SYSTEM_PROMPT = """You are a precise UI navigation assistant.
Given a user's natural language description of what they want to do,
identify which UI element best matches their intent from the provided list.

Rules:
- Return ONLY valid JSON, no markdown, no explanation outside JSON
- target_id must be one of the provided element IDs
- If nothing matches well, pick the closest one and set confidence low
- reasoning should be concise (1-2 sentences) in English (regardless of the query's language)
- If knowledge base context is provided, use it to improve accuracy
"""

USER_PROMPT_TEMPLATE = """User wants: "{query}"
{rag_context}
Available UI elements on this page:
{elements_json}

Return JSON exactly like this:
{{
  "target_id": "<id from elements list>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}}"""


def _build_prompt(query: str, elements: List[Dict[str, Any]], rag_docs: Optional[List[str]] = None) -> str:
    simplified = [
        {
            "id": e.get("id"),
            "label": e.get("label"),
            "type": e.get("type"),
            "text": e.get("text", ""),
        }
        for e in elements
    ]

    if rag_docs:
        rag_block = "Relevant knowledge base context:\n"
        rag_block += "\n---\n".join(rag_docs)
        rag_block += "\n\n"
    else:
        rag_block = ""

    return USER_PROMPT_TEMPLATE.format(
        query=query,
        rag_context=rag_block,
        elements_json=json.dumps(simplified, ensure_ascii=False, indent=2),
    )


def _parse_llm_response(text: str) -> Dict[str, Any]:
    """Extract JSON from LLM response, handle markdown code blocks."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return json.loads(text)


async def _call_openai(query: str, elements: List[Dict], rag_docs: Optional[List[str]] = None) -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _build_prompt(query, elements, rag_docs)},
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return _parse_llm_response(content)


async def _call_minimax(query: str, elements: List[Dict], rag_docs: Optional[List[str]] = None) -> Dict[str, Any]:
    api_key = os.getenv("MINIMAX_API_KEY")
    api_url = os.getenv("MINIMAX_API_URL", "https://api.minimax.chat/v1")
    model = os.getenv("MINIMAX_MODEL", "MiniMax-Text-01")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{api_url}/text/chatcompletion_v2",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": _build_prompt(query, elements, rag_docs)},
                ],
                "temperature": 0.1,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        # MiniMax returns HTTP 200 with a nested base_resp on app errors.
        # Surface those explicitly instead of letting KeyError('choices') leak.
        base = data.get("base_resp")
        if isinstance(base, dict) and base.get("status_code", 0) not in (0, None):
            raise RuntimeError(
                f"MiniMax API error {base.get('status_code')}: "
                f"{base.get('status_msg', 'unknown')}"
            )
        if "choices" not in data:
            raise RuntimeError(
                f"MiniMax response missing 'choices': {str(data)[:300]}"
            )
        content = data["choices"][0]["message"]["content"]
        return _parse_llm_response(content)


async def _call_ollama(query: str, elements: List[Dict], rag_docs: Optional[List[str]] = None) -> Dict[str, Any]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.2")

    prompt = SYSTEM_PROMPT + "\n\n" + _build_prompt(query, elements, rag_docs)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{base_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return _parse_llm_response(data["response"])


async def _ollama_available() -> bool:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{base_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


def _keyword_match(query: str, elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Simple keyword fallback when no LLM is available.
    Scores each element by how many query words appear in its label/text.
    """
    q_words = set(query.lower().split())
    best_id, best_score = None, -1

    for el in elements:
        haystack = " ".join(filter(None, [
            el.get("label", ""), el.get("text", ""), el.get("type", "")
        ])).lower()
        score = sum(1 for w in q_words if w in haystack)
        if score > best_score:
            best_score, best_id = score, el["id"]

    if best_id is None:
        best_id = elements[0]["id"]

    label = next((e.get("label", "") for e in elements if e["id"] == best_id), "")
    return {
        "target_id": best_id,
        "confidence": min(0.5 + best_score * 0.1, 0.95),
        "reasoning": f"Keyword match (no LLM): most relevant to [{label}]",
    }


async def select_element(
    query: str,
    elements: List[Dict[str, Any]],
    context: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Main entry point. Auto-selects LLM provider based on env vars.
    Priority: OpenAI > MiniMax > Ollama
    Augments the LLM prompt with RAG context if ChromaDB has data.
    """
    if not elements:
        return {
            "success": False,
            "error": "No elements provided",
        }

    start = time.time()

    # ── RAG retrieval ──────────────────────────────────────────────────────
    rag_docs: Optional[List[str]] = None
    try:
        from engine.rag import search as rag_search
        rag_docs = rag_search(query, n_results=3)
    except Exception:
        pass  # RAG is optional; degrade gracefully

    try:
        if os.getenv("OPENAI_API_KEY"):
            result = await _call_openai(query, elements, rag_docs)
        elif os.getenv("MINIMAX_API_KEY"):
            result = await _call_minimax(query, elements, rag_docs)
        elif await _ollama_available():
            result = await _call_ollama(query, elements, rag_docs)
        else:
            result = _keyword_match(query, elements)

        latency_ms = int((time.time() - start) * 1000)

        return {
            "success": True,
            "result": {
                "target_id": result["target_id"],
                "confidence": float(result.get("confidence", 0.8)),
                "reasoning": result.get("reasoning", ""),
            },
            "latency_ms": latency_ms,
        }

    except json.JSONDecodeError as e:
        return {"success": False, "error": f"LLM returned invalid JSON: {e}"}
    except httpx.HTTPStatusError as e:
        return {"success": False, "error": f"LLM API error {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
