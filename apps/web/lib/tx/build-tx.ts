import type {
  TransactionSigner,
  Address,
  Rpc,
  SolanaRpcApi,
  FullySignedTransaction,
  TransactionWithLifetime,
  Instruction,
} from "@solana/kit";
import {
  compressTransactionMessageUsingAddressLookupTables,
  assertAccountDecoded,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  createNoopSigner,
  compileTransaction,
} from "@solana/kit";
import { fetchAllMaybeAddressLookupTable } from "@solana-program/address-lookup-table";
import { addPriorityInstructions } from "./priority-fees";
import { normalizeAddresses } from "./config";

/**
 * Builds and signs a transaction from the given instructions and configuration.
 *
 * @param {Instruction[]} instructions - Array of instructions to include in the transaction
 * @param {TransactionSigner} feePayer - The signer that will pay for the transaction
 * @param {(Address | string)[]} [lookupTableAddresses] - Optional array of address lookup table addresses to compress the transaction
 *
 * @returns {Promise<Readonly<FullySignedTransaction & TransactionWithLifetime>>} A signed and encoded transaction
 *
 * @example
 * const instructions = [createATAix, createTransferSolInstruction];
 * const feePayer = wallet.publicKey;
 * const message = await buildTransaction(
 *   instructions,
 *   feePayer,
 * );
 */
export async function buildTransaction(
  rpc: Rpc<SolanaRpcApi>,
  instructions: Instruction[],
  feePayer: TransactionSigner | Address,
  lookupTableAddresses?: (Address | string)[],
  er: boolean = false
): Promise<Readonly<FullySignedTransaction & TransactionWithLifetime>> {
  return buildTransactionMessage(
    rpc,
    instructions,
    !("address" in feePayer) ? createNoopSigner(feePayer) : feePayer,
    normalizeAddresses(lookupTableAddresses),
    er
  );
}

async function buildTransactionMessage(
  rpc: Rpc<SolanaRpcApi>,
  instructions: Instruction[],
  signer: TransactionSigner,
  lookupTableAddresses?: Address[],
  er: boolean = false
) {
  let message = await prepareTransactionMessage(instructions, rpc, signer);

  if (lookupTableAddresses?.length) {
    const lookupTableAccounts = await fetchAllMaybeAddressLookupTable(
      rpc,
      lookupTableAddresses
    );
    const tables = lookupTableAccounts.reduce((prev, account) => {
      if (account.exists) {
        assertAccountDecoded(account);
        prev[account.address] = account.data.addresses;
      }
      return prev;
    }, {} as { [address: Address]: Address[] });

    message = compressTransactionMessageUsingAddressLookupTables(
      message,
      tables
    );
  }

  return signTransactionMessageWithSigners(
    er ? message : await addPriorityInstructions(rpc, message, signer)
  );
}

async function prepareTransactionMessage(
  instructions: Instruction[],
  rpc: Rpc<SolanaRpcApi>,
  signer: TransactionSigner
) {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({
      commitment: "confirmed",
    })
    .send();

  return pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );
}

// ------------------ legacy
export async function buildTransactionLegacy(
  rpc: Rpc<SolanaRpcApi>,
  instructions: Instruction[],
  feePayer: Address,
  lookupTableAddresses?: Address[],
  er: boolean = false
) {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({
      commitment: "confirmed",
    })
    .send();

  let message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => setTransactionMessageFeePayer(feePayer, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );

  if (lookupTableAddresses?.length) {
    const lookupTableAccounts = await fetchAllMaybeAddressLookupTable(
      rpc,
      lookupTableAddresses
    );
    const tables = lookupTableAccounts.reduce((prev, account) => {
      if (account.exists) {
        assertAccountDecoded(account);
        prev[account.address] = account.data.addresses;
      }
      return prev;
    }, {} as { [address: Address]: Address[] });

    message = compressTransactionMessageUsingAddressLookupTables(
      message,
      tables
    );
  }

  return compileTransaction(
    er ? message : await addPriorityInstructions(rpc, message, null as any)
  );
}

// async function prepareTransactionMessageLegacy(
//   instructions: Instruction[],
//   rpc: Rpc<SolanaRpcApi>
// ) {
//   const { value: blockhash } = await rpc
//     .getLatestBlockhash({
//       commitment: "confirmed",
//     })
//     .send();

//   return pipe(
//     createTransactionMessage({ version: 0 }),
//     (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
//     // (tx) => setTransactionMessageFeePayerSigner(signer, tx),
//     (tx) => appendTransactionMessageInstructions(instructions, tx)
//   );
// }

// async function buildTransactionMessageLegacy(
//   rpc: Rpc<SolanaRpcApi>,
//   instructions: Instruction[],
//   lookupTableAddresses?: Address[],
//   er: boolean = false
// ) {
//   let message = await prepareTransactionMessageLegacy(instructions, rpc);

//   if (lookupTableAddresses?.length) {
//     const lookupTableAccounts = await fetchAllMaybeAddressLookupTable(
//       rpc,
//       lookupTableAddresses
//     );
//     const tables = lookupTableAccounts.reduce(
//       (prev, account) => {
//         if (account.exists) {
//           assertAccountDecoded(account);
//           prev[account.address] = account.data.addresses;
//         }
//         return prev;
//       },
//       {} as { [address: Address]: Address[] }
//     );

//     message = compressTransactionMessageUsingAddressLookupTables(
//       message,
//       tables
//     );
//   }

//   // return signTransactionMessageWithSigners(

//   // );
//   return er
//     ? message
//     : await addPriorityInstructions(
//         rpc,
//         message,
//         createNoopSigner(address("11111111111111111111111111111111"))
//       );
// }
