// ⚠⚠⚠ OTA-1670 — WHAT A PIECE IS CALLED DECIDES WHAT IT DOES FOR YOU.
//
// Owner: *"I like your idea about distributing these stats by the names and what
// you know you would imagine it would actually do. That should have been the
// guiding principle throughout this whole thing instead of just sprinkling them
// in — which unfortunately I've said 'sprinkle them in' this whole time so it's
// probably on me. Let's rearrange everything by what stat best ties into the
// name."* And his example: *"like the Ring of Stealth obviously going to do
// dexterity, Describes Ring would do wisdom."*
//
// ⚠⚠ THE MEASUREMENT THAT STARTED IT. Across 297 catalog pieces / 827 stat rolls:
//
//     dexterity 296 (35.8%) · strength 134 · constitution 83 · hp 80
//     intelligence 52 · charisma 52 · wisdom 51 · acrobatics 38 · stealth 27
//     investigation 9 · aetheria 5
//
// DEX was more than double the next stat and beat INT+CHA+WIS+acrobatics+stealth
// COMBINED. It was the top stat on four of six slots. Not a design — a default
// that got reached for whenever a piece needed a number.
//
// ⚠ THIS MODULE IS THE RULE, AND armor.json IS ITS OUTPUT. The catalog stays
// static data (a runtime derivation would make the JSON a lie and cost a scan on
// every read); ota1670 asserts every authored row agrees with the function
// below. Same shape as check:weaponnames — the rule is readable, the data is
// authored, and they cannot drift apart without a test failing.
//
// ⚠⚠ POWER IS UNCHANGED. Only the stat NAME moves; every amount is left exactly
// as authored. This is a redistribution, not a buff or a nerf.

// ⚠⚠⚠ OTA-1708 — STAGE 2: THE PIECE IS A SECOND SIGNAL, AND IT WAS BEING
// THROWN AWAY.
//
// Owner, on the stage-1 result: *"the armor 2 stage spread, I agree."*
//
// ⚠ WHAT STAGE 1 LEFT. Re-measured across the same 288 rows that carry a stat:
//
//     intelligence 52 (18.1%) · strength 51 (17.7%) · dexterity 50 (17.4%)
//     hp 47 (16.3%) · wisdom 41 (14.2%) · charisma 26 (9.0%) · stealth 21 (7.3%)
//
// The top four are within two points of each other — stage 1 did its job. But
// charisma and stealth sit at half the even share of 14.3%, and the reason is
// visible the moment you list the pieces that reach the SLOT POOL: 112 of 288
// (39%) get their stat from a hash of their name, because their name carries no
// identity noun. A slot is coarser than a piece. "Mask" and "Helm" are both
// head; "Robe" and "Cuirass" are both chest. So three masks landed on three
// different stats —
//
//     Rough Hewn Mask → wisdom · Aether-Breath Mask → intelligence
//     Aetheric Mask → wisdom · Mask of the Forgotten One → intelligence
//
// — and "Lich Robe" read charisma while "Lich-Bone Mantle" read strength. That
// is the same arbitrariness stage 1 was written to remove, one layer down.
//
// ⚠⚠ THE FIX IS A THIRD TIER, NOT A THUMB ON THE SCALE. A name is read at three
// widths, each coarser than the last, first match winning:
//
//     1. IDENTITY — what a word says the WEARER DOES.  ("Diplomat", "Titan")
//     2. GARMENT  — what the PIECE IS, when the name says nothing about its
//                   wearer.                             ("Mask", "Robe")
//     3. SLOT     — where it is worn, hashed, when the name says nothing at all.
//
// A mask conceals and a robe is worn to be seen, so those are the two starved
// channels, and they are fed by MEANING rather than by a quota. Identity still
// beats garment: "Diplomat's Mask" is charisma, and "Architect's Mask of Vision"
// stays intelligence.
//
// ⚠ RESULT — 21 of 288 pieces move, and the spread closes to 17.0%–10.8%:
//
//     hp 49 (17.0%) · strength 47 (16.3%) · intelligence 46 (16.0%)
//     dexterity 45 (15.6%) · wisdom 36 (12.5%) · charisma 34 (11.8%)
//     stealth 31 (10.8%)
//
// ⚠⚠ POWER IS STILL UNCHANGED. As in stage 1, only the channel NAME moves; not
// one amount is touched.

