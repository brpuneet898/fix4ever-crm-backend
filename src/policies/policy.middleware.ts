/**
 * Policy Middleware — PBAC Enforcement Layer
 *
 * Runs as a Fastify preHandler before the controller.
 * Calls the policy engine with the user's roles and blocks the
 * request with 403 if no policy grants access.
 *
 * Usage:
 *   app.get('/customers', {
 *     preHandler: [policyMiddleware({ action: 'customers.read', resource: 'customers' })]
 *   }, handler)
 *
 * With runtime context (e.g. regional scoping):
 *   app.get('/regional/technicians', {
 *     preHandler: [
 *       policyMiddleware({
 *         action: 'vendors.read',
 *         resource: 'vendors',
 *         getContext: (req) => ({ resourceRegion: req.query.region }),
 *       })
 *     ]
 *   }, handler)
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { ApiError } from "../shared/errors/ApiError";
import { checkPolicyForRoles } from "./policy.engine";
import type { PolicyContext } from "./policy.rules.helper";

export interface PolicyMiddlewareOptions {
  /** Permission string to check, e.g. "customers.read" */
  action: string;
  /** Resource key matching DB policy documents, e.g. "customers" */
  resource: string;
  /**
   * Optional factory to extract runtime context from the request.
   * Used for conditions like same_region or ownership.
   */
  getContext?: (req: FastifyRequest) => Partial<PolicyContext> | undefined;
}

/**
 * Returns a Fastify preHandler that enforces the given action + resource
 * against the authenticated user's roles using the PBAC policy engine.
 */
export function policyMiddleware(opts: PolicyMiddlewareOptions) {
  return async function checkPolicyHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ) {
    const user = request.admin;
    if (!user) {
      throw ApiError.unauthorized("Authentication required");
    }

    // Collect all roles to evaluate (base role + assignable sub-roles)
    const roles: string[] = [user.role, ...(user.roles ?? [])].filter(Boolean);

    // Build context for condition evaluation
    const baseContext: PolicyContext = {
      userId: user.userId,
      userRole: user.role,
      userRegion: user.region,
    };

    const extraContext = opts.getContext?.(request) ?? {};
    const context: PolicyContext = { ...baseContext, ...extraContext };

    const result = await checkPolicyForRoles(
      roles,
      opts.action,
      opts.resource,
      context,
    );

    if (result.allowed) return;

    // Explicit DB deny — hard block, no fallback
    if (result.reason === "explicit_deny") {
      throw ApiError.forbidden(
        `Access denied. Policy explicitly denies "${opts.action}" on "${opts.resource}".`,
      );
    }

    // Fallback: check JWT-embedded permissions (user.permissionOverrides.granted).
    // Allows the existing permission-override system to keep working while DB
    // policies are progressively seeded. Once a DB policy exists it takes precedence.
    if ((user.permissions ?? []).includes(opts.action)) return;

    throw ApiError.forbidden(
      `Access denied. No policy grants "${opts.action}" on "${opts.resource}" for role(s): ${roles.join(", ")}.`,
    );
  };
}

/**
 * Convenience: require ALL of the listed actions on their respective resources.
 * All must pass; first failure blocks the request.
 */
export function requireAllPolicies(
  checks: Array<{ action: string; resource: string }>,
) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    for (const check of checks) {
      await policyMiddleware(check)(request, reply);
    }
  };
}

/**
 * Convenience: require at least ONE of the listed actions to be allowed.
 * Returns 403 only if all checks fail.
 */
export function requireAnyPolicy(
  checks: Array<{ action: string; resource: string }>,
) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const user = request.admin;
    if (!user) throw ApiError.unauthorized("Authentication required");

    const roles: string[] = [user.role, ...(user.roles ?? [])].filter(Boolean);
    const context: PolicyContext = {
      userId: user.userId,
      userRole: user.role,
      userRegion: user.region,
    };

    for (const check of checks) {
      const result = await checkPolicyForRoles(
        roles,
        check.action,
        check.resource,
        context,
      );
      if (result.allowed) return;
    }

    throw ApiError.forbidden(
      `Access denied. None of the required policies are satisfied.`,
    );
  };
}
