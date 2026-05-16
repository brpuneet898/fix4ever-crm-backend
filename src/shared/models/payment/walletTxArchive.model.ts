/**
 * WalletTxArchive — cold storage for wallet transactions evicted from the
 * CustomerWallet embedded array once it exceeds MAX_EMBEDDED_TX entries.
 *
 * Query pattern: by userId + date range for history pages / exports.
 * This collection is append-only; documents are never updated.
 */
import mongoose, { Document, Schema } from "mongoose";
import { CustomerWalletTxType } from "./customerWallet.model";

export interface IWalletTxArchive {
  userId: mongoose.Types.ObjectId;
  type: CustomerWalletTxType;
  amount: number;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  referenceModel?: string;
  performedBy?: mongoose.Types.ObjectId;
  originalTxId: mongoose.Types.ObjectId;
  archivedAt: Date;
  createdAt: Date;
}

export interface IWalletTxArchiveDocument extends IWalletTxArchive, Document {}

const walletTxArchiveSchema = new Schema<IWalletTxArchiveDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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
    originalTxId: { type: Schema.Types.ObjectId, required: true },
    archivedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, required: true },
  },
  { timestamps: false },
);

walletTxArchiveSchema.index({ userId: 1, createdAt: -1 });
walletTxArchiveSchema.index({ userId: 1, type: 1 });

export const WalletTxArchive = mongoose.model<IWalletTxArchiveDocument>(
  "WalletTxArchive",
  walletTxArchiveSchema,
  "wallettxarchives",
);
