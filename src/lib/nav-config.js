// Role-driven nav tree. Labels are produced via t() at call time so they
// follow the current language. Shell re-runs navForRole() on language change
// (LangSwitch triggers a full reload — see Shell.jsx).
import { t } from "./i18n.js";

function supplierNav() {
  return [
    { key: "supplier-home", label: t("Dashboard"), icon: "home", page: "SupplierHome" },
    {
      label: t("Orders"),
      icon: "ship",
      children: [
        { key: "supplier-orders",      label: t("Order List"),       page: "SupplierOrders" },
        { key: "supplier-new-booking", label: t("New Booking"),      page: "BookingRequest" },
        { key: "supplier-bookings",    label: t("Booking Requests"), page: "BookingList" },
      ],
    },
    {
      label: t("Finance"),
      icon: "wallet",
      children: [
        { key: "supplier-bills",       label: t("FOB Bills"),        page: "SupplierBills" },
        { key: "supplier-invoices",    label: t("Invoices"),         page: "SupplierInvoices" },
        { key: "supplier-vouchers",    label: t("Payment Vouchers"), page: "SupplierVouchers" },
        { key: "supplier-settlements", label: t("Settlements"),      page: "SupplierSettlements" },
      ],
    },
    { key: "supplier-telex", label: t("Telex Release"), icon: "send", page: "TelexRelease" },
    { key: "supplier-spot",  label: t("My Spot Bookings"), icon: "calendar", page: "MySpotBookings" },
  ];
}

function internalNav() {
  return [
    { key: "shipments",  label: t("Orders"),     icon: "ship",  page: "Shipments" },
    { key: "containers", label: t("Containers"), icon: "box",   page: "Containers" },
    { key: "customers",  label: t("Customers"),  icon: "users", page: "Customers" },
    { key: "knowledge",  label: t("Knowledge"),  icon: "book",  page: "Knowledge" },
    {
      label: t("Review"),
      icon: "check",
      children: [
        { key: "review-bookings", label: t("Booking Requests"), page: "ReviewBookings" },
        { key: "review-vouchers", label: t("Payment Vouchers"), page: "ReviewVouchers" },
        { key: "review-telex",    label: t("Telex Release"),    page: "ReviewTelex" },
      ],
    },
    { key: "accounts", label: t("Accounts"),        icon: "users", page: "AccountManagement" },
    { key: "manage",   label: t("System Settings"), icon: "gear",  page: "Manage" },
  ];
}

function customerNav() {
  return [
    { key: "shipments",      label: t("My Orders"),        icon: "ship",     page: "Shipments" },
    { key: "containers",     label: t("Containers"),       icon: "box",      page: "Containers" },
    { key: "my-spot",        label: t("My Spot Bookings"), icon: "calendar", page: "MySpotBookings" },
  ];
}

export function navForRole(role) {
  switch (role) {
    case "supplier": return supplierNav();
    case "customer": return customerNav();
    case "admin":
    case "operator":
    case "sales":
    case "finance":
      return internalNav();
    default: return [];
  }
}

export function flatNav(role) {
  const out = [];
  for (const item of navForRole(role)) {
    if (item.children) out.push(...item.children);
    else out.push(item);
  }
  return out;
}

export function findNavByKey(role, key) {
  return flatNav(role).find(n => n.key === key) || null;
}
