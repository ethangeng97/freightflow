// 客户管理 — list / pipeline / detail / quote editor
// 重构：用 shell.css 类替换 inline 样式 + ui.jsx 旧组件
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabase.js";
import { NotesPanel } from "../components/NotesPanel.jsx";
import { isCustomer } from "../lib/permissions.js";
import { t } from "../lib/i18n.js";

// ============================================================
// CustomersPage (entry)
// ============================================================
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
    setCustomers(cs || []); setStages(ss || []);
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
    <>
      <h1 className="page-title">{t("Customers")}</h1>

      {/* view 切换 tab */}
      <Tabs value={view} onChange={setView} options={[
        { k: "list",     l: t("List") },
        { k: "pipeline", l: t("Pipeline") },
      ]} />

      <div className="page-section-bar">
        <input className="field-input" placeholder={t("Search name / contact / email...")}
               value={search} onChange={e => setSearch(e.target.value)}
               style={{ width: 240 }} />
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>
          {customers.length} {t("customers")} · {stages.length} {t("stages")}
        </span>
        {!isCustomer(user) && (
          <button className="btn primary" onClick={() => setShowNew(true)}>{t("+ New Customer")}</button>
        )}
      </div>

      {loading ? (
        <div className="empty-state empty-text">{t("Loading...")}</div>
      ) : view === "list" ? (
        <CustomerList customers={filtered} stages={stages} onOpen={setSelectedId} />
      ) : (
        <CustomerKanban customers={filtered} stages={stages} onOpen={setSelectedId} onMoved={reload} />
      )}

      {showNew && <NewCustomerModal stages={stages} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
    </>
  );
}

