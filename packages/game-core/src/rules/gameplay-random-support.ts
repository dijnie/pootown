import type { RandomCheckpoint, RandomSource } from "../ports/random-source";

function canResume(randomSource: RandomSource, value: RandomCheckpoint): boolean {
  try {
    return randomSource.canResume(value) === true;
  } catch {
    return false;
  }
}

export function readRandomCheckpoint(randomSource: RandomSource): RandomCheckpoint | null {
  let value: unknown;
  try {
    value = randomSource.checkpoint();
  } catch {
    return null;
  }
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !("algorithm" in value) || typeof value.algorithm !== "string" || value.algorithm.length < 1 || value.algorithm.length > 64 ||
    !("state" in value) || typeof value.state !== "string" || value.state.length < 1 || value.state.length > 4_096 ||
    !("draws" in value) || !Number.isSafeInteger(value.draws) || (value.draws as number) < 0 ||
    !("bytesConsumed" in value) || !Number.isSafeInteger(value.bytesConsumed) || (value.bytesConsumed as number) < 0
  ) return null;
  return {
    algorithm: value.algorithm,
    state: value.state,
    draws: value.draws as number,
    bytesConsumed: value.bytesConsumed as number,
  };
}

export function forkGameplayRandomSource(
  randomSource: RandomSource,
  checkpoint: RandomCheckpoint,
): RandomSource | null {
  if (typeof randomSource.fork !== "function") return null;
  let fork: RandomSource | null;
  try {
    fork = randomSource.fork(checkpoint);
  } catch {
    return null;
  }
  return fork !== null && fork !== randomSource && canResume(fork, checkpoint) ? fork : null;
}

export function isAdvancedGameplayCheckpoint(
  previous: RandomCheckpoint,
  next: RandomCheckpoint,
  minimumBytesConsumed: number,
): boolean {
  return (
    Number.isSafeInteger(minimumBytesConsumed) &&
    minimumBytesConsumed > 0 &&
    next.algorithm === previous.algorithm &&
    next.draws > previous.draws &&
    next.bytesConsumed >= previous.bytesConsumed + minimumBytesConsumed
  );
}

export function canResumeGameplayCheckpoint(
  randomSource: RandomSource,
  checkpoint: RandomCheckpoint,
): boolean {
  return canResume(randomSource, checkpoint);
}
