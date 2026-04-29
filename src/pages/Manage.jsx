import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase.js";
import { Button, Input, Select, Spinner, EmptyState, Tag, SectionHeader } from "../components/ui.jsx";
import { ROLES } from "../lib/permissions.js";

const TABS = [
  { k: "users",      l: "Users & Roles",     icon: "👥" },
  { k: "assignments",l: "Sales Assignments", icon: "🔗" },
  { k: "pipeline",   l: "Pipeline Stages",   icon: "📊" },
  { k: "suppliers",  l: "Suppliers",         icon: "🏭" },
  { k: "customers",  l: "Customers",         icon: "🤝" },
  { k: "endcustomers",l: "End Customers",    icon: "🎯" },
  { k: "ports",      l: "Ports",             icon: "⚓" },
  { k: "carriers",   l: "Carriers & Agents", icon: "🚢" },
];

export function ManagePage({ user }) {
  const [tab, setTab] = useState("users");
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Manage</h1>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Admin-only configuration & reference data</p>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: "9px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            color: tab === t.k ? "#0ea5e9" : "#64748b", borderBottom: tab === t.k ? "2px solid #0ea5e9" : "2px solid transparent",
            marginBottom: -1, display: "inline-flex", alignItems: "center", gap: 6,
          }}>{t.icon} {t.l}</button>
        ))}
      </div>
      {tab === "users"        && <UsersTab user={user} />}
      {tab === "assignments"  && <AssignmentsTab />}
      {tab === "pipeline"     && <PipelineStagesTab />}
      {tab === "suppliers"    && <SimpleRefTab table="suppliers" label="Suppliers" extraFields={[{ key: "name_cn", label: "中文名称" }]} />}
      {tab === "customers"    && <CustomerRefTab />}
      {tab === "endcustomers" && <SimpleRefTab table="end_customers" label="End Customers" />}
      {tab === "ports"        && <SimpleRefTab table="ports" label="Ports" extraFields={[{ key: "code", label: "Code", maxLength: 10 }]} />}
      {tab === "carriers"     && <CarriersTab />}
    </div>
  );
}

