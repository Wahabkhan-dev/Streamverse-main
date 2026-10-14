import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, Eye, Film, Sparkles, Trash2, UserRound, CreditCard } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Btn, EmptyState, Skel, TabBar } from "@/components/sv/ui";
import { deleteNote, markAllNotesRead, markNoteRead, markNoteUnread, timeAgo, useCustomerNotifications } from "@/lib/notifications";
import type { CustomerNoteKind } from "@/lib/user";
import { cn } from "@/lib/utils";
import { DEMO_MODE } from "@/lib/config";
import { useApiNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from "@/hooks/useApiMe";
import type { ApiNotification } from "@/api/types";

type Tab = "all" | CustomerNoteKind;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "New Release", label: "New Release" },
  { id: "Subscription", label: "Subscription" },
  { id: "Recommendation", label: "Recommendation" },
  { id: "Account", label: "Account" },
];
const IconOf = { "New Release": Film, Subscription: CreditCard, Recommendation: Sparkles, Account: UserRound } as const;

export const Route = createFileRoute("/_site/notifications")({
  head: () => ({ meta: [{ title: "Notifications — StreamVerse" }, { name: "description", content: "New releases, billing and account updates." }] }),
  component: NotificationsPage,
});

interface NoteRow {
  key: string;
  kind: CustomerNoteKind;
  t: string;
  s: string;
  at: number;
  read: boolean;
}

function apiNotifToRow(n: ApiNotification): NoteRow {
  return {
    key: n.id,
    kind: n.kind as CustomerNoteKind,
    t: n.title,
    s: n.subtitle,
    at: new Date(n.createdAt).getTime(),
    read: n.read,
  };
}

function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("all");

  // Demo-mode data (always call hooks)
  const demoNotes = useCustomerNotifications();

  // API-mode data
  const apiNotificationsQuery = useApiNotificationsQuery();
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();

  // Build notes list
  const notes: NoteRow[] = useMemo(() => {
    if (DEMO_MODE) return demoNotes.map((n) => ({ key: n.key, kind: n.kind, t: n.t, s: n.s, at: n.at, read: n.read }));
    return (apiNotificationsQuery.data ?? []).map(apiNotifToRow);
  }, [DEMO_MODE, demoNotes, apiNotificationsQuery.data]);

  // Loading / error states (after all hooks)
  if (!DEMO_MODE && apiNotificationsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pt-8 md:px-8">
        <Skel className="h-8 w-40" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }, (_, i) => <Skel key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (!DEMO_MODE && apiNotificationsQuery.isError) {
    return (
      <div className="mx-auto max-w-[900px] px-4 pt-8 md:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-6 text-sm text-muted-foreground">Failed to load notifications. Please refresh and try again.</p>
      </div>
    );
  }

  const shown = tab === "all" ? notes : notes.filter((n) => n.kind === tab);
  const unread = notes.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    if (!DEMO_MODE) {
      markAllReadMutation.mutate(undefined, {
        onSuccess: () => toast.success("All notifications marked as read"),
        onError: () => toast.error("Failed to mark notifications as read"),
      });
      return;
    }
    markAllNotesRead(notes.map((n) => n.key));
    toast.success("All notifications marked as read");
  };

  const handleToggleRead = (n: NoteRow) => {
    if (!DEMO_MODE) {
      if (!n.read) {
        markReadMutation.mutate(n.key, {
          onError: () => toast.error("Failed to update notification"),
        });
      }
      return;
    }
    n.read ? markNoteUnread(n.key) : markNoteRead(n.key);
  };

  const handleDelete = (n: NoteRow) => {
    if (!DEMO_MODE) {
      // API doesn't expose a delete endpoint in the hooks; skip in real mode
      toast.info("Notifications are managed via your account settings.");
      return;
    }
    deleteNote(n.key);
    toast.success("Notification deleted");
  };

  return (
    <div className="mx-auto max-w-[900px] px-4 pt-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unread ? `${unread} unread` : "You're all caught up"}</p>
        </div>
        <Btn
          variant="outline"
          disabled={unread === 0 || markAllReadMutation.isPending}
          onClick={handleMarkAllRead}
        >
          <Check /> Mark all read
        </Btn>
      </div>
      <div className="mt-6">
        <TabBar label="Notification type" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, ...(t.id === "all" ? { count: notes.length } : { count: notes.filter((n) => n.kind === t.id).length }) }))} />
      </div>
      <div className="py-6">
        {shown.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications" sub="New releases, billing updates and account messages will show up here. You can choose what you get in Profile." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {shown.map((n) => {
              const Icon = IconOf[n.kind];
              return (
                <li key={n.key} className={cn("flex items-start gap-3 p-4", !n.read && "bg-surface-2")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-3 text-soft">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", !n.read && "font-semibold")}>{n.t}</div>
                    <p className="text-xs text-muted-foreground">{n.s}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 font-semibold">{n.kind}</span> {timeAgo(n.at)} ago
                    </div>
                  </div>
                  {!n.read && (
                    <>
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span className="sr-only">Unread</span>
                    </>
                  )}
                  <Btn size="icon" variant="ghost" aria-label={n.read ? "Mark as unread" : "Mark as read"} title={n.read ? "Mark as unread" : "Mark as read"} onClick={() => handleToggleRead(n)}>
                    {n.read ? <Eye /> : <Check />}
                  </Btn>
                  {DEMO_MODE && (
                    <Btn
                      size="icon"
                      variant="ghost"
                      aria-label="Delete notification"
                      title="Delete"
                      onClick={() => handleDelete(n)}
                    >
                      <Trash2 />
                    </Btn>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
