import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Pencil, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MetricStrip } from "@/components/sv/admin";
import { Btn, Field, PageHeader, Panel, SelectInput, Skel, StatusBadge, TextArea, TextInput, Toggle } from "@/components/sv/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { update, usePlans, type Plan } from "@/lib/store";
import { DEMO_MODE } from "@/lib/config";
import { useAdminPlansQuery, useAdminPlanMutation } from "@/hooks/useAdminApi";
import type { ApiPlan } from "@/api/types";

export const Route = createFileRoute("/admin/subscriptions")({ component: Subscriptions });

const blank: Plan = { name: "", price: 0, interval: "Monthly", features: "", active: true, subs: 0 };

function apiPlanToPlan(p: ApiPlan): Plan & { apiId: string } {
  return {
    apiId: p.id,
    name: p.name,
    price: p.priceAmount / 100,
    interval: p.billingInterval === "MONTHLY" ? "Monthly" : "Yearly",
    features: p.features.join(", "),
    active: p.active,
    subs: 0,
  };
}

function Subscriptions() {
  const demoPlans = usePlans();
  const apiQuery = useAdminPlansQuery();
  const apiMutation = useAdminPlanMutation();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const plans: (Plan & { apiId?: string })[] = useMemo(() => {
    if (DEMO_MODE) return demoPlans;
    return (apiQuery.data?.data ?? []).map(apiPlanToPlan);
  }, [demoPlans, apiQuery.data]);

  const [edit, setEdit] = useState<number | null>(null);
  const [draft, setDraft] = useState<Plan>(blank);

  const begin = (n: number) => {
    setEdit(n);
    const { apiId: _drop, ...planData } = (plans[n] ?? blank) as Plan & { apiId?: string };
    void _drop;
    setDraft(n === -1 ? blank : planData);
  };
  const save = () => {
    if (!draft.name.trim() || !draft.price) {
      toast.warning("Plan name and price are required");
      return;
    }
    if (DEMO_MODE) {
      update((s) => ({ plans: edit === -1 ? [...s.plans, draft] : s.plans.map((p, i) => (i === edit ? draft : p)) }));
    } else {
      const apiId = edit !== null && edit !== -1 ? (plans[edit] as Plan & { apiId?: string }).apiId : undefined;
      const apiData = { name: draft.name, priceAmount: Math.round(draft.price * 100), billingInterval: (draft.interval === "Monthly" ? "MONTHLY" : "YEARLY") as "MONTHLY" | "YEARLY", features: draft.features.split(",").map((f) => f.trim()).filter(Boolean), active: draft.active };
      if (apiId) {
        apiMutation.update.mutate({ id: apiId, data: apiData }, { onSuccess: () => { setEdit(null); toast.success("Plan saved"); } });
        return;
      } else {
        apiMutation.create.mutate(apiData, { onSuccess: () => { setEdit(null); toast.success("Plan created"); } });
        return;
      }
    }
    setEdit(null);
    toast.success("Subscription plan saved");
  };
  const active = plans.filter((p) => p.active);

  if (isLoading) return <div className="space-y-3 p-6"><Skel className="h-20 w-full" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skel key={i} className="h-48 w-full" />)}</div></div>;
  if (isError) return <div className="p-8 text-center text-sm text-muted-foreground">Failed to load plans.</div>;

  return (
    <>
      <PageHeader title="Subscriptions" sub="Plans and billing options for every kind of story lover." actions={<Btn variant="primary" onClick={() => begin(-1)}><Plus /> Create plan</Btn>} />
      <MetricStrip
        items={[
          { label: "Active plans", value: String(active.length), note: "Across two billing options" },
          { label: "Subscribers", value: active.reduce((n, p) => n + p.subs, 0).toLocaleString(), note: "On active plans", tone: "good" },
          { label: "Monthly revenue", value: `$${Math.round(active.reduce((n, p) => n + p.subs * (p.interval === "Yearly" ? p.price / 12 : p.price), 0)).toLocaleString()}`, note: "Estimated from active plans", tone: "good" },
          { label: "Cancelled plans", value: "428", note: "1.3% cancellation rate", tone: "warn" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p, n) => (
          <Panel key={`${p.name}-${n}`} className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-md bg-primary/12 text-primary-text">
                <CreditCard className="size-4" />
              </span>
              <StatusBadge status={p.active ? "Active" : "Draft"} />
            </div>
            <h2 className="mt-4 text-lg font-bold">{p.name}</h2>
            <div className="mt-1 text-2xl font-bold">
              ${p.price}
              <span className="text-xs font-normal text-muted-foreground"> / {p.interval.toLowerCase()}</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.features}</p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-soft">
              <Users className="size-3.5" /> {p.subs.toLocaleString()} subscribers
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Btn onClick={() => begin(n)}><Pencil /> Edit plan</Btn>
              <Toggle
                checked={p.active}
                onChange={(v) => {
                  if (DEMO_MODE) {
                    update((s) => ({ plans: s.plans.map((x, i) => (i === n ? { ...x, active: v } : x)) }));
                  } else {
                    const apiId = (p as Plan & { apiId?: string }).apiId;
                    if (apiId) {
                      if (v) apiMutation.activate.mutate(apiId, { onSuccess: () => toast.success(`${p.name} activated`) });
                      else apiMutation.deactivate.mutate(apiId, { onSuccess: () => toast.success(`${p.name} deactivated`) });
                    }
                  }
                }}
                name={`Active — ${p.name} plan`}
              />
            </div>
          </Panel>
        ))}
      </div>
      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="border-border bg-surface-2">
          <DialogHeader>
            <DialogTitle>{edit === -1 ? "Create plan" : "Edit plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Plan name" required>
              <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price" required>
                <TextInput type="number" value={draft.price || ""} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
              </Field>
              <Field label="Billing interval">
                <SelectInput options={["Monthly", "Yearly"]} value={draft.interval} onChange={(e) => setDraft({ ...draft, interval: e.target.value })} />
              </Field>
            </div>
            <Field label="Features">
              <TextArea rows={3} value={draft.features} onChange={(e) => setDraft({ ...draft, features: e.target.value })} />
            </Field>
            <Toggle checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Plan active" />
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setEdit(null)}>Cancel</Btn>
              <Btn variant="primary" disabled={apiMutation.create.isPending || apiMutation.update.isPending} onClick={save}>Save plan</Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
