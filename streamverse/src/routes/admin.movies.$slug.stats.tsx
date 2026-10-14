import { createFileRoute } from "@tanstack/react-router";
import { TitleStats } from "@/components/sv/TitleStats";

export const Route = createFileRoute("/admin/movies/$slug/stats")({
  component: () => {
    const { slug } = Route.useParams();
    return <TitleStats type="Movie" slug={slug} />;
  },
});
