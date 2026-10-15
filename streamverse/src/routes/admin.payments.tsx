import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricStrip, SearchBox, SelectBox, Toolbar, td, th, tr } from "@/components/sv/admin";
import { Btn, EmptyState, PageHeader, Panel, Skel, StatusBadge } from "@/components/sv/ui";
import { downloadCsv } from "@/lib/csv";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { payments as demoPayments } from "@/lib/data";
import { usd } from "@/lib/analytics";
import { DEMO_MODE } from "@/lib/config";
import { useAdminPaymentsQuery, useAdminRefundMutation } from "@/hooks/useAdminApi";
import type { ApiAdminPayment } from "@/api/types";

export const Route = createFileRoute("/admin/payments")({ component: Payments });

type PaymentRow = { id: string; user: string; plan: string; amount: number; currency: string; date: string; status: string };

function apiToRow(p: ApiAdminPayment): PaymentRow {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    id: p.id,
    user: p.userName ?? p.userEmail ?? p.userId,
    plan: p.plan ?? "-",
    amount: p.amount,
    currency: p.currency,
    date: p.createdAt.slice(0, 10),
    status: cap(p.status),
  };
}

function Payments() {
  const apiQuery = useAdminPaymentsQuery();
  const refundMut = useAdminRefundMutation();
  const isLoading = !DEMO_MODE && apiQuery.isLoading;
  const isError = !DEMO_MODE && apiQuery.isError;

  const payments = useMemo((): PaymentRow[] => {
    if (DEMO_MODE) return demoPayments;
    return (apiQuery.data?.data ?? []).map(apiToRow);
  }, [apiQuery.data]);

  // the cards are worked out from the same rows the table shows
  const count = (status: string) => payments.filter((p) => p.status === status).length;
  const revenue = payments.filter((p) => p.status === "Succeeded").reduce((n, p) => n + p.amount, 0);
  const refunded = payments.filter((p) => p.status === "Refunded").reduce((n, p) => n + p.amount, 0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const list = payments.filter((p) => (status === "All" || p.status === status) && Object.values(p).join(" ").toLowerCase().includes(q.toLowerCase()));

  void refundMut; // available for future refund action wiring

  if (isLoading) return <div className="space-y-3 p-6"><Skel className="h-20 w-full" /><Skel className="h-64 w-full" /></div>;
  if (isError) return <div className="p-8 text-center text-sm text-muted-foreground">Failed to load payments.</div>;
  return (
    <>
      <PageHeader title="Payments" sub="A clear record of every subscription transaction." actions={
          <Btn
            onClick={() => {
              const ok = downloadCsv("streamverse-payments.csv", [["Transaction ID", "User", "Plan", "Amount", "Currency", "Date", "Status"], ...list.map((p) => [p.id, p.user, p.plan, p.amount.toFixed(2), p.currency, p.date, p.status ?? ""])]);
              if (ok) toast.success(`Exported ${list.length} transactions`);
              else toast.error("Your browser blocked the download.");
            }}
          >
            <Download /> Export report
          </Btn>
        } />
      <MetricStrip
        items={[
          { label: "Total payments", value: String(payments.length), note: "All transactions below" },
          { label: "Succeeded", value: String(count("Succeeded")), note: usd(revenue), tone: "good" },
          { label: "Pending", value: String(count("Pending")), ...(count("Pending") ? { note: "Awaiting settlement", tone: "warn" as const } : {}) },
          { label: "Failed", value: String(count("Failed")), ...(count("Failed") ? { note: "Needs attention", tone: "warn" as const } : {}) },
          { label: "Refunded", value: String(count("Refunded")), note: usd(refunded) },
          { label: "Total revenue", value: usd(revenue), note: "Succeeded, less refunds not counted" },
        ]}
      />
      <p className="-mt-3 mb-5 text-xs text-muted-foreground">Sample data: every figure above is calculated from the sample transactions in this table.</p>
      <Panel>
        <Toolbar>
          <SearchBox value={q} onChange={setQ} placeholder="Search transaction or user..." />
          <SelectBox aria-label="Payment Status" value={status} onChange={setStatus} options={["All", "Succeeded", "Pending", "Failed", "Refunded"]} />
          <span className="ml-auto text-xs text-muted-foreground">{list.length} transactions</span>
        </Toolbar>
        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Receipt} title="No transactions found" sub="Try a different search or status." action={<Btn onClick={() => { setQ(""); setStatus("All"); }}>Clear filters</Btn>} />
          </div>
        ) : (
        <div tabIndex={0} role="region" aria-label="Transactions" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Transaction ID", "User", "Plan", "Amount", "Currency", "Date", "Status"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={tr}>
                  <td className={`${td} font-mono text-xs`}><span className="block truncate max-w-[120px]" title={p.id}>{p.id}</span></td>
                  <td className={td}><span className="block truncate max-w-[160px]" title={p.user}>{p.user}</span></td>
                  <td className={`${td} text-soft`}>{p.plan}</td>
                  <td className={`${td} font-bold`}>${p.amount.toFixed(2)}</td>
                  <td className={`${td} text-soft`}>{p.currency}</td>
                  <td className={`${td} text-soft`}>{p.date}</td>
                  <td className={td}><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span>
            Showing <b className="text-foreground">{list.length}</b> transactions
          </span>
          <div className="flex gap-1">
            <button disabled className="h-7 rounded border border-border px-2.5 opacity-50">Previous</button>
            <button className="h-7 rounded border border-primary bg-primary/15 px-2.5 text-foreground">1</button>
            <button disabled className="h-7 rounded border border-border px-2.5 opacity-50">Next</button>
          </div>
        </div>
      </Panel>
    </>
  );
}
