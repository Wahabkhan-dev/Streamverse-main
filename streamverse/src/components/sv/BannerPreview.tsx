import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BANNER_TYPES, type Banner, type BannerType } from "@/lib/store";
import { cn } from "@/lib/utils";
import { LatestReleaseBanner, NormalBanner, PromotionalBanner } from "./Banners";
import { HeroBanner } from "./media";

const WHERE: Record<BannerType, string> = {
  "Hero Banner": "A full-width feature at the top of a page. On phones it uses the mobile picture.",
  "Normal Banner": "A wide card between the rows of the homepage.",
  "Latest Release Banner": "A spotlight card for something new, shown between homepage rows.",
  "Promotional Banner": "A slim campaign strip with a short message and a button.",
};

/** What the admin has so far: the same fields the banner form holds. Pictures are final URLs (the live form resolves its library picks first). */
export interface BannerPreviewData {
  type: BannerType;
  title: string;
  description: string;
  buttonText: string;
  /** whether the button leads anywhere (the preview never navigates) */
  hasLink: boolean;
  image: string;
  mobileImage: string;
}

/**
 * How a banner looks to customers. It draws the real customer-site banner components with the admin's own text and pictures,
 * so what is seen here is what is shown on the site. The type switch shows the same banner in each of the four designs.
 */
export function BannerPreviewDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (open: boolean) => void; data: BannerPreviewData | null }) {
  const [view, setView] = useState<BannerType>("Hero Banner");
  useEffect(() => {
    if (open && data) setView(data.type);
    // only when it opens: the viewer's own pick must survive edits to the text behind it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!data) return null;

  const title = data.title.trim() || "Your banner title";
  const description = data.description.trim() || "A short line that tells people why to click.";
  const button = data.buttonText.trim();
  const showButton = data.hasLink && !!button;
  const banner: Banner = {
    id: "preview",
    type: view,
    title,
    description,
    buttonText: button,
    // a link kind that always resolves, so the real component draws its button; clicks are blocked below
    linkKind: showButton ? "subscription" : "none",
    linkSlug: "",
    image: data.image,
    mobileImage: data.mobileImage || data.image,
    priority: 1,
    start: "",
    end: "",
    active: true,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface-2 sm:max-w-5xl" data-testid="banner-preview">
        <DialogHeader>
          <div className="eyebrow text-[10px] text-primary-text">Preview</div>
          <DialogTitle>How this banner looks</DialogTitle>
          <DialogDescription>{WHERE[view]}</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Banner design" className="flex flex-wrap gap-2">
          {BANNER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={view === t}
              onClick={() => setView(t)}
              className={cn("rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors", view === t ? "border-primary bg-primary/15 text-primary-text" : "border-border bg-surface text-soft hover:bg-surface-3")}
            >
              {t.replace(" Banner", "")}
              {t === data.type && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(selected)</span>}
            </button>
          ))}
        </div>

        {/* the preview is only a picture of the banner: nothing in it navigates */}
        <div
          data-testid="banner-stage"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest("a")) e.preventDefault();
          }}
          className="overflow-hidden rounded-xl border border-border bg-background py-4 [&_section]:h-[340px]! [&_section]:min-h-0!"
        >
          {!data.image ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">Choose a desktop picture to see the banner.</p>
          ) : view === "Hero Banner" ? (
            <HeroBanner autoplay={false} slides={[{ key: "preview", image: data.image, mobileImage: banner.mobileImage, title, description, buttonText: button || "Learn more", ...(showButton ? { target: { to: "/subscription" } } : {}) }]} />
          ) : view === "Promotional Banner" ? (
            <PromotionalBanner banner={banner} />
          ) : view === "Latest Release Banner" ? (
            <LatestReleaseBanner banner={banner} />
          ) : (
            <NormalBanner banner={banner} />
          )}
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-soft">On phones</div>
            <div className="relative aspect-[3/4] w-28 overflow-hidden rounded-lg border border-border bg-surface">
              {banner.mobileImage ? <img src={banner.mobileImage} alt="Phone picture" className="absolute inset-0 size-full object-cover" /> : <div className="grid size-full place-items-center px-2 text-center text-[10px] text-muted-foreground">No mobile picture</div>}
            </div>
          </div>
          <p className="min-w-0 flex-1 basis-60 text-xs text-muted-foreground">
            The preview uses your text and pictures as they are now, before you save. {showButton ? `The “${button}” button opens the page you picked.` : "There is no button, because the banner has no link or button text."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
