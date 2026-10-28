import { useNavigate } from "@tanstack/react-router";
import { Maximize2, Pause, PictureInPicture2, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { meApi } from "@/api/me.api";
import { isHlsUrl, useHls } from "@/hooks/useHls";
import { usePlaybackSession } from "@/hooks/usePlaybackSession";
import { DEMO_MODE } from "@/lib/config";
import { closeMini, useMini, type MiniPlayback } from "@/lib/miniPlayer";
import { saveProgress } from "@/lib/user";
import { IconBtn, useKey } from "./common";

/**
 * The corner player, like YouTube's: after "i" in the full player the movie keeps playing here while the viewer moves
 * around the site. Expand goes back to the full player at the same moment; the browser's own picture-in-picture
 * window is one more click away for watching over other apps.
 */
export function MiniPlayer() {
  const mini = useMini();
  return mini ? <Mini key={`${mini.slug}-${mini.trailer ?? "film"}-${mini.startAt}`} p={mini} /> : null;
}

function Mini({ p }: { p: MiniPlayback }) {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(p.startAt);
  const [len, setLen] = useState(0);
  const tRef = useRef(p.startAt);
  tRef.current = t;
  const hls = isHlsUrl(p.src);
  usePlaybackSession(p.sessionId, playing);
  useHls(video, p.src, () => {
    toast.error("The video stopped. Open it again from the movie page.");
    closeMini();
  }, p.startAt);

  const save = async () => {
    if (p.trailer) return;
    const now = tRef.current;
    const total = len || video.current?.duration || 0;
    saveProgress({ type: "Movie", slug: p.slug }, { seconds: now, pct: total ? (now / total) * 100 : 0 });
    if (DEMO_MODE || !total) return;
    await meApi
      .saveProgress("movie", p.contentId, { percentage: (now / total) * 100, positionSeconds: now, durationSeconds: total, completed: now >= total - 1 })
      .catch(() => undefined);
  };
  // the full player saves every 30 s; so does this one
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => void save(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, len]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.volume = p.volume;
    v.muted = p.muted;
  }, [p.volume, p.muted]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [playing]);

  const expand = async () => {
    await save(); // the full player resumes from the saved position
    closeMini();
    void navigate({ to: "/watch/$slug", params: { slug: p.slug }, search: p.trailer ? { trailer: p.trailer } : {} });
  };
  const close = async () => {
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    await save();
    closeMini();
  };
  const pip = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.current?.requestPictureInPicture();
    } catch {
      toast.error("This browser could not open the picture-in-picture window.");
    }
  };

  // Outside the app: when the viewer switches to another tab or app, the video moves into the browser's floating
  // window so it keeps playing on top. Chrome does this through the media session's "enterpictureinpicture" action;
  // the media keys and the system's media controls show the title and control play/pause.
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
    if (!ms) return;
    ms.metadata = new MediaMetadata({ title: p.title, artist: "StreamVerse" });
    const set = (action: string, fn: (() => void) | null) => {
      try {
        ms.setActionHandler(action as MediaSessionAction, fn);
      } catch {
        /* this browser does not know the action */
      }
    };
    set("play", () => setPlaying(true));
    set("pause", () => setPlaying(false));
    set("enterpictureinpicture", () => void video.current?.requestPictureInPicture().catch(() => undefined));
    // other browsers: try when the page is hidden (allowed only where the browser permits it; otherwise nothing happens)
    const onHide = () => {
      const v = video.current;
      if (document.visibilityState === "hidden" && v && !v.paused && !document.pictureInPictureElement)
        void v.requestPictureInPicture().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      for (const a of ["play", "pause", "enterpictureinpicture"]) set(a, null);
      ms.metadata = null;
    };
  }, [p.title]);

  // "i" again goes back to the full player, as on YouTube; Esc is left to the page (menus, dialogs)
  useKey((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "i") void expand();
  });

  const pct = len ? Math.min(100, (t / len) * 100) : 0;
  return (
    <div
      role="region"
      aria-label={`Mini player: ${p.title}`}
      data-testid="mini-player"
      className="group fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-black shadow-2xl"
    >
      <div className="relative aspect-video">
        <video
          ref={video}
          src={hls ? undefined : p.src}
          playsInline
          autoPlay
          className="size-full bg-black object-contain"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (isFinite(v.duration)) setLen(v.duration);
            if (!hls && p.startAt > 0 && p.startAt < v.duration - 1) v.currentTime = p.startAt;
          }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onDoubleClick={() => void expand()}
        />
        <div className="absolute inset-0 flex items-start justify-between bg-gradient-to-b from-black/70 via-transparent to-black/60 p-1.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <IconBtn label="Open full player (i)" onClick={() => void expand()} className="size-9">
            <Maximize2 />
          </IconBtn>
          <div className="flex gap-1">
            {typeof document !== "undefined" && document.pictureInPictureEnabled && (
              <IconBtn label="Play over other apps" onClick={() => void pip()} className="size-9">
                <PictureInPicture2 />
              </IconBtn>
            )}
            <IconBtn label="Close mini player" onClick={() => void close()} className="size-9">
              <X />
            </IconBtn>
          </div>
          <IconBtn label={playing ? "Pause" : "Play"} onClick={() => setPlaying((x) => !x)} className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 bg-black/50">
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </IconBtn>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button type="button" onClick={() => void expand()} className="block w-full truncate px-3 py-2 text-left text-sm font-semibold hover:bg-foreground/10">
        {p.title}
      </button>
    </div>
  );
}
