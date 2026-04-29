import { STATUS_COLORS } from "../lib/constants.js";

export const Badge = ({ value, small }) => {
  const c = STATUS_COLORS[value] || { bg: "#f1f5f9", color: "#475569", dot: "#94a3b8" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 7px" : "3px 10px", borderRadius: 6, background: c.bg, color: c.color, fontSize: small ? 10.5 : 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {value}
    </span>
  );
};

export const Field = ({ label, value }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, color: "#8896a7", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 500, color: value ? "#1e293b" : "#cbd5e1" }}>{value || "—"}</div>
  </div>
);

export const SectionHeader = ({ icon, title, accent, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 10, borderBottom: `2px solid ${accent || "#e2e8f0"}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{title}</span>
    </div>
    {right}
  </div>
);

export const FilterDropdown = ({ label, value, options, onChange, optionLabels }) => {
  const isActive = value !== "All";
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      padding: "6px 28px 6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, outline: "none", cursor: "pointer",
      border: isActive ? "2px solid #0ea5e9" : "1px solid #e2e8f0",
      background: isActive ? "#f0f9ff" : "#fff", color: isActive ? "#0369a1" : "#64748b",
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
    }}>
      <option value="All">{label}</option>
      {options.map(o => <option key={o} value={o}>{(optionLabels && optionLabels[o]) || o}</option>)}
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

export const Spinner = ({ label = "Loading..." }) => (
  <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 13 }}>{label}</div>
);

export const EmptyState = ({ children }) => (
  <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 13 }}>{children}</div>
);

export const Tag = ({ children, color = "#64748b" }) => (
  <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: color + "15", color, whiteSpace: "nowrap" }}>{children}</span>
);
