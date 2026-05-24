// Supplier 工作台 — quick stats + recent activity
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

export default function SupplierHome({ user }) {
  const customerId = user?.profile?.customer_id;
  const customerName = user?.profile?.customer_name || user?.profile?.name || t("Factory User");

  const [stats, setStats] = useState({
    bookingPending: 0,
    billsUnpaid: 0,
    invoicesPending: 0,
    telexEligible: 0,
  });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const [bookings, shipments] = await Promise.all([
        supabase.from("booking_requests").select("id,status").eq("customer_id", customerId),
        supabase.from("shipments")
          .select("id, order_no, pol, pod, etd, qc_status, local_payment, telex_release, bl_status, created_at")
          .order("created_at", { ascending: false }).limit(8),
      ]);
      const b = bookings.data || [];
      const s = shipments.data || [];
      setStats({
        bookingPending:  b.filter(x => x.status === "pending").length,
        billsUnpaid:     s.filter(x => x.local_payment === "Waiting").length,
        invoicesPending: 0,
        telexEligible:   s.filter(x => x.telex_release === "Pending").length,
      });
      setRecent(s);
      setLoading(false);
    })();
  }, [customerId]);

  const open = (key) => { window.location.hash = `#/${key}`; };

  return (
    <>
      <h1 className="page-title">{t("Hello")}，{customerName}</h1>

      <div className="stat-grid">
        <StatCard label={t("Pending Bookings")} value={stats.bookingPending}
                  color="purple" onClick={() => open("supplier-bookings")} />
        <StatCard label={t("Unpaid Bills")}     value={stats.billsUnpaid}
                  color="red"    onClick={() => open("supplier-bills")} />
        <StatCard label={t("Pending Invoices")} value={stats.invoicesPending}
                  color="amber"  onClick={() => open("supplier-invoices")} />
        <StatCard label={t("Telex Eligible")}   value={stats.telexEligible}
                  color="green"  onClick={() => open("supplier-telex")} />
      </div>

      <div className="page-card">
        <div className="card-title">{t("Recent Orders")}</div>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : recent.length === 0 ? <div className="empty-state empty-text">{t("No orders")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Order No")}</th>
                <th>{t("POL → POD")}</th>
                <th>ETD</th>
                <th>{t("B/L Status")}</th>
                <th>{t("Payment")}</th>
                <th>{t("Telex Status")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace" }}>{r.order_no || "—"}</td>
                  <td>{r.pol || "—"} → {r.pod || "—"}</td>
                  <td>{r.etd ? String(r.etd).slice(0, 10) : "—"}</td>
                  <td><Badge value={r.bl_status} /></td>
                  <td><Badge value={r.local_payment} /></td>
                  <td><Badge value={r.telex_release} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, color, onClick }) {
  return (
    <div className={"stat-card " + (color || "")} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Badge({ value }) {
  if (!value) return <span className="muted">—</span>;
  const lower = String(value).toLowerCase();
  let cls = "badge";
  if (lower.includes("pend") || lower.includes("wait")) cls += " pending";
  else if (lower.includes("done") || lower.includes("approv") || lower.includes("paid")) cls += " approved";
  else if (lower.includes("reject")) cls += " rejected";
  else cls += " info";
  return <span className={cls}>{t(value)}</span>;
}
