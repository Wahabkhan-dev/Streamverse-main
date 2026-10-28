import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Cloud, ImagePlus, Loader2, RotateCcw, Upload, X, AlertCircle, Inbox, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ---------- Buttons ---------- */
export const btn = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-red",
        light: "bg-foreground text-ink hover:bg-soft",
        glass: "bg-foreground/15 text-foreground backdrop-blur hover:bg-foreground/25 border border-border",
        outline: "border border-border bg-surface-2 text-foreground hover:bg-surface-3 hover:border-foreground/25",
        ghost: "text-soft hover:text-foreground hover:bg-surface-3",
        danger: "bg-primary-deep/40 text-primary-text border border-primary/40 hover:bg-primary-deep/60",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-10 px-4 text-sm rounded-md",
        lg: "h-12 px-6 text-sm rounded-md tracking-wide uppercase",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btn>;
export const Btn = forwardRef<HTMLButtonElement, BtnProps>(({ className, variant, size, ...p }, ref) => (
  <button ref={ref} className={cn(btn({ variant, size }), className)} {...p} />
));
Btn.displayName = "Btn";

/* ---------- Badges ---------- */
const statusTone: Record<string, string> = {
  Published: "text-success bg-success/10 border-success/30",
  Active: "text-success bg-success/10 border-success/30",
  Succeeded: "text-success bg-success/10 border-success/30",
  Operational: "text-success bg-success/10 border-success/30",
  Draft: "text-muted-foreground bg-surface-3 border-border",
  Inactive: "text-muted-foreground bg-surface-3 border-border",
  Free: "text-muted-foreground bg-surface-3 border-border",
  Unpublished: "text-muted-foreground bg-surface-3 border-border",
  Scheduled: "text-info bg-info/10 border-info/30",
  Processing: "text-warning bg-warning/10 border-warning/30",
  Pending: "text-warning bg-warning/10 border-warning/30",
  Degraded: "text-warning bg-warning/10 border-warning/30",
  Archived: "text-warning bg-warning/10 border-warning/30",
  Suspended: "text-primary-text bg-primary/10 border-primary/30",
  Failed: "text-primary-text bg-primary/10 border-primary/30",
  Refunded: "text-info bg-info/10 border-info/30",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold", statusTone[status] ?? statusTone["Draft"])}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "red" | "outline" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase",
        tone === "red" && "bg-primary text-primary-foreground",
        tone === "muted" && "bg-foreground/10 text-soft",
        tone === "outline" && "border border-foreground/40 text-soft",
      )}
    >
      {children}
    </span>
  );
}
export function PlanBadge({ plan }: { plan: string }) {
  return plan === "Premium" || plan === "Premium Annual" ? (
    <span className="rounded bg-red-grad px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-primary-foreground uppercase">{plan}</span>
  ) : (
    <span className="rounded border border-border bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-soft uppercase">{plan}</span>
  );
}

/* ---------- Layout bits ---------- */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("min-w-0 rounded-xl border border-border bg-surface", className)}>{children}</div>;
}
export function PanelHeader({ title, action, sub }: { title: string; action?: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-sm font-bold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
export function PageHeader({ title, sub, actions, eyebrow }: { title: string; sub?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow mb-1.5 text-[10px] text-primary-text">{eyebrow ?? "StreamVerse / Admin"}</div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ icon: Icon, label, value, trend }: { icon: React.ElementType; label: string; value: string; trend?: number }) {
  const up = (trend ?? 0) >= 0;
  return (
    <Panel className="p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-md bg-primary/12 text-primary-text">
          <Icon className="size-4" />
        </span>
        {trend !== undefined && (
          <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", up ? "text-success" : "text-primary-text")}>
            {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {up ? "+" : ""}
            {trend}%<span className="hidden font-normal text-muted-foreground sm:inline"> vs last month</span>
          </span>
        )}
      </div>
      <div className="mt-4 text-2xl font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </Panel>
  );
}

export function EmptyState({ title, sub, action, icon: Icon = Inbox }: { title: string; sub?: string | undefined; action?: ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <h2 className="mt-3 font-semibold">{title}</h2>
      {sub && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Skel({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

/* ---------- Filter pills ---------- */
export function FilterPills({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {items.map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className={cn(
            "h-8 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors",
            value === g ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2 text-soft hover:border-foreground/30 hover:text-foreground",
          )}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

/* ---------- Form fields ---------- */
export const inputCls =
  "h-10 w-full rounded-md border border-input bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
export function Field({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-soft">
        {label} {required && <span className="text-primary-text">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
export function TextInput(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(inputCls, p.className)} />;
}
export function TextArea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...p} className={cn(inputCls, "h-auto py-2", p.className)} />;
}
export function SelectInput({ options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[] }) {
  return (
    <select {...p} className={cn(inputCls, "appearance-none", p.className)}>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
/** `name` is the accessible name when there is no visible text next to the switch. */
export function Toggle({ checked, onChange, label, name }: { checked: boolean; onChange: (v: boolean) => void; label?: string; name?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} {...(!label && name ? { "aria-label": name } : {})} onClick={() => onChange(!checked)} className="inline-flex items-center gap-3 text-sm text-soft">
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-primary" : "bg-surface-3 border border-border")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-foreground transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {label}
    </button>
  );
}
/* ---------- Autosave ---------- */
export type SaveState = "saved" | "saving" | "dirty";
/* ---------- Confirm dialog ---------- */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Runs after the dialog closes; call `preventDefault()` to send focus somewhere other than the opener. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border bg-surface-2" {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={btn({ variant: "outline" })}>Cancel</AlertDialogCancel>
          <AlertDialogAction className={btn({ variant: "primary" })} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------- Upload card ---------- */
type UpState = "idle" | "uploading" | "done" | "error";
/* ---------- Page tabs ---------- */
/**
 * Keyboard behaviour for a row of tabs: arrow keys, Home and End move between them, and only the
 * selected tab is a Tab stop. Spread the result onto each tab button.
 */
export function useRovingTabs(count: number) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (i: number, selected: boolean, select: (i: number) => void) => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[i] = el;
    },
    tabIndex: selected ? 0 : -1,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const last = count - 1;
      const to = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
      if (to < 0) return;
      e.preventDefault();
      select(to);
      refs.current[to]?.focus();
    },
  });
}

export function TabBar<T extends string>({ tabs, value, onChange, label = "Sections", className }: { tabs: { id: T; label: string; count?: number | undefined }[]; value: T; onChange: (v: T) => void; label?: string; className?: string }) {
  const tabProps = useRovingTabs(tabs.length);
  return (
    <div role="tablist" aria-label={label} className={cn("no-scrollbar flex gap-5 overflow-x-auto border-b border-border", className)}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          {...tabProps(i, value === t.id, (to) => onChange(tabs[to]!.id))}
          onClick={() => onChange(t.id)}
          className={cn("relative shrink-0 py-3 text-sm font-bold tracking-wider uppercase", value === t.id ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary" : "text-muted-foreground hover:text-foreground")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
