# Build log

Running log of what shipped, newest last. Times are local (IST).

## 11:52 Kickoff
- Empty repo, Next.js 16.4 App Router scaffold, TypeScript strict, Tailwind v4.
- Stack decisions:
  - Brain: Claude Haiku 5.5 for live turns (thinking disabled for latency), Claude Sonnet 5.5 for summaries, onboarding extraction and the eval judge.
  - Voice: Gemini Live native audio (`gemini-3.1-flash-live-preview`) from the browser with ephemeral tokens. Speech to speech removes the STT to LLM to TTS hops, and VAD plus barge in are native. Hindi and Hinglish are handled by the same model.
  - Retrieval: Neon Postgres with pgvector (HNSW, 768 dim Gemini embeddings) plus Postgres full text search, fused with reciprocal rank fusion.
  - Email: Gmail SMTP through nodemailer with an RFC 5545 calendar invite attached.

## Lead: foundation
- `lib/contracts.ts`: every shared type, the NDJSON stream protocol and eval types.
- `lib/db/schema.ts`: 17 tables. Partial unique index `appointments_live_slot_uq` makes a second live booking on one slot impossible at the database level.
- `lib/agent/actions.ts`: 12 tools with Zod schemas, one implementation shared by chat, voice and evals. Booking is a conditional `UPDATE slots SET status='booked' WHERE status='open'` inside a transaction.
- `lib/agent/run.ts`: stage machine prompt, parallel knowledge prefetch, exact tool trace replay across turns, deterministic escalation rules (emergency, human request, sentiment trend, repeated low confidence).
- `lib/seed/*`: Kesar Dental & Skin (fictional, Indore), 5 doctors, 12 priced services, 20 knowledge articles, 14 days of slots, seeded history.
- Tests: 14 passing, including a real database race where two bookings hit one slot at the same instant and exactly one wins.

### Latency findings
- Haiku 5.5 first token: about 0.9 s from this laptop.
- Haiku 5.5 thinks by default. That burned the output budget and stalled tool calls, so thinking is disabled for live turns.
- The knowledge prefetch runs in parallel with history loading, so most FAQ answers need a single model call.
- Tool audit writes and confirmation email are off the critical path.

## Specialists and integration
- Voice: Gemini Live call screen with barge in, verified with real speech in a browser. Median voice to first audio about 1.5 s on tool turns.
- Chat, widget, demo site, landing, pitch route.
- Operator console: SSE live view with polling fallback, takeover with drafted replies, CRM, follow ups, analytics, orders.
- Onboarding from a URL (5 real sites, 12 to 34 s) and from documents (PDF, DOCX, TXT, MD, CSV, about 10 s); a prompt injection planted in a document was ignored.
- Online store demo (Saanjh Studio, fictional): order tools with policy enforced in code.
- Resilience: Gemini key pool with quota failover, cached embeddings with keyword fallback, voice model chain with auto reconnect.

## Evals
- 19 of 35, then 24 of 35, then 31 of 35 after fixing root causes in the agent.
- 34 of 43 with store scenarios added, during which Embedding 1 hit its daily cap.
- 37 of 43 after moving to Embedding 2 and re-embedding every chunk.
