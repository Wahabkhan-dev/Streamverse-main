import { Link } from "@tanstack/react-router";
import { AlertTriangle, Ban, CalendarClock, CloudOff, CreditCard, FileWarning, Globe2, Home, Lock, RefreshCcw, ServerCrash, ShieldAlert, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Btn } from "./ui";

type Tone = "red" | "amber" | "muted";
const tones: Record<Tone, string> = {
  red: "bg-primary/12 text-primary-text",
  amber: "bg-warning/12 text-warning",
  muted: "bg-surface-3 text-soft",
};

/** Base for every full-width status screen, so errors and restrictions share one look. */
export function StateScreen({ icon: Icon, tone = "muted", title, message, actions, children, compact, code }: { icon: LucideIcon; tone?: Tone; title: string; message: string; actions?: ReactNode; children?: ReactNode; compact?: boolean; code?: string }) {
  return (
    <div role="alert" className={cn("mx-auto flex max-w-lg flex-col items-center px-4 text-center", compact ? "py-10" : "py-24")}>
      <span className={cn("grid size-14 place-items-center rounded-2xl", tones[tone])}>
        <Icon className="size-7" />
      </span>
      {code && <div className="mt-5 text-6xl font-black tracking-tight">{code}</div>}
      <h2 className={cn("font-bold tracking-tight", code ? "mt-2 text-xl" : "mt-5 text-2xl")}>{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {children}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

const HomeBtn = ({ label = "Go home" }: { label?: string }) => (
  <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3 [&_svg]:size-4">
    <Home /> {label}
  </Link>
);

/* ------------------------------------------------------------------ errors */
export const UploadFailed = ({ file, reason, onRetry, onRemove }: { file?: string; reason?: string; onRetry?: () => void; onRemove?: () => void }) => (
  <StateScreen compact icon={CloudOff} tone="red" title="Upload failed" message={`${file ? `${file} ` : "The file "}could not be uploaded. ${reason ?? "Check the format and size, then try again."}`} actions={<>{onRetry && <Btn variant="primary" onClick={onRetry}><RefreshCcw /> Retry upload</Btn>}{onRemove && <Btn onClick={onRemove}>Remove file</Btn>}</>} />
);
export const ProcessingFailed = ({ file, onRetry }: { file?: string; onRetry?: () => void }) => (
  <StateScreen compact icon={FileWarning} tone="red" title="Processing failed" message={`${file ? `${file} ` : "The file "}uploaded, but the server could not prepare it for streaming. Upload a fresh master file.`} actions={onRetry && <Btn variant="primary" onClick={onRetry}><RefreshCcw /> Try processing again</Btn>} />
);
export const PaymentFailed = ({ onUpdate, onRetry }: { onUpdate?: () => void; onRetry?: () => void }) => (
  <StateScreen compact icon={CreditCard} tone="red" title="Payment failed" message="We couldn't charge your payment method. Update it to keep your plan active." actions={<>{onUpdate && <Btn variant="primary" onClick={onUpdate}>Update payment method</Btn>}{onRetry && <Btn onClick={onRetry}>Retry payment</Btn>}</>} />
);
export const SubscriptionExpired = ({ onRenew }: { onRenew?: () => void }) => (
  <StateScreen compact icon={CalendarClock} tone="amber" title="Your subscription has expired" message="Renew your plan to keep watching, reading and listening." actions={onRenew ? <Btn variant="primary" onClick={onRenew}>Renew plan</Btn> : <Link to="/subscription" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">View plans</Link>} />
);
export const NetworkError = ({ onRetry }: { onRetry?: () => void }) => (
  <StateScreen compact icon={WifiOff} tone="amber" title="You appear to be offline" message="We couldn't reach StreamVerse. Check your connection and try again." actions={onRetry && <Btn variant="primary" onClick={onRetry}><RefreshCcw /> Try again</Btn>} />
);
export const ContentUnavailable = ({ message }: { message?: string }) => (
  <StateScreen icon={Ban} title="This title is unavailable" message={message ?? "It may have been removed, or it isn't published yet."} actions={<HomeBtn label="Browse StreamVerse" />} />
);
export const ContentRestricted = ({ message }: { message?: string }) => (
  <StateScreen icon={ShieldAlert} tone="amber" title="This content is restricted" message={message ?? "You don't have access to this title."} actions={<HomeBtn />} />
);
export const NotFoundScreen = () => (
  <StateScreen code="404" icon={AlertTriangle} title="Page not found" message="The page you're looking for doesn't exist or has been moved." actions={<HomeBtn />} />
);
export const GeneralError = ({ onRetry }: { onRetry?: () => void }) => (
  <StateScreen icon={ServerCrash} tone="red" title="Something went wrong" message="This page didn't load. You can try again, or head back home." actions={<>{onRetry && <Btn variant="primary" onClick={onRetry}><RefreshCcw /> Try again</Btn>}<HomeBtn /></>} />
);

/* ------------------------------------------------------------------ restriction screens */
export const AgeRestricted = ({ minAge, title, onConfirm }: { minAge: number; title?: string; onConfirm: () => void }) => (
  <StateScreen icon={ShieldAlert} tone="amber" title="Age restricted content" message={`${title ? `"${title}" is` : "This title is"} intended for viewers aged ${minAge}+. Confirm your age to continue.`} actions={<><Btn variant="primary" onClick={onConfirm}>I am {minAge} or older</Btn><HomeBtn label="Take me back" /></>} />
);
export const SubscribersOnly = () => (
  <StateScreen icon={Lock} tone="red" title="Subscribers only" message="This title is part of an active StreamVerse plan. Subscribe or renew to unlock it." actions={<Link to="/subscription" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-red hover:bg-primary-hover">View plans</Link>} />
);
export const RegionUnavailable = ({ country }: { country?: string }) => (
  <StateScreen icon={Globe2} tone="amber" title="Unavailable in your region" message={`This title isn't available${country ? ` in ${country}` : " where you are"} right now.`} actions={<HomeBtn label="Browse available titles" />} />
);
export const NotYetAvailable = ({ when }: { when?: string }) => (
  <StateScreen icon={CalendarClock} tone="amber" title="Not yet available" message={when ? `This title arrives ${new Date(when).toLocaleDateString(undefined, { dateStyle: "long" })}.` : "This title is coming soon."} actions={<HomeBtn label="Browse available titles" />} />
);
export const ExpiredContent = () => (
  <StateScreen icon={Ban} title="This title is no longer available" message="Its availability window has ended, or it has been removed from StreamVerse." actions={<HomeBtn label="Browse StreamVerse" />} />
);
