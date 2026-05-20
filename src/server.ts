/**
 * server.ts — Application entry point
 *
 * Bootstraps the Fastify app, connects to MongoDB, syncs Mongoose indexes,
 * attaches Socket.IO, and begins listening for HTTP connections.
 *
 * This is the canonical server entry point.
 * The original main.ts remains untouched for backward compatibility.
 */
import { buildApp } from "./app";
import { env } from "./config/env.config";
import {
  connectMongo,
  disconnectMongo,
} from "./infrastructure/database/mongo.connection";
import { initSocketServer } from "./infrastructure/websocket/socket.server";
import { startFollowUpJob, stopFollowUpJob } from "./jobs/followUp.job";
import { FastifyInstance } from "fastify";

let _app: FastifyInstance | null = null;

async function syncIndexes() {
  const { User } = await import("./shared/models/user.model");
  const { Campaign } = await import("./shared/models/campaign/campaign.model");
  const { ServiceRequest } = await import(
    "./shared/models/serviceRequest/serviceRequest.model"
  );
  const { Vendor } = await import("./shared/models/vendor/vendor.model");
  const { Review } = await import("./shared/models/review/review.model");
  const { PaymentTransaction } = await import(
    "./shared/models/payment/paymentTransaction.model"
  );
  const { Policy } = await import("./shared/models/policy.model");
  const { RolePermission } = await import(
    "./shared/models/rolePermission.model"
  );
  // Captain models — read from same MongoDB as MainApp
  await import("./shared/models/captain/captain.model");
  await import("./shared/models/captain/captainWallet.model");
  await import("./shared/models/captain/captainWalletTransaction.model");
  await import("./shared/models/captain/captainSettlementRequest.model");

  await Promise.all([
    User.syncIndexes(),
    Campaign.syncIndexes(),
    ServiceRequest.syncIndexes(),
    Vendor.syncIndexes(),
    Review.syncIndexes(),
    PaymentTransaction.syncIndexes(),
    Policy.syncIndexes(),
    RolePermission.syncIndexes(),
  ]);

  console.info(
    "[DB] All model indexes synced (including Policy + RolePermission)",
  );
}

async function start() {
  await connectMongo();

  try {
    await syncIndexes();
  } catch (err) {
    console.warn("[DB] Index sync warning (non-fatal):", err);
  }

  _app = await buildApp();

  try {
    await _app.listen({ port: env.PORT, host: "0.0.0.0" });
    _app.log.info(`Server running at http://0.0.0.0:${env.PORT}`);
    initSocketServer(_app.server);
    _app.log.info("Socket.IO server attached");

    startFollowUpJob();
  } catch (err) {
    _app.log.error(err, "Failed to start server");
    await disconnectMongo();
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  if (!_app) return;
  _app.log.info({ signal }, "Graceful shutdown initiated");

  stopFollowUpJob();

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
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

start();
