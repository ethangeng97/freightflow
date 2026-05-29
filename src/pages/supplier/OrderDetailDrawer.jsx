// Supplier 订单详情抽屉 —— 从右侧滑入，含 4 个 tab
//   概览 / 单证 / 进度 / 记录
// 单证文件存 Supabase Storage `vouchers` bucket, 路径: {customer_id}/shipment-{shipment_id}/{timestamp}-{name}
import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import { t } from "../../lib/i18n.js";
import BLOriginal from "../docs/BLOriginal.jsx";
import ShipmentAttachments from "../../components/ShipmentAttachments.jsx";

const SUPABASE_URL = "https://pewdvheoaqofmzwhwwvu.supabase.co";

const DOC_TYPES = [
  { v: "BL",   l: "B/L" },
  { v: "CI",   l: "Commercial Invoice" },
  { v: "PL",   l: "Packing List" },
  { v: "COO",  l: "Certificate of Origin" },
  { v: "MSDS", l: "MSDS" },
  { v: "FCR",  l: "FCR" },
  { v: "OTHER",l: "Other Document" },
];

export default function OrderDetailDrawer({ shipment, customerId, user, onClose }) {
  const [tab, setTab] = useState("overview");
  const [showOriginalBL, setShowOriginalBL] = useState(false);
  if (!shipment) return null;

  // 提单正本：整页打印件，盖在抽屉之上的全屏 overlay
  if (showOriginalBL) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#f0f0f0", overflowY: "auto" }}>
        <BLOriginal shipmentId={shipment.id} onBack={() => setShowOriginalBL(false)} />
      </div>
    );
  }

  return (
    <>
      {/* 半透明蒙层 */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 999,
      }} />
      {/* 右侧抽屉 */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(560px, 90vw)",
        background: "#fff", zIndex: 1000,
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 16px rgba(0,0,0,.1)",
        animation: "slideIn .15s ease",
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>

        {/* 头部 */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid var(--shell-border)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--shell-text-3)", marginBottom: 2 }}>
              {t("Order")} · {t(shipment.qc_status || "—")}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "monospace", color: "var(--shell-text)" }}>
              {shipment.po || shipment.order_no || shipment.id.slice(0, 8)}
            </div>
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 18, color: "var(--shell-text-3)", padding: 4,
          }}>✕</button>
        </div>

        {/* Tab 条 */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--shell-border)", padding: "0 8px" }}>
          {[
            { k: "overview",  l: t("Overview") },
            { k: "documents", l: t("Documents") },
            { k: "progress",  l: t("Progress") },
            { k: "records",   l: t("Records") },
          ].map(o => {
            const active = tab === o.k;
            return (
              <button key={o.k} onClick={() => setTab(o.k)} style={{
                padding: "10px 14px", border: "none", background: "transparent",
                cursor: "pointer", fontSize: 13,
                color: active ? "var(--shell-primary)" : "var(--shell-text-2)",
                fontWeight: active ? 600 : 400,
                borderBottom: active ? "2px solid var(--shell-primary)" : "2px solid transparent",
                marginBottom: -1,
              }}>{o.l}</button>
            );
          })}
        </div>

        {/* Tab 内容 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {tab === "overview"  && <OverviewTab shipment={shipment} />}
          {tab === "documents" && <DocumentsTab shipment={shipment} customerId={customerId} user={user} onViewOriginalBL={() => setShowOriginalBL(true)} />}
          {tab === "progress"  && <ProgressTab shipment={shipment} />}
          {tab === "records"   && <RecordsTab shipment={shipment} />}
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────
function OverviewTab({ shipment: s }) {
  return (
    <div>
      <Section title={t("Schedule Info")}>
        <Row label="PO" value={s.po} />
        <Row label="Customer PO" value={s.customer_po} />
        <Row label="POL → POD" value={s.pol && s.pod ? `${s.pol} → ${s.pod}` : null} />
        <Row label="ETD" value={s.etd?.slice(0, 10)} />
        <Row label="ETA" value={s.eta?.slice(0, 10)} />
        <Row label={t("Vessel")} value={s.vessel} />
        <Row label={t("Carrier")} value={s.carrier} />
        <Row label={t("Booking No")} value={s.booking_no} mono />
        <Row label={t("Container No")} value={s.container_no} mono />
      </Section>
      <Section title={t("Status")}>
        <Row label={t("QC Status")}     value={s.qc_status ? t(s.qc_status) : null} />
        <Row label={t("Space Status")}  value={s.space_status ? t(s.space_status) : null} />
        <Row label={t("Payment")}       value={s.local_payment ? t(s.local_payment) : null} />
        <Row label={t("B/L Status")}    value={s.bl_status ? t(s.bl_status) : null} />
        <Row label={t("Telex Status")}  value={s.telex_release ? t(s.telex_release) : null} />
      </Section>
    </div>
  );
}

// ────────────────────────────────────────
function DocumentsTab({ shipment, customerId, user, onViewOriginalBL }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("BL");
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("shipment_documents")
      .select("*").eq("shipment_id", shipment.id).order("uploaded_at", { ascending: false });
    setDocs(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [shipment.id]);

  const upload = async () => {
    if (!file) return setMsg({ type: "error", text: t("Amount and file are required") });
    if (!customerId) return setMsg({ type: "error", text: t("Account not linked") });
    setUploading(true); setMsg(null);

    const path = `${customerId}/shipment-${shipment.id}/${Date.now()}-${file.name}`;
    const fd = new FormData(); fd.append("file", file);
    try {
      const url = `${SUPABASE_URL}/storage/v1/object/vouchers/${path}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabase.auth.getToken()}` },
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setUploading(false);
      return setMsg({ type: "error", text: t("Upload failed") + ": " + err.message });
    }

    const { error } = await supabase.from("shipment_documents").insert({
      shipment_id: shipment.id,
      customer_id: customerId,
      doc_type: docType,
      file_url: path,
      file_name: file.name,
      note: note || null,
      uploaded_by: user.id,
    });
    setUploading(false);
    if (error) {
      setMsg({ type: "error", text: t("Record write failed") + ": " + error.message });
    } else {
      setMsg({ type: "success", text: t("Submitted, awaiting finance review") });
      setFile(null); setNote("");
      load();
    }
  };

  const downloadUrl = async (path) => {
    // 生成 signed url 给私有 bucket
    try {
      const url = `${SUPABASE_URL}/storage/v1/object/sign/vouchers/${path}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabase.auth.getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 600 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return `${SUPABASE_URL}/storage/v1${data.signedURL || data.signedUrl}`;
    } catch (err) {
      alert(t("Upload failed") + ": " + err.message);
      return null;
    }
  };

  const open = async (d) => {
    const url = await downloadUrl(d.file_url);
    if (url) window.open(url, "_blank");
  };

  const remove = async (d) => {
    if (!confirm(t("Confirm delete document?"))) return;
    await supabase.from("shipment_documents").delete().eq("id", d.id);
    load();
  };

  return (
    <div>
      <Section title={t("Original B/L")}>
        <button className="btn primary" onClick={onViewOriginalBL} style={{ width: "100%" }}>
          🖨 {t("View Original B/L")}
        </button>
      </Section>

      <Section title={t("Document Attachments")}>
        <ShipmentAttachments shipmentId={shipment.id} />
      </Section>

      <Section title={t("Upload Document")}>
        {msg && (
          <div style={{
            padding: 8, marginBottom: 10, borderRadius: 4, fontSize: 12,
            background: msg.type === "error" ? "#fef2f2" : "#f0fdf4",
            color:      msg.type === "error" ? "#991b1b" : "#166534",
          }}>{msg.text}</div>
        )}
        <div className="field">
          <label className="field-label">{t("Document Type")}</label>
          <select className="field-select" value={docType} onChange={e => setDocType(e.target.value)}>
            {DOC_TYPES.map(d => <option key={d.v} value={d.v}>{t(d.l)}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t("File")}</label>
          <input className="field-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                 onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="field">
          <label className="field-label">{t("Note")}</label>
          <input className="field-input" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <button className="btn primary" onClick={upload} disabled={uploading || !file}>
          {uploading ? t("Uploading...") : t("Upload")}
        </button>
      </Section>

      <Section title={t("Documents")}>
        {loading ? <div className="empty-state empty-text" style={{ padding: "10px 0" }}>{t("Loading...")}</div>
         : docs.length === 0 ? <div className="empty-state empty-text" style={{ padding: "10px 0" }}>{t("No documents")}</div>
         : docs.map(d => {
            const dt = DOC_TYPES.find(x => x.v === d.doc_type);
            return (
              <div key={d.id} style={{
                padding: "8px 10px", border: "1px solid var(--shell-border)",
                borderRadius: 4, marginBottom: 6,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span className="badge info" style={{ flexShrink: 0 }}>{dt ? t(dt.l) : d.doc_type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.file_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--shell-text-3)" }}>
                    {d.uploaded_at?.slice(0, 16).replace("T", " ")}
                    {d.note && ` · ${d.note}`}
                  </div>
                </div>
                <button onClick={() => open(d)} style={{ border: "none", background: "none", color: "var(--shell-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {t("Download")}
                </button>
                <button onClick={() => remove(d)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {t("Delete")}
                </button>
              </div>
            );
          })
        }
      </Section>
    </div>
  );
}

// ────────────────────────────────────────
function ProgressTab({ shipment: s }) {
  // 简单的节点时间线，按订单生命周期推进
  const steps = [
    { k: "qc",      l: t("QC Status"),     status: s.qc_status,     done: s.qc_status === "QC Approved" },
    { k: "space",   l: t("Space Status"),  status: s.space_status,  done: ["Booked","Released"].includes(s.space_status) },
    { k: "pay",     l: t("Payment"),       status: s.local_payment, done: s.local_payment === "Paid" },
    { k: "bl",      l: t("B/L Status"),    status: s.bl_status,     done: s.bl_status === "Done" },
    { k: "telex",   l: t("Telex Status"),  status: s.telex_release, done: s.telex_release === "Released" },
  ];
  return (
    <div>
      {steps.map((st, i) => (
        <div key={st.k} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: st.done ? "var(--shell-primary)" : "var(--shell-bg)",
              border: "2px solid " + (st.done ? "var(--shell-primary)" : "var(--shell-border)"),
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 12, fontWeight: 700,
            }}>
              {st.done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 2, flex: 1, background: "var(--shell-border)", minHeight: 16 }} />
            )}
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{st.l}</div>
            <div style={{ fontSize: 12, color: st.done ? "var(--shell-primary)" : "var(--shell-text-3)" }}>
              {st.status ? t(st.status) : t("Not set")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────
function RecordsTab({ shipment }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("audit_logs")
        .select("*").eq("shipment_id", shipment.id)
        .order("created_at", { ascending: false }).limit(50);
      setLogs(data || []);
      setLoading(false);
    })();
  }, [shipment.id]);

  if (loading) return <div className="empty-state empty-text" style={{ padding: "20px 0" }}>{t("Loading...")}</div>;
  if (logs.length === 0) return <div className="empty-state empty-text" style={{ padding: "20px 0" }}>{t("No data")}</div>;

  return (
    <div>
      {logs.map(log => (
        <div key={log.id} style={{
          padding: "8px 0", borderBottom: "1px solid var(--shell-border-2)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--shell-text-3)", marginBottom: 2 }}>
            <span>{log.user_email}</span>
            <span style={{ fontFamily: "monospace" }}>{new Date(log.created_at).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 500 }}>{log.field_name}</span>
            {log.old_value && (
              <span style={{ color: "#ef4444", textDecoration: "line-through", margin: "0 6px" }}>{log.old_value}</span>
            )}
            <span style={{ color: "#10b981" }}>→ {log.new_value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 12, fontWeight: 600, color: "var(--shell-text-2)",
        marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--shell-border-2)",
      }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: "flex", marginBottom: 6, gap: 12, fontSize: 12 }}>
      <div style={{ width: 120, color: "var(--shell-text-3)", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, color: value ? "var(--shell-text)" : "var(--shell-text-3)", fontFamily: mono ? "monospace" : undefined }}>
        {value || "—"}
      </div>
    </div>
  );
}
