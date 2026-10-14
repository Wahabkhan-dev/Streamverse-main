import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminSidebar, AdminTopbar } from "@/components/sv/admin";
import { Logo } from "@/components/sv/Logo";
import { StateScreen } from "@/components/sv/states";
import { Btn } from "@/components/sv/ui";
import { DEMO_MODE } from "@/lib/demo";
import { setRole, useRole, useUserHydrated } from "@/lib/user";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin console — StreamVerse" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

/**
 * The admin area is for the ADMIN role only. In this frontend phase the role is a local demo value;
 * real sign-in and server-side checks come with the backend.
 */
function AdminDenied() {
  return (
    <div className="min-h-screen bg-background">
      <header className="px-4 py-4 md:px-8">
        <Logo />
      </header>
      <StateScreen
        icon={ShieldAlert}
        tone="amber"
        title="Admin access required"
        message="This area is for StreamVerse administrators. Sign in with an admin account to manage content."
        actions={
          <>
            <Link to="/" className="inline-flex h-10 items-center rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">
              Back to StreamVerse
            </Link>
            {DEMO_MODE && (
              <Btn
                variant="primary"
                onClick={() => {
                  setRole("admin");
                  toast("Demo: now viewing as an admin");
                }}
              >
                Switch to demo admin
              </Btn>
            )}
          </>
        }
      />
    </div>
  );
}

function AdminLayout() {
  const [open, setOpen] = useState(false);
  const role = useRole();
  const hydrated = useUserHydrated();
  // wait for the saved role so an admin never sees a flash of "access required"
  if (!hydrated) return <div className="min-h-screen bg-background" aria-busy="true" />;
  if (role !== "admin") return <AdminDenied />;
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-w-0 flex-1">
        <AdminTopbar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
