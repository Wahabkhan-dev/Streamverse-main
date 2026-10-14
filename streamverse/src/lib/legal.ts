import { createPersistedStore } from "./persisted";
import { privacyPolicy, refundPolicy, termsAndConditions, type LegalBlock, type LegalDoc } from "./legal-content";

/**
 * Legal documents managed by the admin (Legal & Policies) and shown to customers.
 * Each document keeps a PUBLISHED version (what customers read) and an optional DRAFT (what the admin is
 * editing). Saving a draft never touches the customer page; only Publish copies the draft over the
 * published version. Frontend phase: kept in this browser.
 */
export type LegalKey = "privacy-policy" | "terms-and-conditions" | "refund-policy";
export type LegalStatus = "Draft" | "Published";

export interface LegalVersion {
  title: string;
  effectiveDate: string;
  lastUpdated: string;
  version: string;
  seoTitle: string;
  seoDescription: string;
  /** sanitized HTML: headings, paragraphs, lists, links, quotes, tables */
  html: string;
}
export interface LegalRecord {
  key: LegalKey;
  slug: LegalKey;
  published: LegalVersion | null;
  draft: LegalVersion | null;
}
export type LegalState = Record<LegalKey, LegalRecord>;

export const LEGAL_KEYS: LegalKey[] = ["privacy-policy", "terms-and-conditions", "refund-policy"];
export const LEGAL_TABS: { key: LegalKey; tab: string; label: string }[] = [
  { key: "privacy-policy", tab: "PRIVACY POLICY", label: "Privacy Policy" },
  { key: "terms-and-conditions", tab: "TERMS & CONDITIONS", label: "Terms & Conditions" },
  { key: "refund-policy", tab: "REFUND POLICY", label: "Refund Policy" },
];
/** Canonical customer routes. */
export const LEGAL_LINKS = [
  { to: "/terms-and-conditions", label: "Terms & Conditions" },
  { to: "/refund-policy", label: "Refund Policy" },
  { to: "/privacy-policy", label: "Privacy Policy" },
] as const;
export const legalLabel = (k: LegalKey) => LEGAL_TABS.find((t) => t.key === k)!.label;

/* ------------------------------------------------------------ html helpers */
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const blockHtml = (b: LegalBlock) => (typeof b === "string" ? `<p>${escapeHtml(b)}</p>` : `<ul>${b.list.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`);
export const docToHtml = (d: LegalDoc) => d.sections.map((s) => `<h2>${escapeHtml(s.heading)}</h2>${s.blocks.map(blockHtml).join("")}`).join("");

