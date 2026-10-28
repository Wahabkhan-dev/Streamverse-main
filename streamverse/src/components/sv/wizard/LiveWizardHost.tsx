import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Book, Movie } from "@/lib/data";
import { editDraftId, newDraftId } from "@/lib/drafts";
import { Btn, EmptyState, Skel } from "../ui";
import { AudiobookWizard } from "./AudiobookWizard";
import { EbookWizard } from "./EbookWizard";
import { MovieWizard } from "./MovieWizard";
import { fetchBySlug, loadAudiobook, loadEbook, loadMovie, type Kind } from "./liveLoad";

type Type = "Movie" | "eBook" | "Audiobook";
const KIND: Record<Type, { kind: Kind; list: string; plural: string }> = {
  Movie: { kind: "movies", list: "/admin/movies", plural: "Movies" },
  eBook: { kind: "ebooks", list: "/admin/ebooks", plural: "eBooks" },
  Audiobook: { kind: "audiobooks", list: "/admin/audiobooks", plural: "Audiobooks" },
};

/**
 * Live mode: the original multi-step wizard, backed by the real API. A new title opens an empty wizard; an existing one is
 * read back from the server so every step is pre-filled and every attached file is shown.
 */
export function LiveWizardHost({ type, slug }: { type: Type; slug?: string }) {
  const cfg = KIND[type];
  const navigate = useNavigate();
  const [fresh] = useState(newDraftId);
  const loaded = useQuery({
    queryKey: ["admin", cfg.kind, "wizard", slug],
    enabled: !!slug,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      const row = await fetchBySlug(cfg.kind, slug!);
      if (!row) return null;
      return type === "Movie"
        ? { type, ...(await loadMovie(row)) }
        : type === "eBook"
          ? { type, ...(await loadEbook(row)) }
          : { type, ...(await loadAudiobook(row)) };
    },
  });

  if (slug && loaded.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skel className="h-10 w-72" />
        <Skel className="h-16 w-full" />
        <Skel className="h-96 w-full" />
      </div>
    );
  }
  if (slug && (loaded.isError || !loaded.data)) {
    return (
      <EmptyState
        title={`${type} not found`}
        sub="It may have been deleted."
        action={
          <Btn onClick={() => void navigate({ to: cfg.list as "/admin/movies" })}>
            Back to {cfg.plural}
          </Btn>
        }
      />
    );
  }
  const data = loaded.data;
  const id = slug ? editDraftId(type, slug) : fresh;
  const key = `${id}-${data ? "loaded" : "new"}`;
  if (type === "Movie")
    return (
      <MovieWizard
        key={key}
        draftId={id}
        {...(data && data.type === "Movie"
          ? { existing: data.existing as Movie, snapshot: data.snapshot }
          : {})}
      />
    );
  if (type === "eBook")
    return (
      <EbookWizard
        key={key}
        draftId={id}
        {...(data && data.type === "eBook"
          ? { existing: data.existing as Book, snapshot: data.snapshot }
          : {})}
      />
    );
  return (
    <AudiobookWizard
      key={key}
      draftId={id}
      {...(data && data.type === "Audiobook"
        ? { existing: data.existing as Book, snapshot: data.snapshot }
        : {})}
    />
  );
}
