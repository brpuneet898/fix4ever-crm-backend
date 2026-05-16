/**
 * PaymentTransaction model — CRM reads from the same MongoDB collection
 * used by the main Fix4Ever backend.
 */
import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentTransactionDocument extends Document {
  vendorId?: mongoose.Types.ObjectId;
  serviceRequestId?: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  amount?: number;
  vendorEarnings?: number;
  status?: string;
}

const paymentTransactionSchema = new Schema<IPaymentTransactionDocument>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    serviceRequestId: { type: Schema.Types.ObjectId, ref: "ServiceRequest" },
    customerId: { type: Schema.Types.ObjectId, ref: "User" },
    amount: { type: Number },
    vendorEarnings: { type: Number },
    status: { type: String },
  },
  {
    timestamps: true,
    strict: false,
    collection: "paymenttransactions",
  },
);

export const PaymentTransaction =
  mongoose.models.PaymentTransaction ??
  mongoose.model<IPaymentTransactionDocument>(
    "PaymentTransaction",
    paymentTransactionSchema,
  );