// ============================================================
// 列表视图
// ============================================================
function CustomerList({ customers, stages, onOpen }) {
  const stageById = Object.fromEntries(stages.map(s => [s.id, s]));
  if (customers.length === 0) {
    return <div className="page-card empty-state empty-text">{t("No customers yet")}</div>;
  }
  return (
    <div className="page-card" style={{ padding: 0 }}>
      <table className="tms-table">
        <thead>
          <tr>
            <th>{t("Name")}</th>
            <th>{t("Stage")}</th>
            <th>{t("Contact")}</th>
            <th>{t("Email")}</th>
            <th>{t("Phone")}</th>
            <th>{t("Country")}</th>
            <th>{t("Tags")}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
            const stage = stageById[c.pipeline_stage_id];
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)} style={{ cursor: "pointer" }}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{stage
                  ? <span className="badge" style={{ background: stage.color + "20", color: stage.color }}>{t(stage.name)}</span>
                  : <span className="muted">—</span>}</td>
                <td>{c.contact_name || <span className="muted">—</span>}</td>
                <td>{c.contact_email || <span className="muted">—</span>}</td>
                <td>{c.contact_phone || <span className="muted">—</span>}</td>
                <td>{c.country || <span className="muted">—</span>}</td>
                <td>
                  {(c.tags || []).slice(0, 3).map(t => (
                    <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// 看板视图（拖拽换阶段）
// ============================================================
function CustomerKanban({ customers, stages, onOpen, onMoved }) {
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const grouped = useMemo(() => {
    const g = { __none: [] };
    stages.forEach(s => g[s.id] = []);
    customers.forEach(c => {
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

  const cols = [...stages, { id: "__none", name: t("Unassigned"), color: "#94a3b8" }];

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      {cols.map(s => {
        const cards = grouped[s.id] || [];
        const isOver = overStage === s.id;
        return (
          <div key={s.id}
               onDragOver={(e) => { e.preventDefault(); setOverStage(s.id); }}
               onDragLeave={() => setOverStage(null)}
               onDrop={() => dropTo(s.id)}
               style={{
                 minWidth: 260, flex: "0 0 260px",
                 background: isOver ? "var(--shell-primary-50)" : "var(--shell-bg)",
                 border: `2px ${isOver ? "solid var(--shell-primary)" : "dashed transparent"}`,
                 borderRadius: 6, padding: 10,
               }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--shell-text)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                {t(s.name)}
              </span>
              <span style={{ fontSize: 11, color: "var(--shell-text-3)" }}>{cards.length}</span>
            </div>
            {cards.map(c => (
              <div key={c.id}
                   draggable
                   onDragStart={() => setDragId(c.id)}
                   onDragEnd={() => { setDragId(null); setOverStage(null); }}
                   onClick={() => onOpen(c.id)}
                   style={{
                     background: "#fff", border: "1px solid var(--shell-border)",
                     borderRadius: 4, padding: 10, marginBottom: 6,
                     cursor: dragId === c.id ? "grabbing" : "grab",
                     opacity: dragId === c.id ? 0.5 : 1,
                     boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                   }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--shell-text)", marginBottom: 2 }}>{c.name}</div>
                {c.contact_name && (
                  <div style={{ fontSize: 11, color: "var(--shell-text-2)" }}>{c.contact_name}</div>
                )}
                {c.country && (
                  <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginTop: 4 }}>📍 {c.country}</div>
                )}
              </div>
            ))}
            {cards.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--shell-text-3)", textAlign: "center", padding: "20px 0" }}>
                {t("Drop here")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 新建客户
// ============================================================
function NewCustomerModal({ stages, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", contact_name: "", contact_email: "", contact_phone: "",
    country: "", source: "", pipeline_stage_id: stages[0]?.id || "",
  });
  const [saving, setSaving] = useState(false);
  const ch = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { alert("名称必填"); return; }
    setSaving(true);
    const payload = { ...form, pipeline_stage_id: form.pipeline_stage_id || null };
    const { error } = await supabase.from("customers").insert(payload);
    setSaving(false);
    if (error) { alert(error.message); return; }
    onSaved();
  };

  return (
    <Modal title="新建客户" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose} disabled={saving}>取消</button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "保存中..." : "创建"}
        </button>
      </>
    }>
      <div className="field-row">
        <Field label="名称" req>
          <input className="field-input" value={form.name} onChange={ch("name")} />
        </Field>
        <Field label="阶段">
          <select className="field-select" value={form.pipeline_stage_id} onChange={ch("pipeline_stage_id")}>
            <option value="">（无）</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="联系人">
          <input className="field-input" value={form.contact_name} onChange={ch("contact_name")} />
        </Field>
        <Field label="邮箱">
          <input className="field-input" type="email" value={form.contact_email} onChange={ch("contact_email")} />
        </Field>
        <Field label="电话">
          <input className="field-input" value={form.contact_phone} onChange={ch("contact_phone")} />
        </Field>
        <Field label="国家">
          <input className="field-input" value={form.country} onChange={ch("country")} />
        </Field>
        <Field label="来源">
          <input className="field-input" value={form.source} onChange={ch("source")}
                 placeholder="referral / web / show..." />
        </Field>
      </div>
    </Modal>
  );
}

// ============================================================
// 客户详情（4 个 tab）
// ============================================================
function CustomerDetail({ customer, stages, user, onBack, onSaved }) {
  const [tab, setTab] = useState("overview");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(customer);
  const stage = stages.find(s => s.id === form.pipeline_stage_id);
  const canEdit = !isCustomer(user);
  const ch = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

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
    <>
      <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>{t("Back to list")}</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{form.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            {stage && (
              <span className="badge" style={{ background: stage.color + "20", color: stage.color }}>{t(stage.name)}</span>
            )}
            {form.country && (
              <span style={{ fontSize: 12, color: "var(--shell-text-2)" }}>📍 {form.country}</span>
            )}
          </div>
        </div>
        {canEdit && (edit
          ? <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" onClick={() => { setEdit(false); setForm(customer); }}>{t("Cancel")}</button>
              <button className="btn primary" onClick={save}>{t("Save")}</button>
            </div>
          : <button className="btn" onClick={() => setEdit(true)}>{t("Edit")}</button>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} options={[
        { k: "overview",  l: t("Overview") },
        { k: "followups", l: t("Follow-ups") },
        { k: "quotes",    l: t("Quotes") },
        { k: "notes",     l: t("Notes") },
      ]} />

      {tab === "overview" && (
        <div className="page-card">
          <div className="card-title">{t("Customer Info")}</div>
          {edit ? (
            <div className="field-row">
              <Field label="名称"><input className="field-input" value={form.name || ""} onChange={ch("name")} /></Field>
              <Field label="阶段">
                <select className="field-select" value={form.pipeline_stage_id || ""} onChange={ch("pipeline_stage_id")}>
                  <option value="">（无）</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="联系人"><input className="field-input" value={form.contact_name || ""} onChange={ch("contact_name")} /></Field>
              <Field label="邮箱"><input className="field-input" value={form.contact_email || ""} onChange={ch("contact_email")} /></Field>
              <Field label="电话"><input className="field-input" value={form.contact_phone || ""} onChange={ch("contact_phone")} /></Field>
              <Field label="国家"><input className="field-input" value={form.country || ""} onChange={ch("country")} /></Field>
              <Field label="网站"><input className="field-input" value={form.website || ""} onChange={ch("website")} /></Field>
              <Field label="来源"><input className="field-input" value={form.source || ""} onChange={ch("source")} /></Field>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <InfoLine label="联系人" value={customer.contact_name} />
              <InfoLine label="邮箱"   value={customer.contact_email} />
              <InfoLine label="电话"   value={customer.contact_phone} />
              <InfoLine label="国家"   value={customer.country} />
              <InfoLine label="网站"   value={customer.website} />
              <InfoLine label="来源"   value={customer.source} />
            </div>
          )}
        </div>
      )}

      {tab === "followups" && <FollowupsTab customer={customer} user={user} />}
      {tab === "quotes"    && <QuotesTab customer={customer} user={user} canEdit={canEdit} />}
      {tab === "notes"     && (
        <div className="page-card">
          <NotesPanel entityType="customer" entityId={customer.id} user={user} />
        </div>
      )}
    </>
  );
}

const InfoLine = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--shell-text-3)", marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, color: value ? "var(--shell-text)" : "var(--shell-text-3)" }}>{value || "—"}</div>
  </div>
);

// ============================================================
// 跟进记录 tab
// ============================================================
function FollowupsTab({ customer, user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: "note", subject: "", body: "", next_action: "", next_date: "" });
  const ch = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const load = useCallback(async () => {
    const { data } = await supabase.from("customer_followups")
      .select("*").eq("customer_id", customer.id).order("created_at", { ascending: false });
    setItems(data || []); setLoading(false);
  }, [customer.id]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.body && !form.subject) { alert("主题或内容必填"); return; }
    const payload = {
      customer_id: customer.id, user_id: user.id, user_email: user.email,
      type: form.type, subject: form.subject || null, body: form.body || null,
      next_action: form.next_action || null, next_date: form.next_date || null,
    };
    const { error } = await supabase.from("customer_followups").insert(payload);
    if (error) { alert(error.message); return; }
    setForm({ type: "note", subject: "", body: "", next_action: "", next_date: "" });
    load();
  };

  const remove = async (id) => {
    if (!confirm("删除这条跟进？")) return;
    await supabase.from("customer_followups").delete().eq("id", id);
    load();
  };

  return (
    <>
      <div className="page-card">
        <div className="card-title">新建跟进</div>
        <div className="field-row">
          <Field label="类型">
            <select className="field-select" value={form.type} onChange={ch("type")}>
              <option value="note">笔记</option>
              <option value="call">电话</option>
              <option value="email">邮件</option>
              <option value="meeting">会面</option>
            </select>
          </Field>
          <Field label="主题">
            <input className="field-input" value={form.subject} onChange={ch("subject")} />
          </Field>
          <Field label="下次日期">
            <input className="field-input" type="date" value={form.next_date} onChange={ch("next_date")} />
          </Field>
        </div>
        <Field label="详情">
          <textarea className="field-textarea" value={form.body} onChange={ch("body")} />
        </Field>
        <Field label="下次行动">
          <input className="field-input" value={form.next_action} onChange={ch("next_action")}
                 placeholder="例如：发上海→洛杉矶 FCL 报价" />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn primary" onClick={add}>+ 添加</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state empty-text">加载中...</div>
      ) : items.length === 0 ? (
        <div className="page-card empty-state empty-text">暂无跟进</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map(it => (
            <div key={it.id} className="page-card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge" style={{ background: typeColor(it.type) + "20", color: typeColor(it.type) }}>
                    {typeLabel(it.type)}
                  </span>
                  {it.subject && <span style={{ fontSize: 13, fontWeight: 600 }}>{it.subject}</span>}
                </div>
                <button onClick={() => remove(it.id)}
                        style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  删除
                </button>
              </div>
              {it.body && (
                <div style={{ fontSize: 13, color: "var(--shell-text)", whiteSpace: "pre-wrap", marginBottom: 6 }}>
                  {it.body}
                </div>
              )}
              {(it.next_action || it.next_date) && (
                <div style={{
                  fontSize: 12, color: "var(--shell-primary)", padding: "5px 8px",
                  background: "var(--shell-primary-50)", borderRadius: 4,
                  display: "inline-block", marginBottom: 6,
                }}>
                  ⏭ {it.next_action || ""}{it.next_date ? ` · ${it.next_date}` : ""}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--shell-text-3)" }}>
                {it.user_email} · {new Date(it.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const typeColor = (t) => ({ note: "#64748b", call: "#10b981", email: "#1989ff", meeting: "#8b5cf6" }[t] || "#64748b");
const typeLabel = (t) => ({ note: "笔记", call: "电话", email: "邮件", meeting: "会面" }[t] || t);

// ============================================================
// 报价 tab
// ============================================================
function QuotesTab({ customer, user, canEdit }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("quotes")
      .select("*").eq("customer_id", customer.id).order("created_at", { ascending: false });
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

  const remove = async (id) => {
    if (!confirm("删除这条报价？")) return;
    await supabase.from("quotes").delete().eq("id", id);
    load();
  };

  if (editingId) {
    return <QuoteEditor quoteId={editingId} customer={customer} user={user} onClose={() => { setEditingId(null); load(); }} />;
  }

  return (
    <>
      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button className="btn primary" onClick={newQuote}>+ 新建报价</button>
        </div>
      )}
      {loading ? (
        <div className="empty-state empty-text">加载中...</div>
      ) : items.length === 0 ? (
        <div className="page-card empty-state empty-text">暂无报价</div>
      ) : (
        <div className="page-card" style={{ padding: 0 }}>
          <table className="tms-table">
            <thead>
              <tr>
                <th>报价号</th>
                <th>状态</th>
                <th>POL → POD</th>
                <th>船公司</th>
                <th>金额</th>
                <th>有效期</th>
                <th>创建时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map(q => (
                <tr key={q.id} style={{ cursor: "pointer" }} onClick={() => setEditingId(q.id)}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--shell-primary)" }}>{q.quote_no || "—"}</td>
                  <td><span className={"badge " + statusBadgeClass(q.status)}>{statusLabel(q.status)}</span></td>
                  <td>{q.pol && q.pod ? `${q.pol} → ${q.pod}` : "—"}</td>
                  <td>{q.carrier || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{q.total ? `${q.currency} ${Number(q.total).toLocaleString()}` : "—"}</td>
                  <td>{q.valid_until || "—"}</td>
                  <td className="muted">{new Date(q.created_at).toLocaleDateString()}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {canEdit && (
                      <button onClick={() => remove(q.id)}
                              style={{ border: "none", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const statusLabel = (s) => ({ draft: "草稿", sent: "已发送", accepted: "已接受", rejected: "已拒绝", expired: "已过期" }[s] || s);
const statusBadgeClass = (s) => ({
  draft: "", sent: "info", accepted: "approved", rejected: "rejected", expired: "pending",
}[s] || "");

// ============================================================
// 报价编辑器（行项目 + 合计）
// ============================================================
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

  const total = useMemo(() =>
    items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.unit_price || 0)), 0),
  [items]);

  const update = (field, value) => setQuote(p => ({ ...p, [field]: value }));

  const saveAll = async () => {
    setSaving(true);
    await supabase.from("quotes").update({
      quote_no: quote.quote_no, status: quote.status, pol: quote.pol, pod: quote.pod,
      incoterms: quote.incoterms, carrier: quote.carrier, currency: quote.currency,
      valid_until: quote.valid_until || null, notes: quote.notes, total: Number(total.toFixed(2)),
    }).eq("id", quoteId);
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

  const addRow = () => setItems(p => [...p, { id: `tmp-${Date.now()}-${Math.random()}`, description: "", qty: 1, unit: "", unit_price: 0 }]);
  const updateRow = (idx, field, value) => setItems(p => p.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  const removeRow = (idx) => setItems(p => p.filter((_, i) => i !== idx));

  if (loading) return <div className="empty-state empty-text">加载中...</div>;
  if (!quote)  return <div className="page-card empty-state empty-text">报价不存在</div>;

  return (
    <>
      <button className="btn" onClick={onClose} style={{ marginBottom: 12 }}>← 返回报价列表</button>

      <div className="page-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0, paddingBottom: 0, border: "none" }}>
            报价 {quote.quote_no || ""} — {customer.name}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" onClick={onClose}>取消</button>
            <button className="btn primary" onClick={saveAll} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
        <div className="field-row">
          <Field label="报价号"><input className="field-input" value={quote.quote_no || ""} onChange={e => update("quote_no", e.target.value)} /></Field>
          <Field label="状态">
            <select className="field-select" value={quote.status || "draft"} onChange={e => update("status", e.target.value)}>
              <option value="draft">草稿</option>
              <option value="sent">已发送</option>
              <option value="accepted">已接受</option>
              <option value="rejected">已拒绝</option>
              <option value="expired">已过期</option>
            </select>
          </Field>
          <Field label="POL"><input className="field-input" value={quote.pol || ""} onChange={e => update("pol", e.target.value)} /></Field>
          <Field label="POD"><input className="field-input" value={quote.pod || ""} onChange={e => update("pod", e.target.value)} /></Field>
          <Field label="贸易条款">
            <select className="field-select" value={quote.incoterms || ""} onChange={e => update("incoterms", e.target.value)}>
              <option value=""></option>
              <option>FOB</option><option>DDP</option><option>CIF</option><option>EXW</option><option>DAP</option>
            </select>
          </Field>
          <Field label="船公司"><input className="field-input" value={quote.carrier || ""} onChange={e => update("carrier", e.target.value)} /></Field>
          <Field label="币种"><input className="field-input" value={quote.currency || "USD"} onChange={e => update("currency", e.target.value)} /></Field>
          <Field label="有效期"><input className="field-input" type="date" value={quote.valid_until || ""} onChange={e => update("valid_until", e.target.value)} /></Field>
        </div>
        <Field label="备注">
          <textarea className="field-textarea" rows={2} value={quote.notes || ""} onChange={e => update("notes", e.target.value)} />
        </Field>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid var(--shell-border-2)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>明细</div>
          <button className="btn primary" onClick={addRow}>+ 添加行</button>
        </div>
        <table className="tms-table">
          <thead>
            <tr>
              <th>描述</th>
              <th style={{ width: 80 }}>数量</th>
              <th style={{ width: 80 }}>单位</th>
              <th style={{ width: 110 }}>单价</th>
              <th>金额</th>
              <th style={{ width: 50 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const amt = (Number(it.qty || 0) * Number(it.unit_price || 0)).toFixed(2);
              return (
                <tr key={it.id}>
                  <td><input value={it.description || ""} onChange={e => updateRow(i, "description", e.target.value)}
                             style={{ width: "100%", border: "none", outline: "none", fontSize: 13, padding: "4px 6px", background: "transparent" }} /></td>
                  <td><input type="number" value={it.qty || ""} onChange={e => updateRow(i, "qty", e.target.value)}
                             style={{ width: 60, border: "none", outline: "none", fontSize: 13, padding: "4px 6px", background: "transparent" }} /></td>
                  <td><input value={it.unit || ""} onChange={e => updateRow(i, "unit", e.target.value)}
                             style={{ width: 60, border: "none", outline: "none", fontSize: 13, padding: "4px 6px", background: "transparent" }}
                             placeholder="cbm/kg" /></td>
                  <td><input type="number" value={it.unit_price || ""} onChange={e => updateRow(i, "unit_price", e.target.value)}
                             style={{ width: 90, border: "none", outline: "none", fontSize: 13, padding: "4px 6px", background: "transparent" }} /></td>
                  <td style={{ fontWeight: 600 }}>{amt}</td>
                  <td>
                    <button onClick={() => removeRow(i)}
                            style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--shell-text-3)", fontSize: 12 }}>
                无明细。点击"+ 添加行"。
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--shell-primary-50)" }}>
              <td colSpan={4} style={{ padding: 10, textAlign: "right", fontWeight: 600 }}>合计 ({quote.currency || "USD"})</td>
              <td style={{ padding: 10, fontWeight: 700, fontSize: 14, color: "var(--shell-primary)", fontFamily: "monospace" }}>
                {total.toFixed(2)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ============================================================
// 公用：底部 underline tabs
// ============================================================
function Tabs({ value, onChange, options }) {
  return (
    <div style={{
      display: "flex", gap: 0, marginBottom: 12,
      borderBottom: "1px solid var(--shell-border)",
    }}>
      {options.map(o => {
        const active = value === o.k;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} style={{
            padding: "8px 18px", border: "none", background: "transparent",
            fontSize: 13, cursor: "pointer",
            color: active ? "var(--shell-primary)" : "var(--shell-text-2)",
            fontWeight: active ? 600 : 400,
            borderBottom: active ? "2px solid var(--shell-primary)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {o.l}
          </button>
        );
      })}
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

// ============================================================
// 公用：Modal
// ============================================================
function Modal({ title, children, footer, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto",
        background: "#fff", borderRadius: 6, boxShadow: "0 10px 30px rgba(0,0,0,.2)",
      }}>
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid var(--shell-border)",
          fontSize: 14, fontWeight: 600,
        }}>{title}</div>
        <div style={{ padding: 16 }}>{children}</div>
        <div style={{
          padding: "10px 16px", borderTop: "1px solid var(--shell-border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>{footer}</div>
      </div>
    </div>
  );
}
