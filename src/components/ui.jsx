import { useState, useMemo, useRef, useEffect } from "react";
import { STATUS_COLORS } from "../lib/constants.js";
import { t } from "../lib/i18n.js";

// 统一徽章 —— 沿用 STATUS_COLORS 调色板但风格统一（无圆点、紧凑、可换 i18n）
export const Badge = ({ value, small }) => {
  const c = STATUS_COLORS[value] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{
      display: "inline-block",
      padding: small ? "1px 8px" : "2px 10px",
      borderRadius: 10,
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 500, whiteSpace: "nowrap",
      lineHeight: 1.6,
    }}>
      {t(value)}
    </span>
  );
};

export const Field = ({ label, value }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, color: value ? "var(--shell-text)" : "var(--shell-text-3)" }}>{value || "—"}</div>
  </div>
);

export const SectionHeader = ({ icon, title, right }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12, paddingBottom: 10,
    borderBottom: "1px solid var(--shell-border-2)",
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--shell-text)" }}>{title}</span>
    </div>
    {right}
  </div>
);

// 筛选下拉 —— 与 .field-select 一致风格，激活时蓝边
export const FilterDropdown = ({ label, value, options, onChange, optionLabels }) => {
  const isActive = value !== "All";
  return (
    <select className="field-select" value={value} onChange={e => onChange(e.target.value)} style={{
      width: "auto",
      minWidth: 110,
      fontSize: 12,
      padding: "5px 8px",
      borderColor: isActive ? "var(--shell-primary)" : undefined,
      background: isActive ? "var(--shell-primary-50)" : undefined,
      color: isActive ? "var(--shell-primary)" : undefined,
      fontWeight: isActive ? 500 : 400,
    }}>
      <option value="All">{label}</option>
      {options.map(o => <option key={o} value={o}>{(optionLabels && optionLabels[o]) || t(o)}</option>)}
    </select>
  );
};

export const Modal = ({ children, onClose, width = 500, maxHeight = "85vh", title, right }) => (
  <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: "94vw", maxHeight, background:"#fff", borderRadius:12, overflow:"auto", padding:24 }}>
      {(title || right) && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          {title && <h2 style={{ fontSize:16, fontWeight:700, margin:0 }}>{title}</h2>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {right}
            <button onClick={onClose} style={{ border:"none", background:"none", fontSize:20, cursor:"pointer", color:"#94a3b8" }}>✕</button>
          </div>
        </div>
      )}
      {children}
    </div>
  </div>
);

export const Button = ({ children, variant = "primary", small, ...rest }) => {
  const v = {
    primary:   { bg: "#0ea5e9", color: "#fff", border: "none" },
    secondary: { bg: "#fff",    color: "#64748b", border: "1px solid #e2e8f0" },
    danger:    { bg: "#fef2f2", color: "#dc2626", border: "1px solid #fee2e2" },
    ghost:     { bg: "transparent", color: "#0ea5e9", border: "none" },
    accent:    { bg: "#f59e0b", color: "#fff", border: "none" },
  }[variant];
  return (
    <button {...rest} style={{
      padding: small ? "6px 12px" : "8px 16px",
      borderRadius: 7, fontSize: small ? 11.5 : 12.5, fontWeight: 600, cursor: rest.disabled ? "wait" : "pointer",
      background: v.bg, color: v.color, border: v.border, opacity: rest.disabled ? 0.7 : 1,
      ...rest.style,
    }}>{children}</button>
  );
};

export const Input = ({ label, ...rest }) => (
  <div>
    {label && <label style={{ fontSize:10, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3, display:"block" }}>{label}</label>}
    <input {...rest} style={{ width:"100%", padding:"7px 10px", borderRadius:6, border:"1px solid #e2e8f0", fontSize:12.5, outline:"none", boxSizing:"border-box", ...rest.style }} />
  </div>
);

export const Select = ({ label, options, ...rest }) => (
  <div>
    {label && <label style={{ fontSize:10, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3, display:"block" }}>{label}</label>}
    <select {...rest} style={{ width:"100%", padding:"7px 10px", borderRadius:6, border:"1px solid #e2e8f0", fontSize:12.5, outline:"none", cursor:"pointer", boxSizing:"border-box", ...rest.style }}>
      {options.map(o => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// Combobox: input-with-suggestions. Type-to-filter (prefix > substring), free-text allowed.
// On empty/focused state, shows recently-used items first (tracked in localStorage by recentKey).
// options accepts string[] or {value,label}[].
const COMBO_RECENT_LIMIT = 5;
const comboLoadRecents = (key) => {
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(`combo-recent-${key}`)) || []; }
  catch { return []; }
};
const comboBumpRecent = (key, value) => {
  if (!key || !value) return;
  try {
    const cur = comboLoadRecents(key);
    const next = [value, ...cur.filter(v => v !== value)].slice(0, COMBO_RECENT_LIMIT);
    localStorage.setItem(`combo-recent-${key}`, JSON.stringify(next));
  } catch {}
};

export const Combobox = ({ label, value, onChange, options = [], recentKey, placeholder, inputStyle, dropdownStyle, fontMono }) => {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const norm = useMemo(
    () => (options || []).map(o => typeof o === "string" ? { value: o, label: o } : o),
    [options]
  );

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const recents = comboLoadRecents(recentKey);
    if (!q) {
      const recentSet = new Set(recents);
      const recentItems = recents.map(r => norm.find(o => o.value === r)).filter(Boolean);
      const others = norm.filter(o => !recentSet.has(o.value));
      return [...recentItems, ...others].slice(0, 50);
    }
    const scored = [];
    for (const o of norm) {
      const lv = String(o.label).toLowerCase();
      const vv = String(o.value).toLowerCase();
      let score;
      if (lv.startsWith(q) || vv.startsWith(q)) score = 100;
      else if (lv.includes(q) || vv.includes(q)) score = 50;
      else continue;
      if (recents.includes(o.value)) score += 5;
      scored.push({ ...o, score });
    }
    scored.sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)));
    return scored.slice(0, 50);
  }, [value, norm, recentKey]);

  useEffect(() => { setHi(0); }, [value]);
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commit = (v) => { onChange(v); comboBumpRecent(recentKey, v); setOpen(false); };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { if (open && filtered[hi]) { e.preventDefault(); commit(filtered[hi].value); } }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const baseInput = { width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 12.5, outline: "none", boxSizing: "border-box", fontFamily: fontMono ? "'DM Mono',monospace" : undefined };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {label && <label style={{ fontSize:10, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3, display:"block" }}>{label}</label>}
      <input
        type="text"
        value={value || ""}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 120); if (value) comboBumpRecent(recentKey, value); }}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoComplete="off"
        style={{ ...baseInput, ...inputStyle }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, maxHeight: 240, overflowY: "auto", boxShadow: "0 6px 18px rgba(15,23,42,0.12)", ...dropdownStyle }}>
          {filtered.map((o, i) => (
            <div
              key={o.value}
              onMouseDown={(e) => { e.preventDefault(); commit(o.value); }}
              onMouseEnter={() => setHi(i)}
              style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", background: i === hi ? "#f0f9ff" : "#fff", color: i === hi ? "#0c4a6e" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const Spinner = ({ label = "Loading..." }) => (
  <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 13 }}>{label}</div>
);

export const EmptyState = ({ children }) => (
  <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 13 }}>{children}</div>
);

export const Tag = ({ children, color = "#64748b" }) => (
  <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: color + "15", color, whiteSpace: "nowrap" }}>{children}</span>
);
