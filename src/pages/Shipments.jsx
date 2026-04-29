import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { Badge, Field, SectionHeader, FilterDropdown, Modal, Button, Input, Select, Spinner, EmptyState, Tag } from "../components/ui.jsx";
import { ColumnManager } from "../components/ColumnManager.jsx";
import { NotesPanel } from "../components/NotesPanel.jsx";
import { STATUS_CONFIGS, FIELD_LABELS } from "../lib/constants.js";
import { SHIPMENT_COLUMNS, COLUMN_MAP, defaultColumnConfig, reconcileColumnConfig, applyRoleMask } from "../lib/columns.jsx";
import { isAdmin, canEditField, maskedFields } from "../lib/permissions.js";
import { t, tSupplier, setSupplierCnMap } from "../lib/i18n.js";

// =========================================================================
// Shipments Page (entry)
// =========================================================================
export function ShipmentsPage({ user, view, setView }) {
  const role = user.profile?.role;
  const [shipments, setShipments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [refData, setRefData] = useState({ suppliers: [], customers: [], carriers: [], carriersWithAgents: [], ports: [], endCustomers: [] });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showColMgr, setShowColMgr] = useState(false);
  const [loadingDetailShipment, setLoadingDetailShipment] = useState(null);

  // Column config: stored per-user; reconciled with current registry
  const [colConfig, setColConfig] = useState(defaultColumnConfig());

  // Filters
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", bl_status: "All", customer: "All" });
  const [textFilters, setTextFilters] = useState({ booking_no: "", container_no: "", vessel: "", end_customer: "", supplier: "" });
  const [checkedIds, setCheckedIds] = useState(new Set());

  // Load
  const loadShipments = useCallback(async () => {
    const { data } = await supabase.from("shipments").select("*").order("created_at", { ascending: false });
    setShipments(data || []); setLoading(false);
  }, []);
  const loadLogs = useCallback(async () => {
    if (role === "customer") { setLogs([]); return; }
    const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
    setLogs(data || []);
  }, [role]);
  const loadRefData = useCallback(async () => {
    const [s, cu, ca, p, ec] = await Promise.all([
      supabase.from("suppliers").select("*").order("name"),
      supabase.from("customers").select("name").order("name"),
      supabase.from("carriers").select("*").order("name"),
      supabase.from("ports").select("name,code").order("name"),
      supabase.from("end_customers").select("name").order("name"),
    ]);
    setRefData({
      suppliers:    (s.data || []).map(x => x.name),
      supplierCnMap: Object.fromEntries((s.data || []).filter(x => x.name_cn).map(x => [x.name, x.name_cn])),
      customers:    (cu.data || []).map(x => x.name),
      carriers:     (ca.data || []).map(x => x.name),
      carriersWithAgents: ca.data || [],
      ports:        (p.data || []).map(x => `${x.name} (${x.code})`),
      endCustomers: (ec.data || []).map(x => x.name),
    });
    setSupplierCnMap(Object.fromEntries((s.data || []).filter(x => x.name_cn).map(x => [x.name, x.name_cn])));
  }, []);
  const loadColConfig = useCallback(async () => {
    const { data } = await supabase.from("column_preferences")
      .select("*").eq("user_id", user.id).eq("table_key", "shipments").single();
    setColConfig(reconcileColumnConfig(data?.config));
  }, [user.id]);

  useEffect(() => { loadShipments(); loadLogs(); loadRefData(); loadColConfig(); }, [loadShipments, loadLogs, loadRefData, loadColConfig]);

  const saveColConfig = async (cfg) => {
    setColConfig(cfg);
    await supabase.from("column_preferences").upsert(
      { user_id: user.id, table_key: "shipments", config: cfg },
      { onConflict: "user_id,table_key" }
    );
  };

  // Filtered list
  const customerList = useMemo(() => [...new Set(shipments.map(o => o.customer).filter(Boolean))], [shipments]);
  const filtered = useMemo(() => shipments.filter((o) => {
    for (const key of Object.keys(STATUS_CONFIGS)) { if (filters[key] !== "All" && o[key] !== filters[key]) return false; }
    if (filters.customer !== "All" && o.customer !== filters.customer) return false;
    if (textFilters.booking_no && !(o.booking_no || "").toLowerCase().includes(textFilters.booking_no.toLowerCase())) return false;
    if (textFilters.container_no && !(o.container_no || "").toLowerCase().includes(textFilters.container_no.toLowerCase())) return false;
    if (textFilters.vessel && !(o.vessel || "").toLowerCase().includes(textFilters.vessel.toLowerCase())) return false;
    if (textFilters.end_customer && !(o.end_customer || "").toLowerCase().includes(textFilters.end_customer.toLowerCase())) return false;
    if (textFilters.supplier && !(o.supplier || "").toLowerCase().includes(textFilters.supplier.toLowerCase())) return false;
    if (search) {
      const s = search.toLowerCase();
      return [o.po, o.tuc, o.sku, o.carrier, o.customer_po, o.customer, o.supplier, o.booking_no, o.vessel, o.container_no]
        .some(v => (v || "").toLowerCase().includes(s));
    }
    return true;
  }), [shipments, filters, textFilters, search]);

  const activeFilterCount =
    Object.values(filters).filter(v => v !== "All").length +
    Object.values(textFilters).filter(v => v).length +
    (search ? 1 : 0);
  const clearFilters = () => {
    setFilters({ qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", bl_status: "All", customer: "All" });
    setTextFilters({ booking_no: "", container_no: "", vessel: "", end_customer: "", supplier: "" });
    setSearch("");
  };

  // Visible columns (reconciled + role-masked + visible)
  const visibleCols = useMemo(() => {
    const masked = applyRoleMask(colConfig, role);
    return masked.filter(c => c.visible).map(c => COLUMN_MAP[c.key]).filter(Boolean);
  }, [colConfig, role]);

  // Handlers
  const handleCreate = async (form) => {
    form.created_by = user.id;
    const { error } = await supabase.from("shipments").insert(form);
    if (error) { alert(error.message); return; }
    setShowNew(false); loadShipments();
  };
  const handleUpdateField = async (sid, field, oldV, newV) => {
    if (oldV === newV) return;
    const { error } = await supabase.from("shipments").update({ [field]: newV }).eq("id", sid);
    if (error) { alert(error.message); return; }
    // Humanize values for audit log
    const humanize = (field, val) => {
      if (val === true) return "✓ 是";
      if (val === false) return "✗ 否";
      if (val === null || val === undefined || val === "") return "—";
      return String(val);
    };
    await supabase.from("audit_logs").insert({
      shipment_id: sid, user_id: user.id, user_email: user.email,
      field_name: FIELD_LABELS[field] || field,
      old_value: humanize(field, oldV), new_value: humanize(field, newV),
    });
    loadShipments(); loadLogs();
  };

  // Batch
  const toggleCheck = (id) => setCheckedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleCheckAll = () => { if (checkedIds.size === filtered.length) setCheckedIds(new Set()); else setCheckedIds(new Set(filtered.map(o => o.id))); };
  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${checkedIds.size} shipment(s)?`)) return;
    for (const id of checkedIds) {
      await supabase.from("audit_logs").delete().eq("shipment_id", id);
      await supabase.from("loading_details").delete().eq("shipment_id", id);
      await supabase.from("shipments").delete().eq("id", id);
    }
    setCheckedIds(new Set()); loadShipments(); loadLogs();
  };
  const handleBatchDuplicate = async () => {
    if (!confirm(`Duplicate ${checkedIds.size} shipment(s)?`)) return;
    for (const id of checkedIds) {
      const orig = shipments.find(s => s.id === id); if (!orig) continue;
      const copy = { ...orig }; delete copy.id; delete copy.created_at; delete copy.updated_at;
      copy.po = (copy.po || "") + " (COPY)"; copy.created_by = user.id;
      await supabase.from("shipments").insert(copy);
    }
    setCheckedIds(new Set()); loadShipments();
  };

  // Stats sidebar
  const stats = useMemo(() => ({
    total: shipments.length,
    qcPending: shipments.filter(o => o.qc_status !== "QC Approved").length,
    paymentDue: shipments.filter(o => o.local_payment === "Waiting").length,
    telexPending: shipments.filter(o => o.telex_release === "Pending").length,
    blPending: shipments.filter(o => o.bl_status !== "Done").length,
  }), [shipments]);
  const handleStatClick = (type) => {
    clearFilters(); setSelectedId(null);
    if (type === "paymentDue")   setFilters(p => ({ ...p, local_payment: "Waiting" }));
    if (type === "telexPending") setFilters(p => ({ ...p, telex_release: "Pending" }));
    if (type === "blPending")    setFilters(p => ({ ...p, bl_status: "Not Ready" }));
  };

  const selectedOrder = shipments.find(o => o.id === selectedId);
  const orderLogs = useMemo(() => selectedOrder ? logs.filter(l => l.shipment_id === selectedOrder.id) : logs, [logs, selectedOrder]);

  if (view === "logs") {
    return <LogsView logs={logs} />;
  }

  return (
    <div>
      {loading ? <Spinner /> : selectedOrder ? (
        <ShipmentDetail order={selectedOrder} logs={orderLogs} role={role} user={user}
          onBack={() => setSelectedId(null)}
          onUpdateField={handleUpdateField}
          onOpenLoading={() => setLoadingDetailShipment(selectedOrder)} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t("Shipments")}</h1>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>
                {filtered.length} of {shipments.length} records
                {activeFilterCount > 0 && <span style={{ color: "#0ea5e9", fontWeight: 600 }}> · {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active</span>}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" onClick={() => setShowColMgr(true)}>⚙ {t("Columns")}</Button>
              <Button variant="secondary" onClick={() => exportToCSV(filtered, role, visibleCols)}>↓ {t("Export CSV")}</Button>
              {(role === "admin" || role === "operator" || role === "sales") &&
                <Button onClick={() => setShowNew(true)}>+ {t("New Shipment")}</Button>}
            </div>
          </div>

          <FilterBar
            role={role} search={search} setSearch={setSearch}
            filters={filters} setFilters={setFilters}
            textFilters={textFilters} setTextFilters={setTextFilters}
            customerList={customerList}
            activeFilterCount={activeFilterCount} clearFilters={clearFilters}
          />

          {checkedIds.size > 0 && isAdmin(user) && (
            <div style={{ background: "#0f172a", borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{checkedIds.size} selected</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleBatchDuplicate} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", background: "none", color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Duplicate</button>
                <button onClick={handleBatchDelete}    style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #7f1d1d", background: "#450a0a", color: "#fca5a5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                <button onClick={() => setCheckedIds(new Set())} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #334155", background: "none", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <ShipmentTable
            rows={filtered} columns={visibleCols} role={role}
            checkedIds={checkedIds} onToggleCheck={toggleCheck} onToggleCheckAll={toggleCheckAll}
            onOpen={setSelectedId}
          />
        </>
      )}

      {showNew && <NewShipmentModal onClose={() => setShowNew(false)} onSave={handleCreate} refData={refData} role={role} />}
      {showColMgr && <ColumnManager
        config={colConfig}
        hiddenKeys={[...maskedFields(role)]}
        onChange={saveColConfig}
        onClose={() => setShowColMgr(false)}
        onReset={() => saveColConfig(defaultColumnConfig())}
      />}
      {loadingDetailShipment && <LoadingDetailModal shipment={loadingDetailShipment} onClose={() => setLoadingDetailShipment(null)} onSaved={loadShipments} />}
    </div>
  );
}

// =========================================================================
// Filter Bar
// =========================================================================
function FilterBar({ role, search, setSearch, filters, setFilters, textFilters, setTextFilters, customerList, activeFilterCount, clearFilters }) {
  const masked = maskedFields(role);
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginRight: 4 }}>Filters</span>
        <input placeholder="Search PO#, product, SKU..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: search ? "2px solid #0ea5e9" : "1px solid #e2e8f0", fontSize: 12, width: 180, outline: "none", background: search ? "#f0f9ff" : "#fff" }} />
        {Object.entries(STATUS_CONFIGS).map(([key, cfg]) =>
          <FilterDropdown key={key} label={cfg.label} value={filters[key]} options={cfg.options} onChange={v => setFilters(p => ({ ...p, [key]: v }))} />
        )}
        {!masked.has("customer") &&
          <FilterDropdown label="Customer" value={filters.customer} options={customerList} onChange={v => setFilters(p => ({ ...p, customer: v }))} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {[
          { k: "booking_no",   p: "Booking No..." },
          { k: "container_no", p: "Container No..." },
          { k: "vessel",       p: "Vessel..." },
          ...(masked.has("end_customer") ? [] : [{ k: "end_customer", p: "End Customer..." }]),
          { k: "supplier",     p: "Supplier..." },
        ].map(f =>
          <input key={f.k} placeholder={f.p} value={textFilters[f.k]} onChange={e => setTextFilters(p => ({ ...p, [f.k]: e.target.value }))}
            style={{ padding: "6px 10px", borderRadius: 6, border: textFilters[f.k] ? "2px solid #0ea5e9" : "1px solid #e2e8f0", fontSize: 12, width: 130, outline: "none", background: textFilters[f.k] ? "#f0f9ff" : "#fff" }} />
        )}
        {activeFilterCount > 0 && <button onClick={clearFilters} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #fee2e2", background: "#fef2f2", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✕ Clear all</button>}
      </div>
    </div>
  );
}

// =========================================================================
// Shipment Table
// =========================================================================
function ShipmentTable({ rows, columns, role, checkedIds, onToggleCheck, onToggleCheckAll, onOpen }) {
  const showCheckbox = role === "admin";
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#f8fafc" }}>
          {showCheckbox && (
            <th style={{ padding: "10px 4px 10px 10px", borderBottom: "1px solid #e2e8f0", width: 32 }}>
              <input type="checkbox" checked={rows.length > 0 && checkedIds.size === rows.length} onChange={onToggleCheckAll} style={{ cursor: "pointer", width: 15, height: 15 }} />
            </th>
          )}
          {columns.map(c => (
            <th key={c.key} style={{ padding: "10px 7px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10.5, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", minWidth: c.width || 100 }}>{t(c.label)}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length + (showCheckbox ? 1 : 0)} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{t("No shipments found")}</td></tr>}
          {rows.map((o, i) => (
            <tr key={o.id} style={{ cursor: "pointer", borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none", background: checkedIds.has(o.id) ? "#f0f9ff" : "transparent" }}
              onMouseEnter={e => { if (!checkedIds.has(o.id)) e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={e => { if (!checkedIds.has(o.id)) e.currentTarget.style.background = "transparent"; }}>
              {showCheckbox && (
                <td style={{ padding: "10px 4px 10px 10px" }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={checkedIds.has(o.id)} onChange={() => onToggleCheck(o.id)} style={{ cursor: "pointer", width: 15, height: 15 }} />
                </td>
              )}
              {columns.map(c => {
                const value = c.render ? c.render(o) : o[c.key];
                const display = (value === undefined || value === null || value === "") ? "—" : value;
                return (
                  <td key={c.key} onClick={() => onOpen(o.id)} style={{
                    padding: "10px 7px",
                    fontSize: c.mono ? 11 : 11.5,
                    fontFamily: c.mono ? "'DM Mono',monospace" : undefined,
                    color: c.key === "po" ? "#0ea5e9" : "#475569",
                    fontWeight: c.key === "po" ? 600 : 400,
                    whiteSpace: "nowrap", maxWidth: c.width ? c.width + 30 : undefined, overflow: "hidden", textOverflow: "ellipsis",
                  }}>{display}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =========================================================================
// Shipment Detail
// =========================================================================
function ShipmentDetail({ order, logs, role, user, onBack, onUpdateField, onOpenLoading }) {
  const [tab, setTab] = useState("overview");
  const masked = maskedFields(role);
  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0", border: "none", background: "none", color: "#0ea5e9", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "'DM Mono',monospace" }}>{order.po || "No PO#"}</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "3px 0 0" }}>{order.tuc || ""}</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.keys(STATUS_CONFIGS).map(k => order[k] ? <Badge key={k} value={order[k]} /> : null)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {Object.entries(STATUS_CONFIGS).map(([key, cfg]) => {
          const val = order[key];
          const editable = canEditField(role, key);
          return (
            <div key={key} style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: editable ? "2px solid #0ea5e9" : "1px solid #e2e8f0", flex: "1 1 140px", minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                {t(cfg.label)}{editable && <span style={{ fontSize: 9, color: "#0ea5e9", fontWeight: 700 }}>EDITABLE</span>}
              </div>
              {editable
                ? <select value={val || ""} onChange={e => onUpdateField(order.id, key, val, e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer", color: "#0c4a6e", boxSizing: "border-box" }}>
                    <option value="">—</option>{cfg.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                : (val ? <Badge value={val} /> : <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>)}
            </div>
          );
        })}
      </div>

      {/* Entry status — visible to admin/operator/sales only */}
      {role !== "customer" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: canEditField(role, "entry_done") ? "2px solid #0ea5e9" : "1px solid #e2e8f0", flex: "1 1 140px", minWidth: 140 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
              {t("Entry Status")}{canEditField(role, "entry_done") && <span style={{ fontSize: 9, color: "#0ea5e9", fontWeight: 700 }}>EDITABLE</span>}
            </div>
            {canEditField(role, "entry_done")
              ? <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#0c4a6e" }}>
                  <input type="checkbox" checked={!!order.entry_done} onChange={e => onUpdateField(order.id, "entry_done", order.entry_done, e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  {order.entry_done ? t("已录单") : t("未录单")}
                </label>
              : (order.entry_done ? <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12 }}>✓</span> : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>)
            }
          </div>
          {order.entry_done && (
            <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", border: canEditField(role, "entry_number") ? "2px solid #0ea5e9" : "1px solid #e2e8f0", flex: "2 1 200px", minWidth: 200 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                {t("Entry Number")}{canEditField(role, "entry_number") && <span style={{ fontSize: 9, color: "#0ea5e9", fontWeight: 700 }}>EDITABLE</span>}
              </div>
              {canEditField(role, "entry_number")
                ? <input type="text" value={order.entry_number || ""} onChange={e => onUpdateField(order.id, "entry_number", order.entry_number, e.target.value)} placeholder={t("系统编号")} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", color: "#0c4a6e", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
                : <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{order.entry_number || "—"}</span>
              }
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 16 }}>
        {[{ k: "overview", l: t("Overview") }, ...(role === "customer" ? [] : [{ k: "history", l: "History" }]), { k: "notes", l: t("Notes") }].map(tb => (
          <button key={tb.k} onClick={() => setTab(tb.k)} style={{
            padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            color: tab === tb.k ? "#0ea5e9" : "#64748b", borderBottom: tab === tb.k ? "2px solid #0ea5e9" : "2px solid transparent", marginBottom: -1,
          }}>{tb.l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
              <SectionHeader icon="📄" title={t("Order References")} accent="#0ea5e9" />
              <Field label={t("PO#")} value={order.po} />
              <Field label={t("Customer PO#")} value={order.customer_po} />
              <Field label={t("Supplier Order No#")} value={order.supplier_order_no} />
              <Field label={t("CRD Date")} value={order.crd_date} />
              <Field label={t("Incoterms")} value={order.incoterms} />
            </div>
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
              <SectionHeader icon="🏢" title={t("Parties")} accent="#10b981" />
              <Field label={t("Supplier")} value={tSupplier(order.supplier)} />
              {!masked.has("customer")     && <Field label={t("Customer")} value={order.customer} />}
              {!masked.has("end_customer") && <Field label={t("End Customer")} value={order.end_customer} />}
            </div>
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
              <SectionHeader icon="📦" title={t("Cargo Details")} accent="#f59e0b" />
              <Field label={t("Description (TUC)")} value={order.tuc} />
              <Field label={t("SKU")} value={order.sku} />
              <Field label={t("QTY (Packages)")} value={order.qty_packages} />
              <Field label={t("Weight (kg)")} value={order.weight ? `${order.weight} kg` : null} />
              <Field label={t("Volume (m³)")} value={order.volume ? `${order.volume} m³` : null} />
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0", marginBottom: 14 }}>
            <SectionHeader icon="🚢" title={t("Shipping Details")} accent="#6366f1" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0 24px" }}>
              <Field label={t("E-Booking No")} value={order.e_booking_no} />
              <Field label={t("Booking No")} value={order.booking_no} />
              <Field label={`${t("POL")} → ${t("POD")}`} value={order.pol && order.pod ? `${order.pol} → ${order.pod}` : null} />
              <Field label={t("Carrier")} value={order.carrier} />
              <Field label={t("Agent")} value={order.carrier_agent} />
              <Field label={t("Container No")} value={order.container_no} />
              <Field label={t("QTY (Container)")} value={order.qty_container} />
              <Field label={t("Vessel")} value={order.vessel} />
              <Field label="ETD → ETA" value={(order.etd || order.eta) ? `${order.etd || "—"} → ${order.eta || "—"}` : null} />
            </div>
          </div>
          {(role === "admin" || role === "operator") &&
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "2px solid #f59e0b" }}>
              <SectionHeader icon="📋" title={t("Loading Details")} accent="#f59e0b"
                right={<Button small variant="accent" onClick={onOpenLoading}>+ {t("Manage Loading")}</Button>} />
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{t("Click to manage loading records.")}</p>
            </div>}
        </>
      )}
      {tab === "history" && (
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
          <SectionHeader icon="📝" title="Edit History" accent="#8b5cf6" />
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {logs.length === 0 && <p style={{ fontSize: 12, color: "#94a3b8" }}>No edits yet.</p>}
            {logs.map((log, i) => (
              <div key={log.id || i} style={{ padding: "9px 0", borderBottom: i < logs.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "#0ea5e9" }}>{log.user_email}</span>
                  <span style={{ fontSize: 10.5, color: "#cbd5e1", fontFamily: "'DM Mono',monospace" }}>{new Date(log.created_at).toLocaleString()}</span>
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
      )}
      {tab === "notes" && <NotesPanel entityType="shipment" entityId={order.id} user={user} />}
    </div>
  );
}

// =========================================================================
// Logs full view
// =========================================================================
function LogsView({ logs }) {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 3px" }}>Audit Log</h1>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Complete edit history</p>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 600 }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            {["Time", "User", "Field", "Change"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No logs yet</td></tr>}
            {logs.map((log, i) => (
              <tr key={log.id || i} style={{ borderBottom: i < logs.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <td style={{ padding: "10px 14px", fontFamily: "'DM Mono',monospace", fontSize: 11.5, color: "#94a3b8", whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={{ padding: "10px 14px" }}><Tag color="#0ea5e9">{log.user_email}</Tag></td>
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
    </div>
  );
}

// =========================================================================
// New Shipment Modal
// =========================================================================
function NewShipmentModal({ onClose, onSave, refData, role }) {
  const masked = maskedFields(role);
  const [form, setForm] = useState({
    qc_status: "Under Review", space_status: "Wait Info", local_payment: "Waiting",
    telex_release: "Pending", incoterms: "FOB", bl_status: "Not Ready",
    crd_date: "", supplier: "", customer: "", end_customer: "", po: "", customer_po: "",
    supplier_order_no: "", tuc: "", sku: "", qty_packages: "", weight: "", volume: "",
    e_booking_no: "", booking_no: "", pol: "", pod: "", carrier: "", carrier_agent: "",
    etd: "", qty_container: "", container_no: "", eta: "", vessel: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const selCarrier = refData.carriersWithAgents?.find(c => c.name === form.carrier);
  const agentOpts = selCarrier?.agents || [];

  const save = async () => {
    if (!form.po) { alert("PO# is required"); return; }
    if (role === "operator") { delete form.qc_status; }  // operator can't set QC; trigger also blocks
    setSaving(true);
    const c = { ...form };
    c.qty_packages = c.qty_packages ? parseInt(c.qty_packages) || null : null;
    c.weight = c.weight ? parseFloat(c.weight) || null : null;
    c.volume = c.volume ? parseFloat(c.volume) || null : null;
    if (!c.crd_date) c.crd_date = null; if (!c.etd) c.etd = null; if (!c.eta) c.eta = null;
    await onSave(c); setSaving(false);
  };

  return (
    <Modal onClose={onClose} title="New Shipment" width={760}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="PO# *" value={form.po} onChange={e => set("po", e.target.value)} style={{ borderColor: "#0ea5e9" }} />
        <Input label="Customer PO#" value={form.customer_po} onChange={e => set("customer_po", e.target.value)} />
        <Input label="Supplier Order No#" value={form.supplier_order_no} onChange={e => set("supplier_order_no", e.target.value)} />

        <SelOrInput label="Supplier" field="supplier" form={form} set={set} options={refData.suppliers} />
        {!masked.has("customer")     && <SelOrInput label="Customer" field="customer" form={form} set={set} options={refData.customers} />}
        {!masked.has("end_customer") && <SelOrInput label="End Customer" field="end_customer" form={form} set={set} options={refData.endCustomers} />}

        <div style={{ gridColumn: "span 2" }}><Input label="TUC / Description" value={form.tuc} onChange={e => set("tuc", e.target.value)} /></div>
        <Input label="SKU" value={form.sku} onChange={e => set("sku", e.target.value)} />
        <Input label="QTY (Packages)" type="number" value={form.qty_packages} onChange={e => set("qty_packages", e.target.value)} />
        <Input label="Weight (kg)" type="number" value={form.weight} onChange={e => set("weight", e.target.value)} />
        <Input label="Volume (m³)" type="number" value={form.volume} onChange={e => set("volume", e.target.value)} />
        <Input label="CRD Date" type="date" value={form.crd_date} onChange={e => set("crd_date", e.target.value)} />
        <Select label="Incoterms" value={form.incoterms} onChange={e => set("incoterms", e.target.value)} options={STATUS_CONFIGS.incoterms.options} />

        <SelOrInput label="POL" field="pol" form={form} set={set} options={refData.ports} />
        <SelOrInput label="POD" field="pod" form={form} set={set} options={refData.ports} />
        <Select label="Carrier" value={form.carrier} onChange={e => { set("carrier", e.target.value); set("carrier_agent", ""); }}
          options={[{ value: "", label: "Select..." }, ...refData.carriers.map(c => ({ value: c, label: c }))]} />
        {agentOpts.length > 0
          ? <Select label="Agent" value={form.carrier_agent} onChange={e => set("carrier_agent", e.target.value)}
              options={[{ value: "", label: "No agent" }, ...agentOpts.map(a => ({ value: a, label: a }))]} />
          : <Input label="Agent" value={form.carrier_agent} onChange={e => set("carrier_agent", e.target.value)} placeholder="e.g. Yusen" />}
        <Input label="E-Booking No" value={form.e_booking_no} onChange={e => set("e_booking_no", e.target.value)} />
        <Input label="Booking No" value={form.booking_no} onChange={e => set("booking_no", e.target.value)} />
        <Input label="Container No" value={form.container_no} onChange={e => set("container_no", e.target.value)} placeholder="e.g. MSCU1234567" />
        <Input label="QTY (Container)" value={form.qty_container} onChange={e => set("qty_container", e.target.value)} placeholder="e.g. 1x40HQ" />
        <Input label="ETD" type="date" value={form.etd} onChange={e => set("etd", e.target.value)} />
        <Input label="ETA" type="date" value={form.eta} onChange={e => set("eta", e.target.value)} />
        <Input label="Vessel" value={form.vessel} onChange={e => set("vessel", e.target.value)} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Shipment"}</Button>
      </div>
    </Modal>
  );
}

// SelOrInput: render a select if options provided, else a free-text input.
function SelOrInput({ label, field, form, set, options }) {
  if (options && options.length > 0) {
    return <Select label={label} value={form[field]} onChange={e => set(field, e.target.value)}
      options={[{ value: "", label: "Select..." }, ...options.map(o => ({ value: o, label: o }))]} />;
  }
  return <Input label={label} value={form[field]} onChange={e => set(field, e.target.value)} />;
}

// =========================================================================
// Loading Detail Modal — preserved from original
// =========================================================================
function LoadingDetailModal({ shipment, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [crossWarnings, setCrossWarnings] = useState([]);
  const [form, setForm] = useState({ booking_no: "", container_no: "", container_type: "40HQ", booked_packages: "", booked_weight: "", booked_volume: "", actual_packages: "", actual_weight: "", actual_volume: "", carton_size: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id).order("created_at");
    setItems(data || []); setLoading(false);
    if (data && data.length > 0) {
      const bns = [...new Set(data.map(d => d.booking_no).filter(Boolean))];
      const w = [];
      for (const bn of bns) {
        const { data: o } = await supabase.from("loading_details").select("shipment_id").eq("booking_no", bn).neq("shipment_id", shipment.id);
        if (o && o.length > 0) w.push({ booking_no: bn, count: o.length });
      }
      setCrossWarnings(w);
    }
  }, [shipment.id]);
  useEffect(() => { load(); }, [load]);

  const syncToShipment = async () => {
    const { data: ld } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id).order("created_at");
    if (!ld || ld.length === 0) return;
    const bookings   = [...new Set(ld.map(d => d.booking_no).filter(Boolean))].join(", ");
    const containers = [...new Set(ld.map(d => d.container_no).filter(Boolean))].join(", ");
    const typeCount = {};
    ld.forEach(d => { if (d.container_type) typeCount[d.container_type] = (typeCount[d.container_type] || 0) + 1; });
    const qtyStr = Object.entries(typeCount).map(([t, c]) => `${c}x${t}`).join(", ");
    const updates = {};
    if (bookings)   updates.booking_no   = bookings;
    if (containers) updates.container_no = containers;
    if (qtyStr)     updates.qty_container = qtyStr;
    if (Object.keys(updates).length > 0) await supabase.from("shipments").update(updates).eq("id", shipment.id);
  };

  const addItem = async () => {
    if (!form.booking_no && !form.container_no) { alert("Booking No or Container No required"); return; }
    setSaving(true);
    const c = { ...form, shipment_id: shipment.id };
    ["booked_packages", "actual_packages"].forEach(k => { c[k] = c[k] ? parseInt(c[k]) : null; });
    ["booked_weight", "booked_volume", "actual_weight", "actual_volume"].forEach(k => { c[k] = c[k] ? parseFloat(c[k]) : null; });
    const { error } = await supabase.from("loading_details").insert(c);
    if (error) { alert(error.message); setSaving(false); return; }
    setForm({ booking_no: "", container_no: "", container_type: "40HQ", booked_packages: "", booked_weight: "", booked_volume: "", actual_packages: "", actual_weight: "", actual_volume: "", carton_size: "", notes: "" });
    setSaving(false); load(); await syncToShipment(); onSaved?.();
  };
  const deleteItem = async (id) => { if (!confirm("Delete?")) return; await supabase.from("loading_details").delete().eq("id", id); load(); await syncToShipment(); onSaved?.(); };

  const totals = useMemo(() => {
    const t = { bp: 0, bw: 0, bv: 0, ap: 0, aw: 0, av: 0 };
    items.forEach(i => { t.bp += i.booked_packages || 0; t.bw += i.booked_weight || 0; t.bv += i.booked_volume || 0; t.ap += i.actual_packages || 0; t.aw += i.actual_weight || 0; t.av += i.actual_volume || 0; });
    return t;
  }, [items]);

  return (
    <Modal onClose={onClose} width={820} title={`Loading Details — ${shipment.po}`}>
      {crossWarnings.length > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef9c3", border: "1px solid #fde68a", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>⚠ Cross-container alert</div>
          {crossWarnings.map(w => <div key={w.booking_no} style={{ fontSize: 12, color: "#92400e", marginTop: 4 }}>Booking <strong>{w.booking_no}</strong> is also used by {w.count} other PO(s)</div>)}
        </div>
      )}
      <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e2e8f0", marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          <Input label="Booking No" value={form.booking_no} onChange={e => setForm(p => ({ ...p, booking_no: e.target.value }))} />
          <Input label="Container No" value={form.container_no} onChange={e => setForm(p => ({ ...p, container_no: e.target.value }))} />
          <Select label="Container Type" value={form.container_type} onChange={e => setForm(p => ({ ...p, container_type: e.target.value }))} options={["20GP", "40GP", "40HQ", "45HQ", "20RF", "40RF"]} />
          <Input label="Carton Size" value={form.carton_size} onChange={e => setForm(p => ({ ...p, carton_size: e.target.value }))} />
          <Input label="Booked Pkgs" type="number" value={form.booked_packages} onChange={e => setForm(p => ({ ...p, booked_packages: e.target.value }))} />
          <Input label="Booked Weight" type="number" value={form.booked_weight} onChange={e => setForm(p => ({ ...p, booked_weight: e.target.value }))} />
          <Input label="Booked Volume" type="number" value={form.booked_volume} onChange={e => setForm(p => ({ ...p, booked_volume: e.target.value }))} />
          <div />
          <Input label="Actual Pkgs" type="number" value={form.actual_packages} onChange={e => setForm(p => ({ ...p, actual_packages: e.target.value }))} />
          <Input label="Actual Weight" type="number" value={form.actual_weight} onChange={e => setForm(p => ({ ...p, actual_weight: e.target.value }))} />
          <Input label="Actual Volume" type="number" value={form.actual_volume} onChange={e => setForm(p => ({ ...p, actual_volume: e.target.value }))} />
          <Input label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <Button onClick={addItem} disabled={saving}>{saving ? "Saving..." : "+ Add Loading"}</Button>
        </div>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? <EmptyState>No loading records yet.</EmptyState> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            {["Booking", "Container", "Type", "Booked P/W/V", "Actual P/W/V", "Notes", ""].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 10.5, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} style={{ borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace" }}>{it.booking_no || "—"}</td>
                <td style={{ padding: "8px 10px", fontFamily: "'DM Mono',monospace" }}>{it.container_no || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{it.container_type || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{it.booked_packages || "0"} / {it.booked_weight || "0"} / {it.booked_volume || "0"}</td>
                <td style={{ padding: "8px 10px" }}>{it.actual_packages || "0"} / {it.actual_weight || "0"} / {it.actual_volume || "0"}</td>
                <td style={{ padding: "8px 10px", color: "#64748b" }}>{it.notes || "—"}</td>
                <td style={{ padding: "8px 10px" }}><button onClick={() => deleteItem(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Del</button></td>
              </tr>
            ))}
            <tr style={{ background: "#f0f9ff", fontWeight: 700 }}>
              <td colSpan={3} style={{ padding: "10px", textAlign: "right" }}>Totals</td>
              <td style={{ padding: "10px" }}>{totals.bp} / {totals.bw.toFixed(2)} / {totals.bv.toFixed(2)}</td>
              <td style={{ padding: "10px" }}>{totals.ap} / {totals.aw.toFixed(2)} / {totals.av.toFixed(2)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>}
    </Modal>
  );
}

// =========================================================================
// CSV export — applies role mask
// =========================================================================
function exportToCSV(rows, role, columns) {
  const masked = maskedFields(role);
  const cols = columns.filter(c => !masked.has(c.key));
  const headers = cols.map(c => t(c.label));
  const data = rows.map(o => cols.map(c => {
    const v = c.render ? null : o[c.key];  // skip rendered React nodes; export raw
    return v == null ? (c.render ? extractTextFromCell(c, o) : "") : v;
  }));
  let csv = "\uFEFF" + headers.join(",") + "\n";
  data.forEach(row => {
    csv += row.map(cell => {
      const s = (cell == null ? "" : String(cell));
      return (s.includes(",") || s.includes('"') || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",") + "\n";
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Bansar_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
}

// Best-effort: when render returns React, fall back to a text representation.
function extractTextFromCell(col, o) {
  if (col.key === "supplier") return tSupplier(o.supplier) || "";
  if (col.key === "route")   return o.pol && o.pod ? `${(o.pol || "").split("(")[0].trim()} -> ${(o.pod || "").split("(")[0].trim()}` : "";
  if (col.key === "carrier") return o.carrier ? (o.carrier_agent ? `${o.carrier} (${o.carrier_agent})` : o.carrier) : "";
  // For Badge-rendered status fields, the underlying value is the field key itself
  return o[col.key] || "";
}
