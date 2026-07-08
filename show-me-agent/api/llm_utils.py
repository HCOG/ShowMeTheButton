"""
Shared LLM helpers used by the route handlers (journey, guide) and the
older engine.llm_selector module.

These were previously duplicated three times. Keep this file the single
source of truth so app-level error formatting, markdown stripping, and
provider liveness checks all stay in sync.
"""
import os
import json
import httpx


def parse_llm_json(text: str) -> dict:
    """Strip an optional ```json ... ``` fence and parse the result."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


def raise_for_app_error(data: dict, provider: str) -> None:
    """Some providers (MiniMax) return HTTP 200 even for app-level errors and
    signal failure via a nested `base_resp` object. Raise RuntimeError with a
    clear message so callers surface a useful error instead of `KeyError: 'choices'`.
    """
    base = data.get("base_resp")
    if isinstance(base, dict) and base.get("status_code", 0) not in (0, None):
        raise RuntimeError(
            f"{provider} API error {base.get('status_code')}: "
            f"{base.get('status_msg', 'unknown')}"
        )
    if "choices" not in data:
        preview = json.dumps(data, ensure_ascii=False)[:300]
        raise RuntimeError(f"{provider} response missing 'choices': {preview}")


async def ollama_available() -> bool:
    """True if the configured Ollama daemon is reachable."""
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{base_url}/api/tags")
            return r.status_code == 200
    except Exception:
        return False
