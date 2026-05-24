// Supplier — FOB 账单查看（只读）
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

export default function SupplierBills({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const res = await supabase.from("bills").select("*")
        .eq("customer_id", customerId).order("created_at", { ascending: false });
      if (res.error) setError(res.error.message);
      setRows(res.data || []);
      setLoading(false);
    })();
  }, [customerId]);

  return (
    <>
      <h1 className="page-title">{t("FOB Bills")}</h1>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : error  ? <div className="empty-state empty-text">{t("Bills data not connected")}: {error}</div>
         : rows.length === 0 ? <div className="empty-state empty-text">{t("No bills")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Bill No")}</th>
                <th>{t("Related Order")}</th>
                <th>{t("Currency")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Status")}</th>
                <th>{t("Created Date")}</th>
                <th>{t("Paid Date")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace" }}>{r.bill_no || r.id.slice(0, 8)}</td>
                  <td>{r.shipment_no || r.shipment_id?.slice(0, 8) || "—"}</td>
                  <td>{r.currency || "USD"}</td>
                  <td>{r.total != null ? Number(r.total).toLocaleString() : "—"}</td>
                  <td><span className={"badge " + (r.status === "paid" ? "approved" : "pending")}>{t(r.status) || "—"}</span></td>
                  <td>{r.created_at?.slice(0, 10) || "—"}</td>
                  <td>{r.paid_at?.slice(0, 10) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
