import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Check, Clock3, CreditCard, Download, Eye, LockKeyhole, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MetricStrip, SearchBox, SelectBox, Toolbar, td, th, tr } from "@/components/sv/admin";
import { Btn, EmptyState, PageHeader, Panel, PlanBadge, Skel, StatusBadge, TabBar } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLATFORM_USERS, planTotals } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { itemTitle, useCatalog } from "@/lib/items";
import { seeded } from "@/lib/runtime";
import { update, usePlans, useUsers, type User } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useAdminUsersQuery, useAdminUserMutation } from "@/hooks/useAdminApi";
import type { ApiAdminUser } from "@/api/types";

export const Route = createFileRoute("/admin/users")({
  validateSearch: (s: Record<string, unknown>): { u?: string } => (typeof s["u"] === "string" && s["u"] ? { u: s["u"] } : {}),
  component: Users,
});

function apiUserToUser(u: ApiAdminUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    plan: u.subscriptionStatus ?? "Free",
    status: u.active ? "Active" : "Suspended",
    joined: u.createdAt.slice(0, 10),
    last: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Unknown",
    country: u.country ?? "",
  };
}

type Tab = "overview" | "subscription" | "library" | "history";
const icon = "grid size-8 place-items-center rounded-md text-soft hover:bg-surface-3 hover:text-foreground";
const money = (n: number) => `$${n.toFixed(2)}`;
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

