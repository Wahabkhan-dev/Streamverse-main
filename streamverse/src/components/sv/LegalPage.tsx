import { FileWarning } from "lucide-react";
import { useMemo } from "react";
import { DEMO_MODE } from "@/lib/config";
import { useApiLegalQuery } from "@/hooks/useApiLegal";
import { LEGAL_LINKS, legalLabel, sanitizeHtml, useLegalRecord, withHeadingIds, type LegalKey, type LegalVersion } from "@/lib/legal";
import { LegalLinks } from "./LegalLinks";

/** Highlights `[[placeholder]]` markers so unresolved business decisions stand out. The html is already sanitized. */
const markPlaceholders = (html: string) =>
  html.replace(/\[\[([^\]<]+)\]\]/g, '<mark class="rounded bg-warning/15 px-1 py-0.5 text-foreground ring-1 ring-inset ring-warning/30">[$1]</mark>');

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

/** The reading layout for one legal document version. Used by the customer pages and the admin preview. */
export function LegalDocument({ version, current, preview }: { version: LegalVersion; current?: LegalKey; preview?: boolean }) {
  const { html, toc } = useMemo(() => withHeadingIds(markPlaceholders(version.html)), [version.html]);
  const hasPlaceholders = /\[\[[^\]]+\]\]/.test(version.html);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-4 md:px-8">
      <p className="eyebrow text-primary-text">Legal</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{version.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Effective {fmtDate(version.effectiveDate)} · Last updated {fmtDate(version.lastUpdated)} · Version {version.version}
      </p>
      {hasPlaceholders && (
        <div role="note" className="mt-6 flex max-w-3xl gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <FileWarning className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-foreground/85">
            <strong className="font-semibold">Draft for review.</strong> This page has not been reviewed by a lawyer. Highlighted items in square brackets are decisions the business still needs to make.
          </p>
        </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[230px_minmax(0,1fr)]">
        {toc.length > 0 ? (
          <nav aria-label={`${version.title} contents`} className="lg:sticky lg:top-24 lg:h-fit lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">On this page</p>
            <ol className="space-y-1 text-sm">
              {toc.map((s, i) => (
                <li key={s.id}>
                  <a href={preview ? undefined : `#${s.id}`} className="flex gap-2 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground">
                    <span className="w-5 shrink-0 tabular-nums">{i + 1}.</span>
                    <span>{s.heading}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <div />
        )}
        <article className="max-w-3xl">
          <div className="legal-body" dangerouslySetInnerHTML={{ __html: html }} />
          {!preview && (
            <div className="mt-10 border-t border-border pt-6">
              <LegalLinks lead="Related documents:" />
              {current && <span className="sr-only">You are reading: {legalLabel(current)}</span>}
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

/** Customer page: always the PUBLISHED version, never a draft. */
export function LegalPage({ docKey }: { docKey: LegalKey }) {
  const rec = useLegalRecord(docKey);
  const apiQuery = useApiLegalQuery(docKey);

  if (!DEMO_MODE) {
    if (apiQuery.isLoading) {
      return (
        <div className="mx-auto w-full max-w-[1100px] px-4 py-16 md:px-8">
          <p className="text-muted-foreground animate-pulse">Loading…</p>
        </div>
      );
    }
    if (apiQuery.data) {
      const d = apiQuery.data;
      const version: LegalVersion = {
        title: d.title,
        effectiveDate: d.effectiveDate ? d.effectiveDate.slice(0, 10) : "",
        lastUpdated: d.updatedAt ? d.updatedAt.slice(0, 10) : "",
        version: d.version ?? "1.0",
        seoTitle: `${d.title} — StreamVerse`,
        seoDescription: "",
        html: sanitizeHtml(d.content ?? ""),
      };
      return <LegalDocument version={version} current={docKey} />;
    }
    // API failed — fall back to static content below
  }

  if (!rec.published) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-16 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">{legalLabel(docKey)}</h1>
        <p className="mt-3 text-muted-foreground">This document is not available right now. Please check back soon.</p>
      </div>
    );
  }
  return <LegalDocument version={rec.published} current={docKey} />;
}
