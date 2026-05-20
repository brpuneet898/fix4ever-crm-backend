import mongoose, { Schema } from "mongoose";

const captainSettlementSchema = new Schema(
  {},
  { timestamps: true, strict: false, collection: "captainsettlementrequests" },
);

export const CaptainSettlementRequest =
  mongoose.models.CaptainSettlementRequest ??
  mongoose.model("CaptainSettlementRequest", captainSettlementSchema);
