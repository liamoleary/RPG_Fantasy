/**
 * Seeded RNG. ALL randomness in engine/ flows through here (§12.3 rule 1).
 * mulberry32 — small, fast, deterministic across platforms.
 */

export interface RNG {
  /** [0,1) */
  next(): number
  /** integer in [0, n) */
  int(n: number): number
  /** integer in [lo, hi] inclusive */
  range(lo: number, hi: number): number
  pick<T>(arr: readonly T[]): T
  shuffle<T>(arr: readonly T[]): T[]
  /** weighted pick; weights parallel to items, all > 0 */
  weighted<T>(items: readonly T[], weights: readonly number[]): T
  /** true with probability p */
  chance(p: number): boolean
  /** fork a child stream (deterministic, derived from current state) */
  fork(tag: number): RNG
  /** current internal state — lets run state be serialized mid-run */
  state(): number
}

export function makeRng(seed: number): RNG {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: RNG = {
    next,
    int: (n) => (n <= 0 ? 0 : Math.floor(next() * n) % n),
    range: (lo, hi) => lo + rng.int(hi - lo + 1),
    pick: (arr) => arr[rng.int(arr.length)],
    shuffle: (arr) => {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1)
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    weighted: (items, weights) => {
      let total = 0
      for (const w of weights) total += w
      let roll = next() * total
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i]
        if (roll <= 0) return items[i]
      }
      return items[items.length - 1]
    },
    chance: (p) => next() < p,
    fork: (tag) => makeRng((a ^ Math.imul(tag + 1, 0x9e3779b1)) >>> 0),
    state: () => a,
  }
  return rng
}

/** Deterministic string -> 32-bit seed (for naming a run from a word). */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}
