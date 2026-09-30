// Strategic repair — Phase 12 (owner-authorized equipment/build-intelligence
// repair, following the read-only Life 4 postmortem + equipment audit).
//
// STRUCTURAL FIREWALL: this file imports ONLY production's own catalog
// resolvers (findCatalogItem, getItemPreview) — never the game store,
// telemetry, or any hidden-source table. It never mutates anything and
// never consumes RNG.
//
// PLAYER-VISIBLE JUSTIFICATION: getItemPreview() is the exact function
// production's own buy/equip/trade modals call so a human can "read what
// they're about to commit to" (see its own doc comment in
// app/components/itemPreview.ts). Its `stats: string[]` array IS the
// on-screen tooltip a real player reads — "AC +3", "Resists: aetheric",
// "Regen: +2 HP / +3 stamina per action", "STR +2" — not a hidden number
// re-derived here.
//
// THE ONE GUARD THIS FILE ADDS: getItemPreview() falls through to
// inferWeapon/inferArmor/inferAccessory/inferGear for names that resolve to
// NO real catalog row (a guessed preview for unrecognized items, which the
// pre-existing PlayerView firewall header already flags as excluded because
// its fallback path can reach a Qwen-backed inference call — a mutation/RNG
// risk this apparatus must never trigger). readItemMechanics() gates on
// findCatalogItem() first — the SAME resolver findEquipUpgrade() already
// uses in the qualified driver — and returns null for anything that isn't a
// real catalog entry, so getItemPreview() is only ever called on names
// PROVEN to take the safe catalog branch. The inference/Qwen path is never
// reached from this file.
import { findCatalogItem } from '../../app/engine/crafting';
import { getItemPreview } from '../../app/components/itemPreview';

/** The real PlayerEquipped slot keys this repair reasons about. 'off' and
 *  'lens' are deliberately excluded — the reviewed armor catalog (armor.json)
 *  only authors chest/cloak/feet/hands/head/legs, and shields already have
 *  their own qualified, unmodified path (playerView.ts's canBlock/
 *  itemIsShield). Extending into those two slots would require evidence this
 *  repair does not yet have — recorded as a known limitation, not guessed. */
export type EquipSlotKey = 'main' | 'head' | 'chest' | 'hands' | 'legs' | 'feet' | 'cloak' | 'amulet' | 'ring';

const ARMOR_SLOT_KEYS = new Set<string>(['head', 'chest', 'hands', 'legs', 'feet', 'cloak']);

/** A bounded, player-visible mechanical read of one catalog item — every
 *  field traced to one of getItemPreview()'s own `stats` lines (the same
 *  text a real player already reads on the buy/equip/trade screen), never a
 *  raw internal field. Absent stats parse to 0/empty, never invented. */
export interface ItemMechanicalRead {
  name: string;
  /** The equip-slot family this item belongs to, or null when it isn't
   *  equippable at all (consumable/material/misc). Weapons -> 'main'
   *  (the only hand a plain "wear" resolves for a canonical single-weapon
   *  loadout, matching findEquipUpgrade()'s existing main-hand-only scope).
   *  Amulets/rings resolved from the catalog's own tags (the same
   *  'amulet'/'ring' tag PlayerViewItem already exposes verbatim). */
  slot: EquipSlotKey | null;
  rarity: string | null;
  acBonus: number;
  hpRegen: number;
  staminaRegen: number;
  /** Lower-cased resist type words parsed off the item's own "Resists"
   *  line(s) — e.g. ['aetheric']. Never invented from tags/name alone. */
  resistTypes: string[];
  statBonusCount: number;
  /** Average of a weapon's own displayed "Damage: NdM (type)" line, or null
   *  for non-weapons / weapons whose dice couldn't be parsed. */
  damageAvg: number | null;
}

function parseStats(stats: readonly string[]): {
  acBonus: number; hpRegen: number; staminaRegen: number; resistTypes: string[]; statBonusCount: number; damageAvg: number | null;
} {
  let acBonus = 0;
  let hpRegen = 0;
  let staminaRegen = 0;
  const resistTypes: string[] = [];
  let statBonusCount = 0;
  let damageAvg: number | null = null;

  for (const line of stats) {
    const ac = /^AC \+(\d+)/.exec(line);
    if (ac) acBonus += Number(ac[1]);

    if (line.startsWith('Regen:')) {
      const hp = /\+(\d+) HP/.exec(line);
      if (hp) hpRegen += Number(hp[1]);
      const sta = /\+(\d+) stamina/.exec(line);
      if (sta) staminaRegen += Number(sta[1]);
    }

    if (/^Resists/.test(line)) {
      // Two real shapes from itemPreview.ts: armor's "Resists: aetheric,
      // fire" and an accessory's "Resists aetheric, fire: −9% incoming...".
      // The colon (when present) sits directly against "Resists" with no
      // space, so it must be stripped in the SAME match as the label —
      // otherwise a naive split(':') on the remainder grabs the empty
      // string before that leftover colon instead of the resist list.
      const body = line.replace(/^Resists:?\s*/, '').split(':')[0] ?? '';
      for (const word of body.split(',')) {
        const t = word.trim().toLowerCase();
        if (t) resistTypes.push(t);
      }
    }

    if (/^[A-Z]{3} \+\d+$/.test(line)) statBonusCount += 1;

    const dmg = /^Damage: (\d+)d(\d+)/.exec(line);
    if (dmg) {
      const n = Number(dmg[1]);
      const m = Number(dmg[2]);
      damageAvg = n * ((m + 1) / 2);
    }
  }
  return { acBonus, hpRegen, staminaRegen, resistTypes, statBonusCount, damageAvg };
}

/**
 * The single legitimate perception primitive this repair adds: read the
 * SAME mechanical facts a human sees when inspecting an item, for any name
 * PROVEN (via findCatalogItem) to be a real catalog entry. Returns null for
 * anything not in the catalog — never guesses, never infers.
 */
export function readItemMechanics(itemName: string): ItemMechanicalRead | null {
  const card = findCatalogItem(itemName);
  if (!card) return null;

  let slot: EquipSlotKey | null = null;
  if (card.kind === 'weapon') slot = 'main';
  else if (card.kind === 'armor') {
    // getItemPreview's own preview.slot for armor is authoritative — read it
    // below once we have the preview — but pre-guard with the catalog's own
    // tag-independent kind check so a dog_armor row (a different catalog,
    // different wearer) never gets mistaken for a player slot.
    slot = null; // resolved below from preview.slot
  } else if (card.kind === 'relic') {
    if (card.tags.includes('amulet')) slot = 'amulet';
    else if (card.tags.includes('ring')) slot = 'ring';
  }

  const preview = getItemPreview(itemName);
  if (card.kind === 'armor' && preview.slot && ARMOR_SLOT_KEYS.has(preview.slot)) {
    slot = preview.slot as EquipSlotKey;
  }

  const parsed = parseStats(preview.stats);
  return {
    name: card.name,
    slot,
    rarity: card.rarity ?? null,
    ...parsed,
  };
}
