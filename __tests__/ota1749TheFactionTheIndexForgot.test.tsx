/**
 * OTA-1749 — THE FACTION THE INDEX FORGOT.
 *
 * Owner, on the device, after OTA-1747: the faded faction emblem shows on some
 * character cards and not others. "I'm only seeing it sporadically."
 *
 * ⚠⚠ IT WAS NEVER SPORADIC, AND THE WATERMARK WAS NEVER THE BUG.
 * `SlotSummary.factionId` is OPTIONAL and always was: it is written into the
 * roster index at SAVE time, and only started being written at OTA-036. So a
 * character who has not been saved since then has a summary carrying no faction
 * at all — and every reader that branched on `item.factionId` drew nothing for
 * that row while drawing correctly for the row beside it. Same code, different
 * data, and the difference was invisible because the field is optional.
 *
 * ⚠ THE ID WAS ALREADY THERE. `characterSeed` IS `name|raceId|factionId|<made>`,
 * minted at creation and in the index since OTA-1311, so it can be read back out
 * of the encoding `characterSeedOf` writes. No migration, no disk read.
 *
 * So this suite is mostly about the DATA, not the picture: what the helper does
 * with each shape of summary the roster can actually hold, and that a card whose
 * faction can only be recovered ends up identical to one whose faction was
 * recorded all along.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Same reason as OTA-1742: reduce-motion is a real shipped path AND it stops
// RN Animated graphs outliving Jest teardown. The motion paths have their own
// source pins below.

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { TitleScreen } from '../app/screens/TitleScreen';
import { factionCrest, crestFactionIds } from '../app/engine/factionCrests';
import { summaryFactionId, characterSeedOf, type SlotSummary } from '../app/engine/saveSystem';
import { FACTION_PLATE_TEST_ID } from '../app/ui/tartariaKit';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(240000);
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

const hosts = (t: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }, p: (n: TestNode) => boolean) =>
  t.root.findAll((n) => typeof n.type === 'string' && p(n));
const flat = (s: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const walk = (x: unknown) => {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') Object.assign(out, x as Record<string, unknown>);
  };
  walk(s); return out;
};
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* gone */ } });
  }
});

const slot = (over: Partial<SlotSummary> = {}): SlotSummary => ({
  slotId: 'slot-a',
  playerName: 'Cheddar Bob',
  raceId: getRaces()[0]!.id,
  locationId: 'ashen_hollow',
  hp: 22, hpMax: 30,
  savedAt: Date.now() - 60_000,
  createdAt: Date.now() - 600_000,
  factionId: getFactions()[0]!.id,
  resurrectionGems: 0,
  ...over,
} as SlotSummary);

/** A summary as the index wrote it BEFORE OTA-036 — a real save shape, not a
 *  hypothetical: seed present (OTA-1311), faction absent. */
const legacySlot = (factionId: string, over: Partial<SlotSummary> = {}): SlotSummary => {
  const s = slot({ ...over });
  delete (s as { factionId?: string }).factionId;
  return { ...s, characterSeed: `${s.playerName}|${s.raceId}|${factionId}|1699999999999` };
};

async function mountTitle(slots: SlotSummary[]) {
  useGameStore.setState({ slots, crashedSlotIds: [], otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TitleScreen />); });
  await flush();
  useGameStore.setState({ slots, otaBootResolved: true, cognitiveStatus: 'ready' } as never);
  await flush();
  mounted.push(tree);
  return tree;
}
async function expandRow(tree: ReturnType<typeof renderer.create>, name: string) {
  const row = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes(name))[0];
  expect(row).toBeDefined();
  await renderer.act(async () => { (row!.props.onPress as () => void)(); });
  await flush();
}
const fieldsOf = (tree: ReturnType<typeof renderer.create>) =>
  hosts(tree, (n) => n.props.source !== undefined && Number(flat(n.props.style).opacity ?? 1) < 0.2);

// ═══ 1. THE HELPER, ON EVERY SHAPE THE INDEX CAN ACTUALLY HOLD ═══════════════
describe('summaryFactionId reads what the index has', () => {
  test('the recorded faction wins when it is there', () => {
    expect(summaryFactionId({ factionId: 'reclaimers_guild' })).toBe('reclaimers_guild');
    // ...even when a seed disagrees. The written field is the newer statement.
    expect(summaryFactionId({ factionId: 'reclaimers_guild', characterSeed: 'A|b|stone_builders|1' }))
      .toBe('reclaimers_guild');
  });

  test('⚠⚠⚠ it is recovered from the seed when the index never recorded it', () => {
    // The whole defect, in one line: this summary is what a pre-OTA-036 save
    // looks like, and before this pass it resolved to no faction at all.
    expect(summaryFactionId({ characterSeed: 'Cheddar Bob|human|reclaimers_guild|1699999999999' }))
      .toBe('reclaimers_guild');
  });

  test('it is the exact inverse of characterSeedOf, for every faction the game ships', () => {
    // ⚠ The two functions live together so the format is stated ONCE. This is
    // the test that keeps them honest: encode, decode, round-trip.
    for (const id of crestFactionIds()) {
      const seed = characterSeedOf({ name: 'Cheddar Bob', raceId: 'human', factionId: id });
      expect(summaryFactionId({ characterSeed: seed })).toBe(id);
      // and the same for a seed minted at creation with a real timestamp
      expect(summaryFactionId({ characterSeed: `Cheddar Bob|human|${id}|1699999999999` })).toBe(id);
    }
  });

  test('a name containing the delimiter does not shift the fields', () => {
    // Position 2 is the faction by construction; a name is field 0. If a player
    // ever gets a '|' into a name the seed is already ambiguous — what matters
    // is that this NEVER returns a confidently wrong faction, and it does not:
    // the third field of a shifted seed is not a faction id, so it resolves to
    // no art rather than to somebody else's emblem.
    const weird = summaryFactionId({ characterSeed: 'Ched|dar|Bob|reclaimers_guild|1' });
    expect(factionCrest(weird)).toBeUndefined();
  });

  test('it returns nothing rather than guessing', () => {
    expect(summaryFactionId({})).toBeUndefined();
    expect(summaryFactionId({ characterSeed: '' })).toBeUndefined();
    expect(summaryFactionId({ characterSeed: 'only-one-field' })).toBeUndefined();
    expect(summaryFactionId({ characterSeed: 'name|race|faction' })).toBeUndefined(); // too short
    expect(summaryFactionId({ characterSeed: 'name|race||1699999999999' })).toBeUndefined(); // empty field
    // an unknown id is returned but resolves to no art — today's behaviour
    expect(factionCrest(summaryFactionId({ characterSeed: 'a|b|not_a_faction|1' }))).toBeUndefined();
  });
});

