// Admin-only user management — Supabase Edge Function
// Actions:
//   create         { email, password, role, name?, customer_id?, overseas_agent_id? }
//   reset_password { user_id, new_password }
//
// Caller must be authenticated AND have role='admin' in user_profiles.
// The function uses SERVICE_ROLE for all admin auth operations.

// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ROLES = new Set([
  "admin", "operator", "sales", "finance",
  "customer", "supplier", "overseas_agent",
]);
const ROLES_REQUIRING_CUSTOMER = new Set(["customer", "supplier"]);
const ROLES_REQUIRING_OVERSEAS_AGENT = new Set(["overseas_agent"]);

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...cors, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, { status: 405 });

  const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Admin client (service role) — full power
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Verify caller is admin ───────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing auth token" }, { status: 401 });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "invalid token" }, { status: 401 });

  const callerId = userData.user.id;
  const { data: profile, error: profileErr } = await admin
    .from("user_profiles").select("role").eq("id", callerId).single();
  if (profileErr || profile?.role !== "admin") {
    return json({ error: "admin role required" }, { status: 403 });
  }

  // ── Parse body ───────────────────────────────────────────
  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: "invalid json" }, { status: 400 }); }

  const action = body?.action;
  try {
    switch (action) {
      case "create":         return await handleCreate(admin, body);
      case "reset_password": return await handleResetPassword(admin, body);
      default:               return json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("[admin-user-management]", err);
    return json({ error: err?.message || String(err) }, { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────
async function handleCreate(admin: any, body: any) {
  const { email, password, role, name, customer_id, overseas_agent_id } = body;
  if (!email || !password || !role) {
    return json({ error: "email, password, role are required" }, { status: 400 });
  }
  if (!ALLOWED_ROLES.has(role)) {
    return json({ error: `invalid role: ${role}` }, { status: 400 });
  }
  if (ROLES_REQUIRING_CUSTOMER.has(role) && !customer_id) {
    return json({ error: "customer_id is required for this role" }, { status: 400 });
  }
  if (ROLES_REQUIRING_OVERSEAS_AGENT.has(role) && !overseas_agent_id) {
    return json({ error: "overseas_agent_id is required for this role" }, { status: 400 });
  }

  // 1. Create auth user (auto-confirmed so they can log in immediately)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) return json({ error: createErr.message }, { status: 400 });

  const newId = created.user.id;

  // 2. Upsert user_profiles row
  const profileRow: any = { id: newId, role, name: name || null };
  if (ROLES_REQUIRING_CUSTOMER.has(role))         profileRow.customer_id        = customer_id;
  if (ROLES_REQUIRING_OVERSEAS_AGENT.has(role))   profileRow.overseas_agent_id  = overseas_agent_id;

  const { error: profileErr } = await admin.from("user_profiles").upsert(profileRow);
  if (profileErr) {
    // 回滚：删掉刚建的 auth 用户
    await admin.auth.admin.deleteUser(newId);
    return json({ error: "profile insert failed: " + profileErr.message }, { status: 500 });
  }

  return json({ ok: true, user_id: newId, email });
}

// ─────────────────────────────────────────────────────────────
async function handleResetPassword(admin: any, body: any) {
  const { user_id, new_password } = body;
  if (!user_id || !new_password) {
    return json({ error: "user_id and new_password are required" }, { status: 400 });
  }
  if (new_password.length < 6) {
    return json({ error: "password must be at least 6 chars" }, { status: 400 });
  }
  const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}
