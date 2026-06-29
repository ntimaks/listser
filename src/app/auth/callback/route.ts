import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the Google OAuth PKCE redirect (?code=) by exchanging the code for a
// session, then forwarding to the originally requested page.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/";
  const code = searchParams.get("code");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=Could not sign you in. Try again.`
  );
}
