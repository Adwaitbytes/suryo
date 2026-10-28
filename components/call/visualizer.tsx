"use client";

import { useEffect, useRef } from "react";
import type { AgentActivity, CallLevels, CallPhase } from "@/lib/voice/call";

type Props = {
  levels: () => CallLevels | null;
  phase: CallPhase;
  activity: AgentActivity;
  reducedMotion: boolean;
  className?: string;
};

const RAYS = 132;
const ORBIT_POINTS = 120;
const SAFFRON = { r: 255, g: 122, b: 48 };

/**
 * A sun (Suryo) drawn in canvas 2D. The agent is the saffron disc and its corona of rays, which
 * lengthen with the spectrum of her voice. The caller is the neutral orbit around it, which ripples
 * with their microphone. Levels are read every frame straight from the analysers, never via React.
 */
export function CallVisualizer({ levels, phase, activity, reducedMotion, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ phase, activity, reducedMotion });

  useEffect(() => {
    stateRef.current = { phase, activity, reducedMotion };
  }, [phase, activity, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const rays = new Float32Array(RAYS);
    const orbit = new Float32Array(ORBIT_POINTS);
    let agent = 0;
    let mic = 0;
    let presence = 0;
    let sweep = 0;
    let echo = 0;
    let echoRadius = 0;
    let frame = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { phase: p, activity: a, reducedMotion: calm } = stateRef.current;
      const sample = levels();
      const live = p === "live";
      const dim = p === "human" || p === "ended" || p === "error";

      // Fast attack, slow release reads as alive without jitter.
      const targetAgent = live ? (sample?.agent ?? 0) : 0;
      const targetMic = live ? (sample?.mic ?? 0) : 0;
      agent += (targetAgent - agent) * (targetAgent > agent ? 0.45 : 0.08);
      mic += (targetMic - mic) * (targetMic > mic ? 0.5 : 0.1);
      presence += ((dim ? 0.35 : 1) - presence) * 0.05;

      const t = now / 1000;
      const motion = calm ? 0.25 : 1;
      const size = Math.min(width, height);
      const cx = width / 2;
      const cy = height / 2;
      const core = size * 0.155 * (1 + agent * 0.06 * motion + (calm ? 0 : Math.sin(t * 1.1) * 0.008));
      const orbitBase = size * 0.4;

      ctx.clearRect(0, 0, width, height);

      // Warm atmosphere behind the sun, strongest while she speaks.
      const glow = ctx.createRadialGradient(cx, cy, core * 0.4, cx, cy, size * 0.5);
      glow.addColorStop(0, rgba(SAFFRON, (0.16 + agent * 0.22) * presence));
      glow.addColorStop(0.55, rgba(SAFFRON, (0.04 + agent * 0.05) * presence));
      glow.addColorStop(1, rgba(SAFFRON, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Corona: rays mirror the low half of the spectrum around the disc, so it stays symmetric.
      const bins = sample?.bins;
      sweep += dt * (a === "thinking" && live ? 2.4 : 0.15) * motion;
      for (let i = 0; i < RAYS; i++) {
        const angle = (i / RAYS) * Math.PI * 2 - Math.PI / 2;
        const mirrored = i < RAYS / 2 ? i : RAYS - i;
        const bin = bins ? bins[Math.min(bins.length - 1, 2 + Math.floor((mirrored / (RAYS / 2)) * 72))] / 255 : 0;
        const idle = calm ? 0.06 : 0.05 + 0.035 * Math.sin(t * 0.9 + i * 0.45) * Math.sin(t * 0.37 + i * 0.13);
        const thinking = a === "thinking" && live ? Math.max(0, Math.cos(angle - sweep)) ** 6 * 0.35 : 0;
        const target = idle + bin * bin * 0.9 * (0.4 + agent) + thinking;
        rays[i] += (target - rays[i]) * (target > rays[i] ? 0.4 : 0.09);
        const len = core * (0.14 + rays[i] * 1.05 * motion);
        const inner = core * 1.12;
        const alpha = (0.22 + Math.min(0.7, rays[i] * 1.3)) * presence;
        ctx.strokeStyle = rgba(SAFFRON, alpha);
        ctx.lineWidth = 1.25;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * (inner + len), cy + Math.sin(angle) * (inner + len));
        ctx.stroke();
      }

      // The disc: an opaque base first so dimming reads as a cooler sun, not a see-through one.
      ctx.beginPath();
      ctx.arc(cx, cy, core, 0, Math.PI * 2);
      ctx.fillStyle = "#0b0b0d";
      ctx.fill();
      const disc = ctx.createRadialGradient(cx - core * 0.3, cy - core * 0.35, core * 0.05, cx, cy, core);
      disc.addColorStop(0, rgba({ r: 255, g: 168, b: 104 }, presence));
      disc.addColorStop(0.5, rgba(SAFFRON, presence));
      disc.addColorStop(1, rgba({ r: 214, g: 82, b: 20 }, presence));
      ctx.fillStyle = disc;
      ctx.fill();

      // Caller orbit: a fine neutral ring displaced by smooth travelling waves scaled by mic level.
      const ripple = mic * size * 0.05 * motion;
      for (let i = 0; i < ORBIT_POINTS; i++) {
        const angle = (i / ORBIT_POINTS) * Math.PI * 2;
        const wave = Math.sin(angle * 3 + t * 2.2) * 0.55 + Math.sin(angle * 5 - t * 3.1) * 0.3 + Math.sin(angle * 8 + t * 4.3) * 0.15;
        const target = orbitBase + mic * size * 0.025 + wave * ripple;
        orbit[i] += (target - orbit[i]) * 0.35;
      }
      ctx.beginPath();
      for (let i = 0; i <= ORBIT_POINTS; i++) {
        const idx = i % ORBIT_POINTS;
        const angle = (idx / ORBIT_POINTS) * Math.PI * 2;
        const x = cx + Math.cos(angle) * orbit[idx];
        const y = cy + Math.sin(angle) * orbit[idx];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(228, 228, 231, ${(0.14 + mic * 0.6) * presence})`;
      ctx.lineWidth = 1 + mic * 1.2;
      ctx.stroke();

      // A soft echo ring leaves the orbit when the caller's voice rises sharply.
      if (!calm && live && mic > 0.35 && echo < 0.05) {
        echo = 1;
        echoRadius = orbitBase;
      }
      if (echo > 0.01) {
        echoRadius += dt * size * 0.12;
        echo *= 0.94;
        ctx.beginPath();
        ctx.arc(cx, cy, echoRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(228, 228, 231, ${echo * 0.18})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [levels]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
