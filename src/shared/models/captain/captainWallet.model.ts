import mongoose, { Schema } from "mongoose";

const captainWalletSchema = new Schema(
  {},
  { timestamps: true, strict: false, collection: "captainwallets" },
);

export const CaptainWallet =
  mongoose.models.CaptainWallet ??
  mongoose.model("CaptainWallet", captainWalletSchema);
