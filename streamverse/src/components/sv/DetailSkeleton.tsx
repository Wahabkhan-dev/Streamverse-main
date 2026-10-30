import { Skel } from "./ui";

/** What a card already told us about the title (from the homepage or a list), shown while the full page loads. */
export type Peek = { title: string; image?: string | null; description?: string | null };

/**
 * Stand-in for a title page while its data loads: the same hero + rows layout as the real page, so nothing jumps when it
 * arrives. When the title was already seen on a list, its poster, name and blurb are shown straight away.
 */
export function DetailSkeleton({ peek, tall = true }: { peek?: Peek | null; tall?: boolean }) {
  return (
    <div aria-busy="true">
      <section className={`relative overflow-hidden ${tall ? "h-[60vh] min-h-[380px] sm:h-[70vh] sm:min-h-[480px]" : "h-[40vh] min-h-[260px]"}`}>
        {peek?.image ? (
          <>
            <img src={peek.image} alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-hero-x" />
            <div className="absolute inset-0 bg-hero-y" />
          </>
        ) : (
          <Skel className="absolute inset-0 rounded-none" />
        )}
        <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-4 pb-14 md:px-8">
          <div className="w-full max-w-2xl">
            {peek ? (
              <>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl md:text-6xl">{peek.title}</h1>
                {peek.description && <p className="mt-4 line-clamp-3 text-soft">{peek.description}</p>}
              </>
            ) : (
              <>
                <Skel className="h-10 w-3/4 md:h-14" />
                <Skel className="mt-4 h-4 w-full" />
                <Skel className="mt-2 h-4 w-2/3" />
              </>
            )}
            <div className="mt-6 flex gap-3">
              <Skel className="h-12 w-32" />
              <Skel className="h-12 w-12" />
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-[1600px] space-y-3 px-4 py-8 md:px-8">
        <Skel className="h-6 w-48" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skel key={i} className="aspect-video w-60 shrink-0" />
          ))}
        </div>
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
