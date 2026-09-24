"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Records the user's decision on an OAuth request (from an MCP client such as
// Claude) and sends the browser back to the client with a code or an error.
export async function decideAuthorization(formData: FormData) {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!authorizationId) throw new Error("missing authorization_id");

  const supabase = await createClient();
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId);
  if (error) throw new Error(error.message);

  redirect(data.redirect_url);
}
