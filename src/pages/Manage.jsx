// 系统管理 — 基础数据 CRUD（管道阶段/供应商/客户/海运代理/港口/船公司）
// 重构：用 shell.css 类替换 inline 样式
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";
import { t } from "../lib/i18n.js";

function getTabs() {
  return [
    { k: "users",        l: t("Users & Roles") },
    { k: "assignments",  l: t("Sales Assignments") },
    { k: "pipeline",     l: t("Pipeline Stages") },
    { k: "suppliers",    l: t("Suppliers") },
    { k: "endcustomers", l: t("End Customers") },
    { k: "ports",        l: t("Ports") },
    { k: "carriers",     l: t("Carriers & Agents") },
  ];
}

export function ManagePage({ user }) {
  const [tab, setTab] = useState("users");
  return (
    <>
      <h1 className="page-title">{t("System Settings")}</h1>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--shell-border)", marginBottom: 14, flexWrap: "wrap" }}>
        {getTabs().map(tb => {
          const active = tab === tb.k;
          return (
            <button key={tb.k} onClick={() => setTab(tb.k)} style={{
              padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13,
              color: active ? "var(--shell-primary)" : "var(--shell-text-2)",
              fontWeight: active ? 600 : 400,
              borderBottom: active ? "2px solid var(--shell-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}>{tb.l}</button>
          );
        })}
      </div>

      {tab === "users"        && <UsersHint />}
      {tab === "assignments"  && <AssignmentsTab />}
      {tab === "pipeline"     && <PipelineStagesTab />}
      {tab === "suppliers"    && <SimpleRefTab table="suppliers" label={t("Suppliers")} extraFields={[{ key: "name_cn", label: t("Chinese Name") }]} />}
      {tab === "endcustomers" && <SimpleRefTab table="end_customers" label={t("End Customers")} />}
      {tab === "ports"        && <SimpleRefTab table="ports" label={t("Ports")} extraFields={[{ key: "code", label: t("Code"), maxLength: 10 }]} />}
      {tab === "carriers"     && <CarriersTab />}
    </>
  );
}

// ============================================================
// 用户管理 — 跳转到新的账号管理页
// ============================================================
function UsersHint() {
  return (
    <div className="page-card">
      <div className="card-title">{t("Users & Roles")}</div>
      <p style={{ fontSize: 13, color: "var(--shell-text-2)", margin: "0 0 12px" }}>
        {t("Users management has moved")}
      </p>
      <button className="btn primary" onClick={() => window.location.hash = "#/accounts"}>
        {t("Go to Accounts →")}
      </button>
    </div>
  );
}

// ============================================================
// 销售 ↔ 客户 分配
// ============================================================
function AssignmentsTab() {
  const [salesUsers, setSalesUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState("");

  const load = useCallback(async () => {
    const [{ data: u }, { data: c }, { data: a }] = await Promise.all([
      supabase.from("user_profiles").select("id,name").eq("role", "sales").order("name"),
      supabase.from("customers").select("id,name").order("name"),
      supabase.from("sales_customers").select("*"),
    ]);
    setSalesUsers(u || []); setCustomers(c || []); setAssignments(a || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const myCustomers = new Set(assignments.filter(a => a.user_id === selectedSales).map(a => a.customer_id));

  const toggle = async (cust_id) => {
    if (!selectedSales) return;
    if (myCustomers.has(cust_id)) {
      await supabase.from("sales_customers").delete().eq("user_id", selectedSales).eq("customer_id", cust_id);
    } else {
      await supabase.from("sales_customers").insert({ user_id: selectedSales, customer_id: cust_id });
    }
    load();
  };

  if (loading) return <div className="empty-state empty-text">加载中...</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
      <div className="page-card" style={{ padding: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--shell-text-3)", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 8px" }}>
          销售用户
        </div>
        {salesUsers.length === 0 ? (
          <div className="empty-state empty-text" style={{ padding: "20px 0" }}>暂无销售角色用户</div>
        ) : salesUsers.map(u => (
          <div key={u.id} onClick={() => setSelectedSales(u.id)} style={{
            display: "flex", justifyContent: "space-between",
            padding: "8px 10px", cursor: "pointer", fontSize: 13,
            borderRadius: 4,
            background: selectedSales === u.id ? "var(--shell-primary-50)" : "transparent",
            color: selectedSales === u.id ? "var(--shell-primary)" : "var(--shell-text)",
            fontWeight: selectedSales === u.id ? 500 : 400,
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name || u.id.slice(0, 8)}</span>
            <span style={{ fontSize: 11, color: "var(--shell-text-3)" }}>
              {assignments.filter(a => a.user_id === u.id).length}
            </span>
          </div>
        ))}
      </div>

      <div className="page-card">
        <div className="card-title">
          {selectedSales ? `分配的客户（${myCustomers.size}）` : "选择左侧销售用户"}
        </div>
        {!selectedSales ? (
          <div className="empty-state empty-text">先选一个销售用户</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 6 }}>
            {customers.map(c => {
              const on = myCustomers.has(c.id);
              return (
                <label key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 4,
                  border: on ? "1px solid var(--shell-primary)" : "1px solid var(--shell-border)",
                  background: on ? "var(--shell-primary-50)" : "#fff",
                  cursor: "pointer", fontSize: 13,
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} style={{ cursor: "pointer" }} />
                  <span style={{ fontWeight: on ? 500 : 400, color: on ? "var(--shell-primary)" : "var(--shell-text)" }}>{c.name}</span>
                </label>
              );
            })}
            {customers.length === 0 && <div className="empty-state empty-text">暂无客户</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 管道阶段（CRUD + 排序 + 颜色）
// ============================================================
function PipelineStagesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#1989ff");

  const load = useCallback(async () => {
    const { data } = await supabase.from("pipeline_stages").select("*").order("sort_order");
    setItems(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) : 0;
    const { error } = await supabase.from("pipeline_stages").insert({ name: name.trim(), color, sort_order: maxOrder + 10 });
    if (error) { alert(error.message); return; }
    setName(""); load();
  };
  const remove = async (id) => {
    if (!confirm("确认删除？该阶段下的客户将变为未分配。")) return;
    await supabase.from("pipeline_stages").delete().eq("id", id);
    load();
  };
  const updateField = async (id, field, value) => {
    await supabase.from("pipeline_stages").update({ [field]: value }).eq("id", id);
    load();
  };
  const move = async (id, dir) => {
    const idx = items.findIndex(i => i.id === id);
    const swap = items[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("pipeline_stages").update({ sort_order: swap.sort_order }).eq("id", id),
      supabase.from("pipeline_stages").update({ sort_order: items[idx].sort_order }).eq("id", swap.id),
    ]);
    load();
  };

  if (loading) return <div className="empty-state empty-text">加载中...</div>;

  return (
    <div className="page-card">
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input className="field-input" placeholder="新阶段名称..."
               value={name} onChange={e => setName(e.target.value)}
               onKeyDown={e => e.key === "Enter" && add()}
               style={{ flex: 1 }} />
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
               style={{ width: 40, height: 32, border: "1px solid var(--shell-border)", borderRadius: 4, cursor: "pointer" }} />
        <button className="btn primary" onClick={add}>+ 添加阶段</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, idx) => (
          <div key={it.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", border: "1px solid var(--shell-border)", borderRadius: 4,
          }}>
            <input type="color" value={it.color || "#94a3b8"} onChange={e => updateField(it.id, "color", e.target.value)}
                   style={{ width: 24, height: 24, border: "1px solid var(--shell-border)", borderRadius: 3, cursor: "pointer" }} />
            <input value={it.name}
                   onChange={e => setItems(p => p.map(x => x.id === it.id ? { ...x, name: e.target.value } : x))}
                   onBlur={e => updateField(it.id, "name", e.target.value)}
                   style={{ flex: 1, padding: "5px 8px", border: "none", outline: "none", fontSize: 13 }} />
            <button className="btn" onClick={() => move(it.id, -1)} disabled={idx === 0} style={{ padding: "3px 8px" }}>↑</button>
            <button className="btn" onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} style={{ padding: "3px 8px" }}>↓</button>
            <button onClick={() => remove(it.id)}
                    style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              删除
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="empty-state empty-text">暂无管道阶段</div>}
      </div>
    </div>
  );
}

// ============================================================
// 通用 ref-data tab (suppliers / end_customers / ports)
// ============================================================
function SimpleRefTab({ table, label, extraFields = [] }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", ...Object.fromEntries(extraFields.map(f => [f.key, ""])) });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select("*").order("name");
    setItems(data || []); setLoading(false);
  }, [table]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name.trim() };
    extraFields.forEach(f => { if (form[f.key]?.trim?.()) payload[f.key] = form[f.key].trim(); });
    if (table === "ports" && !payload.code) payload.code = form.name.trim().substring(0, 5).toUpperCase();
    const { error } = await supabase.from(table).insert(payload);
    if (error) { alert(error.message); return; }
    setForm({ name: "", ...Object.fromEntries(extraFields.map(f => [f.key, ""])) });
    load();
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditData({ name: item.name || "", ...Object.fromEntries(extraFields.map(f => [f.key, item[f.key] || ""])) });
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const updates = {};
    const item = items.find(i => i.id === editingId);
    if (editData.name !== item.name) updates.name = editData.name;
    extraFields.forEach(f => { if (editData[f.key] !== (item[f.key] || "")) updates[f.key] = editData[f.key] || null; });
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from(table).update(updates).eq("id", editingId);
      if (error) { alert(error.message); return; }
    }
    setEditingId(null);
    load();
  };
  const remove = async (id) => {
    if (!confirm("确认删除？")) return;
    await supabase.from(table).delete().eq("id", id);
    load();
  };

  if (loading) return <div className="empty-state empty-text">加载中...</div>;

  return (
    <>
      <div className="page-section-bar">
        <input className="field-input" placeholder={`${t("Add")} ${label}...`}
               value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
               onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1, minWidth: 140 }} />
        {extraFields.map(f => (
          <input key={f.key} className="field-input" placeholder={f.label}
                 value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                 onKeyDown={e => e.key === "Enter" && add()}
                 maxLength={f.maxLength}
                 style={{ flex: 1, minWidth: 140 }} />
        ))}
        <button className="btn primary" onClick={add}>{t("+ Add")}</button>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {items.length === 0 ? (
          <div className="empty-state empty-text">{t("No data")}: {label}</div>
        ) : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Name")}</th>
                {extraFields.map(f => <th key={f.key}>{f.label}</th>)}
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td>
                    {editingId === it.id ? (
                      <input className="field-input" value={editData.name}
                             onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} autoFocus />
                    ) : (
                      <span style={{ fontWeight: 500, cursor: "pointer" }} onDoubleClick={() => startEdit(it)}>{it.name}</span>
                    )}
                  </td>
                  {extraFields.map(f => (
                    <td key={f.key}>
                      {editingId === it.id ? (
                        <input className="field-input" value={editData[f.key] || ""}
                               onChange={e => setEditData(p => ({ ...p, [f.key]: e.target.value }))} />
                      ) : (
                        <span style={{ color: "var(--shell-text-2)", cursor: "pointer" }} onDoubleClick={() => startEdit(it)}>
                          {it[f.key] || "—"}
                        </span>
                      )}
                    </td>
                  ))}
                  <td style={{ display: "flex", gap: 6 }}>
                    {editingId === it.id ? (
                      <>
                        <button onClick={saveEdit} style={{ border: "none", background: "none", color: "#16a34a", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ {t("Save")}</button>
                        <button onClick={() => setEditingId(null)} style={{ border: "none", background: "none", color: "var(--shell-text-3)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✕</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(it)} style={{ border: "none", background: "none", color: "var(--shell-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("Edit")}</button>
                        <button onClick={() => remove(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("Delete")}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ============================================================
// 船公司 + 代理
// ============================================================
function CarriersTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingAgents, setEditingAgents] = useState(null);
  const [newAgent, setNewAgent] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("carriers").select("*").order("name");
    setItems(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from("carriers").insert({ name: newName.trim() });
    if (error) { alert(error.message); return; }
    setNewName(""); load();
  };
  const remove = async (id) => {
    if (!confirm("确认删除？")) return;
    await supabase.from("carriers").delete().eq("id", id);
    load();
  };
  const addAgent = async (id, agents) => {
    if (!newAgent.trim()) return;
    await supabase.from("carriers").update({ agents: [...(agents || []), newAgent.trim()] }).eq("id", id);
    setNewAgent(""); load();
  };
  const removeAgent = async (id, agents, a) => {
    await supabase.from("carriers").update({ agents: (agents || []).filter(x => x !== a) }).eq("id", id);
    load();
  };

  if (loading) return <div className="empty-state empty-text">加载中...</div>;

  return (
    <>
      <div className="page-section-bar">
        <input className="field-input" placeholder="添加船公司..."
               value={newName} onChange={e => setNewName(e.target.value)}
               onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <button className="btn primary" onClick={add}>+ 添加船公司</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(it => (
          <div key={it.id} className="page-card" style={{ padding: "10px 12px", margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setEditingAgents(editingAgents === it.id ? null : it.id)}
                        style={{ border: "none", background: "none", color: "var(--shell-primary)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  {editingAgents === it.id ? "收起" : `代理（${(it.agents || []).length}）`}
                </button>
                <button onClick={() => remove(it.id)}
                        style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  删除
                </button>
              </div>
            </div>
            {editingAgents === it.id && (
              <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "2px solid var(--shell-border)" }}>
                {(it.agents || []).map(a => (
                  <div key={a} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 12, color: "var(--shell-text-2)" }}>{it.name}-{a}</span>
                    <button onClick={() => removeAgent(it.id, it.agents, a)}
                            style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input className="field-input" placeholder="代理名称"
                         value={newAgent} onChange={e => setNewAgent(e.target.value)}
                         onKeyDown={e => e.key === "Enter" && addAgent(it.id, it.agents)}
                         style={{ flex: 1 }} />
                  <button className="btn primary" onClick={() => addAgent(it.id, it.agents)}>+ 代理</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="page-card empty-state empty-text">暂无船公司</div>
        )}
      </div>
    </>
  );
}
