// Supplier — 销账记录（只读）
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

export default function SupplierSettlements({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase.from("payment_vouchers")
        .select("*").eq("customer_id", customerId).eq("status", "confirmed")
        .order("reviewed_at", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [customerId]);

  return (
    <>
      <h1 className="page-title">{t("Settlements")}</h1>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : rows.length === 0 ? <div className="empty-state empty-text">{t("No settlements")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Settled Date")}</th>
                <th>{t("Paid date")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Currency")}</th>
                <th>{t("Related Bill")}</th>
                <th>{t("Settled By")}</th>
                <th>{t("Note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.reviewed_at?.slice(0, 10) || "—"}</td>
                  <td>{r.paid_at || "—"}</td>
                  <td>{Number(r.amount || 0).toLocaleString()}</td>
                  <td>{r.currency}</td>
                  <td>{r.bill_id ? String(r.bill_id).slice(0, 8) : "—"}</td>
                  <td className="muted">{r.reviewed_by ? String(r.reviewed_by).slice(0, 8) : "—"}</td>
                  <td className="muted">{r.review_note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
