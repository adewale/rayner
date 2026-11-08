/**
 * A map that keeps the `size` entries used most recently: reading or writing an entry makes it
 * the newest, and a write past `size` drops the oldest. The player keeps its resting pictures in
 * one, so a reader who visits many steps or live states holds a bounded number of SVG copies.
 */
export class Lru<K, V> {
  readonly size: number;
  #entries = new Map<K, V>();
  constructor(size: number) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError(`new Lru(): size ${size} is not a positive integer; give at least 1`);
    this.size = size;
  }
  get(key: K): V | undefined {
    if (!this.#entries.has(key)) return undefined;
    const value = this.#entries.get(key)!;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }
  set(key: K, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.size) break;
      this.#entries.delete(oldest);
    }
  }
  has(key: K): boolean {
    return this.#entries.has(key);
  }
  /** The keys, oldest first. */
  keys(): K[] {
    return [...this.#entries.keys()];
  }
  clear(): void {
    this.#entries.clear();
  }
}
