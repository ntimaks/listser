import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The MCP endpoint and OAuth metadata use Bearer tokens, not session
  // cookies, and must answer with their own 401s rather than a login redirect.
  if (pathname.startsWith("/api/mcp") || pathname.startsWith("/.well-known/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session; do not run other logic between client creation and
  // getUser(), per @supabase/ssr guidance.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Keep the query string so e.g. /oauth/consent?authorization_id=… survives
    // the sign-in round-trip.
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
