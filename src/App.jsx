// ============================================================
// Bansar Group Portal — root component
// Login → Shell (with multi-tab content area driven by nav-config + role)
// ============================================================
import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import Shell from "./components/Shell.jsx";
import { setI18nRole, t } from "./lib/i18n.js";
import "./styles/shell.css";

// ── Pages registered with the Shell ───────────────────────────
import { ShipmentsPage }  from "./pages/Shipments.jsx";
import { ContainersPage } from "./pages/Containers.jsx";
import { CustomersPage }  from "./pages/Customers.jsx";
import { KnowledgePage }  from "./pages/Knowledge.jsx";
import { ManagePage }     from "./pages/Manage.jsx";
// Supplier pages
import SupplierHome        from "./pages/supplier/Home.jsx";
import BookingRequest      from "./pages/supplier/BookingRequest.jsx";
import BookingList         from "./pages/supplier/BookingList.jsx";
import SupplierBills       from "./pages/supplier/Bills.jsx";
import SupplierInvoices    from "./pages/supplier/Invoices.jsx";
import SupplierVouchers    from "./pages/supplier/Vouchers.jsx";
import SupplierSettlements from "./pages/supplier/Settlements.jsx";
import TelexReleasePage    from "./pages/supplier/TelexRelease.jsx";
import SupplierOrders      from "./pages/supplier/Orders.jsx";
// Admin pages
import AccountManagement   from "./pages/admin/AccountManagement.jsx";
import ReviewBookingsPage  from "./pages/admin/ReviewBookings.jsx";

const PAGE_REGISTRY = {
  // Internal
  Shipments:           ({ user }) => <ShipmentsPage user={user} view="shipments" setView={() => {}} statFilter={null} />,
  Containers:          ContainersPage,
  Customers:           CustomersPage,
  Knowledge:           KnowledgePage,
  Manage:              ManagePage,
  // Supplier
  SupplierHome:        SupplierHome,
  BookingRequest:      BookingRequest,
  BookingList:         BookingList,
  SupplierBills:       SupplierBills,
  SupplierInvoices:    SupplierInvoices,
  SupplierVouchers:    SupplierVouchers,
  SupplierSettlements: SupplierSettlements,
  TelexRelease:        TelexReleasePage,
  SupplierOrders:      SupplierOrders,
  // Admin
  AccountManagement:   AccountManagement,
  // Internal review screens — stubs for now (next iteration)
  ReviewBookings:      ReviewBookingsPage,
  ReviewVouchers:      () => <div className="empty-state empty-text">{t("Payment Vouchers Review")} — {t("Coming soon")}</div>,
  ReviewTelex:         () => <div className="empty-state empty-text">{t("Telex Release Review")} — {t("Coming soon")}</div>,
};

// ============================================================
// Login page
// ============================================================
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
    } catch (err) { setError(err.message || t("Login failed")); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(145deg, #0c1222 0%, #1a2332 50%, #0c1222 100%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', system-ui, sans-serif",
    }}>
      <div style={{ width: 380, padding: 40, background: "#fff", borderRadius: 12, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <span style={{
            width: 36, height: 36, borderRadius: 8, background: "#0c1222",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 18, fontWeight: 800,
          }}>B</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Bansar Group Portal</span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>{t("Email")}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>{t("Password")}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fef2f2", color: "#dc2626", fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{
          width: "100%", padding: "10px", borderRadius: 6, border: "none",
          background: "#1989ff", color: "#fff", fontSize: 14, fontWeight: 600,
          cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
        }}>{loading ? t("Logging in...") : t("Login")}</button>
      </div>
    </div>
  );
}

// ============================================================
// App
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);

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

  if (bootstrapping) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f6fa", color: "#94a3b8" }}>Loading...</div>;
  }
  if (!user) return <LoginPage onLogin={setUser} />;

  const logout = () => { supabase.auth.signOut(); setUser(null); window.location.hash = ""; };
  return <Shell user={user} onLogout={logout} pageRegistry={PAGE_REGISTRY} />;
}
