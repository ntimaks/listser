import {
  Bone,
  MemberRowSkeleton,
  PageSkeleton,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Menu" hasParent={false}>
      {/* You */}
      <div className="panel panel-stamp">
        <MemberRowSkeleton size={44} />
      </div>

      {/* Household */}
      <section className="panel">
        <div className="panel-head">
          <span>Household</span>
          <Bone className="h-2.5 w-16 skel-dim" />
        </div>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <Bone className="h-6 w-2/5" />
            <Bone className="h-11 w-24" />
          </div>
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex w-14 flex-col items-center gap-1">
                <Bone className="h-9 w-9" />
                <Bone className="h-2 w-10 skel-dim" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sections */}
      <div className="panel flex flex-col">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex min-h-[54px] items-center gap-3 border-b border-[var(--ink-5)] px-3 last:border-b-0"
          >
            <span className="flex flex-1 flex-col gap-1.5">
              <Bone className="h-3 w-28" />
              <Bone className="h-2.5 w-44 skel-dim" />
            </span>
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
