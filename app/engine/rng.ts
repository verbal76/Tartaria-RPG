export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function rollDice(count: number, sides: number): number {
  // arb118 — clamp to sane bounds so a malformed / data-driven notation (e.g.
  // "999999d6") can't spin a multi-million-iteration loop (latent DoS). No legit
  // notation in the game exceeds ~2d20, so this never touches real rolls.
  const c = Math.max(0, Math.min(1000, Math.floor(count) || 0));
  const s = Math.max(1, Math.min(1000, Math.floor(sides) || 1));
  let total = 0;
  for (let i = 0; i < c; i++) total += rollDie(s);
  return total;
}

export function parseDiceNotation(notation: string): { count: number; sides: number; bonus: number } | null {
  const cleaned = notation.replace(/\s+/g, '').toLowerCase();
  // OTA-420 — [audit fix #2] enemy damage is stored WITH a type word, e.g.
  // "2D6 Psychic" / "3D8 Aetheric ×2". The old anchored ^…$ failed those (after
  // whitespace-strip → "2d6psychic"), so rollFromNotation returned 0 and the
  // hardest hitters silently fell back to 1d6. Match the FIRST NdM(±N) token
  // anywhere and ignore any leading/trailing type text. Clean inputs ("2d6",
  // "1d4") match identically; the damage-type word is parsed separately by
  // parseIncomingDamageType, and the ×2/"twice" double-strike is handled by the
  // caller — so dropping the junk here only fixes the dice roll.
  const match = /(\d+)d(\d+)([+-]\d+)?/.exec(cleaned);
  if (!match) return null;
  const countStr = match[1]!;
  const sidesStr = match[2]!;
  const bonusStr = match[3];
  return {
    count: parseInt(countStr, 10),
    sides: parseInt(sidesStr, 10),
    bonus: bonusStr ? parseInt(bonusStr, 10) : 0,
  };
}

export function rollFromNotation(notation: string): number {
  const parsed = parseDiceNotation(notation);
  if (!parsed) return 0;
  return rollDice(parsed.count, parsed.sides) + parsed.bonus;
}

export function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() called on empty array');
  const i = Math.floor(Math.random() * items.length);
  return items[i] as T;
}

// Module-level cursors so a given pool cycles through its entries before
// repeating, regardless of how many times it's called. Use a stable string
// key per pool (caller-provided) so unrelated pools don't share state.
const rotationCursors = new Map<string, number>();
const lastSeenIndex = new Map<string, number>();

/**
 * Round-robin picker — every entry shows up once before any entry shows
 * up twice. The cursor is module-scoped and per-key, so callers using
 * the same `key` from different sites share the rotation.
 *
 * Playtest log showed the same Arbiter filler line (e.g. "Tartaria was a
 * place of life and power once") appearing ~5 minutes apart because
 * `pick()` is random and the dedup window only catches near-immediate
 * repeats. This makes filler feel curated even on long sessions.
 *
 * The optional `avoidLast` flag also refuses to return the immediately
 * previous pick for the same key — useful when you want sequential calls
 * to look different even if the pool gets reset.
 */
export function rotatingPick<T>(items: readonly T[], key: string, avoidLast = true): T {
  if (items.length === 0) throw new Error('rotatingPick() called on empty array');
  if (items.length === 1) return items[0] as T;
  const prev = rotationCursors.get(key) ?? -1;
  let next = (prev + 1) % items.length;
  if (avoidLast) {
    const last = lastSeenIndex.get(key);
    if (last === next) next = (next + 1) % items.length;
  }
  rotationCursors.set(key, next);
  lastSeenIndex.set(key, next);
  return items[next] as T;
}

// Test-only escape hatch — clears rotation state so tests start fresh.
export function resetRotationCursors(): void {
  rotationCursors.clear();
  lastSeenIndex.clear();
}

export function pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T {
  if (items.length === 0) throw new Error('pickWeighted() called on empty array');
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(items);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

export function chance(percent: number): boolean {
  return Math.random() * 100 < percent;
}
