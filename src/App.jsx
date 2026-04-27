import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase.js";

// ─── Constants ───
const STATUS_CONFIGS = {
  qc_status: { label: "QC Status", options: ["QC Approved", "QC Reject", "Loading First", "Waiting QC Report", "Under Review"] },
  space_status: { label: "Space Status", options: ["Booked", "Released", "Wait Info"] },
  local_payment: { label: "Payment", options: ["Reject", "Waiting", "Paid"] },
  telex_release: { label: "Telex Release", options: ["Pending", "Released"] },
  incoterms: { label: "Incoterms", options: ["FOB", "DDP"] },
};

const STATUS_COLORS = {
  "QC Approved": { bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
  "QC Reject": { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444" },
  "Loading First": { bg: "#fef9c3", color: "#854d0e", dot: "#eab308" },
  "Waiting QC Report": { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  "Under Review": { bg: "#e0e7ff", color: "#3730a3", dot: "#6366f1" },
  Booked: { bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
  Released: { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
  "Wait Info": { bg: "#fef9c3", color: "#854d0e", dot: "#eab308" },
  Reject: { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444" },
  Waiting: { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  Paid: { bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
  Pending: { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  FOB: { bg: "#f0f9ff", color: "#075985", dot: "#0ea5e9" },
  DDP: { bg: "#fdf4ff", color: "#86198f", dot: "#d946ef" },
};

const FIELD_LABELS = {
  qc_status: "QC Status", space_status: "Space Status", local_payment: "Local Payment",
  telex_release: "Telex Release", incoterms: "Incoterms", crd_date: "CRD Date",
  supplier: "Supplier", customer: "Customer", end_customer: "End Customer",
  po: "PO#", customer_po: "Customer PO#", supplier_order_no: "Supplier Order No#",
  tuc: "Description (TUC)", sku: "SKU", qty_packages: "QTY (Packages)",
  weight: "Weight (kg)", volume: "Volume (m³)", e_booking_no: "E-Booking No",
  booking_no: "Booking No", pol: "POL", pod: "POD", carrier: "Carrier",
  etd: "ETD", qty_container: "QTY (Container)", eta: "ETA", vessel: "Vessel",
};

// ─── Small Components ───
const Badge = ({ value, small }) => {
  const c = STATUS_COLORS[value] || { bg: "#f1f5f9", color: "#475569", dot: "#94a3b8" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 7px" : "3px 10px", borderRadius: 6, background: c.bg, color: c.color, fontSize: small ? 10.5 : 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {value}
    </span>
  );
};

const Field = ({ label, value }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 500, color: value ? "#1e293b" : "#cbd5e1" }}>{value || "—"}</div>
  </div>
);

const SectionHeader = ({ icon, title, accent, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${accent || "#e2e8f0"}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{title}</span>
    </div>
    {right}
  </div>
);

const FilterDropdown = ({ label, value, options, onChange }) => {
  const isActive = value !== "All";
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      padding: "6px 28px 6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, outline: "none", cursor: "pointer",
      border: isActive ? "2px solid #0ea5e9" : "1px solid #e2e8f0",
      background: isActive ? "#f0f9ff" : "#fff", color: isActive ? "#0369a1" : "#64748b",
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
    }}>
      <option value="All">{label}</option>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  );
};

// ─── Excel Export ───
function exportToExcel(data, filename) {
  const headers = ["PO#", "Customer PO#", "Customer", "End Customer", "Supplier", "Description", "SKU",
    "QTY Packages", "Weight", "Volume", "POL", "POD", "Carrier", "ETD", "ETA", "Vessel",
    "Booking No", "Container", "QC Status", "Space Status", "Payment", "Telex Release", "Incoterms"];
  const rows = data.map(o => [
    o.po, o.customer_po, o.customer, o.end_customer, o.supplier, o.tuc, o.sku,
    o.qty_packages, o.weight, o.volume, o.pol, o.pod, o.carrier, o.etd, o.eta, o.vessel,
    o.booking_no, o.qty_container, o.qc_status, o.space_status, o.local_payment, o.telex_release, o.incoterms
  ]);

  let csv = "\uFEFF"; // BOM for Chinese support
  csv += headers.join(",") + "\n";
  rows.forEach(row => {
    csv += row.map(cell => {
      const str = (cell == null ? "" : String(cell));
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename + ".csv";
  link.click();
}

// ─── Login Page ───
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return;
    setError(""); setLoading(true);
    try {
      const data = await supabase.auth.signIn(email, password);
      const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", data.user.id).single();
      onLogin({ ...data.user, profile });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg, #0c1222 0%, #1a2332 50%, #0c1222 100%)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: 380, padding: 40, background: "#fff", borderRadius: 16, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #0ea5e9, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 800 }}>F</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>FreightFlow</span>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </div>
        {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ─── New Shipment Modal ───
function NewShipmentModal({ onClose, onSave, refData }) {
  const [form, setForm] = useState({
    qc_status: "Under Review", space_status: "Wait Info", local_payment: "Waiting",
    telex_release: "Pending", incoterms: "FOB", crd_date: "", supplier: "",
    customer: "", end_customer: "", po: "", customer_po: "", supplier_order_no: "",
    tuc: "", sku: "", qty_packages: "", weight: "", volume: "",
    e_booking_no: "", booking_no: "", pol: "", pod: "", carrier: "",
    etd: "", qty_container: "", eta: "", vessel: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.po) { alert("PO# is required"); return; }
    setSaving(true);
    const clean = { ...form };
    if (clean.qty_packages) clean.qty_packages = parseInt(clean.qty_packages) || null; else clean.qty_packages = null;
    if (clean.weight) clean.weight = parseFloat(clean.weight) || null; else clean.weight = null;
    if (clean.volume) clean.volume = parseFloat(clean.volume) || null; else clean.volume = null;
    if (!clean.crd_date) clean.crd_date = null;
    if (!clean.etd) clean.etd = null;
    if (!clean.eta) clean.eta = null;
    await onSave(clean);
    setSaving(false);
  };

  const S = { width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12.5, outline: "none", boxSizing: "border-box" };
  const L = { fontSize: 10.5, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

  const Sel = ({ field, options }) => options?.length > 0 ? (
    <select value={form[field]} onChange={e => set(field, e.target.value)} style={{ ...S, cursor: "pointer" }}>
      <option value="">Select...</option>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  ) : <input value={form[field]} onChange={e => set(field, e.target.value)} style={S} />;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 720, maxHeight: "85vh", background: "#fff", borderRadius: 12, overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Shipment</h2>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div><label style={L}>PO# *</label><input value={form.po} onChange={e => set("po", e.target.value)} style={{ ...S, borderColor: "#0ea5e9" }} /></div>
          <div><label style={L}>Customer PO#</label><input value={form.customer_po} onChange={e => set("customer_po", e.target.value)} style={S} /></div>
          <div><label style={L}>Supplier Order No#</label><input value={form.supplier_order_no} onChange={e => set("supplier_order_no", e.target.value)} style={S} /></div>
          <div><label style={L}>Supplier</label><Sel field="supplier" options={refData.suppliers} /></div>
          <div><label style={L}>Customer</label><Sel field="customer" options={refData.customers} /></div>
          <div><label style={L}>End Customer</label><input value={form.end_customer} onChange={e => set("end_customer", e.target.value)} style={S} /></div>
          <div style={{ gridColumn: "span 2" }}><label style={L}>Description (TUC)</label><input value={form.tuc} onChange={e => set("tuc", e.target.value)} style={S} /></div>
          <div><label style={L}>SKU</label><input value={form.sku} onChange={e => set("sku", e.target.value)} style={S} /></div>
          <div><label style={L}>QTY (Packages)</label><input type="number" value={form.qty_packages} onChange={e => set("qty_packages", e.target.value)} style={S} /></div>
          <div><label style={L}>Weight (kg)</label><input type="number" value={form.weight} onChange={e => set("weight", e.target.value)} style={S} /></div>
          <div><label style={L}>Volume (m³)</label><input type="number" value={form.volume} onChange={e => set("volume", e.target.value)} style={S} /></div>
          <div><label style={L}>CRD Date</label><input type="date" value={form.crd_date} onChange={e => set("crd_date", e.target.value)} style={S} /></div>
          <div><label style={L}>Incoterms</label><select value={form.incoterms} onChange={e => set("incoterms", e.target.value)} style={{ ...S, cursor: "pointer" }}>{STATUS_CONFIGS.incoterms.options.map(o => <option key={o}>{o}</option>)}</select></div>
          <div />
          <div><label style={L}>POL</label><Sel field="pol" options={refData.ports} /></div>
          <div><label style={L}>POD</label><Sel field="pod" options={refData.ports} /></div>
          <div><label style={L}>Carrier</label><Sel field="carrier" options={refData.carriers} /></div>
          <div><label style={L}>E-Booking No</label><input value={form.e_booking_no} onChange={e => set("e_booking_no", e.target.value)} style={S} /></div>
          <div><label style={L}>Booking No</label><input value={form.booking_no} onChange={e => set("booking_no", e.target.value)} style={S} /></div>
          <div><label style={L}>QTY (Container)</label><input value={form.qty_container} onChange={e => set("qty_container", e.target.value)} style={S} /></div>
          <div><label style={L}>ETD</label><input type="date" value={form.etd} onChange={e => set("etd", e.target.value)} style={S} /></div>
          <div><label style={L}>ETA</label><input type="date" value={form.eta} onChange={e => set("eta", e.target.value)} style={S} /></div>
          <div><label style={L}>Vessel</label><input value={form.vessel} onChange={e => set("vessel", e.target.value)} style={S} /></div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <button onClick={onClose} style={{ padding: "9px 24px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving..." : "Create Shipment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading Detail Modal ───
function LoadingDetailModal({ shipment, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crossWarnings, setCrossWarnings] = useState([]);
  const [form, setForm] = useState({
    booking_no: "", container_no: "", container_type: "40HQ",
    booked_packages: "", booked_weight: "", booked_volume: "",
    actual_packages: "", actual_weight: "", actual_volume: "",
    carton_size: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id).order("created_at");
    setItems(data || []);
    setLoading(false);

    // Check cross-container warnings
    if (data && data.length > 0) {
      const bookingNos = [...new Set(data.map(d => d.booking_no).filter(Boolean))];
      const warnings = [];
      for (const bn of bookingNos) {
        const { data: others } = await supabase.from("loading_details").select("shipment_id").eq("booking_no", bn).neq("shipment_id", shipment.id);
        if (others && others.length > 0) {
          warnings.push({ booking_no: bn, count: others.length });
        }
      }
      setCrossWarnings(warnings);
    }
  }, [shipment.id]);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    if (!form.booking_no && !form.container_no) { alert("Booking No or Container No is required"); return; }
    setSaving(true);
    const clean = { ...form, shipment_id: shipment.id };
    ["booked_packages", "actual_packages"].forEach(k => { clean[k] = clean[k] ? parseInt(clean[k]) : null; });
    ["booked_weight", "booked_volume", "actual_weight", "actual_volume"].forEach(k => { clean[k] = clean[k] ? parseFloat(clean[k]) : null; });
    const { error } = await supabase.from("loading_details").insert(clean);
    if (error) { alert(error.message); setSaving(false); return; }
    setForm({ booking_no: "", container_no: "", container_type: "40HQ", booked_packages: "", booked_weight: "", booked_volume: "", actual_packages: "", actual_weight: "", actual_volume: "", carton_size: "", notes: "" });
    setSaving(false);
    load();
    onSaved?.();
  };

  const deleteItem = async (id) => {
    if (!confirm("Delete this loading record?")) return;
    await supabase.from("loading_details").delete().eq("id", id);
    load();
    onSaved?.();
  };

  const S = { width: "100%", padding: "6px 8px", borderRadius: 5, border: "1px solid #e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" };
  const L = { fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, display: "block" };

  // Compute totals
  const totals = useMemo(() => {
    const t = { bp: 0, bw: 0, bv: 0, ap: 0, aw: 0, av: 0 };
    items.forEach(i => {
      t.bp += i.booked_packages || 0; t.bw += i.booked_weight || 0; t.bv += i.booked_volume || 0;
      t.ap += i.actual_packages || 0; t.aw += i.actual_weight || 0; t.av += i.actual_volume || 0;
    });
    return t;
  }, [items]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 800, maxHeight: "85vh", background: "#fff", borderRadius: 12, overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Loading Details — {shipment.po}</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>{shipment.tuc || ""}</p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        {/* Cross-container warnings */}
        {crossWarnings.length > 0 && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef9c3", border: "1px solid #fde68a", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>⚠ Cross-container alert</div>
            {crossWarnings.map(w => (
              <div key={w.booking_no} style={{ fontSize: 12, color: "#92400e", marginTop: 4 }}>
                Booking <strong>{w.booking_no}</strong> is also used by {w.count} other PO(s)
              </div>
            ))}
          </div>
        )}

        {/* Existing loading records */}
        {!loading && items.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Booking No", "Container", "Type", "Booked Pkg", "Booked Wt", "Booked Vol", "Actual Pkg", "Actual Wt", "Actual Vol", "Carton", ""].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10.5, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 600, color: "#0ea5e9" }}>{item.booking_no || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{item.container_no || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{item.container_type || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{item.booked_packages ?? "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{item.booked_weight ?? "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{item.booked_volume ?? "—"}</td>
                    <td style={{ padding: "8px 6px", fontWeight: 600, color: item.actual_packages !== item.booked_packages ? "#dc2626" : "#059669" }}>{item.actual_packages ?? "—"}</td>
                    <td style={{ padding: "8px 6px", fontWeight: 600, color: item.actual_weight !== item.booked_weight ? "#dc2626" : "#059669" }}>{item.actual_weight ?? "—"}</td>
                    <td style={{ padding: "8px 6px", fontWeight: 600, color: item.actual_volume !== item.booked_volume ? "#dc2626" : "#059669" }}>{item.actual_volume ?? "—"}</td>
                    <td style={{ padding: "8px 6px", fontSize: 11 }}>{item.carton_size || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>
                      <button onClick={() => deleteItem(item.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Del</button>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ background: "#f0f9ff", fontWeight: 700 }}>
                  <td style={{ padding: "8px 6px" }} colSpan={3}>TOTAL</td>
                  <td style={{ padding: "8px 6px" }}>{totals.bp}</td>
                  <td style={{ padding: "8px 6px" }}>{totals.bw}</td>
                  <td style={{ padding: "8px 6px" }}>{totals.bv}</td>
                  <td style={{ padding: "8px 6px", color: totals.ap !== totals.bp ? "#dc2626" : "#059669" }}>{totals.ap}</td>
                  <td style={{ padding: "8px 6px", color: totals.aw !== totals.bw ? "#dc2626" : "#059669" }}>{totals.aw}</td>
                  <td style={{ padding: "8px 6px", color: totals.av !== totals.bv ? "#dc2626" : "#059669" }}>{totals.av}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Add new loading record */}
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#0f172a" }}>Add Loading Record</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <div><label style={L}>Booking No</label><input value={form.booking_no} onChange={e => setForm(p => ({ ...p, booking_no: e.target.value }))} style={S} /></div>
            <div><label style={L}>Container No</label><input value={form.container_no} onChange={e => setForm(p => ({ ...p, container_no: e.target.value }))} style={S} /></div>
            <div><label style={L}>Container Type</label>
              <select value={form.container_type} onChange={e => setForm(p => ({ ...p, container_type: e.target.value }))} style={{ ...S, cursor: "pointer" }}>
                {["20GP", "40GP", "40HQ", "45HQ", "20OT", "40OT", "20FR", "40FR"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={L}>Carton Size</label><input value={form.carton_size} onChange={e => setForm(p => ({ ...p, carton_size: e.target.value }))} style={S} placeholder="e.g. 60x40x30cm" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div><label style={L}>Booked Pkg</label><input type="number" value={form.booked_packages} onChange={e => setForm(p => ({ ...p, booked_packages: e.target.value }))} style={S} /></div>
            <div><label style={L}>Booked Wt (kg)</label><input type="number" value={form.booked_weight} onChange={e => setForm(p => ({ ...p, booked_weight: e.target.value }))} style={S} /></div>
            <div><label style={L}>Booked Vol (m³)</label><input type="number" value={form.booked_volume} onChange={e => setForm(p => ({ ...p, booked_volume: e.target.value }))} style={S} /></div>
            <div><label style={L}>Actual Pkg</label><input type="number" value={form.actual_packages} onChange={e => setForm(p => ({ ...p, actual_packages: e.target.value }))} style={S} /></div>
            <div><label style={L}>Actual Wt (kg)</label><input type="number" value={form.actual_weight} onChange={e => setForm(p => ({ ...p, actual_weight: e.target.value }))} style={S} /></div>
            <div><label style={L}>Actual Vol (m³)</label><input type="number" value={form.actual_volume} onChange={e => setForm(p => ({ ...p, actual_volume: e.target.value }))} style={S} /></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={L}>Notes</label>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={S} />
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={addItem} disabled={saving} style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Adding..." : "Add Record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ref Data Management Modal ───
function RefDataModal({ table, title, onClose }) {
  const [items, setItems] = useState([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select("*").order("name");
    setItems(data || []);
    setLoading(false);
  }, [table]);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    if (!newName.trim()) return;
    const d = table === "ports" ? { name: newName.trim(), code: newName.trim().substring(0, 5).toUpperCase() } : { name: newName.trim() };
    const { error } = await supabase.from(table).insert(d);
    if (error) { alert(error.message); return; }
    setNewName(""); load();
  };

  const deleteItem = async (id) => {
    if (!confirm("Delete this item?")) return;
    await supabase.from(table).delete().eq("id", id);
    load();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, maxHeight: "70vh", background: "#fff", borderRadius: 12, overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Manage {title}</h2>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={`Add new ${title.toLowerCase()}...`}
            onKeyDown={e => e.key === "Enter" && addItem()}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 13, outline: "none" }} />
          <button onClick={addItem} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Add</button>
        </div>
        {loading ? <p style={{ color: "#94a3b8", fontSize: 13 }}>Loading...</p> : (
          <div style={{ maxHeight: 350, overflowY: "auto" }}>
            {items.map(item => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</span>
                <button onClick={() => deleteItem(item.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Delete</button>
              </div>
            ))}
            {items.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No items yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("orders");
  const [shipments, setShipments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", customer: "All" });
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [refDataModal, setRefDataModal] = useState(null);
  const [refData, setRefData] = useState({ suppliers: [], customers: [], carriers: [], ports: [] });
  const [loadingDetailShipment, setLoadingDetailShipment] = useState(null);

  const isAdmin = user?.profile?.role === "admin";
  const selectedOrder = shipments.find(o => o.id === selectedId);

  const loadRefData = useCallback(async () => {
    const [s, cu, ca, p] = await Promise.all([
      supabase.from("suppliers").select("name").order("name"),
      supabase.from("customers").select("name").order("name"),
      supabase.from("carriers").select("name").order("name"),
      supabase.from("ports").select("name,code").order("name"),
    ]);
    setRefData({
      suppliers: (s.data || []).map(x => x.name),
      customers: (cu.data || []).map(x => x.name),
      carriers: (ca.data || []).map(x => x.name),
      ports: (p.data || []).map(x => `${x.name} (${x.code})`),
    });
  }, []);

  const loadShipments = useCallback(async () => {
    const { data } = await supabase.from("shipments").select("*").order("created_at", { ascending: false });
    setShipments(data || []);
    setLoading(false);
  }, []);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
    setLogs(data || []);
  }, []);

  useEffect(() => { if (user) { loadRefData(); loadShipments(); loadLogs(); } }, [user, loadRefData, loadShipments, loadLogs]);

  const handleCreateShipment = async (form) => {
    form.created_by = user.id;
    const { error } = await supabase.from("shipments").insert(form);
    if (error) { alert(error.message); return; }
    setShowNewModal(false);
    loadShipments();
  };

  const handleUpdateField = async (shipmentId, field, oldValue, newValue) => {
    if (oldValue === newValue) return;
    const { error } = await supabase.from("shipments").update({ [field]: newValue }).eq("id", shipmentId);
    if (error) { alert(error.message); return; }
    await supabase.from("audit_logs").insert({
      shipment_id: shipmentId, user_id: user.id, user_email: user.email,
      field_name: FIELD_LABELS[field] || field, old_value: oldValue || "", new_value: newValue || "",
    });
    loadShipments(); loadLogs();
  };

  const setFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const activeFilterCount = Object.values(filters).filter(v => v !== "All").length + (search ? 1 : 0);
  const clearFilters = () => { setFilters({ qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", customer: "All" }); setSearch(""); };

  // Clickable overview stats
  const handleStatClick = (type) => {
    clearFilters();
    setView("orders");
    setSelectedId(null);
    if (type === "qcPending") setFilters(prev => ({ ...prev, qc_status: "All" })); // We'll filter non-approved in filtered
    if (type === "paymentDue") setFilters(prev => ({ ...prev, local_payment: "Waiting" }));
    if (type === "telexPending") setFilters(prev => ({ ...prev, telex_release: "Pending" }));
  };

  const customerList = useMemo(() => [...new Set(shipments.map(o => o.customer).filter(Boolean))], [shipments]);

  const filtered = useMemo(() => shipments.filter(o => {
    for (const key of Object.keys(STATUS_CONFIGS)) {
      if (filters[key] !== "All" && o[key] !== filters[key]) return false;
    }
    if (filters.customer !== "All" && o.customer !== filters.customer) return false;
    if (search) {
      const s = search.toLowerCase();
      return [o.po, o.tuc, o.sku, o.carrier, o.customer_po, o.customer, o.supplier].some(v => (v || "").toLowerCase().includes(s));
    }
    return true;
  }), [shipments, filters, search]);

  const orderLogs = useMemo(() => selectedOrder ? logs.filter(l => l.shipment_id === selectedOrder.id) : logs, [logs, selectedOrder]);

  const stats = useMemo(() => ({
    total: shipments.length,
    qcPending: shipments.filter(o => o.qc_status !== "QC Approved").length,
    paymentDue: shipments.filter(o => o.local_payment === "Waiting").length,
    telexPending: shipments.filter(o => o.telex_release === "Pending").length,
  }), [shipments]);

  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#f0f2f5", minHeight: "100vh", color: "#1e293b" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Top Bar */}
      <div style={{ background: "#0c1222", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: "linear-gradient(135deg, #0ea5e9, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>F</span>
          </div>
          <span style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700, letterSpacing: -0.5 }}>FreightFlow</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{user.email}</span>
          <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase", background: isAdmin ? "#0ea5e920" : "#10b98120", color: isAdmin ? "#0ea5e9" : "#10b981" }}>
            {user.profile?.role || "user"}
          </span>
          <button onClick={() => { supabase.auth.signOut(); setUser(null); }}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", background: "none", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Logout</button>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 52px)" }}>
        {/* Sidebar */}
        <div style={{ width: 192, background: "#fff", borderRight: "1px solid #e2e8f0", padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          {[{ key: "orders", icon: "📦", label: "Shipments" }, { key: "logs", icon: "📋", label: "Audit Log" }].map(item => (
            <button key={item.key} onClick={() => { setView(item.key); setSelectedId(null); }} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 500, width: "100%", textAlign: "left",
              background: view === item.key ? "#f0f9ff" : "transparent", color: view === item.key ? "#0369a1" : "#64748b",
            }}><span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}</button>
          ))}
          {isAdmin && (
            <>
              <div style={{ margin: "14px 4px 6px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Manage</div>
              {[{ t: "suppliers", l: "Suppliers" }, { t: "customers", l: "Customers" }, { t: "carriers", l: "Carriers" }, { t: "ports", l: "Ports" }].map(item => (
                <button key={item.t} onClick={() => setRefDataModal(item)} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 500, width: "100%", textAlign: "left",
                  background: "transparent", color: "#94a3b8",
                }}>⚙ {item.l}</button>
              ))}
            </>
          )}
          <div style={{ margin: "14px 4px 6px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Overview</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 4px" }}>
            {[
              { l: "Total", v: stats.total, c: "#0ea5e9", click: () => { clearFilters(); setView("orders"); setSelectedId(null); } },
              { l: "QC Pending", v: stats.qcPending, c: "#f59e0b", click: () => handleStatClick("qcPending") },
              { l: "Payment Due", v: stats.paymentDue, c: "#ef4444", click: () => handleStatClick("paymentDue") },
              { l: "Telex Pending", v: stats.telexPending, c: "#8b5cf6", click: () => handleStatClick("telexPending") },
            ].map(s => (
              <div key={s.l} onClick={s.click} style={{ padding: "8px 10px", borderRadius: 7, background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#e0f2fe"}
                onMouseLeave={e => e.currentTarget.style.background = "#f8fafc"}>
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{s.l}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: s.c, fontFamily: "'DM Mono', monospace" }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 20, overflowX: "auto" }}>
          {loading && <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading...</div>}

          {/* SHIPMENT LIST */}
          {!loading && view === "orders" && !selectedOrder && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Shipments</h1>
                  <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>
                    {filtered.length} of {shipments.length} records
                    {activeFilterCount > 0 && <span style={{ color: "#0ea5e9", fontWeight: 600 }}> · {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</span>}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => exportToExcel(filtered, `FreightFlow_Export_${new Date().toISOString().slice(0, 10)}`)}
                    style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                    ↓ Export CSV
                  </button>
                  {isAdmin && <button onClick={() => setShowNewModal(true)} style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>+ New Shipment</button>}
                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Filters</span>
                  <input placeholder="Search PO#, product, SKU, carrier..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{ padding: "6px 10px", borderRadius: 6, border: search ? "2px solid #0ea5e9" : "1px solid #e2e8f0", fontSize: 12, width: 200, outline: "none", background: search ? "#f0f9ff" : "#fff" }} />
                  {Object.entries(STATUS_CONFIGS).map(([key, cfg]) => (
                    <FilterDropdown key={key} label={cfg.label} value={filters[key]} options={cfg.options} onChange={v => setFilter(key, v)} />
                  ))}
                  {isAdmin && <FilterDropdown label="Customer" value={filters.customer} options={customerList} onChange={v => setFilter("customer", v)} />}
                  {activeFilterCount > 0 && <button onClick={clearFilters} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✕ Clear</button>}
                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 1100 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["PO#", "Goods", "Customer", "Route", "ETD", "ETA", "QC", "Space", "Payment", "Telex"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No shipments found</td></tr>}
                    {filtered.map((o, i) => (
                      <tr key={o.id} onClick={() => setSelectedId(o.id)} style={{ cursor: "pointer", borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: 12, fontWeight: 600, color: "#0ea5e9", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{o.po || "—"}</td>
                        <td style={{ padding: 12, maxWidth: 180 }}>
                          <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.tuc || "—"}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'DM Mono', monospace" }}>{o.sku || ""}</div>
                        </td>
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>{o.customer || "—"}</div>
                          {isAdmin && o.end_customer && <div style={{ fontSize: 11, color: "#94a3b8" }}>→ {o.end_customer}</div>}
                        </td>
                        <td style={{ padding: 12, fontSize: 11.5, whiteSpace: "nowrap" }}>
                          {o.pol && o.pod ? <><span style={{ fontWeight: 500 }}>{(o.pol || "").split("(")[0].trim()}</span><span style={{ color: "#94a3b8", margin: "0 3px" }}>→</span><span style={{ fontWeight: 500 }}>{(o.pod || "").split("(")[0].trim()}</span></> : "—"}
                        </td>
                        <td style={{ padding: 12, fontFamily: "'DM Mono', monospace", fontSize: 11.5 }}>{o.etd || "—"}</td>
                        <td style={{ padding: 12, fontFamily: "'DM Mono', monospace", fontSize: 11.5 }}>{o.eta || "—"}</td>
                        <td style={{ padding: 12 }}>{o.qc_status ? <Badge value={o.qc_status} small /> : "—"}</td>
                        <td style={{ padding: 12 }}>{o.space_status ? <Badge value={o.space_status} small /> : "—"}</td>
                        <td style={{ padding: 12 }}>{o.local_payment ? <Badge value={o.local_payment} small /> : "—"}</td>
                        <td style={{ padding: 12 }}>{o.telex_release ? <Badge value={o.telex_release} small /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ORDER DETAIL */}
          {!loading && view === "orders" && selectedOrder && (
            <>
              <button onClick={() => setSelectedId(null)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0", border: "none", background: "none", color: "#0ea5e9", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>← Back</button>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "'DM Mono', monospace" }}>{selectedOrder.po || "No PO#"}</h1>
                  <p style={{ fontSize: 13, color: "#64748b", margin: "3px 0 0" }}>{selectedOrder.tuc || ""}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.keys(STATUS_CONFIGS).map(k => selectedOrder[k] ? <Badge key={k} value={selectedOrder[k]} /> : null)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                {Object.entries(STATUS_CONFIGS).map(([key, cfg]) => {
                  const val = selectedOrder[key];
                  const editable = (isAdmin && key !== "qc_status") || (!isAdmin && key === "qc_status");
                  return (
                    <div key={key} style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: editable ? "2px solid #0ea5e9" : "1px solid #e2e8f0", flex: "1 1 140px", minWidth: 140 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                        {cfg.label}{editable && <span style={{ fontSize: 9, color: "#0ea5e9", fontWeight: 700 }}>EDITABLE</span>}
                      </div>
                      {editable ? (
                        <select value={val || ""} onChange={e => handleUpdateField(selectedOrder.id, key, val, e.target.value)}
                          style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer", color: "#0c4a6e", boxSizing: "border-box" }}>
                          {cfg.options.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : val ? <Badge value={val} /> : <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
                  <SectionHeader icon="📄" title="Order References" accent="#0ea5e9" />
                  <Field label="PO#" value={selectedOrder.po} />
                  <Field label="Customer PO#" value={selectedOrder.customer_po} />
                  <Field label="Supplier Order No#" value={selectedOrder.supplier_order_no} />
                  <Field label="CRD Date" value={selectedOrder.crd_date} />
                  <Field label="Incoterms" value={selectedOrder.incoterms} />
                </div>
                <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
                  <SectionHeader icon="🏢" title="Parties" accent="#10b981" />
                  <Field label="Supplier" value={selectedOrder.supplier} />
                  <Field label="Customer" value={selectedOrder.customer} />
                  <Field label="End Customer" value={selectedOrder.end_customer} />
                </div>
                <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
                  <SectionHeader icon="📦" title="Cargo Details" accent="#f59e0b" />
                  <Field label="Description (TUC)" value={selectedOrder.tuc} />
                  <Field label="SKU" value={selectedOrder.sku} />
                  <Field label="QTY (Packages)" value={selectedOrder.qty_packages} />
                  <Field label="Weight" value={selectedOrder.weight ? `${selectedOrder.weight} kg` : null} />
                  <Field label="Volume" value={selectedOrder.volume ? `${selectedOrder.volume} m³` : null} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
                  <SectionHeader icon="🚢" title="Shipping Details" accent="#6366f1" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
                    <Field label="E-Booking No" value={selectedOrder.e_booking_no} />
                    <Field label="Booking No" value={selectedOrder.booking_no} />
                    <Field label="POL" value={selectedOrder.pol} />
                    <Field label="POD" value={selectedOrder.pod} />
                    <Field label="Carrier" value={selectedOrder.carrier} />
                    <Field label="QTY (Container)" value={selectedOrder.qty_container} />
                    <Field label="ETD" value={selectedOrder.etd} />
                    <Field label="ETA" value={selectedOrder.eta} />
                    <Field label="Vessel" value={selectedOrder.vessel} />
                  </div>
                </div>
                <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
                  <SectionHeader icon="📝" title="Edit History" accent="#8b5cf6" />
                  <div style={{ maxHeight: 280, overflowY: "auto" }}>
                    {orderLogs.length === 0 && <p style={{ fontSize: 12, color: "#94a3b8" }}>No edits recorded yet.</p>}
                    {orderLogs.map((log, i) => (
                      <div key={log.id || i} style={{ padding: "9px 0", borderBottom: i < orderLogs.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#0ea5e9" }}>{log.user_email}</span>
                          <span style={{ fontSize: 10.5, color: "#cbd5e1", fontFamily: "'DM Mono', monospace" }}>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#475569" }}>
                          <span style={{ fontWeight: 600 }}>{log.field_name}</span>
                          {log.old_value && <span style={{ color: "#ef4444", textDecoration: "line-through", margin: "0 6px", fontSize: 11 }}>{log.old_value}</span>}
                          <span style={{ color: "#10b981", fontSize: 11 }}>→ {log.new_value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Loading Details Section */}
              <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "2px solid #f59e0b" }}>
                <SectionHeader icon="📋" title="Loading Details" accent="#f59e0b"
                  right={isAdmin && (
                    <button onClick={() => setLoadingDetailShipment(selectedOrder)}
                      style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#f59e0b", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      + Manage Loading
                    </button>
                  )} />
                <p style={{ fontSize: 12, color: "#94a3b8" }}>Click "Manage Loading" to add or view loading records for this PO.</p>
              </div>
            </>
          )}

          {/* AUDIT LOG */}
          {!loading && view === "logs" && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 3px" }}>Audit Log</h1>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Complete edit history</p>
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Time", "User", "Field", "Change"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No logs yet</td></tr>}
                    {logs.map((log, i) => (
                      <tr key={log.id || i} style={{ borderBottom: i < logs.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: "#94a3b8", whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                        <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#f0f9ff", color: "#0369a1" }}>{log.user_email}</span></td>
                        <td style={{ padding: "10px 14px", fontWeight: 500 }}>{log.field_name}</td>
                        <td style={{ padding: "10px 14px" }}>
                          {log.old_value && <span style={{ color: "#ef4444", textDecoration: "line-through", marginRight: 8, fontSize: 11.5 }}>{log.old_value}</span>}
                          <span style={{ color: "#059669", fontSize: 11.5 }}>→ {log.new_value}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewModal && <NewShipmentModal onClose={() => setShowNewModal(false)} onSave={handleCreateShipment} refData={refData} />}
      {refDataModal && <RefDataModal table={refDataModal.t} title={refDataModal.l} onClose={() => { setRefDataModal(null); loadRefData(); }} />}
      {loadingDetailShipment && <LoadingDetailModal shipment={loadingDetailShipment} onClose={() => setLoadingDetailShipment(null)} onSaved={loadShipments} />}
    </div>
  );
}
