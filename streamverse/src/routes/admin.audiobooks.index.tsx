import { createFileRoute } from "@tanstack/react-router";
import { AdminContentList } from "@/components/sv/AdminContent";

export const Route = createFileRoute("/admin/audiobooks/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s["q"] === "string" ? { q: s["q"] } : {}),
  component: () => {
    const { q } = Route.useSearch();
    return <AdminContentList type="Audiobook" q={q ?? ""} />;
  },
});
