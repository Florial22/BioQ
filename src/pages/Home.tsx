// src/pages/Home.tsx
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Cat = { id: string; name: string; emoji: string };

const CATEGORIES: Cat[] = [
  { id: "cell",       name: "Cell Biology",   emoji: "🧫" },
  { id: "genetics",   name: "Genetics",       emoji: "🧬" },
  { id: "anatomy",    name: "Anatomy",        emoji: "🦴" },
  { id: "physiology", name: "Physiology",     emoji: "🫀" },
  { id: "microbio",   name: "Microbiology",   emoji: "🦠" },
  { id: "biochem",    name: "Biochemistry",   emoji: "⚗️" },
];

// Reuse the same local-date key the quiz uses
function localDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Lightweight countdown to next local midnight
function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0); // start of tomorrow local time
  return Math.max(0, next.getTime() - now.getTime());
}
function fmtHHMMSS(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// (optional) device id, useful if you later want to check Supabase for today's attempt by device
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

export default function Home() {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  // Detect if user is signed in
  useEffect(() => {
    let sub: ReturnType<typeof supabase.auth.onAuthStateChange>["data"]["subscription"] | null = null;

    supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user?.id ?? null);
    });
    const res = supabase.auth.onAuthStateChange((_e, s) => {
      setSessionUserId(s?.user?.id ?? null);
    });
    sub = res.data.subscription;
    return () => sub?.unsubscribe();
  }, []);

  // Played-today (local first)
  const [playedToday, setPlayedToday] = useState<boolean>(() => {
    return localStorage.getItem(`weekly:played:${localDateKey()}`) === "1";
  });

  // Optional: confirm with Supabase once (useful if switching devices/browsers)
  useEffect(() => {
    (async () => {
      if (playedToday) return; // already known locally
      const today = localDateKey();
      try {
        const userId = sessionUserId;
        const devId = deviceId();
        // Find any attempt for today by this user or device
        const { data, error } = await supabase
          .from("weekly_attempts")
          .select("id")
          .eq("day_date", today)
          .or(`user_id.eq.${userId ?? "null"},device_id.eq.${devId}`)
          .limit(1);
        if (!error && data && data.length > 0) {
          localStorage.setItem(`weekly:played:${today}`, "1");
          setPlayedToday(true);
        }
      } catch {
        // ignore network errors; local flag still works
      }
    })();
  }, [playedToday, sessionUserId]);

  // Countdown only when you've already played (no perf hit otherwise)
  const [remainMs, setRemainMs] = useState(() => (playedToday ? msUntilNextMidnight() : 0));
  useEffect(() => {
    if (!playedToday) {
      setRemainMs(0);
      return;
    }
    let raf: number;
    let lastTick = 0;
    const tick = (t: number) => {
      // update roughly once per second using rAF (smoother & light)
      if (t - lastTick > 950) {
        lastTick = t;
        const ms = msUntilNextMidnight();
        setRemainMs(ms);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playedToday]);

  const canPlayWeekly = Boolean(sessionUserId) && !playedToday;

  const weeklyLabel = useMemo(() => {
    if (!sessionUserId) return "Weekly Challenge";
    if (!playedToday) return "Weekly Challenge";
    return `Played today — back in ${fmtHHMMSS(remainMs)}`;
  }, [sessionUserId, playedToday, remainMs]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      {/* Weekly block */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Weekly</h2>
          {/* View leaderboard button (centered elsewhere too) */}
          <Link to="/leaderboard" className="btn">
            View Leaderboard
          </Link>
        </div>

        <div className="flex items-center justify-center">
          {canPlayWeekly ? (
            <Link to="/weekly" className="btn btn-accent text-base">
              Weekly Challenge
            </Link>
          ) : (
            <button
              className="btn text-base opacity-70 cursor-not-allowed"
              aria-disabled="true"
              title={weeklyLabel}
            >
              {weeklyLabel}
            </button>
          )}
        </div>
      </section>

      {/* Choose a category */}
      <section className="space-y-3">
        <h3 className="text-sm opacity-80">Choose a category</h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-3">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              to={`/setup?category=${encodeURIComponent(c.id)}`}
              className="card flex flex-col items-center justify-center py-4"
            >
              <div className="text-3xl leading-none mb-2">{c.emoji}</div>
              <div className="text-sm font-medium text-center">{c.name}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick Play */}
      <section className="card space-y-3">
        <h3 className="text-lg font-semibold">Quick Play</h3>
        <p className="text-sm opacity-80">
          20 questions mixed across all categories and difficulties.
        </p>
        <div>
          <Link to="/quiz?n=20" className="btn btn-accent">
            Start Quick Play
          </Link>
        </div>
      </section>

      {/* Centered Leaderboard button (mobile friendly) */}
      <div className="flex justify-center">
        <Link to="/leaderboard" className="btn">
          View Leaderboard
        </Link>
      </div>
    </main>
  );
}
