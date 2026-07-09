// scrapEngine — disassemble built items into stock materials.
//
// Players who outgrow a starter weapon or pick up redundant gear at a
// vendor have no use for the item but can't easily turn it into
// crafting stock without it. Scrapping closes the loop: any built
// item (weapon / armor / relic / gear) breaks down into 1–2 common
// materials chosen by the item's tags.
//
// Output is intentionally modest — the player should never out-earn
// dig + recipe by just buying-and-scrapping at vendors. One scrap =
// roughly one common dig.

import type { InventoryItem } from './types';

export interface ScrapOutput {
  /** Materials granted to the player. */
  grants: Array<{ name: string; quantity: number }>;
  /** Human-readable summary for the world-channel log. */
  summary: string;
}

/** True if the item can be scrapped — weapons, armor, relics, and
 *  durable gear all qualify. Materials (`misc` / `consumable`) are
 *  already stock and refuse scrapping. */
export function canScrap(item: InventoryItem): boolean {
  // v2.4.1 (OTA 052) — quest items (Tartarian Cores etc.) are
  // bound to the character until the final act. Block scrap up
  // front so the player can't accidentally feed a Core to the
  // forge.
  if ((item.tags ?? []).includes('quest')) return false;
  if (item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'relic') return true;
  // OTA-742 — a weapon/armor bought from a vendor could mint as kind 'misc'
  // (buyFromVendor mis-stamp, fixed there + healed on load). Treat anything
  // TAGGED as gear as scrappable too, so an already-bought Rust Dagger / Bone
  // Shiv scraps immediately instead of only after the next reload.
  {
    const t = item.tags ?? [];
    if (t.includes('weapon') || t.includes('armor')) return true;
  }
  // Some gear (compass, torch, rope) carries useful base materials —
  // allow scrap as long as the item isn't a raw commodity.
  // OTA-191 — 'improvised' added to the gate so misc items the
  // OTA-191 inferGear default-tags as improvised (no specific material
  // keyword in the name) still pass the scrap predicate. scrapOutputFor
  // already routes 'improvised' to Small Rock; this just keeps the
  // gate consistent with the output table.
  if (item.kind === 'misc' && (item.tags ?? []).some((t) =>
    /metal|wood|stone|aether|crystal|fiber|cloth|plate|scaled|improvised|organic/i.test(t),
  )) {
    // Materials with these tags already ARE the scrap output — refuse
    // to scrap them into themselves.
    const rawNames = new Set([
      'Scrap Metal', 'Stick', 'Small Rock', 'Big Rock', 'Patched Cloth',
      'Spider Silk', 'Aether Crystal', 'Aetheric Shard', 'Aether Residue',
      'Mud Fragment', 'Aether Mud',
      // OTA-443 — the higher-tier mats scrap now produces are stock too, so a
      // player can't scrap them back into a loop (Golem Core → Scrap Metal …).
      'Golem Core', 'Mudstone', 'Aether Dust',
    ]);
    return !rawNames.has(item.name);
  }
  return false;
}

/** OTA-443 — scrap output scales with the scrapped item's rarity. A
 *  better piece breaks down into MORE (and, on the secondary channels,
 *  BETTER) stock — so clearing tougher gear actually feeds crafting +
 *  golem-summoning, the bottleneck a playtester hit running from the
 *  start to the first city. Common=+0 … Legendary=+3 on the primary
 *  material. Sell value is unaffected (the commons stay Common); the
 *  better mats only ever come from gear worth MORE than they sell for,
 *  and crafting the higher-tier scrappables costs more of those mats
 *  than scrapping returns — so the OTA-423 money pump stays closed. */
function rarityScrapBonus(rarity: InventoryItem['rarity']): number {
  switch (rarity) {
    case 'Legendary': return 3;
    case 'Rare': return 2;
    case 'Uncommon': return 1;
    default: return 0;
  }
}

/** Derive the scrap output for an item. Tag-driven so any new item
 *  added to the catalog with sensible tags scraps cleanly without
 *  needing a manual mapping. OTA-443 — yields 2–3+ REPRESENTATIVE
 *  materials geared to crafting / repair / golem fuel, scaled by rarity. */
