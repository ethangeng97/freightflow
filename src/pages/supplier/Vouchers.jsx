// Supplier — 付款水单上传 + 列表
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const STATUS_KEY = { pending: "Pending Review", confirmed: "Confirmed", rejected: "Rejected" };

export default function SupplierVouchers({ user }) {
  const customerId = user?.profile?.customer_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ amount: "", currency: "USD", paid_at: "", note: "" });
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    if (!customerId) { setLoading(false); return; }
    const { data } = await supabase.from("payment_vouchers").select("*")
      .eq("customer_id", customerId).order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [customerId]);

  const submit = async () => {
    if (!customerId) return setMsg({ type: "error", text: t("Account not linked") });
    if (!form.amount || !file) return setMsg({ type: "error", text: t("Amount and file are required") });
    setUploading(true); setMsg(null);

    const path = `${customerId}/${Date.now()}-${file.name}`;
    const fd = new FormData(); fd.append("file", file);
    try {
      const url = `${import.meta.env?.SUPABASE_URL || "https://pewdvheoaqofmzwhwwvu.supabase.co"}/storage/v1/object/vouchers/${path}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabase.auth.getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setUploading(false);
      return setMsg({ type: "error", text: t("File upload failed") + ": " + err.message });
    }

    const { error } = await supabase.from("payment_vouchers").insert({
      customer_id: customerId,
      submitted_by: user.id,
      amount: Number(form.amount),
      currency: form.currency,
      paid_at: form.paid_at || null,
      file_url: path,
      file_name: file.name,
      note: form.note,
      status: "pending",
    });
    setUploading(false);
    if (error) {
      setMsg({ type: "error", text: t("Record write failed") + ": " + error.message });
    } else {
      setMsg({ type: "success", text: t("Submitted, awaiting finance review") });
      setForm({ amount: "", currency: "USD", paid_at: "", note: "" }); setFile(null);
      load();
    }
  };

  return (
    <>
      <h1 className="page-title">{t("Payment Vouchers")}</h1>

      <div className="page-card">
        <div className="card-title">{t("Upload New Voucher")}</div>
        {msg && (
          <div style={{
            padding: 8, marginBottom: 12, borderRadius: 4,
            background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
            color:      msg.type === "error" ? "#991b1b" : "#166534",
            fontSize: 13,
          }}>{msg.text}</div>
        )}
        <div className="field-row">
          <Field label={t("Amount")}>
            <input className="field-input" type="number" step="0.01"
                   value={form.amount}
                   onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label={t("Currency")}>
            <select className="field-select" value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
              <option>USD</option><option>CNY</option><option>EUR</option>
            </select>
          </Field>
          <Field label={t("Paid date")}>
            <input className="field-input" type="date" value={form.paid_at}
                   onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
          </Field>
          <Field label={t("Voucher file (PDF/JPG)")}>
            <input className="field-input" type="file" accept=".pdf,.png,.jpg,.jpeg"
                   onChange={e => setFile(e.target.files?.[0] || null)} />
          </Field>
        </div>
        <Field label={t("Note")}>
          <textarea className="field-textarea" value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
        </Field>
        <button className="btn primary" onClick={submit} disabled={uploading}>
          {uploading ? t("Uploading...") : t("Submit")}
        </button>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        <div className="card-title" style={{ padding: "12px 16px 0" }}>{t("Voucher History")}</div>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : rows.length === 0 ? <div className="empty-state empty-text">{t("No vouchers")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Submitted at")}</th>
                <th>{t("Amount")}</th>
                <th>{t("Currency")}</th>
                <th>{t("Paid date")}</th>
                <th>{t("File")}</th>
                <th>{t("Status")}</th>
                <th>{t("Review Note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.created_at?.slice(0, 16).replace("T", " ") || "—"}</td>
                  <td>{Number(r.amount || 0).toLocaleString()}</td>
                  <td>{r.currency}</td>
                  <td>{r.paid_at || "—"}</td>
                  <td>{r.file_name || "—"}</td>
                  <td><span className={"badge " + (r.status === "confirmed" ? "approved" : r.status === "rejected" ? "rejected" : "pending")}>
                    {t(STATUS_KEY[r.status] || r.status)}
                  </span></td>
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

function Field({ label, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
