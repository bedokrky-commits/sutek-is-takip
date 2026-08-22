import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Oturum bulunamadı" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(url, service);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Geçersiz oturum" }, 401);
    const { data: caller } = await adminClient.from("profiles").select("role,is_active").eq("id", userData.user.id).single();
    if (!caller || !caller.is_active || !["admin","office"].includes(caller.role)) return json({ error: "İşi yalnızca Ofis veya Yönetici silebilir." }, 403);
    const body = await req.json();
    const jobId = String(body.job_id || "");
    if (!jobId) return json({ error: "İş seçilmedi." }, 400);
    const { data: job } = await adminClient.from("jobs").select("id,customer_name").eq("id", jobId).single();
    if (!job) return json({ error: "İş bulunamadı." }, 404);
    const { error } = await adminClient.from("jobs").delete().eq("id", jobId);
    if (error) throw error;
    return json({ ok: true, customer_name: job.customer_name });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Beklenmeyen hata" }, 400);
  }
});
