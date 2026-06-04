# Future: Spoken replies via MiniMax TTS

**Status:** designed, not implemented. This captures the research so spoken answers
("read the reasoning aloud") can be added later without re-investigating.

## Background

- Voice **input** already works via the browser Web Speech API (`SpeechInput` in the SDK) — no
  backend, Chrome-only.
- **MiniMax has NO speech-to-text API.** Its audio offering is synthesis only: Text-to-Speech
  (T2A v2), voice cloning, and voice design. So MiniMax is the right choice for **output** (TTS),
  not input.

## MiniMax T2A v2 contract (verified June 2026)

```
POST {MINIMAX_API_URL}/t2a_v2          # e.g. https://api.minimax.chat/v1/t2a_v2
Authorization: Bearer {MINIMAX_API_KEY}
Content-Type: application/json
```

Request body:
```json
{
  "model": "speech-02-hd",
  "text": "点击这里展开导出、备份等更多功能",
  "stream": false,
  "output_format": "hex",
  "voice_setting": { "voice_id": "male-qn-qingse", "speed": 1.0, "vol": 1.0, "pitch": 0 },
  "audio_setting": { "format": "mp3", "sample_rate": 32000 }
}
```

Response (non-streaming):
```json
{
  "data": { "audio": "<hex-encoded mp3 bytes>", "status": 2 },
  "extra_info": { "audio_length": 1200, "audio_format": "mp3", ... },
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

The audio is at `data.audio` as **hex-encoded mp3** (default). Decode hex → bytes → play.

### ⚠️ GroupId risk
Some MiniMax hosts/accounts require a `GroupId` **query parameter**
(`{MINIMAX_API_URL}/t2a_v2?GroupId=...`) in addition to the Bearer key — even though the existing
`/text/chatcompletion_v2` call works without one. If T2A returns an auth error (e.g.
`base_resp.status_code` 1004/2049), set `MINIMAX_GROUP_ID` and append it as a query param.
**Make TTS non-fatal:** the cursor + tooltip must keep working if synthesis fails.

## Implementation sketch

### Backend — `show-me-agent/api/routes/tts.py` (new)
- `POST /api/v1/tts` body `{ text, voice_id?, speed? }`.
- Reuse the `httpx.AsyncClient` + Bearer pattern from `engine/llm_selector.py::_call_minimax`
  (read `MINIMAX_API_KEY`, `MINIMAX_API_URL`).
- Call `t2a_v2` (append `?GroupId={MINIMAX_GROUP_ID}` only if that env is set).
- Decode `data.audio` hex → bytes; return
  `fastapi.Response(content=bytes, media_type="audio/mpeg")`.
- On error / missing audio: HTTP 502 with the MiniMax `base_resp` message.
- Register in `main.py` next to the other `/api/v1` routers.
- No new pip deps (httpx already present; no multipart needed — text in, audio out).

### `.env.example` additions
```
MINIMAX_GROUP_ID=your_group_id_here   # only if T2A returns an auth error
MINIMAX_TTS_MODEL=speech-02-hd
MINIMAX_TTS_VOICE=male-qn-qingse
```

### SDK — `show-me-sdk/packages/core/src/`
- `client/AgentClient.ts`: `synthesize(text, opts?): Promise<Blob>` → `POST ${endpoint}/api/v1/tts`,
  return `response.blob()`.
- `voice/SpeechOutput.ts` (new): `speak(blob)` plays one reused `HTMLAudioElement` (revoke the
  previous object URL so replies don't overlap); `stop()`.
- `sdk.ts`: `speak(text)` = `synthesize` then `SpeechOutput.speak`, swallowing errors. In
  `query()`, if `config.speakReplies`, fire-and-forget `this.speak(response.result.reasoning)`
  after the cursor flies. Also speak each Journey step `hint`.
- `types.ts`: add `speakReplies?: boolean`, `ttsVoice?: string` to `ShowMeConfig`.
- Export `SpeechOutput` from `index.ts`.

### Angular
- `ShowMeService.init()` constructs `new ShowMeSDK({ ..., speakReplies: true })`.
- Optional: a navbar/widget toggle to mute spoken replies.

## Notes
- Autoplay policy: replies play after a user gesture (submitting a query / pressing a hotkey), so
  playback is allowed.
- Voice IDs: MiniMax Chinese presets include `male-qn-qingse`, `female-shaonv`,
  `audiobook_male_1`, etc. Expose via `MINIMAX_TTS_VOICE`.
- Models: `speech-02-hd` (quality) vs `speech-02-turbo` (latency). Turbo is better for snappy demos.
