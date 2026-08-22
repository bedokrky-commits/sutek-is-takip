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
    if (!caller || caller.role !== "admin" || !caller.is_active) return json({ error: "Yönetici yetkisi gerekli." }, 403);
    const body = await req.json();
    const action = String(body.action || "create");

    if (action === "delete") {
      const userId = String(body.user_id || "");
      if (!userId) return json({ error: "Kullanıcı seçilmedi." }, 400);
      if (userId === userData.user.id) return json({ error: "Kendi yönetici hesabınızı silemezsiniz." }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "update") {
      const userId = String(body.user_id || "");
      const fullName = String(body.full_name || "").trim();
      const role = ["admin","office","service"].includes(body.role) ? body.role : "office";
      const isActive = Boolean(body.is_active);
      if (userId === userData.user.id && !isActive) return json({ error: "Kendi hesabınızı pasif yapamazsınız." }, 400);
      const { error: pErr } = await adminClient.from("profiles").update({ full_name: fullName, role, is_active: isActive }).eq("id", userId);
      if (pErr) throw pErr;
      const { error: aErr } = await adminClient.auth.admin.updateUserById(userId, { app_metadata: { role }, user_metadata: { full_name: fullName } });
      if (aErr) throw aErr;
      return json({ ok: true });
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const role = ["admin","office","service"].includes(body.role) ? body.role : "office";
    if (!email || !fullName || password.length < 6) return json({ error: "Ad soyad, e-posta ve en az 6 karakter şifre gerekli." }, 400);

    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const existing = listData.users.find(u => u.email?.toLowerCase() === email);
    if (existing) {
      const { error: uErr } = await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: { role } });
      if (uErr) throw uErr;
      const { error: pErr } = await adminClient.from("profiles").upsert({ id: existing.id, email, full_name: fullName, role, is_active: true });
      if (pErr) throw pErr;
      return json({ ok: true, user_id: existing.id, updated_existing: true });
    }

    const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName }, app_metadata: { role } });
    if (error) throw error;
    const { error: pErr } = await adminClient.from("profiles").upsert({ id: data.user.id, email, full_name: fullName, role, is_active: true });
    if (pErr) throw pErr;
    return json({ ok: true, user_id: data.user.id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Beklenmeyen hata" }, 400);
  }
});
