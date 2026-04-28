import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase.js";
import { Button, Input, Spinner, EmptyState, Tag } from "./ui.jsx";

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
  const remove = async (id) => { if (!confirm("Delete note?")) return; await supabase.from("notes").delete().eq("id", id); load(); };

  return (
    <div>
      <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid #e2e8f0", marginBottom: 12 }}>
        <Input placeholder="Title (optional)" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={{ marginBottom: 6 }} />
        <textarea rows={compact ? 2 : 3} placeholder="Note..." value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
          style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12.5, outline: "none", boxSizing: "border-box", marginBottom: 6, fontFamily: "inherit", resize: "vertical" }} />
        <Input placeholder="Tags (comma-separated)" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} style={{ marginBottom: 8 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
          {editingId && <Button small variant="secondary" onClick={reset}>Cancel</Button>}
          <Button small onClick={save}>{editingId ? "Update" : "Add note"}</Button>
        </div>
      </div>
      {loading ? <Spinner label="" /> : notes.length === 0 ? <EmptyState>No notes yet.</EmptyState> :
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((n) => (
            <div key={n.id} style={{ background: n.pinned ? "#fffbeb" : "#fff", border: `1px solid ${n.pinned ? "#fcd34d" : "#e2e8f0"}`, borderRadius: 8, padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {n.title && <div style={{ fontWeight: 600, fontSize: 12.5, color: "#0f172a", marginBottom: 2 }}>{n.pinned && "📌 "}{n.title}</div>}
                  <div style={{ fontSize: 11.5, color: "#475569", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.body}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => togglePin(n)} title="Pin" style={{ border: "none", background: "none", cursor: "pointer", color: n.pinned ? "#f59e0b" : "#cbd5e1", fontSize: 13 }}>📌</button>
                  <button onClick={() => startEdit(n)} title="Edit" style={{ border: "none", background: "none", cursor: "pointer", color: "#0ea5e9", fontSize: 11, fontWeight: 600 }}>Edit</button>
                  <button onClick={() => remove(n.id)} title="Delete" style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: 11, fontWeight: 600 }}>Del</button>
                </div>
              </div>
              {(n.tags || []).length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{n.tags.map(t => <Tag key={t} color="#0ea5e9">{t}</Tag>)}</div>}
              <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 6, fontFamily: "'DM Mono',monospace" }}>
                {n.user_email} · {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}
