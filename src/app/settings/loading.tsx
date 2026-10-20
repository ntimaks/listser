import { PageSkeleton, SectionSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Settings">
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
    </PageSkeleton>
  );
}
