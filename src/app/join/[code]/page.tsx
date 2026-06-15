import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { error } = await supabase.rpc("join_household", { p_code: code });

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <div className="panel panel-stamp w-full max-w-sm p-5 text-center">
          <span className="t-stamp text-[var(--term-red)]">[ERR]</span>
          <h1 className="t-h3 mt-3 uppercase">Invite didn&rsquo;t resolve</h1>
          <p className="t-small mt-2 text-[var(--fg-2)]">
            {"// "}ask for a fresh link, or check you copied the whole URL.
          </p>
        </div>
      </main>
    );
  }

  redirect("/");
}
