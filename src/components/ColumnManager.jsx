import { useState, useRef } from "react";
import { Modal, Button } from "./ui.jsx";
import { COLUMN_MAP, defaultColumnConfig } from "../lib/columns.jsx";

// Pure presentational drag-reorder list. Works for any list of {key,visible}.
export function ColumnManager({ config, onChange, onClose, onReset, hiddenKeys = [] }) {
  const [items, setItems] = useState(config);
  const dragIdx = useRef(null);
  const [overIdx, setOverIdx] = useState(null);

  const visible = items.filter((it) => !hiddenKeys.includes(it.key));

  const move = (from, to) => {
    if (from === to) return;
    setItems((prev) => {
      const arr = prev.slice();
      const [it] = arr.splice(from, 1);
      arr.splice(to, 0, it);
      return arr.map((x, i) => ({ ...x, order: i }));
    });
  };

  const onDragStart = (idx) => (e) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const onDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };
  const onDrop = (idx) => (e) => {
    e.preventDefault();
    if (dragIdx.current != null) move(dragIdx.current, idx);
    dragIdx.current = null;
    setOverIdx(null);
  };
  const onDragEnd = () => { dragIdx.current = null; setOverIdx(null); };

  const toggle = (key) => setItems((prev) => prev.map((it) => it.key === key ? { ...it, visible: !it.visible } : it));
  const showAll = () => setItems((prev) => prev.map((it) => ({ ...it, visible: true })));
  const hideAll = () => setItems((prev) => prev.map((it) => ({ ...it, visible: false })));

  const apply = () => { onChange(items); onClose(); };
  const reset = () => { setItems(defaultColumnConfig()); onReset?.(); };

  return (
    <Modal onClose={onClose} title="Columns" width={420}
      right={<Button variant="ghost" small onClick={reset}>Reset</Button>}>
      <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 12px" }}>
        Drag <span style={{ color: "#0369a1", fontWeight: 600 }}>≡</span> to reorder · click checkbox to show/hide
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <Button variant="secondary" small onClick={showAll}>Show all</Button>
        <Button variant="secondary" small onClick={hideAll}>Hide all</Button>
      </div>
      <div style={{ maxHeight: "55vh", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        {visible.map((it) => {
          const idx = items.findIndex((x) => x.key === it.key);
          const meta = COLUMN_MAP[it.key];
          if (!meta) return null;
          const isOver = overIdx === idx;
          return (
            <div key={it.key}
              draggable
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                borderBottom: "1px solid #f1f5f9",
                background: isOver ? "#e0f2fe" : "#fff",
                borderTop: isOver ? "2px solid #0ea5e9" : "2px solid transparent",
                cursor: "grab", userSelect: "none",
              }}>
              <span style={{ color: "#cbd5e1", fontSize: 14, cursor: "grab" }}>≡</span>
              <input type="checkbox" checked={it.visible} onChange={() => toggle(it.key)}
                onClick={(e) => e.stopPropagation()} style={{ cursor: "pointer", width: 14, height: 14 }} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: it.visible ? "#0f172a" : "#94a3b8" }}>
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={apply}>Apply</Button>
      </div>
    </Modal>
  );
}
