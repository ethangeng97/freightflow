// Single source of truth for client-side permission checks.
// Server enforces authoritatively via RLS; this is for UI affordances + field masking.

export const ROLES = ["admin", "sales", "operator", "finance", "customer", "supplier"];

export const isAdmin    = (u) => u?.profile?.role === "admin";
export const isSales    = (u) => u?.profile?.role === "sales";
export const isOperator = (u) => u?.profile?.role === "operator";
export const isFinance  = (u) => u?.profile?.role === "finance";
export const isCustomer = (u) => u?.profile?.role === "customer";
export const isSupplier = (u) => u?.profile?.role === "supplier";

// External-facing roles get the simplified Portal shell; internal roles get the full one.
export const isExternal = (u) => isCustomer(u) || isSupplier(u);
export const isInternal = (u) => isAdmin(u) || isSales(u) || isOperator(u) || isFinance(u);

// Per-role field visibility in the UI.
//   admin: sees everything including end_customer
//   Ops view (operator/sales/finance): hides end_customer
//   Customer / supplier view: hides internal entry status fields
export function maskedFields(role) {
  if (role === "admin")    return new Set();
  if (role === "operator" || role === "sales" || role === "finance") return new Set(["end_customer"]);
  if (role === "customer" || role === "supplier") return new Set(["entry_done", "entry_number"]);
  return new Set();
}

// Editable fields per role in shipment detail page.
export function canEditField(role, field) {
  if (field === "entry_done" || field === "entry_number") return role === "operator" || role === "admin";
  if (role === "admin")    return true;
  if (role === "customer") return field === "qc_status";
  if (role === "supplier") return false;  // supplier 在专属页面操作，不在 shipments 详情里直接改字段
  if (role === "operator" || role === "sales" || role === "finance") return field !== "qc_status";
  return false;
}

// Section / page visibility — the Shell's nav-config does most of the heavy lifting,
// but pages still check this to lock down direct hash access.
export function canAccessPage(role, page) {
  // Supplier-only pages
  const SUPPLIER_PAGES = new Set([
    "supplier-home", "supplier-orders",
    "supplier-new-booking", "supplier-bookings",
    "supplier-bills", "supplier-invoices", "supplier-vouchers",
    "supplier-settlements", "supplier-telex",
  ]);
  if (SUPPLIER_PAGES.has(page)) return role === "supplier";

  // Internal review pages
  if (page.startsWith("review-")) {
    return role === "admin" || role === "operator" || role === "finance";
  }

  switch (page) {
    case "shipments":  return role !== "supplier";  // supplier 没有 shipments 直接访问
    case "containers": return role !== "supplier";
    case "logs":       return role === "admin" || role === "operator";
    case "customers":  return role === "admin" || role === "sales";
    case "knowledge":  return role !== "customer" && role !== "supplier";
    case "manage":     return role === "admin";
    case "accounts":   return role === "admin";
    default: return false;
  }
}

// Mask value before display / export.
export function maskValue(role, field, value) {
  return maskedFields(role).has(field) ? "•••" : value;
}
