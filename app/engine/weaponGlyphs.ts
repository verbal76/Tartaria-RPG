// weaponGlyphs — OTA-1553. WHAT THIS WEAPON DOES, AND WHETHER IT BITES *THIS* FOE,
// read off the button without opening anything.
//
// ⚠⚠⚠ THE OWNER'S SPEC, VERBATIM, BECAUSE IT IS THE WHOLE DESIGN:
// *"We have a cudgel that does bludgeoning but it's coded in Frost, encoded and
// incendiary. There should be a fire glyph then a snowflake glyph then the word
// cudgel and then at the end if the enemy is weak to either the frost or the
// fire or the bludgeoning from the cudgel there should be a star at the very
// end. So the format is glyph glyph name and then either a star or no star
// depending on the weaknesses of the enemy."*
//
// So: `🔥 ❄ cudgel ★`. One glyph per applied coating in slot order, then the
// name, then a star — and the star answers a question about THREE damage types,
// not one: both coatings AND the weapon's own raw damage. A frost-and-fire
// cudgel earns its star against something weak to bludgeoning too.
//
// ⚠⚠⚠ AND THE STAR OBEYS DISCOVERY. Asked whether it should read hidden
// weaknesses, he was unambiguous: *"only base it off of what the player has
// discovered or is shown."* So the star is drawn from exactly the same verdict
// the enemy card prints — boss, or the Wisdom 12 read, or what has already been
// learned by hitting the thing (worldMemory.enemyIntel). A star that knew more
// than the card would be a free intel channel that quietly cancels the WIS gate
// OTA-818/819 built and the `witholdIntel` dial OTA-1117 added.
//
// ⚠⚠ WHICH IS WHY THE RECONCILE MOVED HERE. `defensesFor` — type-map weaknesses
// reconciled against per-spawn `resist:` / `vulnerable:` traits — lived privately
// inside EnemyPanel.tsx. Two readers of one truth, with a copy in each, is how a
// star and a card come to disagree about the same enemy; one function, imported
// by both, is how they cannot. The arithmetic is unchanged, and the panel now
// imports what it used to own.
//
// ⚠ THE GLYPHS ARE NOT DECORATION, they are the reason the label fits. The old
// button spelled the coating out as an adjective ("acid-etched rusty shortbow"),
// which is what pushed the damage off the owner's screen in the first place; a
// dual-coated weapon spent two words before reaching its own name. A glyph is one
// character and reads faster than the word ever did.
import type { InventoryItem, WeaponCoating, Enemy } from './types';
import { canonicalDamageType } from './damageTypes';
import { traitDefenses, enemyIntelKey } from './enemyTraits';
import { enemyTypeDefenses } from './crafting';

/** Wisdom that reads a non-boss's defenses on sight (OTA-818/819). Lives here
 *  now because both the card and the star ask the same question. */
export const WEAKNESS_READ_WIS = 12;

/** One character per coating family. Chosen for legibility at 11pt on a dark
 *  button, and deliberately distinct from each other at a glance — the point of
 *  the row is that you never have to read it twice. */
export const COATING_GLYPH: Record<WeaponCoating['kind'], string> = {
  burn: '🔥',
  cold: '❄',
  poison: '☠',
  acid: '⚗',
  corruption: '☣',
  electrical: '⚡',
};

/** ⚠ MOVED, NOT REWRITTEN — this is EnemyPanel's `defensesFor`, byte for byte in
 *  its arithmetic, now shared.
 *
 *  OTA-798 — RECONCILE per type the same way combat does
 *  (combineDamageTypeMatch): a trait that DISAGREES with the type-map wins, so a
 *  `resist:X` trait cancels a type-map weakness (and a `vulnerable:X` overrides a
 *  type resist). Without this a panel would still list an enemy's ORIGINAL type
 *  weakness after per-spawn randomization flipped it — showing a weakness that is
 *  actually now a resistance. */
export function reconciledDefenses(enemy: Enemy): { resists: string[]; weaknesses: string[] } {
  const type = enemyTypeDefenses(enemy.type);
  const trait = traitDefenses(enemy.traits);
  const all = Array.from(new Set([...type.resist, ...type.weak, ...trait.resists, ...trait.weaknesses]));
  const resists: string[] = [];
  const weaknesses: string[] = [];
  for (const dt of all) {
    const typeDir = type.weak.includes(dt) ? 1 : type.resist.includes(dt) ? -1 : 0;
    const traitDir = trait.weaknesses.includes(dt) ? 1 : trait.resists.includes(dt) ? -1 : 0;
    // Discord → the per-enemy trait wins (matches combineDamageTypeMatch); else sum.
    const dir = typeDir !== 0 && traitDir !== 0 && typeDir !== traitDir ? traitDir : typeDir + traitDir;
    if (dir > 0) weaknesses.push(dt);
    else if (dir < 0) resists.push(dt);
  }
  return { resists, weaknesses };
}

