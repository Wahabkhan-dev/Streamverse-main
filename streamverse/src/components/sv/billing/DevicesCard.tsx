import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/api/client";
import { devicesApi } from "@/api/devices.api";
import { Btn, ConfirmDialog, Panel, PanelHeader, Skel } from "@/components/sv/ui";
import { forgetDeviceRegistration, thisDeviceId } from "@/lib/device";

const DEVICES_KEY = ["me", "devices"] as const;

const seen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { dateStyle: "medium" });
};

/**
 * The devices the customer has used, against what their plan allows. Removing one frees a place, so someone who is told
 * "your plan allows 2 devices and both are in use" can act on it here.
 */
export function DevicesCard({ maxDevices, planName }: { maxDevices: number | null | undefined; planName?: string | undefined }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: DEVICES_KEY, queryFn: async () => (await devicesApi.list()).data, staleTime: 30_000 });
  const [removing, setRemoving] = useState<{ id: string; name: string; isThis: boolean } | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => devicesApi.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: DEVICES_KEY });
      toast.success("Device removed. That place is free again.");
    },
    onError: (err: unknown) => toast.error(isApiError(err) ? err.message : "We couldn't remove that device. Please try again."),
  });

  const devices = list.data ?? [];
  const mine = thisDeviceId();
  const limited = typeof maxDevices === "number";
  const full = limited && devices.length >= maxDevices;

  return (
    <Panel className="mt-6">
      <PanelHeader title="Your devices" />
      <div className="space-y-3 p-5 text-sm">
        <p className="text-muted-foreground">
          {limited
            ? `${planName ? `Your ${planName} plan` : "Your plan"} allows ${maxDevices} ${maxDevices === 1 ? "device" : "devices"}. ${devices.length} in use.${full ? " To use another device, remove one you no longer use, or upgrade your plan." : ""}`
            : "Your plan has no limit on the number of devices."}
        </p>
        {list.isLoading ? (
          <Skel className="h-12 w-full" />
        ) : list.isError ? (
          <p role="alert" className="text-red-400">
            We couldn't load your devices. Please refresh the page.
          </p>
        ) : devices.length === 0 ? (
          <p className="text-muted-foreground">No devices yet. This one is added the first time you watch, read or listen.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {devices.map((d) => {
              const isThis = d.deviceIdentifier === mine;
              const name = d.deviceName || "Unknown device";
              return (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {name}
                      {isThis && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary">This device</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">Last used {seen(d.lastSeenAt)}</span>
                  </span>
                  <Btn variant="danger" disabled={remove.isPending} onClick={() => setRemoving({ id: d.id, name, isThis })}>
                    Remove
                  </Btn>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? "this device"}?`}
        description={removing?.isThis ? "This is the device you're using now. It will be added again the next time you watch, read or listen, if a place is free." : "It will be signed out of playing on your account. You can add it again later if a place is free."}
        confirmLabel="Remove device"
        onConfirm={() => {
          if (!removing) return;
          if (removing.isThis) forgetDeviceRegistration();
          remove.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </Panel>
  );
}
