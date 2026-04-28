import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { Button, Input, Select, Spinner, EmptyState, Tag, Modal, SectionHeader, Badge } from "../components/ui.jsx";
import { NotesPanel } from "../components/NotesPanel.jsx";
import { isCustomer } from "../lib/permissions.js";

// =========================================================================
// Customers Page (entry)
// =========================================================================
export function CustomersPage({ user }) {
  const [view, setView] = useState("list"); // list | pipeline
  const [selectedId, setSelectedId] = useState(null);
  const [stages, setStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: cs }, { data: ss }] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("pipeline_stages").select("*").order("sort_order"),
    ]);
    setCustomers(cs || []);
    setStages(ss || []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const selected = customers.find((c) => c.id === selectedId);

  if (selected) {
    return <CustomerDetail customer={selected} stages={stages} user={user}
      onBack={() => setSelectedId(null)} onSaved={reload} />;
  }

  const filtered = customers.filter((c) =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Customers</h1>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "3px 0 0" }}>{customers.length} customers · {stages.length} pipeline stages</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 7, overflow: "hidden" }}>
            {["list", "pipeline"].map((v) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "7px 14px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: view === v ? "#0ea5e9" : "#fff", color: view === v ? "#fff" : "#64748b",
              }}>{v === "list" ? "List" : "Pipeline"}</button>
            ))}
          </div>
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          {!isCustomer(user) && <Button onClick={() => setShowNew(true)}>+ New Customer</Button>}
        </div>
      </div>
      {loading ? <Spinner /> : view === "list"
        ? <CustomerList customers={filtered} stages={stages} onOpen={setSelectedId} />
        : <CustomerKanban customers={filtered} stages={stages} onOpen={setSelectedId} onMoved={reload} />}
      {showNew && <NewCustomerModal stages={stages} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
    </div>
  );
}

