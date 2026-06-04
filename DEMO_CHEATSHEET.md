# 🎯 ShowMeTheButton — Demo Cheat Sheet

A quick, self-contained script for demoing the prototype to others.
The app helps users find buttons in complex UIs by **typing or speaking** what they want —
an animated cursor flies to the right control, and multi-step **guided tours** walk users
through whole workflows.

> **Browser:** use **Google Chrome** (voice input relies on Chrome's Web Speech API).

---

## 1. Start the prototype

Open three things: the agent (LLM matcher), the Angular app, and Chrome.

```bash
# 1) Agent service (port 8001) — needs MINIMAX_API_KEY in the repo-root .env
cd show-me-agent
uvicorn main:app --port 8001
#   sanity check:  curl http://localhost:8001/api/health

# 2) Angular demo (port 4200)
cd angular-demo
ng serve
```

Then open **http://localhost:4200** in Chrome.

> The agent uses MiniMax to match your request to an on-screen button. Make sure the repo-root
> `.env` has a valid `MINIMAX_API_KEY` (copy from `.env.example`). If no LLM key/host is reachable,
> the agent silently falls back to keyword matching, so the demo still runs.

---

## 2. Hotkeys

| Key | Action |
|-----|--------|
| **Alt + S** | Toggle the ShowMe assistant cursor on/off |
| **Alt + V** | Ask by voice — opens the widget and starts listening |

You can also click the floating **🎯 button** (bottom-right) any time to open the assistant, and
the **🎤 mic button** inside it to talk.

---

## 3. Two ways to demo

### A. "Find the button" (single query — text or voice)

1. Navigate to a busy page, e.g. **按钮地狱** (`/button-hell`).
2. Open the assistant (🎯 or **Alt + V**).
3. Type or **say** a request in Chinese, e.g. *"我想导出数据"*.
4. The cursor flies to the matching button and shows a tooltip with the agent's reasoning.

**Good queries by page** (each reliably hits the target):

| Page | Say / type | Flies to |
|------|-----------|----------|
| `/button-hell` | 我想导出数据 | 导出数据 |
| `/button-hell` | 怎么刷新数据 | 刷新 |
| `/button-hell` | 新建按钮在哪 | 新建 |
| `/button-hell` | 怎么批量删除 | 删除 |
| `/image-editor` | 怎么裁剪图片 | 裁剪 |
| `/image-editor` | 撤销在哪里 | 撤销 |
| `/image-editor` | 滤镜在哪 | 滤镜 |
| `/complex-form` | 怎么保存草稿 | 保存草稿 |
| `/complex-form` | 自动填充 | 自动填充 |
| `/workflow` | 我要发布工作流 | 发布 |
| `/workflow` | 验证在哪里 | 验证 |
| `/dashboard` | 看最近一个月的数据 | 时间范围选择 |

### B. Multi-stage guided tour (the showpiece)

1. Go to **用户手册** (`/wiki`) in the navbar.
2. Open the **工作流教程** tab in the left sidebar.
3. Pick a tutorial and click **▶ 启动导航教程**.
4. The app navigates to the right page and walks step-by-step: the cursor flies to each button,
   a HUD at the top shows progress, and you advance with **下一步 →**.

**Recommended tours (best first):**

| Tour | Page | Steps | Why it demos well |
|------|------|-------|-------------------|
| **导出报表为PDF** | `/button-hell` | 4 | Short, linear, clear outcome — start here |
| **编辑并保存图片** | `/image-editor` | 4 | Visual; cursor jumps across a tool palette |

**Other available tours:** 批量删除记录 (`/button-hell`, 3 steps) · 员工入职信息提交
(`/complex-form`, 5 steps) · 创建并发布工作流 (`/workflow`, 4 steps).

---

## 4. Suggested 3-minute demo flow

1. **Open `/button-hell`** — point out how many buttons there are ("good luck finding export").
2. **Alt + V**, say *"我想导出数据"* → cursor flies to 导出. (Or type it if the room is noisy.)
3. **Alt + S** twice — show you can toggle the assistant cursor off/on.
4. **Go to `/wiki` → 启动导航教程** on *导出报表为PDF* — walk the 4-step guided tour.
5. Mention the SDK is framework-agnostic and drops into any web app.

---

## 5. Tips & gotchas

- **Voice is Chrome-only** and needs mic permission (allow it on first use). If voice misfires,
  just type — the pipeline is identical.
- **Speak/​type in Chinese** — the knowledge base and demo UI are Chinese.
- If a match looks wrong, the widget shows the agent's **reasoning** and confidence — useful to
  explain how it "thinks."
- First query after a page load may take a moment while the DOM is scanned.
- The cursor and tour HUD live above the page (Shadow DOM), so they persist across navigation
  during a guided tour.

---

## 6. Roadmap

- **Spoken replies (read the answer aloud)** are not wired yet. The design for doing this with
  MiniMax TTS is captured in [`docs/FUTURE_MINIMAX_TTS.md`](docs/FUTURE_MINIMAX_TTS.md).
