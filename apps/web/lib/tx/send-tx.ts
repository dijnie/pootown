import type {
  Address,
  Instruction,
  FullySignedTransaction,
  Signature,
  Commitment,
  Rpc,
  SolanaRpcApi,
  TransactionSigner,
} from "@solana/kit";
import {
  assertIsFullySignedTransaction,
  getBase64EncodedWireTransaction,
  getBase58Decoder,
  address,
  getTransactionDecoder,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { buildTransaction, buildTransactionLegacy } from "./build-tx";
import { WalletWithMetadata } from "@privy-io/react-auth";
import { signTransactionWithPrivy } from "../privy";

export async function buildAndSendTransaction(
  rpc: Rpc<SolanaRpcApi>,
  instructions: Instruction[],
  payer: TransactionSigner,
  lookupTableAddresses?: (Address | string)[],
  commitment: Commitment = "confirmed",
  er: boolean = false
) {
  const tx = await buildTransaction(
    rpc,
    instructions,
    payer,
    lookupTableAddresses,
    er
  );

  // @ts-expect-error
  assertIsFullySignedTransaction(tx);
  return sendTransaction(rpc, tx, commitment, er);
}

export async function sendTransaction(
  rpc: Rpc<SolanaRpcApi>,
  transaction: FullySignedTransaction,
  commitment: Commitment = "confirmed",
  er: boolean = false
): Promise<Signature> {
  const txHash = getTxHash(transaction);
  // @ts-expect-error
  const encodedTransaction = getBase64EncodedWireTransaction(transaction);
  if (!er) {
    const simResult = await rpc
      .simulateTransaction(encodedTransaction, {
        encoding: "base64",
      })
      .send();

    if (simResult.value.err) {
      console.log("loggsss", simResult.value.logs);
      throw new Error(
        `Transaction simulation failed: ${JSON.stringify(
          simResult.value.err,
          (_key, value) =>
            typeof value === "bigint" ? value.toString() : value
        )}`
      );
    }
  }

  const expiryTime = Date.now() + 90_000;
  let lastError = null;

  while (Date.now() < expiryTime) {
    try {
      await rpc
        .sendTransaction(encodedTransaction, {
          maxRetries: BigInt(0),
          skipPreflight: true,
          encoding: "base64",
        })
        .send();

      const { value } = await rpc.getSignatureStatuses([txHash]).send();
      const status = value[0];
      if (
        status?.confirmationStatus === commitment ||
        status?.confirmationStatus === "finalized"
      ) {
        if (status.err) {
          if (
            typeof status.err === "object" &&
            "InstructionError" in status.err
          ) {
            const [_instructionIndex, instructionError] =
              status.err.InstructionError;

            if (
              typeof instructionError === "object" &&
              "Custom" in instructionError
            ) {
              const errorCode = instructionError.Custom;

              if (errorCode >= 6000 && errorCode <= 6039) {
                throw new Error(
                  `Chess game error: ${getChessErrorMessage(errorCode)}`
                );
              }
            }
          }

          lastError = status.err;
        }
        return txHash;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Chess game error:")
      ) {
        throw error;
      }
      console.log("log1", error);
      continue;
    }
  }

  if (lastError) {
    throw new Error(`Transaction failed: ${JSON.stringify(lastError)}`);
  }

  throw new Error("Transaction expired");
}

function getChessErrorMessage(errorCode: number): string {
  const errorMessages: Record<number, string> = {
    6000: "Invalid admin",
    6001: "Entry fee is too high",
    6002: "Insufficient funds to create game",
    6003: "Game is not in waiting state",
    6004: "Player is not part of this game",
    6005: "Game is not active",
    6006: "Not player's turn",
    6007: "Invalid move",
    6008: "Game already finished",
    6009: "Player already deposited",
    6010: "Entry fee required",
    6011: "Unauthorized action",
    6012: "Invalid game state",
    6013: "Time limit exceeded",
    6014: "Invalid piece promotion",
    6015: "King in check",
    6016: "Move would leave king in check",
    6017: "Draw offer not pending",
    6018: "Cannot offer draw",
    6019: "Cannot join your own game",
    6020: "Game is already full",
    6021: "Invalid square",
    6022: "No piece at source square",
    6023: "Not your piece",
    6024: "Promotion required",
    6025: "King not found",
    6026: "Game is not finished yet",
    6027: "Winnings have already been distributed",
    6028: "No funds available to distribute",
    6029: "No winner has been determined",
    6030: "Invalid game result for distribution",
    6031: "Player has already claimed winnings",
    6032: "Draw offers are not allowed in this game",
    6033: "Draw offer already pending",
    6034: "No draw offer pending",
    6035: "Cannot accept your own draw offer",
    6036: "Cannot reject your own draw offer",
    6037: "Only the player who didn't offer can accept/reject",
    6038: "Invalid piece type",
    6039: "Too many moves made in this game",
  };

  return errorMessages[errorCode] || `Unknown Chess error: ${errorCode}`;
}

function getTxHash(transaction: FullySignedTransaction) {
  // @ts-expect-error
  const [signature] = Object.values(transaction.signatures);
  // @ts-expect-error
  const txHash = getBase58Decoder().decode(signature!) as Signature;
  return txHash;
}

export async function buildAndSendTransactionWithPrivy(
  rpc: Rpc<SolanaRpcApi>,
  instructions: Instruction[],
  wallet: WalletWithMetadata,
  lookupTableAddresses?: (Address | string)[],
  commitment: Commitment = "confirmed",
  er: boolean = false
) {
  const tx = await buildTransactionLegacy(
    rpc,
    instructions,
    address(wallet.address),
    lookupTableAddresses as Address[],
    er
  );

  const serializedTransaction = getBase64EncodedWireTransaction(tx);

  const signedTxResponse = await signTransactionWithPrivy(
    wallet.id!,
    serializedTransaction
  );

  const txBytes = Buffer.from(
    signedTxResponse.data.signed_transaction,
    "base64"
  );
  // @ts-expect-error
  const transaction = getTransactionDecoder().decode(
    txBytes
  ) as FullySignedTransaction;

  return sendTransaction(rpc, transaction, commitment, er);
}
