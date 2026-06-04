"""
Docs and workflow API routes.
Serves the knowledge-base docs/ directory as structured content.

GET /api/v1/docs              → list all docs grouped by category
GET /api/v1/docs/content      → raw markdown for a doc  (?path=button-hell/btn-export.md)
GET /api/v1/workflows         → list all workflow tutorials
GET /api/v1/workflows/{id}    → single workflow with structured steps
"""
import os
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter()

_BASE = Path(__file__).resolve().parent.parent.parent.parent  # repo root
DOCS_DIR = _BASE / "docs"
WORKFLOWS_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "workflows.json"

# ── Category display names ────────────────────────────────────────────────────
CATEGORY_META = {
    "button-hell":   {"label": "按钮地狱",   "icon": "🎛️",  "page": "/button-hell"},
    "complex-form":  {"label": "复杂表单",   "icon": "📝",  "page": "/complex-form"},
    "dashboard":     {"label": "数据仪表盘", "icon": "📊",  "page": "/dashboard"},
    "image-editor":  {"label": "图片编辑器", "icon": "🎨",  "page": "/image-editor"},
    "workflow":      {"label": "工作流",     "icon": "🔀",  "page": "/workflow"},
    "demo":          {"label": "SDK演示",    "icon": "🎯",  "page": "/demo"},
}


def _extract_title(content: str, filename: str) -> str:
    """Get first H1 from markdown, fallback to filename."""
    for line in content.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return filename.replace(".md", "").replace("-", " ").replace("_", " ").title()


def _extract_description(content: str) -> str:
    """Get first non-heading, non-empty paragraph."""
    in_meta = False
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("**"):
            continue
        if line.startswith("```"):
            in_meta = True
        if in_meta:
            if line.endswith("```"):
                in_meta = False
            continue
        if len(line) > 20:
            return line[:120] + ("…" if len(line) > 120 else "")
    return ""


# ── Docs endpoints ────────────────────────────────────────────────────────────

@router.get("/docs")
async def list_docs():
    """List all docs grouped by category."""
    if not DOCS_DIR.exists():
        raise HTTPException(status_code=404, detail="Docs directory not found")

    categories = {}
    for cat_dir in sorted(DOCS_DIR.iterdir()):
        if not cat_dir.is_dir() or cat_dir.name.startswith(".") or cat_dir.name == "workflows":
            continue

        meta = CATEGORY_META.get(cat_dir.name, {"label": cat_dir.name, "icon": "📄", "page": "/"})
        docs = []

        for md_file in sorted(cat_dir.glob("*.md")):
            content = md_file.read_text(encoding="utf-8")
            docs.append({
                "path": f"{cat_dir.name}/{md_file.name}",
                "title": _extract_title(content, md_file.name),
                "description": _extract_description(content),
            })

        if docs:
            categories[cat_dir.name] = {**meta, "docs": docs}

    return {"categories": categories}


@router.get("/docs/content")
async def get_doc_content(path: str = Query(..., description="Relative path like button-hell/btn-export.md")):
    """Return raw markdown content for a specific doc."""
    # Security: prevent path traversal
    safe = Path(path).parts
    if ".." in safe or safe[0].startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    full_path = DOCS_DIR / path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail=f"Doc not found: {path}")

    content = full_path.read_text(encoding="utf-8")
    cat = safe[0] if len(safe) > 0 else ""
    meta = CATEGORY_META.get(cat, {})

    return {
        "path": path,
        "content": content,
        "title": _extract_title(content, full_path.name),
        "category": cat,
        "categoryLabel": meta.get("label", cat),
        "page": meta.get("page", "/"),
    }


# ── Workflow endpoints ────────────────────────────────────────────────────────

def _load_workflows():
    if not WORKFLOWS_FILE.exists():
        return []
    return json.loads(WORKFLOWS_FILE.read_text(encoding="utf-8"))


@router.get("/workflows")
async def list_workflows():
    """List all workflow tutorials."""
    workflows = _load_workflows()
    # Return summaries (without full steps)
    return {
        "workflows": [
            {
                "id": w["id"],
                "title": w["title"],
                "description": w["description"],
                "page": w["page"],
                "estimatedTime": w.get("estimatedTime", ""),
                "stepCount": len(w.get("steps", [])),
            }
            for w in workflows
        ]
    }


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    """Get a single workflow with all steps."""
    workflows = _load_workflows()
    workflow = next((w for w in workflows if w["id"] == workflow_id), None)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow not found: {workflow_id}")

    workflow["stepCount"] = len(workflow.get("steps", []))

    # Enrich with markdown doc if available
    md_path = DOCS_DIR / "workflows" / f"{workflow_id.upper().replace('-', '_')}.md"
    if md_path.exists():
        workflow["markdownContent"] = md_path.read_text(encoding="utf-8")

    return workflow
