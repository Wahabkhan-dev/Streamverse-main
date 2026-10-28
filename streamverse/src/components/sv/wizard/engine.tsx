import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Cloud, Loader2, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ItemType } from "@/lib/data";
import { isDraftDeleted, reviveDraft, saveDraft } from "@/lib/drafts";
import { deleteFile, draftFileKey, saveFile } from "@/lib/media-store";
import { cn } from "@/lib/utils";
import { Btn } from "../ui";
import { DEMO_MODE } from "@/lib/config";
import { startLibraryUpload, type UploadHandle } from "@/api/mediaLibrary.api";
import { purposeForSlot } from "./live";
import {
  WizCtx,
  advanceMedia,
  ingestMedia,
  type Img,
  type Media,
  type Rules,
  type Snapshot,
  type WizardApi,
} from "./kit";

export interface StepDef<D> {
  id: string;
  title: string;
  desc: string;
  render: () => ReactNode;
  /** required-field problems for this step, keyed by the field's element id */
  validate: (s: Snapshot<D>) => Record<string, string>;
}

type SaveState = "saved" | "saving" | "dirty";
const REQUIRED = "This field is required.";
export { REQUIRED };

/**
 * Drafts live in browser storage, which can't hold large images. Any image that won't fit is kept
 * in memory but saved as "lost" so, after a refresh, it is flagged for re-upload instead of looking valid.
 */
function forStorage<D>(s: Snapshot<D>, limit: number): Snapshot<D> {
  const images: Record<string, Img> = {};
  for (const [k, v] of Object.entries(s.images))
    images[k] = v.url.length > limit ? { ...v, url: "", lost: true } : v;
  return { ...s, images };
}
export const stripUrls = <D,>(s: Snapshot<D>): Snapshot<D> => forStorage(s, 0);

/** Makes a stored snapshot safe to open: interrupted uploads become retryable, vanished images are flagged. */
export function reviveSnapshot<D>(s: Snapshot<D>): Snapshot<D> {
  const media: Record<string, Media> = {};
  for (const [k, m] of Object.entries(s.media)) {
    media[k] =
      m.status === "ready" || m.status === "error"
        ? m
        : {
            ...m,
            status: "error",
            error: "This upload was interrupted. Choose the file again to retry.",
          };
  }
  const images: Record<string, Img> = {};
  for (const [k, v] of Object.entries(s.images))
    images[k] = !v.url && !v.placeholder ? { ...v, lost: true } : v;
  return { ...s, media, images };
}

function Stage({
  index,
  dir,
  render,
}: {
  index: number;
  dir: 1 | -1;
  render: (i: number) => ReactNode;
}) {
  const [prev, setPrev] = useState<number | null>(null);
  const last = useRef(index);
  const animate = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | undefined>();
  const reduce =
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (last.current === index) return undefined;
    if (!reduce) {
      animate.current = true;
      setPrev(last.current);
      const t = window.setTimeout(() => setPrev(null), 230);
      last.current = index;
      return () => window.clearTimeout(t);
    }
    last.current = index;
    return undefined;
  }, [index, reduce]);

  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, [index]);

  const name = dir > 0 ? "fwd" : "back";
  return (
    <div
      className="relative"
      style={{ height: h, transition: "height 220ms ease", overflowX: "clip" }}
    >
      {prev !== null && (
        <div
          key={`out-${prev}`}
          className="wiz-pane pointer-events-none absolute inset-x-0 top-0"
          style={{ animation: `wiz-out-${name} 200ms ease-in both` }}
          aria-hidden
        >
          {render(prev)}
        </div>
      )}
      <div
        ref={paneRef}
        key={index}
        className="wiz-pane"
        style={animate.current ? { animation: `wiz-in-${name} 220ms ease-out both` } : undefined}
      >
        {render(index)}
      </div>
    </div>
  );
}

