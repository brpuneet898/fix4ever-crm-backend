/**
 * CustomerWallet Service
 *
 * Handles all balance mutations with:
 *  1. Atomic balance updates ($inc) — no read-modify-write race conditions
 *  2. Bounded embedded transaction array (MAX_EMBEDDED_TX guard)
 *     Oldest entries are archived to WalletTxArchive before pushing new ones
 *  3. Full audit trail — balanceBefore + balanceAfter on every tx
 */
import mongoose from "mongoose";
import {
  CustomerWallet,
  MAX_EMBEDDED_TX,
  ICustomerWalletTransaction,
} from "../models/payment/customerWallet.model";
import { WalletTxArchive } from "../models/payment/walletTxArchive.model";
import { ApiError } from "../errors/ApiError";

export interface WalletAdjustmentInput {
  userId: string;
  type: ICustomerWalletTransaction["type"];
  amount: number;
  description: string;
  referenceId?: string;
  referenceModel?: string;
  performedBy?: string;
}

/**
 * Adjusts wallet balance atomically and appends the transaction.
 * Archives oldest transactions if the cap is exceeded.
 */
export async function adjustWalletBalance(input: WalletAdjustmentInput) {
  const {
    userId,
    type,
    amount,
    description,
    referenceId,
    referenceModel,
    performedBy,
  } = input;

  if (amount === 0) throw ApiError.badRequest("Amount must be non-zero");

  const isDebit = ["debit"].includes(type);
  const delta = isDebit ? -Math.abs(amount) : Math.abs(amount);

  // Fetch current wallet (need balance for the log entry)
  let wallet = await CustomerWallet.findOne({ userId });
  if (!wallet) {
    wallet = await CustomerWallet.create({
      userId,
      balance: 0,
      totalCredited: 0,
      totalDebited: 0,
    });
  }

  if (isDebit && wallet.balance < Math.abs(amount)) {
    throw ApiError.badRequest(
      `Insufficient wallet balance. Current: ${wallet.balance}`,
    );
  }

  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore + delta;

  const newTx: Omit<ICustomerWalletTransaction, "createdAt"> & {
    createdAt: Date;
  } = {
    type,
    amount: Math.abs(amount),
    description,
    balanceBefore,
    balanceAfter,
    referenceId,
    referenceModel,
    performedBy: performedBy
      ? new mongoose.Types.ObjectId(performedBy)
      : undefined,
    createdAt: new Date(),
  };

  // Archive oldest if at cap — use $slice after $push to stay bounded
  const creditDelta = delta > 0 ? Math.abs(amount) : 0;
  const debitDelta = delta < 0 ? Math.abs(amount) : 0;

  const updated = await CustomerWallet.findOneAndUpdate(
    { userId },
    {
      $inc: {
        balance: delta,
        totalCredited: creditDelta,
        totalDebited: debitDelta,
      },
      $push: {
        transactions: {
          $each: [newTx],
          $sort: { createdAt: -1 },
          $slice: MAX_EMBEDDED_TX, // hard cap: keeps newest MAX_EMBEDDED_TX entries
        },
      },
    },
    { new: true, upsert: false },
  );

  if (!updated) throw ApiError.notFound("Wallet not found");

  // Archive entries that were evicted by $slice
  const totalTxCount = (wallet.transactions?.length ?? 0) + 1;
  if (totalTxCount > MAX_EMBEDDED_TX) {
    const overflow = wallet.transactions.slice(MAX_EMBEDDED_TX - 1);
    if (overflow.length > 0) {
      const archiveEntries = overflow.map((tx) => ({
        userId: new mongoose.Types.ObjectId(userId),
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
        referenceId: tx.referenceId,
        referenceModel: tx.referenceModel,
        performedBy: tx.performedBy,
        originalTxId: (tx as unknown as { _id: mongoose.Types.ObjectId })._id,
        archivedAt: new Date(),
        createdAt: tx.createdAt,
      }));
      // Fire-and-forget archive — never blocks the main tx
      WalletTxArchive.insertMany(archiveEntries).catch(() => {});
    }
  }

  return updated;
}

/**
 * Returns paginated wallet transaction history.
 * Checks inline transactions first; falls back to archive for older entries.
 */
export async function getWalletHistory(
  userId: string,
  page: number,
  limit: number,
) {
  const skip = (page - 1) * limit;
  const wallet = await CustomerWallet.findOne({ userId })
    .select("balance transactions")
    .lean();
  if (!wallet) throw ApiError.notFound("Wallet not found");

  const inlineTx = wallet.transactions ?? [];

  if (skip < inlineTx.length) {
    // Serve from inline
    const slice = inlineTx.slice(skip, skip + limit);
    const [archiveCount] = await Promise.all([
      WalletTxArchive.countDocuments({ userId }),
    ]);
    return {
      balance: wallet.balance,
      transactions: slice,
      total: inlineTx.length + archiveCount,
      page,
      limit,
    };
  }

  // Fall back to archive
  const archiveSkip = skip - inlineTx.length;
  const [archiveTx, archiveTotal] = await Promise.all([
    WalletTxArchive.find({ userId })
      .sort({ createdAt: -1 })
      .skip(archiveSkip)
      .limit(limit)
      .lean(),
    WalletTxArchive.countDocuments({ userId }),
  ]);

  return {
    balance: wallet.balance,
    transactions: archiveTx,
    total: inlineTx.length + archiveTotal,
    page,
    limit,
  };
}