// ═══ 2. THE CARD THE OWNER WAS LOOKING AT ════════════════════════════════════
describe('a character the index forgot now looks like one it remembered', () => {
  test('⚠⚠⚠ every faction recovers from the seed alone, collapsed AND expanded', () => {
    // asserted first as data, so a failure names the faction rather than a count
    for (const id of crestFactionIds()) {
      expect(factionCrest(summaryFactionId(legacySlot(id)))).toBe(factionCrest(id));
    }
  });

  test('the collapsed card of a pre-OTA-036 save wears its own emblem', async () => {
    const id = crestFactionIds()[2]!;
    const tree = await mountTitle([legacySlot(id)]);
    const fields = fieldsOf(tree);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.props.source).toBe(factionCrest(id));
  });

  test('...and so does its expanded card, plate included', async () => {
    const id = crestFactionIds()[4]!;
    const tree = await mountTitle([legacySlot(id)]);
    await expandRow(tree, 'Cheddar Bob');
    expect(fieldsOf(tree)[0]!.props.source).toBe(factionCrest(id));
    // ⚠ the riveted seal plate had the SAME hole since VIS-1 — this repairs it too
    expect(hosts(tree, (n) => n.props.testID === FACTION_PLATE_TEST_ID)).toHaveLength(1);
  });

  test('⚠⚠ THE REPORTED SYMPTOM: a mixed-vintage roster is no longer patchy', async () => {
    // Exactly what the owner had — some characters saved recently, some not.
    // Before this pass the old ones drew nothing and it read as "sporadic".
    const ids = crestFactionIds().slice(0, 4);
    const tree = await mountTitle([
      slot({ slotId: 's0', playerName: 'Recent One', factionId: ids[0] } as Partial<SlotSummary>),
      legacySlot(ids[1]!, { slotId: 's1', playerName: 'Old One' }),
      slot({ slotId: 's2', playerName: 'Recent Two', factionId: ids[2] } as Partial<SlotSummary>),
      legacySlot(ids[3]!, { slotId: 's3', playerName: 'Old Two' }),
    ]);
    const sources = fieldsOf(tree).map((n) => n.props.source);
    expect(sources).toHaveLength(4);                    // every card, not some
    expect(new Set(sources).size).toBe(4);              // each its own faction
    expect(sources).toEqual(ids.map((id) => factionCrest(id)));
  });

  test('a summary with NEITHER field still renders nothing, and does not crash', async () => {
    const bare = slot();
    delete (bare as { factionId?: string }).factionId;
    const tree = await mountTitle([bare]);
    expect(fieldsOf(tree)).toHaveLength(0);
    await expandRow(tree, 'Cheddar Bob');
    expect(fieldsOf(tree)).toHaveLength(0);
    // ⚠ stated rather than hidden: that id is genuinely unrecoverable without
    // loading the save, and the roster will not read every slot to draw a
    // watermark. Playing the character once writes both fields.
    expect(textOf(tree.root.findAll(() => true)[0]!)).toContain('Cheddar Bob');
  });
});

// ═══ 3. THE FIX IS IN ONE PLACE ══════════════════════════════════════════════
describe('one reader, one encoding', () => {
  test('the screen no longer reads the optional field directly', () => {
    expect(TITLE).toContain('const crest = factionCrest(summaryFactionId(item));');
    expect(TITLE).not.toContain('factionCrest(item.factionId)');
    expect((TITLE.match(/summaryFactionId\(/g) ?? []).length).toBe(1);
  });

  test('the decoder sits beside the encoder it inverts', () => {
    const SAVE = read('app', 'engine', 'saveSystem.ts');
    const enc = SAVE.indexOf('export function characterSeedOf');
    const dec = SAVE.indexOf('export function summaryFactionId');
    expect(enc).toBeGreaterThan(-1);
    expect(dec).toBeGreaterThan(enc);
    // ⚠ and nothing else in the app hand-parses the seed — one decoder
    expect(SAVE.match(/characterSeed.*\.split\('\|'\)/g) ?? []).toHaveLength(0);
  });

  test('it reads no disk and adds no state', () => {
    const SAVE = read('app', 'engine', 'saveSystem.ts');
    const fn = /export function summaryFactionId\([\s\S]*?\n\}/.exec(SAVE)?.[0] ?? '';
    expect(fn).not.toMatch(/await|async|AsyncStorage|FileSystem|loadSlot|readSlot/);
  });

  test('the build stamp names this pass', () => {
    const BUILD = read('app', 'buildInfo.ts');
    expect(BUILD).toContain("'2026-09-08-1749-the-faction-the-index-forgot'");
  });
});
