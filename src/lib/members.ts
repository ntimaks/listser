// How household members show up: initials on a colored square. Members only
// have an email, so the name and initials come from its local part, and the
// color is picked from the user id so everyone sees the same one.

// Fixed accent hexes, not the theme vars: dark mode shifts some accents and
// the initials would lose contrast.
const SWATCHES = [
  { bg: "#d4e635", fg: "#0c0c0c" },
  { bg: "#ff4fa8", fg: "#0c0c0c" },
  { bg: "#1f47e6", fg: "#eeeeee" },
  { bg: "#3db94a", fg: "#0c0c0c" },
] as const;

export function memberSwatch(userId: string) {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
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