// =========================================================================
// Users & Roles
// =========================================================================
function UsersTab({ user }) {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: u }, { data: c }] = await Promise.all([
      supabase.from("user_profiles_view").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name").order("name"),
    ]);
    setUsers(u || []); setCustomers(c || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateRole = async (id, role) => {
    const { error } = await supabase.from("user_profiles").update({ role }).eq("id", id);
    if (error) { alert(error.message); return; }
    load();
  };
  const updateLink = async (id, customer_id) => {
    const { error } = await supabase.from("user_profiles").update({ customer_id: customer_id || null }).eq("id", id);
    if (error) { alert(error.message); return; }
    load();
  };
  const toggleActive = async (id, active) => {
    await supabase.from("user_profiles").update({ active: !active }).eq("id", id); load();
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #f1f5f9", background: "#fffbeb", fontSize: 12, color: "#92400e" }}>
        ⓘ Users sign up via Supabase Auth. New users default to <strong>operator</strong>; admins promote/demote here.
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ background: "#f8fafc" }}>
          {["Email", "Role", "Linked Customer", "Active", "Created"].map((h) => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {users.map((u, i) => (
            <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #f1f5f9" : "none", opacity: u.active === false ? 0.5 : 1 }}>
              <td style={{ padding: "8px 12px" }}>{u.email}{u.id === user.id && <span style={{ marginLeft: 6 }}><Tag color="#0ea5e9">you</Tag></span>}</td>
              <td style={{ padding: "8px 12px" }}>
                <select value={u.role} onChange={e => updateRole(u.id, e.target.value)} disabled={u.id === user.id}
                  style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600 }}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </td>
              <td style={{ padding: "8px 12px" }}>
                {u.role === "customer"
                  ? <select value={u.customer_id || ""} onChange={e => updateLink(u.id, e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 5, border: "1px solid #e2e8f0", fontSize: 12 }}>
                      <option value="">— Select customer —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  : <span style={{ color: "#cbd5e1", fontSize: 11 }}>n/a</span>}
              </td>
              <td style={{ padding: "8px 12px" }}>
                <button onClick={() => toggleActive(u.id, u.active !== false)} disabled={u.id === user.id} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: u.active !== false ? "#10b981" : "#94a3b8" }}>
                  {u.active !== false ? "● Active" : "○ Disabled"}
                </button>
              </td>
              <td style={{ padding: "8px 12px", color: "#94a3b8", fontFamily: "'DM Mono',monospace", fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>No users yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// =========================================================================
// Sales <> Customer Assignments (m:n)
// =========================================================================
function AssignmentsTab() {
  const [salesUsers, setSalesUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState("");

  const load = useCallback(async () => {
    const [{ data: u }, { data: c }, { data: a }] = await Promise.all([
      supabase.from("user_profiles_view").select("*").eq("role", "sales").order("email"),
      supabase.from("customers").select("id,name").order("name"),
      supabase.from("sales_customers").select("*"),
    ]);
    setSalesUsers(u || []); setCustomers(c || []); setAssignments(a || []); setLoading(false);
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

  if (loading) return <Spinner />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14 }}>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Sales Users</div>
        {salesUsers.length === 0 && <EmptyState>No users with role 'sales' yet.</EmptyState>}
        {salesUsers.map((u) => (
          <button key={u.id} onClick={() => setSelectedSales(u.id)} style={{
            display: "flex", justifyContent: "space-between", width: "100%", padding: "9px 10px",
            border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 4, fontSize: 12.5, textAlign: "left",
            background: selectedSales === u.id ? "#f0f9ff" : "transparent",
            color: selectedSales === u.id ? "#0369a1" : "#475569",
            fontWeight: selectedSales === u.id ? 600 : 500,
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{assignments.filter(a => a.user_id === u.id).length}</span>
          </button>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
        <SectionHeader icon="🔗" title={selectedSales ? `Assigned customers (${myCustomers.size})` : "Select a sales user"} accent="#0ea5e9" />
        {!selectedSales ? <EmptyState>Pick a sales user on the left.</EmptyState> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 6 }}>
            {customers.map((c) => {
              const on = myCustomers.has(c.id);
              return (
                <label key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6,
                  border: on ? "2px solid #0ea5e9" : "1px solid #e2e8f0",
                  background: on ? "#f0f9ff" : "#fff", cursor: "pointer", fontSize: 12.5,
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} style={{ cursor: "pointer" }} />
                  <span style={{ fontWeight: on ? 600 : 500, color: on ? "#0369a1" : "#475569" }}>{c.name}</span>
                </label>
              );
            })}
            {customers.length === 0 && <EmptyState>No customers in system.</EmptyState>}
          </div>}
      </div>
    </div>
  );
}

// =========================================================================
// Pipeline Stages (CRUD + reorder + color)
// =========================================================================
function PipelineStagesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");

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
  const remove = async (id) => { if (!confirm("Delete? Customers in this stage will become unassigned.")) return; await supabase.from("pipeline_stages").delete().eq("id", id); load(); };
  const updateField = async (id, field, value) => { await supabase.from("pipeline_stages").update({ [field]: value }).eq("id", id); load(); };

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

  if (loading) return <Spinner />;

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Input placeholder="New stage name..." value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 44, height: 36, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }} />
        <Button onClick={add}>+ Add Stage</Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, idx) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 7 }}>
            <input type="color" value={it.color || "#94a3b8"} onChange={e => updateField(it.id, "color", e.target.value)} style={{ width: 26, height: 26, border: "1px solid #e2e8f0", borderRadius: 4, cursor: "pointer" }} />
            <input value={it.name} onChange={e => setItems(p => p.map(x => x.id === it.id ? { ...x, name: e.target.value } : x))}
              onBlur={(e) => updateField(it.id, "name", e.target.value)}
              style={{ flex: 1, padding: "5px 8px", border: "none", outline: "none", fontSize: 13, fontWeight: 600 }} />
            <button onClick={() => move(it.id, -1)} disabled={idx === 0} style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 4, padding: "3px 8px", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
            <button onClick={() => move(it.id, 1)} disabled={idx === items.length - 1} style={{ border: "1px solid #e2e8f0", background: "#fff", borderRadius: 4, padding: "3px 8px", cursor: idx === items.length - 1 ? "not-allowed" : "pointer", opacity: idx === items.length - 1 ? 0.4 : 1 }}>↓</button>
            <button onClick={() => remove(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Del</button>
          </div>
        ))}
        {items.length === 0 && <EmptyState>No pipeline stages. Add one to get started.</EmptyState>}
      </div>
    </div>
  );
}

