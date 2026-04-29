import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";
import { ShipmentsPage } from "./pages/Shipments.jsx";
import { CustomersPage } from "./pages/Customers.jsx";
import { KnowledgePage } from "./pages/Knowledge.jsx";
import { ManagePage } from "./pages/Manage.jsx";
import { canAccessPage } from "./lib/permissions.js";
import { t, setI18nRole } from "./lib/i18n.js";

const BansarLogo = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <rect x="6" y="6" width="88" height="88" rx="22" fill="#1a365d" />
    <text x="50" y="62" textAnchor="middle" fill="#f8fafc" fontSize="36" fontWeight="700" fontFamily="DM Sans, system-ui, sans-serif">B</text>
  </svg>
);

// =========================================================================
// Login
// =========================================================================
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setError(""); setLoading(true);
    try {
      const data = await supabase.auth.signIn(email, password);
      const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", data.user.id).single();
      onLogin({ ...data.user, profile });
      setI18nRole(profile?.role || "operator");
    } catch (err) { setError(err.message || "Login failed"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg, #0c1222 0%, #1a2332 50%, #0c1222 100%)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: 380, padding: 40, background: "#fff", borderRadius: 16, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <BansarLogo size={42} />
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: "#0f172a" }}>Bansar Group Portal</span>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>{loading ? "Signing in..." : "Sign In"}</button>
      </div>
    </div>
  );
}

// =========================================================================
// App
// =========================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("shipments"); // shipments | logs | customers | knowledge | manage
  const [stats, setStats] = useState({ total: 0, qcPending: 0, paymentDue: 0, telexPending: 0, blPending: 0, entryPending: 0 });
  const [bootstrapping, setBootstrapping] = useState(true);

  // Restore session on mount (Supabase wrapper persists tokens)
  useEffect(() => {
    (async () => {
      if (supabase.auth.isAuthenticated()) {
        const u = supabase.auth.getUser();
        if (u) {
          try {
            const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", u.id).single();
            setUser({ ...u, profile });
            setI18nRole(profile?.role || "operator");
          } catch { supabase.auth.signOut(); }
        }
      }
      setBootstrapping(false);
    })();
  }, []);

  // Stats sidebar (re-loaded when on shipments view)
  const refreshStats = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("shipments").select("qc_status,local_payment,telex_release,bl_status,entry_done");
    const arr = data || [];
    setStats({
      total: arr.length,
      qcPending: arr.filter(o => o.qc_status !== "QC Approved").length,
      paymentDue: arr.filter(o => o.local_payment === "Waiting").length,
      telexPending: arr.filter(o => o.telex_release === "Pending").length,
      blPending: arr.filter(o => o.bl_status !== "Done").length,
      entryPending: arr.filter(o => !o.entry_done).length,
    });
  }, [user]);
  useEffect(() => { refreshStats(); }, [refreshStats, view]);

  if (bootstrapping) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", color: "#94a3b8" }}>Loading...</div>;
  if (!user) return <LoginPage onLogin={setUser} />;

  const [statFilter, setStatFilter] = useState(null); // passed to ShipmentsPage for stat clicks
  const role = user.profile?.role || "operator";
  const navItems = [
    { key: "shipments", icon: "📦", label: t("Shipments") },
    { key: "logs",      icon: "📋", label: t("Audit Log") },
    { key: "suppliers", icon: "🏭", label: t("Suppliers") },
    { key: "customers", icon: "🤝", label: t("Customers") },
    { key: "knowledge", icon: "📚", label: t("Knowledge") },
    { key: "manage",    icon: "⚙️", label: t("Manage") },
  ].filter(item => canAccessPage(role, item.key));

  return (
    <div style={{ fontFamily: "'DM Sans',system-ui,sans-serif", background: "#f0f2f5", minHeight: "100vh", color: "#1e293b" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Top Bar */}
      <div style={{ background: "#0c1222", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><BansarLogo size={32} /><span style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Bansar Group Portal</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{user.email}</span>
          <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: roleBadge(role).bg, color: roleBadge(role).fg }}>{role}</span>
          <button onClick={() => { supabase.auth.signOut(); setUser(null); }} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", background: "none", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Logout</button>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 52px)" }}>
        {/* Sidebar */}
        <div style={{ width: 192, background: "#fff", borderRight: "1px solid #e2e8f0", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          {navItems.map(item => (
            <button key={item.key} onClick={() => setView(item.key)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", border: "none", borderRadius: 7, cursor: "pointer",
              fontSize: 13, fontWeight: 500, width: "100%", textAlign: "left",
              background: view === item.key ? "#f0f9ff" : "transparent",
              color: view === item.key ? "#0369a1" : "#64748b",
            }}><span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}</button>
          ))}

          {(view === "shipments" || view === "logs") && (
            <>
              <div style={{ margin: "14px 4px 6px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>{t("Overview")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 4px" }}>
                {[
                  { l: t("Total"),         v: stats.total,        c: "#0ea5e9", f: null },
                  { l: t("QC Pending"),    v: stats.qcPending,    c: "#f59e0b", f: { qc_status: "pending" } },
                  { l: t("Payment Due"),   v: stats.paymentDue,   c: "#ef4444", f: { local_payment: "Waiting" } },
                  { l: t("Telex Pending"), v: stats.telexPending, c: "#8b5cf6", f: { telex_release: "Pending" } },
                  { l: t("B/L Pending"),   v: stats.blPending,    c: "#0891b2", f: { bl_status: "Not Ready" } },
                  { l: t("Entry Pending"), v: stats.entryPending, c: "#d946ef", f: { entry_done: "未录入" } },
                ].map(s => (
                  <div key={s.l} onClick={() => { setView("shipments"); setStatFilter(s.f); }} style={{ padding: "8px 10px", borderRadius: 7, background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#e0f2fe"} onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}>
                    <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{s.l}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: s.c, fontFamily: "'DM Mono',monospace" }}>{s.v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: 20, overflowX: "auto" }}>
          {(view === "shipments" || view === "logs") && <ShipmentsPage user={user} view={view} setView={setView} statFilter={statFilter} clearStatFilter={() => setStatFilter(null)} />}
          {view === "customers" && <CustomersPage user={user} />}
          {view === "suppliers" && <KnowledgePage user={user} defaultTab="supplier" supplierOnly />}
          {view === "knowledge" && <KnowledgePage user={user} />}
          {view === "manage"    && <ManagePage user={user} />}
        </div>
      </div>
    </div>
  );
}

function roleBadge(role) {
  if (role === "admin")    return { bg: "#0ea5e920", fg: "#0ea5e9" };
  if (role === "sales")    return { bg: "#10b98120", fg: "#10b981" };
  if (role === "operator") return { bg: "#f59e0b20", fg: "#f59e0b" };
  if (role === "customer") return { bg: "#8b5cf620", fg: "#8b5cf6" };
  return { bg: "#64748b20", fg: "#64748b" };
}
