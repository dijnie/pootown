import type {
  // @ts-expect-error
  CompilableTransactionMessage,
  Instruction,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
  AccountLookupMeta,
  AccountMeta,
  TransactionMessageWithFeePayer,
  TransactionMessageWithFeePayerSigner,
  TransactionMessageWithBlockhashLifetime,
  TransactionVersion,
} from "@solana/kit";
import { estimateComputeUnitLimitFactory } from "@solana-program/compute-budget";
import { getJitoConfig, getRpcConfig } from "./config";
import { processJitoTipForTxMessage } from "./jito";
import { processComputeBudgetForTxMessage } from "./compute-budget";

export type TxMessage = TransactionMessageWithFeePayerSigner<
  string,
  TransactionSigner<string>
> &
  Omit<
    TransactionMessageWithBlockhashLifetime &
      Readonly<{
        instructions: readonly Instruction<
          string,
          readonly (AccountLookupMeta<string, string> | AccountMeta<string>)[]
        >[];
        version: TransactionVersion;
      }>,
    "feePayer"
  >;

export type LegacyTxMessage = TransactionMessageWithFeePayer<string> &
  Omit<
    TransactionMessageWithBlockhashLifetime &
      Readonly<{
        instructions: readonly Instruction<
          string,
          readonly (AccountLookupMeta<string, string> | AccountMeta<string>)[]
        >[];
        version: TransactionVersion;
      }>,
    "feePayer"
  >;

export async function addPriorityInstructions(
  rpc: Rpc<SolanaRpcApi>,
  message: TxMessage | LegacyTxMessage,
  _signer: TransactionSigner
) {
  // const jito = getJitoConfig();

  // if (jito.type !== "none") {
  //   message = await processJitoTipForTxMessage(message, signer, jito, "solana");
  // }
  let computeUnits = await getComputeUnitsForTxMessage(rpc, message);

  return processComputeBudgetForTxMessage(rpc, message, computeUnits);
}

async function getComputeUnitsForTxMessage(
  rpc: Rpc<SolanaRpcApi>,
  txMessage: CompilableTransactionMessage
) {
  const estimator = estimateComputeUnitLimitFactory({
    rpc,
  });

  try {
    const estimate = await estimator(txMessage);
    return estimate;
  } catch {
    console.warn(
      "Transaction simulation failed, using 1,400,000 compute units"
    );
    return 1_400_000;
  }
}