// =========================================================================
// Simple ref-data tab (suppliers / end_customers / ports)
// =========================================================================
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
    setForm({ name: "", ...Object.fromEntries(extraFields.map(f => [f.key, ""])) }); load();
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

  const cancelEdit = () => { setEditingId(null); };

  const remove = async (id) => { if (!confirm("Delete?")) return; await supabase.from(table).delete().eq("id", id); load(); };

  if (loading) return <Spinner />;

  const inputStyle = { width: "100%", padding: "5px 8px", border: "1px solid #bae6fd", borderRadius: 5, fontSize: 12, outline: "none", background: "#f0f9ff", boxSizing: "border-box" };

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Input placeholder={`Add ${label.toLowerCase()}...`} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1, minWidth: 140 }} />
        {extraFields.map(f => (
          <Input key={f.key} placeholder={f.label} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1, minWidth: 140 }} maxLength={f.maxLength} />
        ))}
        <Button onClick={add}>+ Add</Button>
      </div>
      {items.length === 0 ? <EmptyState>No {label.toLowerCase()} yet.</EmptyState> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>Name</th>
            {extraFields.map(f => <th key={f.key} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{f.label}</th>)}
            <th style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", width: 100 }}></th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} style={{ borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <td style={{ padding: "6px 12px" }}>
                  {editingId === it.id
                    ? <input style={inputStyle} value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} autoFocus />
                    : <span style={{ fontWeight: 500, cursor: "pointer" }} onDoubleClick={() => startEdit(it)}>{it.name}</span>
                  }
                </td>
                {extraFields.map(f => (
                  <td key={f.key} style={{ padding: "6px 12px" }}>
                    {editingId === it.id
                      ? <input style={inputStyle} value={editData[f.key] || ""} onChange={e => setEditData(p => ({ ...p, [f.key]: e.target.value }))} />
                      : <span style={{ color: "#475569", cursor: "pointer" }} onDoubleClick={() => startEdit(it)}>{it[f.key] || "—"}</span>
                    }
                  </td>
                ))}
                <td style={{ padding: "6px 12px", display: "flex", gap: 6 }}>
                  {editingId === it.id ? (
                    <>
                      <button onClick={saveEdit} style={{ border: "none", background: "none", color: "#16a34a", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>✓</button>
                      <button onClick={cancelEdit} style={{ border: "none", background: "none", color: "#94a3b8", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(it)} style={{ border: "none", background: "none", color: "#0ea5e9", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => remove(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Del</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
    </div>
  );
}

// =========================================================================
// Customer ref tab — full record management (delegates to list-form modal)
// =========================================================================
function CustomerRefTab() {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 16 }}>
      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
        Use the <strong>Customers</strong> page (sidebar) to fully manage customers — including pipeline stage, contacts, follow-ups, quotes and notes.
      </p>
    </div>
  );
}

// =========================================================================
// Carriers + Agents
// =========================================================================
function CarriersTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingAgents, setEditingAgents] = useState(null);
  const [newAgent, setNewAgent] = useState("");

  const load = useCallback(async () => { const { data } = await supabase.from("carriers").select("*").order("name"); setItems(data || []); setLoading(false); }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => { if (!newName.trim()) return; const { error } = await supabase.from("carriers").insert({ name: newName.trim() }); if (error) { alert(error.message); return; } setNewName(""); load(); };
  const remove = async (id) => { if (!confirm("Delete?")) return; await supabase.from("carriers").delete().eq("id", id); load(); };
  const addAgent = async (id, agents) => { if (!newAgent.trim()) return; await supabase.from("carriers").update({ agents: [...(agents || []), newAgent.trim()] }).eq("id", id); setNewAgent(""); load(); };
  const removeAgent = async (id, agents, a) => { await supabase.from("carriers").update({ agents: (agents || []).filter(x => x !== a) }).eq("id", id); load(); };

  if (loading) return <Spinner />;

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", padding: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Input placeholder="Add carrier..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1 }} />
        <Button onClick={add}>+ Add Carrier</Button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => (
          <div key={it.id} style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditingAgents(editingAgents === it.id ? null : it.id)} style={{ border: "none", background: "none", color: "#0ea5e9", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  {editingAgents === it.id ? "Hide" : `Agents (${(it.agents || []).length})`}
                </button>
                <button onClick={() => remove(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Del</button>
              </div>
            </div>
            {editingAgents === it.id && (
              <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "2px solid #e2e8f0" }}>
                {(it.agents || []).map((a) => (
                  <div key={a} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>{it.name}-{a}</span>
                    <button onClick={() => removeAgent(it.id, it.agents, a)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <Input placeholder="Agent name" value={newAgent} onChange={e => setNewAgent(e.target.value)} onKeyDown={e => e.key === "Enter" && addAgent(it.id, it.agents)} style={{ flex: 1 }} />
                  <Button small onClick={() => addAgent(it.id, it.agents)} style={{ background: "#10b981" }}>+ Agent</Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <EmptyState>No carriers yet.</EmptyState>}
      </div>
    </div>
  );
}
