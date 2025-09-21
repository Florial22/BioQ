// src/pages/Quiz.tsx
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { supabase } from "../lib/supabase";
import { Flag } from "lucide-react";

type Question = {
  id: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

type Status = "unanswered" | "correct" | "wrong" | "penalized";

type WeeklySession = {
  date: string;
  weekId: string;
  qIds: string[];
  qIndex: number;
  statuses: Status[];
  timesMs: number[];
  score: number;
  seed: string;
  tPerQ: number;
};

const DIFF_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

// --- helpers ---------------------------------------------------------
function hash(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 0x100000000;
  };
}
function seededShuffle<T>(arr: T[], seedStr: string) {
  const rnd = prng(hash(seedStr));
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function localDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function weekIdFor(d = new Date()) {
  const { year, week } = isoWeek(d);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function deviceId(): string {
  const existing = localStorage.getItem("device_id");
  if (existing !== null) return existing;
  const id =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : Math.random().toString(36).slice(2));
  localStorage.setItem("device_id", id);
  return id;
}
function makeNormalSeed() {
  try {
    const u = new Uint32Array(1);
    (crypto as any)?.getRandomValues?.(u);
    return `NORMAL-${u[0]}`;
  } catch {
    return `NORMAL-${Date.now()}`;
  }
}
const sessionKey = () => `weekly:session:${localDateKey()}`;

// Finish messages
const MESSAGES = {
  perfect: [
    "Perfect! You nailed them all!",
    "Flawless run — amazing!",
    "Aced it from start to finish!",
    "Perfection unlocked. Bravo!",
    "Absolute mastery — 100%!"
  ],
  near: [
    "So close to perfect — great job!",
    "Excellent work — just a hair off!",
    "Almost flawless. Impressive!",
    "You’re right there — superb!",
    "Fantastic score — nearly perfect!"
  ],
  low: [
    "Keep playing — you’ll get better in no time!",
    "Great start — every try builds skill!",
    "Don’t stop now. Progress comes fast!",
    "You’ve got this — try again and level up!",
    "Learning in progress — keep it up!"
  ],
  default: [
    "Nice work — keep the streak going!",
    "Solid score — on to the next!",
    "Good job! Want to try another?",
    "Well done — practice makes perfect!",
    "Strong effort — play again?"
  ],
};
function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

// --------------------------------------------------------------------

export default function Quiz() {
  const [params] = useSearchParams();
  const isWeekly = params.get("mode") === "weekly";
  const category = params.get("category") ?? "";
  const difficulty = (params.get("difficulty") ?? "easy") as keyof typeof DIFF_LABELS;

  const n = Math.max(1, Number(params.get("n") ?? (isWeekly ? 15 : 10)));
  const total = Math.max(5, Math.min(120, Number(params.get("t") ?? (isWeekly ? 12 : 20)))); // sec/question

  const [normalSeed, setNormalSeed] = useState<string>(() => makeNormalSeed());

  // Smooth timer
  const [nowTs, setNowTs] = useState(() => Date.now());
  const expiredRef = useRef(false);

  // One-time guard for perfect-score sound
  const perfectPlayedRef = useRef(false);

  // --- load bank -----------------------------------------------------
  const [bank, setBank] = useState<Question[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/questions.json")
      .then((r) => r.json())
      .then((data: Question[]) => { if (alive) setBank(data); })
      .catch((e) => { if (alive) { setLoadErr("Could not load questions.json"); console.error(e); }});
    return () => { alive = false; };
  }, []);

  // Load any in-progress weekly session for today
  const [resume, setResume] = useState<WeeklySession | null>(null);
  useEffect(() => {
    if (!isWeekly || !bank) return;
    try {
      const raw = localStorage.getItem(sessionKey());
      if (!raw) { setResume(null); return; }
      const s = JSON.parse(raw) as WeeklySession;
      if (s.date !== localDateKey() || s.weekId !== weekIdFor()) {
        localStorage.removeItem(sessionKey());
        setResume(null);
      } else {
        setResume(s);
      }
    } catch { setResume(null); }
  }, [isWeekly, bank]);

  // --- pick questions (respect resume) -------------------------------
  const questions = useMemo<Question[]>(() => {
    if (!bank) return [];

    if (isWeekly) {
      // Resume path: rebuild list from saved qIds
      if (resume?.qIds?.length) {
        const byId = new Map(bank.map(q => [q.id, q]));
        const list = resume.qIds.map((id) => byId.get(id)).filter(Boolean) as Question[];
        return list;
      }

      // New weekly pick (80% hard, 20% medium)
      const dateKey = localDateKey();
      const target = Math.min(n, bank.length);
      const hardAll = bank.filter(q => q.difficulty === "hard");
      const medAll  = bank.filter(q => q.difficulty === "medium");
      const others  = bank.filter(q => q.difficulty !== "hard" && q.difficulty !== "medium");
      const needHard = Math.round(target * 0.8);
      const needMed  = target - needHard;
      const hardPick = seededShuffle(hardAll, `WEEKLY-HARD-${dateKey}`).slice(0, needHard);
      const medPick  = seededShuffle(medAll,  `WEEKLY-MED-${dateKey}`).slice(0, needMed);
      let picks = [...hardPick, ...medPick];
      if (picks.length < target) {
        const taken = new Set(picks.map(q => q.id));
        const pool = [
          ...seededShuffle(hardAll, `WEEKLY-HARD-FILL-${dateKey}`),
          ...seededShuffle(medAll,  `WEEKLY-MED-FILL-${dateKey}`),
          ...seededShuffle(others,  `WEEKLY-REST-${dateKey}`)
        ].filter(q => !taken.has(q.id));
        picks = picks.concat(pool.slice(0, target - picks.length));
      }
      return seededShuffle(picks, `WEEKLY-FINAL-${dateKey}`);
    }

    // Normal quiz: filter then shuffle
    let filtered = bank;
    if (category)   filtered = filtered.filter(q => q.category === category);
    if (difficulty) filtered = filtered.filter(q => q.difficulty === difficulty);
    return seededShuffle(filtered, normalSeed).slice(0, Math.min(n, filtered.length));
  }, [bank, isWeekly, category, difficulty, n, normalSeed, resume]);

  // --- state ---------------------------------------------------------
  const [qIndex, setQIndex] = useState(0);
  const q = questions[qIndex];

  const [running, setRunning] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [lockedFor, setLockedFor] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const [timesMs, setTimesMs] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());

  // --- saving UI (weekly) -------------------------------------------
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- report state (unchanged) -------------------------------------
  const [showReport, setShowReport] = useState(false);
  const [reportOther, setReportOther] = useState("");
  const [reportIssues, setReportIssues] = useState({
    incorrect_answer: false,
    incorrect_question: false,
    ambiguous: false,
    typo: false,
    offensive: false,
    other: false,
  });
  const [sendingReport, setSendingReport] = useState(false);
  const [showThanks, setShowThanks] = useState(false);

  // Dim-page scroll lock for report popover
  useEffect(() => {
    document.body.style.overflow = showReport ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showReport]);

  // --- refs for safe cleanup on leave --------------------------------
  const isWeeklyRef   = useRef(isWeekly);
  const finishedRef   = useRef(finished);
  const lockedRef     = useRef(locked);
  const runningRef    = useRef(running);
  const qIndexRef     = useRef(qIndex);
  const timesMsRef    = useRef<number[]>([]);
  const statusesRef   = useRef<Status[]>([]);
  const scoreRef      = useRef(score);
  const totalRef      = useRef(total);
  const questionsRef  = useRef<Question[]>([]);
  useEffect(() => { isWeeklyRef.current = isWeekly; }, [isWeekly]);
  useEffect(() => { finishedRef.current = finished; }, [finished]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { qIndexRef.current = qIndex; }, [qIndex]);
  useEffect(() => { timesMsRef.current = timesMs; }, [timesMs]);
  useEffect(() => { statusesRef.current = statuses; }, [statuses]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { totalRef.current = total; }, [total]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  // --- initialize run / resume --------------------------------------
  useEffect(() => {
    if (!questions.length) return;

    if (isWeekly && resume && resume.qIds.length === questions.length) {
      // RESUME
      setQIndex(Math.min(resume.qIndex, questions.length - 1));
      setTimesMs(resume.timesMs.slice(0, questions.length));
      setStatuses(resume.statuses.slice(0, questions.length));
      setScore(resume.score);
      setRunning(true);
      setSelected(null);
      setLocked(false);
      setLockedFor(null);
      setFinished(false);
      setStartedAt(Date.now());
      setNowTs(Date.now());
      perfectPlayedRef.current = false;
      return;
    }

    // FRESH RUN
    setQIndex(0);
    setRunning(true);
    setSelected(null);
    setLocked(false);
    setLockedFor(null);
    setScore(0);
    setFinished(false);
    setTimesMs(Array(questions.length).fill(0));
    setStatuses(Array(questions.length).fill("unanswered"));
    setStartedAt(Date.now());
    setNowTs(Date.now());
    perfectPlayedRef.current = false;

    // Seed/save a new weekly session
    if (isWeekly) {
      const sess: WeeklySession = {
        date: localDateKey(),
        weekId: weekIdFor(),
        qIds: questions.map(q => q.id),
        qIndex: 0,
        statuses: Array(questions.length).fill("unanswered"),
        timesMs: Array(questions.length).fill(0),
        score: 0,
        seed: "WEEKLY-" + localDateKey(),
        tPerQ: total,
      };
      try { localStorage.setItem(sessionKey(), JSON.stringify(sess)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, total]);

  // --- per-question reset on index change ----------------------------
  useEffect(() => {
    setRunning(true);
    setSelected(null);
    setLocked(false);
    setLockedFor(null);
    setStartedAt(Date.now());
    setNowTs(Date.now());
    setShowReport(false);
  }, [qIndex, total]);

  // --- smooth timer ---------------------------------------------------
  useEffect(() => {
    expiredRef.current = false;
    if (!running || locked) return;

    let raf = 0;
    const loop = () => {
      const t = Date.now();
      setNowTs(t);

      const endsAt = startedAt + total * 1000;
      if (!expiredRef.current && t >= endsAt) {
        expiredRef.current = true;
        setRunning(false);
        setLocked(true);
        setLockedFor(qIndex);
        setTimesMs(prev => {
          const arr = [...prev];
          arr[qIndex] = total * 1000;
          return arr;
        });
        setStatuses(prev => {
          const arr = [...prev];
          if (arr[qIndex] === "unanswered") arr[qIndex] = "wrong";
          // Save session snapshot (time-up)
          saveWeeklySnapshot({ timesMs: { [qIndex]: total * 1000 }, statuses: { [qIndex]: "wrong" } });
          return arr;
        });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, locked, qIndex, total, startedAt]);

  // --- choose / next --------------------------------------------------
  function choose(idx: number) {
    if (locked || !q) return;
    setSelected(idx);
    setLocked(true);
    setLockedFor(qIndex);
    setRunning(false);

    const used = Math.min(total * 1000, Date.now() - startedAt);

    setTimesMs(prev => {
      const arr = [...prev];
      arr[qIndex] = used;
      return arr;
    });

    setStatuses(prev => {
      const arr = [...prev];
      const correct = idx === q.correctIndex;
      arr[qIndex] = correct ? "correct" : "wrong";
      return arr;
    });

    if (idx === q.correctIndex) {
      setScore(s => s + 1);
      // Save snapshot (+1 score)
      saveWeeklySnapshot({
        timesMs: { [qIndex]: used },
        statuses: { [qIndex]: "correct" },
        scoreDelta: 1,
      });
    } else {
      saveWeeklySnapshot({
        timesMs: { [qIndex]: used },
        statuses: { [qIndex]: "wrong" },
      });
    }
  }

  function next() {
    if (qIndex < questions.length - 1) {
      setQIndex(i => {
        const ni = i + 1;
        // Persist new index in session
        saveWeeklySnapshot({ qIndex: ni });
        return ni;
      });
    } else {
      setFinished(true);
      setRunning(false);
    }
  }

  function playAgain() {
    setNormalSeed(makeNormalSeed());
  }

  // --- weekly save helpers -------------------------------------------
  function readSessionSafe(): WeeklySession | null {
    try {
      const raw = localStorage.getItem(sessionKey());
      if (!raw) return null;
      return JSON.parse(raw) as WeeklySession;
    } catch { return null; }
  }

  function saveWeeklySnapshot(opts: {
    qIndex?: number;
    timesMs?: Record<number, number>;
    statuses?: Record<number, Status>;
    scoreDelta?: number;
  } = {}) {
    if (!isWeekly) return;
    // Merge with current refs (latest state)
    const s = readSessionSafe() ?? {
      date: localDateKey(),
      weekId: weekIdFor(),
      qIds: questionsRef.current.map(q => q.id),
      qIndex: qIndexRef.current,
      statuses: statusesRef.current.slice(),
      timesMs: timesMsRef.current.slice(),
      score: scoreRef.current,
      seed: "WEEKLY-" + localDateKey(),
      tPerQ: totalRef.current,
    } as WeeklySession;

    if (opts.qIndex !== undefined) s.qIndex = opts.qIndex;
    if (opts.scoreDelta) s.score += opts.scoreDelta;

    if (opts.timesMs) {
      s.timesMs = s.timesMs.slice();
      for (const [k, v] of Object.entries(opts.timesMs)) s.timesMs[Number(k)] = v;
    }
    if (opts.statuses) {
      s.statuses = s.statuses.slice();
      for (const [k, v] of Object.entries(opts.statuses)) s.statuses[Number(k)] = v;
    }

    try { localStorage.setItem(sessionKey(), JSON.stringify(s)); } catch {}
  }

  // Penalize current question if leaving mid-question (wrong + full time)
  function finalizeOnLeave() {
    if (!isWeeklyRef.current) return;
    if (finishedRef.current) return;

    const i = qIndexRef.current;
    const isMid = runningRef.current && !lockedRef.current && i < (questionsRef.current.length || 0);
    const tPerQ = totalRef.current;

    if (isMid) {
      // mark penalized and advance index
      const sess = readSessionSafe() ?? {
        date: localDateKey(),
        weekId: weekIdFor(),
        qIds: questionsRef.current.map(q => q.id),
        qIndex: i,
        statuses: Array(questionsRef.current.length).fill("unanswered") as Status[],
        timesMs: Array(questionsRef.current.length).fill(0),
        score: scoreRef.current,
        seed: "WEEKLY-" + localDateKey(),
        tPerQ,
      } as WeeklySession;

      const nextI = Math.min(i + 1, (questionsRef.current.length || 1) - 1);

      const statusesCopy = sess.statuses.slice();
      statusesCopy[i] = "penalized";

      const timesCopy = sess.timesMs.slice();
      timesCopy[i] = tPerQ * 1000;

      const updated: WeeklySession = {
        ...sess,
        qIndex: nextI,
        statuses: statusesCopy,
        timesMs: timesCopy,
      };

      try { localStorage.setItem(sessionKey(), JSON.stringify(updated)); } catch {}
    } else {
      // Save a plain snapshot (answered/locked or waiting Next)
      saveWeeklySnapshot();
    }
  }

  // Hook up finalize on page hide/unmount
  useEffect(() => {
    const onBeforeUnload = () => finalizeOnLeave();
    const onVisibility = () => { if (document.visibilityState === "hidden") finalizeOnLeave(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      // also finalize when component unmounts (route change)
      finalizeOnLeave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- finish / save to DB / clear session ---------------------------
  useEffect(() => {
    if (!finished) return;

    const totalQ = questions.length || 1;
    const pct = (score / totalQ) * 100;

    if (pct === 100 && !perfectPlayedRef.current) {
      perfectPlayedRef.current = true;
      try {
        confetti({ particleCount: 140, spread: 70, origin: { y: 0.65 } });
        setTimeout(() => confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } }), 150);
        setTimeout(() => confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } }), 300);
      } catch {}
      try {
        const audio = new Audio("/win.mp3");
        audio.volume = 0.8;
        audio.play().catch(() => {});
      } catch {}
    }

    if (isWeekly) {
      try {
        localStorage.removeItem(sessionKey());               // clear in-progress
        localStorage.setItem(`weekly:played:${localDateKey()}`, "1"); // mark played today
      } catch {}
      const totalMs = timesMs.reduce((a, b) => a + b, 0);
      void saveWeeklyAttempt(totalMs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  async function saveWeeklyAttempt(totalMs: number) {
    if (!isWeekly || saving || saved) return;
    setSaving(true); setSaveError(null);
    try {
      let user_id: string | null = null;
      try { user_id = (await supabase.auth.getUser()).data.user?.id ?? null; } catch {}
      const { error } = await supabase.from("weekly_attempts").insert({
        day_date: localDateKey(),
        week_id: weekIdFor(),
        points: score,
        total_ms: totalMs,
        question_count: questions.length,
        t_per_q: total,
        device_id: deviceId(),
        user_id
      });
      if (error) {
        if ((error as any).code === "23505" || /one_per_day/i.test(error.message)) setSaved(true);
        else throw error;
      } else setSaved(true);
    } catch (e: any) {
      setSaveError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // --- report submit --------------------------------------------------
  const hasAnyIssue =
    Object.values(reportIssues).some(Boolean) || reportOther.trim().length > 0;

  async function sendReport() {
    if (!q || !hasAnyIssue) return;
    setSendingReport(true);
    try {
      const payload = {
        question_id: q.id,
        category: q.category,
        difficulty: q.difficulty,
        selected,
        correct_index: q.correctIndex,
        issues: reportIssues,
        other: reportOther.trim() || null,
        mode: isWeekly ? "weekly" : "normal",
        created_at: new Date().toISOString(),
        device_id: deviceId(),
      };
      try { await supabase.from("question_reports").insert(payload as any); } catch {}
      setShowReport(false);
      setReportOther("");
      setReportIssues({ incorrect_answer:false, incorrect_question:false, ambiguous:false, typo:false, offensive:false, other:false });
      setShowThanks(true);
      setTimeout(() => setShowThanks(false), 1200);
    } finally {
      setSendingReport(false);
    }
  }

  // --- UI helpers -----------------------------------------------------
  const endsAt = startedAt + total * 1000;
  const remainingMs = Math.max(0, endsAt - nowTs);
  const remainingLabel = Math.ceil(remainingMs / 1000);
  const pctTime = Math.max(0, Math.min(100, (remainingMs / (total * 1000)) * 100));
  const letter = (i: number) => String.fromCharCode(65 + i);

  const isThisLocked = locked && lockedFor === qIndex;
  function optionClass(idx: number) {
    if (!isThisLocked) return `option ${selected === idx ? "option-selected" : ""}`;
    const isCorrect = idx === q.correctIndex;
    const isChosenWrong = selected === idx && idx !== q.correctIndex;
    if (isCorrect) return "option bg-brand-accent text-black border-transparent";
    if (isChosenWrong) return "option bg-red-600 text-white border-red-400";
    return "option opacity-70";
  }
  function formatMMSS(ms: number) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // allow Quick Play (just need a question)
  const valid = !!q;

  if (loadErr) {
    return (
      <main className="max-w-5xl mx-auto p-4">
        <div className="card text-center space-y-2">
          <h2 className="text-xl font-semibold">Load error</h2>
          <p className="opacity-80">{loadErr}</p>
          <Link to="/" className="btn bg-red-600 text-white">Home</Link>
        </div>
      </main>
    );
  }
  if (!bank) {
    return (
      <main className="max-w-5xl mx-auto p-4">
        <div className="card text-center">Loading questions…</div>
      </main>
    );
  }
  if (!questions.length || !q || !valid) {
    return (
      <main className="max-w-5xl mx-auto p-4">
        <div className="card text-center space-y-2">
          <h2 className="text-xl font-semibold">No questions available</h2>
          <p className="opacity-80">Check filters or add more items to <code>public/questions.json</code>.</p>
          <Link to="/" className="btn bg-red-600 text-white">Home</Link>
        </div>
      </main>
    );
  }

  const showTimesUp = isThisLocked && selected === null;
  const totalMs = timesMs.reduce((a, b) => a + b, 0);

  // --- finish screen --------------------------------------------------
  if (finished) {
    const totalQ = questions.length;
    const pctScore = (score / totalQ) * 100;
    const tier =
      pctScore === 100 ? "perfect" :
      pctScore >= 90 ? "near" :
      pctScore <= 20 ? "low" :
      "default";
    const line = pick(MESSAGES[tier as keyof typeof MESSAGES]);

    return (
      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="card space-y-4 text-center">
          <h2 className="text-xl font-semibold whitespace-pre-line">{line}</h2>
          <div className="opacity-80">
            Score: <b>{score}</b> / <b>{totalQ}</b>
            <span className="mx-2">•</span>
            Total time: <b>{formatMMSS(totalMs)}</b>
          </div>

          {isWeekly && (
            <div className="text-sm opacity-80">
              {saving && <span>Saving result…</span>}
              {!saving && saved && <span className="text-green-300">Saved ✓</span>}
              {!saving && saveError && (
                <span className="text-red-300">
                  Couldn’t save: {saveError}{" "}
                  <button className="underline" onClick={() => saveWeeklyAttempt(totalMs)}>Retry</button>
                </span>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-center">
            {!isWeekly && <button className="btn btn-accent" onClick={playAgain}>Play again</button>}
            <Link to="/" className="btn bg-red-600 text-white">Home</Link>
          </div>
        </div>
      </main>
    );
  }

  // --- running UI -----------------------------------------------------
  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      {showReport && (
        <button
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          onClick={() => setShowReport(false)}
          aria-label="Close report overlay"
        />
      )}

      <div className="card space-y-4 relative z-50">
        {/* Header: question count */}
        <div className="flex items-center justify-between text-sm opacity-80">
          <span>Question {qIndex + 1} / {questions.length}</span>
          <span className="sr-only">Quiz progress</span>
        </div>

        {/* Timer */}
        <section aria-label="Per-question timer" className="space-y-2">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-2 bg-brand-accent rounded-full" style={{ width: `${pctTime}%` }} aria-hidden />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="opacity-80">Time remaining</span>
            <span className="font-semibold" aria-live="polite">{Math.max(0, remainingLabel)}s</span>
          </div>
          {showTimesUp && <p className="text-amber-300 text-sm">Time’s up.</p>}
        </section>

        {/* Prompt */}
        <h2 className="text-lg font-semibold">{q.prompt}</h2>

        {/* Options */}
        <div className="grid gap-2">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              className={optionClass(idx)}
              onClick={() => choose(idx)}
              disabled={isThisLocked}
            >
              <span className="opacity-80 mr-2">{letter(idx)}.</span> {opt}
            </button>
          ))}
        </div>

        {/* Feedback */}
        {isThisLocked && (
          <section className="space-y-2 pt-1 text-sm">
            {selected === q.correctIndex && <div className="text-green-300 font-medium">Correct ✓</div>}
            {selected !== null && selected !== q.correctIndex && <div className="text-red-300 font-medium">Incorrect ✕</div>}
            {showTimesUp && <div className="text-amber-300 font-medium">Time’s up</div>}
            <div className="opacity-90">Correct answer: <b>{q.options[q.correctIndex]}</b></div>
            {q.explanation && <p className="opacity-80">{q.explanation}</p>}
          </section>
        )}

        {/* Next + Flag */}
        <div className="pt-2 flex items-center justify-between">
          <button className="btn btn-accent" onClick={next} disabled={!isThisLocked}>
            {qIndex === questions.length - 1 ? "Finish" : "Next"}
          </button>

          {isThisLocked && (
            <div className="relative">
              <button
                className="p-2 rounded-xl hover:bg-white/10 active:scale-95 transition"
                onClick={() => setShowReport(s => !s)}
                aria-haspopup="dialog"
                aria-expanded={showReport}
                title="Report an issue"
              >
                <Flag className="w-5 h-5" />
              </button>

              {showThanks && (
                <div className="absolute right-0 -top-8 bg-white/15 text-white text-xs rounded-full px-2 py-1 shadow">
                  Thanks for sending!
                </div>
              )}

              {showReport && (
                <div className="absolute right-0 bottom-12 z-50 w-72 max-w-[80vw] rounded-2xl bg-brand-card border border-white/15 shadow-xl p-3 space-y-2">
                  <div className="font-semibold text-sm">Report this question</div>

                  <div className="grid gap-1 text-sm">
                    {[
                      ["incorrect_answer", "Incorrect answer key"],
                      ["incorrect_question", "Incorrect/invalid question"],
                      ["ambiguous", "Ambiguous wording"],
                      ["typo", "Typos/formatting"],
                      ["offensive", "Offensive/inappropriate"],
                      ["other", "Other"],
                    ].map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={(reportIssues as any)[key]}
                          onChange={(e) => setReportIssues(r => ({ ...r, [key]: e.target.checked } as any))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <textarea
                    className="w-full mt-1 rounded-2xl bg-white/10 border border-white/15 px-3 py-2 text-sm"
                    placeholder="Add details (optional)…"
                    rows={3}
                    value={reportOther}
                    onChange={(e) => setReportOther(e.target.value)}
                  />

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button className="btn" onClick={() => setShowReport(false)} disabled={sendingReport}>Cancel</button>
                    <button className="btn btn-accent" onClick={sendReport} disabled={!hasAnyIssue || sendingReport}>
                      {sendingReport ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
