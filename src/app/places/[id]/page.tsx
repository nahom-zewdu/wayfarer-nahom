import { Suspense } from "react";
import PlaceDetail from "./place-detail";

interface PlacePageProps {
  params: Promise<{ id: string }>;
}

async function PlacePageContent({ params }: PlacePageProps) {
  const { id } = await params;
  return <PlaceDetail key={id} placeId={id} />;
}

export default function PlacePage(props: PlacePageProps) {
  return (
    <Suspense
      fallback={
        <div className="page-wrap" role="status">
          Loading place…
        </div>
      }
    >
      <PlacePageContent {...props} />
    </Suspense>
  );
}
