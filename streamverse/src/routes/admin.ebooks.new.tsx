import { createFileRoute } from "@tanstack/react-router";
import { AdminContentForm } from "@/components/sv/AdminContent";

export const Route = createFileRoute("/admin/ebooks/new")({
  validateSearch: (s: Record<string, unknown>): { draft?: string } => (typeof s["draft"] === "string" && s["draft"] ? { draft: s["draft"] } : {}),
  component: () => {
    const { draft } = Route.useSearch();
    return <AdminContentForm type="eBook" draft={draft} />;
  },
});
