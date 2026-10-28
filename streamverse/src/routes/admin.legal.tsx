import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, FileCheck2, Save, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LegalDocument } from "@/components/sv/LegalPage";
import { RichTextEditor } from "@/components/sv/RichTextEditor";
import { Btn, Field, PageHeader, Panel, Skel, StatusBadge, TabBar, TextArea, TextInput } from "@/components/sv/ui";
import { LEGAL_TABS, discardLegalDraft, editingVersion, htmlText, legalLabel, publishLegal, saveLegalDraft, useLegalRecord, validateLegal, type LegalKey, type LegalProblem, type LegalVersion } from "@/lib/legal";
import { DEMO_MODE } from "@/lib/config";
import { useAdminLegalQuery } from "@/hooks/useAdminApi";

export const Route = createFileRoute("/admin/legal")({ component: LegalAdminPage });

function LegalAdminPage() {
  const [key, setKey] = useState<LegalKey>("privacy-policy");
  return (
    <div>
      <PageHeader title="Legal & Policies" sub="Edit the Privacy Policy, Terms & Conditions and Refund Policy. Customers only see a document after you publish it." />
      <TabBar tabs={LEGAL_TABS.map((t) => ({ id: t.key, label: t.tab }))} value={key} onChange={setKey} label="Legal documents" />
      {/* keyed so each document starts from its own saved draft or published text */}
      <DocEditor key={key} docKey={key} />
    </div>
  );
}

function DocEditor({ docKey }: { docKey: LegalKey }) {
  const rec = useLegalRecord(docKey);
  const apiQuery = useAdminLegalQuery();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;

  // In !DEMO_MODE, pre-fill work from the API data when available
  const apiDoc = !DEMO_MODE ? (apiQuery.data?.data ?? []).find((d) => {
    const map: Record<LegalKey, string> = { "privacy-policy": "privacy", "terms-and-conditions": "terms", "refund-policy": "refund" };
    return d.type === map[docKey];
  }) : undefined;

  const [work, setWork] = useState<LegalVersion>(() => {
    if (!DEMO_MODE && apiDoc) {
      return { title: apiDoc.title, html: apiDoc.content, effectiveDate: apiDoc.effectiveDate, version: apiDoc.version, lastUpdated: apiDoc.updatedAt.slice(0, 10), seoTitle: "", seoDescription: "" };
    }
    return editingVersion(rec);
  });

  const [problems, setProblems] = useState<LegalProblem[]>([]);
  const [preview, setPreview] = useState(false);

  if (isLoading) return <div className="mt-6 space-y-4"><Skel className="h-8 w-64" /><Skel className="h-96 w-full" /></div>;
  const err = (f: LegalProblem["field"]) => problems.find((p) => p.field === f)?.message;
  const set = <K extends keyof LegalVersion>(k: K, v: LegalVersion[K]) => {
    setWork((w) => ({ ...w, [k]: v }));
    setProblems((p) => p.filter((x) => x.field !== k));
  };

  const status = rec.draft ? "Draft" : "Published";
  const published = rec.published;
  const differs = !!rec.draft && (!published || rec.draft.html !== published.html || rec.draft.version !== published.version || rec.draft.title !== published.title);

  function saveDraft() {
    saveLegalDraft(docKey, work);
    toast.success("Draft saved", { description: "Customers still see the published version." });
  }
  function publish() {
    const bad = publishLegal(docKey, work);
    setProblems(bad);
    if (bad.length) {
      toast.error("Fix the highlighted fields before publishing.");
      return;
    }
    toast.success(`${legalLabel(docKey)} published`, { description: `Version ${work.version} is live for customers.` });
  }
  function discard() {
    discardLegalDraft(docKey);
    setWork(editingVersion({ ...rec, draft: null }));
    setProblems([]);
    toast.success("Draft discarded");
  }
  function togglePreview() {
    if (!preview) setProblems(validateLegal(work).filter((p) => p.field === "html"));
    setPreview((p) => !p);
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status} />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {published ? `Published: version ${published.version}, updated ${published.lastUpdated}.` : "Not published yet. Customers see a “not available” message."}
          {differs && " You have unpublished changes in a draft."}
        </p>
        <Link to={`/${docKey}` as "/privacy-policy"} target="_blank" className="ml-auto text-sm text-primary-text underline underline-offset-2">
          View customer page
        </Link>
      </div>

      <Panel className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title" required>
            <TextInput value={work.title} onChange={(e) => set("title", e.target.value)} aria-invalid={!!err("title")} />
            {err("title") && (
              <span role="alert" className="mt-1 block text-[11px] font-medium text-primary-text">
                {err("title")}
              </span>
            )}
          </Field>
          <Field label="Slug" hint="Fixed so customer links never break.">
            <TextInput value={docKey} readOnly aria-readonly="true" className="text-muted-foreground" />
          </Field>
          <Field label="Effective date" required>
            <TextInput type="date" value={work.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} aria-invalid={!!err("effectiveDate")} />
            {err("effectiveDate") && (
              <span role="alert" className="mt-1 block text-[11px] font-medium text-primary-text">
                {err("effectiveDate")}
              </span>
            )}
          </Field>
          <Field label="Version" required hint="For example 1.2">
            <TextInput value={work.version} onChange={(e) => set("version", e.target.value)} aria-invalid={!!err("version")} />
            {err("version") && (
              <span role="alert" className="mt-1 block text-[11px] font-medium text-primary-text">
                {err("version")}
              </span>
            )}
          </Field>
          <Field label="Last updated" hint="Set automatically when you save or publish.">
            <TextInput value={work.lastUpdated} readOnly aria-readonly="true" className="text-muted-foreground" />
          </Field>
          <Field label="Status">
            <TextInput value={status} readOnly aria-readonly="true" className="text-muted-foreground" />
          </Field>
          <Field label="SEO title" className="md:col-span-2">
            <TextInput value={work.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder={`${work.title} — StreamVerse`} />
          </Field>
          <Field label="SEO description" className="md:col-span-2">
            <TextArea rows={2} value={work.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{preview ? "Preview — as customers will see it" : "Document"}</h2>
          <span className="text-xs text-muted-foreground">{htmlText(work.html).split(" ").filter(Boolean).length} words</span>
        </div>
        {preview ? (
          <div className="rounded-md border border-border bg-background">
            <LegalDocument version={work} preview />
          </div>
        ) : (
          <>
            <RichTextEditor label={`${legalLabel(docKey)} text`} value={work.html} resetKey={docKey} onChange={(h) => set("html", h)} invalid={!!err("html")} describedBy={err("html") ? "legal-html-err" : undefined} />
            {err("html") && (
              <p id="legal-html-err" role="alert" className="mt-1 text-[11px] font-medium text-primary-text">
                {err("html")}
              </p>
            )}
          </>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={saveDraft}>
          <Save className="size-4" aria-hidden /> SAVE DRAFT
        </Btn>
        <Btn onClick={togglePreview} aria-pressed={preview}>
          {preview ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {preview ? "BACK TO EDITOR" : "PREVIEW"}
        </Btn>
        {rec.draft && (
          <Btn onClick={discard}>
            <Undo2 className="size-4" aria-hidden /> Discard draft
          </Btn>
        )}
        <Btn variant="primary" className="ml-auto" onClick={publish}>
          <FileCheck2 className="size-4" aria-hidden /> PUBLISH
        </Btn>
      </div>
    </div>
  );
}
