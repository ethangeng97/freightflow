// Supplier — 电放申请
//   - 选订单 + 填提单号 + 上传电放保函 + 备注
//   - 文件存 Supabase Storage `vouchers` bucket, 路径: {cust_id}/telex-{shipment_id}/...
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const SUPABASE_URL = "https://pewdvheoaqofmzwhwwvu.supabase.co";

const STATUS_KEY = { pending: "Reviewing", approved: "Telex Approved", rejected: "Rejected" };

export default function TelexRelease({ user }) {
  const customerId = user?.profile?.customer_id;
  const [shipments, setShipments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ shipment_id: "", bl_no: "", reason: "" });
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    if (!customerId) { setLoading(false); return; }
    const [s, r] = await Promise.all([
      supabase.from("shipments").select("id, order_no, po, pol, pod, etd, telex_release, booking_no, container_no")
        .order("created_at", { ascending: false }).limit(80),
      supabase.from("telex_release_requests").select("*")
        .eq("customer_id", customerId).order("created_at", { ascending: false }),
    ]);
    setShipments(s.data || []);
    setRows(r.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  // 选择订单时，自动带出已有的 booking/container 作为提单号建议（如果有）
  const selectedShip = shipments.find(s => s.id === form.shipment_id);

  const ch = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.shipment_id) return setMsg({ type: "error", text: t("Please select an order") });
    if (!form.bl_no.trim()) return setMsg({ type: "error", text: t("B/L No required") });
    if (!file)              return setMsg({ type: "error", text: t("Guarantee file required") });

    setSubmitting(true); setMsg(null);

    // 1. 上传电放保函
    const path = `${customerId}/telex-${form.shipment_id}/${Date.now()}-${file.name}`;
    try {
      const fd = new FormData(); fd.append("file", file);
      const url = `${SUPABASE_URL}/storage/v1/object/vouchers/${path}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabase.auth.getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setSubmitting(false);
      return setMsg({ type: "error", text: t("Upload failed") + ": " + err.message });
    }

    // 2. 写入申请
    const { error } = await supabase.from("telex_release_requests").insert({
      customer_id: customerId,
      submitted_by: user.id,
      shipment_id: form.shipment_id,
      bl_no: form.bl_no.trim(),
      reason: form.reason,
      guarantee_file_url: path,
      guarantee_file_name: file.name,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      setMsg({ type: "error", text: t("Submission failed") + ": " + error.message });
    } else {
      setMsg({ type: "success", text: t("Submitted, awaiting review") });
      setForm({ shipment_id: "", bl_no: "", reason: "" });
      setFile(null);
      load();
    }
  };

  // 下载保函（signed URL）
  const downloadGuarantee = async (filePath) => {
    if (!filePath) return;
    try {
      const url = `${SUPABASE_URL}/storage/v1/object/sign/vouchers/${filePath}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabase.auth.getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 600 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(`${SUPABASE_URL}/storage/v1${data.signedURL || data.signedUrl}`, "_blank");
    } catch (err) {
      alert(t("Upload failed") + ": " + err.message);
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
            <select className="field-select" value={form.shipment_id} onChange={ch("shipment_id")}>
              <option value="">{t("Please select order...")}</option>
              {shipments.map(s => (
                <option key={s.id} value={s.id}>
                  {s.po || s.order_no || s.id.slice(0, 8)} — {s.pol}→{s.pod} {s.etd || ""}
                </option>
              ))}
            </select>
          </div>
          <Field label={t("B/L No")} req>
            <input className="field-input" value={form.bl_no} onChange={ch("bl_no")}
                   placeholder={selectedShip?.booking_no || "HBL/MBL..."} />
          </Field>
          <Field label={t("Telex Guarantee Letter")} req>
            <input className="field-input" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                   onChange={e => setFile(e.target.files?.[0] || null)} />
          </Field>
        </div>

        <div className="field">
          <label className="field-label">{t("Reason")}</label>
          <textarea className="field-textarea" value={form.reason} onChange={ch("reason")}
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
                <th>{t("B/L No")}</th>
                <th>{t("Telex Guarantee Letter")}</th>
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
                    <td>{s ? (s.po || s.order_no || s.id.slice(0, 8)) : r.shipment_id.slice(0, 8)}</td>
                    <td style={{ fontFamily: "monospace" }}>{r.bl_no || "—"}</td>
                    <td>
                      {r.guarantee_file_url ? (
                        <button onClick={() => downloadGuarantee(r.guarantee_file_url)}
                                style={{ border: "none", background: "none", color: "var(--shell-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          📎 {r.guarantee_file_name || t("Download")}
                        </button>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason || "—"}</td>
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

function Field({ label, req, children }) {
  return (
    <div className="field">
      <label className="field-label">
        {label}{req && <span className="req">*</span>}
      </label>
      {children}
    </div>
  );
}
