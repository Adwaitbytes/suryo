"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationStatus, StreamEvent } from "@/lib/contracts";
import { ChatHttpError, readEvents, type ChatMessage, type HistoryResponse } from "./protocol";

const POLL_MS = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const storageKey = (slug: string) => `suryo:conversation:${slug}`;

function readStored(slug: string): string | null {
  try {
    const value = window.localStorage.getItem(storageKey(slug));
    return value && UUID.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStored(slug: string, id: string | null): void {
  try {
    if (id) window.localStorage.setItem(storageKey(slug), id);
    else window.localStorage.removeItem(storageKey(slug));
  } catch {
    // Storage can be blocked in third party iframes; the conversation still works for this visit.
  }
}

let localCounter = 0;
const localId = () => `local:${Date.now().toString(36)}:${(localCounter++).toString(36)}`;

function fromHistory(m: HistoryResponse["messages"][number]): ChatMessage {
  return { ...m, key: m.id, tools: [], state: "done" };
}

export type ChatPhase = "loading" | "ready" | "sending";

export function useChat({ slug, initialConversationId }: { slug: string; initialConversationId: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConversationStatus>("active");
  const [phase, setPhase] = useState<ChatPhase>("loading");
  const [online, setOnline] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  const conversationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seenIds = useRef(new Set<string>());
  const cursorRef = useRef<string | null>(null);

  const remember = useCallback((list: ChatMessage[]) => {
    for (const m of list) if (!m.id.startsWith("local:")) seenIds.current.add(m.id);
    const last = list.filter((m) => !m.id.startsWith("local:")).at(-1);
    if (last && (!cursorRef.current || last.createdAt > cursorRef.current)) cursorRef.current = last.createdAt;
  }, []);

  const adoptConversation = useCallback(
    (id: string | null) => {
      conversationRef.current = id;
      setConversationId(id);
      writeStored(slug, id);
    },
    [slug],
  );

  // Restore a conversation from ?c= (voice to chat switch) or from this visitor's last visit.
  useEffect(() => {
    const candidate = initialConversationId && UUID.test(initialConversationId) ? initialConversationId : readStored(slug);
    if (!candidate) {
      setPhase("ready");
      return;
    }
    // An ignore flag rather than an abort: the restore is cheap and idempotent, and aborting shows up as a failed request.
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${candidate}/messages`, { cache: "no-store" });
        if (ignore) return;
        if (res.status === 404 || res.status === 400) {
          writeStored(slug, null);
          return;
        }
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data = (await res.json()) as HistoryResponse;
        if (ignore) return;
        const restored = data.messages.filter((m) => m.role !== "system" && m.content.trim()).map(fromHistory);
        remember(restored);
        setMessages(restored);
        setStatus(data.status);
        adoptConversation(candidate);
      } catch {
        if (ignore) return;
        // A transient failure should not cost the visitor their thread: keep the id so the agent keeps context.
        adoptConversation(candidate);
      } finally {
        if (!ignore) setPhase("ready");
      }
    })();
    return () => {
      ignore = true;
    };
  }, [slug, initialConversationId, adoptConversation, remember]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Once a person may be involved, poll for operator replies; the stream alone cannot deliver them.
  const watching = status === "human" || status === "escalated";
  useEffect(() => {
    if (!watching || !conversationId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const after = cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : "";
        const res = await fetch(`/api/conversations/${conversationId}/messages${after}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as HistoryResponse;
          if (stopped) return;
          setStatus(data.status);
          for (const m of data.messages) if (!cursorRef.current || m.createdAt > cursorRef.current) cursorRef.current = m.createdAt;
          // Customer messages are already on screen locally; agent ones arrived over the stream.
          const fresh = data.messages.filter((m) => m.role === "human" && !seenIds.current.has(m.id) && m.content.trim());
          if (fresh.length) {
            const added = fresh.map(fromHistory);
            for (const m of added) seenIds.current.add(m.id);
            setMessages((prev) => [...prev, ...added]);
            setAnnouncement(`Front desk: ${added.at(-1)?.content ?? ""}`);
          }
        }
      } catch {
        // A missed poll is retried on the next tick; the offline banner covers lasting failures.
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [watching, conversationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const runTurn = useCallback(
    async (text: string, agentId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("sending");
      let finalText = "";
      let failed: string | null = null;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business: slug,
            channel: "chat",
            message: text,
            ...(conversationRef.current ? { conversationId: conversationRef.current } : {}),
          }),
          signal: controller.signal,
        });
        for await (const event of readEvents(res)) applyEvent(event);
      } catch (err) {
        if (controller.signal.aborted) return;
        failed =
          err instanceof ChatHttpError
            ? err.message
            : typeof navigator !== "undefined" && !navigator.onLine
              ? "You are offline. Your message was not sent."
              : "The connection dropped before Riya finished.";
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }

      if (failed) {
        const reason = failed;
        patch(agentId, (m) => ({ ...m, state: "error", content: m.content || reason }));
        setAnnouncement(reason);
      } else {
        const finishedId = agentId;
        // While a person owns the chat the AI stays silent, so its placeholder bubble is dropped.
        setMessages((prev) =>
          prev
            .filter((m) => !(m.id === finishedId && !m.content.trim() && m.cards.length === 0))
            .map((m) => (m.id === finishedId ? { ...m, state: "done" } : m)),
        );
        if (finalText.trim()) setAnnouncement(finalText.trim());
      }
      setPhase("ready");

      function applyEvent(event: StreamEvent) {
        switch (event.type) {
          case "conversation":
            if (event.conversationId !== conversationRef.current) adoptConversation(event.conversationId);
            setStatus(event.status);
            break;
          case "text":
            finalText += event.delta;
            patch(agentId, (m) => ({ ...m, content: m.content + event.delta }));
            break;
          case "tool":
            patch(agentId, (m) => {
              const open = m.tools.findLastIndex((t) => t.name === event.name && t.status === "start");
              if (event.status !== "start" && open !== -1) {
                const tools = m.tools.slice();
                tools[open] = { ...tools[open], status: event.status };
                return { ...m, tools };
              }
              return { ...m, tools: [...m.tools, { id: localId(), name: event.name, label: event.label, status: event.status }] };
            });
            break;
          case "card":
            patch(agentId, (m) => ({ ...m, cards: [...m.cards, event.card] }));
            break;
          case "sources":
            patch(agentId, (m) => {
              const sources = m.sources.slice();
              for (const s of event.sources) if (!sources.some((x) => x.id === s.id)) sources.push(s);
              return { ...m, sources };
            });
            break;
          case "handoff":
            if (event.reason === "human_active") setStatus("human");
            break;
          case "done":
            if (event.messageId) {
              const serverId = event.messageId;
              seenIds.current.add(serverId);
              patch(agentId, (m) => ({ ...m, id: serverId, state: "done" }));
              agentId = serverId;
            }
            break;
          case "error":
            failed = event.message;
            break;
          case "analysis":
            break;
        }
      }
    },
    [slug, adoptConversation, patch],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || phase !== "ready") return false;
      const now = new Date().toISOString();
      const agentId = localId();
      const customerId = localId();
      setMessages((prev) => [
        ...prev,
        { id: customerId, key: customerId, role: "customer", content: text, cards: [], sources: [], tools: [], state: "done", createdAt: now },
        { id: agentId, key: agentId, role: "agent", content: "", cards: [], sources: [], tools: [], state: "streaming", createdAt: now, retryText: text },
      ]);
      void runTurn(text, agentId);
      return true;
    },
    [phase, runTurn],
  );

  const retry = useCallback(
    (agentId: string) => {
      const failed = messages.find((m) => m.id === agentId);
      if (!failed?.retryText || phase !== "ready") return;
      patch(agentId, (m) => ({ ...m, content: "", cards: [], sources: [], tools: [], state: "streaming" }));
      void runTurn(failed.retryText, agentId);
    },
    [messages, phase, patch, runTurn],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    seenIds.current.clear();
    cursorRef.current = null;
    adoptConversation(null);
    setMessages([]);
    setStatus("active");
    setPhase("ready");
  }, [adoptConversation]);

  return { messages, conversationId, status, phase, online, announcement, send, retry, reset };
}
