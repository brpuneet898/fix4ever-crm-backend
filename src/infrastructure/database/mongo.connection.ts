import mongoose from "mongoose";
import { env } from "../../config/env.config";

export async function connectMongo(): Promise<void> {
  const uri = env.MONGO_URI;
  if (!uri) {
    throw new Error(
      "MONGO_URI is not defined in environment variables or is empty. Please check your .env file or config/env.config.ts file.",
    );
  }

  await mongoose.connect(uri);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
