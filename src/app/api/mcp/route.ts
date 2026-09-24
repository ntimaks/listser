import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools, serverInstructions } from "@/lib/mcp/tools";
import { verifyToken } from "@/lib/supabase/token";

// Streamable HTTP MCP endpoint. Clients authenticate with an access token
// from Supabase's OAuth 2.1 server; an unauthenticated request gets a 401
// pointing at /.well-known/oauth-protected-resource to start the OAuth flow.
const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "listser", version: "0.1.0" },
  instructions: serverInstructions,
});

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
