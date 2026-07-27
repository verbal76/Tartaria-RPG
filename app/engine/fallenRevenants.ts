// OTA-998 — THE HOLLOWED. The install's Fallen roll made flesh: a character
// who died in the mud does not always stay down. Unlike the other Aetherkin —
// frightened, defensive things clutching at what they were — a Hollowed
// REMEMBERS being a warrior. It kept the drilled muscle, the custom kit it
// died in, and the hunger for the fight it never finished. It lost only the
// fear. Each is a one-time BOSS event; putting one down is a mercy every
// faction understands (no Aetherkin reverence penalty — see isRevenant), and
// the Fallen memorial marks them "put to rest".
import type { Enemy, FallenGearPiece, InventoryItem } from './types';
import type { FallenHero } from './saveSystem';

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const REVENANT_TRAIT = 'fallen_revenant';

export function revenantName(f: Pick<FallenHero, 'name'>): string {
  return `Hollowed ${f.name}`;
}

/** Trait-marked, and the name carries no 'aetherkin' — BOTH on purpose, so
 *  aetherkin.isAetherkin() stays false and the kill never costs reverence
 *  standing. Locked by test. */
export function isRevenant(enemy: { traits?: string[] } | null | undefined): boolean {
  return !!enemy?.traits?.includes(REVENANT_TRAIT);
}

// ---- install-wide pool cache (loadFallen is async; the spawner is sync) ----
let FALLEN_CACHE: FallenHero[] | null = null;
export function primeFallenCache(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadFallen } = require('./saveSystem') as typeof import('./saveSystem');
  void loadFallen().then((f) => { FALLEN_CACHE = f; }).catch(() => { /* stay empty */ });
}
export function cachedFallen(): FallenHero[] {
  if (FALLEN_CACHE === null) { FALLEN_CACHE = []; primeFallenCache(); }
  return FALLEN_CACHE;
}
export function _setFallenCacheForTests(f: FallenHero[] | null): void { FALLEN_CACHE = f; }
/** OTA-991 — a death recorded THIS session joins the pool immediately. The cache
 *  was primed once per process and only markAvenged wrote to it, so a fallen
 *  predecessor could not rise for a successor until app restart. */
export function appendFallenToCache(f: FallenHero): void {
  if (FALLEN_CACHE) FALLEN_CACHE = [...FALLEN_CACHE, f];
}
export function markAvenged(ts: number, by: string): void {
  if (FALLEN_CACHE) {
    FALLEN_CACHE = FALLEN_CACHE.map((f) => (f.ts === ts ? { ...f, avengedBy: by, avengedTs: Date.now() } : f));
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { markFallenAvenged } = require('./saveSystem') as typeof import('./saveSystem');
  // OTA-994 — the memorial write RETRIES. Fire-and-forget meant one failed disk
  // write let a put-to-rest revenant rise again after an app restart.
  void (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await markFallenAvenged(ts, by); return; }
      catch { await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); }
    }
  })();
}

/** The kit they died in. Post-998 deaths record it; pre-998 records get a
 *  SEEDED custom loadout (Rare-or-better) so the same fallen always wears —
 *  and can drop — the same gear. */
export function revenantGearNames(f: FallenHero): string[] {
  if (f.gearNames && f.gearNames.length > 0) return f.gearNames.slice(0, 6);
  type GearRow = { name: string; rarity: string };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wj = require('../data/items/weapons.json') as unknown;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const aj = require('../data/items/armor.json') as unknown;
  const wRows: GearRow[] = Array.isArray(wj) ? (wj as GearRow[]) : ((wj as { weapons?: GearRow[] }).weapons ?? []);
  const aRows: GearRow[] = Array.isArray(aj) ? (aj as GearRow[]) : ((aj as { armor?: GearRow[] }).armor ?? []);
  const rng = mulberry32(hashSeed(`fallen:${f.name}:${f.ts}`));
  const out: string[] = [];
  const takeFrom = (rows: Array<{ name: string; rarity: string }>, n: number) => {
    const pool = rows.filter((r) => r.rarity === 'Rare' || r.rarity === 'Legendary');
    for (let i = 0; i < n && pool.length > 0; i++) {
      const p = pool[Math.floor(rng() * pool.length)]!;
      if (!out.includes(p.name)) out.push(p.name);
    }
  };
  takeFrom(wRows, 1);
  takeFrom(aRows, 2);
  if (out.length === 0) out.push('Aetheric Shard');
  return out;
}

/** Boss-band revenant: their lifetime record feeds the monster — your best
 *  dead make the worst Hollowed. Standard defeat-path loot rolls draw from
 *  the died-in kit (the "chance to drop what they wore"). */
export function revenantFromFallen(f: FallenHero, playerHpMax: number): Enemy {
  const gear = revenantGearNames(f);
  pinSeededKit(f, gear);
  const kills = Math.max(0, Math.floor(f.kills || 0));
  const hp = Math.max(60, Math.min(Math.round(Math.max(40, playerHpMax) * 2.5), 90 + kills * 2));
  const damage = kills >= 150 ? '3d8' : kills >= 60 ? '2d8' : '2d6';
  return {
    name: revenantName(f),
    type: 'Hollowed Revenant',
    abilityPoint: 'Strength 6',
    attack: `${gear[0] ?? 'Mud-Fused Blade'} (remembered)`,
    damage,
    hp,
    rarity: 'Legendary',
    loot: gear.slice(0, 4),
    boss: true,
    traits: [REVENANT_TRAIT, 'boss'],
    flavor: `${f.raceName}, once. ${kills} foes to the name before ${f.locationName} took them. The mud gave back the hunger and kept the fear.`,
  };
}

