"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage, sendJson } from "./api";

export function LoginForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="w-full max-w-[360px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        try {
          await sendJson("/api/console/login", { key });
          router.replace("/console");
          router.refresh();
        } catch (err) {
          setError(errorMessage(err));
          setPending(false);
        }
      }}
    >
      <div className="grid size-10 place-items-center rounded-xl border border-border bg-surface-2 text-fg-muted">
        <KeyRound aria-hidden className="size-4" />
      </div>
      <h1 className="mt-6 font-display text-[40px] leading-none tracking-tight text-fg">Operator console</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-subtle">Enter the operator key for this workspace. It stays in a secure cookie on this device for two weeks.</p>
      <label htmlFor="operator-key" className="mt-8 block text-xs font-medium text-fg-muted">
        Operator key
      </label>
      <input
        id="operator-key"
        type="password"
        autoComplete="current-password"
        autoFocus
        style={{ outline: "none" }}
        required
        value={key}
        onChange={(e) => setKey(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "operator-key-error" : undefined}
        className="mt-2 h-11 w-full rounded-xl border border-border-strong bg-surface px-3.5 font-mono text-sm text-fg outline-none transition-colors focus:border-accent"
      />
      {error ? (
        <p id="operator-key-error" role="alert" className="mt-2 text-xs text-warning">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={pending || !key}>
        {pending ? "Checking" : "Continue"}
      </Button>
    </form>
  );
}
