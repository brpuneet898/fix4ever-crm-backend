/**
 * Role Validation Utility
 *
 * Validates incoming role arrays (from API requests) against ASSIGNABLE_ROLES.
 * Use before assigning roles or creating invitations. Throws ApiError on invalid input.
 */
import {
  AssignableRole,
  ASSIGNABLE_ROLES,
} from "../models/user.model";
import { ApiError } from "../errors/ApiError";

/** Validates and returns a roles array. Throws ApiError if invalid or empty. */
export function validateAssignableRoles(roles: unknown): AssignableRole[] {
  if (!Array.isArray(roles)) {
    throw ApiError.badRequest("roles must be an array");
  }

  if (roles.length === 0) {
    throw ApiError.badRequest(
      "roles array cannot be empty — use the remove-role endpoint to clear all roles",
    );
  }

  const unique = [...new Set(roles)];
  if (unique.length !== roles.length) {
    throw ApiError.badRequest("Duplicate roles are not allowed");
  }

  const invalid = roles.filter(
    (r) => !(ASSIGNABLE_ROLES as readonly string[]).includes(r as string),
  );
  if (invalid.length > 0) {
    throw ApiError.badRequest(
      `Invalid roles: [${invalid.join(", ")}]. Allowed: [${ASSIGNABLE_ROLES.join(", ")}]`,
    );
  }

  return roles as AssignableRole[];
}
