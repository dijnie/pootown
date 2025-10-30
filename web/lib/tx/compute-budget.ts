import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import type {
  Instruction,
  MicroLamports,
  Address,
  Slot,
  Rpc,
  SolanaRpcApi,
} from "@solana/kit";
import {
  prependTransactionMessageInstruction,
  isWritableRole,
} from "@solana/kit";
import type { Percentile } from "./config";
import {
  DEFAULT_COMPUTE_UNIT_MARGIN_MULTIPLIER,
  getPriorityFeeConfig,
  getComputeUnitMarginMultiplier,
} from "./config";
import type { TxMessage, LegacyTxMessage } from "./priority-fees";

export async function processComputeBudgetForTxMessage(
  rpc: Rpc<SolanaRpcApi>,
  message: TxMessage | LegacyTxMessage,
  computeUnits: number
) {
  // const { rpcUrl, supportsPriorityFeePercentile } = getRpcConfig();
  const priorityFee = getPriorityFeeConfig();
  const computeUnitMarginMultiplier = getComputeUnitMarginMultiplier();
  let priorityFeeMicroLamports = BigInt(0);
  if (priorityFee.type === "exact") {
    priorityFeeMicroLamports =
      (priorityFee.amountLamports * BigInt(1_000_000)) / BigInt(computeUnits);
  } else if (priorityFee.type === "dynamic") {
    const estimatedPriorityFee = await calculateDynamicPriorityFees(
      rpc,
      message.instructions,
      // rpcUrl,
      false,
      priorityFee.priorityFeePercentile ?? "50"
    );

    if (!priorityFee.maxCapLamports) {
      priorityFeeMicroLamports = estimatedPriorityFee!;
    } else {
      const maxCapMicroLamports =
        (priorityFee.maxCapLamports * BigInt(1_000_000)) / BigInt(computeUnits);

      priorityFeeMicroLamports =
        maxCapMicroLamports > estimatedPriorityFee!
          ? estimatedPriorityFee!
          : maxCapMicroLamports;
    }
  }

  // if (priorityFeeMicroLamports > 0) {
  //   message = prependTransactionMessageInstruction(
  //     getSetComputeUnitPriceInstruction({
  //       microLamports: priorityFeeMicroLamports,
  //     }),
  //     message
  //   );
  // }
  message = prependTransactionMessageInstruction(
    getSetComputeUnitLimitInstruction({
      units: Math.ceil(
        computeUnits *
          (computeUnitMarginMultiplier ??
            DEFAULT_COMPUTE_UNIT_MARGIN_MULTIPLIER)
      ),
    }),
    message
  );

  return message;
}

function getWritableAccounts(ixs: readonly Instruction[]) {
  const writable = new Set<Address>();
  ixs.forEach((ix) => {
    if (ix.accounts) {
      ix.accounts.forEach((acc) => {
        if (isWritableRole(acc.role)) writable.add(acc.address);
      });
    }
  });
  return Array.from(writable);
}

async function calculateDynamicPriorityFees(
  rpc: Rpc<SolanaRpcApi>,
  instructions: readonly Instruction[],
  supportsPercentile: boolean,
  percentile: Percentile
) {
  const writableAccounts = getWritableAccounts(instructions);
  if (supportsPercentile) {
    return await getRecentPrioritizationFeesWithPercentile(
      rpc,
      writableAccounts,
      percentile
    );
  } else {
    const recent = await rpc
      .getRecentPrioritizationFees(writableAccounts)
      .send();
    const nonZero = recent
      .filter((pf) => pf.prioritizationFee > 0)
      .map((pf) => pf.prioritizationFee);
    const sorted = nonZero.sort((a, b) => Number(a - b));
    return (
      sorted[Math.floor(sorted.length * (parseInt(percentile) / 100))] ||
      BigInt(0)
    );
  }
}

async function getRecentPrioritizationFeesWithPercentile(
  rpc: Rpc<SolanaRpcApi>,
  // rpcEndpoint: string,
  writableAccounts: Address[],
  percentile: Percentile
) {
  const nodes = await rpc.getClusterNodes().send();

  const response = await fetch(nodes[0]?.rpc!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getRecentPrioritizationFees",
      params: [
        {
          lockedWritableAccounts: writableAccounts,
          percentile: parseInt(percentile) * 100,
        },
      ],
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }
  const last150Slots = data.result as RecentPrioritizationFee[];
  last150Slots.sort((a, b) => Number(a.slot - b.slot));
  const last50Slots = last150Slots.slice(-50);
  const nonZeroFees = last50Slots.filter((slot) => slot.prioritizationFee > 0);
  if (nonZeroFees.length === 0) return BigInt(0);
  const sorted = nonZeroFees
    .map((slot) => slot.prioritizationFee)
    .sort((a, b) => Number(a - b));
  const medianIndex = Math.floor(sorted.length / 2);
  return sorted[medianIndex];
}

type RecentPrioritizationFee = {
  /**
   * The per-compute-unit fee paid by at least one successfully
   * landed transaction, specified in increments of
   * micro-lamports (0.000001 lamports).
   */
  prioritizationFee: MicroLamports;
  /** Slot in which the fee was observed */
  slot: Slot;
};
