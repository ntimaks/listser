import {
  Bone,
  MemberRowSkeleton,
  PageSkeleton,
  SectionSkeleton,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Household">
      <section className="panel">
        <div className="panel-head">
          <Bone className="h-2.5 w-24" />
          <Bone className="h-2.5 w-16 skel-dim" />
        </div>
        <div className="flex flex-col">
          {[0, 1, 2].map((i) => (
            <MemberRowSkeleton key={i} />
          ))}
        </div>
      </section>
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
    </PageSkeleton>
  );
}
