import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase.js";

const STATUS_CONFIGS = {
  qc_status: { label: "QC Status", options: ["QC Approved", "QC Reject", "Loading First", "Waiting QC Report", "Under Review"] },
  space_status: { label: "Space Status", options: ["Booked", "Released", "Wait Info"] },
  local_payment: { label: "Payment", options: ["Reject", "Waiting", "Paid"] },
  telex_release: { label: "Telex Release", options: ["Pending", "Released"] },
  incoterms: { label: "Incoterms", options: ["FOB", "DDP"] },
  bl_status: { label: "B/L Status", options: ["Not Ready", "Done"] },
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
  "Not Ready": { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  "Done": { bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
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
  carrier_agent: "Agent", container_no: "Container No", bl_status: "B/L Status",
};

// ─── Logo ───
const FobcargoLogo = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg">
    <rect width="84" height="84" rx="18" fill="#075985"/>
    <rect x="12" y="16" width="30" height="22" rx="2.5" fill="rgba(255,255,255,0.9)"/>
    <polygon points="42,16 58,9 58,31 42,38" fill="rgba(255,255,255,0.55)"/>
    <polygon points="12,16 28,9 58,9 42,16" fill="rgba(255,255,255,0.7)"/>
    <line x1="27" y1="18" x2="27" y2="36" stroke="#075985" stroke-width="1"/>
    <rect x="12" y="44" width="30" height="22" rx="2.5" fill="rgba(255,255,255,0.55)"/>
    <polygon points="42,44 58,37 58,59 42,66" fill="rgba(255,255,255,0.35)"/>
    <polygon points="12,44 28,37 58,37 42,44" fill="rgba(255,255,255,0.45)"/>
  </svg>
);

// ─── Components ───
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

function exportToExcel(data, filename) {
  const headers = ["PO#","Customer PO#","Customer","End Customer","Supplier","TUC/Description","SKU","QTY Packages","Weight","Volume","POL","POD","Carrier","Agent","ETD","ETA","Vessel","Booking No","Container No","Container Qty","QC Status","Space Status","Payment","Telex Release","B/L Status","Incoterms"];
  const rows = data.map(o => [o.po,o.customer_po,o.customer,o.end_customer,o.supplier,o.tuc,o.sku,o.qty_packages,o.weight,o.volume,o.pol,o.pod,o.carrier,o.carrier_agent||"",o.etd,o.eta,o.vessel,o.booking_no,o.container_no||"",o.qty_container,o.qc_status,o.space_status,o.local_payment,o.telex_release,o.bl_status||"",o.incoterms]);
  let csv = "\uFEFF" + headers.join(",") + "\n";
  rows.forEach(row => { csv += row.map(cell => { const s = (cell==null?"":String(cell)); return s.includes(",")||s.includes('"')||s.includes("\n")?`"${s.replace(/"/g,'""')}"`:s; }).join(",") + "\n"; });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename + ".csv";
  link.click();
}

// ─── Login ───
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
    } catch (err) { setError(err.message || "Login failed"); } finally { setLoading(false); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg, #0c1222 0%, #1a2332 50%, #0c1222 100%)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: 380, padding: 40, background: "#fff", borderRadius: 16, boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <FobcargoLogo size={42} />
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: "#0f172a" }}>Fobcargo</span>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 6 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", boxSizing: "border-box" }} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
        </div>
        {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>{loading ? "Signing in..." : "Sign In"}</button>
      </div>
    </div>
  );
}

