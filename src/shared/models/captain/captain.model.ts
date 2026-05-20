/**
 * Captain model — CRM reads from the same MongoDB collection
 * used by the main Fix4Ever backend.
 * strict: false so all fields from the MainApp schema are accessible.
 */
import mongoose, { Schema } from "mongoose";

const captainSchema = new Schema(
  {},
  { timestamps: true, strict: false, collection: "captains" },
);

export const Captain =
  mongoose.models.Captain ?? mongoose.model("Captain", captainSchema);
