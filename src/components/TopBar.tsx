import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { avatarUrlFor } from "../constants/avatars";
import { ChevronLeft } from "lucide-react";

type DBProfile = { display_name: string | null; avatar_url: string | null };

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const user = (await supabase.auth.getUser()).data.user ?? null;
        if (!user) return setDisplayName(null), setAvatarUrl(null);
        const { data } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle<DBProfile>();
        setDisplayName(data?.display_name || user.user_metadata?.full_name || "Player");
        setAvatarUrl(data?.avatar_url || avatarUrlFor(`u:${user.id}`));
      } catch {
        setDisplayName(null);
        setAvatarUrl(null);
      }
    })();
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

        {/* Right: Profile entry only on Home */}
        {onHome ? (
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
        ) : (
          <div className="w-8 h-8" aria-hidden />
        )}
      </header>
    </div>
  );
}
