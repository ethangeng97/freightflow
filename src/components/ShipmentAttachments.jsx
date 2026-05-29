// ShipmentAttachments — 只读列出 OPS 上传的作业附件（提单正本 / 报关单 / 截图等）
//   数据来自 shipment_attachments 表（bucket: shipment-attachments，私有）
//   可见性由 RLS 控制（can_see_shipment）——客户/海外代理只能看自己能看到的订单的附件
//   点击文件名用 signed URL 打开（10 分钟有效）
import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { t } from "../lib/i18n.js";

const SUPABASE_URL = "https://pewdvheoaqofmzwhwwvu.supabase.co";
const BUCKET = "shipment-attachments";

export default function ShipmentAttachments({ shipmentId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shipmentId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("shipment_attachments")
        .select("*").eq("shipment_id", shipmentId)
        .order("uploaded_at", { ascending: false });
      setItems(data || []);
      setLoading(false);
    })();
  }, [shipmentId]);

  const open = async (storagePath) => {
    if (!storagePath) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabase.auth.getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 600 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.open(`${SUPABASE_URL}/storage/v1${data.signedURL || data.signedUrl}`, "_blank");
    } catch (err) {
      alert(t("Failed to open file") + ": " + err.message);
    }
  };

  if (loading) return <div className="empty-state empty-text" style={{ padding: "10px 0" }}>{t("Loading...")}</div>;
  if (items.length === 0) return <div className="empty-state empty-text" style={{ padding: "10px 0" }}>{t("No documents")}</div>;

  return (
    <div>
      {items.map(a => (
        <div key={a.id} style={{
          padding: "8px 10px", border: "1px solid var(--shell-border)",
          borderRadius: 4, marginBottom: 6,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ flexShrink: 0, fontSize: 16 }}>📎</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.filename}
            </div>
            <div style={{ fontSize: 11, color: "var(--shell-text-3)" }}>
              {a.uploaded_at?.slice(0, 16).replace("T", " ")}
              {a.note && ` · ${a.note}`}
            </div>
          </div>
          <button onClick={() => open(a.storage_path)} style={{ border: "none", background: "none", color: "var(--shell-primary)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            {t("Download")}
          </button>
        </div>
      ))}
    </div>
  );
}
