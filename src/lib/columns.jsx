import { Badge } from "../components/ui.jsx";
import { t } from "./i18n.js";

// All columns available in the shipments list view.
// `render(o)` receives the shipment row and returns a React node.
// `mono` indicates monospace style; `nowrap` hints the cell shouldn't wrap.
export const SHIPMENT_COLUMNS = [
  { key: "po",             label: "PO#",              defaultVisible: true,  mono: true,  width: 100 },
  { key: "customer_po",    label: "Cust PO#",         defaultVisible: true,  mono: true,  width: 110 },
  { key: "tuc",            label: "TUC / Description", defaultVisible: true, width: 180 },
  { key: "sku",            label: "SKU",              defaultVisible: false, mono: true,  width: 110 },
  { key: "supplier",       label: "Supplier",         defaultVisible: true,  width: 130, maskable: false },
  { key: "customer",       label: "Customer",         defaultVisible: true,  width: 140, maskable: true },
  { key: "end_customer",   label: "End Customer",     defaultVisible: false, width: 140, maskable: true },
  { key: "route",          label: "Route",            defaultVisible: true,  width: 150,
    render: (o) => o.pol && o.pod
      ? `${(o.pol || "").split("(")[0].trim()} → ${(o.pod || "").split("(")[0].trim()}`
      : "—" },
  { key: "carrier",        label: "Carrier",          defaultVisible: true,  width: 130,
    render: (o) => o.carrier ? (o.carrier_agent ? `${o.carrier} · ${o.carrier_agent}` : o.carrier) : "—" },
  { key: "booking_no",     label: "Booking",          defaultVisible: true,  mono: true, width: 120 },
  { key: "container_no",   label: "Cntr No",          defaultVisible: true,  mono: true, width: 130 },
  { key: "qty_container",  label: "Cntr Qty",         defaultVisible: true,  width: 90 },
  { key: "vessel",         label: "Vessel",           defaultVisible: true,  width: 110 },
  { key: "etd",            label: "ETD",              defaultVisible: true,  mono: true, width: 100 },
  { key: "eta",            label: "ETA",              defaultVisible: true,  mono: true, width: 100 },
  { key: "weight",         label: "Weight (kg)",      defaultVisible: false, width: 95 },
  { key: "volume",         label: "Volume (m³)",      defaultVisible: false, width: 95 },
  { key: "qty_packages",   label: "Packages",         defaultVisible: false, width: 90 },
  { key: "incoterms",      label: "Incoterms",        defaultVisible: false, width: 90,
    render: (o) => o.incoterms ? <Badge value={o.incoterms} small/> : "—" },
  { key: "qc_status",      label: "QC",               defaultVisible: true,  width: 110,
    render: (o) => o.qc_status ? <Badge value={o.qc_status} small/> : "—" },
  { key: "space_status",   label: "Space",            defaultVisible: true,  width: 100,
    render: (o) => o.space_status ? <Badge value={o.space_status} small/> : "—" },
  { key: "local_payment",  label: "Pay",              defaultVisible: true,  width: 90,
    render: (o) => o.local_payment ? <Badge value={o.local_payment} small/> : "—" },
  { key: "telex_release",  label: "Telex",            defaultVisible: true,  width: 95,
    render: (o) => o.telex_release ? <Badge value={o.telex_release} small/> : "—" },
  { key: "bl_status",      label: "B/L",              defaultVisible: true,  width: 95,
    render: (o) => o.bl_status ? <Badge value={o.bl_status} small/> : "—" },
  { key: "entry_done",     label: "Entry",            defaultVisible: true,  width: 110, maskable: true,
    render: (o) => o.entry_done
      ? <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12 }}>✓ {o.entry_number || ""}</span>
      : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span> },
];

export const COLUMN_MAP = Object.fromEntries(SHIPMENT_COLUMNS.map(c => [c.key, c]));

export function defaultColumnConfig() {
  return SHIPMENT_COLUMNS.map((c, i) => ({ key: c.key, visible: c.defaultVisible, order: i }));
}

// Reconcile a stored config with the current column registry: keep order/visibility
// for known keys, append new columns at the end (visible by default if defaultVisible).
export function reconcileColumnConfig(stored) {
  const known = new Set(SHIPMENT_COLUMNS.map(c => c.key));
  const seen = new Set();
  const merged = [];
  (Array.isArray(stored) ? stored : []).forEach((item) => {
    if (known.has(item.key) && !seen.has(item.key)) {
      merged.push({ key: item.key, visible: !!item.visible, order: merged.length });
      seen.add(item.key);
    }
  });
  // Append any new columns not in stored
  SHIPMENT_COLUMNS.forEach((c) => {
    if (!seen.has(c.key)) merged.push({ key: c.key, visible: c.defaultVisible, order: merged.length });
  });
  return merged;
}

// Filter columns by role-mask — returns config items that are allowed for this role.
import { maskedFields } from "./permissions.js";
export function applyRoleMask(config, role) {
  const masked = maskedFields(role);
  return config.filter(c => !masked.has(c.key));
}
