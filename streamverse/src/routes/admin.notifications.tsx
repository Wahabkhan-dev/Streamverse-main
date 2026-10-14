import { createFileRoute } from "@tanstack/react-router";
import { Bell, Check, CreditCard, Eye, Film, Send, Server, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Btn, EmptyState, Field, PageHeader, Panel, PanelHeader, SelectInput, TabBar, TextArea, TextInput } from "@/components/sv/ui";
import { update, useAdminNotes, type AdminNote, type AdminNoteKind } from "@/lib/store";
import type { CustomerNoteKind } from "@/lib/user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/notifications")({ component: Notifications });

type Tab = "all" | AdminNoteKind;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Users", label: "New User" },
  { id: "Content", label: "Content" },
  { id: "Payments", label: "Payment" },
  { id: "Platform", label: "Platform Alert" },
];
const icons = { Content: Film, Users: UserPlus, Payments: CreditCard, Platform: Server } as const;
const KINDS: CustomerNoteKind[] = ["New Release", "Subscription", "Recommendation", "Account"];

function Notifications() {
  const list = useAdminNotes();
  const setList = (fn: (o: AdminNote[]) => AdminNote[]) => update((s) => ({ adminNotes: fn(s.adminNotes) }));
  const [tab, setTab] = useState<Tab>("all");
  const [kind, setKind] = useState<CustomerNoteKind>("New Release");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [titleError, setTitleError] = useState("");
  const unread = list.filter((n) => !n.read).length;
  const shown = tab === "all" ? list : list.filter((n) => n.kind === tab);

  const send = () => {
    if (!title.trim()) {
      setTitleError("Add a title for the announcement.");
      return;
    }
    setTitleError("");
    update((s) => ({ announcements: [{ id: Date.now(), kind, t: title.trim(), s: message.trim() || "From the StreamVerse team", at: Date.now() }, ...s.announcements] }));
    toast.success("Announcement sent to customers");
    setTitle("");
    setMessage("");
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        sub="Keep up with activity across content, members, billing and the platform."
        actions={
          <Btn
            disabled={unread === 0}
            onClick={() => {
              setList((o) => o.map((n) => ({ ...n, read: true })));
              toast.success("All notifications marked as read");
            }}
          >
            <Check /> Mark all as read
          </Btn>
        }
      />
      <div className="mb-4">
        <TabBar label="Notification type" value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: t.id === "all" ? unread : list.filter((n) => n.kind === t.id && !n.read).length }))} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel>
          {shown.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Bell} title="You're all caught up" sub="Nothing here right now." />
            </div>
          ) : (
            shown.map((n) => {
              const Icon = icons[n.kind];
              return (
                <div key={n.id} className={cn("flex items-start gap-3 border-b border-border px-5 py-4 last:border-0", !n.read && "bg-surface-2")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-3 text-soft">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-sm", !n.read && "font-semibold")}>{n.t}</div>
                    <p className="text-xs text-muted-foreground">{n.s}</p>
                    <small className="text-[11px] text-muted-foreground">{n.time}</small>
                  </div>
                  {!n.read && (
                    <>
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span className="sr-only">Unread</span>
                    </>
                  )}
                  <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3" aria-label={n.read ? "Mark unread" : "Mark read"} title={n.read ? "Mark unread" : "Mark read"} onClick={() => setList((o) => o.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)))}>
                    {n.read ? <Eye className="size-4" /> : <Check className="size-4" />}
                  </button>
                  <button className="grid size-8 place-items-center rounded-md text-soft hover:bg-primary/10 hover:text-primary-text" aria-label="Delete notification" title="Delete" onClick={() => setList((o) => o.filter((x) => x.id !== n.id))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })
          )}
        </Panel>
        <Panel className="h-fit">
          <PanelHeader title="Send announcement" sub="Delivered to every customer's notification bell." />
          <div className="space-y-4 p-5">
            <Field label="Type">
              <SelectInput options={KINDS} value={kind} onChange={(e) => setKind(e.target.value as CustomerNoteKind)} />
            </Field>
            <div>
              <Field label="Title" required>
                <TextInput value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!titleError} />
              </Field>
              {titleError && (
                <p role="alert" className="mt-1 text-[11px] font-medium text-primary-text">
                  {titleError}
                </p>
              )}
            </div>
            <Field label="Message">
              <TextArea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <Btn variant="primary" onClick={send}>
              <Send /> Send
            </Btn>
          </div>
        </Panel>
      </div>
    </>
  );
}
