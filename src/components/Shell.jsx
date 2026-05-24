// ============================================================
// Shell — TMS-style portal layout
// White top bar + collapsible left sidebar + multi-tab content
//
// Usage:
//   <Shell user={user} onLogout={...} pageRegistry={{ Pagename: <Component /> }} />
//
// Routing: hash-based. Clicking a nav leaf opens (or focuses) a tab and sets
// window.location.hash to "#/{leaf.key}". Initial hash is honored on mount.
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { navForRole, flatNav, findNavByKey } from "../lib/nav-config.js";
import { isZh, setLangOverride, t } from "../lib/i18n.js";

// ── Tiny icon set (lucide-style strokes) ──────────────────────
const ICONS = {
  menu:    <><line x1="3" y1="6"  x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
  home:    <><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></>,
  ship:    <><path d="M2 18a2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1"/><path d="M19.4 18A11.6 11.6 0 0 0 21 12l-9-4-9 4c0 2.9.9 5.3 2.8 7.8"/><path d="M19 11V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/></>,
  box:     <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>,
  users:   <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  factory: <><path d="M2 20h20"/><path d="M4 20V9l5 3V9l5 3V4l6 4v12"/></>,
  book:    <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  gear:    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  send:    <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  wallet:  <><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><circle cx="17" cy="12" r="2"/></>,
  check:   <><polyline points="20 6 9 17 4 12"/></>,
  chev:    <polyline points="6 9 12 15 18 9"/>,
  x:       <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
};

function Icon({ name, size = 16, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      {ICONS[name] || null}
    </svg>
  );
}

