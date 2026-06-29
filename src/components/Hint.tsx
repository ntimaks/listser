import type { ReactNode } from "react";
import Pixl, { type PixlMotion } from "@/components/Pixl";

// A muted one-line feature hint led by PIXL — the brand mascot acts as the
// in-app guide. Same voice as the existing "// …" empty-state notes, but the
// resident stands in for the slashes. Several callers render these conditionally
// so short/empty lists stay uncluttered.
export default function Hint({
  children,
  motion = "idle",
  className = "",
}: {
  children: ReactNode;
  motion?: PixlMotion;
  className?: string;
}) {
  return (
    <p
      className={`t-small flex items-start gap-1.5 px-1 text-[var(--fg-muted)] ${className}`}
    >
      <Pixl motion={motion} size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
