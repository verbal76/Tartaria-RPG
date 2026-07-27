// OTA-998 — LEGACY CATALOG-NAME MIGRATIONS. A catalog rename/removal MUST land an
// entry here in the SAME OTA (HANDOFF §3a rename policy). Keys are retired
// names; values are the surviving rows that inherit the instance. Applied by
// backfillPlayer on every load to: the inventory, every equipped slot name,
// the golem's held armament, and knownRecipes. Without this, a save holds a
// name the catalog no longer knows and every by-name resolution silently
// degrades to an inferred Common (the Boltcaster case).
import type { PlayerCharacter } from './types';

export const LEGACY_ITEM_RENAMES: Readonly<Record<string, string>> = {
  // Renamed endgame rifle (identical stats); saves held the dead name while
  // the build latch blocked ever making the new one.
  'Skyreacher Boltcaster': 'Beacon Rifle',
  // Re-slotted legs piece -> the cloak Mantle (see the slot move below).
  'Skyreacher Greaves': 'Skyreacher Mantle',
  // The torch family collapsed into the one Aetheric Torch.
  'Advanced Aetheric Torch': 'Aetheric Torch',
  'Endless Aether Torch': 'Aetheric Torch',
  // The original golem armaments retired for the tiered family — nearest
  // surviving neighbor by damage type first, then dice.
  'Mire Maul': 'Golem Sledge',
  'Sentinel Greatcleaver': 'Golem Greatsword',
  'Shard Glaive': 'Elder Golem Pike',
  'Aetheric Lance': 'Golem Aether-Lance',
};

export function migrateLegacyName(name: string | undefined): string | undefined {
  if (!name) return name;
  return LEGACY_ITEM_RENAMES[name] ?? name;
}

/** Rename every legacy-named reference on the player. Pure; returns the same
 *  object when nothing matches so load stays referentially cheap. */
export function applyLegacyItemRenames(p: PlayerCharacter): PlayerCharacter {
  const ren = LEGACY_ITEM_RENAMES as Record<string, string | undefined>;
  const eqIn = (p.equipped ?? {}) as Record<string, string | undefined>;
  const dirtyInv = (p.inventory ?? []).some((i) => !!ren[i.name]);
  const dirtyEq = Object.entries(eqIn).some(([k, v]) => !k.endsWith('Id') && !!v && !!ren[v]);
  const golemW = p.golem?.weapon;
  const dirtyGolem = !!(golemW && ren[golemW.name]);
  const dirtyRec = (p.knownRecipes ?? []).some((r) => !!ren[r]);
  if (!dirtyInv && !dirtyEq && !dirtyGolem && !dirtyRec) return p;
  const out: PlayerCharacter = { ...p };
  if (dirtyInv) {
    out.inventory = (p.inventory ?? []).map((i) => (ren[i.name] ? { ...i, name: ren[i.name]! } : i));
  }
  if (dirtyEq) {
    const eq: Record<string, string | undefined> = { ...eqIn };
    for (const [k, v] of Object.entries(eqIn)) {
      if (k.endsWith('Id') || !v) continue;
      if (ren[v]) eq[k] = ren[v];
    }
    // The Greaves (legs) became the Mantle (a CLOAK): move the slot too, or
    // the renamed piece sits as a phantom legs entry the catalog refuses.
    if (eq.legs === 'Skyreacher Mantle') {
      if (!eq.cloak) { eq.cloak = 'Skyreacher Mantle'; eq.cloakId = eq.legsId; }
      eq.legs = undefined;
      eq.legsId = undefined;
    }
    out.equipped = eq as PlayerCharacter['equipped'];
  }
  if (dirtyGolem && out.golem && golemW) {
    out.golem = { ...out.golem, weapon: { ...golemW, name: ren[golemW.name]! } };
  }
  if (dirtyRec) out.knownRecipes = (p.knownRecipes ?? []).map((r) => ren[r] ?? r);
  return out;
}