// ── Hash route helper ─────────────────────────────────────────
function readHash() {
  const h = window.location.hash || "";
  const m = h.match(/^#\/([^?]+)/);
  return m ? m[1] : "";
}
function writeHash(key) {
  if (readHash() === key) return;
  window.location.hash = key ? `#/${key}` : "";
}

// ============================================================
// Shell
// ============================================================
export default function Shell({ user, onLogout, pageRegistry }) {
  const role = user?.profile?.role || "operator";
  const userName = user?.profile?.name || user?.email?.split("@")[0] || t("User");
  const nav = useMemo(() => navForRole(role), [role]);
  const leaves = useMemo(() => flatNav(role), [role]);
  // 路由守卫白名单 —— 只有当前角色 nav 里的 key 才能渲染
  const allowedKeys = useMemo(() => new Set(leaves.map(l => l.key)), [leaves]);

  // ── Tab manager ────────────────────────────────────────────
  // tabs is the keep-alive list. Each tab corresponds to a nav leaf.
  // Components remain mounted; we toggle visibility so form state survives.
  const [tabs, setTabs]           = useState([]);   // [{ key, label, page }]
  const [activeKey, setActiveKey] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Open or focus a tab by leaf
  const openTab = useCallback((leaf) => {
    if (!leaf) return;
    setTabs(prev => prev.some(t => t.key === leaf.key)
      ? prev
      : [...prev, { key: leaf.key, label: leaf.label, page: leaf.page }]);
    setActiveKey(leaf.key);
    writeHash(leaf.key);
  }, []);

  const closeTab = useCallback((key, ev) => {
    ev?.stopPropagation();
    setTabs(prev => {
      const idx = prev.findIndex(t => t.key === key);
      if (idx < 0) return prev;
      const next = prev.filter(t => t.key !== key);
      if (activeKey === key) {
        const fallback = next[idx] || next[idx - 1] || next[0] || null;
        const fbKey = fallback ? fallback.key : "";
        setActiveKey(fbKey);
        writeHash(fbKey);
      }
      return next;
    });
  }, [activeKey]);

  // On mount: open initial tab from hash, or default to first leaf.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const initKey = readHash();
    const initLeaf = (initKey && findNavByKey(role, initKey)) || leaves[0];
    if (initLeaf) openTab(initLeaf);
  }, [role, leaves, openTab]);

  // Listen to external hash changes (browser back / direct nav)
  useEffect(() => {
    const onHash = () => {
      const k = readHash();
      const leaf = findNavByKey(role, k);
      if (leaf) openTab(leaf);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [role, openTab]);

  // ── Group collapse state (persist per role) ────────────────
  const groupKey = `ff_nav_groups_${role}`;
  const [openGroups, setOpenGroups] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(groupKey) || "[]")); }
    catch { return new Set(); }
  });
  const toggleGroup = (label) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      try { localStorage.setItem(groupKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  // Default: all groups open on first visit
  useEffect(() => {
    if (openGroups.size > 0) return;
    const labels = nav.filter(n => n.children).map(n => n.label);
    if (labels.length === 0) return;
    setOpenGroups(new Set(labels));
    try { localStorage.setItem(groupKey, JSON.stringify(labels)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="shell">
      {/* Top bar */}
      <header className="shell-top">
        <button className="hamburger" onClick={() => setCollapsed(c => !c)} title={collapsed ? t("Expand menu") : t("Collapse menu")}>
          <Icon name="menu" size={18} />
        </button>
        <div className="brand">
          <span className="logo-mark">B</span>
          Bansar Portal
        </div>
        <div className="spacer" />
        <div className="top-right">
          <LangSwitch />
          <span className="user-info">{userName}</span>
          <span className="role-pill">{role}</span>
          <button className="logout" onClick={onLogout}>{t("Logout")}</button>
        </div>
      </header>

      <div className="shell-body">
        {/* Sidebar */}
        <aside className={"shell-side" + (collapsed ? " collapsed" : "")}>
          {nav.map((item, i) => {
            if (item.children) {
              const isOpen = openGroups.has(item.label);
              return (
                <div key={i}>
                  <div className={"group-head" + (isOpen ? "" : " collapsed")} onClick={() => toggleGroup(item.label)}>
                    <span>{item.label}</span>
                    <Icon name="chev" size={12} className="chev" />
                  </div>
                  {isOpen && item.children.map(child => (
                    <NavItem key={child.key} item={child} isChild
                             active={activeKey === child.key}
                             onClick={() => openTab(child)} />
                  ))}
                </div>
              );
            }
            return (
              <NavItem key={item.key || i} item={item}
                       active={activeKey === item.key}
                       onClick={() => openTab(item)} />
            );
          })}
        </aside>

        {/* Main column */}
        <div className="shell-main">
          {/* Tab strip */}
          <div className="shell-tabs">
            {tabs.map(tab => (
              <div key={tab.key}
                   className={"tab" + (tab.key === activeKey ? " active" : "")}
                   onClick={() => { setActiveKey(tab.key); writeHash(tab.key); }}>
                <span>{tab.label}</span>
                {tabs.length > 1 && (
                  <span className="x" onClick={(e) => closeTab(tab.key, e)} title={t("Close")}>
                    <Icon name="x" size={10} />
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Content — keep-alive: all open tabs stay mounted */}
          <div className="shell-content">
            {tabs.map(tab => {
              const Page = pageRegistry[tab.page];
              // 防御性守卫：即使 tab 进了列表，渲染前再确认它在角色白名单
              if (!allowedKeys.has(tab.key)) {
                return (
                  <div key={tab.key}
                       className={"shell-page" + (tab.key === activeKey ? "" : " hidden")}>
                    <div className="empty-state empty-text">
                      403 — {t("Your role")} ({role}) {t("cannot access this page")}
                    </div>
                  </div>
                );
              }
              return (
                <div key={tab.key}
                     className={"shell-page" + (tab.key === activeKey ? "" : " hidden")}>
                  {Page
                    ? <Page user={user} tabKey={tab.key} />
                    : <div className="empty-state">{t("Page not registered")}: {tab.page}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// 语言切换 —— 用户偏好优先于角色默认；切换后 reload 让所有页面重渲染
function LangSwitch() {
  const [, force] = useState(0);
  const cur = isZh() ? "zh" : "en";
  const set = (lang) => {
    if (lang === cur) return;
    setLangOverride(lang);
    force(x => x + 1);
    // 刷新页面让所有组件重新执行 t() 拿新值
    window.location.reload();
  };
  return (
    <div style={{
      display: "inline-flex", border: "1px solid var(--shell-border)", borderRadius: 4,
      overflow: "hidden", marginRight: 4,
    }}>
      {["zh", "en"].map(l => (
        <button key={l} onClick={() => set(l)} style={{
          padding: "3px 10px", border: "none", cursor: "pointer",
          fontSize: 12, fontWeight: cur === l ? 600 : 400,
          background: cur === l ? "var(--shell-primary-50)" : "#fff",
          color: cur === l ? "var(--shell-primary)" : "var(--shell-text-2)",
        }}>
          {l === "zh" ? "中" : "EN"}
        </button>
      ))}
    </div>
  );
}

function NavItem({ item, active, onClick, isChild }) {
  return (
    <div className={"nav-item" + (isChild ? " child" : "") + (active ? " active" : "")}
         onClick={onClick} title={item.label}>
      <Icon name={item.icon || (isChild ? "" : "box")} className="icon" />
      <span className="label">{item.label}</span>
    </div>
  );
}
