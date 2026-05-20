import mongoose, { Schema } from "mongoose";

const captainWalletTxSchema = new Schema(
  {},
  { timestamps: true, strict: false, collection: "captainwallettransactions" },
);

export const CaptainWalletTransaction =
  mongoose.models.CaptainWalletTransaction ??
  mongoose.model("CaptainWalletTransaction", captainWalletTxSchema);
