import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/server";

// Supabase client that acts as the holder of an OAuth access token (issued by
// Supabase's OAuth 2.1 server to an MCP client). The token is a regular user
// JWT, so every query runs through the same RLS policies as the web app.
export function createTokenClient(accessToken: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

export type TokenClient = ReturnType<typeof createTokenClient>;

// Verifies a bearer token for withMcpAuth. Returning undefined yields a 401
// with a WWW-Authenticate challenge that points the client at our protected
// resource metadata, which in turn points at Supabase Auth.
export async function verifyToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const supabase = createTokenClient(bearerToken);
  const { data, error } = await supabase.auth.getClaims(bearerToken);
  if (error || !data?.claims?.sub) return undefined;

  const claims = data.claims as typeof data.claims & {
    client_id?: string;
    scope?: string;
  };
  return {
    token: bearerToken,
    clientId: claims.client_id ?? "listser",
    scopes: claims.scope ? claims.scope.split(" ") : [],
    expiresAt: claims.exp,
    extra: { userId: claims.sub },
  };
}
