import { PageSkeleton, SectionSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Integrations">
      <SectionSkeleton lines={3} />
      <SectionSkeleton lines={3} />
    </PageSkeleton>
  );
}
