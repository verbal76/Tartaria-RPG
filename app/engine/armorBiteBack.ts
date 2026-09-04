// ⚠⚠⚠ OTA-1671 — THE ARMOUR BITES BACK.
//
// Owner: *"I really like the bites back buff to the dog armor, we need that
// implement across our armour catalogue. Not every piece obviously but it can be
// sprinkled in periodically."*
//
// ⚠ IT IS NOT THE DOG VEST'S BITE-BACK. The vest (OTA-1640) always returns
// AETHERIC, whatever hit it. Player armour returns the ATTACKER'S OWN damage
// type — the owner's call when I put the choice to him. A fire-breather burns
// itself on your plate; a clawed thing cuts itself. One field means something
// different every encounter instead of becoming a second, quieter aetheric
// channel that would make the dog vest's line redundant.
//
// ⚠⚠ WHY NOT NAME-DRIVEN, WHEN OTA-1670 JUST MADE NAMES DECIDE EVERYTHING.
// I looked: exactly TWO of 297 pieces have names that already say they hurt what
// touches them (Mud-glass Scales, Mud-Claw Gloves). Driving the sprinkle off
// names would have meant renaming ~30 pieces the owner already owns, one OTA
// after moving all their stats — churn on churn, for a property the CARD states
// plainly anyway. Names decide STATS (OTA-1670); this is a different question.
//
// ⚠ SO THE RULE IS ABOUT CONTACT. You are INSIDE chest, hands and legs when
// something lands on you — spiked plate, studded gauntlets, greaves you can
// drive into a knee. A cloak billows and a hood covers your head; neither is
// something an attacker impales itself on. Skewed to Rare/Legendary because a
// Common should not carry a rider, and the two already-named pieces are in at
// any rarity because their names promise it and a card must not lie.

/** Names that already tell the player this thing hurts to touch. In at any
 *  rarity — the promise is on the item, so the mechanic has to be too. */
const NAMED_SPIKY = /thorn|barb|spike|spine|bramble|razor|shard|jagged|serrat|quill|burr|caltrop|glass|splinter|bristl|claw|fang/i;

/** ⚠ The slots you are INSIDE. A cloak and a hood are worn OVER you; there is
 *  nothing for a swing to catch on. */
const CONTACT_SLOTS: readonly string[] = ['chest', 'hands', 'legs'];

/** FNV-1a — the same deterministic picker armorStatAffinity uses. This is
 *  authoring, not a roll: a given piece either bites back forever or never. */
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** How much a piece returns, or 0 for the ~90% that do not.
 *
 *  ⚠⚠ THE LADDER IS DELIBERATELY SHALLOW. `ARMOR_REFLECT_CAP` is 8 and six slots
 *  can carry this; 2 and 3 mean a committed thorn build lands near the cap
 *  rather than blowing past it, and a single piece is a nice rider rather than a
 *  strategy. */
export function armorBiteBack(name: string, slot: string, rarity: string | undefined): number {
  const named = NAMED_SPIKY.test(String(name ?? ''));
  if (named) return rarity === 'Legendary' ? 3 : rarity === 'Rare' ? 2 : 1;
  if (!CONTACT_SLOTS.includes(slot)) return 0;
  if (rarity !== 'Rare' && rarity !== 'Legendary') return 0;
  // ⚠ One in two of the eligible pool — measured at 31 of 297 pieces (10.4%),
  // which is the "sprinkled in periodically" the owner asked for rather than a
  // property of all good armour.
  if (stableHash(String(name ?? '')) % 2 !== 0) return 0;
  return rarity === 'Legendary' ? 3 : 2;
}
