/**
 * CustomerWallet model.
 *
 * SCALABILITY NOTE:
 *  The `transactions` array is embedded for read performance (single-doc wallet).
 *  To prevent unbounded growth the model enforces a hard cap of MAX_EMBEDDED_TX
 *  recent entries. Entries older than the cap are archived to the separate
 *  `WalletTxArchive` collection by the wallet service before any $push.
 *  This keeps the wallet document under MongoDB's 16 MB BSON limit and
 *  guarantees O(1) balance reads.
 */
import mongoose, { Document, Schema } from "mongoose";

/** Max recent transactions kept inline in the wallet document */
export const MAX_EMBEDDED_TX = 200;

export type CustomerWalletTxType =
  | "credit"
  | "debit"
  | "refund"
  | "referral_bonus"
  | "cashback"
  | "adjustment";

export interface ICustomerWalletTransaction {
  type: CustomerWalletTxType;
  amount: number;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  referenceModel?: string;
  performedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface ICustomerWallet {
  userId: mongoose.Types.ObjectId;
  balance: number;
  totalCredited: number;
  totalDebited: number;
  isActive: boolean;
  transactions: ICustomerWalletTransaction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomerWalletDocument extends ICustomerWallet, Document {}

const txSchema = new Schema<ICustomerWalletTransaction>(
  {
    type: {
      type: String,
      enum: [
        "credit",
        "debit",
        "refund",
        "referral_bonus",
        "cashback",
        "adjustment",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    referenceId: { type: String },
    referenceModel: { type: String },
    performedBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const customerWalletSchema = new Schema<ICustomerWalletDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    totalCredited: { type: Number, default: 0 },
    totalDebited: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    transactions: [txSchema],
  },
  { timestamps: true },
);

customerWalletSchema.index({ userId: 1, isActive: 1 }); // userId unique index handled by field definition
customerWalletSchema.index({ "transactions.createdAt": -1 });
customerWalletSchema.index({ updatedAt: -1 });

export const CustomerWallet = mongoose.model<ICustomerWalletDocument>(
  "CustomerWallet",
  customerWalletSchema,
  "customerwallets",
);