/** ⚠⚠⚠ THE SEVEN CHANNELS THE ENGINE ACTUALLY PAYS — and getting this wrong
 *  would have made the whole rebalance a lie.
 *
 *  My first pass emitted ten stats, including `acrobatics`, `investigation` and
 *  `constitution`. Then I read `equipment.ts` STAT_ALIAS: it collapses
 *  `acrobatics → dexterity`, `investigation → intelligence`, `aetheria →
 *  intelligence` and `constitution → hp` before anything is paid out. So four of
 *  my ten channels do not exist for the player — the character sheet reads
 *  STR/DEX/INT/WIS/CHA/STE plus HP, and nothing else.
 *
 *  ⚠ Balancing the ten would have produced a beautiful table nobody experiences:
 *  authored intelligence 32 + investigation 37 arrives as intelligence 69, a NEW
 *  24% peak, while the audit congratulated itself on 11%. That is this project's
 *  own recurring defect — dead behaviour wearing live clothes — and it would have
 *  been introduced BY the fix for it. The channels below are the real ones. */
export type ArmorStat =
  | 'strength' | 'dexterity' | 'intelligence' | 'wisdom'
  | 'charisma' | 'stealth' | 'hp';

/** ⚠⚠ IDENTITY NOUNS, FIRST MATCH WINS — so the order is the priority. Each line
 *  is a claim about what the word means a person DOES, not what the object is
 *  made of or how fancy it is. */
// ⚠⚠ OTA-1708 — AND AN IDENTITY WORD MAY BE THE TAIL OF A COMPOUND, WHICH IS
// WHY THESE ARE *NOT* BLANKET-BOUNDED THE WAY MATERIAL IS.
//
// This catalog names things by compounding: "Forgotten Faceshroud" is a shroud,
// "Stonebreaker's Cloak" is a breaker. Requiring `\b` before every alternative
// would stop reading both, and they are read correctly today.
//
// ⚠ The cost is a false friend: `elder` also sits inside "Wi-elder", and
// "Golem-Wielder's Helm" was being routed to WISDOM on the strength of a
// syllable — then, because that answer outranked the slot pool, it overwrote the
// helm's authored INT+2 with it. That one alternative is anchored at a word
// start; the rest are left to compound. ota1708 walks the whole catalog and
// fails on any mid-word match that is not one of the two known compounds, so the
// next false friend is named rather than absorbed.
const IDENTITY: ReadonlyArray<readonly [RegExp, ArmorStat]> = [
  // The watchers, and the ones who find by LOOKING. A warden watches — it spent
  // this catalog's whole life in the "wall" bucket next to guardian. Hunters and
  // trackers belong here too: finding a thing in the silt is perception.
  [/shaman|seer|oracle|veil|litany|oath|vigil|\belder|prophet|secrets|observer|watch|augur|warden|scout|tracker|hunter|pathfinder|insight|intuit/i, 'wisdom'],
  // The builders, the readers of machines, and the ones who sort salvage —
  // knowing WHAT a thing is, as against spotting that it is there.
  [/architect|scholar|arcane|weaver|engineer|survey|sight|lens|codex|schema|calibrat|analyt|rune|relic|salvager|delver|seeker|prospect/i, 'intelligence'],
  // The unseen.
  // ⚠ OTA-1708 added `lurker|prowler|skulk` — `stalker` was already here, and a
  // lurker does the identical thing. "Mud-Lurker Boots" was reading dexterity.
  [/shadow|stalker|lurker|prowler|skulk|whisper|silent|quiet|shroud|hood|ghost|phantom|dusk|night|creep|hush|veiled|thief|light.?finger|slip/i, 'stealth'],
  // ⚠ The SPEAKING — words about dealing with people. Royal words are NOT here;
  // see ROYAL below for why.
  // ⚠ OTA-1708 — the gaps stage 1 left here, and they were the biggest single
  // cause of charisma's 9.0%. A diplomat, an emissary and a matriarch all do
  // exactly what `envoy` and `court` already claimed; `command` is leading
  // people; `ceremon` is a thing worn to be seen; and a HERO is someone others
  // follow — renown, not muscle, which is why "Forgotten Hero's Grip" reading
  // dexterity was the name saying nothing at all.
  [/herald|envoy|court|noble|banner|orat|parley|accord|charm|silver.?tongue|diplomat|emissary|ambassad|command|matriarch|patriarch|hero\b|ceremon/i, 'charisma'],
  // The ones that stand, and the ones that keep you alive. (`constitution` is an
  // alias of `hp` in equipment.ts — one channel, so one entry.)
  // ⚠ OTA-1708 added `protector|defender` — the line's own idea ("the ones that
  // stand") with two words it happened to be missing, so "Forgotten Protector's
  // Plate" and "Crown Defender's Plate" stop reading as strength.
  [/sentinel|guardian|protector|defender|bulwark|bastion|guard|anchor|stoneborn|ward\b|aegis|endur|unbroken|hearth|vital|lifeward|mender|blood|sustain|marrow/i, 'hp'],
  // The ones that hit and haul. A Titan is mass in motion, not a wall.
  [/titan|warplate|hammer|brute|breaker|siege|forgemaster|ironhide|haul|maul|crush|might|bearer/i, 'strength'],
  // The ones that go fast, up, and over. (`acrobatics` is an alias of
  // `dexterity`, so the climbers land here rather than in a channel of their own.)
  [/runner|speed|swift|nimble|walker|strider|quick|glide|deft|fleet|stride|racer|skyreacher|leap|vault|dancer|tumbler|climber|reacher|spring/i, 'dexterity'],
];

