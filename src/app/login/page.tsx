"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const callbackError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(callbackError);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

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

  if (status === "sent") {
    return (
      <div className="panel panel-stamp p-5 text-center">
        <span className="t-stamp text-[var(--cobalt)]">[SENT]</span>
        <h2 className="t-h3 mt-3 uppercase">Check your email</h2>
        <p className="t-small mt-2 text-[var(--fg-2)]">
          sign-in link sent to{" "}
          <span className="text-[var(--fg)]">{email}</span> — open it on this
          device.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={sendMagicLink} className="w-full space-y-3">
      <label className="t-meta block">
        Email <span className="text-[var(--fg-disabled)]">[REQ]</span>
      </label>
      <input
        type="email"
        required
        autoFocus
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="field"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="btn btn-primary w-full"
      >
        {status === "sending" ? "SENDING…" : "[SEND LINK]"}
      </button>
      {error && (
        <p className="t-small text-[var(--term-red)]">→ {error}</p>
      )}
      <p className="t-meta text-center">
        {"// "}no password — we email you a sign-in link.
      </p>
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-[var(--ink-5)]" />
        <span className="t-meta">{"//"}</span>
        <span className="h-px flex-1 bg-[var(--ink-5)]" />
      </div>
      <button
        type="button"
        onClick={signInWithGoogle}
        className="btn w-full"
      >
        Continue with Google
      </button>
    </form>
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
