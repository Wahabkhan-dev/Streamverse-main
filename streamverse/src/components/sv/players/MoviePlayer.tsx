import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, Volume1, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/api/client";
import { mediaApi } from "@/api/media.api";
import { meApi } from "@/api/me.api";
import type { Movie } from "@/lib/data";
import { DEMO_MODE } from "@/lib/config";
import { useSaveProgressMutation } from "@/hooks/useApiMe";
import { useCatalog } from "@/lib/items";
import { movieFileKey, useStoredFileUrl } from "@/lib/media-store";
import { clock, runtimeSeconds } from "@/lib/runtime";
import { useSettings } from "@/lib/store";
import { getUser, refKey, saveProgress, usePrefs } from "@/lib/user";
import { cn } from "@/lib/utils";
import { IconBtn, Range, SPEEDS, fmtSpeed, useBeat, useFullscreen, useKey } from "./common";

type Trailer = "official" | "teaser" | "bts";
const TRAILER_LEN: Record<Trailer, number> = { official: 130, teaser: 45, bts: 210 };
const TRAILER_NAME: Record<Trailer, string> = { official: "Official Trailer", teaser: "Teaser", bts: "Behind the Scenes" };

const LINES: Record<string, string[]> = {
  English: ["We don't have much time.", "Stay close. Whatever happens, stay close.", "Did you hear that?", "It was never about the map."],
  Spanish: ["No tenemos mucho tiempo.", "QuÃ©date cerca. Pase lo que pase.", "Â¿Lo oÃ­ste?", "Nunca se tratÃ³ del mapa."],
  French: ["Nous n'avons pas beaucoup de temps.", "Reste prÃ¨s de moi, quoi qu'il arrive.", "Tu as entendu Ã§a ?", "Ce n'Ã©tait jamais Ã  propos de la carte."],
  German: ["Wir haben nicht viel Zeit.", "Bleib in meiner NÃ¤he.", "Hast du das gehÃ¶rt?", "Es ging nie um die Karte."],
};
const captionAt = (lang: string, t: number) => {
  const lines = LINES[lang] ?? LINES["English"]!.map((l) => `[${lang}] ${l}`);
  // a caption shows for 4s out of every 7s
  const slot = Math.floor(t / 7);
  return t % 7 < 4 ? lines[slot % lines.length]! : "";
};

