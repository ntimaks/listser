import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools, serverInstructions } from "@/lib/mcp/tools";
import { verifyToken } from "@/lib/supabase/token";

// Streamable HTTP MCP endpoint. Clients authenticate with an access token
// from Supabase's OAuth 2.1 server; an unauthenticated request gets a 401
// pointing at /.well-known/oauth-protected-resource to start the OAuth flow.
//
// Every request should answer in a few seconds. The cap stops any stream that
// is left open from billing a full 300s of function time.
export const maxDuration = 30;

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "listser", version: "0.1.0" },
  instructions: serverInstructions,
  // Refuse subscriptions/listen. It holds a POST open as an SSE stream for
  // change notifications, which we never send, so on serverless it only kept
  // functions running until they timed out and the client reconnected.
  maxSubscriptions: 0,
});

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
