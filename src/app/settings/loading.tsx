import {
  PageSkeleton,
  ReminderFormSkeleton,
  SectionSkeleton,
} from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton title="Settings">
      <SectionSkeleton lines={1} />
      <section className="panel">
        <div className="panel-head">
          <span>Reminders</span>
          <span>[REM]</span>
        </div>
        <div className="p-3">
          <ReminderFormSkeleton />
        </div>
      </section>
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
    </PageSkeleton>
  );
}
