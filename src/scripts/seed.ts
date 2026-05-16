/**
 * Seed Script
 *
 * Run: npx ts-node src/scripts/seed.ts
 *
 * Seeds:
 * 1. Creates a default super_admin account (if not exists)
 * 2. Logs catalog: admin tiers = full set; assignable roles = none until granted in DB
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { env } from "../config/env.config";

dotenv.config();

async function main() {
  console.log("🌱 Connecting to MongoDB...");
  await mongoose.connect(env.MONGO_URI!);
  console.log("✅ Connected");

  // Dynamic import after connection
  const { User } = await import("../shared/models/user.model");
  const { hashPassword } = await import("../shared/utils/password.util");
  const { PERMISSIONS, getCatalogRoleDefaults } = await import("../access");

  // ── 1. Create default admin ─────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@fix4ever.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123456";

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    const hashed = await hashPassword(adminPassword);
    admin = await User.create({
      email: adminEmail,
      username: "Super Admin",
      password: hashed,
      role: "admin",
      roles: [],
      isVendor: false,
      isActive: true,
    });
    console.log(`✅ Admin created: ${adminEmail}`);
  } else {
    console.log(`ℹ️  Admin already exists: ${adminEmail}`);
  }

  // ── 2. Log permission matrix ────────────────────────────────────────────────
  console.log("\n📋 PERMISSION MATRIX");
  console.log("=".repeat(70));

  for (const [role, perms] of Object.entries(getCatalogRoleDefaults())) {
    const list = perms as string[];
    console.log(
      `\n🔑 ${role.toUpperCase()} (${list.length} preset permissions — assignable roles are empty until an admin grants them)`,
    );
    list.forEach((p) => console.log(`   • ${p}`));
  }

  console.log(
    "\n\n📊 TOTAL PERMISSIONS AVAILABLE:",
    Object.keys(PERMISSIONS).length,
  );
  console.log("\n✅ Seed complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
