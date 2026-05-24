// 账号管理 — 仅 admin 可见
// 列表 RPC: admin_list_users()
// 写操作: Edge Function admin-user-management (create / reset_password)
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const SUPABASE_URL = "https://pewdvheoaqofmzwhwwvu.supabase.co";

function getRoleOptions() {
  return [
    { value: "admin",          label: t("Admin") },
    { value: "operator",       label: t("Operator") },
    { value: "sales",          label: t("Sales") },
    { value: "finance",        label: t("Finance") },
    { value: "customer",       label: t("Customer (buyer)") },
    { value: "supplier",       label: t("Supplier (factory)") },
    { value: "overseas_agent", label: t("Overseas Agent") },
  ];
}
const roleLabel = (val) => getRoleOptions().find(o => o.value === val)?.label || val;

const NEEDS_CUSTOMER       = new Set(["customer", "supplier"]);
const NEEDS_OVERSEAS_AGENT = new Set(["overseas_agent"]);

// ── 调 Edge Function ───────────────────────────────────────
async function callEdge(payload) {
  const url = `${SUPABASE_URL}/functions/v1/admin-user-management`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabase.auth.getToken()}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ============================================================
export default function AccountManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterRole, setFilterRole] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [resetFor, setResetFor] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) setError(error.message);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filterRole && r.role !== filterRole) return false;
      if (!kw) return true;
      return (r.email || "").toLowerCase().includes(kw)
          || (r.name  || "").toLowerCase().includes(kw)
          || (r.customer_name || "").toLowerCase().includes(kw)
          || (r.overseas_agent_name || "").toLowerCase().includes(kw);
    });
  }, [rows, filterRole, search]);

  return (
    <>
      <h1 className="page-title">{t("Accounts")}</h1>

      {error && (
        <div className="page-card" style={{
          marginBottom: 14, background: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b",
        }}>
          {t("Account loading failed")}：{error}
          <div style={{ marginTop: 6, fontSize: 12 }}>
            {t("Common reasons: admin_list_users RPC missing, or current account is not admin")}
          </div>
        </div>
      )}

      <div className="page-section-bar">
        <select className="field-select" value={filterRole} style={{ width: 160 }}
                onChange={e => setFilterRole(e.target.value)}>
          <option value="">{t("All roles")}</option>
          {getRoleOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input className="field-input" placeholder={t("Search email / name / customer...")}
               value={search} onChange={e => setSearch(e.target.value)}
               style={{ flex: 1, maxWidth: 260 }} />
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>{filtered.length} {t("of")} {rows.length} {t("items")}</span>
        <button className="btn primary" onClick={() => setShowNew(true)}>{t("+ New Account")}</button>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : filtered.length === 0 ? <div className="empty-state empty-text">{t("No matching accounts")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Email")}</th>
                <th>{t("Role")}</th>
                <th>{t("Binding")}</th>
                <th>{t("Last Login")}</th>
                <th>{t("Created at")}</th>
                <th style={{ width: 90 }}>{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.name || <span className="muted">{t("Unfilled")}</span>}</td>
                  <td>{r.email}</td>
                  <td><span className="badge info">{roleLabel(r.role)}</span></td>
                  <td>{r.customer_name || r.overseas_agent_name || <span className="muted">—</span>}</td>
                  <td>{r.last_sign_in_at ? r.last_sign_in_at.slice(0, 16).replace("T", " ") : <span className="muted">{t("Never")}</span>}</td>
                  <td>{r.created_at ? r.created_at.slice(0, 10) : "—"}</td>
                  <td>
                    <button className="btn" style={{ padding: "2px 10px", fontSize: 12 }}
                            onClick={() => setResetFor(r)}>{t("Reset Pw")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewAccountModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
    </>
  );
}

// ============================================================
function NewAccountModal({ onClose, onDone }) {
  const [form, setForm] = useState({
    email: "", password: "", role: "supplier", name: "",
    customer_id: "", overseas_agent_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // 拉客户/海外代理列表（按需）
  const [customers, setCustomers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [cusSearch, setCusSearch] = useState("");

  useEffect(() => {
    (async () => {
      if (NEEDS_CUSTOMER.has(form.role) && customers.length === 0) {
        const { data } = await supabase.from("customers").select("id,name").order("name");
        setCustomers(data || []);
      }
      if (NEEDS_OVERSEAS_AGENT.has(form.role) && agents.length === 0) {
        const { data } = await supabase.from("overseas_agents").select("id,name").order("name");
        setAgents(data || []);
      }
    })();
  }, [form.role]);

  const filteredCus = useMemo(() => {
    const kw = cusSearch.trim().toLowerCase();
    if (!kw) return customers.slice(0, 200);
    return customers.filter(c => (c.name || "").toLowerCase().includes(kw)).slice(0, 200);
  }, [customers, cusSearch]);

  const ch = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.email || !form.password || !form.role) {
      return setMsg({ type: "error", text: t("Email/password/role required") });
    }
    if (NEEDS_CUSTOMER.has(form.role) && !form.customer_id) {
      return setMsg({ type: "error", text: t("Please select bound customer") });
    }
    if (NEEDS_OVERSEAS_AGENT.has(form.role) && !form.overseas_agent_id) {
      return setMsg({ type: "error", text: t("Please select bound overseas agent") });
    }
    setSaving(true); setMsg(null);
    try {
      await callEdge({
        action: "create",
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        name: form.name || null,
        customer_id:       NEEDS_CUSTOMER.has(form.role)       ? form.customer_id       : undefined,
        overseas_agent_id: NEEDS_OVERSEAS_AGENT.has(form.role) ? form.overseas_agent_id : undefined,
      });
      onDone();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setSaving(false); }
  };

  return (
    <Modal title={t("New Account")} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose} disabled={saving}>{t("Cancel")}</button>
        <button className="btn primary" onClick={submit} disabled={saving}>
          {saving ? t("Submitting...") : t("Create")}
        </button>
      </>
    }>
      {msg && (
        <div style={{
          padding: 8, marginBottom: 12, borderRadius: 4,
          background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
          color:      msg.type === "error" ? "#991b1b" : "#166534",
          fontSize: 13,
        }}>{msg.text}</div>
      )}

      <div className="field-row">
        <Field label={t("Role")} req>
          <select className="field-select" value={form.role} onChange={ch("role")}>
            {getRoleOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label={t("Name")}>
          <input className="field-input" value={form.name} onChange={ch("name")}
                 placeholder={t("Display name (optional)")} />
        </Field>
        <Field label={t("Email")} req>
          <input className="field-input" type="email" value={form.email} onChange={ch("email")}
                 placeholder="user@example.com" />
        </Field>
        <Field label={t("Initial Password")} req>
          <input className="field-input" type="text" value={form.password} onChange={ch("password")}
                 placeholder={t("At least 6 chars")} />
        </Field>
      </div>

      {NEEDS_CUSTOMER.has(form.role) && (
        <>
          <Field label={t("Bind Customer")} req>
            <input className="field-input" placeholder={t("Search customer name...")} value={cusSearch}
                   onChange={e => setCusSearch(e.target.value)} style={{ marginBottom: 6 }} />
            <select className="field-select" value={form.customer_id} onChange={ch("customer_id")} size={6}
                    style={{ height: "auto" }}>
              <option value="">{t("Please select...")}</option>
              {filteredCus.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginTop: 4 }}>
              {t("Showing top 200; type to filter")}
            </div>
          </Field>
        </>
      )}

      {NEEDS_OVERSEAS_AGENT.has(form.role) && (
        <Field label={t("Bind Overseas Agent")} req>
          <select className="field-select" value={form.overseas_agent_id} onChange={ch("overseas_agent_id")}>
            <option value="">{t("Please select...")}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      )}
    </Modal>
  );
}

// ============================================================
function ResetPasswordModal({ user, onClose }) {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async () => {
    if (pw.length < 6) return setMsg({ type: "error", text: t("Password must be at least 6 chars") });
    setSaving(true); setMsg(null);
    try {
      await callEdge({ action: "reset_password", user_id: user.id, new_password: pw });
      setMsg({ type: "success", text: t("Password reset") });
      setTimeout(onClose, 1000);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally { setSaving(false); }
  };

  return (
    <Modal title={`${t("Reset Password")}: ${user.email}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose} disabled={saving}>{t("Cancel")}</button>
        <button className="btn primary" onClick={submit} disabled={saving}>
          {saving ? t("Submitting...") : t("Confirm Reset")}
        </button>
      </>
    }>
      {msg && (
        <div style={{
          padding: 8, marginBottom: 12, borderRadius: 4,
          background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
          color:      msg.type === "error" ? "#991b1b" : "#166534",
          fontSize: 13,
        }}>{msg.text}</div>
      )}
      <Field label={t("New Password")}>
        <input className="field-input" type="text" value={pw} onChange={e => setPw(e.target.value)}
               placeholder={t("At least 6 chars")} autoFocus />
      </Field>
      <div style={{ fontSize: 12, color: "var(--shell-text-3)" }}>
        {t("After reset, share new password")}
      </div>
    </Modal>
  );
}

// ============================================================
function Modal({ title, children, footer, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto",
        background: "#fff", borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,.2)",
      }}>
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid var(--shell-border)",
          fontSize: 14, fontWeight: 600,
        }}>{title}</div>
        <div style={{ padding: 16 }}>{children}</div>
        <div style={{
          padding: "10px 16px", borderTop: "1px solid var(--shell-border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, req, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}{req && <span className="req">*</span>}</label>
      {children}
    </div>
  );
}
