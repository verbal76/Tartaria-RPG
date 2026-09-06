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

/**
 * OTA-1708 — THE ARMOUR SPREAD REACHES THE PLAYER.
 *
 * Owner, on the stage-1 result: *"the armor 2 stage spread, I agree."*
 *
 * ⚠⚠⚠ AND THE MEASUREMENT THAT CAME WITH STAGE 2 IS THE REAL STORY: STAGE 1 WAS
 * NEVER ARRIVING.
 *
 * OTA-1670 rebalanced `statBonus`, row by row, and its suite proved every row
 * agreed with the rule. But `aggregateEquipmentBonuses` reads
 *
 *     const bonuses = piece.statBonuses ?? (piece.statBonus ? [piece.statBonus] : []);
 *
 * — `??` is either/or, not a union — and ALL 288 armour rows that carry a stat
 * also carry `statBonuses`. So `statBonus` was read for exactly zero pieces of
 * equipped armour, and what the player actually received was still:
 *
 *     dexterity 46.9% · strength 21.0% · intelligence 9.6%
 *     charisma 8.9% · wisdom 7.9% · stealth 5.7%
 *
 * which is the 35.8%-dexterity pile stage 1 was written to break up, measured
 * on the channel that pays. A beautiful table nobody experiences — this
 * project's own recurring defect, and the one OTA-1670's header warns about in
 * so many words, committed by the fix for it.
 *
 * ⚠ These tests therefore measure the PAID field. A suite that reads only
 * `statBonus` cannot tell a delivered rebalance from an undelivered one, which
 * is exactly how this survived.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { armorStatAffinity, paidPrimaryStat } from '../app/engine/armorStatAffinity';
import { ARMOR } from '../app/engine/crafting';
import { canonicalStatKey } from '../app/engine/equipment';
import { ATTRIBUTE_STATS } from '../app/engine/durability';
import { healSavedItem } from '../app/engine/itemBackfill';
import type { InventoryItem } from '../app/engine/types';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const withStat = ARMOR.filter((a) => a.statBonus && a.statBonus.stat);

/** Every bonus the ENGINE would read off a row — the same expression
 *  aggregateEquipmentBonuses, armorHpBonus and rollInstancePerks all use. */
const paidBonuses = (a: (typeof ARMOR)[number]): { stat: string; amount: number }[] =>
  a.statBonuses ?? (a.statBonus ? [a.statBonus] : []);

const isAttribute = (stat: string): boolean => ATTRIBUTE_STATS.has(canonicalStatKey(stat));

