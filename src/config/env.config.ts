import { config } from "dotenv";
import { z } from "zod";

config();

/**
 * Environment variable schema with strict validation.
 * The process exits immediately (fail-fast) if any required variable is missing
 * or malformed — preventing silent runtime failures in JWT signing, DB connections, etc.
 */
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database — accepts mongodb:// and mongodb+srv:// schemes (Atlas + local)
  MONGO_URI: z
    .string()
    .min(1, "MONGO_URI is required")
    .refine(
      (v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"),
      "MONGO_URI must start with mongodb:// or mongodb+srv://",
    ),

  // JWT — short-lived access token (default 15 min), longer refresh (default 7 days)
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // CORS
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:1420, http://localhost:5173"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),

  // Google OAuth (optional — only required if OAuth feature is enabled)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // Redis (optional — only required if caching/queues are enabled)
  REDIS_URL: z.string().optional(),

  // Seeding
  SEED_ADMIN_EMAIL: z.string().email().default("admin@fix4ever.com"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("Admin@123456"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  parsed.error.issues.forEach((issue) => {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
