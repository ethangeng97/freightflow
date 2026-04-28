// Single source of truth for client-side permission checks.
// Server enforces authoritatively via RLS; this is for UI affordances + field masking.

export const ROLES = ["admin", "sales", "operator", "customer"];

export const isAdmin    = (u) => u?.profile?.role === "admin";
export const isSales    = (u) => u?.profile?.role === "sales";
export const isOperator = (u) => u?.profile?.role === "operator";
export const isCustomer = (u) => u?.profile?.role === "customer";

// Fields that the operator/sales must NOT see in the UI (per spec: customer-side masking).
// Sales sees customer (their own customers); operator does NOT see customer or end_customer per spec.
export function maskedFields(role) {
  if (role === "operator") return new Set(["customer", "end_customer"]);
  if (role === "sales")    return new Set(["end_customer"]);
  if (role === "customer") return new Set(["end_customer"]); // safety; customer sees their own line only
  return new Set();
}

// Editable fields per role in shipment detail page.
export function canEditField(role, field) {
  if (role === "admin")    return true;
  if (role === "customer") return field === "qc_status";
  if (role === "operator" || role === "sales") return field !== "qc_status";
  return false;
}

// Section / page visibility on sidebar
export function canAccessPage(role, page) {
  switch (page) {
    case "shipments":  return true;
    case "logs":       return role === "admin" || role === "operator";
    case "customers":  return role === "admin" || role === "sales" || role === "operator";
    case "knowledge":  return role !== "customer";
    case "manage":     return role === "admin";
    default: return false;
  }
}

// Mask value before display / export.
export function maskValue(role, field, value) {
  return maskedFields(role).has(field) ? "•••" : value;
}
