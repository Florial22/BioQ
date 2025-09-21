import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

export default function Weekly() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    (async () => {
      const user = (await supabase.auth.getUser()).data.user ?? null;
      setUserId(user?.id ?? null);

      if (!user?.id) {
        setChecking(false);
        return; // gating: not signed in, we won't check server
      }

      // server check: has this user played today?
      try {
        const today = localDateKey();
        const { count, error } = await supabase
          .from("weekly_attempts")
          .select("id", { count: "exact", head: true })
          .eq("day_date", today)
          .eq("user_id", user.id);
        if (!error && (count ?? 0) > 0) setPlayed(true);
      } catch {}
      setChecking(false);
    })();
  }, []);

  const startToday = () => {
    if (played || checking || !userId) return;
    navigate("/quiz?mode=weekly&n=15&t=12");
  };

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth?next=/weekly`, queryParams: { prompt: "select_account" } },
    });
  };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Header */}
      {/* <div className="flex items-center justify-between">
        <Link to="/" className="text-red-500 font-bold text-xl leading-none hover:opacity-80" title="Exit to Home">X</Link>
        <div className="w-4" aria-hidden />
      </div> */}

      <div className="card space-y-4">
        <h1 className="text-xl font-semibold text-center">Weekly Challenge</h1>

        {!userId ? (
          <>
            <p className="text-sm opacity-80 text-center">Sign in to play the Weekly Challenge.</p>
            <button className="btn btn-accent w-full" onClick={signIn}>Continue with Google</button>
            <Link to="/leaderboard" className="text-sm underline opacity-80 text-center block">View Leaderboard</Link>
          </>
        ) : (
          <>
            <ul className="text-sm opacity-90 list-disc pl-5 space-y-1">
              <li>15 questions per day</li>
              <li>12 seconds per question</li>
              <li>1 point per correct answer</li>
            </ul>

            <button
              className="btn btn-accent w-full"
              onClick={startToday}
              disabled={played || checking}
              title={checking ? "Checking…" : played ? "You already played today" : "Start"}
            >
              {checking ? "Checking…" : played ? "Already played today" : "Start Today’s Challenge"}
            </button>

            <Link to="/leaderboard" className="text-sm underline opacity-80 text-center block">
              View Leaderboard
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
