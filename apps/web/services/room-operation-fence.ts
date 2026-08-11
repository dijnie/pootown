export class RoomOperationFence {
  private generation = 0;

  public start(): number {
    this.generation += 1;
    return this.generation;
  }

  public isCurrent(operation: number): boolean {
    return operation === this.generation;
  }

  public invalidate(): void {
    this.generation += 1;
  }
}