const timeOf = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function WizardShell<D>({
  draft,
  initial,
  steps,
  eyebrow,
  title,
  sub,
  backTo,
  titleOf,
  onSaveDraft,
  restored,
  status,
}: {
  /** where unfinished work is autosaved: a new-title draft, or the edits to an existing title */
  draft: { id: string; type: ItemType };
  initial: Snapshot<D>;
  steps: StepDef<D>[];
  eyebrow: string;
  title: string;
  sub: string;
  backTo: string;
  titleOf: (d: D) => string;
  onSaveDraft: (s: Snapshot<D>, goTo: (i: number) => void) => void;
  restored?: { at: number; onDiscard: () => void } | undefined;
  status?: ReactNode;
}) {
  const [snap, setSnap] = useState<Snapshot<D>>(initial);
  const [step, setStep] = useState(0);
  const dir = useRef<1 | -1>(1);
  const [visited, setVisited] = useState<number[]>([0]);
  const [flag, setFlag] = useState<Record<number, boolean>>({});
  const [tick, setTick] = useState(0);
  const [save, setSave] = useState<SaveState>("saved");
  const [lastSaved, setLastSaved] = useState<number | null>(restored?.at ?? null);
  const [showRestored, setShowRestored] = useState(!!restored);
  const timers = useRef<number[]>([]);
  const latest = useRef(snap);
  latest.current = snap;
  const touched = useRef(false);

  /* ---- autosave ---- */
  const persist = useCallback((): boolean => {
    const s = latest.current;
    const name = titleOf(s.d);
    if (saveDraft(draft.id, draft.type, name, forStorage(s, 700_000))) return true;
    // too big for storage: keep everything except the image pixels
    return saveDraft(draft.id, draft.type, name, stripUrls(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, draft.type]);
  const dirty = useRef(false);
  useEffect(() => reviveDraft(draft.id), [draft.id]);
  const touch = useCallback(() => {
    touched.current = true;
    dirty.current = true;
    setSave("dirty");
    timers.current.forEach(window.clearTimeout);
    timers.current = [
      window.setTimeout(() => {
        setSave("saving");
        const ok = persist();
        dirty.current = !ok;
        timers.current.push(
          window.setTimeout(() => {
            if (ok) {
              setSave("saved");
              setLastSaved(Date.now());
            } else setSave("dirty");
          }, 200),
        );
      }, 300),
    ];
  }, [persist]);
  // Flush any pending change immediately when the page is hidden/closed or the wizard unmounts,
  // so even a change made a moment before leaving is never lost.
  useEffect(() => {
    const flush = () => {
      if (!dirty.current || isDraftDeleted(draft.id)) return;
      timers.current.forEach(window.clearTimeout);
      dirty.current = !persist();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      timers.current.forEach(window.clearTimeout);
    };
  }, [persist, draft.id]);

  // leaving with unsaved work asks first
  useEffect(() => {
    if (save === "saved") return undefined;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [save]);

  const mutate = useCallback(
    (fn: (s: Snapshot<D>) => Snapshot<D>) => {
      setSnap(fn);
      touch();
    },
    [touch],
  );

  /* ---- simulated uploads / server processing ---- */
  const active = Object.values(snap.media).some(
    (m) => m.status === "uploading" || m.status === "processing",
  );
  useEffect(() => {
    if (!active || !DEMO_MODE) return;
    const t = window.setInterval(() => {
      setSnap((s) => {
        const next = advanceMedia(s.media);
        return next ? { ...s, media: next } : s;
      });
    }, 300);
    return () => window.clearInterval(t);
  }, [active]);
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) touch();
    wasActive.current = active;
  }, [active, touch]);

  /* ---- validation + navigation ---- */
  const results = useMemo(() => steps.map((s) => s.validate(snap)), [steps, snap]);
  const valid = results.map((r) => Object.keys(r).length === 0);

  const go = (i: number) => {
    dir.current = i >= step ? 1 : -1;
    setStep(i);
    setVisited((v) => (v.includes(i) ? v : [...v, i]));
    if (typeof window !== "undefined") window.scrollTo?.({ top: 0 });
  };
  const goTo = (target: number) => {
    if (target < 0 || target >= steps.length) return;
    if (target <= step) return go(target);
    for (let i = step; i < target; i++) {
      if (!valid[i]) {
        setFlag((f) => ({ ...f, [i]: true }));
        setTick((t) => t + 1);
        if (i !== step) go(i);
        toast.warning("Some required information is missing.");
        return;
      }
    }
    go(target);
  };

  // scroll to the first missing field after a blocked attempt
  useEffect(() => {
    if (!tick) return;
    const first = Object.keys(results[step] ?? {})[0];
    if (!first) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`f-${first}`) ?? document.getElementById(first);
      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      const focusable =
        el?.querySelector<HTMLElement>("input,select,textarea,button") ??
        (el as HTMLElement | null);
      focusable?.focus?.({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /* ---- live uploads: real bytes to R2, verified and processed by the server ---- */
  const handles = useRef(new Map<string, UploadHandle>());
  const imageSent = useRef(new Map<string, string>());
  const patchLive = (slot: string, p: Partial<Media>, token: UploadHandle) => {
    if (handles.current.get(slot) !== token) return; // replaced or removed meanwhile
    setSnap((s) =>
      s.media[slot] ? { ...s, media: { ...s.media, [slot]: { ...s.media[slot]!, ...p } } } : s,
    );
  };
  const startLive = (slot: string, file: File, base: Media) => {
    const t0 = Date.now();
    const holder: { h?: UploadHandle } = {};
    const handle = startLibraryUpload(
      file,
      {
        onStage: (stage, assetId) => {
          if (!holder.h) return;
          if (stage === "verifying" || stage === "processing")
            patchLive(
              slot,
              { status: "processing", progress: 100, ...(assetId ? { assetId } : {}) },
              holder.h,
            );
          else if (stage === "ready")
            patchLive(
              slot,
              { status: "ready", progress: 100, proc: 100, ...(assetId ? { assetId } : {}) },
              holder.h,
            );
        },
        onProcessing: (p) => {
          if (!holder.h || !p) return;
          patchLive(
            slot,
            { status: "processing", proc: p.percent, procStep: p.step, procEta: p.etaSeconds },
            holder.h,
          );
        },
        onProgress: (f) => {
          if (!holder.h) return;
          const sec = Math.max(0.5, (Date.now() - t0) / 1000);
          const mb = (file.size * f) / (1024 * 1024);
          const speed = mb / sec;
          patchLive(
            slot,
            {
              status: "uploading",
              progress: f * 100,
              speed,
              eta:
                speed > 0 ? Math.max(0, Math.round((file.size / (1024 * 1024) - mb) / speed)) : 0,
            },
            holder.h,
          );
        },
      },
      { ...(purposeForSlot(slot) ? { purpose: purposeForSlot(slot)! } : {}) },
    );
    holder.h = handle;
    handles.current.get(slot)?.cancel();
    handles.current.set(slot, handle);
    handle.done.catch((err: Error) =>
      patchLive(slot, { status: "error", error: err.message }, handle),
    );
    void base;
  };
  const startImage = async (slot: string, img: Img) => {
    if (
      DEMO_MODE ||
      !img.url.startsWith("data:") ||
      img.assetId ||
      imageSent.current.get(slot) === img.url
    )
      return;
    imageSent.current.set(slot, img.url);
    const mark = (p: Partial<Img>) =>
      setSnap((s) =>
        s.images[slot] && s.images[slot]!.url === img.url
          ? { ...s, images: { ...s.images, [slot]: { ...s.images[slot]!, ...p } } }
          : s,
      );
    mark({ up: "uploading" });
    try {
      const blob = await (await fetch(img.url)).blob();
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const file = new File(
        [blob],
        /\.(jpe?g|png|webp)$/i.test(img.name) ? img.name : `${img.name || slot}.${ext}`,
        { type: blob.type || "image/jpeg" },
      );
      const h = startLibraryUpload(file, { onStage: () => undefined, onProgress: () => undefined });
      const id = await h.done;
      mark({ assetId: id, up: "ready" });
    } catch (e) {
      mark({ up: "error", upError: (e as Error).message });
    }
  };

  const api: WizardApi<D> = {
    d: snap.d,
    set: (fn) => mutate((s) => ({ ...s, d: fn(s.d) })),
    media: snap.media,
    images: snap.images,
    errors: flag[step] ? (results[step] ?? {}) : {},
    goTo,
    upload: (slot: string, file: File, rules: Rules) =>
      ingestMedia(file, rules, (m) => {
        if (!DEMO_MODE) {
          mutate((s) => ({ ...s, media: { ...s.media, [slot]: m } }));
          if (m.status !== "error") startLive(slot, file, m);
          else handles.current.delete(slot);
          return;
        }
        // keep the real file in this browser so the player can play exactly what was uploaded
        if (m.status !== "error" && (rules.kind === "video" || rules.kind === "audio")) {
          void saveFile(draftFileKey(draft.id, slot), file).then((ok) => {
            if (!ok)
              toast.warning(
                "This file is too large to keep in the browser. It won't play after you leave this page.",
              );
          });
        }
        mutate((s) => ({ ...s, media: { ...s.media, [slot]: m } }));
      }),
    patchMedia: (slot, m) => {
      if (!DEMO_MODE) {
        // removing or replacing a file stops any upload still running for it
        if (!m || m.status === "ready" || m.status === "error") {
          handles.current.get(slot)?.cancel();
          handles.current.delete(slot);
        }
      }
      if (!m) void deleteFile(draftFileKey(draft.id, slot));
      mutate((s) => {
        const media = { ...s.media };
        if (m) media[slot] = m;
        else delete media[slot];
        return { ...s, media };
      });
    },
    setImage: (slot, img) => {
      mutate((s) => {
        const images = { ...s.images };
        if (img) images[slot] = img;
        else delete images[slot];
        return { ...s, images };
      });
      if (img) void startImage(slot, img);
      else imageSent.current.delete(slot);
    },
    snap,
  };

  const indicator =
    save === "saved" ? (
      <>
        <Cloud className="size-3.5 text-success" /> Saved locally
      </>
    ) : save === "saving" ? (
      <>
        <Loader2 className="size-3.5 animate-spin" /> Saving...
      </>
    ) : (
      <>
        <span className="size-2 rounded-full bg-warning" /> Unsaved Changes
      </>
    );

  return (
    <WizCtx.Provider value={api}>
      <div className="mb-3">
        <Link
          to={backTo as "/admin/movies"}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to catalog
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5 text-[10px] text-primary-text">{eyebrow}</div>
          <h1 className="text-2xl font-bold tracking-tight break-words md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {status}
          <span className="flex flex-col items-end text-xs">
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 font-medium text-muted-foreground"
            >
              {indicator}
            </span>
            {lastSaved && (
              <span className="text-[11px] text-muted-foreground">
                Last Saved: {timeOf(lastSaved)}
              </span>
            )}
          </span>
          <Btn type="button" onClick={() => onSaveDraft(snap, goTo)}>
            <Save /> Save as Draft
          </Btn>
        </div>
      </div>

      {showRestored && restored && (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/10 px-4 py-3 text-sm"
        >
          <span>Restored your unsaved edits from {timeOf(restored.at)}.</span>
          <Btn
            size="sm"
            onClick={() => {
              restored.onDiscard();
              setShowRestored(false);
            }}
          >
            <RotateCcw /> Discard edits
          </Btn>
        </div>
      )}

      <nav
        aria-label="Publishing steps"
        className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface p-1.5"
      >
        {steps.map((s, i) => {
          const current = i === step;
          const done = valid[i] && visited.includes(i) && !current;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={current ? "step" : undefined}
              onClick={() => goTo(i)}
              className={cn(
                "flex min-w-36 flex-1 shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors sm:min-w-40",
                current ? "border-primary bg-primary/12" : "border-transparent hover:bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                  current
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-success/20 text-success"
                      : "bg-surface-3 text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-xs font-bold tracking-wide uppercase",
                    current ? "text-foreground" : "text-soft",
                  )}
                >
                  {s.title}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{s.desc}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <Stage
        index={step}
        dir={dir.current}
        render={(i) => <div className="space-y-6">{steps[i]!.render()}</div>}
      />

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <Btn type="button" onClick={() => goTo(step - 1)} disabled={step === 0}>
          <ArrowLeft /> Previous
        </Btn>
        <span className="text-xs text-muted-foreground">
          Step {step + 1} of {steps.length}
        </span>
        {step < steps.length - 1 ? (
          <Btn type="button" variant="primary" onClick={() => goTo(step + 1)}>
            Next <ArrowRight />
          </Btn>
        ) : (
          <span className="w-24" />
        )}
      </div>
    </WizCtx.Provider>
  );
}
