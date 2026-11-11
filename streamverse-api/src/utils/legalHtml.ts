import sanitizeHtml from "sanitize-html";

/**
 * Server-side cleaning of admin-written legal-page HTML (the browser cleans it again with DOMPurify before showing it).
 * Keeps exactly the formatting the legal editor can produce — headings, paragraphs, lists, quotes, tables, links, bold/italic —
 * and drops everything else: scripts, event-handler attributes, iframes/forms/embeds, images, `javascript:` links, styles.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "div", "span", "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small", "code", "pre", "blockquote", "ul", "ol", "li", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption"],
  allowedAttributes: { a: ["href", "title", "target", "rel"], th: ["colspan", "rowspan", "scope"], td: ["colspan", "rowspan"], "*": ["id"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  // a link that opens a new tab must not be able to reach back into the page that opened it
  transformTags: { a: (tagName, attribs) => ({ tagName, attribs: attribs["target"] === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs }) },
  disallowedTagsMode: "discard",
};

export const sanitizeLegalHtml = (html: string): string => sanitizeHtml(html, OPTIONS);
