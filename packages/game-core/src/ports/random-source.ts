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
}