describe('OTA-1708 — ⚠⚠⚠ the rebalance is on the channel the engine pays', () => {
  it('every armour row carries statBonuses — which is WHY statBonus alone was invisible', () => {
    // If this ever stops being true the `??` starts falling through and the two
    // fields both matter; the assertion is here so that change cannot be silent.
    const missing = withStat.filter((a) => !a.statBonuses || a.statBonuses.length === 0);
    expect(missing.map((a) => a.name)).toEqual([]);
  });

  it('⚠⚠⚠ the PAID primary agrees with the rule wherever the rule has standing', () => {
    // `paidPrimaryStat` is the single definition of "agrees" — the module owns
    // both guards so this test and any regeneration cannot drift apart. A row
    // that changes without the rule changing fails HERE.
    const wrong: string[] = [];
    for (const a of withStat) {
      const paid = paidBonuses(a)[0]!;
      const want = paidPrimaryStat(a.name, a.slot, paid);
      if (paid.stat !== want) wrong.push(`${a.name} [${a.slot}]: paid=${paid.stat} ≠ ${want}`);
    }
    expect(wrong).toEqual([]);
  });

  it('⚠⚠⚠ a HASH never overrules a human — the pool guard', () => {
    // `from: 'slot'` means the name said nothing, so the answer is a stable pick
    // from the slot's two-stat pool whose job is to spread NAMELESS pieces. If
    // the authored channel is already one of the two the pool offers, the hash
    // has no argument against it. "Golem-Wielder's Helm" is the case that caught
    // this: authored INT+2, and an unguarded rewrite moved it to wisdom — a
    // different answer, with nothing to say for itself, on live player-facing
    // data. 57 rows are held by this guard.
    const helm = ARMOR.find((a) => a.name === "Golem-Wielder's Helm")!;
    expect(armorStatAffinity(helm.name, helm.slot).from).toBe('slot');
    expect(paidBonuses(helm)[0]).toEqual({ stat: 'intelligence', amount: 2 });
    // Out-of-pool authored channels have neither a name nor the slot behind
    // them, so there the pool does decide.
    expect(paidPrimaryStat('Zzz Nameless Cap', 'head', { stat: 'strength', amount: 1 }))
      .not.toBe('strength');
  });

  it('the module’s alias collapse agrees with the engine’s, on every stat the catalog uses', () => {
    // paidPrimaryStat compares families, and armorStatAffinity cannot import
    // equipment.ts without a cycle, so it carries its own small copy. Two copies
    // that disagree would misfile a row silently.
    const seen = new Set<string>();
    for (const a of ARMOR) for (const b of paidBonuses(a)) seen.add(b.stat);
    expect(seen.size).toBeGreaterThan(6);
    for (const stat of seen) {
      // Same verdict on the one question paidPrimaryStat asks of it.
      const engineSaysHp = canonicalStatKey(stat) === 'hp';
      const moduleSaysHp = paidPrimaryStat('Zzz Nameless Cap', 'head', { stat, amount: 1 }) === stat
        && !ATTRIBUTE_STATS.has(canonicalStatKey(stat));
      expect({ stat, agree: !engineSaysHp || moduleSaysHp }).toEqual({ stat, agree: true });
    }
  });

  it('⚠⚠⚠ POWER DID NOT MOVE — every entry kept its family and its amount', () => {
    // The promise stage 1 made and this OTA has to keep on a much larger
    // rewrite (151 primary channels). The counts below are the whole proof: an
    // attribute entry that became an hp entry would be a nerf, not a relabel,
    // because the two run on different scales (a chestplate is +30 hp; an
    // attribute caps at 6) AND because hp is paid through hpMax rather than the
    // stat block. 405 / 134 was the split before the rewrite.
    let attrs = 0;
    let hp = 0;
    for (const a of ARMOR) {
      for (const b of paidBonuses(a)) {
        if (isAttribute(b.stat)) attrs++;
        else hp++;
        expect({ p: a.name, amt: b.amount, ok: Number.isInteger(b.amount) && b.amount > 0 })
          .toEqual({ p: a.name, amt: b.amount, ok: true });
      }
    }
    expect({ attrs, hp }).toEqual({ attrs: 405, hp: 134 });
  });

  it('⚠⚠ and the spread the PLAYER receives is the one that closed', () => {
    // Was dexterity 46.9% / stealth 5.7% — an 8:1 range on the paid channel.
    const c = new Map<string, number>();
    let total = 0;
    for (const a of ARMOR) {
      for (const b of paidBonuses(a)) {
        if (!isAttribute(b.stat)) continue;
        const k = canonicalStatKey(b.stat);
        c.set(k, (c.get(k) ?? 0) + 1);
        total++;
      }
    }
    expect(c.size).toBe(6);
    const shares = [...c.entries()].map(([stat, n]) => ({ stat, share: n / total }));
    for (const s of shares) {
      // Ratchets, not targets: they exist so the pile cannot re-form. The
      // remaining dexterity lead lives in the SECONDARY entries, which the rule
      // does not author — see the note at the end of this file.
      expect({ stat: s.stat, tooBig: s.share > 0.32 }).toEqual({ stat: s.stat, tooBig: false });
      expect({ stat: s.stat, tooSmall: s.share < 0.10 }).toEqual({ stat: s.stat, tooSmall: false });
    }
  });
});

describe('OTA-1708 — stage 2: the piece is read after its wearer, before its slot', () => {
  const say = (n: string, slot: string): string => armorStatAffinity(n, slot).stat;

  it('⚠⚠ a garment with no one in its name is read as what it IS, not hashed by slot', () => {
    // Three masks used to land on three different stats — wisdom, intelligence,
    // wisdom — because a hash of the name picked from the head pool. A mask
    // conceals; that is the entire reason to wear one, and `hood` already
    // claimed stealth in the identity table for exactly this reason.
    for (const n of ['Aetheric Mask', 'Rough Hewn Mask', 'Aether-Breath Mask', 'Mask of the Forgotten One']) {
      expect({ n, stat: say(n, 'head') }).toEqual({ n, stat: 'stealth' });
    }
    expect(say('Ceremonial Robes', 'chest')).toBe('charisma');
  });

  it('⚠⚠⚠ but a name that names a PERSON still wins — the tier is a fallback, not an override', () => {
    // The ordering claim. If garment ever ran before identity these would flip,
    // and the rule would stop being "what a piece is called decides what it does".
    expect(say("Diplomat's Mask of the Giants", 'head')).toBe('charisma');
    expect(say("Architect's Mask of Vision", 'head')).toBe('intelligence');
    expect(say("Shaman's Veil of Secrets", 'head')).toBe('wisdom');
  });

  it('a limb-plate says nothing about intent, so it still takes its slot', () => {
    // The tier is deliberately two families wide. Gauntlets and greaves are just
    // armour on a limb; giving them a channel would be a quota wearing a rule's
    // clothes.
    expect(['strength', 'dexterity']).toContain(say('Aetheric Gauntlets', 'hands'));
  });

  it('the identity gaps stage 1 left', () => {
    expect(say('Mud-Lurker Boots', 'feet')).toBe('stealth');          // `stalker` was there, `lurker` was not
    expect(say('Aetheric Helm of Command', 'head')).toBe('charisma');  // leading people
    expect(say("Matriarch's Carapace", 'chest')).toBe('charisma');
    expect(say("Forgotten Protector's Plate", 'chest')).toBe('hp');    // the ones that stand
    expect(say("Crown Defender's Plate", 'chest')).toBe('hp');
  });
});