/** ⚠⚠⚠ A MATERIAL PREFIX IS FLAVOUR, NOT IDENTITY — and this project already
 *  says so somewhere else, which is why it is the right rule here too.
 *  `damageTypes.ts` refuses to read an "Aetheric Ooze" as dealing aetheric
 *  damage: *"that prefix is flavor, not its attack."* Same principle: what a
 *  piece is MADE of does not decide what it does for you.
 *
 *  It matters at scale. `aether*` alone appears in ~70 of 297 names. Letting it
 *  claim a stat would not have fixed the pile — it would have moved it. */
//
//  ⚠⚠⚠ OTA-1708 — AND IT MATCHES WORDS, NOT SYLLABLES. The `\b(?:…)\b` wrapper
//  is a bug fix with a measurement behind it. Without it the strip ate the
//  inside of compound identity words, and TWO ENTRIES IN THE TABLE ABOVE COULD
//  NEVER FIRE: `stoneborn` (hp) was reduced to " born" by `stone`, and
//  `ironhide` (strength) to nothing at all by `iron` + `hide`. Authored rules
//  that cannot run are this project's own recurring defect — dead behaviour
//  wearing live clothes — and here it had put "Mask of the Stoneborn" on
//  intelligence by a hash of its name.
//
//  ⚠ The claim of this constant is unchanged and still holds: a material PREFIX
//  is flavour. "Stone", "Mud-Woven" and "Rough Hewn" are all whole words and are
//  all still stripped. What no longer happens is `stone` reaching inside
//  "Stoneborn". Measured: the boundary moves exactly ONE catalog piece, and
//  ota1708 pins that no alternative in any tier is unreachable again.
const MATERIAL = /\b(?:aether\w*|mud|stone|bone|iron|silt|glass|rust|ash|salt|tar|clay|leather|hide|scale|chitin|worn|rough|hewn|reinforced|woven|forged|patched|plated)\b/gi;

/** ⚠⚠ REGALIA IS WORN WHERE IT IS SEEN. king / crown / lord / heir appear in 62
 *  of 297 names — in this catalog they are how a Legendary announces itself, not
 *  a claim that the wearer is persuasive. Routed naively they made charisma the
 *  second-biggest stat in the game at 18.8%, which is the old defect wearing a
 *  new word.
 *
 *  So they claim charisma only on the two slots a crown is actually READ from,
 *  and fall through to the slot pool everywhere else. A King's Crown is display;
 *  a King's Gauntlets is just very good plate. */
const ROYAL = /king|crown|lord|heir|monarch|regent|sovereign|diadem|throne/i;
const DISPLAY_SLOTS: readonly string[] = ['head', 'cloak'];

