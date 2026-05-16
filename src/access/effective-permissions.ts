/**
 * Single source of truth for JWT / “effective” permission strings.
 *
 * - `admin` and `super_admin` (base role) → full catalog (`ALL_PERMISSIONS`).
 * - Everyone else (including users with crm_manager / regional_manager / editor in `roles[]`)
 *   → **only** what was granted via the admin permission panel (`permissionOverrides`),
 *   with denies applied. No code-defined bundles per assignable role.
 */
import { ALL_PERMISSIONS, type Permission } from "./permissions";
import { isFullAccessRole, ROLES } from "./roles";

export interface PermissionOverridesInput {
  granted?: string[];
  denied?: string[];
}

/** `roles[]` (crm_manager, …) is not used here — those labels never imply permissions in code. */
export interface EffectivePermissionUser {
  role: string;
  permissionOverrides?: PermissionOverridesInput;
}

export function buildEffectivePermissions(
  user: EffectivePermissionUser,
): string[] {
  if (isFullAccessRole(user.role)) {
    return [...ALL_PERMISSIONS];
  }

  const granted = user.permissionOverrides?.granted ?? [];
  const denied = new Set(user.permissionOverrides?.denied ?? []);
  return [...new Set(granted)].filter((p) => !denied.has(p));
}

/**
 * Labels for admin UI: which role keys show an implicit full set vs empty until assigned.
 * Assignable sub-roles never have preset permissions in code — only `admin` / `super_admin`.
 */
export function getCatalogRoleDefaults(): Record<string, Permission[]> {
  const full = [...ALL_PERMISSIONS];
  return {
    [ROLES.SUPER_ADMIN]: full,
    [ROLES.ADMIN]: full,
    [ROLES.CRM_MANAGER]: [],
    [ROLES.REGIONAL_MANAGER]: [],
    [ROLES.EDITOR]: [],
  };
}