// =========================================================================
// List view
// =========================================================================
function CustomerList({ customers, stages, onOpen }) {
  const stageById = Object.fromEntries(stages.map(s => [s.id, s]));
  if (customers.length === 0) return <EmptyState>No customers yet.</EmptyState>;
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ background: "#f8fafc" }}>
          {["Name", "Stage", "Contact", "Email", "Phone", "Country", "Tags"].map(h => (
            <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {customers.map((c, i) => {
            const stage = stageById[c.pipeline_stage_id];
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)} style={{ cursor: "pointer", borderBottom: i < customers.length - 1 ? "1px solid #f1f5f9" : "none" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>{c.name}</td>
                <td style={{ padding: "10px 12px" }}>{stage ? <Tag color={stage.color}>{stage.name}</Tag> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                <td style={{ padding: "10px 12px" }}>{c.contact_name || "—"}</td>
                <td style={{ padding: "10px 12px", color: "#475569" }}>{c.contact_email || "—"}</td>
                <td style={{ padding: "10px 12px", color: "#475569" }}>{c.contact_phone || "—"}</td>
                <td style={{ padding: "10px 12px", color: "#475569" }}>{c.country || "—"}</td>
                <td style={{ padding: "10px 12px" }}>
                  {(c.tags || []).slice(0, 3).map(t => <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f1f5f9", color: "#475569", marginRight: 4 }}>{t}</span>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =========================================================================
// Kanban / Pipeline view  (drag a card between stages)
// =========================================================================
function CustomerKanban({ customers, stages, onOpen, onMoved }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const grouped = useMemo(() => {
    const g = { __none: [] };
    stages.forEach((s) => g[s.id] = []);
    customers.forEach((c) => {
      if (c.pipeline_stage_id && g[c.pipeline_stage_id]) g[c.pipeline_stage_id].push(c);
      else g.__none.push(c);
    });
    return g;
  }, [customers, stages]);

  const dropTo = async (stageId) => {
    if (!dragId) return;
    const targetId = stageId === "__none" ? null : stageId;
    const cur = customers.find(c => c.id === dragId);
    if (!cur || cur.pipeline_stage_id === targetId) { setDragId(null); setOverStage(null); return; }
    const { error } = await supabase.from("customers").update({ pipeline_stage_id: targetId }).eq("id", dragId);
    if (error) alert(error.message);
    setDragId(null); setOverStage(null);
    onMoved();
  };

  const cols = [...stages, { id: "__none", name: "Unassigned", color: "#94a3b8" }];

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      {cols.map((s) => {
        const cards = grouped[s.id] || [];
        const isOver = overStage === s.id;
        return (
          <div key={s.id}
            onDragOver={(e) => { e.preventDefault(); setOverStage(s.id); }}
            onDragLeave={() => setOverStage(null)}
            onDrop={() => dropTo(s.id)}
            style={{
              minWidth: 260, flex: "0 0 260px", background: isOver ? "#e0f2fe" : "#f8fafc",
              borderRadius: 10, border: `2px ${isOver ? "solid #0ea5e9" : "dashed transparent"}`, padding: 10,
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {s.name}
              </span>
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{cards.length}</span>
            </div>
            {cards.map((c) => (
              <div key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragEnd={() => { setDragId(null); setOverStage(null); }}
                onClick={() => onOpen(c.id)}
                style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 8,
                  cursor: dragId === c.id ? "grabbing" : "grab", opacity: dragId === c.id ? 0.5 : 1,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0f172a", marginBottom: 3 }}>{c.name}</div>
                {c.contact_name && <div style={{ fontSize: 11, color: "#64748b" }}>{c.contact_name}</div>}
                {c.country && <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 4 }}>📍 {c.country}</div>}
              </div>
            ))}
            {cards.length === 0 && <div style={{ fontSize: 11, color: "#cbd5e1", textAlign: "center", padding: "20px 0" }}>Drop here</div>}
          </div>
        );
      })}
    </div>
  );
}

// =========================================================================
// New Customer Modal
// =========================================================================
function NewCustomerModal({ stages, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", contact_name: "", contact_email: "", contact_phone: "", country: "", source: "", pipeline_stage_id: stages[0]?.id || "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { alert("Name required"); return; }
    setSaving(true);
    const payload = { ...form, pipeline_stage_id: form.pipeline_stage_id || null };
    const { error } = await supabase.from("customers").insert(payload);
    setSaving(false);
    if (error) { alert(error.message); return; }
    onSaved();
  };

  return (
    <Modal onClose={onClose} title="New Customer" width={520}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <Select label="Pipeline Stage" value={form.pipeline_stage_id} onChange={e => setForm(p => ({ ...p, pipeline_stage_id: e.target.value }))}
          options={[{ value: "", label: "(none)" }, ...stages.map(s => ({ value: s.id, label: s.name }))]} />
        <Input label="Contact Name" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
        <Input label="Email" type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
        <Input label="Phone" value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
        <Input label="Country" value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
        <Input label="Source" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="referral / web / show..." />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Create"}</Button>
      </div>
    </Modal>
  );
}

// =========================================================================
// Customer Detail
// =========================================================================
function CustomerDetail({ customer, stages, user, onBack, onSaved }) {
  const [tab, setTab] = useState("overview");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(customer);

  const stage = stages.find(s => s.id === form.pipeline_stage_id);
  const canEdit = !isCustomer(user);

  const save = async () => {
    const payload = {
      name: form.name, contact_name: form.contact_name, contact_email: form.contact_email,
      contact_phone: form.contact_phone, country: form.country, source: form.source,
      pipeline_stage_id: form.pipeline_stage_id || null, website: form.website,
    };
    const { error } = await supabase.from("customers").update(payload).eq("id", customer.id);
    if (error) { alert(error.message); return; }
    setEdit(false); onSaved();
  };

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0", border: "none", background: "none", color: "#0ea5e9", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>← Back to customers</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{form.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            {stage && <Tag color={stage.color}>{stage.name}</Tag>}
            {form.country && <span style={{ fontSize: 12, color: "#64748b" }}>📍 {form.country}</span>}
          </div>
        </div>
        {canEdit && (edit
          ? <div style={{ display: "flex", gap: 8 }}><Button variant="secondary" onClick={() => { setEdit(false); setForm(customer); }}>Cancel</Button><Button onClick={save}>Save</Button></div>
          : <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>)}
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 16 }}>
        {[{ k: "overview", l: "Overview" }, { k: "followups", l: "Follow-ups" }, { k: "quotes", l: "Quotes" }, { k: "notes", l: "Notes" }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
            color: tab === t.k ? "#0ea5e9" : "#64748b", borderBottom: tab === t.k ? "2px solid #0ea5e9" : "2px solid transparent",
            marginBottom: -1,
          }}>{t.l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
          <SectionHeader icon="👤" title="Customer Info" accent="#0ea5e9" />
          {edit ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Name" value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              <Select label="Pipeline Stage" value={form.pipeline_stage_id || ""} onChange={e => setForm(p => ({ ...p, pipeline_stage_id: e.target.value }))}
                options={[{ value: "", label: "(none)" }, ...stages.map(s => ({ value: s.id, label: s.name }))]} />
              <Input label="Contact Name" value={form.contact_name || ""} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
              <Input label="Email" value={form.contact_email || ""} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
              <Input label="Phone" value={form.contact_phone || ""} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
              <Input label="Country" value={form.country || ""} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
              <Input label="Website" value={form.website || ""} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
              <Input label="Source" value={form.source || ""} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <InfoLine label="Contact Name" value={customer.contact_name} />
              <InfoLine label="Email" value={customer.contact_email} />
              <InfoLine label="Phone" value={customer.contact_phone} />
              <InfoLine label="Country" value={customer.country} />
              <InfoLine label="Website" value={customer.website} />
              <InfoLine label="Source" value={customer.source} />
            </div>
          )}
        </div>
      )}
      {tab === "followups" && <FollowupsTab customer={customer} user={user} />}
      {tab === "quotes"    && <QuotesTab customer={customer} user={user} canEdit={canEdit} />}
      {tab === "notes"     && <NotesPanel entityType="customer" entityId={customer.id} user={user} />}
    </div>
  );
}

const InfoLine = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 500, color: value ? "#1e293b" : "#cbd5e1" }}>{value || "—"}</div>
  </div>
);

