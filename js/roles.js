/**
 * Meridian CRM — Roles & Permissions
 * Central source of truth for what each role can do. Mirrors firestore.rules.
 */

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SALES_MANAGER: "sales_manager",
  SALES_REP: "sales_rep",
  SUPPORT: "support"
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.ADMIN]: "Admin",
  [ROLES.SALES_MANAGER]: "Sales Manager",
  [ROLES.SALES_REP]: "Sales Representative",
  [ROLES.SUPPORT]: "Customer Support"
};

// Permission matrix. Each key maps to an array of roles allowed to perform it.
const PERMISSIONS = {
  "leads.viewAll":      [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "leads.viewOwn":      [ROLES.SALES_REP, ROLES.SUPPORT],
  "leads.create":       [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_REP],
  "leads.edit":         [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_REP],
  "leads.delete":       [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "leads.assign":       [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "customers.viewAll":  [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SUPPORT],
  "customers.create":   [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_REP],
  "customers.edit":     [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_REP, ROLES.SUPPORT],
  "customers.delete":   [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  "deals.viewAll":      [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "deals.manage":       [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.SALES_REP],
  "tasks.assignOthers": [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "reports.view":       [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "reports.export":     [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.SALES_MANAGER],
  "staff.manage":       [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  "settings.system":    [ROLES.SUPER_ADMIN]
};

export function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function roleBadgeClass(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN: return "badge-gold";
    case ROLES.ADMIN: return "badge-blue";
    case ROLES.SALES_MANAGER: return "badge-teal";
    case ROLES.SALES_REP: return "badge-amber";
    case ROLES.SUPPORT: return "badge-gray";
    default: return "badge-gray";
  }
}
