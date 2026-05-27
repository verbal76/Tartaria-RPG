export class EmbeddingCache {
  private cache: Map<string, Float32Array>;
  private maxSize: number;

  constructor(maxSize: number = 2000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(text: string): Float32Array | undefined {
    const v = this.cache.get(text);
    if (v) {
      this.cache.delete(text);
      this.cache.set(text, v);
    }
    return v;
  }

  set(text: string, vector: Float32Array): void {
    if (this.cache.has(text)) {
      this.cache.delete(text);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(text, vector);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