/**
 * ⚠⚠⚠ THE WEAKNESSES THE PLAYER IS ENTITLED TO KNOW ABOUT THIS ENEMY, RIGHT NOW.
 *
 * Exactly the card's rule, in one place:
 *   · a BOSS is always readable (its defenses are its character, not a secret);
 *   · Wisdom ≥ 12 reads a normal foe on sight, unless the `witholdIntel`
 *     difficulty dial has switched the free read off;
 *   · otherwise, only what has already been LEARNED by hitting it
 *     (worldMemory.enemyIntel — "strike to learn", OTA-838).
 *
 * Everything is canonicalised (frost → cold, force → aetheric …) so a caller can
 * compare against a weapon's types without re-aliasing and getting it wrong.
 * Returns [] when nothing is known — which is the case that must print NO star.
 */
export function knownEnemyWeaknesses(
  enemy: Enemy,
  opts: {
    playerWisdom?: number;
    witholdIntel?: boolean;
    intel?: Record<string, { weak: string[]; resist: string[] }>;
  } = {},
): string[] {
  const canRead = !opts.witholdIntel && (opts.playerWisdom ?? 0) >= WEAKNESS_READ_WIS;
  const raw = (enemy.boss || canRead)
    ? reconciledDefenses(enemy).weaknesses
    : (opts.intel?.[enemyIntelKey(enemy.name, enemy.traits)]?.weak ?? []);
  return Array.from(new Set(raw.map((w) => canonicalDamageType(w))));
}

/** The coatings on THIS instance, in the order they were applied (slot 1 then
 *  slot 2) — the order the owner asked for, and the order coatedDisplayName
 *  already reads them in, so the glyph row and the item's name never disagree
 *  about which coat came first. */
export function coatingKinds(
  item: Pick<InventoryItem, 'coating' | 'coating2'> | null | undefined,
): WeaponCoating['kind'][] {
  if (!item) return [];
  const out: WeaponCoating['kind'][] = [];
  if (item.coating?.kind) out.push(item.coating.kind);
  if (item.coating2?.kind) out.push(item.coating2.kind);
  return out;
}

/** `🔥❄` for a frost-and-fire weapon, `''` for a bare one. */
export function coatingGlyphs(
  item: Pick<InventoryItem, 'coating' | 'coating2'> | null | undefined,
): string {
  return coatingKinds(item).map((k) => COATING_GLYPH[k] ?? '').join('');
}

/**
 * ⚠⚠ EVERY DAMAGE TYPE THIS WEAPON ACTUALLY DELIVERS — both coatings and the raw
 * damage of the weapon itself, canonicalised.
 *
 * The raw type is the half that is easy to forget and the half the owner named
 * explicitly ("or maybe piercing if the raw damage from the weapon is
 * piercing"). A coated cudgel is still a cudgel: it earns its star against
 * something weak to bludgeoning whether or not either coat lands.
 */
export function weaponStrikeTypes(
  item: Pick<InventoryItem, 'coating' | 'coating2'> | null | undefined,
  rawDamageType: string | null | undefined,
): string[] {
  const types = coatingKinds(item).map((k) => canonicalDamageType(k));
  if (rawDamageType) types.push(canonicalDamageType(rawDamageType));
  return Array.from(new Set(types));
}

/**
 * ⚠⚠⚠ THE STAR. True iff something this weapon delivers is a weakness the player
 * has actually discovered.
 *
 * ⚠ NOTHING KNOWN → NO STAR, and that is the important half. An absent star
 * means "not known to bite", never "known not to bite" — the same silence the
 * card gives, so the two cannot tell the player different things.
 */
export function weaponHitsKnownWeakness(
  strikeTypes: readonly string[],
  knownWeaknesses: readonly string[],
): boolean {
  if (knownWeaknesses.length === 0) return false;
  const weak = new Set(knownWeaknesses.map((w) => canonicalDamageType(w)));
  return strikeTypes.some((t) => weak.has(canonicalDamageType(t)));
}

/** Trim a long weapon name to its last two words, so the glyphs and the star
 *  have room. ("Rusty Iron Shortbow" → "Iron Shortbow".) */
export function shortWeaponName(name: string): string {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length <= 2) return name;
  return tokens.slice(-2).join(' ');
}

/**
 * ⚠⚠⚠ THE LABEL, ASSEMBLED IN ONE PLACE: `glyph glyph name ★`.
 *
 * ⚠ NO HAND PREFIX. The owner: *"I don't need off: because in combat the hand
 * doesn't matter, only in the inventories equip choice card."* He is right —
 * during a fight the two buttons ARE the two hands, sitting side by side; the
 * word "off:" spent four characters restating their own arrangement while the
 * damage it was crowding out went unshown. The hand still labels the inventory
 * equip card, which is the one screen where you are choosing which hand.
 *
 * ⚠ NO DICE, EITHER. Asked whether the button should carry the roll, he was
 * blunt: *"I don't want the weapon button during combat to show 1d4. I don't
 * want it to show dice rolls. I wanted to show a glyph of the types of damage."*
 */
