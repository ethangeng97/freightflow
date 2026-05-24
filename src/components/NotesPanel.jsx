// 笔记面板 —— 用 shell.css 重新统一视觉
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase.js";

export function NotesPanel({ entityType, entityId, user, compact }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", tags: "" });

  const load = useCallback(async () => {
    if (!entityId) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("notes")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setNotes(data || []); setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm({ title: "", body: "", tags: "" }); setEditingId(null); };

  const save = async () => {
    if (!form.body.trim() && !form.title.trim()) return;
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const payload = {
      entity_type: entityType, entity_id: entityId,
      title: form.title.trim() || null,
      body: form.body.trim() || null,
      tags,
      created_by: user.id,
      user_email: user.email,
    };
    if (editingId) {
      const { error } = await supabase.from("notes").update({ title: payload.title, body: payload.body, tags }).eq("id", editingId);
      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from("notes").insert(payload);
      if (error) { alert(error.message); return; }
    }
    reset(); load();
  };

  const startEdit = (n) => { setEditingId(n.id); setForm({ title: n.title || "", body: n.body || "", tags: (n.tags || []).join(", ") }); };
  const togglePin = async (n) => { await supabase.from("notes").update({ pinned: !n.pinned }).eq("id", n.id); load(); };
  const remove = async (id) => { if (!confirm("删除该笔记？")) return; await supabase.from("notes").delete().eq("id", id); load(); };

  return (
    <div>
      {/* 新建/编辑表单 */}
      <div style={{
        background: "var(--shell-bg)",
        border: "1px solid var(--shell-border-2)",
        borderRadius: 4,
        padding: 10,
        marginBottom: 12,
      }}>
        <input className="field-input"
          placeholder="标题（可选）"
          value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          style={{ marginBottom: 6 }} />
        <textarea className="field-textarea"
          rows={compact ? 2 : 3}
          placeholder="笔记内容..."
          value={form.body}
          onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          style={{ marginBottom: 6 }} />
        <input className="field-input"
          placeholder="标签（逗号分隔）"
          value={form.tags}
          onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
          style={{ marginBottom: 8 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          {editingId && (
            <button className="btn" onClick={reset} style={{ padding: "4px 12px", fontSize: 12 }}>取消</button>
          )}
          <button className="btn primary" onClick={save} style={{ padding: "4px 14px", fontSize: 12 }}>
            {editingId ? "更新" : "添加笔记"}
          </button>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="empty-state empty-text" style={{ padding: "20px 0" }}>加载中...</div>
      ) : notes.length === 0 ? (
        <div className="empty-state empty-text" style={{ padding: "30px 0" }}>暂无笔记</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map(n => (
            <div key={n.id} style={{
              background: n.pinned ? "#fffbeb" : "#fff",
              border: `1px solid ${n.pinned ? "#fcd34d" : "var(--shell-border)"}`,
              borderRadius: 4,
              padding: "8px 10px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {n.title && (
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--shell-text)", marginBottom: 2 }}>
                      {n.pinned && "📌 "}{n.title}
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, color: "var(--shell-text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {n.body}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => togglePin(n)} title="置顶"
                          style={{ border: "none", background: "none", cursor: "pointer", color: n.pinned ? "#f59e0b" : "#cbd5e1", fontSize: 13 }}>📌</button>
                  <button onClick={() => startEdit(n)} title="编辑"
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--shell-primary)", fontSize: 11, fontWeight: 600 }}>编辑</button>
                  <button onClick={() => remove(n.id)} title="删除"
                          style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: 11, fontWeight: 600 }}>删除</button>
                </div>
              </div>
              {(n.tags || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {n.tags.map(t => <span key={t} className="badge info">{t}</span>)}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginTop: 6 }}>
                {n.user_email} · {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
