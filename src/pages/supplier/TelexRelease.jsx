// Supplier — 电放申请
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const STATUS_KEY = { pending: "Reviewing", approved: "Telex Approved", rejected: "Rejected" };

export default function TelexRelease({ user }) {
  const customerId = user?.profile?.customer_id;
  const [shipments, setShipments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ shipment_id: "", reason: "" });
  const [msg, setMsg] = useState(null);

  const load = async () => {
    if (!customerId) { setLoading(false); return; }
    const [s, r] = await Promise.all([
      supabase.from("shipments").select("id, order_no, pol, pod, etd, telex_release")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("telex_release_requests").select("*")
        .eq("customer_id", customerId).order("created_at", { ascending: false }),
    ]);
    setShipments(s.data || []);
    setRows(r.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const submit = async () => {
    if (!form.shipment_id) return setMsg({ type: "error", text: t("Please select an order") });
    setSubmitting(true); setMsg(null);
    const { error } = await supabase.from("telex_release_requests").insert({
      customer_id: customerId,
      submitted_by: user.id,
      shipment_id: form.shipment_id,
      reason: form.reason,
      status: "pending",
    });
    setSubmitting(false);
    if (error) setMsg({ type: "error", text: t("Submission failed") + ": " + error.message });
    else {
      setMsg({ type: "success", text: t("Submitted, awaiting review") });
      setForm({ shipment_id: "", reason: "" });
      load();
    }
  };

  return (
    <>
      <h1 className="page-title">{t("Telex Release Request")}</h1>

      <div className="page-card">
        <div className="card-title">{t("Submit New Request")}</div>
        {msg && (
          <div style={{
            padding: 8, marginBottom: 12, borderRadius: 4,
            background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
            color:      msg.type === "error" ? "#991b1b" : "#166534",
            fontSize: 13,
          }}>{msg.text}</div>
        )}
        <div className="field-row">
          <div className="field">
            <label className="field-label">{t("Order")}<span className="req">*</span></label>
            <select className="field-select" value={form.shipment_id}
                    onChange={e => setForm(f => ({ ...f, shipment_id: e.target.value }))}>
              <option value="">{t("Please select order...")}</option>
              {shipments.map(s => (
                <option key={s.id} value={s.id}>
                  {s.order_no || s.id.slice(0, 8)} — {s.pol}→{s.pod} {s.etd || ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">{t("Reason")}</label>
          <textarea className="field-textarea" value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder={t("Eg: consignee paid in full, please arrange telex release")} />
        </div>
        <button className="btn primary" onClick={submit} disabled={submitting}>
          {submitting ? t("Submitting...") : t("Submit Request")}
        </button>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        <div className="card-title" style={{ padding: "12px 16px 0" }}>{t("Request History")}</div>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : rows.length === 0 ? <div className="empty-state empty-text">{t("No requests")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Submitted at")}</th>
                <th>{t("Order")}</th>
                <th>{t("Reason")}</th>
                <th>{t("Status")}</th>
                <th>{t("Review Note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const s = shipments.find(x => x.id === r.shipment_id);
                return (
                  <tr key={r.id}>
                    <td>{r.created_at?.slice(0, 16).replace("T", " ") || "—"}</td>
                    <td>{s ? (s.order_no || s.id.slice(0, 8)) : r.shipment_id.slice(0, 8)}</td>
                    <td className="muted">{r.reason || "—"}</td>
                    <td><span className={"badge " + (r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending")}>
                      {t(STATUS_KEY[r.status] || r.status)}
                    </span></td>
                    <td className="muted">{r.review_note || "—"}</td>
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
