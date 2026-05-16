/**
 * Admin-specific rate limit configuration.
 *
 * Admin mutation routes (role assign, permission override, refunds, etc.)
 * are limited to 60 requests / minute per IP to prevent abuse.
 *
 * Usage in route definitions:
 *   app.patch("/...", { config: { rateLimit: ADMIN_MUTATION_RATE_LIMIT } }, handler)
 */
export const ADMIN_MUTATION_RATE_LIMIT = {
  max: 60,
  timeWindow: "1 minute",
} as const;

export const AUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many authentication attempts. Try again later.",
  }),
} as const;

export const REPORT_EXPORT_RATE_LIMIT = {
  max: 10,
  timeWindow: "1 minute",
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many export requests. Please wait before exporting again.",
  }),
} as const;
