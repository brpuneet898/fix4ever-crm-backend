/**
 * Policy Engine — PBAC Core
 *
 * Evaluates whether a given role may perform an action on a resource.
 *
 * Resolution order (highest precedence first):
 *  1. Full-access base roles (admin, super_admin) → always allow
 *  2. Explicit DENY policies in `policies` collection → deny immediately
 *  3. Permissions listed in `rolepermissons` collection for the role → allow
 *  4. Explicit ALLOW policies in `policies` collection with passing conditions → allow
 *  5. Default → deny
 *
 * Policies are cached in-memory with a 5-minute TTL to minimise DB round-trips.
 * Call invalidatePolicyCache() after any admin permission change.
 */

import { isFullAccessRole } from "../access/roles";
import { Policy } from "../shared/models/policy.model";
import { RolePermission } from "../shared/models/rolePermission.model";
import {
  evaluateConditions,
  type PolicyContext,
} from "./policy.rules.helper";

interface PolicyDoc {
  _id: unknown;
  action: string;
  resource: string;
  role: string;
  effect: "allow" | "deny";
  conditions: string[] | null;
  isActive: boolean;
}

interface RolePermissionDoc {
  role: string;
  permissions: string[];
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason: string;
  matchedPolicy?: {
    id: unknown;
    action: string;
    resource: string;
    role: string;
    effect: string;
  };
}

// ── In-memory cache ──────────────────────────────────────────────────────────

let _policyCache: PolicyDoc[] | null = null;
const _rolePermCache = new Map<string, string[]>();
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadAllPolicies(): Promise<PolicyDoc[]> {
  const now = Date.now();
  if (_policyCache && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _policyCache;
  }
  const docs = await Policy.find({ isActive: true })
    .select("action resource role effect conditions")
    .lean<PolicyDoc[]>();
  _policyCache = docs;
  _cacheTimestamp = now;
  return docs;
}

async function loadRolePermissions(role: string): Promise<string[]> {
  if (_rolePermCache.has(role)) {
    return _rolePermCache.get(role)!;
  }
  const doc = await RolePermission.findOne({ role })
    .select("permissions")
    .lean<RolePermissionDoc>();
  const perms = doc?.permissions ?? [];
  _rolePermCache.set(role, perms);
  return perms;
}

/**
 * Invalidate the policy cache.
 * Must be called after any admin permission or policy update
 * so the next request fetches fresh data.
 */
export function invalidatePolicyCache(): void {
  _policyCache = null;
  _rolePermCache.clear();
  _cacheTimestamp = 0;
}

// ── Core check ───────────────────────────────────────────────────────────────

/**
 * Check whether a role may perform an action on a resource.
 *
 * @param role     - The role to evaluate (base role or assignable sub-role)
 * @param action   - Permission string e.g. "customers.read"
 * @param resource - Resource key e.g. "customers"
 * @param context  - Optional runtime context for condition evaluation
 */
export async function checkPolicy(
  role: string,
  action: string,
  resource: string,
  context?: PolicyContext,
): Promise<PolicyCheckResult> {
  // 1. Full-access base roles bypass all policy checks
  if (isFullAccessRole(role)) {
    return { allowed: true, reason: "full_access_role" };
  }

  const policies = await loadAllPolicies();
  const matching = policies.filter(
    (p) => p.role === role && p.action === action && p.resource === resource,
  );

  // 2. Explicit DENY — checked before allows (deny wins)
  for (const policy of matching) {
    if (policy.effect === "deny") {
      const conditionsPass = evaluateConditions(policy.conditions, context);
      if (conditionsPass) {
        return {
          allowed: false,
          reason: "explicit_deny",
          matchedPolicy: {
            id: policy._id,
            action,
            resource,
            role,
            effect: "deny",
          },
        };
      }
    }
  }

  // 3. Role permission bundle from `rolepermissons` collection
  const rolePerms = await loadRolePermissions(role);
  if (rolePerms.includes(action)) {
    return { allowed: true, reason: "role_permission_bundle" };
  }

  // 4. Explicit ALLOW with condition evaluation
  for (const policy of matching) {
    if (policy.effect === "allow") {
      const conditionsPass = evaluateConditions(policy.conditions, context);
      if (conditionsPass) {
        return {
          allowed: true,
          reason: "policy_allow",
          matchedPolicy: {
            id: policy._id,
            action,
            resource,
            role,
            effect: "allow",
          },
        };
      }
    }
  }

  // 5. Default deny
  return {
    allowed: false,
    reason: `no_matching_policy — role "${role}" has no grant for "${action}" on "${resource}"`,
  };
}

/**
 * Check a list of roles in order — allows if ANY role passes.
 * Used when a user has both a base role and sub-roles.
 */
export async function checkPolicyForRoles(
  roles: string[],
  action: string,
  resource: string,
  context?: PolicyContext,
): Promise<PolicyCheckResult> {
  let lastDeny: PolicyCheckResult | null = null;

  for (const role of roles) {
    const result = await checkPolicy(role, action, resource, context);
    if (result.allowed) return result;
    if (result.reason === "explicit_deny") {
      // Explicit deny is final — don't check remaining roles
      return result;
    }
    lastDeny = result;
  }

  return (
    lastDeny ?? {
      allowed: false,
      reason: "no_matching_policy for any role",
    }
  );
}
