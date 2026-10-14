import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

/** Fullscreen for a container element; quietly does nothing where the browser disallows it. */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const on = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el || typeof document === "undefined") return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void el.requestFullscreen?.().catch(() => undefined);
  }, [ref]);
  return { isFs, toggle };
}

/** Round icon button used on player surfaces. `label` is required so every icon has an accessible name. */
export function IconBtn({ label, children, className, active, ...p }: { label: string; children: ReactNode; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...p}
      className={cn("grid size-10 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-foreground/15 focus-visible:bg-foreground/15 disabled:opacity-40 [&_svg]:size-5", active && "bg-foreground/15", className)}
    >
      {children}
    </button>
  );
}

/** Advances a value on a fixed beat while `running`, reading the latest callback each time. */
export function useBeat(running: boolean, ms: number, fn: (dtSeconds: number) => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => latest.current(ms / 1000), ms);
    return () => window.clearInterval(id);
  }, [running, ms]);
}

export function useKey(handler: (e: KeyboardEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && (t as HTMLInputElement).type !== "range") return;
      latest.current(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const fmtSpeed = (s: number) => `${s}x`;

export function Range({ value, max, onChange, label, valueText, className }: { value: number; max: number; onChange: (v: number) => void; label: string; valueText?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <input
      type="range"
      min={0}
      max={max}
      step="any"
      value={Math.min(value, max)}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--primary)]", className)}
      style={{ background: `linear-gradient(to right, var(--primary) ${pct}%, rgba(255,255,255,.22) ${pct}%)` }}
    />
  );
}