// ─── New Shipment Modal ───
function NewShipmentModal({ onClose, onSave, refData }) {
  const [form, setForm] = useState({ qc_status:"Under Review",space_status:"Wait Info",local_payment:"Waiting",telex_release:"Pending",incoterms:"FOB",bl_status:"Not Ready",crd_date:"",supplier:"",customer:"",end_customer:"",po:"",customer_po:"",supplier_order_no:"",tuc:"",sku:"",qty_packages:"",weight:"",volume:"",e_booking_no:"",booking_no:"",pol:"",pod:"",carrier:"",carrier_agent:"",etd:"",qty_container:"",container_no:"",eta:"",vessel:"" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const selCarrier = refData.carriersWithAgents?.find(c => c.name === form.carrier);
  const agentOpts = selCarrier?.agents || [];
  const handleSave = async () => {
    if (!form.po) { alert("PO# is required"); return; }
    setSaving(true);
    const c = { ...form };
    c.qty_packages = c.qty_packages ? parseInt(c.qty_packages)||null : null;
    c.weight = c.weight ? parseFloat(c.weight)||null : null;
    c.volume = c.volume ? parseFloat(c.volume)||null : null;
    if (!c.crd_date) c.crd_date = null; if (!c.etd) c.etd = null; if (!c.eta) c.eta = null;
    await onSave(c); setSaving(false);
  };
  const S = { width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:12.5,outline:"none",boxSizing:"border-box" };
  const L = { fontSize:10.5,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4,display:"block" };
  const Sel = ({ field, options }) => options?.length > 0 ? (
    <select value={form[field]} onChange={e => set(field, e.target.value)} style={{...S,cursor:"pointer"}}><option value="">Select...</option>{options.map(o => <option key={o}>{o}</option>)}</select>
  ) : <input value={form[field]} onChange={e => set(field, e.target.value)} style={S} />;
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width:740,maxHeight:"85vh",background:"#fff",borderRadius:12,overflow:"auto",padding:24 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <h2 style={{ fontSize:18,fontWeight:700,margin:0 }}>New Shipment</h2>
          <button onClick={onClose} style={{ border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8" }}>✕</button>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14 }}>
          <div><label style={L}>PO# *</label><input value={form.po} onChange={e => set("po",e.target.value)} style={{...S,borderColor:"#0ea5e9"}} /></div>
          <div><label style={L}>Customer PO#</label><input value={form.customer_po} onChange={e => set("customer_po",e.target.value)} style={S} /></div>
          <div><label style={L}>Supplier Order No#</label><input value={form.supplier_order_no} onChange={e => set("supplier_order_no",e.target.value)} style={S} /></div>
          <div><label style={L}>Supplier</label><Sel field="supplier" options={refData.suppliers} /></div>
          <div><label style={L}>Customer</label><Sel field="customer" options={refData.customers} /></div>
          <div><label style={L}>End Customer</label><Sel field="end_customer" options={refData.endCustomers} /></div>
          <div style={{gridColumn:"span 2"}}><label style={L}>TUC / Description</label><input value={form.tuc} onChange={e => set("tuc",e.target.value)} style={S} /></div>
          <div><label style={L}>SKU</label><input value={form.sku} onChange={e => set("sku",e.target.value)} style={S} /></div>
          <div><label style={L}>QTY (Packages)</label><input type="number" value={form.qty_packages} onChange={e => set("qty_packages",e.target.value)} style={S} /></div>
          <div><label style={L}>Weight (kg)</label><input type="number" value={form.weight} onChange={e => set("weight",e.target.value)} style={S} /></div>
          <div><label style={L}>Volume (m³)</label><input type="number" value={form.volume} onChange={e => set("volume",e.target.value)} style={S} /></div>
          <div><label style={L}>CRD Date</label><input type="date" value={form.crd_date} onChange={e => set("crd_date",e.target.value)} style={S} /></div>
          <div><label style={L}>Incoterms</label><select value={form.incoterms} onChange={e => set("incoterms",e.target.value)} style={{...S,cursor:"pointer"}}>{STATUS_CONFIGS.incoterms.options.map(o => <option key={o}>{o}</option>)}</select></div>
          <div />
          <div><label style={L}>POL</label><Sel field="pol" options={refData.ports} /></div>
          <div><label style={L}>POD</label><Sel field="pod" options={refData.ports} /></div>
          <div><label style={L}>Carrier</label><select value={form.carrier} onChange={e => {set("carrier",e.target.value);set("carrier_agent","");}} style={{...S,cursor:"pointer"}}><option value="">Select...</option>{refData.carriers.map(o => <option key={o}>{o}</option>)}</select></div>
          <div><label style={L}>Agent</label>{agentOpts.length > 0 ? <select value={form.carrier_agent} onChange={e => set("carrier_agent",e.target.value)} style={{...S,cursor:"pointer"}}><option value="">No agent</option>{agentOpts.map(a => <option key={a}>{a}</option>)}</select> : <input value={form.carrier_agent} onChange={e => set("carrier_agent",e.target.value)} style={S} placeholder="e.g. Yusen" />}</div>
          <div><label style={L}>E-Booking No</label><input value={form.e_booking_no} onChange={e => set("e_booking_no",e.target.value)} style={S} /></div>
          <div><label style={L}>Booking No</label><input value={form.booking_no} onChange={e => set("booking_no",e.target.value)} style={S} /></div>
          <div><label style={L}>Container No</label><input value={form.container_no} onChange={e => set("container_no",e.target.value)} style={S} placeholder="e.g. MSCU1234567" /></div>
          <div><label style={L}>QTY (Container)</label><input value={form.qty_container} onChange={e => set("qty_container",e.target.value)} style={S} placeholder="e.g. 1x40HQ" /></div>
          <div><label style={L}>ETD</label><input type="date" value={form.etd} onChange={e => set("etd",e.target.value)} style={S} /></div>
          <div><label style={L}>ETA</label><input type="date" value={form.eta} onChange={e => set("eta",e.target.value)} style={S} /></div>
          <div><label style={L}>Vessel</label><input value={form.vessel} onChange={e => set("vessel",e.target.value)} style={S} /></div>
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end",gap:10,marginTop:24,paddingTop:16,borderTop:"1px solid #e2e8f0" }}>
          <button onClick={onClose} style={{ padding:"9px 24px",borderRadius:7,border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:12.5,fontWeight:600,cursor:"pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding:"9px 24px",borderRadius:7,border:"none",background:"#0ea5e9",color:"#fff",fontSize:12.5,fontWeight:600,cursor:saving?"wait":"pointer",opacity:saving?0.7:1 }}>{saving?"Saving...":"Create Shipment"}</button>
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
  const [form, setForm] = useState({ booking_no:"",container_no:"",container_type:"40HQ",booked_packages:"",booked_weight:"",booked_volume:"",actual_packages:"",actual_weight:"",actual_volume:"",carton_size:"",notes:"" });
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id).order("created_at");
    setItems(data || []); setLoading(false);
    if (data && data.length > 0) {
      const bns = [...new Set(data.map(d => d.booking_no).filter(Boolean))];
      const w = [];
      for (const bn of bns) { const { data: o } = await supabase.from("loading_details").select("shipment_id").eq("booking_no", bn).neq("shipment_id", shipment.id); if (o && o.length > 0) w.push({ booking_no: bn, count: o.length }); }
      setCrossWarnings(w);
    }
  }, [shipment.id]);
  useEffect(() => { load(); }, [load]);

  const syncToShipment = async () => {
    const { data: ld } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id).order("created_at");
    if (!ld || ld.length === 0) return;
    const bookings = [...new Set(ld.map(d => d.booking_no).filter(Boolean))].join(", ");
    const containers = [...new Set(ld.map(d => d.container_no).filter(Boolean))].join(", ");
    const typeCount = {};
    ld.forEach(d => { if (d.container_type) typeCount[d.container_type] = (typeCount[d.container_type]||0)+1; });
    const qtyStr = Object.entries(typeCount).map(([t,c]) => `${c}x${t}`).join(", ");
    const updates = {};
    if (bookings) updates.booking_no = bookings;
    if (containers) updates.container_no = containers;
    if (qtyStr) updates.qty_container = qtyStr;
    if (Object.keys(updates).length > 0) await supabase.from("shipments").update(updates).eq("id", shipment.id);
  };

  const addItem = async () => {
    if (!form.booking_no && !form.container_no) { alert("Booking No or Container No required"); return; }
    setSaving(true);
    const c = { ...form, shipment_id: shipment.id };
    ["booked_packages","actual_packages"].forEach(k => { c[k] = c[k]?parseInt(c[k]):null; });
    ["booked_weight","booked_volume","actual_weight","actual_volume"].forEach(k => { c[k] = c[k]?parseFloat(c[k]):null; });
    const { error } = await supabase.from("loading_details").insert(c);
    if (error) { alert(error.message); setSaving(false); return; }
    setForm({ booking_no:"",container_no:"",container_type:"40HQ",booked_packages:"",booked_weight:"",booked_volume:"",actual_packages:"",actual_weight:"",actual_volume:"",carton_size:"",notes:"" });
    setSaving(false); load(); await syncToShipment(); onSaved?.();
  };
  const deleteItem = async (id) => { if (!confirm("Delete?")) return; await supabase.from("loading_details").delete().eq("id",id); load(); await syncToShipment(); onSaved?.(); };
  const S = { width:"100%",padding:"6px 8px",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12,outline:"none",boxSizing:"border-box" };
  const L = { fontSize:10,fontWeight:600,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:3,display:"block" };
  const totals = useMemo(() => { const t={bp:0,bw:0,bv:0,ap:0,aw:0,av:0}; items.forEach(i=>{t.bp+=i.booked_packages||0;t.bw+=i.booked_weight||0;t.bv+=i.booked_volume||0;t.ap+=i.actual_packages||0;t.aw+=i.actual_weight||0;t.av+=i.actual_volume||0;}); return t; }, [items]);
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:800,maxHeight:"85vh",background:"#fff",borderRadius:12,overflow:"auto",padding:24 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <div><h2 style={{ fontSize:17,fontWeight:700,margin:0 }}>Loading Details — {shipment.po}</h2><p style={{ fontSize:12,color:"#64748b",margin:"3px 0 0" }}>{shipment.tuc||""}</p></div>
          <button onClick={onClose} style={{ border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8" }}>✕</button>
        </div>
        {crossWarnings.length > 0 && <div style={{ padding:"10px 14px",borderRadius:8,background:"#fef9c3",border:"1px solid #fde68a",marginBottom:16 }}><div style={{ fontSize:12,fontWeight:600,color:"#92400e" }}>⚠ Cross-container alert</div>{crossWarnings.map(w=><div key={w.booking_no} style={{ fontSize:12,color:"#92400e",marginTop:4 }}>Booking <strong>{w.booking_no}</strong> is also used by {w.count} other PO(s)</div>)}</div>}
        {!loading && items.length > 0 && <div style={{ marginBottom:20,overflowX:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}><thead><tr style={{ background:"#f8fafc" }}>{["Booking","Container","Type","Bkd Pkg","Bkd Wt","Bkd Vol","Act Pkg","Act Wt","Act Vol","Carton",""].map(h=><th key={h} style={{ padding:"8px 6px",textAlign:"left",fontWeight:600,color:"#64748b",fontSize:10.5,borderBottom:"1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{items.map(item=><tr key={item.id} style={{ borderBottom:"1px solid #f1f5f9" }}><td style={{ padding:"8px 6px",fontWeight:600,color:"#0ea5e9" }}>{item.booking_no||"—"}</td><td style={{ padding:"8px 6px" }}>{item.container_no||"—"}</td><td style={{ padding:"8px 6px" }}>{item.container_type||"—"}</td><td style={{ padding:"8px 6px" }}>{item.booked_packages??"—"}</td><td style={{ padding:"8px 6px" }}>{item.booked_weight??"—"}</td><td style={{ padding:"8px 6px" }}>{item.booked_volume??"—"}</td><td style={{ padding:"8px 6px",fontWeight:600,color:item.actual_packages!==item.booked_packages?"#dc2626":"#059669" }}>{item.actual_packages??"—"}</td><td style={{ padding:"8px 6px",fontWeight:600,color:item.actual_weight!==item.booked_weight?"#dc2626":"#059669" }}>{item.actual_weight??"—"}</td><td style={{ padding:"8px 6px",fontWeight:600,color:item.actual_volume!==item.booked_volume?"#dc2626":"#059669" }}>{item.actual_volume??"—"}</td><td style={{ padding:"8px 6px",fontSize:11 }}>{item.carton_size||"—"}</td><td style={{ padding:"8px 6px" }}><button onClick={()=>deleteItem(item.id)} style={{ border:"none",background:"none",color:"#ef4444",fontSize:11,cursor:"pointer",fontWeight:600 }}>Del</button></td></tr>)}<tr style={{ background:"#f0f9ff",fontWeight:700 }}><td style={{ padding:"8px 6px" }} colSpan={3}>TOTAL</td><td style={{ padding:"8px 6px" }}>{totals.bp}</td><td style={{ padding:"8px 6px" }}>{totals.bw}</td><td style={{ padding:"8px 6px" }}>{totals.bv}</td><td style={{ padding:"8px 6px",color:totals.ap!==totals.bp?"#dc2626":"#059669" }}>{totals.ap}</td><td style={{ padding:"8px 6px",color:totals.aw!==totals.bw?"#dc2626":"#059669" }}>{totals.aw}</td><td style={{ padding:"8px 6px",color:totals.av!==totals.bv?"#dc2626":"#059669" }}>{totals.av}</td><td colSpan={2}/></tr></tbody></table></div>}
        <div style={{ background:"#f8fafc",borderRadius:10,padding:16,border:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:13,fontWeight:600,marginBottom:12,color:"#0f172a" }}>Add Loading Record</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10 }}>
            <div><label style={L}>Booking No</label><input value={form.booking_no} onChange={e=>setForm(p=>({...p,booking_no:e.target.value}))} style={S}/></div>
            <div><label style={L}>Container No</label><input value={form.container_no} onChange={e=>setForm(p=>({...p,container_no:e.target.value}))} style={S}/></div>
            <div><label style={L}>Container Type</label><select value={form.container_type} onChange={e=>setForm(p=>({...p,container_type:e.target.value}))} style={{...S,cursor:"pointer"}}>{["20GP","40GP","40HQ","45HQ","20OT","40OT","20FR","40FR"].map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={L}>Carton Size</label><input value={form.carton_size} onChange={e=>setForm(p=>({...p,carton_size:e.target.value}))} style={S} placeholder="60x40x30cm"/></div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr",gap:10,marginTop:10 }}>
            <div><label style={L}>Bkd Pkg</label><input type="number" value={form.booked_packages} onChange={e=>setForm(p=>({...p,booked_packages:e.target.value}))} style={S}/></div>
            <div><label style={L}>Bkd Wt</label><input type="number" value={form.booked_weight} onChange={e=>setForm(p=>({...p,booked_weight:e.target.value}))} style={S}/></div>
            <div><label style={L}>Bkd Vol</label><input type="number" value={form.booked_volume} onChange={e=>setForm(p=>({...p,booked_volume:e.target.value}))} style={S}/></div>
            <div><label style={L}>Act Pkg</label><input type="number" value={form.actual_packages} onChange={e=>setForm(p=>({...p,actual_packages:e.target.value}))} style={S}/></div>
            <div><label style={L}>Act Wt</label><input type="number" value={form.actual_weight} onChange={e=>setForm(p=>({...p,actual_weight:e.target.value}))} style={S}/></div>
            <div><label style={L}>Act Vol</label><input type="number" value={form.actual_volume} onChange={e=>setForm(p=>({...p,actual_volume:e.target.value}))} style={S}/></div>
          </div>
          <div style={{ marginTop:10 }}><label style={L}>Notes</label><input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={S}/></div>
          <div style={{ marginTop:12,display:"flex",justifyContent:"flex-end" }}><button onClick={addItem} disabled={saving} style={{ padding:"8px 20px",borderRadius:7,border:"none",background:"#0ea5e9",color:"#fff",fontSize:12.5,fontWeight:600,cursor:saving?"wait":"pointer" }}>{saving?"Adding...":"Add Record"}</button></div>
        </div>
      </div>
    </div>
  );
}

// ─── Carrier Modal (with Agents) ───
function CarrierModal({ onClose }) {
  const [items, setItems] = useState([]); const [newName, setNewName] = useState(""); const [newAgent, setNewAgent] = useState(""); const [editingAgents, setEditingAgents] = useState(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const { data } = await supabase.from("carriers").select("*").order("name"); setItems(data||[]); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);
  const addCarrier = async () => { if (!newName.trim()) return; const { error } = await supabase.from("carriers").insert({name:newName.trim()}); if (error) {alert(error.message);return;} setNewName(""); load(); };
  const deleteCarrier = async (id) => { if (!confirm("Delete?")) return; await supabase.from("carriers").delete().eq("id",id); load(); };
  const addAgent = async (id,cur) => { if (!newAgent.trim()) return; await supabase.from("carriers").update({agents:[...(cur||[]),newAgent.trim()]}).eq("id",id); setNewAgent(""); load(); };
  const removeAgent = async (id,cur,a) => { await supabase.from("carriers").update({agents:(cur||[]).filter(x=>x!==a)}).eq("id",id); load(); };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:500,maxHeight:"75vh",background:"#fff",borderRadius:12,overflow:"auto",padding:24 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}><h2 style={{ fontSize:16,fontWeight:700,margin:0 }}>Manage Carriers & Agents</h2><button onClick={onClose} style={{ border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8" }}>✕</button></div>
        <div style={{ display:"flex",gap:8,marginBottom:16 }}><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Add carrier..." onKeyDown={e=>e.key==="Enter"&&addCarrier()} style={{ flex:1,padding:"8px 12px",borderRadius:7,border:"1px solid #e2e8f0",fontSize:13,outline:"none" }}/><button onClick={addCarrier} style={{ padding:"8px 16px",borderRadius:7,border:"none",background:"#0ea5e9",color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer" }}>Add</button></div>
        {loading?<p style={{ color:"#94a3b8",fontSize:13 }}>Loading...</p>:<div style={{ maxHeight:400,overflowY:"auto" }}>{items.map(item=><div key={item.id} style={{ padding:"10px 0",borderBottom:"1px solid #f1f5f9" }}><div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}><span style={{ fontSize:13,fontWeight:600 }}>{item.name}</span><div style={{ display:"flex",gap:8 }}><button onClick={()=>setEditingAgents(editingAgents===item.id?null:item.id)} style={{ border:"none",background:"none",color:"#0ea5e9",fontSize:12,cursor:"pointer",fontWeight:600 }}>{editingAgents===item.id?"Hide":`Agents (${(item.agents||[]).length})`}</button><button onClick={()=>deleteCarrier(item.id)} style={{ border:"none",background:"none",color:"#ef4444",fontSize:12,cursor:"pointer",fontWeight:600 }}>Del</button></div></div>{editingAgents===item.id&&<div style={{ marginTop:8,paddingLeft:12,borderLeft:"2px solid #e2e8f0" }}>{(item.agents||[]).map(a=><div key={a} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0" }}><span style={{ fontSize:12,color:"#475569" }}>{item.name}-{a}</span><button onClick={()=>removeAgent(item.id,item.agents,a)} style={{ border:"none",background:"none",color:"#ef4444",fontSize:11,cursor:"pointer" }}>✕</button></div>)}<div style={{ display:"flex",gap:6,marginTop:6 }}><input value={newAgent} onChange={e=>setNewAgent(e.target.value)} placeholder="Agent name" onKeyDown={e=>e.key==="Enter"&&addAgent(item.id,item.agents)} style={{ flex:1,padding:"5px 8px",borderRadius:5,border:"1px solid #e2e8f0",fontSize:12,outline:"none" }}/><button onClick={()=>addAgent(item.id,item.agents)} style={{ padding:"5px 12px",borderRadius:5,border:"none",background:"#10b981",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer" }}>Add</button></div></div>}</div>)}</div>}
      </div>
    </div>
  );
}

// ─── Supplier Modal (CN + EN) ───
function SupplierModal({ onClose }) {
  const [items, setItems] = useState([]); const [nameEN, setNameEN] = useState(""); const [nameCN, setNameCN] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const { data } = await supabase.from("suppliers").select("*").order("name"); setItems(data||[]); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);
  const addItem = async () => { if (!nameEN.trim()) return; const { error } = await supabase.from("suppliers").insert({name:nameEN.trim(),name_cn:nameCN.trim()||null}); if (error) {alert(error.message);return;} setNameEN(""); setNameCN(""); load(); };
  const deleteItem = async (id) => { if (!confirm("Delete?")) return; await supabase.from("suppliers").delete().eq("id",id); load(); };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:500,maxHeight:"75vh",background:"#fff",borderRadius:12,overflow:"auto",padding:24 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}><h2 style={{ fontSize:16,fontWeight:700,margin:0 }}>Manage Suppliers</h2><button onClick={onClose} style={{ border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8" }}>✕</button></div>
        <div style={{ display:"flex",gap:8,marginBottom:16,flexWrap:"wrap" }}>
          <input value={nameEN} onChange={e=>setNameEN(e.target.value)} placeholder="English name (required)" onKeyDown={e=>e.key==="Enter"&&addItem()} style={{ flex:1,minWidth:140,padding:"8px 12px",borderRadius:7,border:"1px solid #e2e8f0",fontSize:13,outline:"none" }}/>
          <input value={nameCN} onChange={e=>setNameCN(e.target.value)} placeholder="中文名称 (optional)" onKeyDown={e=>e.key==="Enter"&&addItem()} style={{ flex:1,minWidth:140,padding:"8px 12px",borderRadius:7,border:"1px solid #e2e8f0",fontSize:13,outline:"none" }}/>
          <button onClick={addItem} style={{ padding:"8px 16px",borderRadius:7,border:"none",background:"#0ea5e9",color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer" }}>Add</button>
        </div>
        {loading?<p style={{ color:"#94a3b8",fontSize:13 }}>Loading...</p>:<div style={{ maxHeight:350,overflowY:"auto" }}>{items.map(item=><div key={item.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f1f5f9" }}><div><span style={{ fontSize:13,fontWeight:600 }}>{item.name}</span>{item.name_cn && <span style={{ fontSize:12,color:"#94a3b8",marginLeft:8 }}>{item.name_cn}</span>}</div><button onClick={()=>deleteItem(item.id)} style={{ border:"none",background:"none",color:"#ef4444",fontSize:12,cursor:"pointer",fontWeight:600 }}>Del</button></div>)}{items.length===0&&<p style={{ color:"#94a3b8",fontSize:13 }}>No suppliers yet.</p>}</div>}
      </div>
    </div>
  );
}

// ─── Generic Ref Modal ───
function RefDataModal({ table, title, onClose }) {
  const [items, setItems] = useState([]); const [newName, setNewName] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const { data } = await supabase.from(table).select("*").order("name"); setItems(data||[]); setLoading(false); }, [table]);
  useEffect(() => { load(); }, [load]);
  const addItem = async () => { if (!newName.trim()) return; const d = table==="ports"?{name:newName.trim(),code:newName.trim().substring(0,5).toUpperCase()}:{name:newName.trim()}; const { error } = await supabase.from(table).insert(d); if (error) {alert(error.message);return;} setNewName(""); load(); };
  const deleteItem = async (id) => { if (!confirm("Delete?")) return; await supabase.from(table).delete().eq("id",id); load(); };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:420,maxHeight:"70vh",background:"#fff",borderRadius:12,overflow:"auto",padding:24 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}><h2 style={{ fontSize:16,fontWeight:700,margin:0 }}>Manage {title}</h2><button onClick={onClose} style={{ border:"none",background:"none",fontSize:20,cursor:"pointer",color:"#94a3b8" }}>✕</button></div>
        <div style={{ display:"flex",gap:8,marginBottom:16 }}><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder={`Add ${title.toLowerCase()}...`} onKeyDown={e=>e.key==="Enter"&&addItem()} style={{ flex:1,padding:"8px 12px",borderRadius:7,border:"1px solid #e2e8f0",fontSize:13,outline:"none" }}/><button onClick={addItem} style={{ padding:"8px 16px",borderRadius:7,border:"none",background:"#0ea5e9",color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer" }}>Add</button></div>
        {loading?<p style={{ color:"#94a3b8",fontSize:13 }}>Loading...</p>:<div style={{ maxHeight:350,overflowY:"auto" }}>{items.map(item=><div key={item.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f1f5f9" }}><span style={{ fontSize:13,fontWeight:500 }}>{item.name}</span><button onClick={()=>deleteItem(item.id)} style={{ border:"none",background:"none",color:"#ef4444",fontSize:12,cursor:"pointer",fontWeight:600 }}>Del</button></div>)}{items.length===0&&<p style={{ color:"#94a3b8",fontSize:13 }}>No items yet.</p>}</div>}
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
  const [filters, setFilters] = useState({ qc_status:"All",space_status:"All",local_payment:"All",telex_release:"All",incoterms:"All",bl_status:"All",customer:"All" });
  const [textFilters, setTextFilters] = useState({ booking_no:"",container_no:"",vessel:"",end_customer:"",supplier:"" });
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [refDataModal, setRefDataModal] = useState(null);
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [refData, setRefData] = useState({ suppliers:[],customers:[],carriers:[],carriersWithAgents:[],ports:[],endCustomers:[] });
  const [loadingDetailShipment, setLoadingDetailShipment] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());

  const isAdmin = user?.profile?.role === "admin";
  const selectedOrder = shipments.find(o => o.id === selectedId);

  const loadRefData = useCallback(async () => {
    const [s,cu,ca,p,ec] = await Promise.all([supabase.from("suppliers").select("*").order("name"),supabase.from("customers").select("name").order("name"),supabase.from("carriers").select("*").order("name"),supabase.from("ports").select("name,code").order("name"),supabase.from("end_customers").select("name").order("name")]);
    setRefData({ suppliers:(s.data||[]).map(x=>x.name), suppliersRaw:s.data||[], customers:(cu.data||[]).map(x=>x.name), carriers:(ca.data||[]).map(x=>x.name), carriersWithAgents:ca.data||[], ports:(p.data||[]).map(x=>`${x.name} (${x.code})`), endCustomers:(ec.data||[]).map(x=>x.name) });
  }, []);
  const loadShipments = useCallback(async () => { const { data } = await supabase.from("shipments").select("*").order("created_at",{ascending:false}); setShipments(data||[]); setLoading(false); }, []);
  const loadLogs = useCallback(async () => { const { data } = await supabase.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(200); setLogs(data||[]); }, []);
  useEffect(() => { if (user) { loadRefData(); loadShipments(); loadLogs(); } }, [user,loadRefData,loadShipments,loadLogs]);

  const handleCreateShipment = async (form) => { form.created_by=user.id; const { error } = await supabase.from("shipments").insert(form); if (error) {alert(error.message);return;} setShowNewModal(false); loadShipments(); };
  const handleUpdateField = async (sid,field,oldV,newV) => { if (oldV===newV) return; const { error } = await supabase.from("shipments").update({[field]:newV}).eq("id",sid); if (error) {alert(error.message);return;} await supabase.from("audit_logs").insert({shipment_id:sid,user_id:user.id,user_email:user.email,field_name:FIELD_LABELS[field]||field,old_value:oldV||"",new_value:newV||""}); loadShipments(); loadLogs(); };

  const toggleCheck = (id) => setCheckedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleCheckAll = () => { if (checkedIds.size === filtered.length) setCheckedIds(new Set()); else setCheckedIds(new Set(filtered.map(o=>o.id))); };
  const handleBatchDelete = async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`Delete ${checkedIds.size} shipment(s)? This cannot be undone.`)) return;
    for (const id of checkedIds) {
      await supabase.from("audit_logs").delete().eq("shipment_id", id);
      await supabase.from("loading_details").delete().eq("shipment_id", id);
      await supabase.from("shipments").delete().eq("id", id);
    }
    setCheckedIds(new Set()); loadShipments(); loadLogs();
  };
  const handleBatchDuplicate = async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`Duplicate ${checkedIds.size} shipment(s)?`)) return;
    for (const id of checkedIds) {
      const orig = shipments.find(s => s.id === id);
      if (!orig) continue;
      const copy = { ...orig };
      delete copy.id; delete copy.created_at; delete copy.updated_at;
      copy.po = (copy.po || "") + " (COPY)";
      copy.created_by = user.id;
      await supabase.from("shipments").insert(copy);
    }
    setCheckedIds(new Set()); loadShipments();
  };

  const setFilter = (k,v) => setFilters(p=>({...p,[k]:v}));
  const setTextFilter = (k,v) => setTextFilters(p=>({...p,[k]:v}));
  const activeFilterCount = Object.values(filters).filter(v=>v!=="All").length + Object.values(textFilters).filter(v=>v).length + (search?1:0);
  const clearFilters = () => { setFilters({qc_status:"All",space_status:"All",local_payment:"All",telex_release:"All",incoterms:"All",bl_status:"All",customer:"All"}); setTextFilters({booking_no:"",container_no:"",vessel:"",end_customer:"",supplier:""}); setSearch(""); };
  const handleStatClick = (type) => { clearFilters(); setView("orders"); setSelectedId(null); if (type==="paymentDue") setFilters(p=>({...p,local_payment:"Waiting"})); if (type==="telexPending") setFilters(p=>({...p,telex_release:"Pending"})); if (type==="blPending") setFilters(p=>({...p,bl_status:"Not Ready"})); };

  const customerList = useMemo(() => [...new Set(shipments.map(o=>o.customer).filter(Boolean))], [shipments]);
  const filtered = useMemo(() => shipments.filter(o => {
    for (const key of Object.keys(STATUS_CONFIGS)) { if (filters[key]!=="All"&&o[key]!==filters[key]) return false; }
    if (filters.customer!=="All"&&o.customer!==filters.customer) return false;
    if (textFilters.booking_no&&!(o.booking_no||"").toLowerCase().includes(textFilters.booking_no.toLowerCase())) return false;
    if (textFilters.container_no&&!(o.container_no||"").toLowerCase().includes(textFilters.container_no.toLowerCase())) return false;
    if (textFilters.vessel&&!(o.vessel||"").toLowerCase().includes(textFilters.vessel.toLowerCase())) return false;
    if (textFilters.end_customer&&!(o.end_customer||"").toLowerCase().includes(textFilters.end_customer.toLowerCase())) return false;
    if (textFilters.supplier&&!(o.supplier||"").toLowerCase().includes(textFilters.supplier.toLowerCase())) return false;
    if (search) { const s=search.toLowerCase(); return [o.po,o.tuc,o.sku,o.carrier,o.customer_po,o.customer,o.supplier,o.booking_no,o.vessel,o.container_no].some(v=>(v||"").toLowerCase().includes(s)); }
    return true;
  }), [shipments,filters,textFilters,search]);

  const orderLogs = useMemo(() => selectedOrder?logs.filter(l=>l.shipment_id===selectedOrder.id):logs, [logs,selectedOrder]);
  const stats = useMemo(() => ({total:shipments.length,qcPending:shipments.filter(o=>o.qc_status!=="QC Approved").length,paymentDue:shipments.filter(o=>o.local_payment==="Waiting").length,telexPending:shipments.filter(o=>o.telex_release==="Pending").length,blPending:shipments.filter(o=>o.bl_status!=="Done").length}), [shipments]);

  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif",background:"#f0f2f5",minHeight:"100vh",color:"#1e293b" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      {/* Top Bar */}
      <div style={{ background:"#0c1222",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}><FobcargoLogo size={32}/><span style={{ color:"#e2e8f0",fontSize:16,fontWeight:700,letterSpacing:-0.3 }}>Fobcargo</span></div>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ color:"#94a3b8",fontSize:12 }}>{user.email}</span>
          <span style={{ padding:"3px 8px",borderRadius:4,fontSize:10,fontWeight:700,textTransform:"uppercase",background:isAdmin?"#0ea5e920":"#10b98120",color:isAdmin?"#0ea5e9":"#10b981" }}>{user.profile?.role||"user"}</span>
          <button onClick={()=>{supabase.auth.signOut();setUser(null);}} style={{ padding:"5px 12px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",fontSize:11,fontWeight:600,cursor:"pointer" }}>Logout</button>
        </div>
      </div>
      <div style={{ display:"flex",minHeight:"calc(100vh - 52px)" }}>
        {/* Sidebar */}
        <div style={{ width:192,background:"#fff",borderRight:"1px solid #e2e8f0",padding:"12px 8px",display:"flex",flexDirection:"column",gap:2,flexShrink:0 }}>
          {[{key:"orders",icon:"📦",label:"Shipments"},{key:"logs",icon:"📋",label:"Audit Log"}].map(item=>(
            <button key={item.key} onClick={()=>{setView(item.key);setSelectedId(null);}} style={{ display:"flex",alignItems:"center",gap:9,padding:"9px 12px",border:"none",borderRadius:7,cursor:"pointer",fontSize:13,fontWeight:500,width:"100%",textAlign:"left",background:view===item.key?"#f0f9ff":"transparent",color:view===item.key?"#0369a1":"#64748b" }}><span style={{ fontSize:15 }}>{item.icon}</span>{item.label}</button>
          ))}
          {isAdmin&&<>
            <div style={{ margin:"14px 4px 6px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1 }}>Manage</div>
            <button onClick={()=>setShowSupplierModal(true)} style={{ display:"flex",alignItems:"center",gap:9,padding:"7px 12px",border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:500,width:"100%",textAlign:"left",background:"transparent",color:"#94a3b8" }}>⚙ Suppliers</button>
            {[{t:"customers",l:"Customers"},{t:"end_customers",l:"End Customers"},{t:"ports",l:"Ports"}].map(item=><button key={item.t} onClick={()=>setRefDataModal(item)} style={{ display:"flex",alignItems:"center",gap:9,padding:"7px 12px",border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:500,width:"100%",textAlign:"left",background:"transparent",color:"#94a3b8" }}>⚙ {item.l}</button>)}
            <button onClick={()=>setShowCarrierModal(true)} style={{ display:"flex",alignItems:"center",gap:9,padding:"7px 12px",border:"none",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:500,width:"100%",textAlign:"left",background:"transparent",color:"#94a3b8" }}>⚙ Carriers & Agents</button>
          </>}
          <div style={{ margin:"14px 4px 6px",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1 }}>Overview</div>
          <div style={{ display:"flex",flexDirection:"column",gap:6,padding:"0 4px" }}>
            {[{l:"Total",v:stats.total,c:"#0ea5e9",click:()=>{clearFilters();setView("orders");setSelectedId(null);}},{l:"QC Pending",v:stats.qcPending,c:"#f59e0b",click:()=>handleStatClick("qcPending")},{l:"Payment Due",v:stats.paymentDue,c:"#ef4444",click:()=>handleStatClick("paymentDue")},{l:"Telex Pending",v:stats.telexPending,c:"#8b5cf6",click:()=>handleStatClick("telexPending")},{l:"B/L Pending",v:stats.blPending,c:"#0891b2",click:()=>handleStatClick("blPending")}].map(s=>(
              <div key={s.l} onClick={s.click} style={{ padding:"8px 10px",borderRadius:7,background:"#f8fafc",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"background 0.1s" }} onMouseEnter={e=>e.currentTarget.style.background="#e0f2fe"} onMouseLeave={e=>e.currentTarget.style.background="#f8fafc"}>
                <span style={{ fontSize:11,color:"#64748b",fontWeight:500 }}>{s.l}</span>
                <span style={{ fontSize:18,fontWeight:700,color:s.c,fontFamily:"'DM Mono',monospace" }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Main */}
        <div style={{ flex:1,padding:20,overflowX:"auto" }}>
          {loading&&<div style={{ textAlign:"center",padding:60,color:"#94a3b8" }}>Loading...</div>}

          {/* LIST */}
          {!loading&&view==="orders"&&!selectedOrder&&<>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16 }}>
              <div><h1 style={{ fontSize:20,fontWeight:700,margin:0 }}>Shipments</h1><p style={{ fontSize:12,color:"#94a3b8",margin:"3px 0 0" }}>{filtered.length} of {shipments.length} records{activeFilterCount>0&&<span style={{ color:"#0ea5e9",fontWeight:600 }}> · {activeFilterCount} filter{activeFilterCount>1?"s":""} active</span>}</p></div>
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>exportToExcel(filtered,`Fobcargo_Export_${new Date().toISOString().slice(0,10)}`)} style={{ padding:"8px 16px",borderRadius:7,border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:12.5,fontWeight:600,cursor:"pointer" }}>↓ Export CSV</button>
                {isAdmin&&<button onClick={()=>setShowNewModal(true)} style={{ padding:"8px 18px",borderRadius:7,border:"none",background:"#0ea5e9",color:"#fff",fontSize:12.5,fontWeight:600,cursor:"pointer" }}>+ New Shipment</button>}
              </div>
            </div>
            {/* Filters */}
            <div style={{ background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"12px 14px",marginBottom:14 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                <span style={{ fontSize:12,fontWeight:600,color:"#64748b",marginRight:4 }}>Filters</span>
                <input placeholder="Search PO#, product, SKU..." value={search} onChange={e=>setSearch(e.target.value)} style={{ padding:"6px 10px",borderRadius:6,border:search?"2px solid #0ea5e9":"1px solid #e2e8f0",fontSize:12,width:180,outline:"none",background:search?"#f0f9ff":"#fff" }}/>
                {Object.entries(STATUS_CONFIGS).map(([key,cfg])=><FilterDropdown key={key} label={cfg.label} value={filters[key]} options={cfg.options} onChange={v=>setFilter(key,v)}/>)}
                {isAdmin&&<FilterDropdown label="Customer" value={filters.customer} options={customerList} onChange={v=>setFilter("customer",v)}/>}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:8 }}>
                {[{k:"booking_no",p:"Booking No..."},{k:"container_no",p:"Container No..."},{k:"vessel",p:"Vessel..."},{k:"end_customer",p:"End Customer..."},{k:"supplier",p:"Supplier..."}].map(f=>
                  <input key={f.k} placeholder={f.p} value={textFilters[f.k]} onChange={e=>setTextFilter(f.k,e.target.value)} style={{ padding:"6px 10px",borderRadius:6,border:textFilters[f.k]?"2px solid #0ea5e9":"1px solid #e2e8f0",fontSize:12,width:130,outline:"none",background:textFilters[f.k]?"#f0f9ff":"#fff" }}/>
                )}
                {activeFilterCount>0&&<button onClick={clearFilters} style={{ padding:"5px 10px",borderRadius:6,border:"1px solid #fee2e2",background:"#fef2f2",color:"#dc2626",fontSize:11,fontWeight:600,cursor:"pointer" }}>✕ Clear all</button>}
              </div>
            </div>
            {/* Batch Actions */}
            {checkedIds.size > 0 && isAdmin && (
              <div style={{ background:"#0f172a",borderRadius:10,padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <span style={{ color:"#e2e8f0",fontSize:13,fontWeight:600 }}>{checkedIds.size} selected</span>
                <div style={{ display:"flex",gap:8 }}>
                  <button onClick={handleBatchDuplicate} style={{ padding:"6px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",fontSize:12,fontWeight:600,cursor:"pointer" }}>Duplicate</button>
                  <button onClick={handleBatchDelete} style={{ padding:"6px 14px",borderRadius:6,border:"1px solid #7f1d1d",background:"#450a0a",color:"#fca5a5",fontSize:12,fontWeight:600,cursor:"pointer" }}>Delete</button>
                  <button onClick={()=>setCheckedIds(new Set())} style={{ padding:"6px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#64748b",fontSize:12,fontWeight:600,cursor:"pointer" }}>Cancel</button>
                </div>
              </div>
            )}
            {/* Table */}
            <div style={{ background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1680 }}>
                <thead><tr style={{ background:"#f8fafc" }}>
                  {isAdmin&&<th style={{ padding:"10px 4px 10px 10px",borderBottom:"1px solid #e2e8f0",width:32 }}><input type="checkbox" checked={filtered.length>0&&checkedIds.size===filtered.length} onChange={toggleCheckAll} style={{ cursor:"pointer",width:15,height:15 }}/></th>}
                  {["PO#","Cust PO#","TUC / Description","Supplier","Customer","Route","Carrier","Booking","Cntr No","Cntr Qty","Vessel","ETD","ETA","QC","Space","Pay","Telex","B/L"].map(h=><th key={h} style={{ padding:"10px 7px",textAlign:"left",fontWeight:600,color:"#64748b",fontSize:10.5,borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={isAdmin?19:18} style={{ padding:40,textAlign:"center",color:"#94a3b8" }}>No shipments found</td></tr>}
                  {filtered.map((o,i)=><tr key={o.id} style={{ cursor:"pointer",borderBottom:i<filtered.length-1?"1px solid #f1f5f9":"none",background:checkedIds.has(o.id)?"#f0f9ff":"transparent" }} onMouseEnter={e=>{if(!checkedIds.has(o.id))e.currentTarget.style.background="#f8fafc"}} onMouseLeave={e=>{if(!checkedIds.has(o.id))e.currentTarget.style.background="transparent"}}>
                    {isAdmin&&<td style={{ padding:"10px 4px 10px 10px" }} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(o.id)} onChange={()=>toggleCheck(o.id)} style={{ cursor:"pointer",width:15,height:15 }}/></td>}
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontWeight:600,color:"#0ea5e9",fontFamily:"'DM Mono',monospace",fontSize:11.5 }}>{o.po||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontSize:11,color:"#64748b",fontFamily:"'DM Mono',monospace" }}>{o.customer_po||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",maxWidth:150 }}><div style={{ fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:11.5 }}>{o.tuc||"—"}</div>{o.sku&&<div style={{ fontSize:10,color:"#94a3b8",fontFamily:"'DM Mono',monospace" }}>{o.sku}</div>}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontSize:11.5 }}>{o.supplier||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px" }}><div style={{ fontWeight:500,fontSize:11.5 }}>{o.customer||"—"}</div>{isAdmin&&o.end_customer&&<div style={{ fontSize:10,color:"#94a3b8" }}>→ {o.end_customer}</div>}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontSize:11,whiteSpace:"nowrap" }}>{o.pol&&o.pod?<><span style={{ fontWeight:500 }}>{(o.pol||"").split("(")[0].trim()}</span><span style={{ color:"#94a3b8",margin:"0 2px" }}>→</span><span style={{ fontWeight:500 }}>{(o.pod||"").split("(")[0].trim()}</span></>:"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontSize:11.5 }}><div style={{ fontWeight:500 }}>{o.carrier||"—"}</div>{o.carrier_agent&&<div style={{ fontSize:10,color:"#6366f1" }}>{o.carrier_agent}</div>}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#475569" }}>{o.booking_no||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontFamily:"'DM Mono',monospace",fontSize:11,color:"#475569" }}>{o.container_no||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontSize:11,color:"#475569" }}>{o.qty_container||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontSize:11,color:"#475569",maxWidth:110,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{o.vessel||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontFamily:"'DM Mono',monospace",fontSize:11 }}>{o.etd||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px",fontFamily:"'DM Mono',monospace",fontSize:11 }}>{o.eta||"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px" }}>{o.qc_status?<Badge value={o.qc_status} small/>:"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px" }}>{o.space_status?<Badge value={o.space_status} small/>:"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px" }}>{o.local_payment?<Badge value={o.local_payment} small/>:"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px" }}>{o.telex_release?<Badge value={o.telex_release} small/>:"—"}</td>
                    <td onClick={()=>setSelectedId(o.id)} style={{ padding:"10px 7px" }}>{o.bl_status?<Badge value={o.bl_status} small/>:"—"}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </>}

          {/* DETAIL */}
          {!loading&&view==="orders"&&selectedOrder&&<>
            <button onClick={()=>setSelectedId(null)} style={{ display:"flex",alignItems:"center",gap:5,padding:"6px 0",border:"none",background:"none",color:"#0ea5e9",fontSize:12.5,fontWeight:600,cursor:"pointer",marginBottom:12 }}>← Back</button>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
              <div><h1 style={{ fontSize:20,fontWeight:700,margin:0,fontFamily:"'DM Mono',monospace" }}>{selectedOrder.po||"No PO#"}</h1><p style={{ fontSize:13,color:"#64748b",margin:"3px 0 0" }}>{selectedOrder.tuc||""}</p></div>
              <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>{Object.keys(STATUS_CONFIGS).map(k=>selectedOrder[k]?<Badge key={k} value={selectedOrder[k]}/>:null)}</div>
            </div>
            <div style={{ display:"flex",gap:10,marginBottom:20,flexWrap:"wrap" }}>
              {Object.entries(STATUS_CONFIGS).map(([key,cfg])=>{const val=selectedOrder[key];const editable=isAdmin||(!isAdmin&&key==="qc_status");return(
                <div key={key} style={{ background:"#fff",borderRadius:8,padding:"10px 14px",border:editable?"2px solid #0ea5e9":"1px solid #e2e8f0",flex:"1 1 140px",minWidth:140 }}>
                  <div style={{ fontSize:10,fontWeight:600,color:"#8896a7",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6,display:"flex",justifyContent:"space-between" }}>{cfg.label}{editable&&<span style={{ fontSize:9,color:"#0ea5e9",fontWeight:700 }}>EDITABLE</span>}</div>
                  {editable?<select value={val||""} onChange={e=>handleUpdateField(selectedOrder.id,key,val,e.target.value)} style={{ width:"100%",padding:"5px 8px",borderRadius:5,border:"1px solid #bae6fd",background:"#f0f9ff",fontSize:12,fontWeight:600,outline:"none",cursor:"pointer",color:"#0c4a6e",boxSizing:"border-box" }}>{cfg.options.map(o=><option key={o}>{o}</option>)}</select>:val?<Badge value={val}/>:<span style={{ fontSize:12,color:"#cbd5e1" }}>—</span>}
                </div>
              );})}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:20 }}>
              <div style={{ background:"#fff",borderRadius:10,padding:18,border:"1px solid #e2e8f0" }}><SectionHeader icon="📄" title="Order References" accent="#0ea5e9"/><Field label="PO#" value={selectedOrder.po}/><Field label="Customer PO#" value={selectedOrder.customer_po}/><Field label="Supplier Order No#" value={selectedOrder.supplier_order_no}/><Field label="CRD Date" value={selectedOrder.crd_date}/><Field label="Incoterms" value={selectedOrder.incoterms}/></div>
              <div style={{ background:"#fff",borderRadius:10,padding:18,border:"1px solid #e2e8f0" }}><SectionHeader icon="🏢" title="Parties" accent="#10b981"/><Field label="Supplier" value={selectedOrder.supplier}/><Field label="Customer" value={selectedOrder.customer}/><Field label="End Customer" value={selectedOrder.end_customer}/></div>
              <div style={{ background:"#fff",borderRadius:10,padding:18,border:"1px solid #e2e8f0" }}><SectionHeader icon="📦" title="Cargo Details" accent="#f59e0b"/><Field label="TUC / Description" value={selectedOrder.tuc}/><Field label="SKU" value={selectedOrder.sku}/><Field label="QTY (Packages)" value={selectedOrder.qty_packages}/><Field label="Weight" value={selectedOrder.weight?`${selectedOrder.weight} kg`:null}/><Field label="Volume" value={selectedOrder.volume?`${selectedOrder.volume} m³`:null}/></div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20 }}>
              <div style={{ background:"#fff",borderRadius:10,padding:18,border:"1px solid #e2e8f0" }}><SectionHeader icon="🚢" title="Shipping Details" accent="#6366f1"/><div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px" }}><Field label="E-Booking No" value={selectedOrder.e_booking_no}/><Field label="Booking No" value={selectedOrder.booking_no}/><Field label="POL" value={selectedOrder.pol}/><Field label="POD" value={selectedOrder.pod}/><Field label="Carrier" value={selectedOrder.carrier}/><Field label="Agent" value={selectedOrder.carrier_agent}/><Field label="Container No" value={selectedOrder.container_no}/><Field label="QTY (Container)" value={selectedOrder.qty_container}/><Field label="Vessel" value={selectedOrder.vessel}/><Field label="ETD" value={selectedOrder.etd}/><Field label="ETA" value={selectedOrder.eta}/></div></div>
              <div style={{ background:"#fff",borderRadius:10,padding:18,border:"1px solid #e2e8f0" }}><SectionHeader icon="📝" title="Edit History" accent="#8b5cf6"/><div style={{ maxHeight:280,overflowY:"auto" }}>{orderLogs.length===0&&<p style={{ fontSize:12,color:"#94a3b8" }}>No edits yet.</p>}{orderLogs.map((log,i)=><div key={log.id||i} style={{ padding:"9px 0",borderBottom:i<orderLogs.length-1?"1px solid #f1f5f9":"none" }}><div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}><span style={{ fontSize:11.5,fontWeight:600,color:"#0ea5e9" }}>{log.user_email}</span><span style={{ fontSize:10.5,color:"#cbd5e1",fontFamily:"'DM Mono',monospace" }}>{new Date(log.created_at).toLocaleString()}</span></div><div style={{ fontSize:12,color:"#475569" }}><span style={{ fontWeight:600 }}>{log.field_name}</span>{log.old_value&&<span style={{ color:"#ef4444",textDecoration:"line-through",margin:"0 6px",fontSize:11 }}>{log.old_value}</span>}<span style={{ color:"#10b981",fontSize:11 }}>→ {log.new_value}</span></div></div>)}</div></div>
            </div>
            <div style={{ background:"#fff",borderRadius:10,padding:18,border:"2px solid #f59e0b" }}>
              <SectionHeader icon="📋" title="Loading Details" accent="#f59e0b" right={isAdmin&&<button onClick={()=>setLoadingDetailShipment(selectedOrder)} style={{ padding:"6px 14px",borderRadius:6,border:"none",background:"#f59e0b",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer" }}>+ Manage Loading</button>}/>
              <p style={{ fontSize:12,color:"#94a3b8" }}>Click "Manage Loading" to add or view loading records for this PO.</p>
            </div>
          </>}

          {/* LOGS */}
          {!loading&&view==="logs"&&<>
            <h1 style={{ fontSize:20,fontWeight:700,margin:"0 0 3px" }}>Audit Log</h1><p style={{ fontSize:12,color:"#94a3b8",margin:"0 0 16px" }}>Complete edit history</p>
            <div style={{ background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",overflow:"auto" }}><table style={{ width:"100%",borderCollapse:"collapse",fontSize:12.5,minWidth:600 }}><thead><tr style={{ background:"#f8fafc" }}>{["Time","User","Field","Change"].map(h=><th key={h} style={{ padding:"10px 14px",textAlign:"left",fontWeight:600,color:"#64748b",fontSize:11,borderBottom:"1px solid #e2e8f0" }}>{h}</th>)}</tr></thead><tbody>{logs.length===0&&<tr><td colSpan={4} style={{ padding:40,textAlign:"center",color:"#94a3b8" }}>No logs yet</td></tr>}{logs.map((log,i)=><tr key={log.id||i} style={{ borderBottom:i<logs.length-1?"1px solid #f1f5f9":"none" }}><td style={{ padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:11.5,color:"#94a3b8",whiteSpace:"nowrap" }}>{new Date(log.created_at).toLocaleString()}</td><td style={{ padding:"10px 14px" }}><span style={{ padding:"2px 8px",borderRadius:5,fontSize:11,fontWeight:600,background:"#f0f9ff",color:"#0369a1" }}>{log.user_email}</span></td><td style={{ padding:"10px 14px",fontWeight:500 }}>{log.field_name}</td><td style={{ padding:"10px 14px" }}>{log.old_value&&<span style={{ color:"#ef4444",textDecoration:"line-through",marginRight:8,fontSize:11.5 }}>{log.old_value}</span>}<span style={{ color:"#059669",fontSize:11.5 }}>→ {log.new_value}</span></td></tr>)}</tbody></table></div>
          </>}
        </div>
      </div>
      {showNewModal&&<NewShipmentModal onClose={()=>setShowNewModal(false)} onSave={handleCreateShipment} refData={refData}/>}
      {refDataModal&&<RefDataModal table={refDataModal.t} title={refDataModal.l} onClose={()=>{setRefDataModal(null);loadRefData();}}/>}
      {showCarrierModal&&<CarrierModal onClose={()=>{setShowCarrierModal(false);loadRefData();}}/>}
      {showSupplierModal&&<SupplierModal onClose={()=>{setShowSupplierModal(false);loadRefData();}}/>}
      {loadingDetailShipment&&<LoadingDetailModal shipment={loadingDetailShipment} onClose={()=>setLoadingDetailShipment(null)} onSaved={loadShipments}/>}
    </div>
  );
}