/** ⚠⚠⚠ OTA-1708 — WHAT THE PIECE IS, READ AFTER WHAT ITS WEARER DOES.
 *
 *  The middle tier. Consulted only when no IDENTITY noun claimed the name, so
 *  it can never override a name that says something: "Diplomat's Mask" is
 *  charisma and "Architect's Mask of Vision" is intelligence, because both
 *  names name a person. It exists for the 39% of the catalog that names no one
 *  — "Aetheric Mask", "Rough Hewn Mask", "Ceremonial Robes" — where the only
 *  honest signal left is the garment, and the slot hash was throwing it away.
 *
 *  ⚠ Only two families are listed, and deliberately: the ones whose PURPOSE is
 *  legible from the garment alone. A mask conceals — that is the entire reason
 *  to wear one, and `hood` was already claiming stealth in the identity table
 *  above for exactly this reason. A robe is worn to be seen. A gauntlet or a
 *  greave says nothing about intent — it is just armour on a limb — so those
 *  keep falling to their slot, which is the right answer for them. Adding
 *  families here to move a number would be the quota this tier is designed not
 *  to be. */
const GARMENT: ReadonlyArray<readonly [RegExp, ArmorStat]> = [
  [/mask|cowl|footwrap|face.?wrap/i, 'stealth'],
  [/robe|vestment|regalia|vellum|sash|circlet/i, 'charisma'],
];

/** ⚠ THE GOOD HALF OF THE OLD DESIGN, KEPT. A helm is where thinking lives;
 *  boots are where speed lives. Slot flavour was never the problem — DEX being
 *  the answer on four slots at once was. A name with no identity noun takes its
 *  slot's pool, picked by a stable hash of the name so the pool actually spreads
 *  instead of piling onto its first entry. */
const SLOT_POOL: Readonly<Record<string, readonly ArmorStat[]>> = {
  head: ['wisdom', 'intelligence'],
  chest: ['hp', 'strength'],
  hands: ['strength', 'dexterity'],
  legs: ['dexterity', 'hp'],
  feet: ['dexterity', 'stealth'],
  cloak: ['stealth', 'charisma'],
};

/** FNV-1a. Deterministic and dependency-free: the same name always lands on the
 *  same pool entry, on every device and every rebuild, so this is authoring —
 *  not a roll. */
function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Affinity {
  stat: ArmorStat;
  /** 'identity' when a word in the name claimed it; 'garment' when the name
   *  said nothing about its wearer but the PIECE said what it is (OTA-1708);
   *  'slot' when the name said nothing at all and the piece took its slot's
   *  flavour. Reported so the audit can say how much of the catalog actually
   *  names itself — 65% identity, 4% garment, 31% slot. */
  from: 'identity' | 'garment' | 'slot';
}

/** ⚠⚠⚠ THE HP SCALE IS NOT THE ATTRIBUTE SCALE, and this guard is the difference
 *  between a redistribution and an accidental 3× power spike.
 *
 *  This OTA's whole promise is that only the LABEL moves. Three catalog rows
 *  carry amounts far outside attribute range because they are hp pieces:
 *  Mudstone Bulwark +30, Builder's Shoring Plate +20, Tomb-Warden Plate +20.
 *  "Tomb-WARDEN" matches the wisdom line, so the rule cheerfully moved a +20
 *  onto an attribute — on a character whose entire Wisdom is 17. That is not a
 *  relabel, it is the single strongest item in the game, invented by a tidy-up.
 *
 *  ⚠ My own suite caught it: the "power did not move" assertion failed on the
 *  piece, not on the number. So the amount gets a vote — a bonus too large to be
 *  an attribute IS an hp bonus, whatever the name suggests. */
const MAX_ATTRIBUTE_BONUS = 6;

/** The stat a piece with this name, on this slot, should carry.
 *
 *  `amount` is optional and advisory: pass the authored bonus and an hp-scale
 *  number pins the piece to hp. Pure. */
export function armorStatAffinity(name: string, slot: string, amount?: number): Affinity {
  if (typeof amount === 'number' && amount > MAX_ATTRIBUTE_BONUS) {
    return { stat: 'hp', from: 'identity' };
  }
  return affinityFromName(name, slot);
}

