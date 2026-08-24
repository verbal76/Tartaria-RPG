/**
 * OTA-1465 — ASK ONCE, NOT FOREVER.
 *
 * ⚠⚠⚠ THE FIFTH OTA ON THIS JOB, AND THE FIRST THAT IS NOT ABOUT THE PROMPT.
 * OTA-1115/1128/1134 and one before them rewrote the brief four times — the
 * token cap, then the shape, then the pipe loop, then the nesting — each on the
 * premise that the model could be talked into succeeding. Every device log
 * since has still shown discards, and the owner's 2026-08-24 session shows why
 * that framing was incomplete:
 *
 *   00:02:02  item_synthesis_hw 6045ms ✂ DISCARDED — rejected-by-clamp bad-kind="junk"
 *   00:10:01  item_synthesis_hw 4596ms ✂ DISCARDED — rejected-by-clamp bad-kind="junk"
 *   00:11:00  item_synthesis_hw 4359ms ✂ DISCARDED — rejected-by-clamp bad-kind="junk"
 *
 * All three are "Smooth Stone". The cache only ever remembered SUCCESS, so a
 * rejected name was recorded nowhere and the scanner picked it again every tick.
 *
 * ⚠⚠ AND THE WASTED 15 SECONDS IS THE SMALL HALF. `nextHomeworkItem` returns the
 * FIRST inventory entry that is neither pending nor cached — so one permanently
 * failing name does not merely burn its own generation, it OCCUPIES THE SLOT.
 * From the moment Smooth Stone entered his pack, no other item in the pack could
 * be described. The queue was not slow; it was blocked.
 *
 * Two fixes, and the tests below keep them separate because they fail
 * separately: a refusal ledger (so a permanent failure is asked once), and the
 * vocabulary the rejection was actually about ("junk" is a correct answer for a
 * smooth stone, and the synonym table that exists to catch exactly this had no
 * entry for it).
 */
import { blockAt } from '../test-utils/srcBlock';
import {
  noteSynthRefused, wasSynthRefused, clearSynthRefusal,
  _resetCacheForTests, _refusedCountForTests,
} from '../app/engine/itemSynthesisCache';
import { canonicalSynthKind } from '../app/engine/itemSynthesisQwen';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const BOOT = codeOnly(read('app', 'state', 'slices', 'bootSlice.ts'));
const QWEN = codeOnly(read('app', 'engine', 'itemSynthesisQwen.ts'));

beforeEach(() => { _resetCacheForTests(); });

describe('OTA-1465 — the refusal ledger', () => {
  it('⚠⚠⚠ A REFUSED NAME IS REMEMBERED', () => {
    expect(wasSynthRefused('Smooth Stone')).toBe(false);
    noteSynthRefused('Smooth Stone');
    expect(wasSynthRefused('Smooth Stone')).toBe(true);
  });

  it('⚠⚠ …case-insensitively, like the positive cache beside it', () => {
    // The cache keys on `name.toLowerCase()`. A ledger that keyed differently
    // would answer "not refused" for the same item under a different casing and
    // re-open the loop for anything the catalog capitalises inconsistently.
    noteSynthRefused('SMOOTH STONE');
    for (const v of ['smooth stone', 'Smooth Stone', 'sMoOtH sToNe']) {
      expect({ v, refused: wasSynthRefused(v) }).toEqual({ v, refused: true });
    }
  });

  it('⚠⚠ recording the same refusal twice does not grow the ledger', () => {
    for (let i = 0; i < 50; i++) noteSynthRefused('Smooth Stone');
    expect(_refusedCountForTests()).toBe(1);
  });

  it('⚠⚠⚠ IT IS BOUNDED — a hoarder cannot grow it without limit', () => {
    // The positive cache is LRU-capped; an unbounded companion beside it would
    // be the leak the cap exists to prevent, just under a different name.
    for (let i = 0; i < 400; i++) noteSynthRefused(`Junk Item ${i}`);
    expect(_refusedCountForTests()).toBeLessThanOrEqual(256);
    // and it evicts oldest-first, so the most recent refusals — the ones the
    // scanner is about to trip over again — are the ones kept.
    expect(wasSynthRefused('Junk Item 399')).toBe(true);
    expect(wasSynthRefused('Junk Item 0')).toBe(false);
  });

  it('⚠⚠⚠ A SUCCESS RETIRES THE REFUSAL — two records of one fact must agree', () => {
    // Nothing shipped re-tries a refused name today, but the moment something
    // does (a forced re-describe, a prompt change behind a flag) the ledger must
    // not keep claiming the name is hopeless while the cache holds a good row.
    noteSynthRefused('Smooth Stone');
    expect(wasSynthRefused('Smooth Stone')).toBe(true);
    clearSynthRefusal('Smooth Stone');
    expect(wasSynthRefused('Smooth Stone')).toBe(false);
  });

  it('⚠⚠ the ledger is NOT persisted — a fixed build must self-heal', () => {
    // A refusal is a fact about THIS build's prompt and validator, both of which
    // change under the player. Written to disk it would keep a since-fixed item
    // broken until someone cleared storage.
    const CACHE = codeOnly(read('app', 'engine', 'itemSynthesisCache.ts'));
    const i = CACHE.indexOf('const REFUSED');
    expect(i).toBeGreaterThan(-1);
    const ledgerRegion = CACHE.slice(i, CACHE.indexOf('_resetCacheForTests'));
    expect(ledgerRegion).not.toContain('persistCache');
    expect(ledgerRegion).not.toContain('AsyncStorage');
  });

  it('⚠ a reset clears it, so one test cannot poison the next', () => {
    noteSynthRefused('Smooth Stone');
    _resetCacheForTests();
    expect(wasSynthRefused('Smooth Stone')).toBe(false);
    expect(_refusedCountForTests()).toBe(0);
  });
});