type Panel = null | "main" | "quality" | "audio" | "subtitles" | "speed";

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
  const [accessLoading, setAccessLoading] = useState(!DEMO_MODE && !trailer);
  // In non-demo mode use presigned URL; in demo mode use admin-uploaded local file
  const effectiveSrc = (!DEMO_MODE && !trailer) ? videoUrl : fileUrl;
  const real = !!effectiveSrc && !failed;
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
  const qualityOptions = ["Auto", ...(m.badges.includes("4K") ? ["4K"] : []), "1080p", "720p", "480p"];
  const [quality, setQuality] = useState(qualityOptions.includes(prefs.quality) ? prefs.quality : "Auto");
  const [audio, setAudio] = useState(audioOptions.includes(prefs.audioLanguage) ? prefs.audioLanguage : audioOptions[0]!);
  const [subtitle, setSubtitle] = useState(subtitleOptions.includes(prefs.subtitleDefault) ? prefs.subtitleDefault : "Off");
  const [show, setShow] = useState(true);
  const hideTimer = useRef<number>(undefined);
  const tRef = useRef(t);
  tRef.current = t;
  const ended = t >= total - (real ? 0.3 : 0);
  const totalRef = useRef(total);
  totalRef.current = total;
  const endedRef = useRef(ended);
  endedRef.current = ended;
  const apiSave = useSaveProgressMutation();

  // Fetch presigned streaming URL when not in demo mode and not showing a trailer
  useEffect(() => {
    if (DEMO_MODE || trailer) return;
    let cancelled = false;
    setAccessLoading(true);
    mediaApi.getMoviePlayback(m.slug)
      .then((res) => {
        if (!cancelled) {
          const p = res.data;
          const url = p.mediaReady && p.playback?.mode === "SINGLE_FILE" ? p.playback.url : null;
          setVideoUrl(url);
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
      { type: "movie", contentId: m.slug, data: { percentage: (now / totalRef.current) * 100, positionSeconds: now, completed: endedRef.current } },
      { onError: () => undefined },
    );
  }, [apiSave, m.slug, trailer]);

  useBeat(playing && !ended && !real, 250, (dt) => setT((v) => Math.min(total, v + dt * speed)));
  useBeat(playing && !ended, 5000, persist);
  // API writes throttled to 30s; pause is handled by a dedicated effect below
  useBeat(playing && !ended && !DEMO_MODE, 30000, persistApi);
  useEffect(() => {
    if (ended) {
      setPlaying(false);
      persist();
      if (!DEMO_MODE && !trailer) {
        apiSave.mutate(
          { type: "movie", contentId: m.slug, data: { percentage: 100, positionSeconds: totalRef.current, completed: true } },
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
      void meApi.saveProgress("movie", m.slug, { percentage: (now / totalRef.current) * 100, positionSeconds: now, completed: endedRef.current }).catch(() => undefined);
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

  useKey((e) => {
    wake();
    if (e.key === " " || e.key.toLowerCase() === "k") {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === "ArrowLeft") seek(tRef.current - (e.shiftKey ? 30 : 10));
    else if (e.key === "ArrowRight") seek(tRef.current + (e.shiftKey ? 30 : 10));
    else if (e.key === "ArrowUp") setVolume((v) => Math.min(1, v + 0.05));
    else if (e.key === "ArrowDown") setVolume((v) => Math.max(0, v - 0.05));
    else if (e.key.toLowerCase() === "m") setMuted((x) => !x);
    else if (e.key.toLowerCase() === "f") toggleFs();
    else if (e.key === "Escape") {
      if (panel) setPanel(null);
      else if (!document.fullscreenElement) close();
    }
  });

  const choose = (what: "quality" | "audio" | "subtitles", value: string) => {
    if (what === "quality") setQuality(value);
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
  if (!DEMO_MODE && !trailer && accessLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="size-8 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-label="Loading" />
      </div>
    );
  }
  if (!DEMO_MODE && !trailer && accessError) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black px-4">
        <p className="text-center text-red-400">{accessError}</p>
      </div>
    );
  }

  const row = (label: string, value: string, to: Panel) => (
    <button type="button" onClick={() => setPanel(to)} className="flex w-full items-center justify-between gap-6 rounded-md px-3 py-2.5 text-left text-sm hover:bg-foreground/10">
      <span>{label}</span>
      <span className="text-muted-foreground">{value} â€º</span>
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
          src={effectiveSrc ?? undefined}
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
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => setPlaying((p) => !p)} className="absolute inset-0" />

      {!playing && !ended && (
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
          <p className="truncate text-xs text-soft">{trailer ? `Trailer Â· ${TRAILER_NAME[trailer]}` : `Feature film Â· ${m.year} Â· ${m.rating}`}</p>
        </div>
        <span className="ml-auto hidden rounded border border-foreground/30 px-2 py-0.5 text-[11px] font-bold sm:block">{quality === "Auto" ? "AUTO" : quality}</span>
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
            <IconBtn label="Settings" active={panel === "main"} onClick={() => setPanel(panel ? null : "main")} aria-haspopup="menu" aria-expanded={!!panel}>
              <Settings />
            </IconBtn>
            <IconBtn label={isFs ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFs}>
              {isFs ? <Minimize /> : <Maximize />}
            </IconBtn>
            {panel && (
              <div role="menu" aria-label="Player settings" className="absolute right-0 bottom-12 max-h-[60vh] w-64 overflow-auto rounded-lg border border-border bg-ink/95 p-1.5 shadow-card backdrop-blur">
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
                {panel === "speed" && optionList("Playback speed", SPEEDS.map(fmtSpeed), fmtSpeed(speed), (v) => { setSpeed(parseFloat(v)); setPanel(null); })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

