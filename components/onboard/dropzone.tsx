"use client";

import { FileText, FileUp, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ACCEPT_ATTRIBUTE, checkSelection, formatBytes, kindFromName, MAX_FILE_BYTES, MAX_FILES, MAX_REQUEST_BYTES } from "@/lib/onboard/limits";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

export const LIMITS_HINT = `PDF, DOCX, TXT, MD or CSV. Up to ${MAX_FILES} files, ${formatBytes(MAX_FILE_BYTES)} each and ${formatBytes(MAX_REQUEST_BYTES)} per upload, the Vercel request limit.`;

/**
 * Adds only files that pass every browser side check; the rest are reported by name. The server
 * repeats the checks and also verifies each file's leading bytes.
 */
function admit(current: File[], incoming: File[]): { files: File[]; problems: string[] } {
  const problems: string[] = [];
  const files = [...current];
  for (const file of incoming) {
    if (files.some((f) => f.name === file.name && f.size === file.size)) continue;
    const own = checkSelection([file]);
    if (own.length) {
      problems.push(...own);
      continue;
    }
    const combined = checkSelection([...files, file]);
    if (combined.length) {
      problems.push(`${file.name} was not added. ${combined[0]}`);
      continue;
    }
    files.push(file);
  }
  return { files, problems };
}

export function Dropzone({
  files,
  onChange,
  disabled = false,
  compact = false,
  label = "Drop your documents here",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  // Starting an upload clears notes about files that were never added.
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (wasDisabled !== disabled) {
    setWasDisabled(disabled);
    if (disabled) setProblems([]);
  }
  const hintId = useId();
  const errorId = useId();

  const add = (incoming: File[]) => {
    const next = admit(files, incoming);
    setProblems(next.problems);
    if (next.files.length !== files.length) onChange(next.files);
  };
  const open = () => {
    if (!disabled) inputRef.current?.click();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };
  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    depth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (!disabled) add(Array.from(e.dataTransfer.files));
  };

  const total = files.reduce((n, f) => n + f.size, 0);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={`${hintId}${problems.length ? ` ${errorId}` : ""}`}
        onClick={open}
        onKeyDown={onKeyDown}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-[border-color,background-color,box-shadow] duration-200",
          compact ? "gap-1.5 px-5 py-6" : "gap-2.5 px-6 py-10 sm:py-12",
          dragging ? "border-accent bg-accent-soft shadow-[0_0_0_4px_var(--accent-soft)]" : "border-border-strong bg-surface hover:border-fg-faint hover:bg-surface-2",
          problems.length && !dragging && "border-danger/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid place-items-center rounded-xl border bg-surface-2 transition-[transform,color,border-color] duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none",
            compact ? "size-9" : "size-11",
            dragging ? "-translate-y-0.5 border-accent/50 text-accent" : "border-border text-fg-subtle",
          )}
        >
          <FileUp className={compact ? "size-4" : "size-5"} />
        </span>
        <span className={cn("font-medium text-fg", compact ? "text-sm" : "text-[15px]")}>
          {dragging ? "Release to add" : label}
          <span className="font-normal text-fg-subtle"> or </span>
          <span className="text-accent underline decoration-accent/40 underline-offset-4 group-hover:decoration-accent">browse</span>
        </span>
        <span id={hintId} className="max-w-md text-xs leading-relaxed text-fg-subtle">
          {LIMITS_HINT}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div id={errorId} aria-live="polite">
        {problems.length ? (
          <ul className="flex flex-col gap-1 rounded-xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {files.length ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-2" aria-label="Selected documents">
            <AnimatePresence initial={false}>
              {files.map((f) => (
                <motion.li
                  key={`${f.name}-${f.size}`}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18, ease }}
                  className="flex h-9 max-w-full items-center gap-2 rounded-lg border border-border bg-surface-2 pl-2.5 pr-1 text-[13px]"
                >
                  <FileText aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 max-w-[220px] truncate text-fg" title={f.name}>
                    {f.name}
                  </span>
                  <span className="shrink-0 font-mono text-2xs uppercase text-fg-faint">{kindFromName(f.name)}</span>
                  <span className="shrink-0 font-mono text-xs tabular text-fg-subtle">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    disabled={disabled}
                    onClick={() => {
                      setProblems([]);
                      onChange(files.filter((x) => x !== f));
                    }}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <p className="pl-0.5 text-xs text-fg-subtle">
            <span className="font-mono tabular text-fg-muted">{files.length}</span> of {MAX_FILES} files,{" "}
            <span className="font-mono tabular text-fg-muted">{formatBytes(total)}</span> of {formatBytes(MAX_REQUEST_BYTES)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
