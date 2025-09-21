import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Supabase env vars missing. Check .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
}

export const supabase = createClient(url!, anon!);
