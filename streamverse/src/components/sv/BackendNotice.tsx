import { Server } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn } from "./ui";

/**
 * Some actions can only be real once the backend exists (payments, account security, file delivery).
 * Instead of a dead button they open this notice, so nothing pretends to work.
 */
let current: { feature: string; detail?: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showBackendNotice(feature: string, detail?: string) {
  current = detail ? { feature, detail } : { feature };
  emit();
}
const close = () => {
  current = null;
  emit();
};

export function BackendNoticeHost() {
  const note = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
  return (
    <Dialog open={!!note} onOpenChange={(o) => !o && close()}>
      <DialogContent className="border-border bg-surface-2 sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 grid size-10 place-items-center rounded-lg bg-warning/12 text-warning">
            <Server className="size-5" />
          </span>
          <DialogTitle>Backend integration required</DialogTitle>
          <DialogDescription>
            <b className="text-foreground">{note?.feature}</b> needs the server to be connected.
            {note?.detail ? ` ${note.detail}` : " This screen is complete; the real action will be wired up in the backend phase."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Btn variant="primary" onClick={close}>
            Got it
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small inline badge for settings or controls that are display-only until the backend is connected. */
export function BackendBadge() {
  return <span className="rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-warning uppercase">Backend integration required</span>;
}
