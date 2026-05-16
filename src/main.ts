import { buildApp } from "./app";
import { env } from "./config/env.config";
import {
  connectMongo,
  disconnectMongo,
} from "./infrastructure/database/mongo.connection";
import { initSocketServer } from "./infrastructure/websocket/socket.server";
import { FastifyInstance } from "fastify";

let _app: FastifyInstance | null = null;

/**
 * Sync Mongoose schema indexes with MongoDB on startup.
 *
 * Drops any indexes present in MongoDB that are NOT defined in the Mongoose
 * schema (e.g. orphaned `phone_1` unique index from old schema versions), and
 * creates any missing indexes defined in the schema.
 *
 * Safe to run on every startup — Mongoose checks existing indexes before
 * issuing CREATE / DROP operations.
 */
async function syncIndexes() {
  // Import models lazily to avoid circular-dependency issues at module load time
  const { User } = await import("./shared/models/user.model");
  const { Campaign } = await import("./shared/models/campaign/campaign.model");
  const { ServiceRequest } =
    await import("./shared/models/serviceRequest/serviceRequest.model");
  const { Vendor } = await import("./shared/models/vendor/vendor.model");
  const { Review } = await import("./shared/models/review/review.model");
  const { PaymentTransaction } =
    await import("./shared/models/payment/paymentTransaction.model");
  await Promise.all([
    User.syncIndexes(),
    Campaign.syncIndexes(),
    ServiceRequest.syncIndexes(),
    Vendor.syncIndexes(),
    Review.syncIndexes(),
    PaymentTransaction.syncIndexes(),
  ]);
  console.info(
    "[DB] User + Campaign + ServiceRequest + Vendor + Review + PaymentTransaction indexes synced",
  );
}

async function start() {
  await connectMongo();

  // Sync indexes BEFORE accepting traffic so stale indexes are gone by the time
  // the first request arrives.
  try {
    await syncIndexes();
  } catch (err) {
    console.warn("[DB] Index sync warning (non-fatal):", err);
  }

  _app = await buildApp();

  try {
    await _app.listen({ port: env.PORT, host: "0.0.0.0" });
    _app.log.info(`Server running at http://0.0.0.0:${env.PORT}`);

    // Initialize Socket.IO on the underlying HTTP server
    initSocketServer(_app.server);
    _app.log.info("Socket.IO server attached");
  } catch (err) {
    _app.log.error(err, "Failed to start server");
    await disconnectMongo();
    process.exit(1);
  }
}

/**
 * Graceful shutdown sequence:
 * 1. Stop accepting new HTTP connections (Fastify close)
 * 2. Wait for in-flight requests to complete (Fastify drains)
 * 3. Disconnect from MongoDB
 * 4. Exit
 *
 * This ensures no DB operations are abruptly cut off mid-flight.
 */
async function shutdown(signal: string) {
  if (!_app) return;
  _app.log.info({ signal }, "Graceful shutdown initiated");

  try {
    await _app.close();
    _app.log.info("HTTP server closed");
  } catch (err) {
    _app.log.error(err, "Error closing HTTP server");
  }

  try {
    await disconnectMongo();
    _app.log.info("MongoDB disconnected");
  } catch (err) {
    _app.log.error(err, "Error disconnecting MongoDB");
  }

  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Catch unhandled promise rejections — log and exit to avoid zombie processes
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

start();
