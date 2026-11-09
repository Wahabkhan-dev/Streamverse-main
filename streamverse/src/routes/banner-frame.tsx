import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BannerRender, type BannerPreviewData } from "@/components/sv/BannerPreview";
import type { BannerType } from "@/lib/store";

export const Route = createFileRoute("/banner-frame")({
  head: () => ({ meta: [{ title: "Banner preview — StreamVerse" }, { name: "robots", content: "noindex" }] }),
  component: BannerFrame,
});

/**
 * Only used inside the admin's "Phone" preview: a bare page that draws one banner, so the real phone-size rules apply because
 * this page itself is phone-wide. It draws whatever the admin screen sends it (same site only) and navigates nowhere.
 */
function BannerFrame() {
  const [msg, setMsg] = useState<{ view: BannerType; data: BannerPreviewData } | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as { type?: string; view?: BannerType; data?: BannerPreviewData } | null;
      if (m?.type === "sv-banner-preview" && m.view && m.data) setMsg({ view: m.view, data: m.data });
    };
    window.addEventListener("message", on);
    window.parent.postMessage({ type: "sv-banner-frame-ready" }, window.location.origin);
    return () => window.removeEventListener("message", on);
  }, []);
  return (
    <div
      className="min-h-dvh bg-background"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault();
      }}
    >
      {msg ? <BannerRender view={msg.view} data={msg.data} /> : null}
    </div>
  );
}
