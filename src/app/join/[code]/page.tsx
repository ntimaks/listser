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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-2xl">🤔</p>
        <h1 className="text-lg font-semibold">That invite link didn’t work</h1>
        <p className="text-sm text-neutral-500">
          Ask for a fresh link, or check that you copied the whole URL.
        </p>
      </main>
    );
  }

  redirect("/");
}
