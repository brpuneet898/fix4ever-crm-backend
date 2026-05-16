import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "./ApiError";
import { logger } from "../logger/logger";
import { ZodError } from "zod";

/** MongoDB duplicate-key error shape (MongoServerError code 11000) */
interface MongoDuplicateKeyError {
  code: number;
  keyValue?: Record<string, unknown>;
}

/**
 * Global error handler.
 *
 * All error responses follow a consistent envelope:
 *   { success: false, message, requestId, [details] }
 *
 * The `requestId` (X-Request-Id) is included in every error response so
 * clients can correlate errors with server-side logs.
 */
export function errorHandler(
  error: FastifyError | ApiError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const requestId =
    (request as unknown as { correlationId?: string }).correlationId ??
    (reply.getHeader("X-Request-Id") as string | undefined);

  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({
      success: false,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  if (error instanceof ZodError) {
    const issues = (error.issues ?? []) as Array<{
      path: (string | number)[];
      message: string;
    }>;
    return reply.status(422).send({
      success: false,
      message: "Validation failed",
      requestId,
      details: issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // MongoDB duplicate key (E11000) — return 409 Conflict instead of 500
  const mongoError = error as unknown as MongoDuplicateKeyError;
  if (mongoError.code === 11000) {
    const field = Object.keys(mongoError.keyValue ?? {})[0] ?? "field";
    return reply.status(409).send({
      success: false,
      message: `A record with this ${field} already exists.`,
      requestId,
    });
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.statusCode && fastifyError.statusCode < 500) {
    return reply.status(fastifyError.statusCode).send({
      success: false,
      message: fastifyError.message,
      requestId,
    });
  }

  logger.error(
    {
      err: error,
      method: request.method,
      url: request.url,
      requestId,
      userId: request.admin?.userId,
    },
    "Unhandled error",
  );

  return reply.status(500).send({
    success: false,
    message: "An unexpected error occurred. Please try again.",
    requestId,
  });
}
