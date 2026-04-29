import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
export function ShipmentsPage({ user, view, setView, statFilter }) {
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
  const [filters, setFilters] = useState({ qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", bl_status: "All", customer: "All", entry_done: "All" });
  const [textFilters, setTextFilters] = useState({ booking_no: "", container_no: "", vessel: "", end_customer: "", supplier: "" });
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  // Handle stat clicks from sidebar
  const statFilterApplied = useRef(null);
  useEffect(() => {
    if (statFilter && statFilter !== statFilterApplied.current) {
      statFilterApplied.current = statFilter;
      const base = { qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", bl_status: "All", customer: "All", entry_done: "All" };
      if (statFilter.entry_done) {
        base.entry_done = statFilter.entry_done;
      } else {
        const key = Object.keys(statFilter)[0];
        if (key && statFilter[key] !== "pending") base[key] = statFilter[key];
      }
      setFilters(base);
      setSelectedId(null);
      setSearch("");
      setTextFilters({ booking_no: "", container_no: "", vessel: "", end_customer: "", supplier: "" });
    }
  }, [statFilter]);

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
    for (const key of Object.keys(STATUS_CONFIGS)) {
      if (filters[key] === "All") continue;
      if (filters[key] === "__empty__") { if (o[key]) return false; } // 未设置
      else if (o[key] !== filters[key]) return false;
    }
    if (filters.customer !== "All" && o.customer !== filters.customer) return false;
    if (filters.entry_done === "已录入" && !o.entry_done) return false;
    if (filters.entry_done === "未录入" && o.entry_done) return false;
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

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filters, textFilters, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const activeFilterCount =
    Object.values(filters).filter(v => v !== "All").length +
    Object.values(textFilters).filter(v => v).length +
    (search ? 1 : 0);
  const clearFilters = () => {
    setFilters({ qc_status: "All", space_status: "All", local_payment: "All", telex_release: "All", incoterms: "All", bl_status: "All", customer: "All", entry_done: "All" });
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
    try {
      const res = await supabase.from("shipments").update({ [field]: newV }).eq("id", sid);
      if (res.error) { alert("Update failed: " + res.error.message); return; }
      // Humanize values for audit log
      const humanize = (f, val) => {
        if (val === true) return "✓ 是";
        if (val === false) return "✗ 否";
        if (val === null || val === undefined || val === "") return "—";
        return String(val);
      };
      try { await supabase.from("audit_logs").insert({
        shipment_id: sid, user_id: user.id, user_email: user.email,
        field_name: FIELD_LABELS[field] || field,
        old_value: humanize(field, oldV), new_value: humanize(field, newV),
      }); } catch(_) {}
      loadShipments(); loadLogs();
    } catch (e) {
      alert("Update error: " + (e.message || e));
    }
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

  const [showImport, setShowImport] = useState(false);

  // ...existing code
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
          refData={refData} />
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
              {(role === "admin" || role === "customer") &&
                <Button variant="secondary" onClick={() => exportToCSV(filtered, role, visibleCols)}>↓ {t("Export CSV")}</Button>}
              {(role === "admin" || role === "operator" || role === "sales") &&
                <Button variant="secondary" onClick={() => setShowImport(true)}>↑ {t("Import")}</Button>}
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

          {checkedIds.size > 0 && (role === "admin" || role === "operator" || role === "sales") && (
            <BatchUpdateBar checkedIds={checkedIds} role={role} user={user}
              onClear={() => setCheckedIds(new Set())}
              onUpdate={async (field, value) => {
                const ids = [...checkedIds];
                // Single bulk update
                const { error } = await supabase.from("shipments").update({ [field]: value }).in("id", ids);
                if (error) { alert("Batch update error: " + error.message); return; }
                // Bulk audit log
                const humanize = (val) => { if (val === true) return "✓ 是"; if (val === false) return "✗ 否"; if (val == null || val === "") return "—"; return String(val); };
                const logRows = ids.map(id => ({
                  shipment_id: id, user_id: user.id, user_email: user.email,
                  field_name: FIELD_LABELS[field] || field,
                  old_value: humanize(shipments.find(s => s.id === id)?.[field]),
                  new_value: humanize(value),
                }));
                try { await supabase.from("audit_logs").insert(logRows); } catch(_) {}
                loadShipments(); loadLogs();
                setCheckedIds(new Set());
              }}
              onDelete={handleBatchDelete}
              onDuplicate={handleBatchDuplicate}
              refData={refData}
            />
          )}

          <ShipmentTable
            rows={pagedRows} columns={visibleCols} role={role}
            checkedIds={checkedIds} onToggleCheck={toggleCheck} onToggleCheckAll={toggleCheckAll}
            onOpen={setSelectedId}
          />

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#64748b" }}>{t("每页")}</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12, outline: "none", cursor: "pointer" }}>
                {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span style={{ color: "#94a3b8" }}>{filtered.length} {t("条")} · {t("第")} {page + 1}/{totalPages} {t("页")}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button disabled={page === 0} onClick={() => setPage(0)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, cursor: page === 0 ? "default" : "pointer", color: page === 0 ? "#cbd5e1" : "#0f172a" }}>⟨⟨</button>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, cursor: page === 0 ? "default" : "pointer", color: page === 0 ? "#cbd5e1" : "#0f172a" }}>⟨</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, cursor: page >= totalPages - 1 ? "default" : "pointer", color: page >= totalPages - 1 ? "#cbd5e1" : "#0f172a" }}>⟩</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, cursor: page >= totalPages - 1 ? "default" : "pointer", color: page >= totalPages - 1 ? "#cbd5e1" : "#0f172a" }}>⟩⟩</button>
            </div>
          </div>
        </>
      )}

      {showNew && <NewShipmentModal onClose={() => setShowNew(false)} onSave={handleCreate} refData={refData} role={role} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} existingShipments={shipments} onDone={() => { setShowImport(false); loadShipments(); }} user={user} />}
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
          <FilterDropdown key={key} label={t(cfg.label)} value={filters[key]} options={[...cfg.options, "__empty__"]} optionLabels={{ "__empty__": t("未设置") }} onChange={v => setFilters(p => ({ ...p, [key]: v }))} />
        )}
        {!masked.has("entry_done") &&
          <FilterDropdown label={t("Entry")} value={filters.entry_done} options={["已录入", "未录入"]} onChange={v => setFilters(p => ({ ...p, entry_done: v }))} />}
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
function ShipmentDetail({ order, logs, role, user, onBack, onUpdateField, refData }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const masked = maskedFields(role);
  const canEdit = role === "admin" || role === "operator" || role === "sales";

  const startEdit = () => { setEditData({ ...order }); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setEditData({}); };
  const saveEdit = async () => {
    const changes = {};
    for (const k of Object.keys(editData)) {
      if (editData[k] !== order[k] && k !== "id" && k !== "created_at" && k !== "updated_at") {
        changes[k] = editData[k];
      }
    }
    if (Object.keys(changes).length === 0) { setEditing(false); return; }
    for (const [field, newV] of Object.entries(changes)) {
      await onUpdateField(order.id, field, order[field], newV);
    }
    setEditing(false);
  };
  const ed = (field) => editing ? editData[field] || "" : null;
  const setEd = (field, val) => setEditData(p => ({ ...p, [field]: val }));

  const EditableField = ({ label, field, type, options }) => {
    if (!editing) return <Field label={label} value={order[field]} />;
    if (options) {
      return (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
          <select value={ed(field)} onChange={e => setEd(field, e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", color: "#0c4a6e", boxSizing: "border-box" }}>
            <option value="">—</option>{options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
        <input type={type || "text"} value={ed(field)} onChange={e => setEd(field, e.target.value)} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", background: "#f0f9ff", fontSize: 12, fontWeight: 600, outline: "none", color: "#0c4a6e", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" }} />
      </div>
    );
  };

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0", border: "none", background: "none", color: "#0ea5e9", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>← Back</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: "'DM Mono',monospace" }}>{order.po || "No PO#"}</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "3px 0 0" }}>{order.tuc || ""}</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {Object.keys(STATUS_CONFIGS).map(k => order[k] ? <Badge key={k} value={order[k]} /> : null)}
          {canEdit && !editing && <Button small onClick={startEdit}>✎ {t("Edit")}</Button>}
          {editing && <><Button small onClick={saveEdit}>✓ {t("Save")}</Button><Button small variant="secondary" onClick={cancelEdit}>✕ {t("Cancel")}</Button></>}
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
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #0ea5e9" : "1px solid #e2e8f0" }}>
              <SectionHeader icon="📄" title={t("Order References")} accent="#0ea5e9" />
              <EditableField label={t("PO#")} field="po" />
              <EditableField label={t("Customer PO#")} field="customer_po" />
              <EditableField label={t("Supplier Order No#")} field="supplier_order_no" />
              <EditableField label={t("CRD Date")} field="crd_date" type="date" />
              <EditableField label={t("Incoterms")} field="incoterms" options={["FOB","CIF","EXW","CFR","DDP","DAP","FCA","CPT","CIP","DAT"]} />
            </div>
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #10b981" : "1px solid #e2e8f0" }}>
              <SectionHeader icon="🏢" title={t("Parties")} accent="#10b981" />
              <EditableField label={t("Supplier")} field="supplier" options={refData?.suppliers} />
              {!masked.has("customer")     && <EditableField label={t("Customer")} field="customer" options={refData?.customers} />}
              {!masked.has("end_customer") && <EditableField label={t("End Customer")} field="end_customer" options={refData?.endCustomers} />}
            </div>
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #f59e0b" : "1px solid #e2e8f0" }}>
              <SectionHeader icon="📦" title={t("Cargo Details")} accent="#f59e0b" />
              <EditableField label={t("Description (TUC)")} field="tuc" />
              <EditableField label={t("SKU")} field="sku" />
              <EditableField label={t("QTY (Packages)")} field="qty_packages" />
              <EditableField label={t("Weight (kg)")} field="weight" />
              <EditableField label={t("Volume (m³)")} field="volume" />
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: editing ? "2px solid #6366f1" : "1px solid #e2e8f0", marginBottom: 14 }}>
            <SectionHeader icon="🚢" title={t("Shipping Details")} accent="#6366f1" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0 24px" }}>
              <EditableField label={t("E-Booking No")} field="e_booking_no" />
              <EditableField label={t("Booking No")} field="booking_no" />
              <EditableField label={t("POL")} field="pol" options={refData?.ports} />
              <EditableField label={t("POD")} field="pod" options={refData?.ports} />
              <EditableField label={t("Carrier")} field="carrier" options={refData?.carriers} />
              <EditableField label={t("Agent")} field="carrier_agent" />
              <EditableField label={t("Container No")} field="container_no" />
              <EditableField label={t("QTY (Container)")} field="qty_container" />
              <EditableField label={t("Vessel")} field="vessel" />
              <EditableField label="ETD" field="etd" type="date" />
              <EditableField label="ETA" field="eta" type="date" />
            </div>
          </div>
          {/* Loading Data — from container_items, matched by PO */}
          <ShipmentLoadingFromContainers order={order} role={role} />
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
  const saveQueue = useRef({});
  const emptyRow = { po: shipment.po || "", customer_po: shipment.customer_po || "", sku: "", tuc: "", hs_code: "", booked_packages: null, packing_unit: "CTNS", booked_weight: null, booked_volume: null, marks: "", booking_no: shipment.booking_no || "", container_no: shipment.container_no || "", container_type: "40HQ", supplier: shipment.supplier || "", notes: "" };

  const load = useCallback(async () => {
    const { data } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id).order("created_at");
    setItems(data || []); setLoading(false);
  }, [shipment.id]);
  useEffect(() => { load(); }, [load]);

  const addRow = async () => {
    const tempId = "temp_" + Date.now();
    const row = { ...emptyRow, shipment_id: shipment.id, sort_order: items.length };
    for (const k of Object.keys(row)) { if (row[k] === "") row[k] = null; }
    // Optimistic: show immediately
    setItems(prev => [...prev, { ...row, id: tempId }]);
    // Save in background
    const { data, error } = await supabase.from("loading_details").insert(row).select("id").single();
    if (error || !data) { if (error) alert(error.message); load(); return; }
    // Replace temp id with real id
    setItems(prev => prev.map(it => it.id === tempId ? { ...it, id: data.id } : it));
  };

  const updateLocal = (id, field, value) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  const saveCell = async (id, field, value) => {
    if (String(id).startsWith("temp_")) return; // not yet saved to DB
    const numFields = ["booked_packages", "actual_packages", "booked_weight", "actual_weight", "booked_volume", "actual_volume"];
    const v = numFields.includes(field) ? (value === "" || value == null ? null : Number(value)) : (value === "" ? null : value);
    const { error } = await supabase.from("loading_details").update({ [field]: v }).eq("id", id);
    if (error) console.error("Save error:", error.message);
  };

  const deleteRow = async (id) => {
    if (!confirm("Delete this row?")) return;
    setItems(prev => prev.filter(it => it.id !== id));
    await supabase.from("loading_details").delete().eq("id", id);
    syncToShipment();
  };

  const syncToShipment = async () => {
    const { data: ld } = await supabase.from("loading_details").select("*").eq("shipment_id", shipment.id);
    if (!ld || ld.length === 0) return;
    const bookings = [...new Set(ld.map(d => d.booking_no).filter(Boolean))].join(", ");
    const containers = [...new Set(ld.map(d => d.container_no).filter(Boolean))].join(", ");
    // Count unique containers by container_no + container_type
    const uniqueCtrs = {};
    ld.forEach(d => {
      if (d.container_no) {
        const key = d.container_no;
        if (!uniqueCtrs[key]) uniqueCtrs[key] = d.container_type || "40HQ";
      }
    });
    const typeCount = {};
    Object.values(uniqueCtrs).forEach(t => { typeCount[t] = (typeCount[t] || 0) + 1; });
    const qtyStr = Object.entries(typeCount).map(([t, c]) => `${c}x${t}`).join(", ") || "";
    const updates = {};
    if (bookings) updates.booking_no = bookings;
    if (containers) updates.container_no = containers;
    if (qtyStr) updates.qty_container = qtyStr;
    if (Object.keys(updates).length > 0) await supabase.from("shipments").update(updates).eq("id", shipment.id);
  };

  const totals = useMemo(() => {
    const t = { pkgs: 0, wt: 0, vol: 0 };
    items.forEach(i => { t.pkgs += Number(i.booked_packages) || 0; t.wt += Number(i.booked_weight) || 0; t.vol += Number(i.booked_volume) || 0; });
    return t;
  }, [items]);

  const cellStyle = { padding: "4px 3px", fontSize: 11 };
  const inputStyle = { width: "100%", padding: "4px 6px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 11, outline: "none", boxSizing: "border-box", fontFamily: "'DM Mono',monospace" };
  const inputStyleSm = { ...inputStyle, width: 70, textAlign: "right" };

  return (
    <Modal onClose={() => { syncToShipment(); onSaved?.(); onClose(); }} width={1050} title={`${t("Loading Details")} — ${shipment.po}`}>
      {loading ? <Spinner /> : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: "#f0f9ff" }}>
                {["PO", "Customer PO", "SKU", t("TUC"), "HS Code", t("件数"), t("包装"), t("毛重 KGS"), t("体积 CBM"), t("唛头"), t("Booking"), t("柜号"), t("箱型"), t("委托方"), ""].map(h =>
                  <th key={h} style={{ padding: "6px 4px", textAlign: "left", fontWeight: 600, color: "#0369a1", fontSize: 10, borderBottom: "2px solid #bae6fd", whiteSpace: "nowrap" }}>{h}</th>
                )}
              </tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const cell = (field, w, opts) => {
                    const type = opts?.type || "text";
                    const step = opts?.step;
                    return <td style={cellStyle}><input style={{ ...(opts?.sm ? inputStyleSm : inputStyle), width: w }} type={type} step={step} value={it[field] ?? ""} onChange={e => updateLocal(it.id, field, e.target.value)} onBlur={e => saveCell(it.id, field, e.target.value)} /></td>;
                  };
                  return (
                    <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {cell("po", 90)}
                      {cell("customer_po", 85)}
                      {cell("sku", 100)}
                      {cell("tuc", 140)}
                      {cell("hs_code", 90)}
                      {cell("booked_packages", 70, { type: "number", sm: true })}
                      {cell("packing_unit", 50)}
                      {cell("booked_weight", 70, { type: "number", step: "0.0001", sm: true })}
                      {cell("booked_volume", 70, { type: "number", step: "0.0001", sm: true })}
                      {cell("marks", 70)}
                      {cell("booking_no", 100)}
                      {cell("container_no", 80)}
                      <td style={cellStyle}>
                        <select value={it.container_type || "40HQ"} onChange={e => { updateLocal(it.id, "container_type", e.target.value); saveCell(it.id, "container_type", e.target.value); }} style={{ ...inputStyle, width: 65 }}>
                          {["20GP","40GP","40HQ","45HQ","20RF","40RF"].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </td>
                      {cell("supplier", 80)}
                      <td style={cellStyle}><button onClick={() => deleteRow(it.id)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕</button></td>
                    </tr>
                  );
                })}
                {items.length > 0 && (
                  <tr style={{ background: "#f0f9ff", fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: "8px 4px", textAlign: "right", fontSize: 11, color: "#0369a1" }}>{t("Total")}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontSize: 11 }}>{totals.pkgs}</td>
                    <td />
                    <td style={{ padding: "8px 4px", textAlign: "right", fontSize: 11 }}>{totals.wt.toFixed(4)}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontSize: 11 }}>{totals.vol.toFixed(4)}</td>
                    <td colSpan={6} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Button variant="secondary" onClick={addRow}>+ {t("新增行")}</Button>
          </div>
        </>
      )}
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

