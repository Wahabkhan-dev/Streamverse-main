import { createFileRoute } from "@tanstack/react-router";
import { AdminContentForm } from "@/components/sv/AdminContent";

export const Route = createFileRoute("/admin/ebooks/$slug/edit")({
  component: () => {
    const { slug } = Route.useParams();
    return <AdminContentForm type="eBook" slug={slug} />;
  },
});
