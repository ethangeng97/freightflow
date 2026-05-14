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

  const handleCreate = async () => {
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
// EditField — 必须在 ContainerDetail 之外定义，否则每次 setState 会重建
// 组件引用，React 卸载/重挂 input，导致打字时光标失焦
// =========================================================================
function EditField({ label, field, type, options, editing, ed, setEd, container }) {
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

  const updateItemLocal = (itemId, field, value) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, [field]: value } : it));
  };

  const saveItemCell = async (itemId, field, value) => {
    const numFields = ["qty", "weight", "volume"];
    const v = numFields.includes(field) ? (value === "" || value == null ? null : Number(value)) : (value === "" ? null : value);
    await supabase.from("container_items").update({ [field]: v }).eq("id", itemId);
  };

  const addEmptyRow = async () => {
    const row = { container_id: container.id, supplier: "", po: "", customer_po: "", tuc: "", sku: "", qty: null, weight: null, volume: null, hbl: "", notes: "", sort_order: items.length };
    const { error } = await supabase.from("container_items").insert(row);
    if (error) alert(error.message);
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
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Container No")} field="container_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("QTY (Container)")} field="qty_container" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Seal No")} field="seal_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Type")} field="type_id" options={types} />
        </div>
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #6366f1" : "1px solid #e2e8f0" }}>
          <SectionHeader icon="🚢" title={t("Shipping Details")} accent="#6366f1" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Booking No")} field="booking_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("E-Booking No")} field="e_booking_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Vessel")} field="vessel" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Carrier")} field="carrier" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Agent")} field="carrier_agent" />
        </div>
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #10b981" : "1px solid #e2e8f0" }}>
          <SectionHeader icon="🗺" title={t("Route & Dates")} accent="#10b981" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="POL" field="pol" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="POD" field="pod" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="ETD" field="etd" type="date" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="ETA" field="eta" type="date" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Customer")} field="customer" />
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
                  {[t("Supplier"), "PO", "Customer PO", t("TUC"), "SKU", "QTY (CTNS)", t("Weight"), "CBM", "HBL", ""].map(h =>
                    <th key={h} style={{ padding: "6px 4px", textAlign: "left", fontWeight: 600, color: "#92400e", fontSize: 10, borderBottom: "2px solid #fde68a", whiteSpace: "nowrap" }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {items.map((it) => {
                    const cs = { padding: "3px 2px" };
                    const is_ = { width: "100%", padding: "4px 6px", border: "1px solid #fde68a", borderRadius: 4, fontSize: 11, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace", background: canEdit ? "#fffbeb" : "transparent" };
                    const cell = (field, w, opts) => {
                      const type = opts?.type || "text";
                      const step = opts?.step;
                      return <td style={cs}><input style={{ ...is_, width: w, ...(opts?.align ? { textAlign: opts.align } : {}) }} type={type} step={step} value={it[field] ?? ""} readOnly={!canEdit} onChange={e => updateItemLocal(it.id, field, e.target.value)} onBlur={e => saveItemCell(it.id, field, e.target.value)} /></td>;
                    };
                    return (
                      <tr key={it.id} style={{ borderBottom: "1px solid #fef3c7" }}>
                        {cell("supplier", 90)}
                        {cell("po", 90)}
                        {cell("customer_po", 80)}
                        {cell("tuc", 140)}
                        {cell("sku", 90)}
                        {cell("qty", 60, { type: "number", align: "right" })}
                        {cell("weight", 65, { type: "number", step: "0.0001", align: "right" })}
                        {cell("volume", 60, { type: "number", step: "0.0001", align: "right" })}
                        {cell("hbl", 80)}
                        <td style={cs}>
                          {canEdit && <button onClick={() => handleDeleteItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button>}
                        </td>
                      </tr>
                    );
                  })}
                  {items.length > 0 && (
                    <tr style={{ background: "#fffbeb", fontWeight: 700 }}>
                      <td colSpan={5} style={{ padding: "8px 4px", textAlign: "right", fontSize: 11, color: "#92400e" }}>{t("Total")}</td>
                      <td style={{ padding: "8px 4px", textAlign: "right", fontSize: 11 }}>{totalQty}</td>
                      <td style={{ padding: "8px 4px", textAlign: "right", fontSize: 11 }}>{totalWeight.toFixed(4)}</td>
                      <td style={{ padding: "8px 4px", textAlign: "right", fontSize: 11 }}>{totalVolume.toFixed(4)}</td>
                      <td colSpan={2} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        }

        {/* Quick add buttons */}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button small variant="secondary" onClick={addEmptyRow}>+ {t("新增行")}</Button>
            <Button small variant="accent" onClick={() => setShowAddItem(true)}>+ {t("从货件选择")}</Button>
          </div>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: "#fffbeb", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>{t("Summary")}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11 }}>
              {Object.entries(supplierSummary).map(([s, d]) => (
                <div key={s} style={{ background: "#fff", borderRadius: 6, padding: "6px 10px", border: "1px solid #fde68a" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{tSupplier(s)}</span>
                  <span style={{ color: "#64748b", marginLeft: 8 }}>{d.count} items · {d.qty} CTNS · {d.weight.toFixed(4)} kg · {d.volume.toFixed(4)} m³</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
              {t("Total")}: {totalQty} CTNS · {totalWeight.toFixed(4)} kg · {totalVolume.toFixed(4)} m³
            </div>
          </div>
        )}
      </div>

      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onSave={handleAddItem} />}
    </div>
  );
}

// =========================================================================
// New Container Modal — container_no/seal_no per line, auto-grouping
// =========================================================================
function NewContainerModal({ types, onClose, onSave }) {
  const [shipments, setShipments] = useState([]);
  const [poSearch, setPoSearch] = useState("");
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("shipments").select("id,po,customer_po,tuc,sku,supplier,customer,end_customer,qty_packages,weight,volume,booking_no,e_booking_no,vessel,carrier,carrier_agent,pol,pod,etd,eta")
      .order("created_at", { ascending: false }).then(({ data }) => setShipments(data || []));
  }, []);

  const derived = useMemo(() => {
    const d = { booking_no: "", e_booking_no: "", vessel: "", carrier: "", carrier_agent: "", pol: "", pod: "", etd: "", eta: "", customer: "" };
    for (const ln of lines) {
      if (!d.booking_no && ln._src?.booking_no) d.booking_no = ln._src.booking_no;
      if (!d.e_booking_no && ln._src?.e_booking_no) d.e_booking_no = ln._src.e_booking_no;
      if (!d.vessel && ln._src?.vessel) d.vessel = ln._src.vessel;
      if (!d.carrier && ln._src?.carrier) d.carrier = ln._src.carrier;
      if (!d.carrier_agent && ln._src?.carrier_agent) d.carrier_agent = ln._src.carrier_agent;
      if (!d.pol && ln._src?.pol) d.pol = ln._src.pol;
      if (!d.pod && ln._src?.pod) d.pod = ln._src.pod;
      if (!d.etd && ln._src?.etd) d.etd = ln._src.etd;
      if (!d.eta && ln._src?.eta) d.eta = ln._src.eta;
      if (!d.customer && ln._src?.customer) d.customer = ln._src.customer;
    }
    return d;
  }, [lines]);

  const poFiltered = useMemo(() => {
    if (!poSearch || poSearch.length < 1) return [];
    const q = poSearch.toLowerCase();
    return shipments.filter(s =>
      (s.po || "").toLowerCase().includes(q) ||
      (s.customer_po || "").toLowerCase().includes(q) ||
      (s.tuc || "").toLowerCase().includes(q)
    ).slice(0, 15);
  }, [poSearch, shipments]);

  const addFromShipment = (s) => {
    setLines(prev => [...prev, {
      container_no: "", seal_no: "",
      supplier: s.supplier || "", po: s.po || "", customer_po: s.customer_po || "",
      tuc: s.tuc || "", sku: s.sku || "", hs_code: "", qty: s.qty_packages || "",
      packing_unit: "CTNS", weight: s.weight || "", volume: s.volume || "",
      hbl: "", shipment_id: s.id, _src: s,
    }]);
    setPoSearch("");
    setError("");
  };

  const addEmptyLine = () => {
    setLines(prev => [...prev, { container_no: "", seal_no: "", supplier: "", po: "", customer_po: "", tuc: "", sku: "", hs_code: "", qty: "", packing_unit: "CTNS", weight: "", volume: "", hbl: "", _src: {} }]);
  };

  const updateLine = (idx, field, value) => {
    setLines(prev => prev.map((ln, i) => i === idx ? { ...ln, [field]: value } : ln));
    setError("");
  };

  const removeLine = (idx) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
    setError("");
  };

  // Validate container_no + seal_no consistency
  const validation = useMemo(() => {
    const pairs = new Map(); // container_no -> seal_no
    const sealToCtr = new Map(); // seal_no -> container_no
    for (const ln of lines) {
      const cno = (ln.container_no || "").trim();
      const sno = (ln.seal_no || "").trim();
      if (!cno && !sno) continue;
      if (cno && sno) {
        if (pairs.has(cno) && pairs.get(cno) !== sno) return { ok: false, msg: `柜号 ${cno} 有不同封号：${pairs.get(cno)} 和 ${sno}` };
        if (sealToCtr.has(sno) && sealToCtr.get(sno) !== cno) return { ok: false, msg: `封号 ${sno} 对应不同柜号：${sealToCtr.get(sno)} 和 ${cno}` };
        pairs.set(cno, sno);
        sealToCtr.set(sno, cno);
      }
    }
    // Group by container_no
    const groups = {};
    for (const ln of lines) {
      const key = (ln.container_no || "").trim() || "__no_ctr__";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ln);
    }
    const containerCount = Object.keys(groups).filter(k => k !== "__no_ctr__").length || (lines.length > 0 ? 1 : 0);
    return { ok: true, groups, containerCount, pairs };
  }, [lines]);

  const submit = async () => {
    if (lines.length === 0) { alert(t("请至少添加一行装柜明细")); return; }
    if (!validation.ok) { setError(validation.msg); return; }
    setSaving(true);

    // Group lines by container_no (or all in one if no container_no specified)
    const groups = {};
    for (const ln of lines) {
      const key = (ln.container_no || "").trim() || "__default__";
      if (!groups[key]) groups[key] = { container_no: ln.container_no?.trim() || null, seal_no: ln.seal_no?.trim() || null, items: [] };
      groups[key].items.push(ln);
      if (ln.seal_no?.trim() && !groups[key].seal_no) groups[key].seal_no = ln.seal_no.trim();
    }

    // Auto-detect type
    const supplierCount = new Set(lines.map(l => l.supplier).filter(Boolean)).size;
    const poCount = new Set(lines.map(l => l.po).filter(Boolean)).size;
    const isConsole = supplierCount > 1 || poCount > 1;
    const consoleTid = types.find(t => t.name === "Console Box")?.id;
    const fclTid = types.find(t => t.name === "FCL")?.id;

    for (const [key, grp] of Object.entries(groups)) {
      const cData = {
        container_no: grp.container_no, seal_no: grp.seal_no,
        type_id: isConsole ? consoleTid : fclTid, notes: notes || null,
        booking_no: derived.booking_no || null, e_booking_no: derived.e_booking_no || null,
        vessel: derived.vessel || null, carrier: derived.carrier || null,
        carrier_agent: derived.carrier_agent || null,
        pol: derived.pol || null, pod: derived.pod || null,
        customer: derived.customer || null,
        etd: derived.etd || null, eta: derived.eta || null,
        qty_container: `1x40HQ`,
      };
      if (!cData.type_id) delete cData.type_id;
      if (!cData.etd) delete cData.etd;
      if (!cData.eta) delete cData.eta;

      const { data: created, error: cErr } = await supabase.from("containers").insert(cData).select("id").single();
      if (cErr || !created) { alert("Container error: " + (cErr?.message || "Failed")); setSaving(false); return; }

      const items = grp.items.map((ln, i) => ({
        container_id: created.id, shipment_id: ln.shipment_id || null,
        supplier: ln.supplier || null, po: ln.po || null, customer_po: ln.customer_po || null,
        tuc: ln.tuc || null, sku: ln.sku || null,
        qty: ln.qty ? Number(ln.qty) : null, weight: ln.weight ? Number(ln.weight) : null,
        volume: ln.volume ? Number(ln.volume) : null, hbl: ln.hbl || null, sort_order: i,
      }));
      await supabase.from("container_items").insert(items);
    }
    setSaving(false);
    onSave();
  };

  const totals = lines.reduce((t, ln) => ({ qty: t.qty + (Number(ln.qty) || 0), wt: t.wt + (Number(ln.weight) || 0), vol: t.vol + (Number(ln.volume) || 0) }), { qty: 0, wt: 0, vol: 0 });

  const is_ = { padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 11, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" };

  return (
    <Modal onClose={onClose} title={t("New Container")} width={1200}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>1. {t("添加装柜明细")} — {t("搜索 PO / Customer PO / 品名...")}</div>
        <div style={{ position: "relative" }}>
          <input value={poSearch} onChange={e => setPoSearch(e.target.value)} placeholder={t("输入 PO 或 Customer PO 搜索...")}
            style={{ width: "100%", padding: "8px 12px", border: "1px solid #bae6fd", borderRadius: 8, fontSize: 12, outline: "none", background: "#f0f9ff", boxSizing: "border-box" }} />
          {poFiltered.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 200, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
              {poFiltered.map(s => (
                <div key={s.id} onClick={() => addFromShipment(s)} style={{ padding: "6px 12px", cursor: "pointer", fontSize: 11, borderBottom: "1px solid #f1f5f9", display: "flex", gap: 12 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontWeight: 600, color: "#0369a1", fontFamily: "'DM Mono',monospace", minWidth: 100 }}>{s.po}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", minWidth: 80, color: "#64748b" }}>{s.customer_po}</span>
                  <span style={{ color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tuc || "—"}</span>
                  <span style={{ color: "#94a3b8" }}>{tSupplier(s.supplier) || ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr style={{ background: "#f0f9ff" }}>
              {[t("柜号"), t("封号"), t("Supplier"), "PO", "Cust PO", t("TUC"), "HS Code", "QTY (CTNS)", t("Weight"), "CBM", "HBL", ""].map(h =>
                <th key={h} style={{ padding: "6px 4px", textAlign: "left", fontWeight: 600, color: "#0369a1", fontSize: 10, borderBottom: "2px solid #bae6fd", whiteSpace: "nowrap" }}>{h}</th>
              )}
            </tr></thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 85, background: "#fffbeb", border: "1px solid #fde68a" }} value={ln.container_no} onChange={e => updateLine(i, "container_no", e.target.value)} placeholder="CNTR" /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 70, background: "#fffbeb", border: "1px solid #fde68a" }} value={ln.seal_no} onChange={e => updateLine(i, "seal_no", e.target.value)} placeholder="Seal" /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 85 }} value={ln.supplier} onChange={e => updateLine(i, "supplier", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 90, fontWeight: 600, color: "#0369a1" }} value={ln.po} onChange={e => updateLine(i, "po", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 70 }} value={ln.customer_po} onChange={e => updateLine(i, "customer_po", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 120 }} value={ln.tuc} onChange={e => updateLine(i, "tuc", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 70 }} value={ln.hs_code || ""} onChange={e => updateLine(i, "hs_code", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 55, textAlign: "right" }} type="number" value={ln.qty} onChange={e => updateLine(i, "qty", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 60, textAlign: "right" }} type="number" step="0.0001" value={ln.weight} onChange={e => updateLine(i, "weight", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 55, textAlign: "right" }} type="number" step="0.0001" value={ln.volume} onChange={e => updateLine(i, "volume", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><input style={{ ...is_, width: 70 }} value={ln.hbl || ""} onChange={e => updateLine(i, "hbl", e.target.value)} /></td>
                  <td style={{ padding: "3px 2px" }}><button onClick={() => removeLine(i)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button></td>
                </tr>
              ))}
              <tr style={{ background: "#f0f9ff", fontWeight: 700 }}>
                <td colSpan={7} style={{ padding: "6px 4px", textAlign: "right", fontSize: 11, color: "#0369a1" }}>{t("Total")}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>{totals.qty}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>{totals.wt.toFixed(4)}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>{totals.vol.toFixed(4)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <Button small variant="secondary" onClick={addEmptyLine}>+ {t("手动添加行")}</Button>
          </div>
        </div>
      )}

      {/* Validation error */}
      {(error || !validation.ok) && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
          ⚠ {error || validation.msg}
        </div>
      )}

      {/* Container summary info */}
      {lines.length > 0 && validation.ok && (
        <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e2e8f0", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
            2. {t("柜子信息")} — {validation.containerCount || 1} {t("个柜")}
            {validation.containerCount > 1
              ? <span style={{ color: "#f59e0b", marginLeft: 8 }}>Console Box</span>
              : <span style={{ color: "#10b981", marginLeft: 8 }}>FCL</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            <Field label="Booking" value={derived.booking_no || "—"} />
            <Field label="Vessel" value={derived.vessel || "—"} />
            <Field label="Carrier" value={derived.carrier || "—"} />
            <Field label="Agent" value={derived.carrier_agent || "—"} />
            <Field label="POL" value={derived.pol || "—"} />
            <Field label="POD" value={derived.pod || "—"} />
            <Field label="ETD" value={derived.etd || "—"} />
            <Field label="Customer" value={derived.customer || "—"} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Input label={t("Notes")} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("备注（短出/剩余空间等）")} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
        <Button onClick={submit} disabled={saving || lines.length === 0 || !validation.ok}>{saving ? "..." : `${t("Save")} (${validation.containerCount || 1} ${t("个柜")})`}</Button>
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