describe('OTA-1465 — the blocked queue, which was the expensive half', () => {
  it('⚠⚠⚠ THE SCANNER SKIPS REFUSED NAMES', () => {
    // Without this line the fix is only a saving. WITH it, the pack behind the
    // bad item becomes reachable again — which is the actual player-visible
    // result: item descriptions resume.
    const i = BOOT.indexOf('const nextHomeworkItem');
    expect(i).toBeGreaterThan(-1);
    const fn = BOOT.slice(i, BOOT.indexOf('};', i));
    expect(fn).toContain('synth.wasSynthRefused(it.name)');
    expect(fn).toContain('continue;');
  });

  it('⚠⚠⚠ …AND IT STILL SKIPS PENDING AND CACHED — all three, or none matter', () => {
    // Three reasons to pass over an item, and the scanner returns the FIRST
    // survivor. Drop any one and that class of item is generated repeatedly:
    // this is the same defect three times over, and it was already fixed twice.
    const i = BOOT.indexOf('const nextHomeworkItem');
    const fn = BOOT.slice(i, BOOT.indexOf('};', i));
    expect(fn).toContain('pending.has(key)');
    expect(fn).toContain('synth.readSynthCache(it.name)');
    expect(fn).toContain('synth.wasSynthRefused(it.name)');
  });

  it('⚠⚠ the rejection site records the refusal', () => {
    // ⚠ OTA-1484 wave — the claim is "the refusal is recorded in the SAME
    // branch that logs the rejection". Anchored on the branch's OPENER (a code
    // landmark), because anchoring blockAt on text inside a template STRING
    // hands back the string, not the block — the first conversion did exactly
    // that and the canary below is what caught it.
    const branch = blockAt(QWEN, 'if (!validated) {');
    expect(branch).toContain('item_synth:rejected-by-clamp'); // canary: right block
    expect(branch).toContain('noteSynthRefused(name)');
  });

  it('⚠⚠ …and the success site clears it', () => {
    const i = QWEN.indexOf('setCachedSynth(name, validated)');
    expect(i).toBeGreaterThan(-1);
    expect(QWEN.slice(Math.max(0, i - 200), i)).toContain('clearSynthRefusal(name)');
  });
});

describe('OTA-1465 — "junk" was a correct answer', () => {
  it('⚠⚠⚠ THE EXACT WORD HIS LOG REJECTED THREE TIMES NOW RESOLVES', () => {
    expect(canonicalSynthKind('junk')).toBe('misc');
  });

  it('⚠⚠ and the rest of the vocabulary a small model reaches for', () => {
    // Every one of these is an honest answer for ordinary salvage. The synonym
    // table was created (OTA-1141) for precisely this failure — a correct answer
    // discarded on vocabulary — and then shipped without the commonest word.
    const EXPECTED: Readonly<Record<string, string>> = {
      junk: 'misc', trash: 'misc', scrap: 'misc', debris: 'misc',
      resource: 'misc', ingredient: 'misc', component: 'misc', part: 'misc',
      curio: 'misc', oddment: 'misc', keepsake: 'misc', supply: 'misc',
      drink: 'consumable', medicine: 'consumable', ration: 'consumable',
      jewelry: 'accessory', necklace: 'accessory', charm: 'accessory',
      shield: 'armor', clothing: 'armor',
    };
    for (const [word, want] of Object.entries(EXPECTED)) {
      expect({ word, got: canonicalSynthKind(word) }).toEqual({ word, got: want });
    }
  });

  it('⚠⚠ the ORIGINAL synonyms still resolve — nothing was traded away', () => {
    const KEPT: Readonly<Record<string, string>> = {
      tool: 'misc', utility: 'misc', material: 'misc',
      gear: 'accessory', trinket: 'accessory', amulet: 'accessory', ring: 'accessory',
      potion: 'consumable', food: 'consumable', artifact: 'relic',
    };
    for (const [word, want] of Object.entries(KEPT)) {
      expect({ word, got: canonicalSynthKind(word) }).toEqual({ word, got: want });
    }
  });

  it('⚠⚠⚠ AND A GENUINELY UNKNOWN WORD STILL FAILS, LOUDLY', () => {
    // The coercion must not become a rubber stamp. If everything resolved, the
    // clamp would stop rejecting and the log would stop naming the culprit —
    // trading a visible waste for an invisible one.
    for (const nonsense of ['passive', 'lorem', 'invented', 'quest', '', 'kind']) {
      expect({ nonsense, got: canonicalSynthKind(nonsense) }).toEqual({ nonsense, got: '' });
    }
    expect(canonicalSynthKind(undefined)).toBe('');
    expect(canonicalSynthKind(42)).toBe('');
    expect(canonicalSynthKind(null)).toBe('');
  });

  it('⚠ every legal top-level kind resolves to itself', () => {
    for (const k of ['weapon', 'armor', 'accessory', 'consumable', 'misc', 'relic']) {
      expect({ k, got: canonicalSynthKind(k) }).toEqual({ k, got: k });
    }
  });

  it('⚠ coercion is one-way — no synonym maps onto a kind that is not legal', () => {
    // A typo in the table ('misk') would silently route items into a kind the
    // validator does not accept, re-creating the rejection it was meant to end.
    const LEGAL = new Set(['weapon', 'armor', 'accessory', 'consumable', 'misc', 'relic']);
    for (const word of ['junk', 'trash', 'scrap', 'tool', 'potion', 'artifact', 'shield']) {
      expect(LEGAL.has(canonicalSynthKind(word))).toBe(true);
    }
  });
});
