export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class XorShift32 {
  #state: number;
  #position = 0;
  constructor(seed: number | string) { const initial = typeof seed === "string" ? fnv1a32(seed) : seed >>> 0; this.#state = initial || 0x6d2b79f5; }
  get position(): number { return this.#position; }
  get state(): number { return this.#state; }
  nextUint32(): number { let value = this.#state; value ^= value << 13; value ^= value >>> 17; value ^= value << 5; this.#state = value >>> 0; this.#position += 1; return this.#state; }
  next(): number { return this.nextUint32() / 0x1_0000_0000; }
}
