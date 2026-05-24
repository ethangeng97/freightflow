// Supplier 新建订舱 — submits to booking_requests table for ops review.
import { useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const PACKING_UNITS = [
  "CTNS", "PLTS", "PCS", "BAGS", "DRUMS", "BOXES", "BUNDLES",
  "CASES", "CRATES", "ROLLS", "SETS", "REELS", "COILS", "TUBES",
  "BARRELS", "KEGS", "SACKS", "BALES", "JARS", "BOTTLES", "CANS",
  "PKGS", "UNITS", "PALLET",
];

const INIT = {
  po: "",
  pol: "", pod: "", etd: "", cargo_ready_date: "",
  carrier: "",
  trade_type: "FCL", container_type: "40HQ", container_qty: 1,
  qty_packages: "", packing_unit: "CTNS",
  gross_weight: "", volume_cbm: "",
  hs_code: "", cn_name: "", en_name: "", marks: "",
  shipper: "", consignee: "", notify_party: "",
  remarks: "",
};

export default function BookingRequest({ user }) {
  const customerId = user?.profile?.customer_id;
  const [form, setForm] = useState(INIT);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const ch = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!customerId) {
      setMsg({ type: "error", text: t("Account not linked to a customer, contact admin") });
      return;
    }
    if (!form.pol || !form.pod) {
      setMsg({ type: "error", text: t("POL, POD and ETD are required") });
      return;
    }
    if (!form.cargo_ready_date) {
      setMsg({ type: "error", text: t("Cargo ready date required") });
      return;
    }
    setSaving(true); setMsg(null);
    const payload = {
      customer_id: customerId,
      submitted_by: user.id,
      status: "pending",
      ...form,
      etd: form.etd || null,
      container_qty: form.container_qty ? Number(form.container_qty) : null,
      qty_packages:  form.qty_packages  ? Number(form.qty_packages)  : null,
      gross_weight:  form.gross_weight  ? Number(form.gross_weight)  : null,
      volume_cbm:    form.volume_cbm    ? Number(form.volume_cbm)    : null,
    };
    const { error } = await supabase.from("booking_requests").insert(payload);
    setSaving(false);
    if (error) {
      setMsg({ type: "error", text: t("Submission failed") + ": " + error.message });
    } else {
      setMsg({ type: "success", text: t("Booking submitted, awaiting Bansar review") });
      setForm(INIT);
    }
  };

  return (
    <>
      <h1 className="page-title">{t("New Booking")}</h1>

      <div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={submit} disabled={saving}>
          {saving ? t("Submitting booking...") : t("Submit Booking")}
        </button>
        <button className="btn" onClick={() => setForm(INIT)} disabled={saving}>{t("Clear")}</button>
      </div>

      {msg && (
        <div className="page-card" style={{
          marginBottom: 14,
          background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
          borderColor:  msg.type === "error" ? "#fca5a5" : "#86efac",
          color:        msg.type === "error" ? "#991b1b" : "#166534",
        }}>
          {msg.text}
        </div>
      )}

      <div className="page-card">
        <div className="card-title">{t("Schedule Info")}</div>
        <div className="field-row">
          <Field label={t("PO No")}>
            <input className="field-input" value={form.po} onChange={ch("po")} placeholder="PO-123456" />
          </Field>
          <Field label={t("POL")} req>
            <input className="field-input" value={form.pol} onChange={ch("pol")} placeholder="NINGBO" />
          </Field>
          <Field label={t("POD")} req>
            <input className="field-input" value={form.pod} onChange={ch("pod")} placeholder="LOS ANGELES" />
          </Field>
          <Field label={t("Cargo Ready Date")} req>
            <input className="field-input" type="date" value={form.cargo_ready_date} onChange={ch("cargo_ready_date")} />
          </Field>
          <Field label={t("ETD (Sail date)")}>
            <input className="field-input" type="date" value={form.etd} onChange={ch("etd")} />
          </Field>
          <Field label={t("Carrier")}>
            <input className="field-input" value={form.carrier} onChange={ch("carrier")} placeholder="MSC / MSK ..." />
          </Field>
        </div>
      </div>

      <div className="page-card">
        <div className="card-title">{t("Container & Cargo")}</div>
        <div className="field-row">
          <Field label={t("Trade Type")}>
            <select className="field-select" value={form.trade_type} onChange={ch("trade_type")}>
              <option>FCL</option><option>LCL</option><option>Console</option>
            </select>
          </Field>
          <Field label={t("Container Type")}>
            <select className="field-select" value={form.container_type} onChange={ch("container_type")}>
              <option>20GP</option><option>40GP</option><option>40HQ</option><option>45HQ</option>
            </select>
          </Field>
          <Field label={t("Container Qty")}>
            <input className="field-input" type="number" min={1} value={form.container_qty} onChange={ch("container_qty")} />
          </Field>
          <Field label={t("Packages")}>
            <input className="field-input" type="number" value={form.qty_packages} onChange={ch("qty_packages")} />
          </Field>
          <Field label={t("Packing Unit")}>
            <select className="field-select" value={form.packing_unit} onChange={ch("packing_unit")}>
              {PACKING_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label={t("Gross Weight KGS")}>
            <input className="field-input" type="number" step="0.01" value={form.gross_weight} onChange={ch("gross_weight")} />
          </Field>
          <Field label={t("Volume CBM")}>
            <input className="field-input" type="number" step="0.001" value={form.volume_cbm} onChange={ch("volume_cbm")} />
          </Field>
          <Field label={t("HS Code")}>
            <input className="field-input" value={form.hs_code} onChange={ch("hs_code")} placeholder="6404.19" />
          </Field>
          <Field label={t("Product Name (CN)")}>
            <input className="field-input" value={form.cn_name} onChange={ch("cn_name")} />
          </Field>
          <Field label={t("Product Name (EN)")}>
            <input className="field-input" value={form.en_name} onChange={ch("en_name")} />
          </Field>
        </div>
        <Field label={t("Shipping Marks")}>
          <textarea className="field-textarea" value={form.marks} onChange={ch("marks")} />
        </Field>
      </div>

      <div className="page-card">
        <div className="card-title">{t("Parties Info")}</div>
        <div className="field-row">
          <Field label={t("Shipper")}>
            <textarea className="field-textarea" rows={4} value={form.shipper} onChange={ch("shipper")}
                      placeholder={t("Shipper placeholder")} />
          </Field>
          <Field label={t("Consignee")}>
            <textarea className="field-textarea" rows={4} value={form.consignee} onChange={ch("consignee")}
                      placeholder={t("Shipper placeholder")} />
          </Field>
          <Field label={t("Notify Party")}>
            <textarea className="field-textarea" rows={4} value={form.notify_party} onChange={ch("notify_party")}
                      placeholder={t("Shipper placeholder")} />
          </Field>
        </div>
        <Field label={t("Remarks")}>
          <textarea className="field-textarea" value={form.remarks} onChange={ch("remarks")} />
        </Field>
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
