"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const callbackError = searchParams.get("error");
  const [error, setError] = useState<string | null>(callbackError);

  async function signInWithGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="w-full space-y-3">
      <button
        type="button"
        onClick={signInWithGoogle}
        className="btn btn-primary w-full"
      >
        Continue with Google
      </button>
      {error && (
        <p className="t-small text-[var(--term-red)]">→ {error}</p>
      )}
      <p className="t-meta text-center">
        {"// "}sign in with your Google account.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="t-h1">LISTSER</h1>
        <p className="t-meta mt-2">{"// one shared list. nothing forgotten."}</p>
      </div>
      <div className="w-full max-w-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
