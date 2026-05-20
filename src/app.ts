import Fastify from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import { env } from "./config/env.config";
import { errorHandler } from "./shared/errors/errorHandler";
// Canonical routes path — api/v1/routes.ts remains for backward compatibility
import { apiV1Routes } from "./routes";
import { registerRequestContext } from "./shared/middleware/requestContext.middleware";

export async function buildApp() {
  const app = Fastify({ logger: true });

  // ── Security headers (Helmet) ──────────────────────────────────────────────
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Disabled for API-only service
    hsts: { maxAge: 31536000, includeSubDomains: true },
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN || "http://localhost:1420",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id", "X-Response-Time"],
  });

  // ── Global rate limit — protect ALL routes ─────────────────────────────────
  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      success: false,
      message: "Too many requests. Please slow down.",
    }),
  });

  // ── Request correlation IDs + response-time header ─────────────────────────
  await registerRequestContext(app);

  // OpenAPI / Swagger
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Fix4Ever CRM API",
        description:
          "Role-based CRM backend — Admin, CRM Manager, Editor, Regional Manager",
        version: "1.0.0",
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: `${env.NODE_ENV?.toUpperCase()} environment`,
        },
      ],
      tags: [
        { name: "Health", description: "Health check" },
        { name: "Auth", description: "Authentication endpoints" },
        { name: "Admin", description: "Admin-only role management" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      tryItOutEnabled: true,
    },
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  /**
   * Health / Readiness probe.
   * Returns 200 only when all critical dependencies are healthy.
   * Returns 503 if MongoDB is disconnected — prevents load balancers
   * from routing traffic to a degraded instance.
   */
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Readiness probe",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              uptime: { type: "number" },
              version: { type: "string" },
              environment: { type: "string" },
              services: {
                type: "object",
                properties: { database: { type: "string" } },
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              uptime: { type: "number" },
              version: { type: "string" },
              environment: { type: "string" },
              services: {
                type: "object",
                properties: { database: { type: "string" } },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const mongoose = await import("mongoose");
      const dbState = mongoose.default.connection.readyState;
      // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
      const dbHealthy = dbState === 1;

      const payload = {
        status: dbHealthy ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: process.env.npm_package_version ?? "unknown",
        environment: env.NODE_ENV,
        services: {
          database: dbHealthy ? "connected" : "disconnected",
        },
      };

      return reply.status(dbHealthy ? 200 : 503).send(payload);
    },
  );

  // All versioned API routes
  await app.register(apiV1Routes, { prefix: "/api/v1" });

  return app;
}
