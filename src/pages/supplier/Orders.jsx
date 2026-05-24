// Supplier 订单列表 — 完整列表，可搜索/分页
// 数据来源：shipments 表（RLS 已限制 supplier 只能看自己的 customer_id）
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";
import OrderDetailDrawer from "./OrderDetailDrawer.jsx";

export default function SupplierOrders({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const pageSize = 20;

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase.from("shipments")
        .select("id, order_no, po, customer_po, pol, pod, etd, eta, vessel, carrier, booking_no, container_no, qc_status, space_status, local_payment, telex_release, bl_status, created_at")
        .order("created_at", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [customerId]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => [
      r.order_no, r.po, r.customer_po, r.pol, r.pod, r.vessel, r.carrier, r.booking_no, r.container_no,
    ].some(v => (v || "").toLowerCase().includes(q)));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <>
      <h1 className="page-title">{t("Order List")}</h1>

      <div className="page-section-bar">
        <input className="field-input" placeholder={t("Search PO / Customer / Supplier / Vessel...")}
               value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
               style={{ width: 280 }} />
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>
          {filtered.length} {t("items")}
        </span>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty-state empty-text">{t("Loading...")}</div>
        ) : paged.length === 0 ? (
          <div className="empty-state empty-text">{t("No shipments")}</div>
        ) : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>PO#</th>
                <th>{t("Booking No (col)")}</th>
                <th>{t("POL → POD")}</th>
                <th>ETD</th>
                <th>{t("Vessel (col)")}</th>
                <th>{t("Container No (col)")}</th>
                <th>{t("B/L Status")}</th>
                <th>{t("Payment")}</th>
                <th>{t("Telex Status")}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(r => (
                <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: "pointer" }}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--shell-primary)" }}>
                    {r.po || r.order_no || "—"}
                  </td>
                  <td style={{ fontFamily: "monospace" }}>{r.booking_no || "—"}</td>
                  <td>{r.pol || "—"} → {r.pod || "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.etd?.slice(0, 10) || "—"}</td>
                  <td>{r.vessel || "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.container_no || "—"}</td>
                  <td><Badge value={r.bl_status} /></td>
                  <td><Badge value={r.local_payment} /></td>
                  <td><Badge value={r.telex_release} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {filtered.length > pageSize && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 4, fontSize: 12 }}>
          <span style={{ color: "var(--shell-text-3)", marginRight: 8, lineHeight: "28px" }}>
            {page + 1} / {totalPages}
          </span>
          <button className="btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>⟨</button>
          <button className="btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>⟩</button>
        </div>
      )}

      {/* 详情抽屉 */}
      {selected && (
        <OrderDetailDrawer
          shipment={selected}
          customerId={customerId}
          user={user}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function Badge({ value }) {
  if (!value) return <span className="muted">—</span>;
  const lower = String(value).toLowerCase();
  let cls = "badge";
  if (lower.includes("pend") || lower.includes("wait")) cls += " pending";
  else if (lower.includes("done") || lower.includes("approv") || lower.includes("paid") || lower.includes("released")) cls += " approved";
  else if (lower.includes("reject")) cls += " rejected";
  else cls += " info";
  return <span className={cls}>{t(value)}</span>;
}
