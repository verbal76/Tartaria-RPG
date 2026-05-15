export function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(sides);
  return total;
}

export function parseDiceNotation(notation: string): { count: number; sides: number; bonus: number } | null {
  const cleaned = notation.replace(/\s+/g, '').toLowerCase();
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(cleaned);
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
