/**
 * Policy Rules Helper — Condition Evaluators
 *
 * Handles named conditions used in policy documents:
 *   - same_region   : user's region must match the resource's region
 *   - ownership     : resource must belong to the requesting user
 *   - is_active     : the target resource must be active
 *
 * Custom conditions can be registered at startup via registerCondition().
 */

export interface PolicyContext {
  /** ID of the requesting user */
  userId?: string;
  /** Base role of the requesting user */
  userRole?: string;
  /** Assigned region (for regional_manager scoping) */
  userRegion?: string;
  /** Region of the target resource */
  resourceRegion?: string;
  /** Owner ID of the target resource */
  resourceOwnerId?: string;
  /** Whether the target resource is active */
  isActive?: boolean;
  /** Arbitrary additional context data */
  [key: string]: unknown;
}

type ConditionEvaluator = (context: PolicyContext) => boolean;

/** Registry of named condition evaluators */
const CONDITIONS: Record<string, ConditionEvaluator> = {
  /**
   * same_region: user's region must match the resource's region.
   * Used for regional_manager to scope data access.
   */
  same_region: (ctx) => {
    if (!ctx.userRegion || !ctx.resourceRegion) return false;
    return ctx.userRegion === ctx.resourceRegion;
  },

  /**
   * ownership: the requesting user must own the resource.
   * Useful for allowing users to modify their own records.
   */
  ownership: (ctx) => {
    if (!ctx.userId || !ctx.resourceOwnerId) return false;
    return ctx.userId === ctx.resourceOwnerId;
  },

  /**
   * is_active: the target resource must have isActive = true.
   */
  is_active: (ctx) => Boolean(ctx.isActive),

  /**
   * is_admin: the requesting user must have admin or super_admin base role.
   */
  is_admin: (ctx) =>
    ctx.userRole === "admin" || ctx.userRole === "super_admin",
};

/**
 * Evaluate all conditions in a policy against the provided context.
 * All conditions must pass (AND logic). Returns true if no conditions.
 */
export function evaluateConditions(
  conditions: string[] | null | undefined,
  context?: PolicyContext,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  if (!context) return false;

  return conditions.every((condition) => {
    const evaluator = CONDITIONS[condition];
    if (!evaluator) {
      console.warn(
        `[PolicyEngine] Unknown condition: "${condition}" — denying by default`,
      );
      return false;
    }
    return evaluator(context);
  });
}

/**
 * Register a custom condition evaluator at runtime.
 * Call during app bootstrap to extend the condition registry.
 *
 * @example
 * registerCondition('is_premium', (ctx) => ctx.subscriptionTier === 'premium');
 */
export function registerCondition(
  name: string,
  evaluator: ConditionEvaluator,
): void {
  if (CONDITIONS[name]) {
    console.warn(
      `[PolicyEngine] Overwriting existing condition: "${name}"`,
    );
  }
  CONDITIONS[name] = evaluator;
}

/** Read the current condition registry (useful for testing/debugging). */
export function getRegisteredConditions(): string[] {
  return Object.keys(CONDITIONS);
}
