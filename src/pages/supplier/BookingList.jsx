// Supplier 订舱申请列表
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const STATUS_KEY = {
  pending:   "Reviewing",
  approved:  "Approved",
  rejected:  "Rejected",
  withdrawn: "Withdrawn",
};

export default function BookingList({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase.from("booking_requests")
        .select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [customerId]);

  const withdraw = async (id) => {
    if (!confirm(t("Confirm withdraw this booking?"))) return;
    await supabase.from("booking_requests").update({ status: "withdrawn" }).eq("id", id);
    setRows(rs => rs.map(r => r.id === id ? { ...r, status: "withdrawn" } : r));
  };

  return (
    <>
      <h1 className="page-title">{t("Booking Requests")}</h1>

      <div style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => window.location.hash = "#/supplier-new-booking"}>
          + {t("New Booking")}
        </button>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : rows.length === 0 ? <div className="empty-state empty-text">{t("No booking requests")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Submitted at")}</th>
                <th>{t("POL → POD")}</th>
                <th>ETD</th>
                <th>{t("Carrier name")}</th>
                <th>{t("Container × Qty")}</th>
                <th>{t("Status")}</th>
                <th>{t("Review Note")}</th>
                <th>{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.created_at ? r.created_at.slice(0, 10) : "—"}</td>
                  <td>{r.pol || "—"} → {r.pod || "—"}</td>
                  <td>{r.etd ? r.etd.slice(0, 10) : "—"}</td>
                  <td>{r.carrier || "—"}</td>
                  <td>{r.container_type ? `${r.container_type} × ${r.container_qty || 1}` : "—"}</td>
                  <td><span className={"badge " + (r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending")}>
                    {t(STATUS_KEY[r.status] || r.status)}
                  </span></td>
                  <td className="muted">{r.review_note || "—"}</td>
                  <td>
                    {r.status === "pending" && (
                      <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => withdraw(r.id)}>{t("Withdraw")}</button>
                    )}
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