// =========================================================================
// Batch Update Bar — bulk change any field for selected shipments
// =========================================================================
function BatchUpdateBar({ checkedIds, role, user, onClear, onUpdate, onDelete, onDuplicate, refData }) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [applying, setApplying] = useState(false);

  // All batch-editable fields grouped
  const statusFields = Object.entries(STATUS_CONFIGS).map(([k, v]) => ({ key: k, label: t(v.label), options: v.options }));
  const textFields = [
    { key: "supplier", label: t("Supplier"), options: refData?.suppliers },
    { key: "customer", label: t("Customer"), options: refData?.customers },
    { key: "end_customer", label: t("End Customer"), options: refData?.endCustomers },
    { key: "carrier", label: t("Carrier"), options: refData?.carriers },
    { key: "carrier_agent", label: t("Agent") },
    { key: "pol", label: t("POL"), options: refData?.ports },
    { key: "pod", label: t("POD"), options: refData?.ports },
    { key: "vessel", label: t("Vessel") },
    { key: "etd", label: "ETD", type: "date" },
    { key: "eta", label: "ETA", type: "date" },
    { key: "booking_no", label: t("Booking No") },
    { key: "container_no", label: t("Container No") },
    { key: "qty_container", label: t("QTY (Container)") },
    { key: "entry_done", label: t("Entry Status"), options: ["true", "false"] },
  ];
  const allFields = [...statusFields, ...textFields].filter(f => canEditField(role, f.key));

  const selectedField = allFields.find(f => f.key === field);

  const doApply = async () => {
    if (!field || !value) return;
    setApplying(true);
    const v = field === "entry_done" ? value === "true" : value;
    await onUpdate(field, v);
    setApplying(false);
    setField(""); setValue("");
  };

  return (
    <div style={{ background: "#0f172a", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{t("已选")} {checkedIds.size} {t("条")}</span>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin(user) && <button onClick={onDuplicate} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", background: "none", color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t("Duplicate")}</button>}
          {isAdmin(user) && <button onClick={onDelete} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #7f1d1d", background: "#450a0a", color: "#fca5a5", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t("Delete")}</button>}
          <button onClick={onClear} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #334155", background: "none", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t("Cancel")}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={field} onChange={e => { setField(e.target.value); setValue(""); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, fontWeight: 600, outline: "none", minWidth: 160 }}>
          <option value="">{t("选择要修改的字段")}</option>
          <optgroup label={t("状态字段")}>
            {statusFields.filter(f => canEditField(role, f.key)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </optgroup>
          <optgroup label={t("其他字段")}>
            {textFields.filter(f => canEditField(role, f.key)).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </optgroup>
        </select>
        {field && selectedField && (
          selectedField.options
            ? <select value={value} onChange={e => setValue(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, fontWeight: 600, outline: "none", minWidth: 140 }}>
                <option value="">{t("选择值")}</option>
                {(field === "entry_done" ? [{v:"true",l:"✓ 已录单"},{v:"false",l:"✗ 未录单"}] : selectedField.options.map(o => ({v:o,l:o}))).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            : <input type={selectedField.type || "text"} value={value} onChange={e => setValue(e.target.value)} placeholder={selectedField.label}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, fontWeight: 600, outline: "none", minWidth: 140 }} />
        )}
        {field && value && (
          <button onClick={doApply} disabled={applying} style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "#0ea5e9", color: "#fff", fontSize: 12, fontWeight: 700, cursor: applying ? "wait" : "pointer", opacity: applying ? 0.7 : 1 }}>
            {applying ? "..." : `${t("应用到")} ${checkedIds.size} ${t("条")}`}
          </button>
        )}
      </div>
    </div>
  );
}

// Show loading data from container_items, matched by PO/customer_po
// Compares original shipment data vs real loading data
function ShipmentLoadingFromContainers({ order, role }) {
  const [items, setItems] = useState([]);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Find container_items matching this shipment by PO + Customer PO (AND)
      let allItems = [];
      if (order.po && order.customer_po) {
        // Both fields: AND match
        const { data } = await supabase.from("container_items").select("*")
          .eq("po", order.po).eq("customer_po", String(order.customer_po));
        allItems = data || [];
      } else if (order.customer_po) {
        // Only customer_po
        const { data } = await supabase.from("container_items").select("*")
          .eq("customer_po", String(order.customer_po));
        allItems = data || [];
      } else if (order.po) {
        // Only po (fallback)
        const { data } = await supabase.from("container_items").select("*")
          .eq("po", order.po);
        allItems = data || [];
      }
      setItems(allItems);

      // Fetch associated containers
      const cIds = [...new Set(allItems.map(i => i.container_id).filter(Boolean))];
      if (cIds.length > 0) {
        const { data } = await supabase.from("containers").select("*").in("id", cIds);
        setContainers(data || []);
        // Auto-sync: update shipment's container_no/booking_no from linked containers
        if (data && data.length > 0) {
          const ctrNos = [...new Set(data.map(c => c.container_no).filter(Boolean))].join(", ");
          const bkgNos = [...new Set(data.map(c => c.booking_no).filter(Boolean))].join(", ");
          const vessels = [...new Set(data.map(c => c.vessel).filter(Boolean))];
          const carriers = [...new Set(data.map(c => c.carrier).filter(Boolean))];
          const updates = {};
          if (ctrNos && ctrNos !== order.container_no) updates.container_no = ctrNos;
          if (bkgNos && bkgNos !== order.booking_no) updates.booking_no = bkgNos;
          if (vessels.length === 1 && !order.vessel) updates.vessel = vessels[0];
          if (carriers.length === 1 && !order.carrier) updates.carrier = carriers[0];
          if (Object.keys(updates).length > 0) {
            supabase.from("shipments").update(updates).eq("id", order.id);
          }
        }
      }
      setLoading(false);
    })();
  }, [order.po, order.customer_po]);

  if (loading) return null;

  const ctrMap = Object.fromEntries(containers.map(c => [c.id, c]));

  // Original data from shipment
  const origQty = Number(order.qty_packages) || 0;
  const origWeight = Number(order.weight) || 0;
  const origVolume = Number(order.volume) || 0;

  // Real loading data from container_items
  const realQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const realWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const realVolume = items.reduce((s, i) => s + (Number(i.volume) || 0), 0);

  const diffQty = realQty - origQty;
  const diffWeight = realWeight - origWeight;
  const diffVolume = realVolume - origVolume;
  const diffColor = (v) => v === 0 ? "#64748b" : v > 0 ? "#16a34a" : "#dc2626";

  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "2px solid #f59e0b", marginBottom: 14 }}>
      <SectionHeader icon="📋" title={t("Loading Details")} accent="#f59e0b" />

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
          {t("暂无装柜数据")} — {t("请在 Container 中录入装柜明细")}
        </div>
      ) : (
        <>
          {/* Original vs Real comparison */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10, marginBottom: 14 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{t("件数")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>{t("原数据")}: {origQty}</span>
                <span style={{ fontWeight: 700 }}>{t("实际")}: {realQty}</span>
              </div>
              {origQty > 0 && <div style={{ fontSize: 11, color: diffColor(diffQty), fontWeight: 600, marginTop: 2 }}>{diffQty > 0 ? "+" : ""}{diffQty}</div>}
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{t("毛重 KGS")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>{t("原数据")}: {origWeight}</span>
                <span style={{ fontWeight: 700 }}>{t("实际")}: {realWeight.toFixed(4)}</span>
              </div>
              {origWeight > 0 && <div style={{ fontSize: 11, color: diffColor(diffWeight), fontWeight: 600, marginTop: 2 }}>{diffWeight > 0 ? "+" : ""}{diffWeight.toFixed(4)}</div>}
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>CBM</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>{t("原数据")}: {origVolume}</span>
                <span style={{ fontWeight: 700 }}>{t("实际")}: {realVolume.toFixed(4)}</span>
              </div>
              {origVolume > 0 && <div style={{ fontSize: 11, color: diffColor(diffVolume), fontWeight: 600, marginTop: 2 }}>{diffVolume > 0 ? "+" : ""}{diffVolume.toFixed(4)}</div>}
            </div>
          </div>

          {/* Loading items table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginBottom: 8 }}>
            <thead><tr style={{ background: "#fffbeb" }}>
              {[t("Supplier"), t("TUC"), "SKU", "QTY", t("Weight"), "CBM", "HBL", t("柜号"), t("Booking")].map(h =>
                <th key={h} style={{ padding: "4px 4px", textAlign: "left", fontWeight: 600, color: "#92400e", fontSize: 10, borderBottom: "1px solid #fde68a" }}>{h}</th>
              )}
            </tr></thead>
            <tbody>
              {items.map(it => {
                const ctr = ctrMap[it.container_id];
                return (
                  <tr key={it.id} style={{ borderBottom: "1px solid #fef3c7" }}>
                    <td style={{ padding: "4px" }}>{tSupplier(it.supplier) || "—"}</td>
                    <td style={{ padding: "4px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.tuc || "—"}</td>
                    <td style={{ padding: "4px", fontFamily: "'DM Mono',monospace", fontSize: 9 }}>{it.sku || "—"}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{it.qty || "—"}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{it.weight || "—"}</td>
                    <td style={{ padding: "4px", textAlign: "right" }}>{it.volume || "—"}</td>
                    <td style={{ padding: "4px", fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{it.hbl || "—"}</td>
                    <td style={{ padding: "4px", fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#0369a1" }}>{ctr?.container_no || "—"}</td>
                    <td style={{ padding: "4px", fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{ctr?.booking_no || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Containers list */}
          {containers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {containers.map(c => (
                <div key={c.id} style={{ background: "#f0f9ff", borderRadius: 6, padding: "6px 10px", marginTop: 4, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, color: "#0369a1", fontFamily: "'DM Mono',monospace" }}>🚛 {c.container_no || "—"}</span>
                  <span style={{ color: "#64748b" }}>{c.booking_no || ""} · {c.vessel || ""} · {c.carrier || ""}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Best-effort: when render returns React, fall back to a text representation.
function extractTextFromCell(col, o) {
  if (col.key === "supplier") return tSupplier(o.supplier) || "";
  if (col.key === "route")   return o.pol && o.pod ? `${(o.pol || "").split("(")[0].trim()} -> ${(o.pod || "").split("(")[0].trim()}` : "";
  if (col.key === "carrier") return o.carrier ? (o.carrier_agent ? `${o.carrier} (${o.carrier_agent})` : o.carrier) : "";
  // For Badge-rendered status fields, the underlying value is the field key itself
  return o[col.key] || "";
}

// =========================================================================
// Import Modal — CSV bulk import with duplicate detection
// =========================================================================
function ImportModal({ onClose, existingShipments, onDone, user }) {
  const [rows, setRows] = useState([]);
  const [dupes, setDupes] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");

  const FIELD_MAP = {
    "po#": "po", "po": "po",
    "customer po#": "customer_po", "customer po": "customer_po", "cust po#": "customer_po", "cust po": "customer_po", "customer_po": "customer_po",
    "booking no": "booking_no", "booking": "booking_no", "booking_no": "booking_no",
    "vessel": "vessel", "vessel name": "vessel",
    "etd": "etd", "eta": "eta",
    "pod": "pod", "pol": "pol",
    "supplier": "supplier", "customer": "customer",
    "end customer": "end_customer", "end_customer": "end_customer",
    "tuc": "tuc", "description": "tuc", "tuc / description": "tuc",
    "sku": "sku", "carrier": "carrier",
    "container no": "container_no", "container_no": "container_no",
    "qty container": "qty_container", "qty_container": "qty_container",
    "qty packages": "qty_packages", "qty_packages": "qty_packages",
    "weight": "weight", "weight (kg)": "weight",
    "volume": "volume", "volume (m³)": "volume",
    "incoterms": "incoterms",
    "e-booking no": "e_booking_no", "e_booking_no": "e_booking_no",
    "agent": "carrier_agent", "carrier_agent": "carrier_agent",
    "supplier order no#": "supplier_order_no", "supplier_order_no": "supplier_order_no",
    "crd date": "crd_date", "crd_date": "crd_date",
    "qc status": "qc_status", "qc_status": "qc_status",
    "space status": "space_status", "space_status": "space_status",
    "payment": "local_payment", "local_payment": "local_payment", "local payment": "local_payment",
    "telex release": "telex_release", "telex_release": "telex_release", "telex": "telex_release",
    "bl status": "bl_status", "bl_status": "bl_status", "b/l status": "bl_status",
  };

  const parseCSV = (text) => {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const headers = rawHeaders.map(h => FIELD_MAP[h.toLowerCase()] || null);
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      // Simple CSV split — handles quoted fields with commas
      const vals = [];
      let cur = "", inQ = false;
      for (const ch of lines[i]) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      vals.push(cur.trim());
      const row = {};
      headers.forEach((h, idx) => { if (h) row[h] = vals[idx] || null; });
      if (Object.keys(row).length > 0) data.push(row);
    }
    return data;
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv")) {
      alert("请先将 Excel 文件另存为 CSV 格式再上传"); return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => checkDupes(parseCSV(ev.target.result));
    reader.readAsText(file);
  };

  const checkDupes = (parsed) => {
    const existingCPOs = new Set(existingShipments.map(s => String(s.customer_po || "")));
    const duplicates = [], clean = [];
    for (const row of parsed) {
      const cpo = String(row.customer_po || "");
      if (cpo && existingCPOs.has(cpo)) {
        duplicates.push(row);
      } else {
        clean.push(row);
        if (cpo) existingCPOs.add(cpo);
      }
    }
    setRows(clean);
    setDupes(duplicates);
  };

  const doImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    let success = 0, failed = 0, lastErr = "";
    // Batch insert in chunks of 20
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      try {
        const { error } = await supabase.from("shipments").insert(batch);
        if (error) { failed += batch.length; lastErr = error.message || JSON.stringify(error); } else { success += batch.length; }
      } catch (e) { failed += batch.length; lastErr = e.message || String(e); }
    }
    setResult({ success, failed, lastErr });
    setImporting(false);
    if (success > 0) setTimeout(() => onDone(), 1500);
  };

  const previewCols = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <Modal onClose={onClose} title={t("Import")} width={900}>

      {!rows.length && !dupes.length && (
        <div style={{ padding: "30px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>上传 CSV 文件批量导入货件</p>
          <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16 }}>支持字段：PO#, Customer PO#, Booking No, Vessel, ETD, ETA, POL, POD, Supplier, Customer, Carrier 等</p>
          <label style={{ display: "inline-block", padding: "10px 24px", borderRadius: 8, background: "#0ea5e9", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            选择 CSV 文件
            <input type="file" accept=".csv,.tsv" onChange={handleFile} style={{ display: "none" }} />
          </label>
        </div>
      )}

      {dupes.length > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 6 }}>⚠ {dupes.length} 条记录因 Customer PO# 重复被跳过：</div>
          <div style={{ fontSize: 11, color: "#78350f", maxHeight: 100, overflowY: "auto" }}>
            {dupes.map((d, i) => <div key={i}>Customer PO: {d.customer_po} — PO: {d.po || ""}</div>)}
          </div>
        </div>
      )}

      {result && (
        <div style={{ background: result.failed ? "#fef3c7" : "#d1fae5", border: `1px solid ${result.failed ? "#f59e0b" : "#10b981"}`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: result.failed ? "#92400e" : "#065f46" }}>
            ✓ 导入完成：{result.success} 条成功{result.failed > 0 && `，${result.failed} 条失败`}
          </div>
          {result.lastErr && <div style={{ fontSize: 11, color: "#92400e", marginTop: 6, wordBreak: "break-all" }}>错误: {result.lastErr}</div>}
        </div>
      )}

      {rows.length > 0 && !result && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>预览 — {rows.length} 条待导入 {fileName && <span style={{ color: "#94a3b8", fontWeight: 400 }}>({fileName})</span>}</div>
          <div style={{ maxHeight: 350, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>
                {previewCols.map(c => <th key={c} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#64748b", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", position: "sticky", top: 0 }}>{c}</th>)}
              </tr></thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    {previewCols.map(c => <td key={c} style={{ padding: "5px 8px", color: "#0f172a" }}>{row[c] || "—"}</td>)}
                  </tr>
                ))}
                {rows.length > 50 && <tr><td colSpan={previewCols.length} style={{ padding: 8, textAlign: "center", color: "#94a3b8" }}>...还有 {rows.length - 50} 条</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length > 0 && !result && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={doImport} disabled={importing}>{importing ? "导入中..." : `确认导入 ${rows.length} 条`}</Button>
        </div>
      )}
    </Modal>
  );
}
