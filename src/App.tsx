import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "./lib/supabase";
import { avatarUrlFor } from "./constants/avatars";

import TopBar from "./components/TopBar";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Quiz from "./pages/Quiz";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Leaderboard from "./pages/Leaderboard";
import Weekly from "./pages/Weekly";

async function ensureProfile(user: any) {
  // don’t overwrite an existing avatar
  const { data: existing } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const avatar_url = existing?.avatar_url ?? avatarUrlFor(`u:${user.id}`);
  const display_name = user.user_metadata?.full_name ?? "Player";

  await supabase.from("profiles").upsert({ id: user.id, display_name, avatar_url });
}

// Inner app lives *inside* the router so hooks like useNavigate work
function AppInner() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          try {
            await ensureProfile(session.user);
            navigate("/", { replace: true }); // go Home after login
          } catch (e) {
            console.error("ensureProfile failed", e);
          }
        }
      }
    );
    return () => subscription?.unsubscribe();
  }, [navigate]);

  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/weekly" element={<Weekly />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
