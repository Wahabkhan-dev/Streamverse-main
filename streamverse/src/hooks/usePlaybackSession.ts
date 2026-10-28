import { useEffect } from "react";
import { getAccessToken } from "@/api/client";
import { meApi } from "@/api/me.api";
import { API_BASE } from "@/lib/config";

/** How often a playing session says "still here". Must stay well under the server's stale-session timeout (120 s). */
const HEARTBEAT_MS = 30_000;

/**
 * Keeps a server-side playback session honest, which is what makes stream limits meaningful:
 *  - while `playing`, sends a heartbeat every 30 s so a long film keeps its slot instead of expiring after 2 minutes;
 *  - when the player closes (unmount, or the tab/page goes away), ends the session so the slot is freed at once
 *    instead of blocking the user's next title until the timeout.
 * `sessionId` is the id returned by the playback authorization; it is null in demo mode or when tracking failed.
 * `handedOff` is set when the player passes the stream on (to the mini player), which keeps the slot and ends it later.
 */
export function usePlaybackSession(sessionId: string | null, playing: boolean, handedOff?: { current: boolean }) {
  useEffect(() => {
    if (!sessionId || !playing) return undefined;
    const beat = () => void meApi.heartbeatSession(sessionId).catch(() => undefined);
    beat();
    const id = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [sessionId, playing]);

  useEffect(() => {
    if (!sessionId) return undefined;
    // keepalive lets the request finish even while the page is being torn down (a normal fetch is cancelled)
    const end = () => {
      const token = getAccessToken();
      void fetch(`${API_BASE}/me/playback-sessions/${sessionId}/end`, {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: "{}",
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      if (!handedOff?.current) end();
    };
  }, [sessionId]);
}