const ALLOWED = new Set(["H2", "H3", "P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "IMG", "LINK", "META"]);

/** Keeps a small set of formatting tags and safe links. Needs a DOM, so it only runs in the browser. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const clean = (node: Node): void => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) {
        child.remove();
        continue;
      }
      const el = child as Element;
      if (DROP.has(el.tagName.toUpperCase())) {
        el.remove();
        continue;
      }
      clean(el);
      if (!ALLOWED.has(el.tagName)) {
        el.replaceWith(...el.childNodes);
        continue;
      }
      for (const a of [...el.attributes]) {
        const keep = el.tagName === "A" && (a.name === "href" || a.name === "target" || a.name === "rel");
        if (!keep) el.removeAttribute(a.name);
      }
      if (el.tagName === "A") {
        const href = el.getAttribute("href") ?? "";
        if (!/^(https?:|mailto:|\/|#)/i.test(href)) el.removeAttribute("href");
        if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer");
        else el.removeAttribute("target");
      }
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

export const slugifyHeading = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

/** Adds ids to <h2> headings and returns the contents list, so the customer page can link to sections. */
export function withHeadingIds(html: string): { html: string; toc: { id: string; heading: string }[] } {
  const toc: { id: string; heading: string }[] = [];
  const out = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner: string) => {
    const heading = inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
    let id = slugifyHeading(heading);
    while (toc.some((t) => t.id === id)) id += "-2";
    toc.push({ id, heading });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

/** Plain text of a document, for checks and previews. */
export const htmlText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------ state */
const SEED_DATE = "2026-10-01";
const seedVersion = (doc: LegalDoc, seoDescription: string): LegalVersion => ({
  title: doc.title,
  effectiveDate: SEED_DATE,
  lastUpdated: SEED_DATE,
  version: "1.0",
  seoTitle: `${doc.title} — StreamVerse`,
  seoDescription,
  html: docToHtml(doc),
});
const seed: LegalState = {
  "privacy-policy": { key: "privacy-policy", slug: "privacy-policy", published: seedVersion(privacyPolicy, "What StreamVerse collects, how it is used, and the choices you have."), draft: null },
  "terms-and-conditions": { key: "terms-and-conditions", slug: "terms-and-conditions", published: seedVersion(termsAndConditions, "The rules for using StreamVerse, your account and your subscription."), draft: null },
  "refund-policy": { key: "refund-policy", slug: "refund-policy", published: seedVersion(refundPolicy, "When subscription charges can be refunded and how to ask."), draft: null },
};

const reviveVersion = (v: unknown): LegalVersion | null => {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r["html"] !== "string") return null;
  const str = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  return { title: str("title"), effectiveDate: str("effectiveDate"), lastUpdated: str("lastUpdated"), version: str("version") || "1.0", seoTitle: str("seoTitle"), seoDescription: str("seoDescription"), html: sanitizeHtml(r["html"] as string) };
};

const store = createPersistedStore<LegalState>(
  "sv-legal-v1",
  seed,
  (saved, base) => {
    const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, Partial<LegalRecord> | undefined>;
    const out = { ...base };
    for (const k of LEGAL_KEYS) {
      const hit = s[k];
      out[k] = { key: k, slug: k, published: reviveVersion(hit?.published) ?? base[k].published, draft: reviveVersion(hit?.draft) };
    }
    return out;
  },
);

export const hydrateLegal = store.hydrate;
export const resetLegal = store.reset;
export const getLegal = store.get;
export const useLegal = () => store.use((s) => s);
export const useLegalRecord = (k: LegalKey) => store.use((s) => s[k]);

export const todayDate = () => new Date().toISOString().slice(0, 10);

/** The version an editor starts from: the current draft, otherwise a copy of what is published. */
export const editingVersion = (r: LegalRecord): LegalVersion => r.draft ?? r.published ?? { title: legalLabel(r.key), effectiveDate: todayDate(), lastUpdated: todayDate(), version: "1.0", seoTitle: "", seoDescription: "", html: "<p></p>" };

export interface LegalProblem {
  field: "title" | "html" | "version" | "effectiveDate";
  message: string;
}
export function validateLegal(v: LegalVersion): LegalProblem[] {
  const p: LegalProblem[] = [];
  if (!v.title.trim()) p.push({ field: "title", message: "Enter a title." });
  if (!/^\d+(\.\d+){0,2}$/.test(v.version.trim())) p.push({ field: "version", message: "Use a version like 1.2." });
  if (!v.effectiveDate) p.push({ field: "effectiveDate", message: "Choose an effective date." });
  if (!htmlText(v.html)) p.push({ field: "html", message: "The document cannot be empty." });
  return p;
}

/** Saves the working copy. Customers keep seeing the published version. */
export function saveLegalDraft(key: LegalKey, v: LegalVersion) {
  store.set((s) => ({ ...s, [key]: { ...s[key], draft: { ...v, html: sanitizeHtml(v.html), lastUpdated: todayDate() } } }));
}

/** Makes the working copy the live version and clears the draft. */
export function publishLegal(key: LegalKey, v: LegalVersion): LegalProblem[] {
  const problems = validateLegal(v);
  if (problems.length) return problems;
  store.set((s) => ({ ...s, [key]: { ...s[key], published: { ...v, html: sanitizeHtml(v.html), lastUpdated: todayDate() }, draft: null } }));
  return [];
}

/** Drops the draft and goes back to the published text. */
export function discardLegalDraft(key: LegalKey) {
  store.set((s) => ({ ...s, [key]: { ...s[key], draft: null } }));
}
