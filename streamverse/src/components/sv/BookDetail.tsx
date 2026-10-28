import { Link } from "@tanstack/react-router";
import { BookMarked, BookOpen, Headphones, Play, Star } from "lucide-react";
import { useState } from "react";
import type { Book } from "@/lib/data";
import { chaptersOf } from "@/lib/book-content";
import { clock } from "@/lib/runtime";
import { useProgressOf } from "@/lib/user";
import { cn } from "@/lib/utils";
import { AudiobookCard, BookCard, BookCover, MediaRow } from "./media";
import { DownloadButton } from "./DownloadButton";
import { LibraryButton, MyListButton } from "./SaveButtons";
import { EmptyState, TabBar, Tag } from "./ui";

const reviews = [
  { n: "Jordan P.", r: 5, t: "Couldn't put it down. The last third is extraordinary." },
  { n: "Amira K.", r: 4, t: "Beautifully written, a little slow in the middle but worth it." },
  { n: "Lucas M.", r: 5, t: "One of the best I've read this year." },
];

const EBOOK_TABS = [
  { id: "about", label: "About" },
  { id: "details", label: "Details" },
  { id: "reviews", label: "Reviews" },
  { id: "related", label: "Related Books" },
] as const;
const AUDIO_TABS = [
  { id: "about", label: "About" },
  { id: "chapters", label: "Chapters" },
  { id: "narrator", label: "Narrator" },
  { id: "reviews", label: "Reviews" },
  { id: "related", label: "Related" },
] as const;

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{children || "-"}</dd>
    </div>
  );
}

