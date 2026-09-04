jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1670 — WHAT A PIECE IS CALLED DECIDES WHAT IT DOES FOR YOU.
//
// Owner: *"I like your idea about distributing these stats by the names… that
// should have been the guiding principle throughout this whole thing instead of
// just sprinkling them in — which unfortunately I've said 'sprinkle them in'
// this whole time so it's probably on me. Let's rearrange everything by what
// stat best ties into the name."* And: *"yes this should affect all game save
// files."*
//
// ⚠⚠ THE MEASUREMENT THAT STARTED IT. 827 stat rolls across 297 pieces:
// dexterity 296 (35.8%), strength 134, constitution 83, hp 80, intelligence 52,
// charisma 52, wisdom 51, acrobatics 38, stealth 27, investigation 9, aetheria 5.
// DEX beat INT+CHA+WIS+acrobatics+stealth COMBINED and led four of six slots.
//
// ⚠⚠⚠ AND THE FIRST VERSION OF THIS FIX WAS ITSELF A LIE — caught by reading
// equipment.ts instead of trusting my own table. I balanced TEN channels down to
// a 16.3% peak and was ready to call it done. STAT_ALIAS collapses
// `acrobatics → dexterity`, `investigation → intelligence` and
// `constitution → hp` before anything is paid, so four of those ten never reach
// a character sheet. Authored intelligence 32 + investigation 37 would have
// ARRIVED as intelligence 69 — a fresh 24% peak — while the audit reported 11%.
// Dead behaviour wearing live clothes, introduced by the fix for it.
//
// The rule now emits only the seven channels the engine pays, and the numbers
// below are what a player actually experiences.

import { readFileSync } from 'fs';
import { join } from 'path';
import { armorStatAffinity, type ArmorStat } from '../app/engine/armorStatAffinity';
import { ARMOR } from '../app/engine/crafting';
import { canonicalStatKey } from '../app/engine/equipment';
import { healSavedItem } from '../app/engine/itemBackfill';
import type { InventoryItem } from '../app/engine/types';

const ROOT = join(__dirname, '..');
const withStat = ARMOR.filter((a) => a.statBonus && a.statBonus.stat);

