// src/pages/Auth.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

function originUrl() {
  return window.location.origin; // e.g. http://localhost:5173
}
function redirectTo(next?: string) {
  const base = `${originUrl()}/auth`;
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"idle" | "exchanging" | "signed_in" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Default to HOME after auth (override by /auth?next=/somewhere)
  const next = useMemo(() => params.get("next") || "/", [params]);
  const navigatedRef = useRef(false);
  const goNext = (replace = true) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigate(next, { replace });
  };

  // 1) If we already have a session (hash-token flow or returning user), go Home.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setStatus("signed_in");
        goNext(true);
      }
    });

    // Also listen for SIGNED_IN events (covers popup/redirect flows)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setStatus("signed_in");
        goNext(true);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) PKCE code exchange if we came back with `?code=...`
  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get("code");
    if (!code) return;

    (async () => {
      try {
        setStatus("exchanging");
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) throw error;
        if (!data?.session) throw new Error("No session created");
        setStatus("signed_in");
        goNext(true);
      } catch (e: any) {
        setStatus("error");
        setErrorMsg(e?.message ?? "OAuth exchange failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(provider: "google" | "apple") {
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo(next), // returns to /auth (then we auto-redirect Home)
        // Helpful UX for Google
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
        scopes: provider === "apple" ? "name email" : undefined,
      },
    });
    if (error) setErrorMsg(error.message ?? "Failed to start sign-in");
  }

  return (
    <main className="max-w-md mx-auto p-4 space-y-4">
      {/* Header: red X back to Home */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="text-red-500 font-bold text-xl leading-none hover:opacity-80"
          title="Exit to Home"
        >
          X
        </Link>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <div className="w-4" aria-hidden />
      </div>

      <div className="card space-y-3">
        {status === "exchanging" && <div>Finishing sign-in…</div>}
        {status === "signed_in" && <div>Signed in ✓ Redirecting…</div>}

        {(status === "idle" || status === "error") && (
          <>
            <p className="text-sm opacity-80">Use one of the providers below. No password needed.</p>
            {errorMsg && <div className="text-sm text-red-300">{errorMsg}</div>}

            <div className="grid sm:grid-cols-2 gap-2">
              <button className="btn btn-accent w-full" onClick={() => signIn("google")}>
                Continue with Google
              </button>
              <button className="btn w-full" onClick={() => signIn("apple")}>
                Continue with Apple
              </button>
            </div>
          </>
        )}
      </div>

      <p className="text-xs opacity-70">
        After sign-in you’ll be sent to <code>{next}</code>.
      </p>
    </main>
  );
}
