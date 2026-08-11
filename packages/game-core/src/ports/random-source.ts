export interface RandomCheckpoint {
  readonly algorithm: string;
  readonly state: string;
  readonly draws: number;
  readonly bytesConsumed: number;
}

export interface RandomSource {
  nextBytes(length: number): Uint8Array;
  checkpoint(): RandomCheckpoint;
  canResume(checkpoint: RandomCheckpoint): boolean;
  /** Creates an isolated cursor at a persisted checkpoint for an atomic command attempt. */
  fork?(checkpoint: RandomCheckpoint): RandomSource | null;
}
