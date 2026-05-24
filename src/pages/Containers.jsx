// 柜子管理 — list / detail / 装柜明细
// 重构：用 shell.css 类替换 inline 样式 + ui.jsx 旧组件
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { tSupplier, t } from "../lib/i18n.js";

// ============================================================
// ContainersPage
// ============================================================
export function ContainersPage({ user }) {
  const role = user.profile?.role || "operator";
  const [containers, setContainers] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from("containers").select("*").order("created_at", { ascending: false }),
      supabase.from("container_types").select("*").order("sort_order"),
    ]);
    setContainers(c || []); setTypes(t || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const typeMap = useMemo(() => Object.fromEntries(types.map(t => [t.id, t.name])), [types]);

  const filtered = useMemo(() => containers.filter(c => {
    if (typeFilter && typeMap[c.type_id] !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fields = [c.container_no, c.booking_no, c.vessel, c.carrier, c.customer, c.pol, c.pod].filter(Boolean);
      if (!fields.some(f => f.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [containers, search, typeFilter, typeMap]);

  const selected = containers.find(c => c.id === selectedId);
  if (loading) return <div className="empty-state empty-text">加载中...</div>;

  if (selected) {
    return <ContainerDetail container={selected} types={types} typeMap={typeMap} role={role} user={user}
      onBack={() => { setSelectedId(null); load(); }} onReload={load} />;
  }

  const canCreate = role === "admin" || role === "operator" || role === "sales";

  return (
    <>
      <h1 className="page-title">{t("Containers")}</h1>

      <div className="page-section-bar">
        <input className="field-input" placeholder={t("Search container / booking / vessel / customer...")}
               value={search} onChange={e => setSearch(e.target.value)}
               style={{ width: 240 }} />
        <select className="field-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 130 }}>
          <option value="">{t("All Types")}</option>
          {types.map(typ => <option key={typ.id} value={typ.name}>{typ.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>{filtered.length} {t("items")}</span>
        {canCreate && <button className="btn primary" onClick={() => setShowNew(true)}>{t("+ New Container")}</button>}
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state empty-text">{t("No containers")}</div>
        ) : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Container No (col)")}</th>
                <th>{t("Booking No (col)")}</th>
                <th>{t("Vessel (col)")}</th>
                <th>{t("Carrier")}</th>
                <th>{t("Cnt Type")}</th>
                <th>{t("Customer")}</th>
                <th>POL → POD</th>
                <th>ETD</th>
                <th>{t("Note")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelectedId(c.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--shell-primary)" }}>{c.container_no || "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{c.booking_no || "—"}</td>
                  <td>{c.vessel || "—"}</td>
                  <td>{c.carrier || "—"}</td>
                  <td>{typeMap[c.type_id] ? <span className="badge info">{typeMap[c.type_id]}</span> : "—"}</td>
                  <td>{c.customer || "—"}</td>
                  <td>{c.pol && c.pod ? `${c.pol} → ${c.pod}` : "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{c.etd || "—"}</td>
                  <td className="muted" style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewContainerModal types={types} onClose={() => setShowNew(false)} onSave={() => { setShowNew(false); load(); }} />}
    </>
  );
}

// ============================================================
// 详情：可编辑字段
// 在外部定义，避免父组件 setState 导致重建 / input 失焦
// ============================================================
function EditField({ label, field, type, options, editing, ed, setEd, container }) {
  const value = container[field];
  if (!editing) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: value ? "var(--shell-text)" : "var(--shell-text-3)" }}>{value || "—"}</div>
      </div>
    );
  }
  return (
    <div className="field" style={{ marginBottom: 8 }}>
      <label className="field-label">{label}</label>
      {options ? (
        <select className="field-select" value={ed(field)} onChange={e => setEd(field, e.target.value)}>
          <option value="">—</option>
          {options.map(o => (
            <option key={typeof o === "object" ? o.id : o} value={typeof o === "object" ? o.id : o}>
              {typeof o === "object" ? o.name : o}
            </option>
          ))}
        </select>
      ) : (
        <input className="field-input" type={type || "text"} value={ed(field)} onChange={e => setEd(field, e.target.value)} />
      )}
    </div>
  );
}

// ============================================================
// 柜子详情
// ============================================================
const LOADING_COL_DEFAULTS = { supplier: 110, po: 90, customer_po: 80, tuc: 140, sku: 90, qty: 60, weight: 70, volume: 60, hbl: 80, del: 30 };
const LOADING_COL_KEY = "loading-items-col-widths";

function ContainerDetail({ container, types, typeMap, role, user, onBack, onReload }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [loadingItems, setLoadingItems] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const canEdit = role === "admin" || role === "operator" || role === "sales";

  const [colW, setColW] = useState(() => {
    try { return { ...LOADING_COL_DEFAULTS, ...JSON.parse(localStorage.getItem(LOADING_COL_KEY) || "{}") }; }
    catch { return LOADING_COL_DEFAULTS; }
  });
  const startColResize = (field) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colW[field];
    const onMove = (ev) => {
      const w = Math.max(40, startW + (ev.clientX - startX));
      setColW(prev => ({ ...prev, [field]: w }));
    };
    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const w = Math.max(40, startW + (ev.clientX - startX));
      setColW(prev => {
        const next = { ...prev, [field]: w };
        try { localStorage.setItem(LOADING_COL_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const loadItems = useCallback(async () => {
    const { data } = await supabase.from("container_items").select("*").eq("container_id", container.id)
      .order("sort_order").order("created_at");
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
    if (!confirm("删除此装柜明细？")) return;
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
    const row = {
      container_id: container.id,
      supplier: "", po: "", customer_po: "", tuc: "", sku: "",
      qty: null, weight: null, volume: null, hbl: "", notes: "", sort_order: items.length,
    };
    const { error } = await supabase.from("container_items").insert(row);
    if (error) alert(error.message);
    loadItems();
  };

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

  const supplierCount = Object.keys(supplierSummary).length;
  const poCount = new Set(items.map(i => i.po).filter(Boolean)).size;
  const autoType = supplierCount > 1 || poCount > 1 ? "Console Box" : "FCL";

  return (
    <>
      <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>← 返回</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontFamily: "monospace" }}>
            {container.container_no || container.booking_no || "新柜子"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--shell-text-2)", margin: "3px 0 0" }}>
            {container.vessel || ""} {container.etd ? `· ETD ${container.etd}` : ""}
            {typeMap[container.type_id] && (
              <span className="badge info" style={{ marginLeft: 8 }}>{typeMap[container.type_id]}</span>
            )}
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--shell-text-3)" }}>({autoType})</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {canEdit && !editing && <button className="btn" onClick={startEdit}>✎ 编辑</button>}
          {editing && (
            <>
              <button className="btn primary" onClick={saveEdit}>✓ 保存</button>
              <button className="btn" onClick={cancelEdit}>✕ 取消</button>
            </>
          )}
        </div>
      </div>

      {/* 柜子三栏信息 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div className="page-card" style={editing ? { borderColor: "var(--shell-primary)" } : undefined}>
          <div className="card-title">📦 {t("Container Info")}</div>
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Container No (col)")} field="container_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Container Qty (label)")} field="qty_container" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Seal No (label)")} field="seal_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Type")} field="type_id" options={types} />
        </div>
        <div className="page-card" style={editing ? { borderColor: "#6366f1" } : undefined}>
          <div className="card-title">🚢 {t("Shipping Info Card")}</div>
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Booking No (col)")} field="booking_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("E-Booking")} field="e_booking_no" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Vessel Name")} field="vessel" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Carrier Co")} field="carrier" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Agent")} field="carrier_agent" />
        </div>
        <div className="page-card" style={editing ? { borderColor: "#10b981" } : undefined}>
          <div className="card-title">🗺 {t("Route & Dates Card")}</div>
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="POL" field="pol" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="POD" field="pod" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="ETD" field="etd" type="date" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label="ETA" field="eta" type="date" />
          <EditField editing={editing} ed={ed} setEd={setEd} container={container} label={t("Customer")} field="customer" />
        </div>
      </div>

      <div className="page-card">
        <div className="card-title">📝 {t("Note")}</div>
        {editing ? (
          <textarea className="field-textarea" value={ed("notes")} onChange={e => setEd("notes", e.target.value)}
                    rows={3} placeholder="备注（短出/剩余空间等）" />
        ) : (
          <p style={{ fontSize: 13, color: container.notes ? "var(--shell-text)" : "var(--shell-text-3)", margin: 0, whiteSpace: "pre-wrap" }}>
            {container.notes || "—"}
          </p>
        )}
      </div>

      {/* 装柜明细 */}
      <div className="page-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--shell-border-2)" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>📋 装柜明细</div>
          {canEdit && <button className="btn primary" onClick={() => setShowAddItem(true)}>+ 添加明细</button>}
        </div>

        {loadingItems ? (
          <div className="empty-state empty-text">加载中...</div>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--shell-text-3)", margin: "8px 0 0" }}>暂无装柜明细</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed", width: "auto" }}>
              <colgroup>
                {["supplier","po","customer_po","tuc","sku","qty","weight","volume","hbl","del"].map(k =>
                  <col key={k} style={{ width: colW[k] }} />
                )}
              </colgroup>
              <thead>
                <tr style={{ background: "#fafbfc" }}>
                  {[
                    { k: "supplier", label: "供应商" },
                    { k: "po", label: "PO" },
                    { k: "customer_po", label: "Customer PO" },
                    { k: "tuc", label: "TUC" },
                    { k: "sku", label: "SKU" },
                    { k: "qty", label: "QTY" },
                    { k: "weight", label: "毛重 KGS" },
                    { k: "volume", label: "CBM" },
                    { k: "hbl", label: "HBL" },
                    { k: "del", label: "" },
                  ].map((c, i, arr) => (
                    <th key={c.k} style={{
                      padding: "6px 6px", textAlign: "left", fontWeight: 500,
                      color: "var(--shell-text-2)", fontSize: 11,
                      borderBottom: "1px solid var(--shell-border)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      position: "relative", userSelect: "none",
                    }}>
                      {c.label}
                      {i < arr.length - 1 && (
                        <div onMouseDown={startColResize(c.k)} title="拖拽改变列宽"
                             style={{ position: "absolute", top: 0, right: -3, width: 6, height: "100%", cursor: "col-resize", zIndex: 1 }} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const inputStyle = {
                    width: "100%", padding: "4px 6px",
                    border: "1px solid transparent", borderRadius: 3,
                    fontSize: 12, outline: "none", boxSizing: "border-box",
                    background: canEdit ? "transparent" : "transparent",
                    fontFamily: "inherit",
                  };
                  const cell = (field, opts) => (
                    <td style={{ padding: "2px 2px" }}>
                      <input style={{ ...inputStyle, ...(opts?.align ? { textAlign: opts.align } : {}) }}
                             type={opts?.type || "text"} step={opts?.step}
                             value={it[field] ?? ""} readOnly={!canEdit}
                             onChange={e => updateItemLocal(it.id, field, e.target.value)}
                             onBlur={e => saveItemCell(it.id, field, e.target.value)}
                             onFocus={e => canEdit && (e.target.style.border = "1px solid var(--shell-primary)")}
                             onBlurCapture={e => (e.target.style.border = "1px solid transparent")} />
                    </td>
                  );
                  return (
                    <tr key={it.id} style={{ borderBottom: "1px solid var(--shell-border-2)" }}>
                      {cell("supplier")}
                      {cell("po")}
                      {cell("customer_po")}
                      {cell("tuc")}
                      {cell("sku")}
                      {cell("qty", { type: "number", align: "right" })}
                      {cell("weight", { type: "number", step: "0.0001", align: "right" })}
                      {cell("volume", { type: "number", step: "0.0001", align: "right" })}
                      {cell("hbl")}
                      <td style={{ padding: "2px 2px", textAlign: "center" }}>
                        {canEdit && (
                          <button onClick={() => handleDeleteItem(it.id)}
                                  style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {items.length > 0 && (
                  <tr style={{ background: "#fafbfc", fontWeight: 600 }}>
                    <td colSpan={5} style={{ padding: "8px 6px", textAlign: "right", fontSize: 12 }}>合计</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 12 }}>{totalQty}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 12 }}>{totalWeight.toFixed(4)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 12 }}>{totalVolume.toFixed(4)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={addEmptyRow}>+ 新增行</button>
            <button className="btn primary" onClick={() => setShowAddItem(true)}>+ 从货件选择</button>
          </div>
        )}

        {items.length > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: "var(--shell-bg)", borderRadius: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--shell-text)", marginBottom: 6 }}>按供应商汇总</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
              {Object.entries(supplierSummary).map(([s, d]) => (
                <div key={s} style={{ background: "#fff", borderRadius: 4, padding: "6px 10px", border: "1px solid var(--shell-border)" }}>
                  <span style={{ fontWeight: 600 }}>{tSupplier(s)}</span>
                  <span style={{ color: "var(--shell-text-2)", marginLeft: 8 }}>
                    {d.count} 行 · {d.qty} CTNS · {d.weight.toFixed(4)} kg · {d.volume.toFixed(4)} m³
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>
              合计：{totalQty} CTNS · {totalWeight.toFixed(4)} kg · {totalVolume.toFixed(4)} m³
            </div>
          </div>
        )}
      </div>

      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onSave={handleAddItem} />}
    </>
  );
}

// ============================================================
// 新建柜子（含货件搜索 + 自动分组）
// ============================================================
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
      tuc: s.tuc || "", sku: s.sku || "", hs_code: "",
      qty: s.qty_packages || "", packing_unit: "CTNS",
      weight: s.weight || "", volume: s.volume || "",
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

  const validation = useMemo(() => {
    const pairs = new Map();
    const sealToCtr = new Map();
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
    if (lines.length === 0) { alert("请至少添加一行装柜明细"); return; }
    if (!validation.ok) { setError(validation.msg); return; }
    setSaving(true);

    const groups = {};
    for (const ln of lines) {
      const key = (ln.container_no || "").trim() || "__default__";
      if (!groups[key]) groups[key] = { container_no: ln.container_no?.trim() || null, seal_no: ln.seal_no?.trim() || null, items: [] };
      groups[key].items.push(ln);
      if (ln.seal_no?.trim() && !groups[key].seal_no) groups[key].seal_no = ln.seal_no.trim();
    }

    const supplierCount = new Set(lines.map(l => l.supplier).filter(Boolean)).size;
    const poCount = new Set(lines.map(l => l.po).filter(Boolean)).size;
    const isConsole = supplierCount > 1 || poCount > 1;
    const consoleTid = types.find(t => t.name === "Console Box")?.id;
    const fclTid = types.find(t => t.name === "FCL")?.id;

    for (const [, grp] of Object.entries(groups)) {
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
      if (cErr || !created) { alert("柜子写入失败：" + (cErr?.message || "Failed")); setSaving(false); return; }

      const itms = grp.items.map((ln, i) => ({
        container_id: created.id, shipment_id: ln.shipment_id || null,
        supplier: ln.supplier || null, po: ln.po || null, customer_po: ln.customer_po || null,
        tuc: ln.tuc || null, sku: ln.sku || null,
        qty: ln.qty ? Number(ln.qty) : null, weight: ln.weight ? Number(ln.weight) : null,
        volume: ln.volume ? Number(ln.volume) : null, hbl: ln.hbl || null, sort_order: i,
      }));
      await supabase.from("container_items").insert(itms);
    }
    setSaving(false);
    onSave();
  };

  const totals = lines.reduce((t, ln) => ({
    qty: t.qty + (Number(ln.qty) || 0),
    wt: t.wt + (Number(ln.weight) || 0),
    vol: t.vol + (Number(ln.volume) || 0),
  }), { qty: 0, wt: 0, vol: 0 });

  const inputStyle = { padding: "4px 6px", border: "1px solid var(--shell-border)", borderRadius: 3, fontSize: 11, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <Modal title="新建柜子" onClose={onClose} width={1200} footer={
      <>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={submit} disabled={saving || lines.length === 0 || !validation.ok}>
          {saving ? "保存中..." : `保存（${validation.containerCount || 1} 个柜）`}
        </button>
      </>
    }>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>1. 添加装柜明细 — 搜索 PO / Customer PO / 品名</div>
        <div style={{ position: "relative" }}>
          <input className="field-input" value={poSearch} onChange={e => setPoSearch(e.target.value)}
                 placeholder="输入 PO 或 Customer PO 搜索..." />
          {poFiltered.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 2,
              background: "#fff", border: "1px solid var(--shell-border)", borderRadius: 4,
              maxHeight: 240, overflowY: "auto", zIndex: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}>
              {poFiltered.map(s => (
                <div key={s.id} onClick={() => addFromShipment(s)} style={{
                  padding: "6px 12px", cursor: "pointer", fontSize: 12,
                  borderBottom: "1px solid var(--shell-border-2)", display: "flex", gap: 12,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--shell-primary-50)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontWeight: 600, color: "var(--shell-primary)", fontFamily: "monospace", minWidth: 100 }}>{s.po}</span>
                  <span style={{ fontFamily: "monospace", minWidth: 80, color: "var(--shell-text-2)" }}>{s.customer_po}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tuc || "—"}</span>
                  <span style={{ color: "var(--shell-text-3)" }}>{tSupplier(s.supplier) || ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <div style={{ overflowX: "auto", marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: "#fafbfc" }}>
                {["柜号","封号","供应商","PO","Cust PO","TUC","HS Code","QTY","毛重","CBM","HBL",""].map(h =>
                  <th key={h} style={{ padding: "6px 4px", textAlign: "left", fontWeight: 500, color: "var(--shell-text-2)", fontSize: 10, borderBottom: "1px solid var(--shell-border)", whiteSpace: "nowrap" }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--shell-border-2)" }}>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 85, background: "#fffbeb" }} value={ln.container_no} onChange={e => updateLine(i, "container_no", e.target.value)} placeholder="CNTR" /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 70, background: "#fffbeb" }} value={ln.seal_no} onChange={e => updateLine(i, "seal_no", e.target.value)} placeholder="Seal" /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 85 }} value={ln.supplier} onChange={e => updateLine(i, "supplier", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 90, fontWeight: 600, color: "var(--shell-primary)" }} value={ln.po} onChange={e => updateLine(i, "po", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 70 }} value={ln.customer_po} onChange={e => updateLine(i, "customer_po", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 120 }} value={ln.tuc} onChange={e => updateLine(i, "tuc", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 70 }} value={ln.hs_code || ""} onChange={e => updateLine(i, "hs_code", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 55, textAlign: "right" }} type="number" value={ln.qty} onChange={e => updateLine(i, "qty", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 60, textAlign: "right" }} type="number" step="0.0001" value={ln.weight} onChange={e => updateLine(i, "weight", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 55, textAlign: "right" }} type="number" step="0.0001" value={ln.volume} onChange={e => updateLine(i, "volume", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}><input style={{ ...inputStyle, width: 70 }} value={ln.hbl || ""} onChange={e => updateLine(i, "hbl", e.target.value)} /></td>
                  <td style={{ padding: "2px 2px" }}>
                    <button onClick={() => removeLine(i)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>✕</button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "#fafbfc", fontWeight: 600 }}>
                <td colSpan={7} style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>合计</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>{totals.qty}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>{totals.wt.toFixed(4)}</td>
                <td style={{ padding: "6px 4px", textAlign: "right", fontSize: 11 }}>{totals.vol.toFixed(4)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button className="btn" onClick={addEmptyLine}>+ 手动添加行</button>
          </div>
        </div>
      )}

      {(error || !validation.ok) && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4,
          padding: 10, marginBottom: 12, fontSize: 12, color: "#dc2626", fontWeight: 500,
        }}>
          ⚠ {error || validation.msg}
        </div>
      )}

      {lines.length > 0 && validation.ok && (
        <div style={{ background: "var(--shell-bg)", borderRadius: 4, padding: 12, border: "1px solid var(--shell-border-2)", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            2. 柜子信息 — {validation.containerCount || 1} 个柜
            {validation.containerCount > 1
              ? <span style={{ color: "#f59e0b", marginLeft: 8 }}>Console Box</span>
              : <span style={{ color: "#10b981", marginLeft: 8 }}>FCL</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            <InfoLine label="Booking" value={derived.booking_no} />
            <InfoLine label="Vessel" value={derived.vessel} />
            <InfoLine label="Carrier" value={derived.carrier} />
            <InfoLine label="Agent" value={derived.carrier_agent} />
            <InfoLine label="POL" value={derived.pol} />
            <InfoLine label="POD" value={derived.pod} />
            <InfoLine label="ETD" value={derived.etd} />
            <InfoLine label="Customer" value={derived.customer} />
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="field-label">备注</div>
            <input className="field-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="备注（短出/剩余空间等）" />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// 添加装柜明细 Modal
// ============================================================
function AddItemModal({ onClose, onSave }) {
  const [mode, setMode] = useState("select"); // select | manual
  const [shipments, setShipments] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ supplier: "", po: "", customer_po: "", tuc: "", sku: "", qty: "", weight: "", volume: "", hbl: "", notes: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    supabase.from("shipments").select("id,po,customer_po,tuc,sku,supplier,qty_packages,weight,volume")
      .order("created_at", { ascending: false }).then(({ data }) => setShipments(data || []));
  }, []);

  const filtered = shipments.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [s.po, s.customer_po, s.tuc, s.sku, s.supplier].some(v => (v || "").toLowerCase().includes(q));
  });

  const selectShipment = (s) => {
    setForm({
      supplier: s.supplier || "", po: s.po || "", customer_po: s.customer_po || "",
      tuc: s.tuc || "", sku: s.sku || "", qty: s.qty_packages || "",
      weight: s.weight || "", volume: s.volume || "", hbl: "", notes: "", shipment_id: s.id,
    });
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
    <Modal title="添加装柜明细" onClose={onClose} width={780} footer={mode === "manual" ? (
      <>
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn primary" onClick={submit}>保存</button>
      </>
    ) : null}>
      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderBottom: "1px solid var(--shell-border)" }}>
        {[
          { k: "select", l: "从货件选择" },
          { k: "manual", l: "手动输入" },
        ].map(o => {
          const active = mode === o.k;
          return (
            <button key={o.k} onClick={() => setMode(o.k)} style={{
              padding: "8px 18px", border: "none", background: "transparent",
              fontSize: 13, cursor: "pointer",
              color: active ? "var(--shell-primary)" : "var(--shell-text-2)",
              fontWeight: active ? 600 : 400,
              borderBottom: active ? "2px solid var(--shell-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}>{o.l}</button>
          );
        })}
      </div>

      {mode === "select" && (
        <>
          <input className="field-input" placeholder="搜 PO / Customer PO / 品名 / 供应商..."
                 value={search} onChange={e => setSearch(e.target.value)}
                 style={{ marginBottom: 10 }} />
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--shell-border)", borderRadius: 4 }}>
            <table className="tms-table">
              <thead>
                <tr>
                  <th>PO</th><th>Customer PO</th><th>TUC</th><th>供应商</th><th>QTY</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map(s => (
                  <tr key={s.id} onClick={() => selectShipment(s)} style={{ cursor: "pointer" }}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--shell-primary)" }}>{s.po || "—"}</td>
                    <td style={{ fontFamily: "monospace" }}>{s.customer_po || "—"}</td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.tuc || "—"}</td>
                    <td>{tSupplier(s.supplier) || "—"}</td>
                    <td>{s.qty_packages || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mode === "manual" && (
        <div className="field-row">
          <Field label="供应商"><input className="field-input" value={form.supplier} onChange={e => set("supplier", e.target.value)} /></Field>
          <Field label="PO"><input className="field-input" value={form.po} onChange={e => set("po", e.target.value)} /></Field>
          <Field label="Customer PO"><input className="field-input" value={form.customer_po} onChange={e => set("customer_po", e.target.value)} /></Field>
          <Field label="TUC"><input className="field-input" value={form.tuc} onChange={e => set("tuc", e.target.value)} /></Field>
          <Field label="SKU"><input className="field-input" value={form.sku} onChange={e => set("sku", e.target.value)} /></Field>
          <Field label="QTY"><input className="field-input" type="number" value={form.qty} onChange={e => set("qty", e.target.value)} /></Field>
          <Field label="毛重 (kg)"><input className="field-input" type="number" value={form.weight} onChange={e => set("weight", e.target.value)} /></Field>
          <Field label="CBM"><input className="field-input" type="number" value={form.volume} onChange={e => set("volume", e.target.value)} /></Field>
          <Field label="HBL"><input className="field-input" value={form.hbl} onChange={e => set("hbl", e.target.value)} /></Field>
          <Field label="备注"><input className="field-input" value={form.notes} onChange={e => set("notes", e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// 公用：Modal / Field / InfoLine
// ============================================================
function Modal({ title, children, footer, onClose, width = 560 }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto",
        background: "#fff", borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,.2)",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--shell-border)", fontSize: 14, fontWeight: 600 }}>
          {title}
        </div>
        <div style={{ padding: 16 }}>{children}</div>
        {footer && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--shell-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {footer}
          </div>
        )}
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

function InfoLine({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? "var(--shell-text)" : "var(--shell-text-3)" }}>{value || "—"}</div>
    </div>
  );
}
