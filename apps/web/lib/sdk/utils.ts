import { Address, createKeyPairFromBytes } from "@solana/kit";

/**
 * Generate a unique game ID based on timestamp and random value
 */
export function generateGameId(): bigint {
  const timestamp = BigInt(Date.now());
  const random = BigInt(Math.floor(Math.random() * 1000000));
  return timestamp * BigInt(1000000) + random;
}

/**
 * Validate if an address is a valid Solana address
 */
export function isValidAddress(address: string): boolean {
  try {
    // Basic validation - Solana addresses are 32 bytes encoded in base58
    return address.length >= 32 && address.length <= 44;
  } catch {
    return false;
  }
}

/**
 * Convert address to string for logging/display purposes
 */
export function addressToString(address: Address): string {
  return address.toString();
}

// 6weuckp6opHVSNpU4Xt3ogxLTGFLY6JJotSVEkYaMNWp
export async function fakePlayerA() {
  const keyPair = await createKeyPairFromBytes(
    new Uint8Array([
      246, 227, 0, 0, 146, 177, 195, 236, 22, 10, 39, 77, 251, 160, 221, 121,
      78, 161, 149, 69, 83, 255, 82, 216, 200, 222, 43, 173, 124, 89, 80, 206,

      /* 32 bytes representing the private key */
      /* 32 bytes representing the public key */
      88, 74, 168, 252, 206, 75, 216, 188, 102, 31, 173, 54, 202, 107, 202, 95,
      200, 74, 252, 2, 87, 249, 247, 104, 177, 68, 140, 33, 28, 35, 90, 133,
    ])
  );

  return keyPair;
}

// FNNABCPYdX2AC4WivKPm9SRVugVPXaJMZKaeCz8BC55f
export async function fakePlayerB() {
  const keyPair = await createKeyPairFromBytes(
    new Uint8Array([
      126, 157, 208, 106, 138, 14, 60, 200, 152, 84, 112, 99, 141, 142, 45, 185,
      140, 93, 169, 158, 2, 47, 44, 22, 253, 182, 104, 85, 72, 155, 183, 14,
      213, 124, 188, 212, 109, 186, 51, 215, 116, 44, 168, 28, 200, 181, 212,
      22, 27, 151, 191, 172, 204, 241, 123, 155, 129, 44, 82, 146, 62, 63, 174,
      22,
    ])
  );

  return keyPair;
}
