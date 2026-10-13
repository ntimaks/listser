import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = { id: string; email: string };

// The signed-in user, from the session JWT. getClaims checks the token's
// signature against the project's published signing keys (cached after the
// first fetch), so this costs no Auth-server round-trip, unlike getUser().
// Returns null when there is no valid session.
export async function getAuthUser(
  supabase: SupabaseClient
): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return { id: data.claims.sub, email: data.claims.email ?? "" };
}
