<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (AI Interview Arena)
- YouTube Live tabs classify existing shows by `format === "lecture"` and use the same broadcast flow, so lectures retain their single-teacher studio and OBS scene.
- Server functions live in `src/backend/*.functions.ts`; server-only helpers in `src/backend/*.server.ts` are imported dynamically inside handlers — `src/server/**` is blocked from client imports by import protection.
- The conversation engine is client-driven turn-by-turn (`generateTurn`), with all limits (turn cap, duration, daily limit, unique turn index) enforced server-side so a client can't run an unbounded show.
- Turn/limit rules live in `src/lib/engine-rules.ts` (pure, unit-tested) and are shared by server and UI.
- Groq keys form a pool (user keys comma-separated, then GROQ_API_KEY, _2, _3); a 429/401 rotates to the next key before falling back to other engines, because free quota is per Groq account.
- AI calls use `@lovable.dev/ai-gateway` chat-completions for every agent model so OpenAI and Gemini agents share one code path; TTS defaults to the gateway; when `GEMINI_API_KEY` is set the same Gemini TTS model is called directly on Google AI Studio (PCM wrapped to WAV, zero credits logged); ElevenLabs only when its key is linked. Deepgram Aura-2 (voice_provider "deepgram") goes through the Lovable connector gateway (`udc_deepgram`), requesting raw 24 kHz PCM in ≤2,000-char pieces (`src/lib/tts-rules.ts`, tested) and wrapping them in one WAV, because Deepgram caps text per request.
- The OBS scene `/broadcast/$token` is public and authorized only by the per-interview `broadcast_token`; it reads via the admin client and returns no user ids.
- YouTube OAuth tokens are AES-GCM encrypted in `youtube_tokens` (service-role only); stream keys are fetched from YouTube on explicit reveal and never stored.
- Usage rows are written by the server with the admin client; users can only read them.
- The broadcast stage is a fixed 1280x720 canvas scaled via `--stage-scale`, shared by studio and OBS scene.
- Every show opens with two intro turns (host welcome, guest self-introduction); multi-topic shows store an ordered `interviews.topics` playlist, split show time evenly, and each message records its `topic` so only the host switches topics.
- Guest answers are forced to carry a visual (code/mermaid) when their previous answer had none (`visualRequired`), with one retry if the model omits it.
- YouTube promo: text metadata goes through `chat()` (Groq when keyed) in `promo.functions.ts`; AI thumbnails stream from the bearer-verified `/api/generate-thumbnail` route; the free VS thumbnail is drawn client-side on canvas; YouTube limits live in `src/lib/promo-rules.ts` (tested).
- Model JSON is parsed with `src/lib/json-repair.ts` (tested); Groq `json_validate_failed` drafts are salvaged from `failed_generation`, else retried as plain text, because Groq's strict JSON check often rejects code-heavy answers.
- `finishInterview` ends any linked YouTube broadcast that is live/testing (via `endLinkedBroadcasts`) when a show completes or is stopped; failures are reported, never fatal.
- Free-tier quota tracking: `src/backend/quota.server.ts` records Groq rate-limit headers and Google voice successes/429s into the service-role-only `provider_quota` table; limits/reset math lives in `src/lib/quota-rules.ts` (tested), because neither provider offers a "remaining quota" API for free keys.
- Per-user API keys (Groq, Gemini, Deepgram, Sarvam, Google Cloud TTS, ElevenLabs) are AES-GCM encrypted in service-role-only `user_api_keys` with routing prefs; `chat()` and `speakWithFallback()` try engines in the order from `src/lib/provider-rules.ts` (tested), user key before app env key, because a live show must never stop on one provider failure.
- Default voice engine is Microsoft Edge Read Aloud (voice_provider "edge", no key): `src/backend/edge-tts.server.ts` opens one WebSocket per ≤1,000-char piece (fetch-upgrade on the Worker, `new WebSocket(url,{headers})` on Node/Bun) signed by the Sec-MS-GEC v2 port in `src/lib/edge-drm.ts` (tested against edge-tts output), and is the first fallback in every voice chain, because it is free and unlimited but unofficial and may break when Microsoft changes the token.
- Lecture sign-off and code walkthrough rules live in `src/lib/lecture-rules.ts` (tested): the final lecture turn always ends with a localized "bye bye, next video" line (server appends it if missing), and code visuals carry optional `focus` line steps that the stage scrolls to and pen-highlights in step with voice progress, because the model's own pacing can't be trusted.
- MCQ quiz shows (`format === "mcq"`) are single-speaker like lectures (`isSolo`); the server builds the spoken script from the model's question/options/answer via `src/lib/mcq-rules.ts` (tested) and stores it as an `mcq` visual with `revealAt`, and the audio player pauses at `revealAt` for the countdown before the answer turns green, so timing never depends on the model.
- Voice clips retry (synthesis once, download up to 3x) and the OBS scene waits up to 90s for a clip, because a silent turn on a live stream is worse than a short delay.

- Gemini voice keys form a pool (user keys comma-separated, then GEMINI_API_KEY, _2, _3); a 429/invalid key rotates to the next before other voice engines, because free quota is per Google account.
- MCQ shows can pre-generate a verified question bank (`interview_questions`, rules in `src/lib/mcq-rules.ts`): batches at temperature 0.1, kept only if an independent AI solver picks the same answer; `generateTurn` consumes the bank before calling AI, and `finishInterview` deletes it, because live per-turn generation exhausted free token quotas.
- Shorts come from the quiz bank, store link + `short_publish_at` (never reposted), open with a hook poster (also `thumbnails.set`), use tested `buildShortMeta` (no answer-revealing titles); pictures via signed-in `/api/short-image` Pollinations proxy (browsers get Turnstile 403), optional.
