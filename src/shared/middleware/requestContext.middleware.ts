/**
 * Request Context Middleware
 *
 * Single `onRequest` hook attaches:
 *   - X-Request-Id  (from client or freshly generated UUID — for distributed tracing)
 *   - startTime     (internal, used by onSend to compute X-Response-Time)
 *
 * `onSend` hook appends X-Response-Time to every response.
 *
 * Both hooks are registered in one `registerRequestContext` call so order is deterministic.
 */
import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";

declare module "fastify" {
  interface FastifyRequest {
    startTime: number;
    correlationId: string;
  }
}

export async function registerRequestContext(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    request.startTime = Date.now();
    // Honour client-supplied ID for distributed tracing; generate otherwise.
    request.correlationId =
      (request.headers["x-request-id"] as string | undefined) ?? randomUUID();
    reply.header("X-Request-Id", request.correlationId);
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Response-Time", `${Date.now() - request.startTime}ms`);
  });
}