describe('OTA-1708 — ⚠⚠⚠ no authored rule is unreachable', () => {
  it('the MATERIAL strip matches WORDS, so a compound identity word survives it', () => {
    // The bug: MATERIAL ran first and ate the INSIDE of compound words, so
    // `stoneborn` (hp) was reduced to " born" by `stone`, and `ironhide`
    // (strength) to nothing at all by `iron` + `hide`. Both sat in the table
    // looking authored and could never fire once.
    expect(armorStatAffinity('Mask of the Stoneborn', 'head', 2).stat).toBe('hp');
    expect(armorStatAffinity('Ironhide Warplate', 'chest', 3).stat).toBe('strength');
  });

  it('⚠⚠ THE INSTRUMENT — every alternative in every tier can still match something', () => {
    // Not a spot-check: the whole vocabulary, walked. An entry that cannot fire
    // is dead behaviour wearing live clothes, which is this project's own
    // recurring defect and exactly what the two above were. If a future edit to
    // MATERIAL shadows a word, this names it rather than letting it rot.
    const mod = src('app', 'engine', 'armorStatAffinity.ts');
    const material = new RegExp(/const MATERIAL = \/(.+?)\/gi;/.exec(mod)![1]!, 'gi');
    const tiers = [...mod.matchAll(/\[\/(.+?)\/i, '(\w+)'\]/g)].map((m) => m[1]!);
    expect(tiers.length).toBe(9);   // 7 identity lines + 2 garment lines
    const unreachable: string[] = [];
    for (const line of tiers) {
      for (const alt of line.split('|')) {
        // A name built to contain this alternative, put through the strip.
        const probe = `Test ${alt.replace(/\\b/g, '').replace(/\.\?/g, '-').replace(/\\/g, '')} Helm`;
        if (!new RegExp(alt, 'i').test(probe.replace(material, ' '))) unreachable.push(alt);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('⚠⚠⚠ THE INSTRUMENT — an identity word may end a compound, but every case is declared', () => {
    // The other half of the substring problem, and the one that did damage. This
    // catalog compounds its names, so an identity word legitimately arrives as
    // the TAIL of a longer one — "Forgotten Faceshroud" is a shroud,
    // "Stonebreaker's Cloak" is a breaker — which is why the identity table is
    // not blanket-bounded the way MATERIAL is.
    //
    // The cost is a false friend, and there was one: `elder` sits inside
    // "Wi-elder", so "Golem-Wielder's Helm" read WISDOM off a syllable, and that
    // answer then outranked the slot pool and overwrote the helm's authored
    // INT+2. Anchoring that one alternative was the fix; this walk is the guard,
    // so the next false friend is named instead of absorbed.
    const mod = src('app', 'engine', 'armorStatAffinity.ts');
    const material = new RegExp(/const MATERIAL = \/(.+?)\/gi;/.exec(mod)![1]!, 'gi');
    const tiers = [...mod.matchAll(/\[\/(.+?)\/i, '(\w+)'\]/g)].map((m) => new RegExp(m[1]!, 'i'));
    const midWord: string[] = [];
    for (const a of withStat) {
      const bare = a.name.replace(material, ' ');
      for (const re of tiers) {
        const m = re.exec(bare);
        if (!m) continue;
        if (m.index > 0 && /\w/.test(bare[m.index - 1]!)) midWord.push(`${a.name} → ${m[0]}`);
        break;
      }
    }
    expect(midWord.sort()).toEqual([
      'Forgotten Faceshroud → shroud',
      "Stonebreaker's Cloak → breaker",
    ]);
  });

  it('a material PREFIX is still only flavour — the stage-1 contract is untouched', () => {
    for (const [named, slot] of [["Titan's Gauntlets", 'hands'], ['Stealth Hood', 'head'],
      ["Shaman's Veil", 'head'], ["Architect's Lens", 'head']] as const) {
      const bare = armorStatAffinity(named, slot).stat;
      for (const prefix of ['Aetheric', 'Mud-Woven', 'Stone', 'Bone', 'Rough Hewn', 'Iron']) {
        expect({ named, prefix, same: armorStatAffinity(`${prefix} ${named}`, slot).stat === bare })
          .toEqual({ named, prefix, same: true });
      }
    }
  });
});

describe('OTA-1708 — ⚠⚠⚠ the saved-gear migration stopped deleting bonuses', () => {
  // followCatalogStat read `statBonus` — the field nothing pays — while
  // rollInstancePerks seeds an instance from `statBonuses`. On 42 catalog rows
  // the two disagreed ACROSS the attribute/hp line, and because instance perks
  // are attribute-only and aggregateEquipmentBonuses `continue`s past the
  // catalog once instanceStats exist, renaming a rolled `dexterity` to the
  // catalog's `hp` did not move the bonus — it dropped it.
  const saved = (name: string, stat: string, amount: number): InventoryItem => ({
    id: 'x1', name, kind: 'armor', quantity: 1, tags: [],
    durability: { current: 12, max: 12 },
    instanceStats: { statBonuses: [{ stat, amount }] },
  } as unknown as InventoryItem);

  it('⚠⚠⚠ it never writes a channel instanceStats cannot carry', () => {
    const hpRows = ARMOR.filter((a) => a.statBonus && !isAttribute(paidBonuses(a)[0]!.stat));
    expect(hpRows.length).toBeGreaterThan(0);   // the shape exists, so the guard is load-bearing
    for (const row of hpRows.slice(0, 25)) {
      const healed = healSavedItem(saved(row.name, 'dexterity', 3));
      const out = healed.instanceStats!.statBonuses![0]!;
      expect({ p: row.name, attribute: isAttribute(out.stat), amount: out.amount })
        .toEqual({ p: row.name, attribute: true, amount: 3 });
    }
  });

  it('it follows the PAID field, and keeps the amount the player rolled', () => {
    const row = ARMOR.find((a) => a.statBonus && isAttribute(paidBonuses(a)[0]!.stat))!;
    const want = paidBonuses(row)[0]!.stat;
    const other = want === 'dexterity' ? 'wisdom' : 'dexterity';
    const healed = healSavedItem(saved(row.name, other, 4));
    expect(healed.instanceStats!.statBonuses![0]).toEqual({ stat: want, amount: 4 });
  });

  it('and it is still idempotent, and still refuses fused pieces', () => {
    const row = ARMOR.find((a) => a.statBonus && isAttribute(paidBonuses(a)[0]!.stat))!;
    const want = paidBonuses(row)[0]!.stat;
    const once = healSavedItem(saved(row.name, want, 2));
    expect(healSavedItem(once).instanceStats!.statBonuses![0]).toEqual({ stat: want, amount: 2 });
    const fused = { ...saved(row.name, 'wisdom', 2), tags: ['fused'] } as InventoryItem;
    expect(healSavedItem(fused).instanceStats!.statBonuses![0]!.stat).toBe('wisdom');
  });
});

/**
 * ⚠⚠ WHAT THIS OTA DID NOT DO, AND WHY IT IS WRITTEN DOWN RATHER THAN QUIETLY
 * LEFT.
 *
 * Two things are still open, and both are the owner's call rather than mine:
 *
 * · THE SECONDARY ENTRIES. 195 rows carry more than one bonus, and the rule
 *   gives one answer per piece, so only the primary is authored. The extras
 *   still hold the pre-OTA-1670 sprinkle, and that is where the remaining
 *   dexterity lead (27.9%) lives. Ruling them would mean either collapsing a
 *   multi-stat piece into repeats of one stat or inventing a second rule for
 *   "what else does this piece do" — a design question, not a tidy-up.
 *
 * · 58 ROWS WHERE THE NAME AND THE AUTHORED FAMILY DISAGREE — mostly Sentinel /
 *   Guardian / Titan pieces whose names say "stands" while their paid channel is
 *   an attribute. They were left EXACTLY as authored, because moving +3 dexterity
 *   to +3 hp is not a relabel: it is a nerf on a different scale. Converting them
 *   needs a rate, and a rate would be a guess.
 *
 * Both are why dexterity is still the lead at 29.4% rather than the ~14% an even
 * seven-way split would give. That number is honest about what was actually
 * fixed, and the ratchets above are set just outside it so it can only improve.
 */
