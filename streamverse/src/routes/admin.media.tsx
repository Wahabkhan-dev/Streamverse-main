import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HardDrive } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/sv/ui";
import {
  MediaLibraryPage,
  type MediaSearch,
  type MediaSearchPatch,
} from "@/components/sv/media/MediaLibraryPage";
import { DEMO_MODE } from "@/lib/config";

const CATEGORIES = ["images", "videos", "audio", "documents"] as const;
const ATTACHED = [
  "movies",
  "ebooks",
  "audiobooks",
  "homepage",
  "banners",
  "collections",
  "unattached",
] as const;
const SORTS = ["newest", "oldest", "name", "size", "type"] as const;

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/** Unknown or malformed query values are dropped, never trusted: the URL is user input. */
export const Route = createFileRoute("/admin/media")({
  validateSearch: (s: Record<string, unknown>): MediaSearch => {
    const page = Number(s["page"]);
    const out: MediaSearch = {};
    const q = str(s["q"]);
    const category = oneOf(s["category"], CATEGORIES);
    const role = str(s["role"]);
    const status = str(s["status"]);
    const attached = oneOf(s["attached"], ATTACHED);
    const sort = oneOf(s["sort"], SORTS);
    const view = oneOf(s["view"], ["grid", "list"] as const);
    const asset = str(s["asset"]);
    if (q) out.q = q;
    if (category) out.category = category;
    if (role) out.role = role;
    if (status) out.status = status;
    if (attached) out.attached = attached;
    if (sort && sort !== "newest") out.sort = sort;
    if (Number.isInteger(page) && page > 1) out.page = page;
    if (view === "list") out.view = view;
    if (asset) out.asset = asset;
    return out;
  },
  head: () => ({ meta: [{ title: "Media Library - StreamVerse Admin" }] }),
  component: MediaRoute,
});

function MediaRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/media" });
  if (DEMO_MODE) {
    return (
      <div>
        <PageHeader title="Media Library" />
        <EmptyState
          icon={HardDrive}
          title="The Media Library needs the live backend"
          sub="Files, storage and usage are only real when the app is connected to the API. Set VITE_DEMO_MODE=false to use it."
        />
      </div>
    );
  }
  return (
    <MediaLibraryPage
      search={search}
      setSearch={(patch, opts) =>
        void navigate({
          search: (prev: MediaSearch) => {
            const next: MediaSearchPatch = { ...prev, ...patch };
            // any change to the filters, except paging/view/drawer, goes back to the first page
            if (!opts?.keepPage) delete next.page;
            for (const k of Object.keys(next) as Array<keyof MediaSearch>)
              if (next[k] === undefined) delete next[k];
            return next as MediaSearch;
          },
          replace: true,
        })
      }
    />
  );
}
