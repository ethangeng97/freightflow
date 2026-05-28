// MySpotBookings.jsx — 海外代理/客户 portal 端看自己关联的现舱
// 数据来源：spot_bookings_portal 视图（RLS 已限制 partner_id = current_user_customer_id()）
// 注意：视图刻意排除了 booking_agent_*, purchase_price, sell_price_* 等 ops 内部字段
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const STATUS_COLORS = {
  "可售":     { bg: "#f6ffed", fg: "#52c41a", bd: "#b7eb8f" },
  "部分已售": { bg: "#fff8e9", fg: "#c66800", bd: "#ffd28e" },
  "全部已售": { bg: "#f5f5f5", fg: "#888",    bd: "#ddd"    },
  "已截单":   { bg: "#fff1f0", fg: "#cf1322", bd: "#ffa39e" },
  "已取消":   { bg: "#f5f5f5", fg: "#aaa",    bd: "#ddd"    },
};

const fmtDate = (d) => {
  if (!d) return "—";
  return typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
};
const fmtDateTime = (d) => {
  if (!d) return "—";
  const x = new Date(d);
  return `${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")} ${String(x.getHours()).padStart(2,"0")}:${String(x.getMinutes()).padStart(2,"0")}`;
};
const daysBetween = (from, to) => {
  if (!from || !to) return null;
  const a = new Date(from); a.setHours(0,0,0,0);
  const b = new Date(to);   b.setHours(0,0,0,0);
  return Math.round((b - a) / 86400000);
};

export default function MySpotBookings({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("spot_bookings_portal")
        .select("*")
        .order("etd", { ascending: true })
        .order("created_at", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [customerId]);

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const pool = [r.carrier, r.vessel, r.voyage, r.route, r.pol, r.pod, r.booking_no, r.mbl_no];
      if (!pool.some(x => (x || "").toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, search, statusFilter]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <h1 className="page-title">{t("My Spot Bookings") || "我的现舱"}</h1>

      <div className="page-section-bar">
        <input className="field-input"
               placeholder={t("Search carrier / vessel / voyage / port / booking no") || "搜索 船公司/船名/航次/港口/订舱号"}
               value={search}
               onChange={e => setSearch(e.target.value)}
               style={{ width: 300 }} />
        <select className="field-select" value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ width: 130 }}>
          <option value="">{t("All status") || "全部状态"}</option>
          <option value="可售">可售</option>
          <option value="部分已售">部分已售</option>
          <option value="全部已售">全部已售</option>
          <option value="已截单">已截单</option>
          <option value="已取消">已取消</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>
          {filtered.length} {t("items") || "条"}
        </span>
      </div>

      <div className="page-card" style={{ padding: 0, overflow: "auto" }}>
        {loading ? (
          <div className="empty-state empty-text">{t("Loading...") || "加载中..."}</div>
        ) : !customerId ? (
          <div className="empty-state empty-text">{t("No customer linked to your account") || "您的账号没有关联客户，请联系班萨"}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state empty-text">
            {rows.length === 0
              ? (t("No spot bookings assigned to you") || "暂无关联到您的现舱")
              : (t("No match") || "没有匹配的现舱")}
          </div>
        ) : (
          <table className="tms-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>订舱号</th>
                <th style={{ width: 80 }}>船公司</th>
                <th style={{ width: 160 }}>船名 / 航次</th>
                <th style={{ width: 100 }}>POL</th>
                <th style={{ width: 100 }}>POD</th>
                <th style={{ width: 70 }}>柜型</th>
                <th style={{ textAlign: "right", width: 60 }}>柜数</th>
                <th style={{ width: 95 }}>ETD</th>
                <th style={{ width: 80 }}>离船期</th>
                <th style={{ width: 105 }}>SI 截单</th>
                <th style={{ width: 110 }}>MBL</th>
                <th style={{ width: 80, textAlign: "center" }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const daysToEtd = daysBetween(today, r.etd);
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS["可售"];
                const daysColor = daysToEtd != null && daysToEtd >= 0 && daysToEtd <= 3 ? "#cf1322" : "var(--shell-text-2)";
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "Consolas,monospace", fontSize: 12 }}>{r.booking_no || "—"}</td>
                    <td>{r.carrier || "—"}</td>
                    <td>{r.vessel || "—"}{r.voyage ? ` / ${r.voyage}` : ""}</td>
                    <td>{r.pol || "—"}</td>
                    <td>{r.pod || "—"}</td>
                    <td>{r.container_size || ""}{r.container_type || ""}</td>
                    <td style={{ textAlign: "right" }}><b>{r.total_qty || 0}</b></td>
                    <td>{fmtDate(r.etd)}</td>
                    <td style={{ color: daysColor, fontSize: 12 }}>
                      {daysToEtd == null ? "—" : daysToEtd < 0 ? `过 ${-daysToEtd}天` : daysToEtd === 0 ? "今天" : `${daysToEtd}天后`}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDateTime(r.si_cutoff)}</td>
                    <td style={{ fontFamily: "Consolas,monospace", fontSize: 12 }}>{r.mbl_no || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", fontSize: 11, borderRadius: 99,
                        background: sc.bg, color: sc.fg, border: `1px solid ${sc.bd}`,
                      }}>{r.status || "可售"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