export function combatWeaponLabel(
  name: string,
  item: Pick<InventoryItem, 'coating' | 'coating2'> | null | undefined,
  rawDamageType: string | null | undefined,
  knownWeaknesses: readonly string[],
): string {
  const glyphs = coatingGlyphs(item);
  const star = weaponHitsKnownWeakness(weaponStrikeTypes(item, rawDamageType), knownWeaknesses)
    ? ' ★'
    : '';
  const head = glyphs ? `${glyphs} ` : '';
  return `${head}${shortWeaponName(name).toLowerCase()}${star}`;
}

/**
 * ⚠⚠⚠ OTA-1568 — WHY THE GLYPHS NEED THEIR OWN TEXT NODE. The owner, looking at
 * a frost-coated pike on a strike-tone chip: *"The snowflake being blue is hard
 * to see on the green background… And the acid symbol has no color at all."*
 *
 * ⚠⚠⚠ THOSE ARE ONE ROOT CAUSE WEARING OPPOSITE SYMPTOMS, and the cause is that
 * nothing ever DECIDED how these six characters render. Android picks a
 * presentation per codepoint out of font fallback: `❄` lands in a COLOR emoji
 * font, so it is permanently that one blue and ignores any `color:` we set —
 * invisible against `quickStrike`'s light sage `#9ec96a`. `⚗` lands in a
 * MONOCHROME text font, so it inherits the chip's own label colour and reads as
 * "no colour at all". One string, two fonts, no control over either.
 *
 * ⚠⚠ SO THE FIX IS TWO MECHANISMS, because neither one can serve both:
 *
 *   · A BLACK HALO reaches the colour-emoji glyphs, which is the only thing that
 *     can — a shadow is drawn from the glyph's own alpha mask, so it outlines
 *     `❄` without needing to recolour it. That is exactly what he asked for.
 *   · A PER-KIND COLOUR reaches the monochrome ones (`⚗`, plus whichever others a
 *     given device renders as text), giving acid a hue of its own instead of
 *     borrowing the label's.
 *
 * ⚠⚠ AND THE COLOURS ARE CHOSEN FOR BOTH CHIPS AT ONCE. `quickStrike` is light
 * sage; `quickReady` and the default chip are near-black (`#1b2417`, `#1a1714`).
 * No single hue reads on both — which is precisely why the halo is not a
 * nice-to-have: it lets these stay BRIGHT, so they carry on the dark chips,
 * while the black outline separates them from the light one.
 *
 * ⚠ STATED PLAINLY: on a device that renders `🔥` as colour emoji, its entry
 * below does nothing. These are the fallback for the text-presentation case, not
 * a claim that an emoji has been recoloured — that cannot be done.
 */
export const COATING_GLYPH_COLOR: Record<WeaponCoating['kind'], string> = {
  burn: '#ff7a3d',        // ember orange
  cold: '#79d2ff',        // ice, brighter than the emoji's own blue
  poison: '#e6e6c8',      // bone — a skull is bone, and green would vanish on sage
  acid: '#b4e619',        // the one he asked for: acid green-yellow
  corruption: '#c98aff',  // violet, the only hue nothing else uses
  electrical: '#ffe14d',  // lightning yellow
};

/** One glyph and the coating it came from, so a caller can style it per kind. */
export interface CoatingGlyphPart { ch: string; kind: WeaponCoating['kind'] }

/**
 * ⚠⚠ THE SAME LABEL, SPLIT SO IT CAN BE STYLED — never a second opinion about
 * what it says. `combatWeaponLabel` above stays the single source of the flat
 * string, because that string is ALSO the tap breadcrumb (`logUiTap`) and the
 * screen-reader label, and OTA-1172 is on record that the breadcrumb is forensic
 * evidence in the freeze hunt. This returns the same content in pieces; it does
 * not rebuild it differently, and a test pins the two against each other.
 */
export function combatWeaponLabelParts(
  name: string,
  item: Pick<InventoryItem, 'coating' | 'coating2'> | null | undefined,
  rawDamageType: string | null | undefined,
  knownWeaknesses: readonly string[],
): { glyphs: CoatingGlyphPart[]; text: string } {
  const kinds = coatingKinds(item);
  const star = weaponHitsKnownWeakness(weaponStrikeTypes(item, rawDamageType), knownWeaknesses)
    ? ' ★'
    : '';
  return {
    glyphs: kinds.map((k) => ({ ch: COATING_GLYPH[k] ?? '', kind: k })).filter((g) => g.ch !== ''),
    text: `${shortWeaponName(name).toLowerCase()}${star}`,
  };
}
