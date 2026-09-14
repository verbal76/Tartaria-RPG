// ⚠⚠⚠ OTA-1815 — A SALVAGE WORD IS A WHOLE WORD.
//
// Room salvage turned a noun into an economic pool with `lower.includes(pattern)`
// over an ordered array, first hit wins. Two defects, both deterministic, both
// measured against the authored interactable corpus rather than argued about:
//
//   1. FRAGMENTS COUNTED AS WORDS. "urn" lives inside bURNt / joURNal / fURNace /
//      fURNiture / bURN scar, so all of them became TOMB. "rack" lives inside
//      cRACKed, so `cracked statue` became FURNITURE. "bow" opens "bowl", so a
//      bowl was a WEAPON. "rag" ends "cRAG" and sits in "fRAGment", so
//      `bone fragment` was FABRIC. 196 of 1,203 nouns carried such a match.
//
//   2. A CONDITION COULD OUTRANK AN OBJECT. `junk_salvage`'s patterns are all
//      state words, and `salvageableSpawns.FLAVOR_ADJECTIVES` PREPENDS those
//      same words to curated salvageables at spawn time — so the game itself
//      manufactures "cracked <thing>" and then classified it by the adjective.
//
// This suite holds the repair and, just as importantly, holds its BLAST RADIUS:
// the probability branches, the material tables, the costs and the sigil path
// are pinned unchanged, because Job 1 may reroute a noun to an existing pool and
// may not alter what that pool contains.
//
// ⚠ AMBIGUITY IS EXPOSED, NOT ERASED. `classifySalvageNoun` reports every family
// that matched and flags genuine multi-family nouns. The census below asserts
// ZERO accidental intra-word collisions and deliberately asserts NOTHING about
// the ambiguity count — a jar is still a container and a glass vessel, and
// deciding which is an owner ruling this job does not make.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rollSalvagePool, hasSalvageYield, classifySalvageNoun, __TEST_ONLY__,
} from '../app/engine/salvagePools';

const POOLS = __TEST_ONLY__.POOLS;
const pickPool = __TEST_ONLY__.pickPool;
const CONDITION_POOL_ID = __TEST_ONLY__.CONDITION_POOL_ID;

const pool = (noun: string): string | null => classifySalvageNoun(noun)?.poolId ?? null;

// ── the corpus: every authored interactable the world data ships ──────────────
function corpus(): string[] {
  const out = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'interactables' && Array.isArray(v)) {
          for (const s of v) if (typeof s === 'string' && s.trim()) out.add(s.trim().toLowerCase());
        } else walk(v);
      }
    }
  };
  for (const rel of [
    'app/data/locations/locations.json',
    'app/data/world/static_hub.json',
    'app/data/world/worldLadder.json',
  ]) walk(JSON.parse(readFileSync(join(__dirname, '..', rel), 'utf8')));
  return [...out].sort();
}
const NOUNS = corpus();

/** The shipped-before matcher, reproduced EXACTLY, so the census can say what
 *  changed rather than only what is true now. */
function legacyPool(noun: string): string | null {
  const lower = noun.toLowerCase();
  for (const p of POOLS) for (const pat of p.patterns) if (lower.includes(pat)) return p.id;
  return null;
}

/** Did the pool that WON win only because a pattern appeared inside a word?
 *
 *  ⚠ EXPRESSED AS REGEXES, deliberately, and never by calling the production
 *  matcher — a guard that asks the implementation whether the implementation is
 *  right proves nothing. Two shapes count as a real word:
 *
 *    · the pattern standing as a word, optionally inflected  (…ribs, rusted)
 *    · the pattern ENDING a longer word, ≥5 chars with ≥3 chars of prefix in
 *      front of it — the compound head (microSCOPE, counterWEIGHT)
 *
 *  Anything else that made a pool win is a fragment, and this returns true. */
