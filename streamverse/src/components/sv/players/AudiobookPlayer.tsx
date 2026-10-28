import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Moon, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/api/client";
import { mediaApi } from "@/api/media.api";
import { meApi } from "@/api/me.api";
import type { Book } from "@/lib/data";
import { DEMO_MODE } from "@/lib/config";
import { useSaveProgressMutation } from "@/hooks/useApiMe";
import { chapterStarts, chaptersOf, locate, totalSecondsOf } from "@/lib/book-content";
import { clock } from "@/lib/runtime";
import { getUser, refKey, saveProgress, usePrefs } from "@/lib/user";
import { cn } from "@/lib/utils";
import { BookCover } from "../media";
import { usePlaybackSession } from "@/hooks/usePlaybackSession";
import { IconBtn, Range, SPEEDS, fmtSpeed, useBeat, useKey } from "./common";

const SLEEP = [
  { id: "off", label: "Off", minutes: 0 },
  { id: "5", label: "5 minutes", minutes: 5 },
  { id: "10", label: "10 minutes", minutes: 10 },
  { id: "15", label: "15 minutes", minutes: 15 },
  { id: "30", label: "30 minutes", minutes: 30 },
  { id: "45", label: "45 minutes", minutes: 45 },
  { id: "60", label: "1 hour", minutes: 60 },
  { id: "chapter", label: "End of chapter", minutes: 0 },
] as const;

