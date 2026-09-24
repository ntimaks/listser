import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { decideAuthorization } from "./actions";

// Supabase's OAuth 2.1 server sends users here (Authentication -> OAuth Server
// -> authorization path) when an MCP client asks for access to their lists.
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) return <ConsentError message="missing authorization_id." />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`
    );
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return <ConsentError message={error?.message ?? "request not found."} />;
  }
  // Already consented earlier: Supabase hands back the redirect straight away.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const scopes = details.scope?.trim() ? details.scope.trim().split(/\s+/) : [];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="panel panel-stamp w-full max-w-sm space-y-4 p-5">
        <span className="t-stamp text-[var(--vermillion)]">[AUTH]</span>
        <h1 className="t-h3 uppercase">Connect {details.client.name}?</h1>
        <p className="t-small text-[var(--fg-2)]">
          {"// "}it will be able to read and change your households, lists,
          items and templates as {details.user.email || user.email}.
        </p>
        <dl className="t-meta space-y-1 break-all">
          <div>
            <dt className="inline">redirect → </dt>
            <dd className="inline">{details.redirect_uri}</dd>
          </div>
          {scopes.length > 0 && (
            <div>
              <dt className="inline">scopes → </dt>
              <dd className="inline">{scopes.join(", ")}</dd>
            </div>
          )}
        </dl>
        <form action={decideAuthorization} className="flex gap-3">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button type="submit" name="decision" value="deny" className="btn flex-1">
            [DENY]
          </button>
          <button
            type="submit"
            name="decision"
            value="approve"
            className="btn btn-primary flex-1"
          >
            [ALLOW]
          </button>
        </form>
      </div>
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="panel panel-stamp w-full max-w-sm p-5 text-center">
        <span className="t-stamp text-[var(--term-red)]">[ERR]</span>
        <h1 className="t-h3 mt-3 uppercase">Can&rsquo;t authorize</h1>
        <p className="t-small mt-2 text-[var(--fg-2)]">
          {"// "}
          {message} start the connection again from your assistant.
        </p>
      </div>
    </main>
  );
}
