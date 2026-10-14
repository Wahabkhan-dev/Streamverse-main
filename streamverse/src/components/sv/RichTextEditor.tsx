import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pilcrow, Quote, Table2, Underline } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sanitizeHtml } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { Btn, inputCls } from "./ui";

const TABLE = "<table><thead><tr><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td>Text</td><td>Text</td></tr></tbody></table><p><br></p>";

/**
 * A small rich text editor (not a plain textarea): headings, paragraphs, bold / italic / underline, lists,
 * links, block quotes and tables. The content is uncontrolled while typing; `resetKey` loads new content
 * (for example when switching documents). Output is sanitized before it is reported.
 */
export function RichTextEditor({ value, resetKey, onChange, label, invalid, describedBy }: { value: string; resetKey: string; onChange: (html: string) => void; label: string; invalid?: boolean; describedBy?: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("https://");

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value;
    // load once per document; typing must not rewrite the editor underneath the caret
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const emit = () => ref.current && onChange(sanitizeHtml(ref.current.innerHTML));
  const run = (cmd: string, arg?: string) => {
    ref.current?.focus();
    if (typeof document.execCommand === "function") document.execCommand(cmd, false, arg);
    emit();
  };
  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
  };
  const applyLink = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    if (sel && range.current) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
    if (/^(https?:\/\/|mailto:|\/)/i.test(url.trim())) run("createLink", url.trim());
    setLinkOpen(false);
  };

  const tools: { label: string; icon: typeof Bold; act: () => void }[] = [
    { label: "Heading", icon: Heading2, act: () => run("formatBlock", "h2") },
    { label: "Subheading", icon: Heading3, act: () => run("formatBlock", "h3") },
    { label: "Paragraph", icon: Pilcrow, act: () => run("formatBlock", "p") },
    { label: "Bold", icon: Bold, act: () => run("bold") },
    { label: "Italic", icon: Italic, act: () => run("italic") },
    { label: "Underline", icon: Underline, act: () => run("underline") },
    { label: "Bulleted list", icon: List, act: () => run("insertUnorderedList") },
    { label: "Numbered list", icon: ListOrdered, act: () => run("insertOrderedList") },
    { label: "Block quote", icon: Quote, act: () => run("formatBlock", "blockquote") },
    { label: "Table", icon: Table2, act: () => run("insertHTML", TABLE) },
  ];

  return (
    <div className={cn("overflow-hidden rounded-md border bg-surface-2", invalid ? "border-primary" : "border-input")}>
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-1 border-b border-border bg-surface p-1.5">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-label={t.label}
            title={t.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.act}
            className="inline-flex size-8 items-center justify-center rounded-md text-soft transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            <t.icon className="size-4" aria-hidden />
          </button>
        ))}
        <button
          type="button"
          aria-label="Link"
          title="Link"
          aria-expanded={linkOpen}
          onMouseDown={(e) => {
            e.preventDefault();
            remember();
          }}
          onClick={() => setLinkOpen((o) => !o)}
          className="inline-flex size-8 items-center justify-center rounded-md text-soft transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <Link2 className="size-4" aria-hidden />
        </button>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface p-2">
          <label className="sr-only" htmlFor="rte-link-url">
            Link address
          </label>
          <input id="rte-link-url" value={url} onChange={(e) => setUrl(e.target.value)} className={cn(inputCls, "h-9 max-w-sm flex-1")} placeholder="https://example.com" />
          <Btn type="button" size="sm" variant="primary" onClick={applyLink}>
            Apply link
          </Btn>
          <Btn type="button" size="sm" onClick={() => setLinkOpen(false)}>
            Cancel
          </Btn>
        </div>
      )}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={emit}
        onBlur={emit}
        className="legal-body min-h-[360px] max-h-[640px] overflow-y-auto px-4 py-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      />
    </div>
  );
}
