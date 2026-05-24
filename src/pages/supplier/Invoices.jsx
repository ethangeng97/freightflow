// Supplier — 发票
// 数据来源：invoices 表 where partner_id = my customer_id
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

export default function SupplierInvoices({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase.from("invoices")
        .select("*").eq("partner_id", customerId)
        .order("invoice_date", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [customerId]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => [r.invoice_no, r.partner_name, r.notes].some(v => (v || "").toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <>
      <h1 className="page-title">{t("Invoices")}</h1>

      <div className="page-section-bar">
        <input className="field-input" placeholder={t("Search...")}
               value={search} onChange={e => setSearch(e.target.value)} style={{ width: 240 }} />
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>{filtered.length} {t("items")}</span>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : filtered.length === 0 ? <div className="empty-state empty-text">{t("No invoices")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Invoice No")}</th>
                <th>{t("Issued Date")}</th>
                <th>{t("Kind")}</th>
                <th>{t("Currency")}</th>
                <th style={{ textAlign: "right" }}>{t("Excl. Tax")}</th>
                <th style={{ textAlign: "right" }}>{t("Tax")}</th>
                <th style={{ textAlign: "right" }}>{t("Total")}</th>
                <th>{t("Note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 && filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--shell-primary)" }}>{r.invoice_no || "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.invoice_date || "—"}</td>
                  <td>{r.kind || "—"}</td>
                  <td>{r.currency || "—"}</td>
                  <td style={{ textAlign: "right" }}>{Number(r.amount_excl_tax || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right" }}>{Number(r.tax_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{Number(r.amount_total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="muted">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
