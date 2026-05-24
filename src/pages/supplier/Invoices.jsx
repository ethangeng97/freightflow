// Supplier — 发票查看（只读）
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

export default function SupplierInvoices({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const res = await supabase.from("invoices").select("*")
        .eq("customer_id", customerId).order("created_at", { ascending: false });
      if (res.error) setError(res.error.message);
      setRows(res.data || []);
      setLoading(false);
    })();
  }, [customerId]);

  return (
    <>
      <h1 className="page-title">{t("Invoices")}</h1>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : error  ? <div className="empty-state empty-text">{t("Invoices data not connected")}: {error}</div>
         : rows.length === 0 ? <div className="empty-state empty-text">{t("No invoices")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Invoice No")}</th>
                <th>{t("Title")}</th>
                <th>{t("Currency")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Issued Date")}</th>
                <th>{t("Download")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace" }}>{r.invoice_no || r.id.slice(0, 8)}</td>
                  <td>{r.title || "—"}</td>
                  <td>{r.currency || "USD"}</td>
                  <td>{r.total != null ? Number(r.total).toLocaleString() : "—"}</td>
                  <td>{r.issued_at?.slice(0, 10) || r.created_at?.slice(0, 10) || "—"}</td>
                  <td>
                    {r.pdf_url
                      ? <a href={r.pdf_url} target="_blank" rel="noreferrer" style={{ color: "var(--shell-primary)" }}>{t("Download")}</a>
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