describe('OTA-1670 — ⚠⚠⚠ every piece carries the stat its name implies', () => {
  it('the catalog agrees with the rule, row for row', () => {
    // The module is the rule; armor.json is its output. A row that drifts fails
    // HERE rather than silently becoming the new default someone reaches for.
    const wrong: string[] = [];
    for (const a of withStat) {
      const want = armorStatAffinity(a.name, a.slot, a.statBonus!.amount).stat;
      if (a.statBonus!.stat !== want) wrong.push(`${a.name} [${a.slot}]: ${a.statBonus!.stat} ≠ ${want}`);
    }
    expect(wrong).toEqual([]);
  });

  it('⚠⚠ the rule only ever emits a channel the ENGINE PAYS', () => {
    // The trap this OTA nearly fell into. Any stat whose canonical form differs
    // from itself is an authoring synonym, and authoring one means balancing a
    // table nobody sees.
    for (const a of withStat) {
      const s = a.statBonus!.stat;
      expect({ piece: a.name, stat: s, canon: canonicalStatKey(s) })
        .toEqual({ piece: a.name, stat: s, canon: s });
    }
  });

  it('⚠⚠⚠ and the spread is close to even ON THOSE CHANNELS', () => {
    const c = new Map<string, number>();
    for (const a of withStat) c.set(a.statBonus!.stat, (c.get(a.statBonus!.stat) ?? 0) + 1);
    const total = withStat.length;
    const shares = [...c.entries()].map(([k, v]) => ({ stat: k, share: v / total }));
    // Seven channels, so even is 14.3%. The old table's peak was 35.8% on a
    // channel set that was partly fiction. These bounds are deliberately loose:
    // slot flavour SHOULD tilt things (a helm is not a boot), and the owner has
    // a tweak pass coming. They exist to stop a single stat becoming the default
    // again, which is the whole defect.
    for (const s of shares) {
      expect({ stat: s.stat, tooBig: s.share > 0.22 }).toEqual({ stat: s.stat, tooBig: false });
      expect({ stat: s.stat, tooSmall: s.share < 0.05 }).toEqual({ stat: s.stat, tooSmall: false });
    }
    // Every one of the seven is actually represented — a channel with no armour
    // at all is a build nobody can make.
    expect(c.size).toBe(7);
  });

  it('⚠ power did not move — only the label on the channel', () => {
    // A redistribution, not a buff. Every amount is still a positive integer in
    // the range the catalog always used; nothing was scaled while stats moved.
    for (const a of withStat) {
      const amt = a.statBonus!.amount;
      // ⚠ hp is a DIFFERENT SCALE from the attributes — "Mudstone Bulwark" is
      // +30 hp, and a first draft of this assertion capped everything at 6 and
      // failed on it. An attribute of +30 would be a bug; an hp of +30 is a
      // chestplate. Bound each channel by what that channel actually means.
      const cap = a.statBonus!.stat === 'hp' ? 60 : 6;
      expect({ p: a.name, ok: Number.isInteger(amt) && amt > 0 && amt <= cap })
        .toEqual({ p: a.name, ok: true });
    }
  });

  it('⚠ names that clearly say a thing get that thing', () => {
    // Spot-checks in the owner's own terms — a stealth item reads stealth, a
    // scholar's piece reads intelligence, a warden WATCHES.
    const say = (n: string, slot: string): ArmorStat => armorStatAffinity(n, slot).stat;
    expect(say('Stealth Hood', 'head')).toBe('stealth');
    expect(say("Architect's Sight Enhancer", 'head')).toBe('intelligence');
    expect(say("Shaman's Veil of Secrets", 'head')).toBe('wisdom');
    expect(say("Titan's Gauntlets", 'hands')).toBe('strength');
    expect(say("Sentinel's Faceguard", 'head')).toBe('hp');
    expect(say('Skyreacher Mantle', 'cloak')).toBe('dexterity');
  });

  it('⚠⚠ a MATERIAL prefix never decides the stat', () => {
    // damageTypes.ts already refuses to read an "Aetheric Ooze" as dealing
    // aetheric damage. `aether*` appears in ~70 of 297 armour names; letting it
    // claim a channel would have moved the pile, not removed it.
    // ⚠ THE CLAIM IS ABOUT MEANING, NOT ABOUT THE HASH — and my first draft got
    // that wrong. On a name with NO identity noun the piece falls to its slot
    // pool, which spreads by a hash of the whole name, so "Aetheric Gauntlets"
    // and "Gauntlets" legitimately land differently. That is spread working.
    // What must never happen is a MATERIAL WORD claiming a channel: add any
    // prefix to a piece whose name already says what it is, and the answer must
    // not move.
    for (const [named, slot] of [["Titan's Gauntlets", 'hands'], ['Stealth Hood', 'head'],
      ["Shaman's Veil", 'head'], ["Architect's Lens", 'head']] as const) {
      const bare = armorStatAffinity(named, slot).stat;
      for (const prefix of ['Aetheric', 'Mud-Woven', 'Stone', 'Bone', 'Rough Hewn', 'Iron']) {
        expect({ named, prefix, same: armorStatAffinity(`${prefix} ${named}`, slot).stat === bare })
          .toEqual({ named, prefix, same: true });
      }
    }
  });

  it('⚠⚠⚠ an hp-SCALE amount stays on hp, whatever the name says', () => {
    // ⚠ THE ASSERTION THAT CAUGHT A REAL DEFECT IN THIS OTA. "Tomb-Warden Plate"
    // is a +20 chest piece; "warden" matches the wisdom line, so the first
    // version of the rule handed a character with 17 total Wisdom a +20 Wisdom
    // item and called it a relabel. Amounts are not interchangeable across
    // channels, so the amount gets a vote: too big to be an attribute means it
    // is hp, and power really is unchanged.
    expect(armorStatAffinity('Tomb-Warden Plate', 'chest', 20).stat).toBe('hp');
    expect(armorStatAffinity('Tomb-Warden Plate', 'chest', 2).stat).toBe('wisdom');
  });

  it('⚠⚠ regalia is worn where it is SEEN', () => {
    // Routed naively, king/crown/lord made charisma the second-biggest stat at
    // 18.8% — the old defect in a new word. A crown is read by everyone who
    // looks at you; a king's gauntlets are just very good plate.
    expect(armorStatAffinity("King's Crown", 'head').stat).toBe('charisma');
    expect(armorStatAffinity("King's Gauntlets", 'hands').stat).not.toBe('charisma');
  });

  it('the same name always lands the same way — this is authoring, not a roll', () => {
    for (const n of ['Plain Greaves', 'Nameless Vest', 'Zzz Unremarkable Cap']) {
      const a = armorStatAffinity(n, 'legs').stat;
      for (let i = 0; i < 5; i++) expect(armorStatAffinity(n, 'legs').stat).toBe(a);
    }
  });
});

