import { GoogleGenAI, Modality, type FunctionCall, type FunctionResponse, type LiveServerMessage, type Session } from "@google/genai";
import type { Card, ConversationStatus } from "@/lib/contracts";
import { MicCapture, MicError, PcmPlayer, analyserLevel, openMicrophone, sampleRateFromMime, INPUT_MIME, type MicFrame } from "./audio";
import { CALL_CONNECTED_CUE, CALL_RESUMED_CUE, type VoiceSessionResponse, type VoiceToolStreamLine, type VoiceTurnRequest, type VoiceTurnResponse } from "./protocol";
import { TOOL_LABELS } from "./labels";

export type CallPhase = "idle" | "starting" | "connecting" | "live" | "human" | "ended" | "error";
export type AgentActivity = "listening" | "thinking" | "speaking";
export type CallErrorKind = "mic-denied" | "mic-unavailable" | "session" | "dropped" | "rate-limited";

const MAX_RECONNECTS = 3;

export type Caption = {
  id: string;
  role: "customer" | "agent" | "human";
  text: string;
  final: boolean;
  interrupted?: boolean;
};

export type CallAction = {
  id: string;
  name: string;
  label: string;
  status: "running" | "done" | "error";
  cards: Card[];
  at: number;
};

export type CallState = {
  phase: CallPhase;
  activity: AgentActivity;
  muted: boolean;
  conversationId: string | null;
  agentName: string;
  businessName: string;
  connectedAt: number | null;
  endedAt: number | null;
  captions: Caption[];
  actions: CallAction[];
  latency: { last: number | null; average: number | null; samples: number };
  handoff: { reason: string } | null;
  error: { kind: CallErrorKind; message: string } | null;
};

export type CallLevels = { mic: number; agent: number; bins: Uint8Array<ArrayBuffer> | null };

type HumanMessage = { id: string; role: string; content: string; createdAt: string };

const POLL_MS = 2000;
const MAX_CAPTIONS = 40;
/** Local VAD: frames louder than the adaptive floor by this factor count as speech. */
const SPEECH_FACTOR = 3.2;
const SPEECH_MIN_RMS = 0.012;
/** Silence after speech before the state flips to Thinking. */
const THINKING_AFTER_MS = 450;

type ToolCallCancel = { cancelled: boolean };

/**
 * Owns one live call: microphone, Gemini Live session, playback, tool execution,
 * transcript persistence and human takeover polling. Framework free; React subscribes to it.
 */
export class VoiceCall {
  private state: CallState;
  private readonly listeners = new Set<() => void>();

  private ctx: AudioContext | null = null;
  private mic: MicCapture | null = null;
  private player: PcmPlayer | null = null;
  private session: Session | null = null;
  private closingIntentionally = false;
  /** Model fallback index; bumped on every automatic reconnect. */
  private attempt = 0;
  private reconnects = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private lastSeenAt: string | null = null;
  private readonly seenHumanIds = new Set<string>();
  private captionSeq = 0;
  private readonly micScratch = new Uint8Array(1024);
  private readonly agentBins = new Uint8Array(256);
  private readonly agentScratch = new Uint8Array(512);

  // Turn bookkeeping: Gemini streams transcripts of both sides; we persist them at turnComplete.
  private customerBuffer = "";
  private nextCustomerBuffer = "";
  private agentBuffer = "";
  private agentSpokeThisTurn = false;
  private turnInterrupted = false;
  private customerCaptionId: string | null = null;
  private agentCaptionId: string | null = null;

  // Latency: end of the caller's speech (local VAD) to the first agent audio chunk.
  private noiseFloor = 0.004;
  private lastSpeechAt = 0;
  private lastTranscriptAt = 0;
  private awaitingReply = false;
  private turnLatency: number | null = null;
  private latencyTotal = 0;

  private readonly pendingTools = new Map<string, ToolCallCancel>();

  constructor(private readonly business: string, defaults: { agentName: string; businessName: string }) {
    this.state = {
      phase: "idle",
      activity: "listening",
      muted: false,
      conversationId: null,
      agentName: defaults.agentName,
      businessName: defaults.businessName,
      connectedAt: null,
      endedAt: null,
      captions: [],
      actions: [],
      latency: { last: null, average: null, samples: 0 },
      handoff: null,
      error: null,
    };
  }

  /* ------------------------------ store ------------------------------ */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CallState => this.state;

