import { createFileRoute } from "@tanstack/react-router";
import { AdminContentForm } from "@/components/sv/AdminContent";

export const Route = createFileRoute("/admin/movies/$slug/edit")({
  component: () => {
    const { slug } = Route.useParams();
    return <AdminContentForm type="Movie" slug={slug} />;
  },
});
