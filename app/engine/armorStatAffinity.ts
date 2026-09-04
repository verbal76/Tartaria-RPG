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
const IDENTITY: ReadonlyArray<readonly [RegExp, ArmorStat]> = [
  // The watchers, and the ones who find by LOOKING. A warden watches — it spent
  // this catalog's whole life in the "wall" bucket next to guardian. Hunters and
  // trackers belong here too: finding a thing in the silt is perception.
  [/shaman|seer|oracle|veil|litany|oath|vigil|elder|prophet|secrets|observer|watch|augur|warden|scout|tracker|hunter|pathfinder|insight|intuit/i, 'wisdom'],
  // The builders, the readers of machines, and the ones who sort salvage —
  // knowing WHAT a thing is, as against spotting that it is there.
  [/architect|scholar|arcane|weaver|engineer|survey|sight|lens|codex|schema|calibrat|analyt|rune|relic|salvager|delver|seeker|prospect/i, 'intelligence'],
  // The unseen.
  [/shadow|stalker|whisper|silent|quiet|shroud|hood|ghost|phantom|dusk|night|creep|hush|veiled|thief|light.?finger|slip/i, 'stealth'],
  // ⚠ The SPEAKING — words about dealing with people. Royal words are NOT here;
  // see ROYAL below for why.
  [/herald|envoy|court|noble|banner|orat|parley|accord|charm|silver.?tongue/i, 'charisma'],
  // The ones that stand, and the ones that keep you alive. (`constitution` is an
  // alias of `hp` in equipment.ts — one channel, so one entry.)
  [/sentinel|guardian|bulwark|bastion|guard|anchor|stoneborn|ward\b|aegis|endur|unbroken|hearth|vital|lifeward|mender|blood|sustain|marrow/i, 'hp'],
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
const MATERIAL = /aether\w*|mud|stone|bone|iron|silt|glass|rust|ash|salt|tar|clay|leather|hide|scale|chitin|worn|rough|hewn|reinforced|woven|forged|patched|plated/gi;

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
  /** 'identity' when a word in the name claimed it; 'slot' when the name said
   *  nothing and the piece took its slot's flavour. Reported so the audit can
   *  say how much of the catalog actually names itself (currently 64%). */
  from: 'identity' | 'slot';
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

function affinityFromName(name: string, slot: string): Affinity {
  const bare = String(name ?? '').replace(MATERIAL, ' ');
  for (const [re, stat] of IDENTITY) {
    if (re.test(bare)) return { stat, from: 'identity' };
  }
  if (ROYAL.test(bare) && DISPLAY_SLOTS.includes(slot)) {
    return { stat: 'charisma', from: 'identity' };
  }
  const pool = SLOT_POOL[slot] ?? (['hp'] as const);
  return { stat: pool[stableHash(String(name ?? '')) % pool.length]!, from: 'slot' };
}