describe('OTA-1670 — ⚠⚠⚠ saved gear follows its row to the new stat', () => {
  const piece = withStat.find((a) => a.statBonus!.stat === 'stealth') ?? withStat[0]!;

  it('a rolled channel is renamed and KEEPS ITS AMOUNT', () => {
    // The owner's ruling: "yes this should affect all game save files." The roll
    // is the player's — they earned that number. Only the channel it feeds moves.
    const saved = {
      id: 'x1', name: piece.name, kind: 'armor', quantity: 1, tags: [],
      // ⚠ A durability stamp, so `stampDurability` upstream is a no-op and this
      // test isolates the migration step instead of measuring the perk ROLLER.
      durability: { current: 12, max: 12 },
      instanceStats: { statBonuses: [{ stat: 'dexterity', amount: 4 }] },
    } as unknown as InventoryItem;
    const healed = healSavedItem(saved);
    expect(healed.instanceStats?.statBonuses).toEqual([
      { stat: piece.statBonus!.stat, amount: 4 },
    ]);
  });

  it('⚠ idempotent — a save already migrated comes back untouched', () => {
    const already = {
      id: 'x2', name: piece.name, kind: 'armor', quantity: 1, tags: [],
      // ⚠ A durability stamp, so `stampDurability` upstream is a no-op and this
      // test isolates the migration step instead of measuring the perk ROLLER.
      durability: { current: 12, max: 12 },
      instanceStats: { statBonuses: [{ stat: piece.statBonus!.stat, amount: 2 }] },
    } as unknown as InventoryItem;
    expect(healSavedItem(already).instanceStats?.statBonuses)
      .toEqual([{ stat: piece.statBonus!.stat, amount: 2 }]);
  });

  it('⚠⚠ it REFUSES TO GUESS on a Crucible piece', () => {
    // A fused piece's extra channels are its own history, not a catalog echo,
    // and there is no honest way to tell which of three rolled channels was once
    // the catalog's. Those keep exactly what they have.
    const fused = {
      id: 'x3', name: piece.name, kind: 'armor', quantity: 1, tags: ['fused'],
      durability: { current: 12, max: 12 },
      instanceStats: { statBonuses: [{ stat: 'dexterity', amount: 3 }] },
    } as unknown as InventoryItem;
    expect(healSavedItem(fused).instanceStats?.statBonuses)
      .toEqual([{ stat: 'dexterity', amount: 3 }]);
  });

  it('⚠ and on a multi-channel roll, for the same reason', () => {
    const many = {
      id: 'x4', name: piece.name, kind: 'armor', quantity: 1, tags: [],
      // ⚠ A durability stamp, so `stampDurability` upstream is a no-op and this
      // test isolates the migration step instead of measuring the perk ROLLER.
      durability: { current: 12, max: 12 },
      instanceStats: { statBonuses: [
        { stat: 'dexterity', amount: 2 }, { stat: 'wisdom', amount: 1 },
      ] },
    } as unknown as InventoryItem;
    expect(healSavedItem(many).instanceStats?.statBonuses?.length).toBe(2);
  });

  it('⚠⚠ an UNROLLED save gets the new channel from the roller, not the old one', () => {
    // ⚠ My first draft asserted this came back untouched, and that was wrong
    // about the pipeline: `stampDurability` upstream SEEDS perks for gear that
    // has none, straight from the catalog. So a piece that never rolled arrives
    // already on the new channel — the migration below it has nothing to do, and
    // the player still ends up correct. Asserting the outcome rather than my
    // assumption about which step produced it.
    const plain = {
      id: 'x5', name: piece.name, kind: 'armor', quantity: 1, tags: [],
    } as unknown as InventoryItem;
    const rolled = healSavedItem(plain).instanceStats?.statBonuses ?? [];
    for (const b of rolled) {
      expect({ stat: b.stat, isOld: b.stat === 'dexterity' && piece.statBonus!.stat !== 'dexterity' })
        .toEqual({ stat: b.stat, isOld: false });
    }
  });
});

describe('OTA-1670 — the rule is readable where it is enforced', () => {
  it('armor.json is authored data, not a runtime derivation', () => {
    const crafting = readFileSync(join(ROOT, 'app', 'engine', 'crafting.ts'), 'utf8');
    // Stated as a claim rather than a quoted import line — check:quotedpins
    // counts the prose-shaped form, and it is right to: the fact here is "the
    // catalog is loaded as data", not the exact spelling of one import.
    expect(crafting.includes('data/items/armor.json')).toBe(true);
    // A runtime derivation would make the JSON a lie and cost a scan on every
    // read. The module states the rule; the test above proves the data obeys it.
    expect(crafting).not.toContain('armorStatAffinity');
  });
});
