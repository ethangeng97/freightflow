import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { Badge, Field, SectionHeader, Modal, Button, Input, Select, Spinner, EmptyState, FilterDropdown } from "../components/ui.jsx";
import { t, tSupplier } from "../lib/i18n.js";
import { isAdmin, canEditField } from "../lib/permissions.js";
import { STATUS_COLORS } from "../lib/constants.js";

export function ContainersPage({ user }) {
  const role = user.profile?.role || "operator";
  const [containers, setContainers] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  const load = useCallback(async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from("containers").select("*").order("created_at", { ascending: false }),
      supabase.from("container_types").select("*").order("sort_order"),
    ]);
    setContainers(c || []);
    setTypes(t || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const typeMap = useMemo(() => Object.fromEntries(types.map(t => [t.id, t.name])), [types]);

  const filtered = useMemo(() => containers.filter(c => {
    if (typeFilter !== "All") {
      const typeName = typeMap[c.type_id] || "";
      if (typeName !== typeFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const fields = [c.container_no, c.booking_no, c.vessel, c.carrier, c.customer, c.pol, c.pod].filter(Boolean);
      if (!fields.some(f => f.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [containers, search, typeFilter, typeMap]);

  const selected = containers.find(c => c.id === selectedId);

  const handleCreate = async (data) => {
    const { error } = await supabase.from("containers").insert(data);
    if (error) { alert(error.message); return; }
    setShowNew(false);
    load();
  };

  if (loading) return <Spinner />;

  if (selected) {
    return <ContainerDetail container={selected} types={types} typeMap={typeMap} role={role} user={user}
      onBack={() => { setSelectedId(null); load(); }} onReload={load} />;
  }

  const canCreate = role === "admin" || role === "operator" || role === "sales";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t("Containers")}</h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>{filtered.length} {t("条")}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && <Button onClick={() => setShowNew(true)}>+ {t("New Container")}</Button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Input placeholder={t("Search...")} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        <FilterDropdown label={t("Type")} value={typeFilter} options={types.map(t => t.name)} onChange={setTypeFilter} />
      </div>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            {[t("Container No"), t("Booking No"), t("Vessel"), t("Carrier"), t("Type"), t("Customer"), "POL → POD", "ETD", t("Notes")].map(h =>
              <th key={h} style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10.5, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("No containers found")}</td></tr>}
            {filtered.map((c, i) => (
              <tr key={c.id} onClick={() => setSelectedId(c.id)} style={{ cursor: "pointer", borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "8px", fontFamily: "'DM Mono',monospace", fontWeight: 600, color: "#0369a1" }}>{c.container_no || "—"}</td>
                <td style={{ padding: "8px", fontFamily: "'DM Mono',monospace" }}>{c.booking_no || "—"}</td>
                <td style={{ padding: "8px" }}>{c.vessel || "—"}</td>
                <td style={{ padding: "8px" }}>{c.carrier || "—"}</td>
                <td style={{ padding: "8px" }}>{typeMap[c.type_id] ? <Badge value={typeMap[c.type_id]} small /> : "—"}</td>
                <td style={{ padding: "8px" }}>{c.customer || "—"}</td>
                <td style={{ padding: "8px" }}>{c.pol && c.pod ? `${c.pol} → ${c.pod}` : "—"}</td>
                <td style={{ padding: "8px", fontFamily: "'DM Mono',monospace" }}>{c.etd || "—"}</td>
                <td style={{ padding: "8px", color: "#94a3b8", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NewContainerModal types={types} onClose={() => setShowNew(false)} onSave={handleCreate} />}
    </div>
  );
}

// =========================================================================
// Container Detail
// =========================================================================
function ContainerDetail({ container, types, typeMap, role, user, onBack, onReload }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [loadingItems, setLoadingItems] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const canEdit = role === "admin" || role === "operator" || role === "sales";

  const loadItems = useCallback(async () => {
    const { data } = await supabase.from("container_items").select("*").eq("container_id", container.id).order("sort_order").order("created_at");
    setItems(data || []);
    setLoadingItems(false);
  }, [container.id]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const startEdit = () => { setEditData({ ...container }); setEditing(true); };
  const cancelEdit = () => { setEditing(false); };
  const saveEdit = async () => {
    const changes = {};
    for (const k of Object.keys(editData)) {
      if (editData[k] !== container[k] && k !== "id" && k !== "created_at" && k !== "updated_at") {
        changes[k] = editData[k];
      }
    }
    if (Object.keys(changes).length > 0) {
      const { error } = await supabase.from("containers").update(changes).eq("id", container.id);
      if (error) { alert(error.message); return; }
    }
    setEditing(false);
    onReload();
  };
  const ed = (f) => editing ? (editData[f] ?? "") : null;
  const setEd = (f, v) => setEditData(p => ({ ...p, [f]: v }));

  const handleDeleteItem = async (itemId) => {
    if (!confirm("Delete this loading item?")) return;
    await supabase.from("container_items").delete().eq("id", itemId);
    loadItems();
  };

  const handleAddItem = async (item) => {
    const { error } = await supabase.from("container_items").insert({ ...item, container_id: container.id });
    if (error) { alert(error.message); return; }
    setShowAddItem(false);
    loadItems();
  };

  const handleUpdateItem = async (itemId, field, value) => {
    await supabase.from("container_items").update({ [field]: value }).eq("id", itemId);
    loadItems();
  };

  // Summary by supplier
  const supplierSummary = useMemo(() => {
    const map = {};
    for (const it of items) {
      const s = it.supplier || "Unknown";
      if (!map[s]) map[s] = { qty: 0, weight: 0, volume: 0, count: 0 };
      map[s].qty += Number(it.qty) || 0;
      map[s].weight += Number(it.weight) || 0;
      map[s].volume += Number(it.volume) || 0;
      map[s].count += 1;
    }
    return map;
  }, [items]);

  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const totalVolume = items.reduce((s, i) => s + (Number(i.volume) || 0), 0);

  // Auto-detect type
  const supplierCount = Object.keys(supplierSummary).length;
  const poCount = new Set(items.map(i => i.po).filter(Boolean)).size;
  const autoType = supplierCount > 1 || poCount > 1 ? "Console Box" : "FCL";

  const EditField = ({ label, field, type, options }) => {
    if (!editing) return <Field label={label} value={container[field]} />;
    if (options) return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
        <select value={ed(field)} onChange={e => setEd(field, e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", color: "#0c4a6e", boxSizing: "border-box" }}>
          <option value="">—</option>{options.map(o => <option key={typeof o === "object" ? o.id : o} value={typeof o === "object" ? o.id : o}>{typeof o === "object" ? o.name : o}</option>)}
        </select>
      </div>
    );
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
        <input type={type || "text"} value={ed(field)} onChange={e => setEd(field, e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", color: "#0c4a6e", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
      </div>
    );
  };

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0", border: "none", background: "none", color: "#0ea5e9", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>← {t("Back")}</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "'DM Mono',monospace" }}>{container.container_no || container.booking_no || "New Container"}</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "3px 0 0" }}>
            {container.vessel || ""} {container.etd ? `· ETD ${container.etd}` : ""}
            {typeMap[container.type_id] && <Badge value={typeMap[container.type_id]} small style={{ marginLeft: 8 }} />}
            <span style={{ marginLeft: 8, fontSize: 11, color: "#94a3b8" }}>({autoType})</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {canEdit && !editing && <Button small onClick={startEdit}>✎ {t("Edit")}</Button>}
          {editing && <><Button small onClick={saveEdit}>✓ {t("Save")}</Button><Button small variant="secondary" onClick={cancelEdit}>✕ {t("Cancel")}</Button></>}
        </div>
      </div>

      {/* Container info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #0ea5e9" : "1px solid #e2e8f0" }}>
          <SectionHeader icon="📦" title={t("Container Info")} accent="#0ea5e9" />
          <EditField label={t("Container No")} field="container_no" />
          <EditField label={t("QTY (Container)")} field="qty_container" />
          <EditField label={t("Seal No")} field="seal_no" />
          <EditField label={t("Type")} field="type_id" options={types} />
        </div>
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #6366f1" : "1px solid #e2e8f0" }}>
          <SectionHeader icon="🚢" title={t("Shipping Details")} accent="#6366f1" />
          <EditField label={t("Booking No")} field="booking_no" />
          <EditField label={t("E-Booking No")} field="e_booking_no" />
          <EditField label={t("Vessel")} field="vessel" />
          <EditField label={t("Carrier")} field="carrier" />
          <EditField label={t("Agent")} field="carrier_agent" />
        </div>
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #10b981" : "1px solid #e2e8f0" }}>
          <SectionHeader icon="🗺" title={t("Route & Dates")} accent="#10b981" />
          <EditField label="POL" field="pol" />
          <EditField label="POD" field="pod" />
          <EditField label="ETD" field="etd" type="date" />
          <EditField label="ETA" field="eta" type="date" />
          <EditField label={t("Customer")} field="customer" />
        </div>
      </div>

      {/* Notes */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0", marginBottom: 14 }}>
        <SectionHeader icon="📝" title={t("Notes")} accent="#f59e0b" />
        {editing
          ? <textarea value={ed("notes")} onChange={e => setEd("notes", e.target.value)} rows={3} placeholder={t("备注（短出/剩余空间等）")} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
          : <p style={{ fontSize: 12, color: container.notes ? "#0f172a" : "#94a3b8", margin: 0, whiteSpace: "pre-wrap" }}>{container.notes || "—"}</p>
        }
      </div>

      {/* Loading items */}
      <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "2px solid #f59e0b", marginBottom: 14 }}>
        <SectionHeader icon="📋" title={t("Loading Items")} accent="#f59e0b"
          right={canEdit && <Button small variant="accent" onClick={() => setShowAddItem(true)}>+ {t("Add Item")}</Button>} />

        {loadingItems ? <Spinner /> : items.length === 0
          ? <p style={{ fontSize: 12, color: "#94a3b8", margin: "8px 0 0" }}>{t("暂无装柜明细")}</p>
          : (
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#fffbeb" }}>
                  {[t("Supplier"), "PO", "Customer PO", t("TUC"), "SKU", "QTY", t("Weight"), "CBM", "HBL", ""].map(h =>
                    <th key={h} style={{ padding: "6px 6px", textAlign: "left", fontWeight: 600, color: "#92400e", fontSize: 10, borderBottom: "1px solid #fde68a" }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id} style={{ borderBottom: "1px solid #fef3c7" }}>
                      <td style={{ padding: "6px", fontWeight: 600, color: "#0f172a" }}>{tSupplier(it.supplier) || "—"}</td>
                      <td style={{ padding: "6px", fontFamily: "'DM Mono',monospace" }}>{it.po || "—"}</td>
                      <td style={{ padding: "6px", fontFamily: "'DM Mono',monospace" }}>{it.customer_po || "—"}</td>
                      <td style={{ padding: "6px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.tuc || "—"}</td>
                      <td style={{ padding: "6px", fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{it.sku || "—"}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{it.qty || "—"}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{it.weight || "—"}</td>
                      <td style={{ padding: "6px", textAlign: "right" }}>{it.volume || "—"}</td>
                      <td style={{ padding: "6px", fontFamily: "'DM Mono',monospace" }}>{it.hbl || "—"}</td>
                      <td style={{ padding: "6px" }}>
                        {canEdit && <button onClick={() => handleDeleteItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>✕</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        {/* Summary */}
        {items.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: "#fffbeb", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>{t("Summary")}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11 }}>
              {Object.entries(supplierSummary).map(([s, d]) => (
                <div key={s} style={{ background: "#fff", borderRadius: 6, padding: "6px 10px", border: "1px solid #fde68a" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{tSupplier(s)}</span>
                  <span style={{ color: "#64748b", marginLeft: 8 }}>{d.count} items · {d.qty} pcs · {d.weight.toFixed(1)} kg · {d.volume.toFixed(2)} m³</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
              {t("Total")}: {totalQty} pcs · {totalWeight.toFixed(1)} kg · {totalVolume.toFixed(2)} m³
            </div>
          </div>
        )}
      </div>

      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onSave={handleAddItem} />}
    </div>
  );
}

// =========================================================================
// New Container Modal
// =========================================================================
function NewContainerModal({ types, onClose, onSave }) {
  const [form, setForm] = useState({ container_no: "", booking_no: "", e_booking_no: "", vessel: "", carrier: "", carrier_agent: "", pol: "", pod: "", etd: "", eta: "", qty_container: "", type_id: "", customer: "", notes: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const submit = () => {
    const data = { ...form };
    if (!data.type_id) delete data.type_id;
    if (!data.etd) delete data.etd;
    if (!data.eta) delete data.eta;
    onSave(data);
  };
  return (
    <Modal onClose={onClose} title={t("New Container")} width={700}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Input label={t("Container No")} value={form.container_no} onChange={e => set("container_no", e.target.value)} />
        <Input label={t("Booking No")} value={form.booking_no} onChange={e => set("booking_no", e.target.value)} />
        <Input label={t("E-Booking No")} value={form.e_booking_no} onChange={e => set("e_booking_no", e.target.value)} />
        <Input label={t("Vessel")} value={form.vessel} onChange={e => set("vessel", e.target.value)} />
        <Input label={t("Carrier")} value={form.carrier} onChange={e => set("carrier", e.target.value)} />
        <Input label={t("Agent")} value={form.carrier_agent} onChange={e => set("carrier_agent", e.target.value)} />
        <Input label="POL" value={form.pol} onChange={e => set("pol", e.target.value)} />
        <Input label="POD" value={form.pod} onChange={e => set("pod", e.target.value)} />
        <Input label="ETD" type="date" value={form.etd} onChange={e => set("etd", e.target.value)} />
        <Input label="ETA" type="date" value={form.eta} onChange={e => set("eta", e.target.value)} />
        <Input label={t("QTY (Container)")} value={form.qty_container} onChange={e => set("qty_container", e.target.value)} />
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{t("Type")}</div>
          <select value={form.type_id} onChange={e => set("type_id", e.target.value)} style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, outline: "none" }}>
            <option value="">—</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <Input label={t("Customer")} value={form.customer} onChange={e => set("customer", e.target.value)} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Input label={t("Notes")} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
        <Button onClick={submit}>{t("Save")}</Button>
      </div>
    </Modal>
  );
}

// =========================================================================
// Add Item Modal
// =========================================================================
function AddItemModal({ onClose, onSave }) {
  const [mode, setMode] = useState("select"); // "select" or "manual"
  const [shipments, setShipments] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ supplier: "", po: "", customer_po: "", tuc: "", sku: "", qty: "", weight: "", volume: "", hbl: "", notes: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("shipments").select("id,po,customer_po,tuc,sku,supplier,qty_packages,weight,volume").order("created_at", { ascending: false }).then(({ data }) => setShipments(data || []));
  }, []);

  const filtered = shipments.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [s.po, s.customer_po, s.tuc, s.sku, s.supplier].some(v => (v || "").toLowerCase().includes(q));
  });

  const selectShipment = (s) => {
    setForm({ supplier: s.supplier || "", po: s.po || "", customer_po: s.customer_po || "", tuc: s.tuc || "", sku: s.sku || "", qty: s.qty_packages || "", weight: s.weight || "", volume: s.volume || "", hbl: "", notes: "", shipment_id: s.id });
    setMode("manual");
  };

  const submit = () => {
    const data = { ...form };
    if (data.qty) data.qty = Number(data.qty);
    if (data.weight) data.weight = Number(data.weight);
    if (data.volume) data.volume = Number(data.volume);
    onSave(data);
  };

  return (
    <Modal onClose={onClose} title={t("Add Loading Item")} width={700}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMode("select")} style={{ padding: "6px 14px", borderRadius: 6, border: mode === "select" ? "2px solid #0ea5e9" : "1px solid #e2e8f0", background: mode === "select" ? "#f0f9ff" : "#fff", color: mode === "select" ? "#0369a1" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("从货件选择")}</button>
        <button onClick={() => setMode("manual")} style={{ padding: "6px 14px", borderRadius: 6, border: mode === "manual" ? "2px solid #0ea5e9" : "1px solid #e2e8f0", background: mode === "manual" ? "#f0f9ff" : "#fff", color: mode === "manual" ? "#0369a1" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("手动输入")}</button>
      </div>

      {mode === "select" && (
        <>
          <Input placeholder={t("搜索 PO / Customer PO / 品名...")} value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                {["PO", "Customer PO", t("TUC"), t("Supplier"), "QTY"].map(h =>
                  <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                )}
              </tr></thead>
              <tbody>
                {filtered.slice(0, 50).map(s => (
                  <tr key={s.id} onClick={() => selectShipment(s)} style={{ cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "6px 8px", fontFamily: "'DM Mono',monospace", fontWeight: 600, color: "#0369a1" }}>{s.po || "—"}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "'DM Mono',monospace" }}>{s.customer_po || "—"}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tuc || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{tSupplier(s.supplier) || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{s.qty_packages || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === "manual" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label={t("Supplier")} value={form.supplier} onChange={e => set("supplier", e.target.value)} />
            <Input label="PO" value={form.po} onChange={e => set("po", e.target.value)} />
            <Input label="Customer PO" value={form.customer_po} onChange={e => set("customer_po", e.target.value)} />
            <Input label={t("TUC")} value={form.tuc} onChange={e => set("tuc", e.target.value)} />
            <Input label="SKU" value={form.sku} onChange={e => set("sku", e.target.value)} />
            <Input label="QTY" type="number" value={form.qty} onChange={e => set("qty", e.target.value)} />
            <Input label={t("Weight (kg)")} type="number" value={form.weight} onChange={e => set("weight", e.target.value)} />
            <Input label="CBM" type="number" value={form.volume} onChange={e => set("volume", e.target.value)} />
            <Input label="HBL" value={form.hbl} onChange={e => set("hbl", e.target.value)} />
            <Input label={t("Notes")} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
            <Button onClick={submit}>{t("Save")}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