export function BookDetail({ b, kind, related }: { b: Book; kind: "ebook" | "audiobook"; related: Book[] }) {
  const isBook = kind === "ebook";
  const tabs = isBook ? EBOOK_TABS : AUDIO_TABS;
  const [tab, setTab] = useState<string>("about");
  const ref = { type: isBook ? ("eBook" as const) : ("Audiobook" as const), slug: b.slug, ...(b.cid ? { id: b.cid } : {}) };
  const progress = useProgressOf(ref);
  const started = !!progress && progress.pct > 0 && !progress.completed;
  const info = b.info ?? {};
  const chapters = chaptersOf(b);
  const languages = info.languages?.length ? info.languages : [info.language ?? "English"];
  const sameNarrator = related.filter((x) => x.narrator && x.narrator === b.narrator);

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-80 opacity-40 blur-3xl" style={{ background: `linear-gradient(180deg, ${b.palette[0]}, transparent)` }} />
      <div className="relative mx-auto max-w-[1400px] px-4 pt-10 md:px-8">
        <div className="grid gap-10 md:grid-cols-[300px_1fr]">
          <BookCover b={b} square={!isBook} className="mx-auto w-44 sm:w-56 md:mx-0 md:w-full" />
          <div className="min-w-0">
            <span className="eyebrow text-primary-text">{isBook ? "eBook" : "Audiobook"}</span>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">{b.title}</h1>
            {info.subtitle && <p className="mt-1 text-lg text-soft">{info.subtitle}</p>}
            <p className="mt-2 text-soft">
              by <span className="font-semibold text-foreground">{b.author}</span>
              {!isBook && b.narrator && (
                <>
                  {" "}· narrated by <span className="font-semibold text-foreground">{b.narrator}</span>
                </>
              )}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {b.rating > 0 ? (
                <>
                  <span className="flex text-warning" aria-hidden>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={cn("size-4", i < Math.round(b.rating) && "fill-current")} />
                    ))}
                  </span>
                  <span className="font-semibold">{b.rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">({b.reviews.toLocaleString()} reviews)</span>
                </>
              ) : (
                <span className="text-muted-foreground">No ratings yet</span>
              )}
            </div>
            <dl className="mt-5 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {(isBook
                ? ([
                    ["Author", b.author],
                    ["Publisher", info.publisher || "Not specified"],
                    ["Genre", b.genre],
                    ["Pages", b.pages > 0 ? String(b.pages) : "Not specified"],
                    ["Language", info.language ?? "English"],
                    ["Published", b.meta?.["Publication Date"] ?? (b.year > 0 ? String(b.year) : "Not specified")],
                    ["ISBN", b.isbn || "-"],
                    ["Series", b.series ?? "Standalone"],
                    ["Edition", info.edition || "Not specified"],
                    ["Age rating", info.readingAge || "Not specified"],
                    ["Languages", languages.join(", ")],
                  ] as const)
                : ([
                    ["Author", b.author],
                    ["Narrator", b.narrator ?? "-"],
                    ["Publisher", info.publisher || "Not specified"],
                    ["Duration", b.duration ?? "Duration unavailable"],
                    ["Language", info.language ?? "English"],
                    ["Genre", b.genre],
                  ] as const)
              ).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              {isBook ? (
                <Link to="/read/$slug" params={{ slug: b.slug }} className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-sm font-bold tracking-wide text-primary-foreground uppercase shadow-red transition-colors hover:bg-primary-hover [&_svg]:size-4">
                  <BookOpen /> {started ? "Continue Reading" : "Read Now"}
                </Link>
              ) : (
                <Link to="/listen/$slug" params={{ slug: b.slug }} className="inline-flex h-12 items-center gap-2 rounded-md bg-primary px-6 text-sm font-bold tracking-wide text-primary-foreground uppercase shadow-red transition-colors hover:bg-primary-hover [&_svg]:size-4">
                  <Play className="fill-current" /> {started ? "Resume" : "Play"}
                </Link>
              )}
              {isBook && b.flipbook && (
                <Link to="/flipbook/$slug" params={{ slug: b.slug }} data-testid="flipbook-button" className="inline-flex h-12 items-center gap-2 rounded-md border border-border bg-surface-2 px-6 text-sm font-bold tracking-wide uppercase transition-colors hover:bg-surface-3 [&_svg]:size-4">
                  <BookMarked /> Flipbook
                </Link>
              )}
              <LibraryButton item={ref} />
              <MyListButton item={ref} />
              <DownloadButton item={{ type: isBook ? "eBook" : "Audiobook", slug: b.slug, ...(ref.id ? { id: ref.id } : {}) }} />
            </div>
            {started && (
              <div className="mt-4 flex max-w-xs items-center gap-3 text-xs text-soft">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
                </div>
                {Math.round(progress.pct)}% {isBook ? "read" : "listened"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-12">
          <TabBar tabs={tabs.map((t) => ({ ...t }))} value={tab} onChange={setTab} label="Details" />
        </div>
        <div className="py-8">
          {tab === "about" && (
            <div className="max-w-3xl">
              <p className="text-soft">{b.description}</p>
              {(info.tags?.length ?? 0) > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {info.tags!.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "details" && (
            <dl className="max-w-2xl divide-y divide-border rounded-xl border border-border bg-surface px-5">
              <Fact k="Title">{b.title}</Fact>
              <Fact k="Subtitle">{info.subtitle}</Fact>
              <Fact k="Author">{b.author}</Fact>
              <Fact k="Publisher">{info.publisher || "Not specified"}</Fact>
              <Fact k="ISBN">{b.isbn}</Fact>
              <Fact k="Edition">{info.edition || "Not specified"}</Fact>
              <Fact k="Series">{b.series ?? "Standalone"}</Fact>
              <Fact k="Pages">{b.pages > 0 ? b.pages : "Not specified"}</Fact>
              <Fact k="Genre">{b.genre}</Fact>
              <Fact k="Language">{info.language ?? "English"}</Fact>
              <Fact k="Available in">{languages.join(", ")}</Fact>
              <Fact k="Age rating">{info.readingAge || "Not specified"}</Fact>
              <Fact k="Formats">EPUB{b.meta?.["Language"] ? "" : " · PDF"}</Fact>
            </dl>
          )}
          {tab === "chapters" && (
            <ol className="max-w-3xl divide-y divide-border rounded-xl border border-border bg-surface">
              {chapters.map((c, i) => (
                <li key={c.title}>
                  <Link to="/listen/$slug" params={{ slug: b.slug }} search={{ chapter: i }} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                    <span className="flex min-w-0 items-center gap-3">
                      <Play className="size-3.5 shrink-0 fill-current text-primary-text" />
                      <span className="truncate">{c.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.known === false ? "Duration unavailable" : clock(c.seconds)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {tab === "narrator" && (
            <div className="grid max-w-4xl gap-8 md:grid-cols-[auto_1fr]">
              <div className="grid size-28 place-items-center rounded-full bg-red-grad text-3xl font-bold">
                {(b.narrator ?? b.author)
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Headphones className="size-5 text-primary-text" /> {b.narrator ?? b.author}
                </h2>
                <p className="mt-2 text-soft">{info.narratorBio || `${b.narrator ?? b.author} is a StreamVerse narrator known for warm, unhurried performances across fiction and non-fiction.`}</p>
                {sameNarrator.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Also narrated: {sameNarrator.map((x) => x.title).join(", ")}</p>}
              </div>
            </div>
          )}
          {tab === "reviews" && (
            <div className="grid gap-4 md:grid-cols-3">
              {reviews.map((r) => (
                <div key={r.n} className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex text-warning" aria-label={`${r.r} out of 5 stars`}>
                    {Array.from({ length: r.r }, (_, i) => (
                      <Star key={i} className="size-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-soft">"{r.t}"</p>
                  <div className="mt-3 text-xs font-semibold">{r.n}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "related" &&
            (related.length === 0 ? (
              <EmptyState icon={isBook ? BookOpen : Headphones} title="Nothing related yet" sub="More titles like this will appear as the catalog grows." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {related.map((x) => (isBook ? <BookCard key={x.slug} b={x} fixed={false} /> : <AudiobookCard key={x.slug} b={x} fixed={false} />))}
              </div>
            ))}
        </div>
      </div>
      <MediaRow title="You May Also Like" seeAll={isBook ? "/ebooks" : "/audiobooks"} empty={related.length === 0} variant={isBook ? "book" : "square"}>
        {related.map((x) => (isBook ? <BookCard key={x.slug} b={x} /> : <AudiobookCard key={x.slug} b={x} />))}
      </MediaRow>
    </div>
  );
}
