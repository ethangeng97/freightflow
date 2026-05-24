// Knowledge page — entity browser with notes
// Refactored to use new shell.css primitives for visual consistency.
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { NotesPanel } from "../components/NotesPanel.jsx";
import { t, tSupplier } from "../lib/i18n.js";

export function KnowledgePage({ user, defaultTab, supplierOnly }) {
  const [entityType, setEntityType] = useState(defaultTab || "customer");
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [allNotes, setAllNotes] = useState([]);
  const [newName, setNewName] = useState("");

  const tableMap   = { customer: "customers", supplier: "suppliers", shipment: "shipments", endcustomer: "end_customers" };
  const labelField = { customer: "name", supplier: "name", shipment: "po", endcustomer: "name" };
  const descField  = { customer: "contact_name", supplier: "name_cn", shipment: "tuc", endcustomer: null };

  const addEndCustomer = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("end_customers").insert({ name });
    if (error) { alert(error.message); return; }
    setNewName(""); loadEntities();
  };

  const loadEntities = useCallback(async () => {
    setLoading(true);
    const tb = tableMap[entityType];
    const cols = entityType === "shipment" ? "id,po,tuc,customer" : "*";
    const { data } = await supabase.from(tb).select(cols)
      .order(entityType === "shipment" ? "created_at" : "name", { ascending: entityType !== "shipment" });
    setEntities(data || []); setLoading(false);
    const { data: notes } = await supabase.from("notes").select("entity_id,id,pinned").eq("entity_type", entityType);
    setAllNotes(notes || []);
  }, [entityType]);

  useEffect(() => { loadEntities(); setSelected(null); }, [loadEntities]);

  const noteCounts = useMemo(() => {
    const m = {};
    allNotes.forEach((n) => { m[n.entity_id] = (m[n.entity_id] || 0) + 1; });
    return m;
  }, [allNotes]);

  const filtered = useMemo(() => {
    if (!search) return entities;
    const s = search.toLowerCase();
    return entities.filter(e =>
      String(e[labelField[entityType]] || "").toLowerCase().includes(s) ||
      String(e[descField[entityType]] || "").toLowerCase().includes(s)
    );
  }, [entities, search, entityType]);

  const tabs = supplierOnly ? [] : [
    { k: "customer",    l: t("Customers") },
    { k: "supplier",    l: t("Suppliers") },
    { k: "endcustomer", l: t("End Customers") },
    { k: "shipment",    l: t("Shipments") },
  ];

  return (
    <>
      <h1 className="page-title">{t("Knowledge")}</h1>

      {/* 实体类型 tabs（更像真 tab，下划线高亮） */}
      {!supplierOnly && (
        <div style={{
          display: "flex", gap: 0, marginBottom: 12,
          borderBottom: "1px solid var(--shell-border)",
        }}>
          {tabs.map(tb => {
            const active = entityType === tb.k;
            return (
              <button
                key={tb.k}
                onClick={() => setEntityType(tb.k)}
                style={{
                  padding: "8px 18px", border: "none", background: "transparent",
                  fontSize: 13, cursor: "pointer",
                  color: active ? "var(--shell-primary)" : "var(--shell-text-2)",
                  fontWeight: active ? 600 : 400,
                  borderBottom: active ? "2px solid var(--shell-primary)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {tb.l}
              </button>
            );
          })}
        </div>
      )}

      {/* 搜索/操作工具栏 */}
      <div className="page-section-bar">
        <input
          className="field-input"
          placeholder={t("Search...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
        {entityType === "endcustomer" && !supplierOnly && (
          <>
            <input
              className="field-input"
              placeholder={t("New end-customer name")}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addEndCustomer(); }}
              style={{ width: 220 }}
            />
            <button className="btn primary" onClick={addEndCustomer} disabled={!newName.trim()}>
              + {t("Add")}
            </button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>
          {filtered.length} {t("items")}
        </span>
      </div>

      {/* 左右分栏 */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
        <div className="page-card" style={{ padding: 0, maxHeight: "70vh", overflowY: "auto" }}>
          {loading ? (
            <div className="empty-state empty-text" style={{ padding: "30px 0" }}>{t("Loading...")}</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state empty-text" style={{ padding: "30px 0" }}>{t("No items found")}</div>
          ) : filtered.map((e, idx) => {
            const id = e.id;
            const count = noteCounts[id] || 0;
            const rawLabel = e[labelField[entityType]] || "(no name)";
            const label = entityType === "supplier" ? (tSupplier(rawLabel) || rawLabel) : rawLabel;
            const desc = entityType === "supplier" ? (e.name_cn ? e.name : null) : e[descField[entityType]];
            const isSel = selected?.id === id;
            return (
              <div
                key={id}
                onClick={() => setSelected({ id, label, desc })}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer", fontSize: 13,
                  background: isSel ? "var(--shell-primary-50)" : "transparent",
                  color: isSel ? "var(--shell-primary)" : "var(--shell-text)",
                  fontWeight: isSel ? 500 : 400,
                  borderLeft: isSel ? "3px solid var(--shell-primary)" : "3px solid transparent",
                  borderBottom: idx < filtered.length - 1 ? "1px solid var(--shell-border-2)" : "none",
                }}
                onMouseEnter={e2 => { if (!isSel) e2.currentTarget.style.background = "var(--shell-bg)"; }}
                onMouseLeave={e2 => { if (!isSel) e2.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  {count > 0 && <span className="badge info" style={{ flexShrink: 0 }}>{count}</span>}
                </div>
                {desc && (
                  <div style={{
                    fontSize: 11, color: "var(--shell-text-3)", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{desc}</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="page-card">
          {!selected ? (
            <div className="empty-state empty-text" style={{ padding: "60px 0" }}>
              {supplierOnly ? t("Select a customer to view details") : t("Select an item to view notes")}
            </div>
          ) : (
            <>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                paddingBottom: 10, marginBottom: 14, borderBottom: "1px solid var(--shell-border-2)",
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginBottom: 2 }}>
                    {tabs.find(x => x.k === entityType)?.l || entityType}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--shell-text)" }}>
                    {selected.label}
                  </div>
                </div>
              </div>
              <NotesPanel entityType={entityType} entityId={selected.id} user={user} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