function Users() {
  const demoUsers = useUsers();
  const apiQuery = useAdminUsersQuery();
  const apiMutation = useAdminUserMutation();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const users: User[] = useMemo(() => {
    if (DEMO_MODE) return demoUsers;
    return (apiQuery.data?.data ?? []).map(apiUserToUser);
  }, [demoUsers, apiQuery.data]);

  const { u: openId } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [tab, setTab] = useState<Tab>("overview");
  const list = users.filter((u) => (status === "All" || u.status === status) && `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const plans = usePlans();
  const totals = planTotals(plans);
  const premiumMembers = plans.filter((p) => p.name.startsWith("Premium") && p.active).reduce((n, p) => n + p.subs, 0);
  const selected = users.find((u) => u.id === openId);
  const open = (u: User, t: Tab) => {
    setTab(t);
    navigate({ to: "/admin/users", search: { u: u.id } });
  };
  const toggleStatus = (u: User) => {
    const next = u.status === "Active" ? "Suspended" : "Active";
    if (DEMO_MODE) {
      update((s) => ({ users: s.users.map((x) => (x.id === u.id ? { ...x, status: next } : x)) }));
      toast.success(`${u.name} ${next === "Suspended" ? "suspended" : "reactivated"}`);
    } else {
      if (next === "Suspended") {
        apiMutation.suspend.mutate(u.id, { onSuccess: () => toast.success(`${u.name} suspended`) });
      } else {
        apiMutation.unsuspend.mutate(u.id, { onSuccess: () => toast.success(`${u.name} reactivated`) });
      }
    }
  };

  if (isLoading) return <div className="space-y-3 p-6"><Skel className="h-20 w-full" /><Skel className="h-64 w-full" /></div>;
  if (isError) return <div className="p-8 text-center text-sm text-muted-foreground">Failed to load users.</div>;

  return (
    <>
      <PageHeader
        title="Users"
        sub="A considered view of the people who make StreamVerse."
        actions={
          <Btn
            onClick={() => {
              const ok = downloadCsv("streamverse-users.csv", [["Name", "Email", "Plan", "Status", "Joined", "Country"], ...list.map((u) => [u.name, u.email, u.plan, u.status, u.joined, u.country])]);
              if (ok) toast.success(`Exported ${list.length} users`);
              else toast.error("Your browser blocked the download.");
            }}
          >
            <Download /> Export
          </Btn>
        }
      />
      <MetricStrip
        items={[
          { label: "Registered users", value: PLATFORM_USERS.toLocaleString(), note: `Showing ${users.length} sample accounts`, tone: "good" },
          { label: "Premium members", value: premiumMembers.toLocaleString(), note: `${Math.round((premiumMembers / PLATFORM_USERS) * 100)}% of members` },
          { label: "Paying subscribers", value: totals.subs.toLocaleString(), note: `${Math.round((totals.subs / PLATFORM_USERS) * 100)}% of members` },
          { label: "Suspended (in this list)", value: String(users.filter((u) => u.status === "Suspended").length), note: "Needs review", tone: "warn" },
        ]}
      />
      <Panel>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search by name or email..." />
          <SelectBox aria-label="User Status" value={status} onChange={setStatus} options={["All", "Active", "Inactive", "Suspended"]} />
          <span className="ml-auto text-xs text-muted-foreground">{list.length} members</span>
        </Toolbar>
        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={UserX} title="No users found" sub="Try a different name, email or status." action={<Btn onClick={() => { setQ(""); setStatus("All"); }}>Clear filters</Btn>} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["User", "Plan", "Status", "Joined", "Last active", "Actions"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className={tr}>
                    <td className={td}>
                      <button type="button" onClick={() => open(u, "overview")} className="flex items-center gap-3 text-left">
                        <span className="grid size-8 place-items-center rounded-md bg-surface-3 text-xs font-bold">
                          {u.name
                            .split(" ")
                            .map((p) => p[0])
                            .join("")}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold hover:underline">{u.name}</span>
                          <span className="block truncate max-w-[180px] text-xs text-muted-foreground">{u.email}</span>
                        </span>
                      </button>
                    </td>
                    <td className={td}>
                      <PlanBadge plan={u.plan} />
                    </td>
                    <td className={td}>
                      <StatusBadge status={u.status} />
                    </td>
                    <td className={`${td} text-soft`}>{u.joined}</td>
                    <td className={`${td} text-soft`}>{u.last}</td>
                    <td className={td}>
                      <div className="inline-flex gap-0.5">
                        <button className={icon} title="View user" aria-label={`View ${u.name}`} onClick={() => open(u, "overview")}>
                          <Eye className="size-4" />
                        </button>
                        <button className={icon} title="View subscription" aria-label={`View ${u.name}'s subscription`} onClick={() => open(u, "subscription")}>
                          <CreditCard className="size-4" />
                        </button>
                        <button className={icon} title="View library" aria-label={`View ${u.name}'s library`} onClick={() => open(u, "library")}>
                          <BookOpen className="size-4" />
                        </button>
                        <button className={icon} title="View history" aria-label={`View ${u.name}'s history`} onClick={() => open(u, "history")}>
                          <Clock3 className="size-4" />
                        </button>
                        <button className={icon} title={u.status === "Active" ? "Suspend" : "Reactivate"} aria-label={u.status === "Active" ? `Suspend ${u.name}` : `Reactivate ${u.name}`} onClick={() => toggleStatus(u)}>
                          {u.status === "Active" ? <LockKeyhole className="size-4" /> : <Check className="size-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={!!selected} onOpenChange={(o) => !o && navigate({ to: "/admin/users", search: {} })}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-border bg-surface-2 sm:max-w-3xl">
          {selected && <UserDetails user={selected} tab={tab} setTab={setTab} onToggle={() => toggleStatus(selected)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* Sample data for the admin's view of one person. It is generated from the user's id so it stays the same between visits. */
function UserDetails({ user, tab, setTab, onToggle }: { user: User; tab: Tab; setTab: (t: Tab) => void; onToggle: () => void }) {
  const cat = useCatalog();
  const plans = usePlans();
  const plan = plans.find((p) => p.name === user.plan);
  const sample = useMemo(() => {
    const rnd = seeded(`user:${user.id}`);
    const pool = [...cat.all];
    const pick = (n: number) => {
      const out = [];
      for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
      return out;
    };
    const library = pick(6).map((item) => ({ item, pct: Math.round(rnd() * 100) }));
    const history = pick(7).map((item, i) => ({ item, daysAgo: i * 2 + Math.floor(rnd() * 2), pct: Math.round(rnd() * 100) }));
    return { library, history };
  }, [cat.all, user.id]);
  const price = plan?.price ?? 0;
  const renews = new Date(Date.UTC(2026, 9, 14 + (user.id.charCodeAt(1) % 10)));
  const bills = [0, 1, 2].map((i) => ({ id: `INV-${user.id}-${i}`, when: new Date(Date.UTC(2026, 8 - i, 14)).toISOString(), amount: price, status: user.status === "Suspended" && i === 0 ? "Failed" : "Succeeded" }));

  const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-border py-2.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-red-grad text-lg font-bold">
            {user.name
              .split(" ")
              .map((p) => p[0])
              .join("")}
          </span>
          <div>
            <DialogTitle>{user.name}</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge status={user.status} />
            <Btn size="sm" variant={user.status === "Active" ? "danger" : "primary"} onClick={onToggle}>
              {user.status === "Active" ? <LockKeyhole /> : <Check />} {user.status === "Active" ? "Suspend" : "Reactivate"}
            </Btn>
          </div>
        </div>
      </DialogHeader>
      <TabBar
        label="User details"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "subscription", label: "Subscription" },
          { id: "library", label: "Library" },
          { id: "history", label: "History" },
        ]}
      />
      <div className="min-h-64">
        {tab === "overview" && (
          <dl>
            <Row k="User ID">{user.id}</Row>
            <Row k="Account type">USER</Row>
            <Row k="Account status">{user.status}</Row>
            <Row k="Country">{user.country}</Row>
            <Row k="Joined">{user.joined}</Row>
            <Row k="Last active">{user.last}</Row>
            <Row k="Plan">
              <PlanBadge plan={user.plan} />
            </Row>
          </dl>
        )}
        {tab === "subscription" && (
          <div className="space-y-4">
            <dl>
              <Row k="Plan">{user.plan}</Row>
              <Row k="Price">{plan ? `${money(price)} / ${plan.interval === "Yearly" ? "year" : "month"}` : "Free"}</Row>
              <Row k="Status">{user.status === "Suspended" ? "Payment on hold" : user.plan === "Free" ? "No paid plan" : "Active"}</Row>
              <Row k="Next billing">{user.plan === "Free" ? "None" : date(renews.toISOString())}</Row>
              <Row k="Payment method">{user.plan === "Free" ? "None" : `Visa •••• ${4000 + (user.id.charCodeAt(1) % 9) * 111}`}</Row>
            </dl>
            {user.plan !== "Free" && (
              <div>
                <div className="eyebrow mb-2 text-[10px] text-muted-foreground">Recent billing</div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {bills.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span>{date(b.when)}</span>
                      <span className="font-semibold">{money(b.amount)}</span>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {tab === "library" && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sample.library.map(({ item, pct }) => (
              <li key={`${item.type}-${item.slug}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{itemTitle(item)}</span>
                <span className="text-xs text-muted-foreground">{item.type}</span>
                <div className="hidden h-1 w-24 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right text-xs text-soft">{pct}%</span>
              </li>
            ))}
          </ul>
        )}
        {tab === "history" && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sample.history.map(({ item, daysAgo, pct }) => (
              <li key={`${item.type}-${item.slug}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{itemTitle(item)}</span>
                <span className="text-xs text-muted-foreground">{item.type === "Movie" ? "Watched" : item.type === "eBook" ? "Read" : "Listened"}</span>
                <span className="w-24 text-right text-xs text-soft">{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}</span>
                <span className="w-10 text-right text-xs text-soft">{pct}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Library and history are sample data in this phase. They will come from each customer's real activity once the backend is connected.</p>
    </>
  );
}
