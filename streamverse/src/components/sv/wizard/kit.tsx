import { AlertCircle, Check, Crop, Crosshair, FileAudio, FileText, FileVideo, GripVertical, ImagePlus, Pause, Play, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Btn, inputCls } from "../ui";

/* ------------------------------------------------------------------ data */

export const uid = () => Math.random().toString(36).slice(2, 9);

export const LANGUAGES = [
  "English", "Spanish", "French", "German", "Italian", "Portuguese", "Arabic", "Urdu", "Hindi", "Chinese", "Japanese", "Korean", "Turkish",
  "Bengali", "Dutch", "Greek", "Hebrew", "Indonesian", "Persian", "Polish", "Russian", "Swedish", "Tamil", "Thai", "Ukrainian", "Vietnamese",
];
export const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Ireland", "France", "Germany", "Italy", "Spain", "Portugal", "Netherlands", "Sweden",
  "Norway", "Denmark", "Poland", "Turkey", "Pakistan", "India", "Bangladesh", "China", "Japan", "South Korea", "Indonesia", "Thailand", "Vietnam",
  "United Arab Emirates", "Saudi Arabia", "Egypt", "Nigeria", "South Africa", "Kenya", "Brazil", "Mexico", "Argentina", "Chile", "Colombia", "New Zealand",
];
export type MediaStatus = "uploading" | "paused" | "processing" | "ready" | "error";
export interface Media {
  name: string;
  size: number;
  status: MediaStatus;
  progress: number;
  speed: number;
  eta: number;
  proc: number;
  duration?: number;
  error?: string;
  transcode?: boolean;
}
export interface Img {
  name: string;
  size: number;
  w: number;
  h: number;
  url: string;
  fx: number;
  fy: number;
  /** the image was too large to keep after a refresh, so it must be uploaded again */
  lost?: boolean;
  /** stands in for artwork the title already has (older titles) */
  placeholder?: boolean;
}
/** True when the image is really there: uploaded and still holding its pixels. */
export const imgOk = (img: Img | undefined): boolean => !!img && !img.lost && (!!img.url || !!img.placeholder);
export interface Snapshot<D> {
  d: D;
  media: Record<string, Media>;
  images: Record<string, Img>;
}
export interface Rules {
  exts: string[];
  maxBytes: number;
  kind: "video" | "audio" | "doc" | "caption";
  transcode?: boolean;
  magic?: "epub" | "pdf";
  minDur?: number;
  maxDur?: number;
}

export const MB = 1024 * 1024;
export const GB = 1024 * MB;
export const fmtBytes = (n: number) => (n >= GB ? `${(n / GB).toFixed(2)} GB` : n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fmtDur = (s?: number) => {
  if (s === undefined || !isFinite(s)) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
};
export const slugOf = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** every rendition the server produces from one master upload; each becomes ready at its `at` percent */
export const RENDITIONS = [
  { name: "480p", at: 25 },
  { name: "720p", at: 50 },
  { name: "1080p", at: 75 },
  { name: "4K", at: 100 },
] as const;
export function renditionState(m: Media, at: number, firstPending: boolean): "Waiting" | "Queued" | "Processing" | "Ready" {
  if (m.status === "uploading" || m.status === "paused") return "Waiting";
  if (m.proc >= at) return "Ready";
  return firstPending ? "Processing" : "Queued";
}

/* ------------------------------------------------------------------ context */

export interface WizardApi<D> {
  d: D;
  set: (fn: (d: D) => D) => void;
  media: Record<string, Media>;
  images: Record<string, Img>;
  errors: Record<string, string>;
  goTo: (i: number) => void;
  upload: (slot: string, file: File, rules: Rules) => Promise<void>;
  patchMedia: (slot: string, m: Media | null) => void;
  setImage: (slot: string, img: Img | null) => void;
  snap: Snapshot<D>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WizCtx = createContext<WizardApi<any> | null>(null);
export function useWiz<D>(): WizardApi<D> {
  const c = useContext(WizCtx);
  if (!c) throw new Error("Wizard context missing");
  return c as WizardApi<D>;
}

/* ------------------------------------------------------------------ file helpers */

const extOf = (n: string) => n.split(".").pop()?.toLowerCase() ?? "";
const readHead = (file: File, n: number) =>
  new Promise<Uint8Array>((res) => {
    const r = new FileReader();
    r.onload = () => res(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => res(new Uint8Array());
    r.readAsArrayBuffer(file.slice(0, n));
  });
const readText = (file: File, n: number) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => res("");
    r.readAsText(file.slice(0, n));
  });
const readUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
const loadImg = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("decode"));
    i.src = url;
  });