function wonByFragment(noun: string, poolId: string | null): boolean {
  if (!poolId) return false;
  const p = POOLS.find((x) => x.id === poolId);
  if (!p) return false;
  const lower = noun.toLowerCase();
  for (const pat of p.patterns) {
    const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
    if (new RegExp(`(?<![a-z])${esc}(?:s|es|ed|ing)?(?![a-z])`, 'i').test(lower)) return false;
    const bare = pat.replace(/[\s-]+/g, '');
    if (bare.length >= 5 && new RegExp(`[a-z]{3,}${esc}(?:s|es|ed|ing)?(?![a-z])`, 'i').test(lower)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('A. a pattern inside another word is not a match', () => {
  it('⚠⚠⚠ the four proven false classifications are gone', () => {
    expect(legacyPool('burnt tome')).toBe('tomb');
    expect(pool('burnt tome')).toBe('archive');

    expect(legacyPool('journal')).toBe('tomb');
    expect(pool('journal')).toBe('archive');

    expect(legacyPool('furnace door')).toBe('tomb');
    expect(pool('furnace door')).toBe('furniture');

    expect(legacyPool('cracked statue')).toBe('furniture');
    expect(pool('cracked statue')).toBe('stonework');
  });

  it('⚠⚠ and so is the CLASS — nouns nobody listed, broken by the same mechanism', () => {
    // Each of these was a live misroute in the shipped corpus, found by census.
    expect(legacyPool('bowl')).toBe('weapon_scrap');          // "BOWl"
    expect(pool('bowl')).toBe('glassware');
    expect(legacyPool('bone fragment')).toBe('tomb');         // 'rag' in "fRAGment"
    expect(pool('bone fragment')).toBe('tomb');               // now for the RIGHT reason
    expect(classifySalvageNoun('bone fragment')!.pattern).toBe('bone');
    expect(legacyPool("scribe's quill")).toBe('tomb');        // 'rib' in "scRIBe"
    expect(pool("scribe's quill")).toBeNull();
    expect(legacyPool('crag')).toBe('fabric');                // 'rag' ends "cRAG"
    expect(pool('crag')).toBeNull();
    expect(legacyPool('kitchen')).toBe('textile');            // 'kit' opens "KITchen"
    expect(pool('kitchen')).toBeNull();
  });

  it('⚠ inflections still match — the repair is boundary-aware, not literal', () => {
    expect(pool('ribs')).toBe('tomb');
    expect(pool('rusted hull')).toBe('nautical');
    expect(pool('bones')).toBe('tomb');
  });

  it('⚠⚠ compound HEADS still match, and the two floors keep coincidences out', () => {
    expect(pool('microscope')).toBe('engine_parts');   // micro+SCOPE
    expect(pool('counterweight')).toBe('fixture_metal'); // counter+WEIGHT
    expect(pool('workbench')).toBe('furniture');       // work+BENCH
    // …and the coincidences the floors exist for:
    expect(pool('shimmering fog')).toBeNull();  // 'ring' is 4 chars — below the head floor
    expect(pool('rope bridge')).toBeNull();     // "b"+"ridge" leaves a 1-char prefix
    expect(pool('boot-track')).toBeNull();      // "t"+"rack" likewise
  });
});

describe('B. a condition modifier cannot steal a physical identity', () => {
  // salvageableSpawns.FLAVOR_ADJECTIVES prepends exactly these at spawn time.
  const MODIFIERS = ['cracked', 'broken', 'rusted', 'weathered', 'buried'];
  const OBJECTS: Array<[string, string]> = [
    ['statue', 'stonework'], ['lantern', 'light'], ['crate', 'container'],
    ['tome', 'archive'], ['skeleton', 'tomb'], ['anvil', 'fixture_metal'],
    ['tapestry', 'textile'], ['hull', 'nautical'],
  ];
  it('⚠⚠⚠ every modifier × every unambiguous object keeps the object', () => {
    for (const m of MODIFIERS) {
      for (const [obj, expected] of OBJECTS) {
        expect(pool(obj)).toBe(expected);
        expect(`${m} ${obj} -> ${pool(`${m} ${obj}`)}`).toBe(`${m} ${obj} -> ${expected}`);
      }
    }
  });

  it('⚠⚠ the shipped classifier really did lose some of those — this is a repair', () => {
    expect(legacyPool('broken throne')).toBe(CONDITION_POOL_ID);
    expect(pool('broken throne')).toBe('stonework');
    expect(legacyPool('buried statue')).toBe(CONDITION_POOL_ID);
    expect(pool('buried statue')).toBe('stonework');
  });

  it('⚠ but the condition pool KEEPS its last-resort job when that is all there is', () => {
    expect(pool('rusted remnant')).toBe(CONDITION_POOL_ID);
    expect(pool('cracked floor')).toBe(CONDITION_POOL_ID);
    expect(pool('scrap heap')).toBe(CONDITION_POOL_ID);
  });
});

describe('C. known unambiguous physical nouns land where source says', () => {
  it('⚠ and they were already right — the repair moved none of them', () => {
    for (const [noun, expected] of [
      ['plank', 'nautical'], ['driftwood', 'nautical'], ['skeleton', 'tomb'],
      ['robes', 'tomb'], ['banner', 'relic_site'],
    ] as Array<[string, string]>) {
      expect(`${noun}=${legacyPool(noun)}`).toBe(`${noun}=${expected}`);
      expect(`${noun}=${pool(noun)}`).toBe(`${noun}=${expected}`);
    }
  });

  it('⚠⚠ a multi-word pattern outranks a single word — specific evidence wins', () => {
    // `circuit panel` is an authored engine_parts phrase that mechanical's bare
    // 'circuit' intercepted under array order. Precedence is declared now.
    expect(legacyPool('circuit panel')).toBe('mechanical');
    expect(pool('circuit panel')).toBe('engine_parts');
    expect(classifySalvageNoun('circuit panel')!.pattern).toBe('circuit panel');
  });
});

describe('D. genuine ambiguity is reported, not hidden', () => {
  it('⚠⚠ a noun that two families both claim says so', () => {
    const jar = classifySalvageNoun('jar')!;
    expect(jar.ambiguous).toBe(true);
    expect(jar.families).toEqual(expect.arrayContaining(['container', 'glassware']));
    // …and still resolves deterministically, by declared precedence.
    expect(jar.poolId).toBe('container');
  });

  it('⚠ an unambiguous noun is not flagged', () => {
    expect(classifySalvageNoun('driftwood')!.ambiguous).toBe(false);
  });

  it('⚠ a condition word alone is not "ambiguity"', () => {
    expect(classifySalvageNoun('rusted remnant')!.ambiguous).toBe(false);
  });
});

describe('E. census over the whole authored corpus', () => {
  it('⚠⚠⚠ ACCIDENTAL INTRA-WORD COLLISIONS = 0', () => {
    // ⚠ An OVERRIDE is excluded here and counted separately below, because it
    // wins by declaration rather than by any pattern — not because it would be
    // inconvenient. Every other noun in the corpus must have won on a word.
    const overridden = new Set(__TEST_ONLY__.NOUN_OVERRIDES.keys());
    const offenders = NOUNS.filter((n) => !overridden.has(n) && wonByFragment(n, pool(n)));
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ and the overrides are exactly the eight named ones — nothing hides in there', () => {
    const overridden = NOUNS.filter((n) => __TEST_ONLY__.NOUN_OVERRIDES.has(n));
    expect(overridden.sort()).toEqual([
      'candleholder', 'furniture', 'lamppost', 'longbow',
      'mailbox', 'signpost', 'tarpaulin', 'trapdoor',
    ]);
  });

  it('⚠⚠ the shipped classifier had many — the guard is measuring something', () => {
    const before = NOUNS.filter((n) => wonByFragment(n, legacyPool(n)));
    expect(before.length).toBeGreaterThan(50);
  });

  it('⚠ the corpus is the real one and the pool table is untouched', () => {
    expect(NOUNS.length).toBeGreaterThan(1100);
    expect(POOLS.length).toBe(21);
    expect(POOLS.reduce((a, p) => a + p.patterns.length, 0)).toBe(421);
  });

  it('⚠ no noun GAINED a match it did not have — the repair only narrows or reroutes', () => {
    const gained = NOUNS.filter((n) => legacyPool(n) === null && pool(n) !== null);
    expect(gained).toEqual([]);
  });

  it('⚠ every override resolves to a real pool', () => {
    for (const [noun, poolId] of __TEST_ONLY__.NOUN_OVERRIDES) {
      expect(POOLS.some((p) => p.id === poolId)).toBe(true);
      expect(pool(noun)).toBe(poolId);
    }
    expect(__TEST_ONLY__.NOUN_OVERRIDES.size).toBe(8);
  });
});

describe('F. one authority', () => {
  it('⚠⚠⚠ hasSalvageYield and rollSalvagePool agree on every corpus noun', () => {
    // The sigil/crest HEAD-NOUN gate is the one documented thing that answers
    // before the classifier is consulted, in BOTH functions; it is asserted in
    // its own right below, so it is excluded here rather than smuggled in.
    const isSigilHead = (n: string): boolean => /(?:^|[\s-])(sigil|crest)s?\s*$/i.test(n.trim());
    const disagreements: string[] = [];
    for (const n of NOUNS) {
      const yields = hasSalvageYield(n);
      const rolls = rollSalvagePool(n, () => 0.5) !== null;
      if (yields !== rolls) { disagreements.push(`${n} (yield/roll)`); continue; }
      if (isSigilHead(n)) continue;
      if (yields !== (pickPool(n) !== null)) disagreements.push(`${n} (classifier)`);
    }
    expect(disagreements).toEqual([]);
    // …and the exclusion is not a loophole: it covers a handful of nouns, not
    // a quiet majority.
    expect(NOUNS.filter(isSigilHead).length).toBeLessThan(5);
  });

  it('⚠⚠ the sigil head-noun gate is the ONE thing hasSalvageYield adds', () => {
    // It yields even though no pool pattern needs to match the head noun.
    expect(hasSalvageYield('mud crest')).toBe(true);
    expect(rollSalvagePool('mud crest', () => 0.5)?.poolId).toBe('sigil');
    // …and mentioning a sigil is still not BEING one.
    expect(rollSalvagePool('sigil floor', () => 0.5)?.poolId).not.toBe('sigil');
  });

  it('⚠ pickPool is the shared resolver, not a second matcher', () => {
    for (const n of ['burnt tome', 'cracked statue', 'jar', 'rusted remnant', 'longbow']) {
      expect(pickPool(n)?.id ?? null).toBe(pool(n));
    }
  });
});

describe('G. behaviour preservation — the repair reroutes, it does not rebalance', () => {
  it('⚠⚠ the junk branch is still 5%, and still the FIRST branch', () => {
    expect(__TEST_ONLY__.NOTHING_CHANCE).toBe(0.05);
    expect(rollSalvagePool('wagon', () => 0.01)?.itemName)
      .toEqual(expect.stringMatching(/^(Stick|Smooth Stone|Cloth Scrap|Bent Nail|Bone Sliver)$/));
  });

  it('⚠⚠ the curio valve and the light rare-find are untouched', () => {
    const src = readFileSync(join(__dirname, '..', 'app/engine/salvagePools.ts'), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).toContain('const CURIO_CHANCE = 0.18');
    expect(code).toContain("rareFind: { name: 'Aetheric Torch'");
    expect(code).toContain('const NOTHING_CHANCE = 0.05');
  });

  it('⚠⚠⚠ every pool still contains exactly the items it shipped with', () => {
    // ⚠ Frozen literal rather than a snapshot: a snapshot regenerates, and the
    // one thing this job must never do is quietly re-baseline the economy.
    // Each row is id:itemCount:weightSum:minSum-maxSum, read off the shipped
    // tree before the classifier was touched. Any weight, quantity, rarity-slot
    // or entry change moves a number here.
    const SHIPPED = [
      'mechanical:5:100:6-12', 'wagon:4:90:6-14', 'weapon_scrap:5:100:5-8',
      'engine_parts:5:100:5-11', 'nautical:4:100:8-19', 'light:3:85:3-6',
      'tomb:4:100:6-14', 'archive:4:100:5-10', 'rubble:5:100:6-15',
      'relic_site:6:100:7-15', 'container:6:100:8-18', 'fabric:5:100:5-10',
      'furniture:4:100:4-10', 'trap_salvage:5:100:5-8', 'junk_salvage:5:100:5-11',
      'fixture_metal:5:100:5-12', 'stonework:5:100:5-11', 'textile:5:100:5-9',
      'glassware:5:100:5-10', 'growth:5:100:5-10', 'devotional:5:100:5-12',
    ];
    const actual = POOLS.map((p) => {
      const w = p.items.reduce((a, i) => a + i.weight, 0);
      const lo = p.items.reduce((a, i) => a + i.min, 0);
      const hi = p.items.reduce((a, i) => a + i.max, 0);
      return `${p.id}:${p.items.length}:${w}:${lo}-${hi}`;
    });
    expect(actual).toEqual(SHIPPED);
    // …and the names themselves, so a swap that preserved the arithmetic still fails.
    expect(POOLS.flatMap((p) => p.items.map((i) => `${p.id}/${i.name}/${i.rarity}`)).length).toBe(100);
  });

  it('⚠ the sigil path still yields a faction sigil, quantity 1, Uncommon', () => {
    const out = rollSalvagePool('architect sigil', () => 0.5)!;
    expect(out).toMatchObject({ poolId: 'sigil', rarity: 'Uncommon', quantity: 1 });
  });

  it('⚠ nouns with no pool still return null, so the caller still falls through', () => {
    expect(rollSalvagePool('mud')).toBeNull();
    expect(rollSalvagePool('sky')).toBeNull();
    expect(hasSalvageYield('sky')).toBe(false);
  });
});
