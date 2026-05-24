// Supplier — FOB 账单
// 数据来源：charges 表（应收方向 + partner_id = 自己绑定的 customer_id）
// 按订单（shipment_id）汇总展示，每张"账单" = 该订单下所有未结清应收明细
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

export default function SupplierBills({ user }) {
  const customerId = user?.profile?.customer_id;
  const [charges, setCharges] = useState([]);
  const [shipments, setShipments] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("unpaid"); // unpaid / paid / all
  const [openShipment, setOpenShipment] = useState(null);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const [chRes, shRes] = await Promise.all([
        supabase.from("charges")
          .select("*").eq("partner_id", customerId).eq("direction", "应收")
          .order("created_at", { ascending: false }),
        supabase.from("shipments")
          .select("id, po, order_no, pol, pod, etd, vessel, booking_no, container_no"),
      ]);
      setCharges(chRes.data || []);
      setShipments(Object.fromEntries((shRes.data || []).map(s => [s.id, s])));
      setLoading(false);
    })();
  }, [customerId]);

  // 按 shipment 分组聚合
  const grouped = useMemo(() => {
    const m = {};
    for (const c of charges) {
      const k = c.shipment_id || "__no_ship__";
      if (!m[k]) m[k] = { shipment_id: c.shipment_id, items: [], total: {}, totalCny: 0, paidCount: 0 };
      m[k].items.push(c);
      const cur = c.currency || "USD";
      m[k].total[cur] = (m[k].total[cur] || 0) + Number(c.amount_total || 0);
      m[k].totalCny += Number(c.amount_cny || 0);
      if (c.payment_date) m[k].paidCount += 1;
    }
    return Object.values(m).sort((a, b) => {
      const sa = shipments[a.shipment_id], sb = shipments[b.shipment_id];
      const da = sa?.etd || "0", db = sb?.etd || "0";
      return db.localeCompare(da);
    });
  }, [charges, shipments]);

  const filtered = useMemo(() => {
    if (filter === "all") return grouped;
    return grouped.filter(g => {
      const allPaid = g.paidCount === g.items.length;
      return filter === "paid" ? allPaid : !allPaid;
    });
  }, [grouped, filter]);

  return (
    <>
      <h1 className="page-title">{t("FOB Bills")}</h1>

      <div className="page-section-bar">
        <select className="field-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 140 }}>
          <option value="unpaid">{t("Unpaid")}</option>
          <option value="paid">{t("Paid")}</option>
          <option value="all">{t("All")}</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>
          {filtered.length} {t("bills")}
        </span>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : filtered.length === 0 ? <div className="empty-state empty-text">{t("No bills")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Related Order")}</th>
                <th>POL → POD</th>
                <th>ETD</th>
                <th>{t("Items")}</th>
                <th>{t("Total")}</th>
                <th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => {
                const s = shipments[g.shipment_id];
                const allPaid = g.paidCount === g.items.length;
                const partial = g.paidCount > 0 && !allPaid;
                const isOpen = openShipment === g.shipment_id;
                return (
                  <React.Fragment key={g.shipment_id || "__"}>
                    <tr onClick={() => setOpenShipment(isOpen ? null : g.shipment_id)} style={{ cursor: "pointer" }}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--shell-primary)" }}>
                        {s?.po || s?.order_no || "—"}
                      </td>
                      <td>{s ? `${s.pol || "—"} → ${s.pod || "—"}` : "—"}</td>
                      <td style={{ fontFamily: "monospace" }}>{s?.etd?.slice(0, 10) || "—"}</td>
                      <td>{g.items.length} {t("items")}</td>
                      <td style={{ fontWeight: 600 }}>
                        {Object.entries(g.total).map(([cur, v]) => (
                          <div key={cur}>{cur} {Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        ))}
                      </td>
                      <td>
                        <span className={"badge " + (allPaid ? "approved" : partial ? "info" : "pending")}>
                          {allPaid ? t("Paid") : partial ? `${g.paidCount}/${g.items.length} ${t("paid")}` : t("Unpaid")}
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--shell-bg)", padding: 14 }}>
                          <ChargesDetail items={g.items} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

import React from "react";

function ChargesDetail({ items }) {
  return (
    <table className="tms-table" style={{ background: "#fff" }}>
      <thead>
        <tr>
          <th>{t("Description")}</th>
          <th>{t("Currency")}</th>
          <th style={{ textAlign: "right" }}>{t("Qty")}</th>
          <th style={{ textAlign: "right" }}>{t("Unit Price")}</th>
          <th style={{ textAlign: "right" }}>{t("Amount")}</th>
          <th>{t("Invoice No")}</th>
          <th>{t("Paid Date")}</th>
          <th>{t("Remarks")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map(it => (
          <tr key={it.id}>
            <td>{it.unit || it.charge_item_id || "—"}</td>
            <td>{it.currency || "—"}</td>
            <td style={{ textAlign: "right" }}>{Number(it.quantity || 0)}</td>
            <td style={{ textAlign: "right" }}>{Number(it.unit_price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(it.amount_total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td className="muted">{it.invoice_no || "—"}</td>
            <td>{it.payment_date || <span className="muted">—</span>}</td>
            <td className="muted">{it.remark || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
