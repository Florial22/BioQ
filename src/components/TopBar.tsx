import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { avatarUrlFor } from "../constants/avatars";
import { ChevronLeft, Flame, Snowflake } from "lucide-react";

type DBProfile = {
  display_name: string | null;
  avatar_url: string | null;
  streak_count?: number | null;
  freeze_count?: number | null;
};

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [freezes, setFreezes] = useState<number>(0);

  async function loadProfileBits() {
    try {
      const user = (await supabase.auth.getUser()).data.user ?? null;
      if (!user) {
        setDisplayName(null);
        setAvatarUrl(null);
        setStreak(0);
        setFreezes(0);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, streak_count, freeze_count")
        .eq("id", user.id)
        .maybeSingle<DBProfile>();

      setDisplayName(data?.display_name || user.user_metadata?.full_name || "Player");
      setAvatarUrl(data?.avatar_url || avatarUrlFor(`u:${user.id}`));
      setStreak((data?.streak_count ?? 0) | 0);
      setFreezes((data?.freeze_count ?? 0) | 0);
    } catch {
      setDisplayName(null);
      setAvatarUrl(null);
      setStreak(0);
      setFreezes(0);
    }
  }

  useEffect(() => {
    loadProfileBits();
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadProfileBits());
    const onRefresh = () => loadProfileBits();
    window.addEventListener("profile:refresh", onRefresh);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("profile:refresh", onRefresh);
    };
    // re-fetch when route changes (simple trigger)
  }, [pathname]);

  const onHome = pathname === "/";
  const showBack = !onHome;

  return (
    <div className="sticky top-0 z-50 bg-brand-accent/30 backdrop-blur border-b border-white/10">
      <header className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Left: Back (except on Home) + Brand */}
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              aria-label="Back"
              className="p-1.5 rounded-xl hover:bg-white/10 active:scale-95 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <Link to="/" className="text-lg font-semibold leading-none">BioQ</Link>
        </div>

        {/* Right: Streak + Profile entry (Home only, by earlier design) */}
        {onHome ? (
          <div className="flex items-center gap-3">
            {/* Streak */}
            <div className="flex items-center gap-1">
              <Flame
                className={`w-5 h-5 ${streak > 0 ? "text-brand-accent drop-shadow-[0_0_8px_rgba(255,86,48,0.6)]" : "text-white/40"}`}
                fill={streak > 0 ? "currentColor" : "none"}
                stroke="currentColor"
              />
              <span className="text-sm tabular-nums">{streak}</span>
            </div>
            {/* Freezes */}
            <div className="flex items-center gap-1">
              <Snowflake className="w-4 h-4 text-white/70" />
              <span className="text-xs tabular-nums">×{freezes}</span>
            </div>

            <Link
              to="/profile"
              className="flex items-center gap-2 hover:bg-white/5 rounded-2xl px-2 py-1 transition"
              title="Open Profile"
            >
              <div className="w-8 h-8 rounded-full bg-white/15 ring-1 ring-white/10 grid place-items-center overflow-hidden">
                {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="font-semibold">G</span>}
              </div>
              <span className="text-sm opacity-80 hidden sm:block">
                {displayName ? `Hi, ${displayName.split(" ")[0]}` : "Guest"}
              </span>
            </Link>
          </div>
        ) : (
          <div className="w-8 h-8" aria-hidden />
        )}
      </header>
    </div>
  );
}
