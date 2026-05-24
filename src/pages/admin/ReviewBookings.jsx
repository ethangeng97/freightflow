// Ops 审核：订舱申请
//   approve → 在 shipments 表创建新 row + booking_requests.status=approved + 回写 shipment_id
//   reject  → 弹窗填审核备注 + booking_requests.status=rejected
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";

const STATUS_KEY = { pending: "Reviewing", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" };
const STATUS_FILTERS = [
  { k: "pending",  l: "Reviewing" },
  { k: "approved", l: "Approved" },
  { k: "rejected", l: "Rejected" },
  { k: "all",      l: "Status" },
];

export default function ReviewBookings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [customers, setCustomers] = useState({});  // id → {name, name_short}
  const [expanded, setExpanded] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    const [reqRes, cusRes] = await Promise.all([
      supabase.from("booking_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("customers").select("id,name,name_short"),
    ]);
    setRows(reqRes.data || []);
    setCustomers(Object.fromEntries((cusRes.data || []).map(c => [c.id, c])));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => r.status === filter);
  }, [rows, filter]);

  const approve = async (req) => {
    if (!confirm(t("Confirm approve and create shipment?"))) return;
    setWorking(true); setMsg(null);
    const customer = customers[req.customer_id];
    const cArr = req.container_qty && req.container_type ? `${req.container_qty}x${req.container_type}` : null;

    // Build shipments payload — preserve all useful booking fields
    const shipmentPayload = {
      po: req.po || null,
      customer: customer?.name || null,
      pol: req.pol || null,
      pod: req.pod || null,
      etd: req.etd || null,
      carrier: req.carrier || null,
      qty_packages: req.qty_packages || null,
      weight: req.gross_weight || null,
      volume: req.volume_cbm || null,
      tuc: req.en_name || req.cn_name || null,
      qty_container: cArr,
      incoterms: "FOB",
      qc_status: "Under Review",
      space_status: "Wait Info",
      local_payment: "Waiting",
      telex_release: "Pending",
      bl_status: "Not Ready",
    };

    const { data: created, error: cErr } = await supabase.from("shipments").insert(shipmentPayload).select("id").single();
    if (cErr || !created) {
      setWorking(false);
      return setMsg({ type: "error", text: t("Shipment create failed") + ": " + (cErr?.message || "unknown") });
    }

    const { error: uErr } = await supabase.from("booking_requests").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      shipment_id: created.id,
    }).eq("id", req.id);
    setWorking(false);
    if (uErr) {
      setMsg({ type: "error", text: t("Status update failed") + ": " + uErr.message });
    } else {
      setMsg({ type: "success", text: t("Approved, shipment created") });
      load();
    }
  };

  const doReject = async (note) => {
    if (!rejectFor) return;
    setWorking(true); setMsg(null);
    const { error } = await supabase.from("booking_requests").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    }).eq("id", rejectFor.id);
    setWorking(false);
    setRejectFor(null);
    if (error) setMsg({ type: "error", text: t("Status update failed") + ": " + error.message });
    else {
      setMsg({ type: "success", text: t("Rejected") });
      load();
    }
  };

  return (
    <>
      <h1 className="page-title">{t("Booking Requests Review")}</h1>

      {msg && (
        <div className="page-card" style={{
          marginBottom: 14,
          background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
          borderColor:  msg.type === "error" ? "#fca5a5" : "#86efac",
          color:        msg.type === "error" ? "#991b1b" : "#166534",
        }}>{msg.text}</div>
      )}

      <div className="page-section-bar">
        <select className="field-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 140 }}>
          {STATUS_FILTERS.map(s => <option key={s.k} value={s.k}>{t(s.l)}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--shell-text-3)", fontSize: 12 }}>
          {filtered.length} {t("items")}
        </span>
      </div>

      <div className="page-card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state empty-text">{t("Loading...")}</div>
         : filtered.length === 0 ? <div className="empty-state empty-text">{t("No booking requests")}</div>
         : (
          <table className="tms-table">
            <thead>
              <tr>
                <th>{t("Submitted at")}</th>
                <th>{t("Customer")}</th>
                <th>PO#</th>
                <th>{t("POL → POD")}</th>
                <th>{t("Cargo Ready Date")}</th>
                <th>ETD</th>
                <th>{t("Container × Qty")}</th>
                <th>{t("Status")}</th>
                <th style={{ width: 200 }}>{t("Action")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const cus = customers[r.customer_id];
                const isOpen = expanded === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr onClick={() => setExpanded(isOpen ? null : r.id)} style={{ cursor: "pointer" }}>
                      <td>{r.created_at?.slice(0, 16).replace("T", " ")}</td>
                      <td>{cus?.name_short || cus?.name || r.customer_id?.slice(0, 8)}</td>
                      <td style={{ fontFamily: "monospace", color: "var(--shell-primary)" }}>{r.po || "—"}</td>
                      <td>{r.pol || "—"} → {r.pod || "—"}</td>
                      <td>{r.cargo_ready_date || "—"}</td>
                      <td>{r.etd || "—"}</td>
                      <td>{r.container_type ? `${r.container_type} × ${r.container_qty || 1}` : "—"}</td>
                      <td><span className={"badge " + (r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending")}>
                        {t(STATUS_KEY[r.status] || r.status)}
                      </span></td>
                      <td onClick={e => e.stopPropagation()}>
                        {r.status === "pending" && (
                          <>
                            <button className="btn primary" style={{ padding: "2px 10px", fontSize: 12, marginRight: 4 }}
                                    onClick={() => approve(r)} disabled={working}>
                              {t("Approve")}
                            </button>
                            <button className="btn danger" style={{ padding: "2px 10px", fontSize: 12 }}
                                    onClick={() => setRejectFor(r)} disabled={working}>
                              {t("Reject")}
                            </button>
                          </>
                        )}
                        {r.status === "approved" && r.shipment_id && (
                          <a href={`#/shipments`} style={{ fontSize: 12, color: "var(--shell-primary)" }}>
                            → {t("View Shipment")}
                          </a>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ background: "var(--shell-bg)", padding: 14 }}>
                          <BookingDetail req={r} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {rejectFor && <RejectModal req={rejectFor} onCancel={() => setRejectFor(null)} onConfirm={doReject} working={working} />}
    </>
  );
}

function BookingDetail({ req }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontSize: 12 }}>
      <Section title={t("Schedule Info")}>
        <Row label="PO" value={req.po} />
        <Row label="POL" value={req.pol} />
        <Row label="POD" value={req.pod} />
        <Row label={t("Cargo Ready Date")} value={req.cargo_ready_date} />
        <Row label="ETD" value={req.etd} />
        <Row label={t("Carrier")} value={req.carrier} />
      </Section>
      <Section title={t("Container & Cargo")}>
        <Row label={t("Trade Type")} value={req.trade_type} />
        <Row label={t("Container")} value={req.container_type && `${req.container_qty || 1} × ${req.container_type}`} />
        <Row label={t("Packages")} value={req.qty_packages && `${req.qty_packages} ${req.packing_unit || ""}`} />
        <Row label={t("Gross Weight KGS")} value={req.gross_weight} />
        <Row label={t("Volume CBM")} value={req.volume_cbm} />
        <Row label={t("HS Code")} value={req.hs_code} />
        <Row label={t("Product Name (CN)")} value={req.cn_name} />
        <Row label={t("Product Name (EN)")} value={req.en_name} />
        <Row label={t("Shipping Marks")} value={req.marks} multi />
      </Section>
      <Section title={t("Parties Info")}>
        <Row label={t("Shipper")} value={req.shipper} multi />
        <Row label={t("Consignee")} value={req.consignee} multi />
        <Row label={t("Notify Party")} value={req.notify_party} multi />
        <Row label={t("Remarks")} value={req.remarks} multi />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="page-card" style={{ margin: 0 }}>
      <div className="card-title" style={{ fontSize: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, multi }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: "var(--shell-text-3)" }}>{label}</div>
      <div style={{ fontSize: 12, color: value ? "var(--shell-text)" : "var(--shell-text-3)", whiteSpace: multi ? "pre-wrap" : "normal" }}>
        {value || "—"}
      </div>
    </div>
  );
}

function RejectModal({ req, onCancel, onConfirm, working }) {
  const [note, setNote] = useState("");
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: "90vw", background: "#fff", borderRadius: 6,
        boxShadow: "0 10px 30px rgba(0,0,0,.2)",
      }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--shell-border)", fontSize: 14, fontWeight: 600 }}>
          {t("Reject Booking")} — {req.po || req.id.slice(0, 8)}
        </div>
        <div style={{ padding: 16 }}>
          <label className="field-label">{t("Review Note")}</label>
          <textarea className="field-textarea" value={note} onChange={e => setNote(e.target.value)}
                    placeholder={t("Reason placeholder")} autoFocus rows={4} />
        </div>
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--shell-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel} disabled={working}>{t("Cancel")}</button>
          <button className="btn danger" onClick={() => onConfirm(note)} disabled={working}>
            {working ? t("Submitting...") : t("Confirm Reject")}
          </button>
        </div>
      </div>
    </div>
  );
}
