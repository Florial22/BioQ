import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { avatarUrlFor } from "../constants/avatars";


type DBAttempt = {
  user_id: string | null;
  device_id: string | null;
  points: number;
  total_ms: number;
};

type DBProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type RowEntry = {
  key: string;            // "u:<uuid>" or "d:<deviceId>"
  userId?: string | null;
  deviceId?: string | null;
  name: string;           // final display name ("You" | profile | fallback)
  avatarUrl?: string | null;
  points: number;         // weekly total
  totalMs: number;        // weekly total time
};

function formatMMSS(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span title="Gold" aria-label="gold">🥇</span>;
  if (rank === 2) return <span title="Silver" aria-label="silver">🥈</span>;
  if (rank === 3) return <span title="Bronze" aria-label="bronze">🥉</span>;
  return null;
}

// initials from a name or key
function initials(src: string) {
  const words = src.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0][0].toUpperCase();
  const tail = src.slice(-2).toUpperCase();
  return (tail[0] ?? "X") + (tail[1] ?? "Y");
}

function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}
function weekIdFor(d = new Date()) {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function deviceId(): string {
  const existing = localStorage.getItem("device_id");
  if (existing) return existing;
  const newId =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2));
  localStorage.setItem("device_id", newId);
  return newId;
}

function Avatar({ name, url, fallbackKey }: { name: string; url?: string | null; fallbackKey: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-white/20 overflow-hidden grid place-items-center text-sm font-semibold">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{initials(name || fallbackKey)}</span>
      )}
    </div>
  );
}

function Row({ rank, entry, isMe }: { rank: number; entry: RowEntry; isMe: boolean }) {
  return (
    <div
      className={[
        "py-2 px-3 flex items-center gap-3 border-t border-white/10 rounded-2xl",
        isMe ? "bg-white/10 ring-2 ring-brand-accent/60" : "",
      ].join(" ")}
    >
      {/* Position + medal */}
      <div className="w-10 flex items-center gap-1 justify-end tabular-nums">
        <span>{rank}</span>
        <Medal rank={rank} />
      </div>

      {/* Avatar */}
      <Avatar name={entry.name} url={entry.avatarUrl} fallbackKey={entry.key} />

      {/* Name */}
      <div className="flex-1 truncate">{entry.name}</div>

      {/* Points */}
      <div className="w-16 text-right font-medium tabular-nums">{entry.points}</div>

      {/* Time */}
      <div className="w-16 text-right opacity-80 tabular-nums">{formatMMSS(entry.totalMs)}</div>
    </div>
  );
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [meKey, setMeKey] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // who am I?
        let uid: string | null = null;
        try {
          uid = (await supabase.auth.getUser()).data.user?.id ?? null;
        } catch {}
        const myKey = uid ? `u:${uid}` : `d:${deviceId()}`;
        setMeKey(myKey);

        // fetch current week attempts
        const { data, error } = await supabase
          .from("weekly_attempts")
          .select("user_id,device_id,points,total_ms")
          .eq("week_id", weekIdFor());

        if (error) throw error;

        // aggregate by identity (prefer user_id, else device_id)
        const agg = new Map<string, RowEntry>();
        (data as DBAttempt[]).forEach((a) => {
          const key = a.user_id ? `u:${a.user_id}` : `d:${a.device_id ?? "anon"}`;
          const prev = agg.get(key);
          const nextPoints = (prev?.points ?? 0) + (a.points ?? 0);
          const nextTime = (prev?.totalMs ?? 0) + (a.total_ms ?? 0);
          agg.set(key, {
            key,
            userId: a.user_id ?? undefined,
            deviceId: a.device_id ?? undefined,
            name: key === myKey ? "You" : `Player · ${key.slice(-4)}`,
            avatarUrl: null,
            points: nextPoints,
            totalMs: nextTime,
          });
        });

        // fetch profiles for user-backed rows
        const userIds = Array.from(agg.values())
          .map((r) => r.userId)
          .filter((v): v is string => !!v);
        const uniqUserIds = Array.from(new Set(userIds));

        let profileMap = new Map<string, DBProfile>();
        if (uniqUserIds.length > 0) {
          const { data: profiles, error: perr } = await supabase
            .from("profiles")
            .select("id,display_name,avatar_url")
            .in("id", uniqUserIds);
          if (perr) throw perr;
          (profiles as DBProfile[]).forEach((p) => profileMap.set(p.id, p));
        }

       // apply profile names/avatars + fallback computed avatar
        const withProfiles: RowEntry[] = Array.from(agg.values()).map((r) => {
        // identity used to compute stable avatar
        const identity = r.userId ? `u:${r.userId}` : `d:${r.deviceId ?? "anon"}`;
        const computed = avatarUrlFor(identity);

        if (r.userId && profileMap.has(r.userId)) {
            const p = profileMap.get(r.userId)!;
            const isMe = `u:${r.userId}` === myKey;
            return {
            ...r,
            name: isMe ? "You" : (p.display_name || "Player"),
            avatarUrl: (p.avatar_url ?? undefined) || computed, // prefer profile, else computed
            };
        }

        // device-only rows (no profile): use computed avatar & keep fallback name
        return {
            ...r,
            avatarUrl: r.avatarUrl ?? computed,
        };
        });

        // final sort & set
        withProfiles.sort((a, b) => b.points - a.points || a.totalMs - b.totalMs);
        setRows(withProfiles);


        setRows(withProfiles);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const top10 = useMemo(() => rows.slice(0, 10), [rows]);
  const myIndex = rows.findIndex((r) => r.key === meKey);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const meEntry = myIndex >= 0 ? rows[myIndex] : null;
  const meInTop10 = myIndex >= 0 && myIndex < 10;

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Header with*/}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Weekly Leaderboard</h1>
        <div className="w-4" aria-hidden />
      </div>

      {loading && <div className="card">Loading…</div>}
      {!loading && err && <div className="card text-red-300">Error: {err}</div>}

      {!loading && !err && (
        <>
          <div className="card">
            {/* header row */}
            <div className="px-3 pb-2 flex items-center gap-3 text-sm opacity-70">
              <div className="w-10 text-right">#</div>
              <div className="w-9" aria-hidden />
              <div className="flex-1">Player</div>
              <div className="w-16 text-right">Points</div>
              <div className="w-16 text-right">Time</div>
            </div>

            {/* top 10 */}
            {top10.length === 0 && (
              <div className="px-3 py-4 opacity-80 text-sm">No entries yet this week.</div>
            )}
            {top10.map((e, i) => (
              <Row key={e.key} rank={i + 1} entry={e} isMe={e.key === meKey} />
            ))}
          </div>

          {/* your row if outside top 10 */}
          {!meInTop10 && meEntry && myRank && (
            <div className="card">
              <div className="px-3 pb-2 text-sm opacity-70">Your position</div>
              <Row rank={myRank} entry={meEntry} isMe />
            </div>
          )}

          <p className="text-xs opacity-70">
            Tie-breaker: among equal points, the fastest total time wins. Top 3 earn badges.
          </p>
        </>
      )}
    </main>
  );
}