  private set(patch: Partial<CallState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Read every animation frame by the visualiser; deliberately outside React state. */
  levels(): CallLevels {
    const mic = this.mic && !this.state.muted ? analyserLevel(this.mic.analyser, this.micScratch) : 0;
    let agent = 0;
    let bins: Uint8Array<ArrayBuffer> | null = null;
    if (this.player) {
      agent = analyserLevel(this.player.analyser, this.agentScratch);
      this.player.analyser.getByteFrequencyData(this.agentBins);
      bins = this.agentBins;
    }
    return { mic, agent, bins };
  }

  /* ---------------------------- lifecycle ---------------------------- */

  /** Must be called from a click or tap so the browser lets audio start. */
  async start(): Promise<void> {
    if (this.state.phase === "starting" || this.state.phase === "connecting" || this.state.phase === "live") return;
    this.reset();
    this.set({ phase: "starting", error: null });

    const AudioCtor = window.AudioContext;
    const ctx = new AudioCtor({ latencyHint: "interactive" });
    this.ctx = ctx;
    // Resume inside the gesture; iOS Safari refuses once the tap's activation has been consumed.
    const resumed = ctx.resume();

    let stream: MediaStream;
    try {
      stream = await openMicrophone();
      await resumed;
    } catch (err) {
      await this.teardownAudio();
      const micError = err instanceof MicError ? err : new MicError("unavailable", "The microphone could not start.");
      this.set({
        phase: "error",
        error: { kind: micError.kind === "denied" ? "mic-denied" : "mic-unavailable", message: micError.message },
      });
      return;
    }

    this.set({ phase: "connecting" });
    try {
      this.player = new PcmPlayer(ctx, () => this.onPlaybackDrained());
      this.mic = new MicCapture(ctx, stream, (frame) => this.onMicFrame(frame));
      await this.mic.start();
    } catch (err) {
      for (const track of stream.getTracks()) track.stop();
      await this.teardownAudio();
      this.set({ phase: "error", error: { kind: "mic-unavailable", message: describe(err, "Audio could not start on this device.") } });
      return;
    }

    let session: VoiceSessionResponse;
    try {
      session = await this.createSession();
    } catch (err) {
      await this.teardownAudio();
      const rateLimited = err instanceof HttpError && err.status === 429;
      this.set({
        phase: "error",
        error: { kind: rateLimited ? "rate-limited" : "session", message: describe(err, "We could not reach the voice line.") },
      });
      return;
    }
    this.set({ conversationId: session.conversationId, agentName: session.agentName, businessName: session.businessName });

    try {
      try {
        await this.openLive(session);
      } catch (first) {
        // The first model may be out of quota; try the next one before telling the caller.
        reportBackground("voice connect failed, trying the next model", first);
        this.attempt += 1;
        session = await this.createSession(session.conversationId);
        await this.openLive(session);
      }
    } catch (err) {
      await this.teardownAudio();
      void this.endConversation("abandoned");
      this.set({ phase: "error", error: { kind: "session", message: describe(err, "We could not connect the call.") } });
      return;
    }

    this.set({ phase: "live", activity: "thinking", connectedAt: Date.now() });
    this.session?.sendClientContent({ turns: CALL_CONNECTED_CUE, turnComplete: true });
    this.startPolling();
  }

  async end(): Promise<void> {
    const phase = this.state.phase;
    if (phase !== "live" && phase !== "human" && phase !== "connecting") return;
    const unfinished = this.flushTurn();
    this.closeSession();
    this.stopPolling();
    await this.teardownAudio();
    this.set({ phase: "ended", endedAt: Date.now(), activity: "listening" });
    // The summary is written at end, so the last exchange has to land first.
    if (unfinished) await unfinished;
    await this.endConversation("completed");
  }

  /** Called on page hide; must be synchronous, so it uses a beacon. */
  abandon(): void {
    const { phase, conversationId } = this.state;
    if (!conversationId || (phase !== "live" && phase !== "human" && phase !== "connecting")) return;
    const turn = this.takeTurn();
    if (turn) navigator.sendBeacon("/api/voice/turn", new Blob([JSON.stringify(turn)], { type: "application/json" }));
    const payload = new Blob([JSON.stringify({ reason: "abandoned" })], { type: "application/json" });
    navigator.sendBeacon(`/api/conversations/${conversationId}/end`, payload);
    this.closeSession();
    this.stopPolling();
    void this.teardownAudio();
    this.set({ phase: "ended", endedAt: Date.now() });
  }

  toggleMute(): void {
    const muted = !this.state.muted;
    this.mic?.setEnabled(!muted);
    // Tells the server VAD the stream paused, so a half spoken sentence is not left hanging.
    if (muted && this.session && this.state.phase === "live") this.session.sendRealtimeInput({ audioStreamEnd: true });
    this.set({ muted });
  }

  /** Text reply while a human coordinator owns the conversation. */
  async sendText(text: string): Promise<void> {
    const message = text.trim();
    const { conversationId } = this.state;
    if (!message || !conversationId) return;
    this.pushCaption({ role: "customer", text: message, final: true });
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: this.business, conversationId, channel: "voice", message }),
    });
    if (!res.ok) throw new HttpError(res.status, await errorMessage(res, "Your message did not send. Try again."));
    // The chat route streams events; when a human owns the conversation it only acknowledges.
    await res.text();
  }

  dispose(): void {
    this.closeSession();
    this.stopPolling();
    void this.teardownAudio();
  }

  private reset(): void {
    this.attempt = 0;
    this.reconnects = 0;
    this.customerBuffer = "";
    this.nextCustomerBuffer = "";
    this.agentBuffer = "";
    this.agentSpokeThisTurn = false;
    this.turnInterrupted = false;
    this.customerCaptionId = null;
    this.agentCaptionId = null;
    this.awaitingReply = false;
    this.turnLatency = null;
    this.latencyTotal = 0;
    this.lastSeenAt = null;
    this.seenHumanIds.clear();
    this.pendingTools.clear();
    this.set({
      muted: false,
      conversationId: null,
      connectedAt: null,
      endedAt: null,
      captions: [],
      actions: [],
      latency: { last: null, average: null, samples: 0 },
      handoff: null,
      error: null,
      activity: "listening",
    });
  }

  private async openLive(session: VoiceSessionResponse): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: session.token, httpOptions: { apiVersion: "v1alpha" } });
    this.closingIntentionally = false;
    this.session = await ai.live.connect({
      model: session.model,
      // Everything else (prompt, tools, voice, transcription) is locked into the token server side.
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (message) => this.onServerMessage(message),
        onerror: () => this.onSocketLost("The line dropped. Check your connection and call again."),
        onclose: (event) => {
          if (!this.closingIntentionally) {
            this.onSocketLost(event.reason ? `The call ended unexpectedly: ${event.reason}` : "The line dropped. Check your connection and call again.");
          }
        },
      },
    });
  }

  /**
   * A dropped line (network blip, quota, model hiccup) reconnects on the next voice model
   * with the transcript so far, so the caller hears "I am back" instead of silence.
   */
  private async reconnect(message: string): Promise<void> {
    const { conversationId } = this.state;
    this.reconnects += 1;
    this.attempt += 1;
    this.player?.flush();
    this.set({ activity: "thinking" });
    try {
      const session = await this.createSession(conversationId ?? undefined);
      await this.openLive(session);
      const recent = this.state.captions
        .filter((c) => c.text.trim())
        .slice(-8)
        .map((c) => `${c.role === "customer" ? "Caller" : c.role === "human" ? "Staff" : "You"}: ${c.text}`)
        .join("\n");
      this.session?.sendClientContent({ turns: `${CALL_RESUMED_CUE}\nConversation so far:\n${recent || "(nothing yet)"}`, turnComplete: true });
    } catch (err) {
      reportBackground("voice reconnect failed", err);
      this.failCall(message);
    }
  }

  private async createSession(conversationId?: string): Promise<VoiceSessionResponse> {
    const res = await fetch("/api/voice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: this.business, conversationId, attempt: this.attempt }),
    });
    if (!res.ok) throw new HttpError(res.status, await errorMessage(res, "We could not reach the voice line."));
    return (await res.json()) as VoiceSessionResponse;
  }

  private closeSession(): void {
    for (const pending of this.pendingTools.values()) pending.cancelled = true;
    this.pendingTools.clear();
    if (!this.session) return;
    this.closingIntentionally = true;
    this.session.close();
    this.session = null;
  }

  private async teardownAudio(): Promise<void> {
    this.mic?.stop();
    this.mic = null;
    this.player?.dispose();
    this.player = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") {
      await ctx.close().catch((err: unknown) => {
        // Closing a context is best effort; a failure here leaves nothing for the caller to do.
        reportBackground("audio context close failed", err);
      });
    }
  }

  private onSocketLost(message: string): void {
    if (this.state.phase !== "live" && this.state.phase !== "connecting") return;
    this.session = null;
    if (this.state.phase === "live" && this.reconnects < MAX_RECONNECTS) {
      void this.reconnect(message);
      return;
    }
    this.failCall(message);
  }

  private failCall(message: string): void {
    this.stopPolling();
    void this.teardownAudio();
    void this.endConversation("abandoned");
    this.set({ phase: "error", error: { kind: "dropped", message } });
  }

  private async endConversation(reason: "completed" | "abandoned"): Promise<void> {
    const { conversationId } = this.state;
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        keepalive: true,
      });
      if (!res.ok) reportBackground("end conversation failed", new HttpError(res.status, res.statusText));
    } catch (err) {
      reportBackground("end conversation failed", err);
    }
  }

  /* ------------------------------ audio ------------------------------ */

  private onMicFrame(frame: MicFrame): void {
    if (this.state.muted || this.state.phase !== "live" || !this.session) return;
    this.session.sendRealtimeInput({ audio: { data: frame.base64, mimeType: INPUT_MIME } });

    const now = performance.now();
    const speaking = frame.rms > Math.max(SPEECH_MIN_RMS, this.noiseFloor * SPEECH_FACTOR);
    if (speaking) {
      // Echo of the agent's own voice is not the caller; only count speech while the agent is quiet
      // or when it is loud enough to be a genuine barge in.
      if (!this.player?.playing || frame.rms > SPEECH_MIN_RMS * 4) this.lastSpeechAt = now;
    } else {
      this.noiseFloor = this.noiseFloor * 0.97 + frame.rms * 0.03;
    }
    if (
      this.awaitingReply &&
      this.state.activity === "listening" &&
      !this.player?.playing &&
      now - Math.max(this.lastSpeechAt, this.lastTranscriptAt) > THINKING_AFTER_MS
    ) {
      this.set({ activity: "thinking" });
    }
  }

  private onPlaybackDrained(): void {
    if (this.state.phase === "live" && this.state.activity === "speaking") this.set({ activity: "listening" });
  }

  /* --------------------------- server events --------------------------- */

  private onServerMessage(message: LiveServerMessage): void {
    if (message.toolCall?.functionCalls?.length) void this.handleToolCalls(message.toolCall.functionCalls);
    if (message.toolCallCancellation?.ids) {
      for (const id of message.toolCallCancellation.ids) {
        const pending = this.pendingTools.get(id);
        if (pending) pending.cancelled = true;
      }
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) this.onInterrupted();

    const heard = content.inputTranscription?.text;
    if (heard) this.onCustomerTranscript(heard);

    for (const part of content.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data && part.inlineData?.mimeType?.startsWith("audio/")) this.onAgentAudio(data, sampleRateFromMime(part.inlineData.mimeType));
    }

    const said = content.outputTranscription?.text;
    if (said) this.onAgentTranscript(said);

    if (content.turnComplete) this.onTurnComplete();
  }

  private onCustomerTranscript(text: string): void {
    this.lastTranscriptAt = performance.now();
    if (this.agentSpokeThisTurn) {
      // The caller has started their next turn while the agent is still finishing this one.
      this.nextCustomerBuffer += text;
    } else {
      this.customerBuffer += text;
    }
    this.awaitingReply = true;
    if (!this.customerCaptionId || this.agentCaptionId) {
      this.agentCaptionId = null;
      this.customerCaptionId = this.pushCaption({ role: "customer", text: text.trimStart(), final: false });
    } else {
      this.appendCaption(this.customerCaptionId, text);
    }
    if (this.state.activity !== "listening" && !this.player?.playing) this.set({ activity: "listening" });
  }

  private onAgentAudio(base64: string, sampleRate: number): void {
    if (!this.player) return;
    if (!this.agentSpokeThisTurn) {
      this.agentSpokeThisTurn = true;
      if (this.awaitingReply) {
        const ended = Math.max(this.lastSpeechAt, this.lastTranscriptAt);
        const latency = Math.round(performance.now() - ended);
        if (ended > 0 && latency > 0 && latency < 20_000) this.recordLatency(latency);
      }
      this.awaitingReply = false;
    }
    this.player.enqueue(base64, sampleRate);
    if (this.state.activity !== "speaking") this.set({ activity: "speaking" });
  }

  private onAgentTranscript(text: string): void {
    this.agentBuffer += text;
    if (!this.agentCaptionId) {
      this.customerCaptionId = null;
      this.agentCaptionId = this.pushCaption({ role: "agent", text: text.trimStart(), final: false });
    } else {
      this.appendCaption(this.agentCaptionId, text);
    }
  }

  /** Barge in: the caller spoke over the agent, so silence it immediately. */
  private onInterrupted(): void {
    this.player?.flush();
    this.turnInterrupted = true;
    if (this.agentCaptionId) {
      const id = this.agentCaptionId;
      this.updateCaption(id, (c) => ({ ...c, interrupted: true, final: true }));
    }
    this.set({ activity: "listening" });
  }

  private onTurnComplete(): void {
    const payload = this.takeTurn();
    if (!this.player?.playing && this.state.activity !== "listening") this.set({ activity: "listening" });
    if (payload) void this.persistTurn(payload);
  }

  /** Persists whatever was said in a turn that will never see turnComplete (end call, takeover). */
  private flushTurn(): Promise<void> | null {
    const payload = this.takeTurn();
    return payload ? this.persistTurn(payload) : null;
  }

  /** Moves the buffered transcripts of the current turn into a payload and resets for the next turn. */
  private takeTurn(): VoiceTurnRequest | null {
    const customerText = this.customerBuffer.trim();
    const agentText = this.agentBuffer.trim();
    const payload: VoiceTurnRequest = {
      conversationId: this.state.conversationId ?? "",
      customerText,
      agentText,
      latencyMs: this.turnLatency,
      interrupted: this.turnInterrupted,
    };
    this.customerBuffer = this.nextCustomerBuffer;
    this.nextCustomerBuffer = "";
    this.agentBuffer = "";
    this.agentSpokeThisTurn = false;
    this.turnInterrupted = false;
    this.turnLatency = null;
    this.agentCaptionId = null;
    if (!this.customerBuffer) this.customerCaptionId = null;
    this.set({ captions: this.state.captions.map((c) => (c.final ? c : { ...c, final: true })) });
    return payload.conversationId && (customerText || agentText) ? payload : null;
  }

  private recordLatency(ms: number): void {
    this.turnLatency = ms;
    this.latencyTotal += ms;
    const samples = this.state.latency.samples + 1;
    this.set({ latency: { last: ms, average: Math.round(this.latencyTotal / samples), samples } });
  }

  private async persistTurn(payload: VoiceTurnRequest): Promise<void> {
    try {
      const res = await fetch("/api/voice/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new HttpError(res.status, await errorMessage(res, "turn not saved"));
      const result = (await res.json()) as VoiceTurnResponse;
      if (result.handoff && !this.state.handoff) this.onHandoff(result.handoff);
      this.onStatus(result.status);
    } catch (err) {
      // The call itself carries on; the transcript gap is visible in the console instead.
      reportBackground("voice turn persist failed", err);
    }
  }

  /* ------------------------------- tools ------------------------------- */

  private async handleToolCalls(calls: FunctionCall[]): Promise<void> {
    this.set({ activity: "thinking" });
    const responses = await Promise.all(calls.map((call) => this.runTool(call)));
    const live = responses.filter((r): r is FunctionResponse => r !== null);
    if (live.length && this.session && this.state.phase === "live") this.session.sendToolResponse({ functionResponses: live });
  }

  private async runTool(call: FunctionCall): Promise<FunctionResponse | null> {
    const id = call.id ?? `call_${++this.captionSeq}`;
    const name = call.name ?? "unknown";
    const cancel: ToolCallCancel = { cancelled: false };
    this.pendingTools.set(id, cancel);
    const actionId = `action_${id}`;
    this.set({
      actions: [
        ...this.state.actions,
        { id: actionId, name, label: TOOL_LABELS[name] ?? "Working on it", status: "running", cards: [], at: Date.now() },
      ],
    });

    let response: Record<string, unknown>;
    try {
      const result = await this.fetchTool(name, call.args ?? {}, (card) => this.addActionCard(actionId, card));
      this.updateAction(actionId, { status: result.ok ? "done" : "error", cards: result.cards });
      response = result.data;
      if (name === "escalate_to_human" && result.ok && !this.state.handoff) this.onHandoff("agent_escalated");
    } catch (err) {
      reportBackground(`tool ${name} failed`, err);
      this.updateAction(actionId, { status: "error" });
      response = { error: "tool_unavailable", guidance: "Apologise briefly and offer to have the front desk call back." };
    }
    this.pendingTools.delete(id);
    if (cancel.cancelled) return null;
    return { id, name, response };
  }

  /** Resolves on the result line; keeps reading the stream in the background for late cards. */
  private async fetchTool(
    name: string,
    args: Record<string, unknown>,
    onLateCard: (card: Card) => void,
  ): Promise<{ ok: boolean; data: Record<string, unknown>; cards: Card[] }> {
    const res = await fetch("/api/voice/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: this.state.conversationId, name, args }),
    });
    if (!res.ok || !res.body) throw new HttpError(res.status, await errorMessage(res, "tool failed"));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: { ok: boolean; data: Record<string, unknown>; cards: Card[] } | null = null;

    const readLines = async (): Promise<boolean> => {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const raw = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!raw) continue;
        const line = JSON.parse(raw) as VoiceToolStreamLine;
        if (line.type === "result") result = { ok: line.ok, data: line.data, cards: line.cards };
        else onLateCard(line.card);
      }
      return done;
    };

    while (!result) {
      if (await readLines()) break;
    }
    if (!result) throw new Error("tool stream ended without a result");
    void (async () => {
      try {
        while (!(await readLines())) {
          // Late cards are applied inside readLines as they arrive.
        }
      } catch (err) {
        reportBackground("late tool cards failed", err);
      }
    })();
    return result;
  }

  private updateAction(id: string, patch: Partial<CallAction>): void {
    this.set({ actions: this.state.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }

  private addActionCard(id: string, card: Card): void {
    this.set({ actions: this.state.actions.map((a) => (a.id === id ? { ...a, cards: [...a.cards, card] } : a)) });
  }

  /* --------------------------- human takeover --------------------------- */

  private onHandoff(reason: string): void {
    this.set({ handoff: { reason } });
    const exists = this.state.actions.some((a) => a.cards.some((c) => c.kind === "escalation"));
    if (exists) return;
    const card: Card = { kind: "escalation", urgency: reason === "emergency" ? "critical" : "medium", reason: handoffCopy(reason) };
    this.set({
      actions: [
        ...this.state.actions,
        { id: `handoff_${Date.now()}`, name: "escalate_to_human", label: "Connecting a human", status: "done", cards: [card], at: Date.now() },
      ],
    });
  }

  private onStatus(status: ConversationStatus): void {
    if (status === "human" && this.state.phase === "live") this.enterHumanMode();
  }

  private enterHumanMode(): void {
    void this.flushTurn();
    this.closeSession();
    void this.teardownAudio();
    this.set({ phase: "human", activity: "listening", muted: false });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async poll(): Promise<void> {
    const { conversationId } = this.state;
    if (!conversationId || this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const query = this.lastSeenAt ? `?after=${encodeURIComponent(this.lastSeenAt)}` : "";
      const res = await fetch(`/api/conversations/${conversationId}/messages${query}`, { cache: "no-store" });
      if (!res.ok) throw new HttpError(res.status, res.statusText);
      const data = (await res.json()) as { status: ConversationStatus; messages: HumanMessage[] };
      for (const message of data.messages) {
        this.lastSeenAt = message.createdAt;
        if (message.role !== "human" || this.seenHumanIds.has(message.id)) continue;
        this.seenHumanIds.add(message.id);
        this.pushCaption({ role: "human", text: message.content, final: true });
      }
      this.onStatus(data.status);
    } catch (err) {
      reportBackground("status poll failed", err);
    } finally {
      this.pollInFlight = false;
    }
  }

  /* ------------------------------ captions ------------------------------ */

  private pushCaption(caption: Omit<Caption, "id">): string {
    const id = `cap_${++this.captionSeq}`;
    const captions = [...this.state.captions, { ...caption, id }].slice(-MAX_CAPTIONS);
    this.set({ captions });
    return id;
  }

  private appendCaption(id: string, text: string): void {
    this.updateCaption(id, (c) => ({ ...c, text: c.text + text }));
  }

  private updateCaption(id: string, fn: (c: Caption) => Caption): void {
    this.set({ captions: this.state.captions.map((c) => (c.id === id ? fn(c) : c)) });
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function describe(err: unknown, fallback: string): string {
  if (err instanceof HttpError || err instanceof MicError) return err.message;
  return fallback;
}

/** Failures that do not stop the call are reported for debugging without interrupting the caller. */
function reportBackground(context: string, err: unknown): void {
  console.warn(`[voice] ${context}`, err);
}

export function handoffCopy(reason: string): string {
  switch (reason) {
    case "emergency":
      return "This sounds urgent. A coordinator is being alerted right now.";
    case "customer_request":
      return "You asked for a person. The front desk has your details.";
    case "frustration":
      return "A coordinator is stepping in to sort this out.";
    case "low_confidence":
      return "A coordinator will answer this one personally.";
    default:
      return "The front desk has the full summary and is joining.";
  }
}
