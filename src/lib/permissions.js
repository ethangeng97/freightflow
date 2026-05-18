// Single source of truth for client-side permission checks.
// Server enforces authoritatively via RLS; this is for UI affordances + field masking.

export const ROLES = ["admin", "sales", "operator", "customer"];

export const isAdmin    = (u) => u?.profile?.role === "admin";
export const isSales    = (u) => u?.profile?.role === "sales";
export const isOperator = (u) => u?.profile?.role === "operator";
export const isCustomer = (u) => u?.profile?.role === "customer";

// Per-role field visibility in the UI.
//   admin: sees everything including end_customer
//   Ops view (operator/sales): hides end_customer (该字段仅给客户端识别自己订单用)
//   Portal customer view: 看自己的 customer/end_customer/supplier；隐藏录单状态
export function maskedFields(role) {
  if (role === "admin")    return new Set();
  if (role === "operator") return new Set(["end_customer"]);
  if (role === "sales")    return new Set(["end_customer"]);
  if (role === "customer") return new Set(["entry_done", "entry_number"]);
  return new Set();
}

// Editable fields per role in shipment detail page.
export function canEditField(role, field) {
  if (field === "entry_done" || field === "entry_number") return role === "operator" || role === "admin";
  if (role === "admin")    return true;
  if (role === "customer") return field === "qc_status";
  if (role === "operator" || role === "sales") return field !== "qc_status";
  return false;
}

// Section / page visibility on sidebar
export function canAccessPage(role, page) {
  switch (page) {
    case "shipments":  return true;
    case "containers": return true;
    case "logs":       return role === "admin" || role === "operator";
    case "suppliers":  return role === "admin" || role === "operator" || role === "sales";
    case "customers":  return role === "admin" || role === "sales";
    case "knowledge":  return role !== "customer";
    case "manage":     return role === "admin";
    default: return false;
  }
}

// Mask value before display / export.
export function maskValue(role, field, value) {
  return maskedFields(role).has(field) ? "•••" : value;
}
