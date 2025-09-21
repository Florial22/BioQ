// src/pages/Profile.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { avatarUrlFor } from "../constants/avatars";
import { Trophy } from "../components/Trophy";

type DBProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  wins_1st?: number | null;
  wins_2nd?: number | null;
  wins_3rd?: number | null;
};

function deviceId(): string {
  const existing = localStorage.getItem("device_id");
  if (existing) return existing;
  const id =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2));
  localStorage.setItem("device_id", id);
  return id;
}

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Player");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  // trophy counters from DB (finalized only)
  const [wins1, setWins1] = useState(0);
  const [wins2, setWins2] = useState(0);
  const [wins3, setWins3] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const user = (await supabase.auth.getUser()).data.user ?? null;

        if (!user) {
          // Guest view
          setUserId(null);
          setDisplayName("Guest");
          setAvatarUrl(avatarUrlFor(`d:${deviceId()}`));
          setWins1(0);
          setWins2(0);
          setWins3(0);
          return;
        }

        setUserId(user.id);

        // Only read counters that the weekly finalizer updates (no live guesses)
        const { data, error } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, wins_1st, wins_2nd, wins_3rd")
          .eq("id", user.id)
          .maybeSingle<DBProfile>();

        if (error) throw error;

        setDisplayName(data?.display_name || user.user_metadata?.full_name || "Player");
        setAvatarUrl(data?.avatar_url || avatarUrlFor(`u:${user.id}`));

        setWins1((data?.wins_1st ?? 0) | 0);
        setWins2((data?.wins_2nd ?? 0) | 0);
        setWins3((data?.wins_3rd ?? 0) | 0);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth?next=/profile`,
        queryParams: { prompt: "select_account" },
      },
    });
  }

  // Show “×N” when >1, blank when 1, and ×0 if 0 (but whole section is hidden when total is 0)
  const mult = (n: number) => (n === 0 ? "×0" : n === 1 ? "" : `×${n}`);
  const hasAnyTrophy = wins1 + wins2 + wins3 > 0;

  return (
    <main className="max-w-xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Profile</h1>
        <div className="w-4" aria-hidden />
      </div>

      <div className="card space-y-4">
        {loading ? (
          <div>Loading…</div>
        ) : (
          <>
            {/* Identity */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-white/20 overflow-hidden grid place-items-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div>G</div>
                )}
              </div>
              <div>
                <div className="text-sm opacity-70">
                  {userId ? "Signed in as" : "You are playing as"}
                </div>
                {/* Read-only username (muted) */}
                <div className="text-lg font-semibold opacity-90">{displayName}</div>
              </div>
            </div>

            {/* Trophies (show only if at least one) */}
            {hasAnyTrophy && (
              <section aria-label="Trophies" className="space-y-2">
                <h2 className="text-base font-semibold">Trophies</h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Winner */}
                  {wins1 >= 0 && (
                    <div className="rounded-2xl bg-white/8 border border-white/15 p-3 flex items-center gap-3">
                      <div className="shrink-0">
                        <Trophy rank={1} className="w-10 h-10" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <div className="font-semibold">Winner</div>
                          <div className="text-sm opacity-80">{mult(wins1)}</div>
                        </div>
                        <div className="text-sm opacity-80 truncate">Top of the podium</div>
                      </div>
                    </div>
                  )}

                  {/* Second */}
                  {wins2 >= 0 && (
                    <div className="rounded-2xl bg-white/8 border border-white/15 p-3 flex items-center gap-3">
                      <div className="shrink-0">
                        <Trophy rank={2} className="w-10 h-10" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <div className="font-semibold">Second place</div>
                          <div className="text-sm opacity-80">{mult(wins2)}</div>
                        </div>
                        <div className="text-sm opacity-80 truncate">Strong runner-up finishes</div>
                      </div>
                    </div>
                  )}

                  {/* Third */}
                  {wins3 >= 0 && (
                    <div className="rounded-2xl bg-white/8 border border-white/15 p-3 flex items-center gap-3">
                      <div className="shrink-0">
                        <Trophy rank={3} className="w-10 h-10" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <div className="font-semibold">Third place</div>
                          <div className="text-sm opacity-80">{mult(wins3)}</div>
                        </div>
                        <div className="text-sm opacity-80 truncate">Consistent podium results</div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {err && <div className="text-red-300 text-sm">{err}</div>}

            {/* Guest CTA */}
            {!userId && (
              <div className="space-y-2">
                <div className="text-sm opacity-80">
                  Sign in to save progress and earn weekly trophies.
                </div>
                <button className="btn btn-accent w-full" onClick={signIn}>
                  Continue with Google
                </button>
              </div>
            )}

            {/* Quick links */}
            <div className="pt-2 flex items-center gap-3">
              <Link to="/leaderboard" className="underline text-sm opacity-80">
                View Leaderboard
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