export function scrapOutputFor(item: InventoryItem): ScrapOutput {
  const tags = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
  const grants: Array<{ name: string; quantity: number }> = [];
  const rb = rarityScrapBonus(item.rarity);
  const half = Math.floor(rb / 2);
  // OTA-742 — a bought weapon/armor may be mis-stamped kind 'misc' (see canScrap).
  // Derive gear-ness from the kind OR the tag so the yield branches below still
  // fire (a Rust Dagger gives Scrap Metal + Stick, not the bare junk fallback).
  const isWeaponLike = item.kind === 'weapon' || tags.has('weapon');
  const isArmorLike = item.kind === 'armor' || tags.has('armor');
  // Metal content → Scrap Metal (the bulk), and on a Rare+ metal piece a
  // GOLEM CORE — the Iron-Golem bottleneck — since a high-grade metal
  // construct plausibly carries one. Representative: only metal gear.
  // OTA-423 — an IMPROVISED weapon (a stick Club, a Stone Spear) carries no
  // metal, so it must NOT yield Scrap Metal (that conjured metal from wood and,
  // with Scrap Metal once mispriced Uncommon, let a 1-Stick Club scrap for more
  // than it cost). Real metal weapons (blade/metal/iron/plate, or a
  // non-improvised weapon) still give it.
  const isMetalTagged = tags.has('metal') || tags.has('plate') || tags.has('iron') || tags.has('blade');
  if (isMetalTagged || (isWeaponLike && !tags.has('improvised'))) {
    grants.push({ name: 'Scrap Metal', quantity: 2 + rb });
    // OTA-611 — the Golem Core (Iron-Golem bottleneck) drops ONLY from a
    // genuinely metal-tagged piece, never the broad weapon-kind fallback. A
    // Rare+ non-metal weapon (bone/aether/plasma) — or any fused weapon, which
    // is now selfCrafted and strip-guarded — no longer mints the scarce Core.
    if (rb >= 2 && isMetalTagged) grants.push({ name: 'Golem Core', quantity: 1 });
  }
  // Aether content → Aetheric Shard + Aether Crystal (golem fuel), plus
  // Aether Dust (the most-demanded recipe staple, otherwise unforageable) on
  // Uncommon+ pieces. Aether-tagged gear ONLY.
  // arb119 — previously ANY `kind:'relic'` minted aether mats here, even a
  // mundane Climbing Rope / Pry Bar / plain amulet / ring (all 'relic' kind,
  // no aether tag). An Uncommon Aetheric Shard sells for ~14 TC and a relic
  // poured out TWO of them plus a Crystal — so buy a 12 TC Common relic →
  // scrap → sell for ~33 TC was a clean, repeatable money pump (red-team
  // confirmed). Genuinely-aetheric relics carry the `aether`/`crystal` tag
  // (e.g. Voidspawn Bolt) and still qualify; mundane relics fall through to
  // the basic-material fallback, so scrapping one is a loss, not a profit.
  if (tags.has('aether') || tags.has('crystal')) {
    grants.push({ name: 'Aetheric Shard', quantity: 2 + half });
    grants.push({ name: 'Aether Crystal', quantity: 1 });
    if (rb >= 1) grants.push({ name: 'Aether Dust', quantity: 1 });
  }
  // Stone heads → Small Rock.
  if (tags.has('stone') || tags.has('mudstone') || tags.has('improvised')) {
    grants.push({ name: 'Small Rock', quantity: 2 + half });
  }
  // OTA-447 — MUDSTONE (Mud-Golem fuel) from ANY muddy gear, independent of the
  // stone branch. Pre-fix the Mudstone bonus was nested inside the stone check,
  // so a `mud`-but-not-stone piece (e.g. a Mud-Rend Blade tagged metal/mud/blade)
  // scrapped without it — the mud-tag path was effectively dead.
  if (tags.has('mud') || tags.has('mudstone')) {
    grants.push({ name: 'Mudstone', quantity: 1 });
  }
  // Cloth / fiber → Patched Cloth, and SPIDER SILK (a 7-recipe fiber) from
  // organic gear. OTA-676 — `rope` is cordage (fiber): a Climbing Rope / Broken
  // Rope is `rope`-tagged with no cloth/fiber tag, so it used to fall through to
  // the bare Stick+Small Rock fallback — you mended a ROPE with sticks and rocks,
  // and repairCostMaterials (= scrap × 2) charged the same. Treat rope as fiber so
  // it scraps/repairs into Patched Cloth like other cordage.
  if (tags.has('cloth') || tags.has('fiber') || tags.has('organic') || tags.has('rope') || isArmorLike) {
    grants.push({ name: 'Patched Cloth', quantity: 2 + half });
    if (tags.has('organic')) grants.push({ name: 'Spider Silk', quantity: 1 });
  }
  // Wooden handle / haft → Stick (secondary on weapons; capped at 60 anyway).
  if (tags.has('wood') || tags.has('haft') || isWeaponLike) {
    grants.push({ name: 'Stick', quantity: 1 + half });
  }
  // Fallback — every scrap should give SOMETHING, otherwise the
  // player wasted the click. A bare misc gives a Stick + Small Rock.
  if (grants.length === 0) {
    grants.push({ name: 'Stick', quantity: 1 + half });
    grants.push({ name: 'Small Rock', quantity: 2 + half });
  }
  // De-dupe — if both "weapon" and "metal" tags pushed Scrap Metal,
  // collapse to a single grant rather than 2.
  const merged = new Map<string, number>();
  for (const g of grants) {
    merged.set(g.name, (merged.get(g.name) ?? 0) + g.quantity);
  }
  let finalGrants = Array.from(merged.entries()).map(([name, quantity]) => ({ name, quantity }));

  // arb119 — SELF-CRAFTED items scrap to a reduced yield. By SELL value the
  // full output of a crafted scrappable ran net-positive against its
  // ingredients (craft a Sentinel Cleaver → scrap → Golem Core + Scrap Metal
  // worth ~2× the mats it cost → sell), which is the OTA-423 money pump the
  // OTA-443 comment believed was closed. We strip the premium (high-sell)
  // mats a forge could otherwise mint from itself and halve the rest, so
  // recycling your OWN craft never out-earns the ingredients. LOOTED gear is
  // unflagged and scraps in FULL — the intended loot→scrap→golem-feed loop is
  // untouched.
  if (item.selfCrafted) {
    const PREMIUM = new Set(['Golem Core', 'Aetheric Shard', 'Aether Crystal', 'Aether Dust', 'Mudstone']);
    const trimmed = finalGrants
      .filter((g) => !PREMIUM.has(g.name))
      .map((g) => ({ name: g.name, quantity: Math.floor(g.quantity / 2) }))
      .filter((g) => g.quantity > 0);
    // Always return SOMETHING so the scrap click isn't wasted — a single
    // Small Rock if the halving zeroed everything out.
    finalGrants = trimmed.length > 0 ? trimmed : [{ name: 'Small Rock', quantity: 1 }];
  }
  const summary = finalGrants
    .map((g) => g.quantity > 1 ? `${g.name} x${g.quantity}` : g.name)
    .join(', ');
  return { grants: finalGrants, summary };
}

