export class AuthMutationQueue {
  private tail: Promise<void> = Promise.resolve();

  public run<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.tail.catch(() => undefined).then(operation);
    this.tail = pending.then(() => undefined, () => undefined);
    return pending;
  }
}