/** ⚠⚠⚠ OTA-1708 — THE CHANNEL A CATALOG ROW'S **PAID** PRIMARY SHOULD CARRY.
 *
 *  `armorStatAffinity` above says what a piece's name IMPLIES. This says what
 *  armor.json should therefore hold in `statBonuses[0]` — the entry
 *  `aggregateEquipmentBonuses` actually reads — given what is already authored
 *  there. The two are different questions, and conflating them is how this OTA
 *  nearly did real damage.
 *
 *  ⚠ It exists so the catalog and its test share ONE definition of "agrees with
 *  the rule". A regeneration script and a suite that each re-derived the two
 *  guards below would drift, and the drift would look like data.
 *
 *  TWO PLACES THE RULE HAS NO STANDING, and the authored channel stands:
 *
 *  ⚠⚠ 1. ACROSS THE ATTRIBUTE/HP LINE. The amounts are not interchangeable —
 *  an attribute caps at 6 while a chestplate is +30 hp, and hp is paid through
 *  hpMax rather than the stat block (MAX_ATTRIBUTE_BONUS above is the same
 *  observation from the other direction). Rewriting a +3 dexterity to +3 hp
 *  because the name says "Sentinel" would be a NERF wearing a relabel's
 *  clothes, and stage 1's promise was that power does not move. 58 rows are in
 *  this state; they keep exactly what they were authored with, and closing that
 *  gap needs a conversion rate, which would be a guess.
 *
 *  ⚠⚠ 2. WHEN THE RULE ONLY HASHED. `from: 'slot'` means precisely "the name
 *  said nothing" — the answer is then a stable pick from the slot's two-stat
 *  pool, and its whole job is to spread NAMELESS pieces rather than to overrule
 *  anybody. If the authored channel is already IN that pool it is one of the
 *  two answers the pool offers, so the hash has no argument against it and the
 *  human's pick stands. (Measured: this keeps 74 authored picks that an
 *  unguarded rewrite would have replaced with a hash — including
 *  "Golem-Wielder's Helm", whose authored INT+2 a hash would have moved to
 *  wisdom for no stated reason.) A channel OUTSIDE the pool has neither a name
 *  nor the slot behind it, so the pool decides.
 *
 *  Pure. `authored` is the row's current paid primary. */
export function paidPrimaryStat(
  name: string,
  slot: string,
  authored: { stat: string; amount: number },
): string {
  const { stat: want, from } = armorStatAffinity(name, slot, authored.amount);
  if (isHpChannel(want) !== isHpChannel(authored.stat)) return authored.stat;
  if (from === 'slot' && (SLOT_POOL[slot] ?? []).includes(canonicalArmorStat(authored.stat))) {
    return authored.stat;
  }
  return want;
}

/** The engine's synonym collapse, for the two guards above — `equipment.ts`
 *  owns the real one, and this module cannot import it without a cycle, so it
 *  covers exactly the aliases armor.json actually uses. ota1708 pins that the
 *  two agree on every stat in the catalog. */
function canonicalArmorStat(stat: string): ArmorStat {
  const s = String(stat ?? '').toLowerCase();
  if (s === 'acrobatics') return 'dexterity';
  if (s === 'investigation' || s === 'aetheria') return 'intelligence';
  if (s === 'constitution') return 'hp';
  return s as ArmorStat;
}

const isHpChannel = (stat: string): boolean => canonicalArmorStat(stat) === 'hp';

function affinityFromName(name: string, slot: string): Affinity {
  const bare = String(name ?? '').replace(MATERIAL, ' ');
  for (const [re, stat] of IDENTITY) {
    if (re.test(bare)) return { stat, from: 'identity' };
  }
  if (ROYAL.test(bare) && DISPLAY_SLOTS.includes(slot)) {
    return { stat: 'charisma', from: 'identity' };
  }
  // ⚠ OTA-1708 — the middle width. Nobody was named, so ask what the thing IS
  // before falling back to where it is worn.
  for (const [re, stat] of GARMENT) {
    if (re.test(bare)) return { stat, from: 'garment' };
  }
  const pool = SLOT_POOL[slot] ?? (['hp'] as const);
  return { stat: pool[stableHash(String(name ?? '')) % pool.length]!, from: 'slot' };
}
