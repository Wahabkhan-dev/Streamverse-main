import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronRight, Gauge, Keyboard, Maximize, Minimize, Pause, PictureInPicture, Play, RotateCcw, RotateCw, Settings, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/api/client";
import { mediaApi } from "@/api/media.api";
import { isHlsUrl, preloadHls, useHls } from "@/hooks/useHls";
import { usePlaybackSession } from "@/hooks/usePlaybackSession";
import { meApi } from "@/api/me.api";
import type { Movie } from "@/lib/data";
import { DEMO_MODE } from "@/lib/config";
import { useSaveProgressMutation } from "@/hooks/useApiMe";
import { useCatalog } from "@/lib/items";
import { movieFileKey, useStoredFileUrl } from "@/lib/media-store";
import { clock, runtimeSeconds } from "@/lib/runtime";
import { useSettings } from "@/lib/store";
import { getUser, refKey, saveProgress, usePrefs } from "@/lib/user";
import { closeMini, openMini } from "@/lib/miniPlayer";
import { cn } from "@/lib/utils";
import { IconBtn, Range, SPEEDS, fmtSpeed, useBeat, useFullscreen, useKey } from "./common";

type Trailer = "official" | "teaser" | "bts";
const TRAILER_LEN: Record<Trailer, number> = { official: 130, teaser: 45, bts: 210 };
const TRAILER_NAME: Record<Trailer, string> = { official: "Official Trailer", teaser: "Teaser", bts: "Behind the Scenes" };

const LINES: Record<string, string[]> = {
  English: ["We don't have much time.", "Stay close. Whatever happens, stay close.", "Did you hear that?", "It was never about the map."],
  Spanish: ["No tenemos mucho tiempo.", "Quédate cerca. Pase lo que pase.", "¿Lo oíste?", "Nunca se trató del mapa."],
  French: ["Nous n'avons pas beaucoup de temps.", "Reste près de moi, quoi qu'il arrive.", "Tu as entendu ça ?", "Ce n'était jamais à propos de la carte."],
  German: ["Wir haben nicht viel Zeit.", "Bleib in meiner Nähe.", "Hast du das gehört?", "Es ging nie um die Karte."],
};
const captionAt = (lang: string, t: number) => {
  const lines = LINES[lang] ?? LINES["English"]!.map((l) => `[${lang}] ${l}`);
  // a caption shows for 4s out of every 7s
  const slot = Math.floor(t / 7);
  return t % 7 < 4 ? lines[slot % lines.length]! : "";
};

type Panel = null | "main" | "quality" | "audio" | "subtitles" | "speed" | "keys";

/** The keyboard shortcuts, as listed in the player's "Keyboard shortcuts" panel. */
const SHORTCUTS: Array<[string, string]> = [
  ["Space / K", "Play or pause"],
  ["← / →", "Back or forward 5 seconds"],
  ["J / L", "Back or forward 10 seconds"],
  ["↑ / ↓", "Volume up or down"],
  ["M", "Mute or unmute"],
  ["F or double-click", "Full screen on or off"],
  ["I", "Mini player: keeps playing while you browse, and over other apps"],
  ["0 – 9", "Jump to 0% – 90% of the movie"],
  ["Home / End", "Jump to the start or the end"],
  ["Shift + > / <", "Faster or slower"],
  ["?", "Show this list"],
  ["Esc", "Close a menu, then the player"],
];

/** What the centre-of-screen flash shows after a key press. */
type Flash = { id: number; kind: "volume" | "mute" | "back" | "forward" | "speed" | "play" | "pause"; text: string };