export function AudiobookPlayer({ b, startChapter }: { b: Book; startChapter?: number | undefined }) {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const [realAudioLen, setRealAudioLen] = useState(0);
  // Demo titles get generated sample chapters. A real title only shows chapters that really exist: its own list
  // when it has one, otherwise a single chapter spanning the actual file (never invented titles or lengths).
  const chapters = useMemo(
    () => (DEMO_MODE || b.info?.chapters?.length ? chaptersOf(b) : [{ title: b.title, seconds: Math.max(1, Math.round(realAudioLen)), startPage: 1, known: realAudioLen > 0 }]),
    [b, realAudioLen],
  );
  const starts = chapterStarts(chapters);
  // Presigned audio URL (non-demo)
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [chapterUrls, setChapterUrls] = useState<Record<number, string> | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(!DEMO_MODE);
  const audioRef = useRef<HTMLAudioElement>(null);
  const realAudio = !DEMO_MODE && !!audioUrl && !audioFailed;
  // Use real audio duration when available; fall back to calculated from chapter metadata
  const total = realAudio && realAudioLen > 0 ? realAudioLen : totalSecondsOf(chapters);
  const saved = getUser().progress[refKey({ type: "Audiobook", slug: b.slug })];

  const [pos, setPos] = useState(() => {
    if (startChapter !== undefined && startChapter >= 0 && startChapter < chapters.length) return starts[startChapter]!;
    if (saved && !saved.completed) return Math.max(0, Math.min(saved.seconds ?? 0, total - 1));
    return 0;
  });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(prefs.audiobookSpeed);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [sleep, setSleep] = useState<(typeof SLEEP)[number]["id"]>("off");
  const [sleepLeft, setSleepLeft] = useState(0);
  const [menu, setMenu] = useState<null | "speed" | "sleep">(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const totalRef = useRef(total);
  totalRef.current = total;
  // Until the file's real length is known the total is a 1-second stand-in, and a save then would record "100%,
  // finished" (closing before the audio loaded, or React's double start in development), so the server is not told.
  const lengthKnownRef = useRef(false);
  lengthKnownRef.current = DEMO_MODE || (realAudio && realAudioLen > 0) || !!b.info?.chapters?.length;
  const finishedRef = useRef(pos >= total);
  finishedRef.current = pos >= total;
  const apiSave = useSaveProgressMutation();

  const { chapter, into } = locate(chapters, pos);
  const current = chapters[chapter]!;
  const finished = pos >= total;

  const persist = useCallback(() => {
    const { chapter: c, into: i } = locate(chapters, posRef.current);
    saveProgress({ type: "Audiobook", slug: b.slug }, { seconds: posRef.current, chapter: c, chapterSeconds: i, pct: (posRef.current / total) * 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.slug, total]);

  const persistApi = useCallback(() => {
    if (DEMO_MODE || !lengthKnownRef.current) return;
    const { chapter: c, into: i } = locate(chapters, posRef.current);
    apiSave.mutate(
      { type: "audiobook", contentId: b.cid ?? b.slug, data: { percentage: (posRef.current / totalRef.current) * 100, positionSeconds: posRef.current, durationSeconds: totalRef.current, chapterIndex: c, chapterSeconds: i, completed: finishedRef.current } },
      { onError: () => undefined },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSave, b.slug]);

  useBeat(playing && !finished, 250, (dt) => {
    // In real-audio mode the <audio> element drives pos via onTimeUpdate; skip simulated advance
    if (!realAudio) {
      setPos((p) => {
        const nextPos = Math.min(total, p + dt * speed);
        // "end of chapter" sleep stops exactly at the boundary
        if (sleep === "chapter") {
          const endOfChapter = starts[locate(chapters, p).chapter]! + chapters[locate(chapters, p).chapter]!.seconds;
          if (nextPos >= endOfChapter) {
            window.setTimeout(() => {
              setPlaying(false);
              setSleep("off");
              toast("Sleep timer: paused at the end of the chapter");
            }, 0);
            return endOfChapter;
          }
        }
        return nextPos;
      });
    }
    if (sleep !== "chapter" && sleep !== "off") {
      setSleepLeft((l) => {
        const left = l - dt;
        if (left <= 0) {
          window.setTimeout(() => {
            setPlaying(false);
            setSleep("off");
            toast("Sleep timer ended. Playback paused.");
          }, 0);
          return 0;
        }
        return left;
      });
    }
  });
  useBeat(playing && !finished, 5000, persist);
  useBeat(playing && !finished && !DEMO_MODE, 30000, persistApi);
  usePlaybackSession(sessionId, playing && !finished);
  // once per ending: `apiSave` is a new object after every save, so without this the save re-ran itself in a loop
  const endSaved = useRef(false);
  useEffect(() => {
    if (!finished) endSaved.current = false;
    else if (!endSaved.current && lengthKnownRef.current) {
      endSaved.current = true;
      setPlaying(false);
      persist();
      if (!DEMO_MODE) {
        apiSave.mutate(
          { type: "audiobook", contentId: b.cid ?? b.slug, data: { percentage: 100, positionSeconds: totalRef.current, durationSeconds: totalRef.current, completed: true } },
          { onError: () => undefined },
        );
      }
    }
  }, [finished, persist, apiSave, b.slug]);
  // Save API progress on pause
  const playingRef = useRef(playing);
  useEffect(() => {
    if (!DEMO_MODE && !playing && playingRef.current) {
      persistApi();
    }
    playingRef.current = playing;
  }, [playing, persistApi]);
  useEffect(() => () => {
    persist();
    if (!DEMO_MODE && lengthKnownRef.current) {
      const { chapter: c, into: i } = locate(chapters, posRef.current);
      void meApi.saveProgress("audiobook", b.cid ?? b.slug, { percentage: (posRef.current / totalRef.current) * 100, positionSeconds: posRef.current, durationSeconds: totalRef.current, chapterIndex: c, chapterSeconds: i, completed: finishedRef.current }).catch(() => undefined);
    }
  }, [persist, b.slug]);

  // Fetch presigned audio URL when not in demo mode
  useEffect(() => {
    if (DEMO_MODE) return;
    let cancelled = false;
    setAudioLoading(true);
    mediaApi.getAudiobookPlayback(b.cid ?? b.slug)
      .then((res) => {
        // an answer nobody will use (the player closed, or React ran this twice) gives its stream slot back at once
        if (cancelled && res.data.sessionId) void meApi.endSession(res.data.sessionId).catch(() => undefined);
        if (!cancelled) {
          const p = res.data;
          setSessionId(p.sessionId ?? null);
          // resume from the server-side position (works on any device); metadata load then seeks to it
          if (p.progress?.positionSeconds) setPos(p.progress.positionSeconds);
          if (!p.mediaReady || !p.playback) {
            setAudioError("This audiobook is not yet ready for playback.");
          } else if (p.playback.mode === "SINGLE_FILE") {
            setAudioUrl(p.playback.url);
          } else {
            // CHAPTER_FILES: build a map from chapterNumber → url
            const urlMap: Record<number, string> = {};
            for (const ch of p.playback.chapters) urlMap[ch.chapterNumber] = ch.url;
            setChapterUrls(urlMap);
            // use chapter 1 (or lowest available) as initial src
            const firstKey = Math.min(...Object.keys(urlMap).map(Number));
            setAudioUrl(urlMap[firstKey] ?? null);
          }
          setAudioLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const code = isApiError(err) ? err.code : undefined;
          setAudioError(
            code === "NO_ACTIVE_SUBSCRIPTION" ? "A subscription is required to listen to this audiobook." :
            code === "CONTENT_TYPE_NOT_IN_PLAN" ? "Your plan does not include audiobooks." :
            code === "DOWNLOAD_EXPIRED" ? "This download has expired. Connect to the internet to renew it." :
            code === "CONCURRENT_STREAM_LIMIT_REACHED" ? "You have reached your concurrent stream limit." :
            "Unable to load audio.",
          );
          setAudioLoading(false);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.slug]);

  // Sync audio element play/pause to player state
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !realAudio) return;
    if (playing && !finished) void a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing, finished, realAudio, audioUrl]);

  // Sync playback speed to audio element
  useEffect(() => {
    if (audioRef.current && realAudio) audioRef.current.playbackRate = speed;
  }, [speed, realAudio]);

  // Sync volume / mute to audio element
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !realAudio) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted, realAudio]);

  const seek = (v: number) => {
    const clamped = Math.max(0, Math.min(total, v));
    if (realAudio && audioRef.current) audioRef.current.currentTime = clamped;
    setPos(clamped);
  };
  const jumpChapter = (i: number) => {
    const idx = Math.max(0, Math.min(chapters.length - 1, i));
    if (chapterUrls) {
      // CHAPTER_FILES mode: chapters are 1-indexed from backend
      const url = chapterUrls[idx + 1] ?? chapterUrls[Math.min(...Object.keys(chapterUrls).map(Number))];
      if (url) setAudioUrl(url);
    }
    seek(starts[idx]!);
  };
  const pickSleep = (id: (typeof SLEEP)[number]["id"]) => {
    setSleep(id);
    const opt = SLEEP.find((s) => s.id === id)!;
    setSleepLeft(opt.minutes * 60);
    setMenu(null);
    toast(id === "off" ? "Sleep timer off" : `Sleep timer: ${opt.label}`);
  };

  useKey((e) => {
    if (e.key === " " || e.key.toLowerCase() === "k") {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === "ArrowLeft") seek(posRef.current - 10);
    else if (e.key === "ArrowRight") seek(posRef.current + 30);
    else if (e.key.toLowerCase() === "m") setMuted((x) => !x);
    else if (e.key === "Escape") setMenu(null);
  });

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Loading / access-error states for non-demo playback
  if (!DEMO_MODE && audioLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-border border-t-primary" aria-label="Loading" />
      </div>
    );
  }
  if (!DEMO_MODE && audioError) {
    return (
      <div className="flex h-screen w-full items-center justify-center px-4">
        <p className="text-center text-red-400">{audioError}</p>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {/* Hidden audio element for real playback in non-demo mode */}
      {realAudio && (
        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          preload="auto"
          aria-hidden="true"
          className="hidden"
          onLoadedMetadata={(e) => {
            const a = e.currentTarget;
            if (isFinite(a.duration)) setRealAudioLen(a.duration);
            if (posRef.current > 0 && posRef.current < a.duration - 1) a.currentTime = posRef.current;
          }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onEnded={() => setPos(total)}
          onError={() => setAudioFailed(true)}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 opacity-40 blur-3xl" style={{ background: `linear-gradient(180deg, ${b.palette[0]}, transparent)` }} />
      <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-8">
        <button type="button" onClick={() => { persist(); navigate({ to: "/audiobooks/$slug", params: { slug: b.slug } }); }} className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-soft hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to details
        </button>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
              <BookCover b={b} square className="mx-auto w-48 sm:w-full" />
              <div className="min-w-0">
                <span className="eyebrow text-primary-text">Audiobook</span>
                <h1 className="mt-1 text-3xl font-black tracking-tight">{b.title}</h1>
                <p className="mt-1 text-soft">by {b.author}</p>
                <p className="text-sm text-muted-foreground">Narrated by {b.narrator ?? b.author}</p>
                <div className="mt-5 rounded-lg border border-border bg-surface p-4">
                  <div className="eyebrow text-[10px] text-muted-foreground">Now playing</div>
                  <div className="mt-1 truncate font-semibold" aria-live="polite">{current.title}</div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Chapter progress" aria-valuenow={Math.round((into / current.seconds) * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-primary" style={{ width: `${(into / current.seconds) * 100}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Chapter {clock(into)}</span>
                    <span>{clock(current.seconds - into)} left</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-border bg-surface p-5">
              <Range value={pos} max={total} onChange={seek} label="Timeline" valueText={`${clock(pos)} of ${clock(total)}`} />
              <div className="mt-2 flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{clock(pos)}</span>
                <span>{Math.round((pos / total) * 100)}% · {clock(total)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1 sm:gap-3">
                <IconBtn label="Previous chapter" onClick={() => jumpChapter(into > 5 ? chapter : chapter - 1)}>
                  <SkipBack />
                </IconBtn>
                <IconBtn label="Skip back 10 seconds" onClick={() => seek(pos - 10)}>
                  <RotateCcw />
                </IconBtn>
                <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => { if (finished) seek(0); setPlaying((p) => !p); }} className="grid size-16 place-items-center rounded-full bg-primary shadow-red transition-colors hover:bg-primary-hover [&_svg]:size-7">
                  {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
                </button>
                <IconBtn label="Skip forward 30 seconds" onClick={() => seek(pos + 30)}>
                  <RotateCw />
                </IconBtn>
                <IconBtn label="Next chapter" onClick={() => jumpChapter(chapter + 1)} disabled={chapter >= chapters.length - 1}>
                  <SkipForward />
                </IconBtn>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === "speed" ? null : "speed")} aria-haspopup="menu" aria-expanded={menu === "speed"} aria-label={`Playback speed ${fmtSpeed(speed)}`} className="h-9 rounded-md border border-border bg-surface-2 px-3 text-sm font-bold hover:bg-surface-3">
                    {fmtSpeed(speed)}
                  </button>
                  {menu === "speed" && (
                    <div role="menu" aria-label="Playback speed" className="absolute bottom-11 left-0 z-20 w-32 rounded-lg border border-border bg-surface-2 p-1 shadow-card">
                      {SPEEDS.map((s) => (
                        <button key={s} type="button" role="menuitemradio" aria-checked={s === speed} onClick={() => { setSpeed(s); setMenu(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-surface-3">
                          {fmtSpeed(s)} {s === speed && <Check className="size-4 text-primary-text" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((x) => !x)}>
                    <VolIcon />
                  </IconBtn>
                  <div className="w-28">
                    <Range value={muted ? 0 : volume} max={1} onChange={(v) => { setVolume(v); setMuted(false); }} label="Volume" valueText={`${Math.round((muted ? 0 : volume) * 100)}%`} />
                  </div>
                </div>
                <div className="relative">
                  <button type="button" onClick={() => setMenu(menu === "sleep" ? null : "sleep")} aria-haspopup="menu" aria-expanded={menu === "sleep"} className={cn("inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold hover:bg-surface-3", sleep === "off" ? "border-border bg-surface-2" : "border-primary bg-primary/10")}>
                    <Moon className="size-4" /> {sleep === "off" ? "Sleep timer" : sleep === "chapter" ? "End of chapter" : `${clock(sleepLeft)} left`}
                  </button>
                  {menu === "sleep" && (
                    <div role="menu" aria-label="Sleep timer" className="absolute right-0 bottom-11 z-20 w-44 rounded-lg border border-border bg-surface-2 p-1 shadow-card">
                      {SLEEP.map((s) => (
                        <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === sleep} onClick={() => pickSleep(s.id)} className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-surface-3">
                          {s.label} {s.id === sleep && <Check className="size-4 text-primary-text" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {finished && <p className="mt-4 text-center text-sm text-soft">You've finished this audiobook. Press play to listen again.</p>}
            </div>
          </div>

          <aside aria-label="Chapters" className="rounded-xl border border-border bg-surface lg:max-h-[640px] lg:overflow-hidden">
            <div className="border-b border-border px-5 py-4 text-sm font-bold">Chapters <span className="font-normal text-muted-foreground">· {chapters.length}</span></div>
            <ol className="max-h-[520px] overflow-auto lg:max-h-[580px]">
              {chapters.map((c, i) => (
                <li key={c.title}>
                  <button type="button" aria-current={i === chapter} onClick={() => { jumpChapter(i); setPlaying(true); }} className={cn("flex w-full items-center justify-between gap-3 border-b border-border px-5 py-3 text-left text-sm last:border-0 hover:bg-surface-2", i === chapter && "bg-surface-2")}>
                    <span className="flex min-w-0 items-center gap-3">
                      {i === chapter && playing ? <Pause className="size-3.5 shrink-0 fill-current text-primary-text" /> : <Play className={cn("size-3.5 shrink-0 fill-current", i === chapter ? "text-primary-text" : "text-muted-foreground")} />}
                      <span className={cn("truncate", i === chapter && "font-semibold")}>{c.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{clock(c.seconds)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </main>
  );
}