/** Material cost to fully repair an item — exactly 2× its scrap
 *  output. Playtester spec: "if your helmet scraps to 4 scrap metal
 *  and 2 cloth, it should cost 8 scrap metal and 4 cloth to repair.
 *  double the drop rate for the repair rate."
 *
 *  Returns an empty list when the item has no scrap output (raw
 *  materials, consumables) — caller should not surface repair for
 *  such items. */
export function repairCostMaterials(item: InventoryItem): Array<{ name: string; quantity: number }> {
  const out = scrapOutputFor(item);
  return out.grants.map((g) => ({ name: g.name, quantity: g.quantity * 2 }));
}

// OTA 23-014 — salvage isn't a free repeatable click anymore.
// Each attempt rolls a success chance driven by the player's INT
// (engineering) and DEX (fine hands). On failure the item is STILL
// consumed — that's the rule the playtester asked for: "you
// shouldn't keep being able to salvage the same item over and
// over until it gives you something." High-skill characters get
// one re-roll per attempt, which represents real expertise.

/** Probability that a salvage attempt yields the item's materials.
 *  Base 70%, +(INT−10) × 3%, +(DEX−10) × 1%, clamped to [35%, 95%].
 *  Floor at 35% so even a low-stat character isn't soft-locked out
 *  of salvaging; ceiling at 95% so there's always SOME risk. */
export function scrapSuccessChance(intStat: number, dexStat: number): number {
  const base = 0.7;
  const bonus = (intStat - 10) * 0.03 + (dexStat - 10) * 0.01;
  return Math.max(0.35, Math.min(0.95, base + bonus));
}

/** True when the player's INT/DEX qualify for one re-roll on a
 *  failed salvage attempt. INT ≥ 14 (Reclaimer/engineer threshold)
 *  OR DEX ≥ 16 (very fine hands) unlocks the second chance. */
export function scrapHasSecondChance(intStat: number, dexStat: number): boolean {
  return intStat >= 14 || dexStat >= 16;
}

/** Narration variants for a failed salvage attempt. Picker is
 *  random-uniform so a player who fails several times in a row gets
 *  visibly different lines each time. `{item}` is substituted with
 *  the item name at pick time. */
export const SCRAP_FAILURE_LINES: readonly string[] = [
  "You work the {item} apart, but the pieces crumble in your hands — rust-rotted through. Nothing salvageable.",
  "Wrong angle, wrong tool, wrong something. The {item} won't yield clean parts. You toss the scraps aside.",
  "You try your best, but the {item}'s been salt-eaten too long. Anything useful disintegrates on the bench.",
  "The {item} comes apart, sure — but the bits are warped past use. Pile it on the scrap heap.",
  "Too far gone. You wrench the {item} open and find only powdered rot inside. Nothing to keep.",
  "Your hands slip twice on the {item} and the housing splits the wrong way. Whatever was inside crumbles.",
  "The {item} was already half-eaten by something before you found it. You strip it bare. There's nothing.",
  "You break the {item} down to its bones and the bones are hollow. A long-dead Reclaimer beat you to anything worth keeping.",
  "Pry, twist, pry again — the {item} fights you and wins. You force it open and the contents puff out as grey dust.",
  "You'd swear the {item} was solid. It isn't. The whole thing collapses into a brittle handful of nothing.",
];

export function pickScrapFailureLine(itemName: string): string {
  const tpl = SCRAP_FAILURE_LINES[Math.floor(Math.random() * SCRAP_FAILURE_LINES.length)]!;
  return tpl.replace(/\{item\}/g, itemName);
}
