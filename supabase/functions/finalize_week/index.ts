import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Env (set via `supabase secrets set ...`)
const url = Deno.env.get("PROJECT_URL")!;
const serviceKey = Deno.env.get("SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || ""; // optional

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, x-cron-secret, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Optional shared-secret check (only enforced if CRON_SECRET is set)
    if (CRON_SECRET) {
      const reqSecret = req.headers.get("x-cron-secret");
      if (reqSecret !== CRON_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
          status: 403,
          headers: corsHeaders,
        });
      }
    }

    const { searchParams } = new URL(req.url);
    const weekId = searchParams.get("week_id");

    if (weekId) {
      // Manual / targeted finalize of a specific ISO week (e.g., 2025-W39)
      const { error } = await admin.rpc("finalize_week", { p_week_id: weekId });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, mode: "specific_week", week_id: weekId }), {
        headers: corsHeaders,
      });
    }

    // Default/scheduled: finalize the week that just ended (America/Toronto handled in SQL)
    const { error } = await admin.rpc("finalize_last_week");
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, mode: "last_week" }), {
      headers: corsHeaders,
    });
  } catch (e) {
    const msg = (e as any)?.message ?? String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
