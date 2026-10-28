/** Browser audio plumbing for the live call: 16 kHz PCM16 capture, 24 kHz gapless playback, level meters. */

export const INPUT_SAMPLE_RATE = 16_000;
export const OUTPUT_SAMPLE_RATE = 24_000;
export const INPUT_MIME = `audio/pcm;rate=${INPUT_SAMPLE_RATE}`;

/** Samples per posted capture frame: 32 ms at 16 kHz keeps latency low without flooding the socket. */
const FRAME_SAMPLES = 512;

/**
 * The worklet resamples from the device rate with a box filter (cheap, good enough for speech
 * which carries little energy above 8 kHz) and converts to little endian PCM16 frames.
 * Inlined as a Blob URL so the call screen has no extra static asset to deploy.
 */
const CAPTURE_WORKLET = `
class SuryoCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${INPUT_SAMPLE_RATE};
    this.acc = 0; this.sum = 0; this.count = 0;
    this.frame = new Int16Array(${FRAME_SAMPLES}); this.length = 0;
    this.energy = 0; this.energyCount = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = channel[i];
      this.energy += s * s; this.energyCount++;
      this.sum += s; this.count++; this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0; this.count = 0;
        this.frame[this.length++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.length === this.frame.length) {
          const rms = Math.sqrt(this.energy / Math.max(1, this.energyCount));
          this.port.postMessage({ pcm: this.frame.buffer, rms }, [this.frame.buffer]);
          this.frame = new Int16Array(${FRAME_SAMPLES}); this.length = 0;
          this.energy = 0; this.energyCount = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("suryo-capture", SuryoCapture);
`;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

/** Reads `rate=24000` from a Gemini inline data mime type. */
export function sampleRateFromMime(mimeType: string | undefined): number {
  const match = mimeType?.match(/rate=(\d+)/);
  return match ? Number(match[1]) : OUTPUT_SAMPLE_RATE;
}

/** Mean level (0..1) of an analyser's time domain signal, shaped so quiet speech still registers. */
export function analyserLevel(analyser: AnalyserNode, scratch: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const v = (scratch[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / scratch.length);
  return Math.min(1, Math.pow(rms * 4, 0.7));
}

export type MicFrame = { base64: string; rms: number };

export type MicErrorKind = "denied" | "unavailable" | "unsupported";

export class MicError extends Error {
  constructor(
    readonly kind: MicErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Opens the microphone. Must run inside (or right after) a user gesture on mobile browsers. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicError("unsupported", "This browser cannot use the microphone here. Try Chrome or Safari over https.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicError("denied", "Microphone access is blocked. Allow it in your browser settings, or continue in chat.");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new MicError("unavailable", "No microphone was found on this device. You can continue in chat.");
    }
    throw new MicError("unavailable", "The microphone could not start. Close other apps using it and try again.");
  }
}

export class MicCapture {
  readonly analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private workletUrl: string | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly onFrame: (frame: MicFrame) => void,
  ) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
  }

  async start(): Promise<void> {
    this.workletUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(this.workletUrl);
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "suryo-capture", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
    this.node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      this.onFrame({ base64: arrayBufferToBase64(event.data.pcm), rms: event.data.rms });
    };
    this.source.connect(this.node);
    this.source.connect(this.analyser);
  }

  setEnabled(enabled: boolean): void {
    for (const track of this.stream.getAudioTracks()) track.enabled = enabled;
  }

  stop(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.analyser.disconnect();
    for (const track of this.stream.getTracks()) track.stop();
    if (this.workletUrl) URL.revokeObjectURL(this.workletUrl);
    this.node = null;
    this.source = null;
    this.workletUrl = null;
  }
}

/**
 * Schedules PCM chunks back to back on the audio clock so there are no gaps between
 * network packets, and can drop everything instantly when the caller barges in.
 */
export class PcmPlayer {
  readonly analyser: AnalyserNode;
  private readonly gain: GainNode;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private playhead = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly onDrain: () => void,
  ) {
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.72;
    this.gain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  get playing(): boolean {
    return this.sources.size > 0;
  }

  enqueue(base64: string, sampleRate: number): void {
    const pcm = base64ToInt16(base64);
    if (pcm.length === 0) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    // A small lead absorbs jitter on the first chunk; later chunks butt up against the playhead.
    const startAt = Math.max(this.playhead, this.ctx.currentTime + 0.04);
    source.start(startAt);
    this.playhead = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      if (this.sources.size === 0) this.scheduleDrainCheck();
    };
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
  }

  /** Stops every scheduled chunk immediately. */
  flush(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // stop() throws if the node already finished; nothing left to silence.
      }
      source.disconnect();
    }
    this.sources.clear();
    this.playhead = 0;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
  }

  dispose(): void {
    this.flush();
    this.gain.disconnect();
    this.analyser.disconnect();
  }

  // Packets can arrive a few ms apart; wait briefly before declaring the agent done speaking.
  private scheduleDrainCheck(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      if (this.sources.size === 0) this.onDrain();
    }, 180);
  }
}
