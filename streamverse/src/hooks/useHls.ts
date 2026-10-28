import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type Hls from "hls.js";

export const isHlsUrl = (url: string | null | undefined) => !!url && /\.m3u8(\?|$)/i.test(url);

let hlsModule: Promise<typeof import("hls.js")> | undefined;
/** Starts downloading hls.js. A player calls this as it opens, so the library is there by the time the stream URL is. */
export const preloadHls = () => (hlsModule ??= import("hls.js"));

/** One quality the stream really has, e.g. { height: 720, label: "720p" }. */
export interface HlsQuality {
  index: number;
  height: number;
  label: string;
}

const labelOf = (height: number) => (height >= 2160 ? "4K" : `${height}p`);

/**
 * Plays an HLS (.m3u8) URL on a <video> element. hls.js is loaded lazily (only when a stream is actually opened),
 * and Safari's native HLS is used when available. Progressive files (mp4) are left to the element's own `src`.
 * `onFatal` is called once if playback cannot continue so the UI can show an error instead of a dead player.
 * `startAt` (seconds) makes the first pieces fetched the ones at the resume point, instead of loading the start and
 * then jumping.
 *
 * Returns the qualities the stream really has (highest first), the one now playing, and `setQuality` (null = Auto,
 * chosen by the connection). Safari's built-in player picks the quality itself, so there the list stays empty.
 */
export function useHls(
  video: RefObject<HTMLVideoElement | null>,
  url: string | null,
  onFatal: () => void,
  startAt = 0,
) {
  const hlsRef = useRef<Hls | null>(null);
  const [qualities, setQualities] = useState<HlsQuality[]>([]);
  const [playingHeight, setPlayingHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = video.current;
    if (!el || !isHlsUrl(url)) return undefined;
    let cancelled = false;
    let destroy: (() => void) | undefined;

    void preloadHls().then(({ default: HlsCtor }) => {
      if (cancelled) return;
      if (HlsCtor.isSupported()) {
        const hls = new HlsCtor({
          enableWorker: true,
          // start small and step up as the measured speed allows: the first picture shows quickly
          startLevel: 0,
          capLevelToPlayerSize: true,
          startFragPrefetch: true,
          startPosition: startAt > 0 ? startAt : -1,
          maxBufferLength: 30,
          backBufferLength: 30,
        });
        hls.on(HlsCtor.Events.ERROR, (_event, data) => {
          if (data.fatal) onFatal();
        });
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_event, data) => {
          setQualities(
            data.levels
              .map((l, index) => ({ index, height: l.height, label: labelOf(l.height) }))
              .filter((q) => q.height > 0)
              .sort((a, b) => b.height - a.height),
          );
        });
        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_event, data) => setPlayingHeight(hls.levels[data.level]?.height ?? null));
        hls.loadSource(url!);
        hls.attachMedia(el);
        hlsRef.current = hls;
        destroy = () => {
          hlsRef.current = null;
          hls.destroy();
        };
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = url!;
      } else {
        onFatal();
      }
    });

    return () => {
      cancelled = true;
      destroy?.();
      setQualities([]);
      setPlayingHeight(null);
    };
    // the resume point only matters when the stream is first opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, url]);

  const setQuality = useCallback((index: number | null) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (index === null) {
      hls.currentLevel = -1; // Auto: the player follows the connection again
      return;
    }
    // a viewer's choice is not capped to the window size, and switches now (the buffer is replaced)
    hls.autoLevelCapping = -1;
    hls.currentLevel = index;
  }, []);

  return { qualities, playingHeight, setQuality };
}