export function MoviePlayer({ m, trailer }: { m: Movie; trailer?: Trailer | undefined }) {
  const navigate = useNavigate();
  const cat = useCatalog();
  const prefs = usePrefs();
  const settings = useSettings();
  const box = useRef<HTMLDivElement>(null);
  const { isFs, toggle: toggleFs } = useFullscreen(box);

  // a video uploaded in the admin console plays for real; titles without one keep the simulated player
  const fileUrl = useStoredFileUrl(movieFileKey(m.slug, trailer ? (trailer === "official" ? "trailer" : trailer) : "main"));
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [realLen, setRealLen] = useState(0);
  // Presigned URL from backend (non-demo, non-trailer only)
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(!DEMO_MODE);
  // In non-demo mode use presigned URL; in demo mode use admin-uploaded local file
  const effectiveSrc = !DEMO_MODE ? videoUrl : fileUrl;
  const real = !!effectiveSrc && !failed;
  const hls = isHlsUrl(effectiveSrc);
  const total = real && realLen > 0 ? realLen : trailer ? TRAILER_LEN[trailer] : runtimeSeconds(m.runtime);
  const saved = trailer ? undefined : getUser().progress[refKey({ type: "Movie", slug: m.slug })];
  const [t, setT] = useState(() => (saved && !saved.completed ? Math.min(saved.seconds ?? 0, total - 5) : 0));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const audioOptions = m.info?.audio?.length ? m.info.audio : ["English"];
  const subtitleOptions = m.info?.subtitles?.length ? m.info.subtitles : ["English"];
  const demoQualities = ["Auto", ...(m.badges.includes("4K") ? ["4K"] : []), "1080p", "720p", "480p"];
  const [quality, setQuality] = useState(demoQualities.includes(prefs.quality) ? prefs.quality : "Auto");
  const [audio, setAudio] = useState(audioOptions.includes(prefs.audioLanguage) ? prefs.audioLanguage : audioOptions[0]!);
  const [subtitle, setSubtitle] = useState(subtitleOptions.includes(prefs.subtitleDefault) ? prefs.subtitleDefault : "Off");
  const [show, setShow] = useState(true);
  const hideTimer = useRef<number>(undefined);
  const tRef = useRef(t);
  tRef.current = t;
  // an unknown length (stream metadata not loaded yet) is never "finished"
  const ended = total > 0 && t >= total - (real ? 0.3 : 0);
  const totalRef = useRef(total);
  totalRef.current = total;
  const endedRef = useRef(ended);
  endedRef.current = ended;
  const apiSave = useSaveProgressMutation();
  // fetch the streaming library while the access check runs, instead of after it
  useEffect(() => {
    if (!DEMO_MODE) void preloadHls().catch(() => undefined);
  }, []);
  const stream = useHls(video, real ? effectiveSrc : null, () => setFailed(true), tRef.current);
  // the qualities this movie's stream really has; the fixed list is only for the demo / a plain video file
  const qualityOptions = stream.qualities.length ? ["Auto", ...stream.qualities.map((q) => q.label)] : demoQualities;
  const applyQuality = (label: string) => {
    const q = stream.qualities.find((x) => x.label === label);
    stream.setQuality(q ? q.index : null);
  };
  // the viewer's saved preference, once the stream says which qualities it has
  useEffect(() => {
    if (!stream.qualities.length) return;
    const pick = stream.qualities.some((q) => q.label === quality) ? quality : "Auto";
    setQuality(pick);
    // Auto is how the stream starts anyway; switching to it would only throw away what is already loaded
    if (pick !== "Auto") applyQuality(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.qualities]);
  // set when "i" passes the stream to the mini player, which then holds the stream slot instead
  const handedOff = useRef(false);
  usePlaybackSession(sessionId, playing && !ended, handedOff);

  // Fetch the signed URL of the trailer / teaser the admin uploaded (live mode)
  useEffect(() => {
    if (DEMO_MODE || !trailer) return;
    let cancelled = false;
    setAccessLoading(true);
    setAccessError(null);
    mediaApi.getMovieTrailer(m.cid ?? m.slug, trailer === "teaser" ? "teaser" : "trailer")
      .then((res) => {
        if (cancelled) return;
        setVideoUrl(res.data.url);
        setAccessLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAccessError(`This movie has no ${TRAILER_NAME[trailer].toLowerCase()} yet.`);
        setAccessLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.slug, trailer]);

  // Fetch presigned streaming URL when not in demo mode and not showing a trailer
  useEffect(() => {
    if (DEMO_MODE || trailer) return;
    let cancelled = false;
    setAccessLoading(true);
    mediaApi.getMoviePlayback(m.cid ?? m.slug)
      .then((res) => {
        // an answer nobody will use (the player closed, or React ran this twice) gives its stream slot back at once
        if (cancelled && res.data.sessionId) void meApi.endSession(res.data.sessionId).catch(() => undefined);
        if (!cancelled) {
          const p = res.data;
          const url = p.mediaReady ? p.playback.url : null;
          setVideoUrl(url);
          setSessionId(res.data.sessionId ?? null);
          // resume from the server-side position (works on any device); metadata load then seeks to it
          if (res.data.progress?.positionSeconds) setT(res.data.progress.positionSeconds);
          if (!url) setAccessError("This movie is not yet ready for playback.");
          setAccessLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const code = isApiError(err) ? err.code : undefined;
          setAccessError(
            code === "NO_ACTIVE_SUBSCRIPTION" ? "A subscription is required to watch this movie." :
            code === "CONTENT_TYPE_NOT_IN_PLAN" ? "Your plan does not include movies." :
            code === "DOWNLOAD_EXPIRED" ? "This download has expired. Connect to the internet to renew it." :
            code === "CONCURRENT_STREAM_LIMIT_REACHED" ? "You have reached your concurrent stream limit." :
            "Unable to load video.",
          );
          setAccessLoading(false);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.slug, trailer]);

  // drive the real video from the player state
  useEffect(() => {
    const v = video.current;
    if (!v || !real) return;
    if (playing && !ended) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [playing, ended, real, effectiveSrc]);
  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed, real]);
  useEffect(() => {
    if (video.current) {
      video.current.volume = volume;
      video.current.muted = muted;
    }
  }, [volume, muted, real]);

  const wake = useCallback(() => {
    setShow(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShow(false), 3200);
  }, []);
  useEffect(() => {
    wake();
    return () => window.clearTimeout(hideTimer.current);
  }, [wake]);

  const persist = useCallback(() => {
    if (trailer) return;
    const now = tRef.current;
    saveProgress({ type: "Movie", slug: m.slug }, { seconds: now, pct: (now / total) * 100 });
  }, [trailer, m.slug, total]);

  const persistApi = useCallback(() => {
    if (DEMO_MODE || trailer) return;
    const now = tRef.current;
    apiSave.mutate(
      { type: "movie", contentId: m.cid ?? m.slug, data: { percentage: (now / totalRef.current) * 100, positionSeconds: now, durationSeconds: totalRef.current, completed: endedRef.current } },
      { onError: () => undefined },
    );
  }, [apiSave, m.slug, trailer]);

  useBeat(playing && !ended && !real, 250, (dt) => setT((v) => Math.min(total, v + dt * speed)));
  useBeat(playing && !ended, 5000, persist);
  // API writes throttled to 30s; pause is handled by a dedicated effect below
  useBeat(playing && !ended && !DEMO_MODE, 30000, persistApi);
  // once per ending: `apiSave` is a new object after every save, so without this the save re-ran itself in a loop
  const endSaved = useRef(false);
  useEffect(() => {
    if (!ended) endSaved.current = false;
    else if (!endSaved.current) {
      endSaved.current = true;
      setPlaying(false);
      persist();
      if (!DEMO_MODE && !trailer) {
        apiSave.mutate(
          { type: "movie", contentId: m.cid ?? m.slug, data: { percentage: 100, positionSeconds: totalRef.current, durationSeconds: totalRef.current, completed: true } },
          { onError: () => undefined },
        );
      }
    }
  }, [ended, persist, apiSave, m.slug, trailer]);
  // Save API progress on pause
  const playingRef = useRef(playing);
  useEffect(() => {
    if (!DEMO_MODE && !trailer && !playing && playingRef.current) {
      persistApi();
    }
    playingRef.current = playing;
  }, [playing, persistApi, trailer]);
  useEffect(() => () => {
    persist();
    if (!DEMO_MODE && !trailer) {
      const now = tRef.current;
      void meApi.saveProgress("movie", m.cid ?? m.slug, { percentage: (now / totalRef.current) * 100, positionSeconds: now, durationSeconds: totalRef.current, completed: endedRef.current }).catch(() => undefined);
    }
  }, [persist, m.slug, trailer]);

  const seek = (v: number) => {
    const to = Math.max(0, Math.min(total, v));
    if (real && video.current) video.current.currentTime = to;
    setT(to);
  };
  const close = () => {
    persist();
    navigate({ to: "/movies/$slug", params: { slug: m.slug } });
  };
  const next = cat.listedMovies.find((x) => x.slug !== m.slug && x.genres.some((g) => m.genres.includes(g))) ?? cat.listedMovies.find((x) => x.slug !== m.slug);

  // the short centre-of-screen flash after a key press: "+5s", "70%", "1.5x"
  const [flash, setFlash] = useState<Flash | null>(null);
  const flashTimer = useRef<number>(undefined);
  const show1 = (kind: Flash["kind"], text: string) => {
    setFlash({ id: Date.now(), kind, text });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 900);
  };
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const skip = (sec: number) => {
    seek(tRef.current + sec);
    show1(sec < 0 ? "back" : "forward", `${Math.abs(sec)} sec`);
  };
  const nudgeVolume = (delta: number) => {
    const v = Math.round(Math.min(1, Math.max(0, (muted ? 0 : volume) + delta)) * 100) / 100;
    setVolume(v);
    setMuted(v === 0);
    show1(v === 0 ? "mute" : "volume", `${Math.round(v * 100)}%`);
  };
  const toggleMute = () => {
    const now = !muted;
    setMuted(now);
    show1(now ? "mute" : "volume", now ? "Muted" : `${Math.round(volume * 100)}%`);
  };
  const nudgeSpeed = (dir: 1 | -1) => {
    const i = SPEEDS.indexOf(speed);
    const s = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (i < 0 ? SPEEDS.indexOf(1) : i) + dir))]!;
    setSpeed(s);
    show1("speed", fmtSpeed(s));
  };

  // one movie at a time: opening the full player takes over from the corner player
  useEffect(() => closeMini(), []);

  // mini player, like YouTube's: the movie keeps playing in a corner while the viewer goes to its page and browses
  const toMini = () => {
    if (!real || !effectiveSrc) return void toast("The mini player opens once the video is playing.");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    handedOff.current = true;
    openMini({ slug: m.slug, title: m.title, contentId: m.cid ?? m.slug, src: effectiveSrc, startAt: tRef.current, volume, muted, sessionId, ...(trailer ? { trailer } : {}) });
    close();
  };

  useKey((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
    wake();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // keys the page would otherwise use itself (scrolling, pressing the focused button, moving a slider)
    if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(k)) e.preventDefault();
    if (k === " " || k === "k") {
      show1(playing ? "pause" : "play", playing ? "Paused" : "Play");
      setPlaying((p) => !p);
    } else if (k === "ArrowLeft") skip(-5);
    else if (k === "ArrowRight") skip(5);
    else if (k === "j") skip(-10);
    else if (k === "l") skip(10);
    else if (k === "ArrowUp") nudgeVolume(0.1);
    else if (k === "ArrowDown") nudgeVolume(-0.1);
    else if (k === "m") toggleMute();
    else if (k === "f") toggleFs();
    else if (k === "i") toMini();
    else if (k === "Home") seek(0);
    else if (k === "End") seek(total - 1);
    else if (/^[0-9]$/.test(k)) seek((Number(k) / 10) * total);
    else if (k === ">" || (e.shiftKey && k === ".")) nudgeSpeed(1);
    else if (k === "<" || (e.shiftKey && k === ",")) nudgeSpeed(-1);
    else if (k === "?") setPanel((p) => (p === "keys" ? null : "keys"));
    else if (k === "Escape") {
      if (panel) setPanel(null);
      else if (!document.fullscreenElement) close();
    }
  });

  const choose = (what: "quality" | "audio" | "subtitles", value: string) => {
    if (what === "quality") {
      setQuality(value);
      applyQuality(value);
    }
    if (what === "audio") setAudio(value);
    if (what === "subtitles") setSubtitle(value);
    toast(`${what === "subtitles" ? "Subtitles" : what[0]!.toUpperCase() + what.slice(1)}: ${value}`);
    setPanel("main");
  };

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  // the sample captions are made up, so they are not drawn over a real video
  const caption = !real && subtitle !== "Off" && playing ? captionAt(subtitle, t) : "";
  const visible = show || !playing || !!panel;

  // Loading / access-error states for non-demo, non-trailer playback
  if (!DEMO_MODE && accessLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="size-8 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-label="Loading" />
      </div>
    );
  }
  if (!DEMO_MODE && accessError) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black px-4">
        <p className="text-center text-red-400">{accessError}</p>
      </div>
    );
  }

  const row = (label: string, value: string, to: Panel) => (
    <button type="button" onClick={() => setPanel(to)} className="flex w-full items-center justify-between gap-6 rounded-md px-3 py-2.5 text-left text-sm hover:bg-foreground/10">
      <span>{label}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {value}
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </span>
    </button>
  );
  const optionList = (title: string, options: string[], value: string, onPick: (v: string) => void) => (
    <div role="radiogroup" aria-label={title}>
      <button type="button" onClick={() => setPanel("main")} className="mb-1 flex items-center gap-2 px-3 py-2 text-sm font-bold">
        <ArrowLeft className="size-4" /> {title}
      </button>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onPick(o)} className="flex w-full items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/10">
          {o}
          {o === value && <Check className="size-4 text-primary-text" />}
        </button>
      ))}
    </div>
  );

  return (
    <main ref={box} onMouseMove={wake} onTouchStart={wake} className={cn("relative h-screen w-full overflow-hidden bg-black text-foreground select-none", !visible && playing && "cursor-none")}>
      {/* the picture: simulated playback over the title's artwork */}
      {real ? (
        <video
          ref={video}
          src={hls ? undefined : (effectiveSrc ?? undefined)}
          playsInline
          preload="auto"
          aria-label={`${m.title} video`}
          className="absolute inset-0 size-full bg-black object-contain"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (isFinite(v.duration)) setRealLen(v.duration);
            if (tRef.current > 0 && tRef.current < v.duration - 1) v.currentTime = tRef.current;
          }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onEnded={() => setT(total)}
          onError={() => {
            setFailed(true);
            toast.error("This browser can't play the uploaded file. Re-export it as MP4 (H.264 video + AAC audio) and upload it again.");
          }}
        />
      ) : (
        <>
          <img src={m.image} alt="" className={cn("absolute inset-0 size-full object-cover transition-transform duration-[20000ms] ease-linear", playing ? "scale-110" : "scale-100")} />
          <div className="absolute inset-0 bg-black/35" />
        </>
      )}
      <button type="button" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={() => setPlaying((p) => !p)} onDoubleClick={toggleFs} className="absolute inset-0" />

      {flash && (
        <div key={flash.id} role="status" aria-live="polite" data-testid="player-flash" className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 flex-col items-center gap-2 rounded-2xl bg-black/65 px-6 py-4 backdrop-blur duration-150">
          {flash.kind === "volume" ? <Volume2 className="size-8" /> : flash.kind === "mute" ? <VolumeX className="size-8" /> : flash.kind === "back" ? <RotateCcw className="size-8" /> : flash.kind === "forward" ? <RotateCw className="size-8" /> : flash.kind === "speed" ? <Gauge className="size-8" /> : flash.kind === "pause" ? <Pause className="size-8 fill-current" /> : <Play className="size-8 fill-current" />}
          <span className="text-lg font-bold tabular-nums">{flash.text}</span>
          {(flash.kind === "volume" || flash.kind === "mute") && (
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full bg-primary" style={{ width: `${muted ? 0 : Math.round(volume * 100)}%` }} />
            </span>
          )}
        </div>
      )}

      {!playing && !ended && !flash && (
        <span className="pointer-events-none absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink/60 backdrop-blur">
          <Play className="size-9 fill-current" />
        </span>
      )}

      {caption && <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center px-6"><span className="max-w-3xl rounded bg-black/70 px-3 py-1.5 text-center text-lg font-medium">{caption}</span></div>}

      {/* top bar */}
      <div className={cn("absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-4 transition-opacity duration-300 md:px-6", visible ? "opacity-100" : "pointer-events-none opacity-0")}>
        <IconBtn label="Close player" onClick={close}>
          <X />
        </IconBtn>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold md:text-lg">{m.title}</h1>
          <p className="truncate text-xs text-soft">{trailer ? `Trailer · ${TRAILER_NAME[trailer]}` : `Feature film · ${m.year} · ${m.rating}`}</p>
        </div>
        <span className="ml-auto hidden rounded border border-foreground/30 px-2 py-0.5 text-[11px] font-bold sm:block" data-testid="quality-badge">
          {quality === "Auto" ? `AUTO${stream.playingHeight ? ` · ${stream.playingHeight >= 2160 ? "4K" : `${stream.playingHeight}p`}` : ""}` : quality}
        </span>
      </div>

      {ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center">
          <div>
            <h2 className="text-2xl font-bold">{trailer ? "Trailer finished" : "You've finished"} {trailer ? "" : m.title}</h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => { seek(0); setPlaying(true); }} className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold hover:bg-primary-hover">
                <RotateCcw className="size-4" /> Replay
              </button>
              {!trailer && prefs.autoplayNext && settings.autoplayNext && next && (
                <button type="button" onClick={() => navigate({ to: "/watch/$slug", params: { slug: next.slug } })} className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-foreground/15 px-5 text-sm font-semibold hover:bg-foreground/25">
                  <Play className="size-4 fill-current" /> Up next: {next.title}
                </button>
              )}
              <button type="button" onClick={close} className="inline-flex h-11 items-center rounded-md border border-border px-5 text-sm font-semibold hover:bg-foreground/10">
                Back to details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* controls */}
      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pt-12 pb-4 transition-opacity duration-300 md:px-6", visible ? "opacity-100" : "pointer-events-none opacity-0")}>
        <Range value={t} max={total} onChange={seek} label="Seek" valueText={`${clock(t)} of ${clock(total)}`} />
        <div className="mt-2 flex items-center gap-1 md:gap-2">
          <IconBtn label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </IconBtn>
          <IconBtn label="Skip back 10 seconds" onClick={() => seek(t - 10)} className="hidden sm:grid">
            <RotateCcw />
          </IconBtn>
          <IconBtn label="Skip forward 10 seconds" onClick={() => seek(t + 10)} className="hidden sm:grid">
            <RotateCw />
          </IconBtn>
          <div className="group/vol flex items-center">
            <IconBtn label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((x) => !x)}>
              <VolIcon />
            </IconBtn>
            <div className="hidden w-24 sm:block">
              <Range value={muted ? 0 : volume} max={1} onChange={(v) => { setVolume(v); setMuted(false); }} label="Volume" valueText={`${Math.round((muted ? 0 : volume) * 100)}%`} />
            </div>
          </div>
          <span className="ml-2 hidden sm:inline text-xs tabular-nums" aria-live="off">
            {clock(t)} / {clock(total)}
          </span>
          <div className="relative ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setPanel(panel === "speed" ? null : "speed")} aria-haspopup="menu" className="h-9 rounded-full px-3 text-xs font-bold hover:bg-foreground/15" aria-label={`Playback speed ${fmtSpeed(speed)}`}>
              {fmtSpeed(speed)}
            </button>
            <IconBtn label="Keyboard shortcuts (?)" active={panel === "keys"} onClick={() => setPanel(panel === "keys" ? null : "keys")} className="hidden md:grid">
              <Keyboard />
            </IconBtn>
            <IconBtn label="Settings" active={panel === "main"} onClick={() => setPanel(panel ? null : "main")} aria-haspopup="menu" aria-expanded={!!panel}>
              <Settings />
            </IconBtn>
            {real && (
              <IconBtn label="Mini player (i)" onClick={toMini}>
                <PictureInPicture />
              </IconBtn>
            )}
            <IconBtn label={isFs ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFs}>
              {isFs ? <Minimize /> : <Maximize />}
            </IconBtn>
            {panel && (
              <div role="menu" aria-label="Player settings" className={cn("absolute right-0 bottom-12 max-h-[60vh] overflow-auto", panel === "keys" ? "w-80" : "w-64", "rounded-lg border border-border bg-ink/95 p-1.5 shadow-card backdrop-blur")}>
                {panel === "main" && (
                  <>
                    {row("Quality", quality, "quality")}
                    {row("Audio", audio, "audio")}
                    {row("Subtitles", subtitle, "subtitles")}
                    {row("Speed", fmtSpeed(speed), "speed")}
                  </>
                )}
                {panel === "quality" && optionList("Quality", qualityOptions, quality, (v) => choose("quality", v))}
                {panel === "audio" && optionList("Audio", audioOptions, audio, (v) => choose("audio", v))}
                {panel === "subtitles" && optionList("Subtitles", ["Off", ...subtitleOptions], subtitle, (v) => choose("subtitles", v))}
                {panel === "keys" && (
                  <div aria-label="Keyboard shortcuts" data-testid="player-shortcuts">
                    <div className="px-3 py-2 text-sm font-bold">Keyboard shortcuts</div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 pb-2 text-xs">
                      {SHORTCUTS.map(([key, what]) => (
                        <div key={key} className="contents">
                          <dt className="font-mono font-semibold whitespace-nowrap">{key}</dt>
                          <dd className="text-muted-foreground">{what}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {panel === "speed" && optionList("Playback speed", SPEEDS.map(fmtSpeed), fmtSpeed(speed), (v) => { setSpeed(parseFloat(v)); setPanel(null); })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

