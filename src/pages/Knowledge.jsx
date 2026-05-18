import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { Input, Spinner, EmptyState, Tag, SectionHeader } from "../components/ui.jsx";
import { NotesPanel } from "../components/NotesPanel.jsx";
import { t, tSupplier } from "../lib/i18n.js";

export function KnowledgePage({ user, defaultTab, supplierOnly }) {
  const [entityType, setEntityType] = useState(defaultTab || "customer");
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [allNotes, setAllNotes] = useState([]);

  const tableMap = { customer: "customers", supplier: "suppliers", shipment: "shipments", endcustomer: "end_customers" };
  const labelField = { customer: "name", supplier: "name", shipment: "po", endcustomer: "name" };
  const descField  = { customer: "contact_name", supplier: "name_cn", shipment: "tuc", endcustomer: null };

  const [newName, setNewName] = useState("");
  const addEndCustomer = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("end_customers").insert({ name });
    if (error) { alert(error.message); return; }
    setNewName("");
    loadEntities();
  };

  const loadEntities = useCallback(async () => {
    setLoading(true);
    const tb = tableMap[entityType];
    const cols = entityType === "shipment" ? "id,po,tuc,customer" : "*";
    const { data } = await supabase.from(tb).select(cols).order(entityType === "shipment" ? "created_at" : "name", { ascending: entityType !== "shipment" });
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

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>{supplierOnly ? t("Suppliers") : t("Knowledge")}</h1>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>{supplierOnly ? t("委托方列表") : t("Notes attached to customers, suppliers, and shipments")}</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        {!supplierOnly && (
          <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 7, overflow: "hidden" }}>
            {[{ k: "customer", l: t("Customers") }, { k: "supplier", l: t("Suppliers") }, { k: "endcustomer", l: t("End Customers") }, { k: "shipment", l: t("Shipments") }].map((tb) => (
              <button key={tb.k} onClick={() => setEntityType(tb.k)} style={{
                padding: "7px 16px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: entityType === tb.k ? "#0ea5e9" : "#fff", color: entityType === tb.k ? "#fff" : "#64748b",
              }}>{tb.l}</button>
            ))}
          </div>
        )}
        <Input placeholder={t("Search...")} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        {entityType === "endcustomer" && !supplierOnly && (
          <>
            <Input placeholder={t("新 End Customer 名称")} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addEndCustomer(); }} style={{ width: 220 }} />
            <button onClick={addEndCustomer} disabled={!newName.trim()} style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: newName.trim() ? "#0ea5e9" : "#cbd5e1", color: "#fff", fontSize: 12, fontWeight: 600, cursor: newName.trim() ? "pointer" : "not-allowed" }}>+ {t("新增")}</button>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 10, maxHeight: "70vh", overflowY: "auto" }}>
          {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState>{t("No items found")}</EmptyState> :
            filtered.map((e) => {
              const id = e.id;
              const count = noteCounts[id] || 0;
              const rawLabel = e[labelField[entityType]] || "(no name)";
              const label = entityType === "supplier" ? (tSupplier(rawLabel) || rawLabel) : rawLabel;
              const desc = entityType === "supplier" ? (e.name_cn ? e.name : null) : e[descField[entityType]];
              const isSel = selected?.id === id;
              return (
                <button key={id} onClick={() => setSelected({ id, label, desc })} style={{
                  width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 6, cursor: "pointer",
                  marginBottom: 4, fontSize: 12.5, background: isSel ? "#f0f9ff" : "transparent",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: isSel ? 600 : 500, color: isSel ? "#0369a1" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    {count > 0 && <Tag color="#0ea5e9">{count}</Tag>}
                  </div>
                  {desc && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>}
                </button>
              );
            })}
        </div>
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
          {!selected ? <EmptyState>{supplierOnly ? t("选择一个委托方查看详情") : t("Select an item to view notes")}</EmptyState> : (
            <>
              <SectionHeader icon="📝" title={selected.label} accent="#0ea5e9" />
              <NotesPanel entityType={entityType} entityId={selected.id} user={user} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
