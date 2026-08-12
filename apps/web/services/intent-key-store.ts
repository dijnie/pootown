export class IntentKeyStore {
  private readonly keys = new Map<string, string>();

  public constructor(private readonly createKey: () => string = () => crypto.randomUUID()) {}

  public get(intent: string): string {
    const existing = this.keys.get(intent);
    if (existing !== undefined) return existing;
    const key = this.createKey();
    this.keys.set(intent, key);
    return key;
  }

  public complete(intent: string): void {
    this.keys.delete(intent);
  }

  public clear(): void {
    this.keys.clear();
  }
}
