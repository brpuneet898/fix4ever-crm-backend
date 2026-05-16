/**
 * Platform role identifiers (base `User.role` and assignable `User.roles[]` keys).
 * Assignable roles (`crm_manager`, …) do not imply permissions in code — only `admin` /
 * `super_admin` assign grants via `permissionOverrides`. Roles still gate module routes.
 */
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  CRM_MANAGER: "crm_manager",
  REGIONAL_MANAGER: "regional_manager",
  EDITOR: "editor",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_PLATFORM_ROLES: Role[] = Object.values(ROLES);

/** @deprecated Use `ALL_PLATFORM_ROLES`. */
export const ALL_ADMIN_ROLES = ALL_PLATFORM_ROLES;

/** Base roles that bypass granular permission checks (full product access). */
export function isFullAccessRole(role: string | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
}
