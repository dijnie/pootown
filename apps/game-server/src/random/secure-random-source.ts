import { createHmac, randomBytes } from "node:crypto";
import type { RandomCheckpoint, RandomSource } from "@pootown/game-core";

const ALGORITHM = "hmac-sha256-v1";
const SEED_BYTES = 32;

interface EncodedState {
  readonly counter: number;
  readonly seed: string;
}

function hasConsistentConsumption(counter: number, draws: number, bytesConsumed: number): boolean {
  if (counter === 0 || draws === 0 || bytesConsumed === 0) {
    return counter === 0 && draws === 0 && bytesConsumed === 0;
  }
  return draws <= counter && counter <= bytesConsumed &&
    counter >= Math.ceil(bytesConsumed / 32) && bytesConsumed <= draws * 4_096;
}

function encodeState(seed: Buffer, counter: number): string {
  return Buffer.from(JSON.stringify({ counter, seed: seed.toString("base64url") })).toString("base64url");
}

function decodeState(value: string): EncodedState | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
        Object.keys(parsed).length !== 2 || !("seed" in parsed) || !("counter" in parsed) ||
        typeof parsed.seed !== "string" || !Number.isSafeInteger(parsed.counter) || (parsed.counter as number) < 0) {
      return null;
    }
    const seed = Buffer.from(parsed.seed, "base64url");
    if (seed.length !== SEED_BYTES || seed.toString("base64url") !== parsed.seed) return null;
    return { seed: parsed.seed, counter: parsed.counter as number };
  } catch {
    return null;
  }
}

export class SecureRandomSource implements RandomSource {
  private draws = 0;
  private bytesConsumed = 0;

  public constructor(
    private readonly seed = randomBytes(SEED_BYTES),
    private counter = 0,
  ) {
    if (seed.length !== SEED_BYTES || !Number.isSafeInteger(counter) || counter < 0) {
      throw new Error("Secure random checkpoint is invalid");
    }
  }

  public nextBytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 1 || length > 4_096) {
      throw new Error("Random byte request is invalid");
    }
    const output = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const counterBytes = Buffer.allocUnsafe(8);
      counterBytes.writeBigUInt64BE(BigInt(this.counter));
      const block = createHmac("sha256", this.seed).update(counterBytes).digest();
      const blockLength = Math.min(block.length, length - offset);
      block.copy(output, offset, 0, blockLength);
      offset += blockLength;
      this.counter += 1;
    }
    this.draws += 1;
    this.bytesConsumed += length;
    return output;
  }

  public checkpoint(): RandomCheckpoint {
    return Object.freeze({
      algorithm: ALGORITHM,
      state: encodeState(this.seed, this.counter),
      draws: this.draws,
      bytesConsumed: this.bytesConsumed,
    });
  }

  public canResume(checkpoint: RandomCheckpoint): boolean {
    const decoded = checkpoint.algorithm === ALGORITHM ? decodeState(checkpoint.state) : null;
    return decoded !== null &&
      Number.isSafeInteger(checkpoint.draws) && checkpoint.draws >= 0 &&
      Number.isSafeInteger(checkpoint.bytesConsumed) && checkpoint.bytesConsumed >= 0 &&
      hasConsistentConsumption(decoded.counter, checkpoint.draws, checkpoint.bytesConsumed);
  }

  public fork(checkpoint: RandomCheckpoint): RandomSource | null {
    if (!this.canResume(checkpoint)) return null;
    const decoded = decodeState(checkpoint.state);
    if (decoded === null) return null;
    const fork = new SecureRandomSource(Buffer.from(decoded.seed, "base64url"), decoded.counter);
    fork.draws = checkpoint.draws;
    fork.bytesConsumed = checkpoint.bytesConsumed;
    return fork;
  }
}