// =========================================================================
// Follow-ups Tab
// =========================================================================
function FollowupsTab({ customer, user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: "note", subject: "", body: "", next_action: "", next_date: "" });

  const load = useCallback(async () => {
    const { data } = await supabase.from("customer_followups").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setItems(data || []); setLoading(false);
  }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.body && !form.subject) { alert("Subject or body required"); return; }
    const payload = {
      customer_id: customer.id, user_id: user.id, user_email: user.email,
      type: form.type, subject: form.subject || null, body: form.body || null,
      next_action: form.next_action || null,
      next_date: form.next_date || null,
    };
    const { error } = await supabase.from("customer_followups").insert(payload);
    if (error) { alert(error.message); return; }
    setForm({ type: "note", subject: "", body: "", next_action: "", next_date: "" });
    load();
  };

  const remove = async (id) => { if (!confirm("Delete?")) return; await supabase.from("customer_followups").delete().eq("id", id); load(); };

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0", marginBottom: 14 }}>
        <SectionHeader icon="📞" title="Add Follow-up" accent="#10b981" />
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Select label="Type" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} options={["note", "call", "email", "meeting"]} />
          <Input label="Subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
          <Input label="Next date" type="date" value={form.next_date} onChange={e => setForm(p => ({ ...p, next_date: e.target.value }))} />
        </div>
        <textarea rows={3} placeholder="Details..." value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12.5, outline: "none", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit", resize: "vertical" }} />
        <Input label="Next Action" value={form.next_action} onChange={e => setForm(p => ({ ...p, next_action: e.target.value }))} placeholder="e.g. Send pricing for FCL Shanghai → LA" />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}><Button onClick={add}>+ Add</Button></div>
      </div>

      {loading ? <Spinner /> : items.length === 0 ? <EmptyState>No follow-ups yet.</EmptyState> :
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => (
            <div key={it.id} style={{ background: "#fff", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag color={typeColor(it.type)}>{it.type}</Tag>
                  {it.subject && <span style={{ fontSize: 13, fontWeight: 600 }}>{it.subject}</span>}
                </div>
                <button onClick={() => remove(it.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Del</button>
              </div>
              {it.body && <div style={{ fontSize: 12.5, color: "#475569", whiteSpace: "pre-wrap", marginBottom: 6 }}>{it.body}</div>}
              {(it.next_action || it.next_date) && (
                <div style={{ fontSize: 11.5, color: "#0ea5e9", padding: "5px 8px", background: "#f0f9ff", borderRadius: 5, display: "inline-block", marginBottom: 6 }}>
                  ⏭ {it.next_action || ""}{it.next_date ? ` · ${it.next_date}` : ""}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "#94a3b8", fontFamily: "'DM Mono',monospace" }}>{it.user_email} · {new Date(it.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>}
    </div>
  );
}

const typeColor = (t) => ({ note: "#64748b", call: "#10b981", email: "#0ea5e9", meeting: "#8b5cf6" }[t] || "#64748b");

// =========================================================================
// Quotes Tab
// =========================================================================
function QuotesTab({ customer, user, canEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("quotes").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setItems(data || []); setLoading(false);
  }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  const newQuote = async () => {
    const { data, error } = await supabase.from("quotes").insert({
      customer_id: customer.id, status: "draft", created_by: user.id, currency: "USD",
      quote_no: `Q${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    });
    if (error) { alert(error.message); return; }
    load();
    setEditingId(data?.[0]?.id);
  };

  const remove = async (id) => { if (!confirm("Delete quote?")) return; await supabase.from("quotes").delete().eq("id", id); load(); };

  if (editingId) {
    return <QuoteEditor quoteId={editingId} customer={customer} user={user} onClose={() => { setEditingId(null); load(); }} />;
  }

  return (
    <div>
      {canEdit && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><Button onClick={newQuote}>+ New Quote</Button></div>}
      {loading ? <Spinner /> : items.length === 0 ? <EmptyState>No quotes yet.</EmptyState> :
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: "#f8fafc" }}>
              {["Quote#", "Status", "POL → POD", "Carrier", "Total", "Valid Until", "Created", ""].map((h) => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map((q, i) => (
                <tr key={q.id} style={{ borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none", cursor: "pointer" }}
                  onClick={() => setEditingId(q.id)}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace", fontWeight: 600, color: "#0ea5e9" }}>{q.quote_no || "—"}</td>
                  <td style={{ padding: "10px 12px" }}><Badge value={q.status} small /></td>
                  <td style={{ padding: "10px 12px" }}>{q.pol && q.pod ? `${q.pol} → ${q.pod}` : "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{q.carrier || "—"}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{q.total ? `${q.currency} ${Number(q.total).toLocaleString()}` : "—"}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11.5 }}>{q.valid_until || "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11.5, color: "#94a3b8" }}>{new Date(q.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                    {canEdit && <button onClick={() => remove(q.id)} style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Del</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
    </div>
  );
}

// =========================================================================
// Quote Editor (line items + totals)
// =========================================================================
function QuoteEditor({ quoteId, customer, user, onClose }) {
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: q }, { data: it }] = await Promise.all([
      supabase.from("quotes").select("*").eq("id", quoteId).single(),
      supabase.from("quote_items").select("*").eq("quote_id", quoteId).order("sort_order"),
    ]);
    setQuote(q); setItems(it || []); setLoading(false);
  }, [quoteId]);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.unit_price || 0)), 0), [items]);

  const update = (field, value) => setQuote((p) => ({ ...p, [field]: value }));

  const saveAll = async () => {
    setSaving(true);
    await supabase.from("quotes").update({
      quote_no: quote.quote_no, status: quote.status, pol: quote.pol, pod: quote.pod,
      incoterms: quote.incoterms, carrier: quote.carrier, currency: quote.currency,
      valid_until: quote.valid_until || null, notes: quote.notes, total: Number(total.toFixed(2)),
    }).eq("id", quoteId);
    // Items: delete-and-reinsert (simple, OK for small lists)
    await supabase.from("quote_items").delete().eq("quote_id", quoteId);
    if (items.length > 0) {
      const payload = items.map((it, i) => ({
        quote_id: quoteId, description: it.description || "", qty: it.qty || 0,
        unit: it.unit || null, unit_price: it.unit_price || 0, sort_order: i,
      }));
      await supabase.from("quote_items").insert(payload);
    }
    setSaving(false); onClose();
  };

  const addRow = () => setItems((p) => [...p, { id: `tmp-${Date.now()}-${Math.random()}`, description: "", qty: 1, unit: "", unit_price: 0 }]);
  const updateRow = (idx, field, value) => setItems((p) => p.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  const removeRow = (idx) => setItems((p) => p.filter((_, i) => i !== idx));

  if (loading) return <Spinner />;
  if (!quote) return <EmptyState>Quote not found.</EmptyState>;

  return (
    <div>
      <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0", border: "none", background: "none", color: "#0ea5e9", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginBottom: 12 }}>← Back to quotes</button>
      <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0", marginBottom: 14 }}>
        <SectionHeader icon="💰" title={`Quote ${quote.quote_no || ""} — ${customer.name}`} accent="#f59e0b"
          right={<div style={{ display: "flex", gap: 8 }}><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={saveAll} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <Input label="Quote No" value={quote.quote_no || ""} onChange={e => update("quote_no", e.target.value)} />
          <Select label="Status" value={quote.status || "draft"} onChange={e => update("status", e.target.value)} options={["draft", "sent", "accepted", "rejected", "expired"]} />
          <Input label="POL" value={quote.pol || ""} onChange={e => update("pol", e.target.value)} />
          <Input label="POD" value={quote.pod || ""} onChange={e => update("pod", e.target.value)} />
          <Select label="Incoterms" value={quote.incoterms || ""} onChange={e => update("incoterms", e.target.value)} options={["", "FOB", "DDP", "CIF", "EXW", "DAP"]} />
          <Input label="Carrier" value={quote.carrier || ""} onChange={e => update("carrier", e.target.value)} />
          <Input label="Currency" value={quote.currency || "USD"} onChange={e => update("currency", e.target.value)} />
          <Input label="Valid Until" type="date" value={quote.valid_until || ""} onChange={e => update("valid_until", e.target.value)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, display: "block" }}>Notes</label>
          <textarea rows={2} value={quote.notes || ""} onChange={e => update("notes", e.target.value)}
            style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12.5, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e2e8f0" }}>
        <SectionHeader icon="📋" title="Line Items" accent="#0ea5e9" right={<Button small onClick={addRow}>+ Add line</Button>} />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            {["Description", "Qty", "Unit", "Unit Price", "Amount", ""].map((h) => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {items.map((it, i) => {
              const amt = (Number(it.qty || 0) * Number(it.unit_price || 0)).toFixed(2);
              return (
                <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "6px 10px" }}><input value={it.description || ""} onChange={e => updateRow(i, "description", e.target.value)} style={{ width: "100%", border: "none", outline: "none", fontSize: 12.5, padding: "4px 6px", background: "transparent" }} /></td>
                  <td style={{ padding: "6px 10px", width: 70 }}><input type="number" value={it.qty || ""} onChange={e => updateRow(i, "qty", e.target.value)} style={{ width: 60, border: "none", outline: "none", fontSize: 12.5, padding: "4px 6px", background: "transparent" }} /></td>
                  <td style={{ padding: "6px 10px", width: 70 }}><input value={it.unit || ""} onChange={e => updateRow(i, "unit", e.target.value)} style={{ width: 60, border: "none", outline: "none", fontSize: 12.5, padding: "4px 6px", background: "transparent" }} placeholder="cbm/kg" /></td>
                  <td style={{ padding: "6px 10px", width: 100 }}><input type="number" value={it.unit_price || ""} onChange={e => updateRow(i, "unit_price", e.target.value)} style={{ width: 90, border: "none", outline: "none", fontSize: 12.5, padding: "4px 6px", background: "transparent" }} /></td>
                  <td style={{ padding: "6px 10px", fontWeight: 600 }}>{amt}</td>
                  <td style={{ padding: "6px 10px", width: 50 }}><button onClick={() => removeRow(i)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Del</button></td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 12 }}>No line items. Click "+ Add line".</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{ background: "#f0f9ff" }}>
              <td colSpan={4} style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>Total ({quote.currency || "USD"})</td>
              <td style={{ padding: "10px", fontWeight: 700, fontSize: 14, color: "#0369a1", fontFamily: "'DM Mono',monospace" }}>{total.toFixed(2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
