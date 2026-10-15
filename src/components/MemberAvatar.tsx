import { memberInitials, memberSwatch } from "@/lib/members";

// A household member's initials on their color. Square, 1px ink border.
export default function MemberAvatar({
  userId,
  email,
  color,
  size = 28,
  className = "",
}: {
  userId: string;
  email: string;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const { bg, fg } = memberSwatch(userId, color);
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center border border-[var(--ink-0)] font-bold ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
    >
      {memberInitials(email)}
    </span>
  );
}