export function revenantIntroBeats(f: FallenHero, wearsYourFace: boolean): {
  emergence: string; identification: string; identity: string; character: string;
} {
  return {
    emergence: 'The mud ahead stands up wearing armor. Not the shapeless dead — this one moves like drilled muscle, sets its feet like it has done ten thousand times, and it is already closing.',
    identification: wearsYourFace
      ? `The Arbiter goes very quiet. "Steady. It wears your face. ${f.name} died at ${f.locationName} — and the mud remembers everything you taught it."`
      : `"${f.name}," the Arbiter says, barely above the wind. "Fell at ${f.locationName}, ${f.hours} hours into the walk. The roll remembers them. The mud kept them."`,
    identity: `${f.epitaph} Where the other Aetherkin cower and clutch at what they were, this one remembers the WORK — ${f.kills} foes bested — and it hungers for the fight it never finished.`,
    character: 'It cannot be talked down and it will not stop. Put them to rest. Nothing else is mercy.',
  };
}

export function revenantDefeatLines(f: FallenHero, by: string): { world: string; reward: string } {
  return {
    world: `The hunger goes out of them first. Then the light. For one clear breath the mud lets go, and it is only ${f.name} again — ${f.raceName}, ${f.kills} foes to the name, the warrior the roll remembers. They rest now. The Aether does not get this one back.`,
    reward: `✦ ${f.name} is at rest. The Fallen roll marks them: put to rest by ${by}.`,
  };
}

// ---- OTA — THE RECLAIM. The kit is captured as FULL ITEM COPIES at death and
// handed back as REAL gear when the Hollowed falls: the WEAPON is guaranteed
// (a one-time boss — losing the signature piece to a dice roll could never be
// retried), armor pieces ride the normal chance rolls, and everything returns
// PRISTINE — the mud kept it as it was carried (owner's calls, 2026-07-27).

/** Capture the equipped kit as full item copies (id/quantity stripped, slot
 *  kept, weapon first). Prefers the exact INSTANCE via the equipped `<slot>Id`
 *  pointer so a fused piece keeps its rolled stats; falls back to name match. */
export function buildFallenGearSnapshot(p: {
  equipped?: object | null;
  inventory?: InventoryItem[] | null;
}): FallenGearPiece[] {
  const eq = (p.equipped ?? {}) as Record<string, string | undefined>;
  const inv = p.inventory ?? [];
  const slotPrio = ['main', 'off', 'chest', 'head', 'legs', 'feet', 'amulet', 'ring', 'ring2', 'ring3'];
  const out: FallenGearPiece[] = [];
  const slots = Object.keys(eq)
    .filter((k) => !!eq[k] && !k.endsWith('Id'))
    .sort((a, b) => {
      const ia = slotPrio.indexOf(a); const ib = slotPrio.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  for (const slot of slots.slice(0, 6)) {
    const name = String(eq[slot]);
    const instId = eq[`${slot}Id`];
    const item = (instId ? inv.find((i) => i.id === instId) : undefined) ?? inv.find((i) => i.name === name);
    if (item) {
      const copy = JSON.parse(JSON.stringify(item)) as Omit<InventoryItem, 'id' | 'quantity'> & { id?: string; quantity?: number };
      delete copy.id;
      delete copy.quantity;
      out.push({ ...(copy as Omit<InventoryItem, 'id' | 'quantity'>), name: item.name, slot });
    } else {
      // Equipped name with no live inventory row (legacy save shapes) — keep
      // the name so the kit still reads right; kind from the slot.
      out.push({ name, kind: slot === 'main' || slot === 'off' ? 'weapon' : 'armor', tags: [], slot } as FallenGearPiece);
    }
  }
  return out;
}

/** Rebuild a snapshot piece as a live, PRISTINE inventory item: fresh instance
 *  id, single copy, durability restored to max (owner's call — the mud kept it
 *  whole). Instance stats, coatings and unique rolls ride the copy through. */
export function reconstructFallenPiece(piece: FallenGearPiece, id: string): InventoryItem {
  const { slot: _slot, ...rest } = piece;
  const dur = rest.durability ? { current: rest.durability.max, max: rest.durability.max } : undefined;
  return {
    ...(rest as Omit<InventoryItem, 'id' | 'quantity'>),
    id,
    quantity: 1,
    tags: Array.from(new Set([...(rest.tags ?? []), 'loot'])),
    ...(dur ? { durability: dur } : {}),
  };
}

/** The guaranteed reclaim: the weapon they died holding (slot 'main', else the
 *  first snapshot piece). Null when the record predates snapshots. */
export function revenantReclaimWeapon(f: Pick<FallenHero, 'gear'>): FallenGearPiece | null {
  const gear = f.gear ?? [];
  return gear.find((g) => g.slot === 'main') ?? gear[0] ?? null;
}

/** OTA-994 — pin a SYNTHESIZED (pre-snapshot) kit at first generation: cache now,
 *  disk best-effort. Without this the kit was only stable per BUILD — a Rare+
 *  catalog edit silently re-dressed every legacy fallen. */
export function pinSeededKit(f: FallenHero, names: string[]): void {
  if (f.gearNames && f.gearNames.length > 0) return;
  if (FALLEN_CACHE) {
    FALLEN_CACHE = FALLEN_CACHE.map((x) => (x.ts === f.ts ? { ...x, gearNames: names } : x));
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pinFallenGearNames } = require('./saveSystem') as typeof import('./saveSystem');
  void pinFallenGearNames(f.ts, names).catch(() => { /* pinned in cache; disk is best-effort */ });
}