function probeDuration(file: File, kind: "video" | "audio"): Promise<number | undefined> {
  return new Promise((res) => {
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return res(undefined);
    const el = document.createElement(kind);
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (v?: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      res(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(isFinite(el.duration) ? el.duration : undefined);
    el.onerror = () => finish(undefined);
    window.setTimeout(() => finish(undefined), sim.probeMs);
    el.src = url;
  });
}

/** Validates a media file and registers it as an upload. Resolves with the Media that was stored. */
export async function ingestMedia(file: File, rules: Rules, put: (m: Media) => void) {
  const ext = extOf(file.name);
  const base = { name: file.name, size: file.size, progress: 0, speed: 0, eta: 0, proc: 0, ...(rules.transcode ? { transcode: true } : {}) };
  const fail = (error: string) => put({ ...base, status: "error", error });
  if (!rules.exts.includes(ext)) return fail(`.${ext || "?"} isn't supported. Accepted: ${rules.exts.map((e) => e.toUpperCase()).join(", ")}.`);
  if (file.size === 0) return fail("The file is empty.");
  if (file.size > rules.maxBytes) return fail(`The file is larger than the ${fmtBytes(rules.maxBytes)} limit.`);
  if (rules.magic) {
    const head = await readHead(file, 4);
    const ok = rules.magic === "epub" ? head[0] === 0x50 && head[1] === 0x4b : head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    if (!ok) return fail(`This doesn't look like a valid ${rules.magic.toUpperCase()} file.`);
  }
  if (rules.kind === "caption") {
    const text = (await readText(file, 200_000)).replace(/^﻿/, "");
    if (ext === "vtt" && !text.trimStart().startsWith("WEBVTT")) return fail('Invalid VTT: the file must start with "WEBVTT".');
    if (ext === "srt" && !text.includes("-->")) return fail("Invalid SRT: no timecodes were found.");
  }
  let duration: number | undefined;
  if (rules.kind === "video" || rules.kind === "audio") {
    duration = await probeDuration(file, rules.kind);
    if (duration !== undefined && duration < 1) return fail("The media is shorter than one second, so it can't be used.");
    if (duration !== undefined && ((rules.minDur && duration < rules.minDur) || (rules.maxDur && duration > rules.maxDur))) {
      toast.warning(`${file.name} is ${fmtDur(duration)}. Recommended length is ${fmtDur(rules.minDur ?? 0)} to ${fmtDur(rules.maxDur ?? 0)}.`);
    }
  }
  put({ ...base, status: "uploading", ...(duration !== undefined ? { duration } : {}) });
}

/** Simulation speed multiplier (tests raise it so uploads finish immediately). */
export const sim = { factor: 1, probeMs: 4000 };

/** One simulated tick of every in-flight upload / server-side processing job. */
export function advanceMedia(media: Record<string, Media>): Record<string, Media> | null {
  let changed = false;
  const next: Record<string, Media> = {};
  for (const [k, m] of Object.entries(media)) {
    if (m.status === "uploading") {
      changed = true;
      const step = (4 + Math.random() * 6) * sim.factor;
      const progress = Math.min(100, m.progress + step);
      const speed = 7 + Math.random() * 7;
      const eta = Math.max(1, Math.round(((100 - progress) / (step / 0.3)) * 1));
      next[k] = progress >= 100 ? { ...m, progress: 100, speed: 0, eta: 0, status: "processing", proc: 0 } : { ...m, progress, speed, eta };
    } else if (m.status === "processing") {
      changed = true;
      const proc = Math.min(100, m.proc + (m.transcode ? 5 : 40) * sim.factor);
      next[k] = proc >= 100 ? { ...m, proc: 100, status: "ready" } : { ...m, proc };
    } else next[k] = m;
  }
  return changed ? next : null;
}

export async function ingestImage(file: File, rec: { w: number; h: number }, ratio: number | undefined): Promise<Img> {
  const ext = extOf(file.name);
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) throw new Error(`.${ext || "?"} isn't supported. Use JPG, PNG or WebP.`);
  if (file.size > 10 * MB) throw new Error("The image is larger than 10 MB.");
  const url0 = await readUrl(file);
  let el: HTMLImageElement;
  try {
    el = await loadImg(url0);
  } catch {
    throw new Error("The image could not be read. It may be corrupt.");
  }
  const w = el.naturalWidth || rec.w;
  const h = el.naturalHeight || rec.h;
  if (el.naturalWidth && (w < rec.w * 0.5 || h < rec.h * 0.5)) throw new Error(`The image is too small (${w} × ${h}). Minimum is ${Math.round(rec.w * 0.5)} × ${Math.round(rec.h * 0.5)}.`);
  if (ratio && el.naturalWidth && Math.abs(w / h - ratio) / ratio > 0.12) toast.warning("The aspect ratio differs from the recommendation. Use Crop or the focal point so nothing is stretched.");
  let url = url0;
  try {
    const max = 1600;
    if (w > max) {
      const c = document.createElement("canvas");
      c.width = max;
      c.height = Math.round((h * max) / w);
      const g = c.getContext("2d");
      if (g) {
        g.drawImage(el, 0, 0, c.width, c.height);
        url = c.toDataURL("image/jpeg", 0.85);
      }
    }
  } catch {
    /* keep the original data URL */
  }
  return { name: file.name, size: file.size, w, h, url, fx: 0.5, fy: 0.5 };
}

async function cropImage(img: Img, ratio: number): Promise<Img> {
  const el = await loadImg(img.url);
  const sw = el.naturalWidth;
  const sh = el.naturalHeight;
  let cw = sw;
  let ch = sw / ratio;
  if (ch > sh) {
    ch = sh;
    cw = sh * ratio;
  }
  const x = Math.min(sw - cw, Math.max(0, img.fx * sw - cw / 2));
  const y = Math.min(sh - ch, Math.max(0, img.fy * sh - ch / 2));
  const c = document.createElement("canvas");
  c.width = Math.min(1600, Math.round(cw));
  c.height = Math.round(c.width / ratio);
  const g = c.getContext("2d");
  if (!g) throw new Error("Cropping isn't available in this browser.");
  g.drawImage(el, x, y, cw, ch, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.88);
  return { ...img, url, w: Math.round(cw), h: Math.round(ch), fx: 0.5, fy: 0.5 };
}

/* ------------------------------------------------------------------ layout bits */

export function Section({ title, desc, action, children, className }: { title: string; desc?: string | undefined; action?: ReactNode; children: ReactNode; className?: string | undefined }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface", className)}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export const OptionalTag = () => <span className="ml-1.5 align-middle text-[9px] font-bold tracking-wider text-muted-foreground uppercase">Optional</span>;

/** A value the system fills in. Looks different from an input on purpose, so nobody tries to "fill it in". */
export function SystemField({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-soft">{label}</div>
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-dashed border-border bg-surface-2/60 px-3 text-sm text-muted-foreground">
        <span className="truncate font-mono text-xs text-foreground/80">{value}</span>
        <span className="shrink-0 text-[9px] font-bold tracking-wider uppercase">{note ?? "Auto-generated"}</span>
      </div>
    </div>
  );
}

/** Collapsible group for details that are not needed to publish. */
export function Advanced({ title = "Advanced details", desc = "Optional", defaultOpen, children }: { title?: string; desc?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-bold">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
        </span>
        <span className="text-xs font-semibold text-primary-text group-open:hidden">Show</span>
        <span className="hidden text-xs font-semibold text-primary-text group-open:inline">Hide</span>
      </summary>
      <div className="space-y-4 border-t border-border p-5">{children}</div>
    </details>
  );
}

export function FieldBox({ id, label, required, optional, hint, count, children, className }: { id: string; label: string; required?: boolean | undefined; optional?: boolean | undefined; hint?: string | undefined; count?: ReactNode; children: ReactNode; className?: string | undefined }) {
  const { errors } = useWiz();
  const err = errors[id];
  return (
    <div id={`f-${id}`} className={cn("scroll-mt-28", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-soft">
          {label} {required && <span className="text-primary-text">*</span>}
          {optional && !required && <OptionalTag />}
        </label>
        {count && <span className="text-[11px] text-muted-foreground">{count}</span>}
      </div>
      <div className={cn(err && "rounded-md ring-1 ring-primary [&_input]:border-primary [&_select]:border-primary [&_textarea]:border-primary")}>{children}</div>
      {err ? (
        <p role="alert" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary-text">
          <AlertCircle className="size-3" /> {err}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function TextBox({ id, label, value, onChange, required, optional, hint, placeholder, type = "text", maxLength, className, count }: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean | undefined; optional?: boolean | undefined; hint?: string | undefined; placeholder?: string | undefined; type?: string; maxLength?: number | undefined; className?: string | undefined; count?: ReactNode }) {
  return (
    <FieldBox id={id} label={label} required={required} optional={optional} hint={hint} className={className} count={count}>
      <input id={id} aria-label={label} type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </FieldBox>
  );
}

export function SelectBox2({ id, label, value, onChange, options, required, optional, hint, className, placeholder = "Select…" }: { id: string; label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean | undefined; optional?: boolean | undefined; placeholder?: string; hint?: string | undefined; className?: string | undefined }) {
  return (
    <FieldBox id={id} label={label} required={required} optional={optional} hint={hint} className={className}>
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "appearance-none")}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </FieldBox>
  );
}

/** Textarea with a tiny formatting toolbar (markdown-style bold / italic / list). */
export function RichText({ id, label, value, onChange, required, optional, hint, rows = 6 }: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean | undefined; optional?: boolean | undefined; hint?: string | undefined; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (before: string, after = before) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    onChange(`${value.slice(0, a)}${before}${value.slice(a, b) || "text"}${after}${value.slice(b)}`);
    el.focus();
  };
  const tool = "grid size-7 place-items-center rounded text-xs font-bold text-soft hover:bg-surface-3";
  return (
    <FieldBox id={id} label={label} required={required} optional={optional} hint={hint} count={`${value.length} characters`}>
      <div className="overflow-hidden rounded-md border border-input bg-surface-2">
        <div className="flex gap-0.5 border-b border-border bg-surface px-1.5 py-1">
          <button type="button" className={tool} aria-label="Bold" onClick={() => wrap("**")}>B</button>
          <button type="button" className={cn(tool, "italic")} aria-label="Italic" onClick={() => wrap("_")}>I</button>
          <button type="button" className={tool} aria-label="Bulleted list" onClick={() => wrap("\n- ", "")}>•</button>
        </div>
        <textarea id={id} aria-label={label} ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="w-full resize-y bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground" />
      </div>
    </FieldBox>
  );
}

/* ------------------------------------------------------------------ selects & tags */

export function SearchSelect({ id, label, value, onChange, options, required, optional, hint, placeholder = "Search…", className }: { id: string; label?: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean | undefined; optional?: boolean | undefined; hint?: string | undefined; placeholder?: string; className?: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const list = options.filter((o) => o.toLowerCase().includes(q.toLowerCase()));
  const input = (
    <div className="relative">
      <input
        id={id}
        ref={ref}
        aria-label={label ?? placeholder}
        autoComplete="off"
        value={open ? q : value}
        placeholder={value || placeholder}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && list[0]) {
            e.preventDefault();
            onChange(list[0]);
            setOpen(false);
            ref.current?.blur();
          }
        }}
        className={inputCls}
      />
      {open && (
        <ul role="listbox" className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface-2 py-1 shadow-card">
          {list.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>}
          {list.map((o) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
                ref.current?.blur();
              }}
              className={cn("flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm hover:bg-surface-3", o === value && "text-primary-text")}
            >
              {o}
              {o === value && <Check className="size-3.5" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return label ? (
    <FieldBox id={id} label={label} required={required} optional={optional} hint={hint} className={className}>
      {input}
    </FieldBox>
  ) : (
    <div className={className}>{input}</div>
  );
}

export function MultiSelect({ id, label, values, onChange, options, hint, placeholder = "Search to add…", required, optional }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void; options: string[]; hint?: string | undefined; placeholder?: string; required?: boolean | undefined; optional?: boolean | undefined }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = options.filter((o) => !values.includes(o) && o.toLowerCase().includes(q.toLowerCase()));
  const add = (o: string) => {
    onChange([...values, o]);
    setQ("");
  };
  return (
    <FieldBox id={id} label={label} hint={hint} required={required} optional={optional}>
      <div className="relative">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface-2 px-2 py-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded bg-surface-3 px-2 py-0.5 text-xs font-medium">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            aria-label={label}
            value={q}
            placeholder={values.length ? "" : placeholder}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && list[0]) {
                e.preventDefault();
                add(list[0]);
              }
              if (e.key === "Backspace" && !q && values.length) onChange(values.slice(0, -1));
            }}
            className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {open && list.length > 0 && (
          <ul role="listbox" className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface-2 py-1 shadow-card">
            {list.map((o) => (
              <li
                key={o}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(o);
                }}
                className="cursor-pointer px-3 py-1.5 text-sm hover:bg-surface-3"
              >
                {o}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldBox>
  );
}

export function TagInput({ id, label, values, onChange, max = 20, noun, placeholder, optional }: { id: string; label: string; optional?: boolean; values: string[]; onChange: (v: string[]) => void; max?: number; noun: string; placeholder?: string | undefined }) {
  const [text, setText] = useState("");
  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) {
      if (next.length >= max) {
        toast.warning(`You can add up to ${max} ${noun}.`);
        break;
      }
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setText("");
  };
  return (
    <FieldBox id={id} label={label} optional={optional} count={`${values.length} / ${max} ${noun}`}>
      <div className="flex gap-2">
        <input
          id={id}
          aria-label={label}
          value={text}
          placeholder={placeholder ?? "Type a tag, then press Enter or comma"}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) commit(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
            }
            if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
          className={inputCls}
        />
        <Btn type="button" onClick={() => commit(text)} disabled={!text.trim()}>
          Add
        </Btn>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-3 py-0.5 pr-1.5 pl-3 text-xs font-medium">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(values.filter((x) => x !== t))} className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </FieldBox>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-xs text-soft">
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full border border-border transition-colors", checked ? "border-primary bg-primary" : "bg-surface-3")}>
        <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-foreground transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}

export function RadioCards<T extends string>({ value, onChange, options, name }: { value: T; onChange: (v: T) => void; options: { value: T; title: string; desc?: string }[]; name: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border bg-surface-2 p-3", value === o.value ? "border-primary" : "border-border hover:border-foreground/25")}>
          <input type="radio" name={name} className="mt-1 accent-[var(--primary)]" checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>
            <span className="block text-sm font-semibold">{o.title}</span>
            {o.desc && <span className="block text-xs text-muted-foreground">{o.desc}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ drag & drop reorder */

export function useReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const from = useRef<number | null>(null);
  return (i: number) => ({
    handle: {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        from.current = i;
        e.dataTransfer.effectAllowed = "move";
      },
    },
    row: {
      onDragOver: (e: DragEvent) => e.preventDefault(),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const f = from.current;
        from.current = null;
        if (f === null || f === i) return;
        const next = [...items];
        const [moved] = next.splice(f, 1);
        next.splice(i, 0, moved as T);
        onChange(next);
      },
    },
    move: (by: number) => {
      const t = i + by;
      if (t < 0 || t >= items.length) return;
      const next = [...items];
      const [moved] = next.splice(i, 1);
      next.splice(t, 0, moved as T);
      onChange(next);
    },
  });
}
export const DragHandle = (props: React.HTMLAttributes<HTMLSpanElement>) => (
  <span {...props} title="Drag to reorder" aria-hidden="true" className="cursor-grab text-muted-foreground active:cursor-grabbing">
    <GripVertical className="size-4" />
  </span>
);

/* ------------------------------------------------------------------ media uploader */

const KindIcon = { video: FileVideo, audio: FileAudio, doc: FileText, caption: FileText } as const;
const statusChip: Record<string, string> = {
  uploading: "border-info/30 bg-info/10 text-info",
  paused: "border-warning/30 bg-warning/10 text-warning",
  processing: "border-warning/30 bg-warning/10 text-warning",
  ready: "border-success/30 bg-success/10 text-success",
  error: "border-primary/40 bg-primary/10 text-primary-text",
};
const statusText: Record<string, string> = { uploading: "Uploading", paused: "Paused", processing: "Processing", ready: "Ready", error: "Failed" };

export function MediaUploader({ slot, label, required, optional, rules, hint, big, validNote }: { slot: string; label: string; required?: boolean | undefined; optional?: boolean | undefined; rules: Rules; hint?: string | undefined; big?: boolean | undefined; validNote?: string | undefined }) {
  const { media, upload, patchMedia, errors } = useWiz();
  const m = media[slot];
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const Icon = KindIcon[rules.kind];
  const pick = (f?: File) => f && upload(slot, f, rules);
  const err = errors[slot];
  const accept = rules.exts.map((e) => `.${e}`).join(",");

  return (
    <div id={`f-${slot}`} className="scroll-mt-28">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-soft">
          {label} {required && <span className="text-primary-text">*</span>}
          {optional && !required && <OptionalTag />}
        </span>
        <span className="text-[11px] text-muted-foreground">{rules.exts.map((e) => e.toUpperCase()).join(" · ")}</span>
      </div>
      <input ref={input} type="file" accept={accept} aria-label={`${label} file`} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {!m ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          className={cn("flex items-center gap-4 rounded-lg border border-dashed bg-surface-2 transition-colors", big ? "flex-col justify-center px-6 py-10 text-center" : "p-3", over ? "border-primary bg-primary/5" : err ? "border-primary" : "border-border")}
        >
          <span className={cn("grid shrink-0 place-items-center rounded-md bg-surface-3 text-soft", big ? "size-12" : "size-9")}>
            <Upload className={big ? "size-5" : "size-4"} />
          </span>
          <div className={cn("min-w-0 flex-1", big && "flex-none")}>
            <div className="text-sm font-semibold">{big ? "Drag & drop your file here" : `Upload ${label.toLowerCase()}`}</div>
            <div className="text-xs text-muted-foreground">{hint ?? `or browse. Up to ${fmtBytes(rules.maxBytes)}.`}</div>
          </div>
          <Btn type="button" size="sm" onClick={() => input.current?.click()}>
            Choose file
          </Btn>
        </div>
      ) : (
        <div className={cn("rounded-lg border bg-surface-2 p-3", m.status === "error" ? "border-primary/50" : "border-border")}>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-3 text-soft">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">{m.name}</span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase", statusChip[m.status])}>{statusText[m.status]}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {fmtBytes(m.size)}
                {m.duration !== undefined && ` · ${fmtDur(m.duration)}`}
                {m.status === "ready" && validNote && ` · ${validNote}`}
              </div>
              {(m.status === "uploading" || m.status === "paused") && (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full bg-primary transition-all" style={{ width: `${m.progress}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {Math.round(m.progress)}%{m.status === "uploading" ? ` · ${m.speed.toFixed(1)} MB/s · about ${m.eta}s left` : " · paused"}
                  </div>
                </>
              )}
              {m.status === "processing" && (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full bg-warning transition-all" style={{ width: `${m.proc}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{rules.transcode ? "Transcoding renditions on the server…" : "Validating file…"}</div>
                </>
              )}
              {m.status === "error" && <div className="mt-1 text-xs font-medium text-primary-text">{m.error}</div>}
            </div>
            <div className="flex shrink-0 gap-1">
              {m.status === "uploading" && (
                <button type="button" className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label="Pause upload" title="Pause" onClick={() => patchMedia(slot, { ...m, status: "paused" })}>
                  <Pause className="size-4" />
                </button>
              )}
              {m.status === "paused" && (
                <button type="button" className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label="Resume upload" title="Resume" onClick={() => patchMedia(slot, { ...m, status: "uploading" })}>
                  <Play className="size-4" />
                </button>
              )}
              {m.status === "error" && (
                <button type="button" className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label="Retry upload" title="Retry" onClick={() => input.current?.click()}>
                  <RotateCcw className="size-4" />
                </button>
              )}
              {m.status === "ready" && (
                <Btn type="button" size="sm" onClick={() => input.current?.click()}>
                  Replace
                </Btn>
              )}
              <button type="button" className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" aria-label={m.status === "ready" || m.status === "error" ? "Remove file" : "Cancel upload"} title={m.status === "ready" || m.status === "error" ? "Remove" : "Cancel"} onClick={() => patchMedia(slot, null)}>
                {m.status === "ready" || m.status === "error" ? <Trash2 className="size-4" /> : <X className="size-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary-text">
          <AlertCircle className="size-3" /> {err}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ image slot */

export function ImageSlot({ slot, label, required, optional, rec, compact, ratio: ratioProp }: { slot: string; label: string; required?: boolean | undefined; optional?: boolean | undefined; rec: { w: number; h: number }; compact?: boolean | undefined; ratio?: number | undefined }) {
  const { images, setImage, errors } = useWiz();
  const img = images[slot];
  const ratio = ratioProp ?? rec.w / rec.h;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [cropRatio, setCropRatio] = useState<number>(ratio);
  const err = errors[slot] ?? local ?? undefined;

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setLocal(null);
    try {
      setImage(slot, await ingestImage(f, rec, ratio));
    } catch (e) {
      setLocal((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id={`f-${slot}`} className="scroll-mt-28 rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-soft">
          {label} {required && <span className="text-primary-text">*</span>}
          {optional && !required && <OptionalTag />}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {rec.w} × {rec.h}
        </span>
      </div>
      <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp" aria-label={`${label} image`} className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <div
        style={{ aspectRatio: String(ratio) }}
        className={cn("relative grid place-items-center overflow-hidden rounded-md border border-dashed bg-surface", compact && "mx-auto max-w-40", err || img?.lost ? "border-primary" : "border-border")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}
      >
        {img && img.url ? (
          <>
            <img src={img.url} alt={label} style={{ objectPosition: `${img.fx * 100}% ${img.fy * 100}%` }} className="absolute inset-0 size-full object-cover" />
            <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-primary/70 shadow" style={{ left: `${img.fx * 100}%`, top: `${img.fy * 100}%` }} aria-hidden />
          </>
        ) : img?.placeholder ? (
          <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-1 px-3 text-center text-xs text-muted-foreground hover:text-foreground">
            <ImagePlus className="size-5" />
            Current artwork is in use
            <span>Upload to replace it</span>
          </button>
        ) : img ? (
          <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-1 px-3 text-center text-xs font-bold text-primary-text">
            <AlertCircle className="size-5" />
            IMAGE NEEDS TO BE RE-UPLOADED
            <span className="font-normal text-muted-foreground">It was too large to keep after a refresh.</span>
          </button>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex flex-col items-center gap-1 px-3 text-center text-xs text-muted-foreground hover:text-foreground">
            <ImagePlus className="size-5" />
            {busy ? "Reading image…" : "Drop an image or browse"}
            <span className="text-[10px] uppercase">JPG · PNG · WebP</span>
          </button>
        )}
      </div>
      {img && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {img.w} × {img.h} px · {fmtBytes(img.size)}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {img ? (
          <>
            <Btn type="button" size="sm" onClick={() => input.current?.click()}>
              Replace
            </Btn>
            <Btn type="button" size="sm" disabled={!img.url} onClick={() => { setCropRatio(ratio); setAdjust(true); }}>
              <Crop /> Crop
            </Btn>
            <Btn type="button" size="sm" disabled={!img.url} onClick={() => { setCropRatio(ratio); setAdjust(true); }}>
              <Crosshair /> Focal point
            </Btn>
            <Btn type="button" size="sm" variant="ghost" onClick={() => setImage(slot, null)}>
              <Trash2 /> Remove
            </Btn>
          </>
        ) : (
          <Btn type="button" size="sm" onClick={() => input.current?.click()}>
            <Upload /> Upload
          </Btn>
        )}
      </div>
      {err && (
        <p role="alert" className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary-text">
          <AlertCircle className="size-3" /> {err}
        </p>
      )}
      {img && img.url && (
        <Dialog open={adjust} onOpenChange={setAdjust}>
          <DialogContent className="border-border bg-surface-2 sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Crop &amp; focal point · {label}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">Click the image to set the focal point. It stays in view when the image is shown at a different shape. Crop trims to the chosen ratio around that point.</p>
            <div
              className="relative mx-auto max-h-[50vh] cursor-crosshair overflow-hidden rounded-md border border-border"
              style={{ aspectRatio: `${img.w} / ${img.h}`, maxWidth: "100%" }}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setImage(slot, { ...img, fx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), fy: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
              }}
            >
              <img src={img.url} alt="" className="size-full object-cover" draggable={false} />
              <span className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-primary/60" style={{ left: `${img.fx * 100}%`, top: `${img.fy * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-soft">Crop to</span>
              {[
                ["Slot shape", ratio],
                ["16:9", 16 / 9],
                ["4:3", 4 / 3],
                ["1:1", 1],
                ["2:3", 2 / 3],
              ].map(([n, r]) => (
                <button key={String(n)} type="button" onClick={() => setCropRatio(r as number)} className={cn("h-7 rounded-md border px-2.5 text-xs font-semibold", Math.abs(cropRatio - (r as number)) < 0.001 ? "border-primary bg-primary/15" : "border-border text-soft")}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Btn type="button" onClick={() => setAdjust(false)}>
                Done
              </Btn>
              <Btn
                type="button"
                variant="primary"
                onClick={async () => {
                  try {
                    setImage(slot, await cropImage(img, cropRatio));
                    toast.success("Crop applied");
                    setAdjust(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Crop /> Apply crop
              </Btn>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ publish step helpers */

export function ReviewSection({ title, onEdit, children, ok }: { title: string; onEdit: () => void; children: ReactNode; ok?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-bold">
          {ok !== undefined && (
            <span className={cn("grid size-4 place-items-center rounded-full", ok ? "bg-success/20 text-success" : "bg-primary/20 text-primary-text")}>{ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}</span>
          )}
          {title}
        </div>
        <Btn type="button" size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Btn>
      </div>
      <div className="space-y-1 px-4 py-3 text-sm">{children}</div>
    </div>
  );
}
export const Row = ({ k, v }: { k: string; v?: ReactNode }) => (
  <div className="flex gap-3">
    <span className="w-36 shrink-0 text-xs text-muted-foreground">{k}</span>
    <span className="min-w-0 flex-1 text-sm break-words">{v || <span className="text-muted-foreground">-</span>}</span>
  </div>
);

export function Checklist({ items }: { items: { label: string; ok: boolean; step?: number }[] }) {
  const { goTo } = useWiz();
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i.label} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", i.ok ? "border-border bg-surface-2" : "border-primary/40 bg-primary/10")}>
          <span className={cn("grid size-4 shrink-0 place-items-center rounded-full", i.ok ? "bg-success/20 text-success" : "bg-primary/25 text-primary-text")}>{i.ok ? <Check className="size-2.5" /> : <X className="size-2.5" />}</span>
          <span className={cn("flex-1", !i.ok && "font-medium text-primary-text")}>{i.label}</span>
          {!i.ok && i.step !== undefined && (
            <button type="button" className="text-xs font-semibold underline" onClick={() => goTo(i.step!)}>
              Fix
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Small hook: keep a debounced "last changed" so a section can react to upstream edits. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
