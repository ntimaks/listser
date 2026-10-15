// How household members show up: initials on a colored square. Members only
// have an email, so the name and initials come from its local part. The color
// is the one the member picked, or else one picked from the user id, so
// everyone sees the same one.

// Fixed accent hexes, not the theme vars: dark mode shifts some accents and
// the initials would lose contrast.
export const SWATCHES = {
  lime: { bg: "#d4e635", fg: "#0c0c0c", label: "Lime" },
  pink: { bg: "#ff4fa8", fg: "#0c0c0c", label: "Pink" },
  cobalt: { bg: "#1f47e6", fg: "#eeeeee", label: "Cobalt" },
  green: { bg: "#3db94a", fg: "#0c0c0c", label: "Green" },
  orange: { bg: "#ff7a1a", fg: "#0c0c0c", label: "Orange" },
  violet: { bg: "#7b4dff", fg: "#eeeeee", label: "Violet" },
  cyan: { bg: "#2ec4d6", fg: "#0c0c0c", label: "Cyan" },
  ink: { bg: "#0c0c0c", fg: "#eeeeee", label: "Ink" },
} as const;

export type AvatarColor = keyof typeof SWATCHES;

export const AVATAR_COLORS = Object.keys(SWATCHES) as AvatarColor[];

// The automatic colors, kept to the original four so nobody's default changes.
const AUTO_COLORS: AvatarColor[] = ["lime", "pink", "cobalt", "green"];

export function isAvatarColor(value: unknown): value is AvatarColor {
  return typeof value === "string" && value in SWATCHES;
}

export function autoAvatarColor(userId: string): AvatarColor {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO_COLORS[hash % AUTO_COLORS.length];
}

export function memberSwatch(userId: string, color?: string | null) {
  return SWATCHES[isAvatarColor(color) ? color : autoAvatarColor(userId)];
}

export function memberName(email: string): string {
  return email.split("@")[0] || email;
}

export function memberInitials(email: string): string {
  const parts = memberName(email).split(/[._\-+]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
