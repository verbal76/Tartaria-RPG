/* ⚠⚠⚠ OTA-1843 — THE HOUSE WAS IN THE RECORD AND IN NONE OF THE WORDS.
 *
 * OTA-1362 put `origin.player` on every foreign corpse. Eleven OTAs later, not
 * one player-facing sentence said it. The emergence beat, the Arbiter's
 * identification, the enemy's own flavor, the defeat lines, the reclaim reward
 * — every one of them named the character, the ground they fell on, their
 * epitaph and their kill count, and NONE of them named the person whose game
 * they came out of. A Hollowed a friend sent you read exactly like one grown
 * from your own dead.
 *
 * So the single fact the whole mechanic exists for — THIS WAS ANOTHER REAL
 * PLAYER'S CHARACTER — was the one fact the game kept to itself.
 *
 * ⚠⚠ THE NEGATIVE HALF IS THE LOAD-BEARING HALF. Every claim below has a twin
 * that proves an ORDINARY enemy, and your OWN dead, are untouched: same lines,
 * same loot, no banner, no house, no word going home. A pass that made
 * everything feel special would have made nothing feel special.
 *
 * ⚠ AND NO FARMING. §14 is asserted, not assumed: a foreign corpse still yields
 * its weapon and an empty armour pool, and this OTA adds no coin, no XP, and no
 * second reward path.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => ''),
  setStringAsync: jest.fn(async () => {}),
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  revenantHouse, revenantTitle, revenantSignature, revenantIntroBeats, revenantDefeatLines,
  revenantArrivalLog, revenantRestLog, revenantFromFallen, reconstructFallenPiece,
  fallenProvenanceLine, isForeignFallen, isRevenant, revenantName,
  _setFallenCacheForTests,
} from '../app/engine/fallenRevenants';
import { fallenTitle, type ForeignFallen } from '../app/engine/fallenLedger';
import { stackCompatible } from '../app/engine/inventory';
import type { FallenHero } from '../app/engine/saveSystem';
import type { FallenGearPiece, InventoryItem } from '../app/engine/types';
import {
  importPayloadText, buildExportPayload, myHouseCode, acceptHouseCode, ensureSendingKey,
  _setIdentityForTests, _setPairedForTests, _setLedgerForTests, _setSendingKeyForTests,
} from '../app/engine/fallenLedgerStore';
import { recordFallen } from '../app/engine/saveSystem';
import { FallenExchangeScreen } from '../app/screens/FallenExchangeScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void>;
  create(el: React.ReactElement): {
    toJSON(): unknown; unmount(): void;
    root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] };
  };
};

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const MOUNTED: Array<{ unmount(): void }> = [];
afterEach(async () => {
  const roots = MOUNTED.splice(0);
  await renderer.act(async () => { for (const r of roots) { try { r.unmount(); } catch { /* gone */ } } });
  jest.restoreAllMocks();
});

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** A corpse of your own — no origin at all. */
const LOCAL: FallenHero = {
  name: 'Wren', raceName: 'Ferrite', epitaph: 'She counted the bells and stopped at nine.',
  locationName: 'the Bell Road', kills: 31, corruption: 'Clean', hours: 44, ts: 1_700_000_000_000,
} as FallenHero;

/** …and one that came out of somebody else's game. */
const foreignOf = (name: string, house: string, ts = 1_760_000_000_000): ForeignFallen => ({
  name, raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96, ts,
  origin: { player: house, installId: `inst-${house}` },
} as unknown as ForeignFallen);

const FRANCIS = foreignOf('Francis', 'Sasmooch');

// ═══════════════════════════════════════════════════════════════════════════
// §A — MATRIX 3, 4, 5: THE ENCOUNTER SAYS WHO, AND WHOSE
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §A — encounter identity', () => {
  it('A.1 ⚠⚠⚠ MATRIX 4 — the origin house reaches the player, which it never did before', () => {
    const log = revenantArrivalLog(FRANCIS as unknown as FallenHero, 'Hollowed Francis', false);
    const all = log.map((l) => l.text).join('\n');
    expect(all).toContain('Sasmooch');
    // ⚠ And the house is in the ARBITER's identification, not only in a banner —
    // the banner can be scrolled past, the identification is the beat that
    // tells the player what they are fighting.
    expect(log.find((l) => l.channel === 'arbiter')!.text).toContain('Sasmooch');
  });

  it('A.2 ⚠⚠ MATRIX 3 — the character\'s own name is there too', () => {
    const all = revenantArrivalLog(FRANCIS as unknown as FallenHero, 'Hollowed Francis', false)
      .map((l) => l.text).join('\n');
    expect(all).toContain('Francis');
    expect(revenantName(FRANCIS as unknown as FallenHero)).toBe('Hollowed Francis');
  });

  it('A.3 ⚠ MATRIX 5 — the epitaph and the ground they fell on survive into the encounter', () => {
    const beats = revenantIntroBeats(FRANCIS as unknown as FallenHero, false);
    expect(beats.identity).toContain('The mud took the last of the light.');
    expect(beats.identification).toContain('the Mud Flats');
  });

  it('A.4 ⚠⚠ the signature leads, so "another player\'s dead" is the FIRST thing read', () => {
    const log = revenantArrivalLog(FRANCIS as unknown as FallenHero, 'Hollowed Francis', false);
    expect(log[0]!.channel).toBe('system');
    expect(log[0]!.text).toContain('ONE OF THE FALLEN');
    expect(log[0]!.text).toContain("another player's world");
  });

  it('A.5 ⚠ the enemy\'s own flavor names the house as well', () => {
    const foe = revenantFromFallen(FRANCIS as unknown as FallenHero, 120);
    expect(foe.flavor ?? '').toContain('Sasmooch');
    // …and the sentence that was already there is still there, unchanged.
    expect(foe.flavor ?? '').toContain('No stone ever closed over this one');
  });

  it('A.6 ⚠⚠ NO CRYPTOGRAPHIC STATE IN COMBAT — §7\'s explicit prohibition', () => {
    const all = [
      ...revenantArrivalLog(FRANCIS as unknown as FallenHero, 'Hollowed Francis', false).map((l) => l.text),
      revenantFromFallen(FRANCIS as unknown as FallenHero, 120).flavor ?? '',
      ...revenantRestLog(FRANCIS as unknown as FallenHero, 'Maud').map((l) => l.text),
    ].join('\n').toLowerCase();
    for (const w of ['seal', 'hmac', 'verified', 'legacy', 'install', 'payload', 'key', 'signature check']) {
      expect(all).not.toContain(w);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §B — MATRIX 2, 7, 12: THE ORDINARY CASE, UNTOUCHED
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §B — an ordinary enemy, and your own dead, are left alone', () => {
  it('B.1 ⚠⚠⚠ MATRIX 2 — your OWN dead get no signature and no house', () => {
    expect(isForeignFallen(LOCAL)).toBe(false);
    expect(revenantHouse(LOCAL)).toBeNull();
    expect(revenantSignature(LOCAL)).toBeNull();
    const log = revenantArrivalLog(LOCAL, 'Hollowed Wren', false);
    expect(log.some((l) => l.channel === 'system')).toBe(false);
    expect(log[0]!.channel).toBe('world');
  });

  it('B.2 ⚠⚠⚠ MATRIX 2 — an ordinary enemy is not a Fallen at all', () => {
    // The trait is the gate, exactly as OTA-991 set it, and nothing here moved it.
    expect(isRevenant({ traits: ['boss'] })).toBe(false);
    expect(isRevenant({ traits: ['fallen_revenant'] })).toBe(true);
    expect(isRevenant(null)).toBe(false);
  });

  it('B.3 ⚠⚠⚠ MATRIX 12 — the local defeat lines are BYTE-IDENTICAL to what shipped', () => {
    // ⚠ The strongest form of "ordinary flows unchanged": not "looks similar",
    // but the exact sentence, character for character.
    const d = revenantDefeatLines(LOCAL, 'Maud');
    expect(d.world).toBe('The task goes out of them first — you watch it leave the mouth mid-word, an errand four hundred years old finally set down. Then the light. For one clear breath the mud lets go, and it is only Wren again — Ferrite, 31 foes to the name, the warrior the roll remembers. The stone closes over them the way it should have the first time. They rest now — received at last, and the Aether does not give this one back.');
    expect(d.reward).toBe('✦ Wren is at rest. The Fallen roll marks them: put to rest by Maud.');
  });

  it('B.4 ⚠⚠ MATRIX 7 — no word goes home for a corpse that never came from anywhere', () => {
    expect(revenantDefeatLines(LOCAL, 'Maud').homeward).toBeNull();
    const rest = revenantRestLog(LOCAL, 'Maud');
    expect(rest.some((l) => l.channel === 'system')).toBe(false);
    expect(rest).toHaveLength(2);
  });

  it('B.5 ⚠ the local intro beats are byte-identical too', () => {
    const b = revenantIntroBeats(LOCAL, false);
    expect(b.identification).toBe('"Wren," the Arbiter says, barely above the wind. "Fell at the Bell Road, 44 hours into the walk. The roll remembers them. The mud kept them."');
    expect(b.signature).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §C — MATRIX 6: TWO PEOPLE CAN SEND YOU THE SAME NAME
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §C — duplicate names stay distinguishable', () => {
  it('C.1 ⚠⚠⚠ MATRIX 6 — two Francises from two houses are two different people', () => {
    const a = foreignOf('Francis', 'Sasmooch', 1_760_000_000_000);
    const b = foreignOf('Francis', 'Brannoch', 1_760_000_500_000);
    expect(revenantTitle(a as unknown as FallenHero)).not.toBe(revenantTitle(b as unknown as FallenHero));
    expect(revenantSignature(a as unknown as FallenHero)).not.toBe(revenantSignature(b as unknown as FallenHero));
    expect(revenantTitle(a as unknown as FallenHero)).toBe('Francis child of Sasmooch');
  });

  it('C.2 ⚠⚠ the title spelling is the LEDGER\'s spelling — one naming, not two', () => {
    // `revenantTitle` is derived locally so the engine module keeps its
    // no-dependency-on-storage property. This is the pin that stops the two
    // from drifting into two different ways of saying the same thing.
    const f = FRANCIS as unknown as FallenHero;
    expect(revenantTitle(f)).toBe(fallenTitle(FRANCIS));
    expect(revenantTitle(LOCAL)).toBe(fallenTitle({ name: LOCAL.name }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §D — MATRIX 8, 9: THE BLADE REMEMBERS WHOSE HAND IT WAS IN
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §D — recovered gear provenance', () => {
  const piece: FallenGearPiece = {
    name: 'Mud-Fused Blade', kind: 'weapon', rarity: 'Legendary', tags: [], slot: 'main',
  } as unknown as FallenGearPiece;

  it('D.1 ⚠⚠⚠ MATRIX 8 — the reclaimed piece says who carried it', () => {
    const prov = fallenProvenanceLine(FRANCIS as unknown as FallenHero);
    const back = reconstructFallenPiece(piece, 'r1', prov);
    expect(back.description).toContain('Francis child of Sasmooch');
    expect(back.tags).toContain('fallen');
  });

  it('D.2 ⚠⚠⚠ MATRIX 9 — and provenance changes NOTHING a stat reader looks at', () => {
    const plain = reconstructFallenPiece(piece, 'r1');
    const withProv = reconstructFallenPiece(piece, 'r1', fallenProvenanceLine(FRANCIS as unknown as FallenHero));
    // Every field that is not the prose or the marker tag is identical.
    const strip = (i: InventoryItem) => ({ ...i, description: undefined, tags: (i.tags ?? []).filter((t) => t !== 'fallen') });
    expect(strip(withProv)).toEqual(strip(plain));
    expect(withProv.rarity).toBe(plain.rarity);
    expect(withProv.kind).toBe(plain.kind);
    expect(withProv.name).toBe(plain.name);
  });

  it('D.3 ⚠⚠⚠ MATRIX 6 — two dead people\'s swords do not merge into one row', () => {
    const fromA = reconstructFallenPiece(piece, 'a', fallenProvenanceLine(foreignOf('Francis', 'Sasmooch') as unknown as FallenHero));
    const fromB = reconstructFallenPiece(piece, 'b', fallenProvenanceLine(foreignOf('Ordwin', 'Brannoch') as unknown as FallenHero));
    expect(stackCompatible(fromA, fromB)).toBe(false);
  });

  it('D.4 ⚠⚠ …and ORDINARY same-name rows still stack exactly as they did', () => {
    // The merge test is DIFFERENCE, not presence. Two catalog rows carry the
    // same catalog description, so nothing that stacked before stops stacking.
    const a: InventoryItem = { id: '1', name: 'Iron Ration', kind: 'misc', quantity: 1, tags: [], description: 'Dry, salted, and enough.' };
    const b: InventoryItem = { ...a, id: '2' };
    expect(stackCompatible(a, b)).toBe(true);
    const noDesc: InventoryItem = { id: '3', name: 'Iron Ration', kind: 'misc', quantity: 1, tags: [] };
    expect(stackCompatible(noDesc, { ...noDesc, id: '4' })).toBe(true);
  });

  it('D.5 ⚠ a catalog description the piece already had is KEPT, not overwritten', () => {
    const described = { ...piece, description: 'Forged in the ash pits.' } as unknown as FallenGearPiece;
    const back = reconstructFallenPiece(described, 'r', fallenProvenanceLine(FRANCIS as unknown as FallenHero));
    expect(back.description).toContain('Forged in the ash pits.');
    expect(back.description).toContain('Francis child of Sasmooch');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §E — MATRIX 10, 11: THE REST IS THE CLOSURE, AND IT NAMES THEM
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §E — rest and closure', () => {
  it('E.1 ⚠⚠⚠ MATRIX 10/11 — the closure names the right Fallen and the right house', () => {
    const rest = revenantRestLog(FRANCIS as unknown as FallenHero, 'Maud');
    const homeward = rest.find((l) => l.channel === 'system');
    expect(homeward).toBeDefined();
    expect(homeward!.text).toContain('Francis');
    expect(homeward!.text).toContain('Sasmooch');
  });

  it('E.2 ⚠⚠ the closure says WHAT will be sent, in words, before it is sent', () => {
    const t = revenantDefeatLines(FRANCIS as unknown as FallenHero, 'Maud').homeward!;
    expect(t).toContain('who put them down');
    expect(t).toContain('it is finished');
    // ⚠ and it exposes no record shape — §12's prohibition.
    expect(t).not.toMatch(/fallenKey|byInstallId|installId|\{|\}/);
  });

  it('E.3 ⚠ the closure is ordered LAST, after the world line and the roll mark', () => {
    const rest = revenantRestLog(FRANCIS as unknown as FallenHero, 'Maud');
    expect(rest.map((l) => l.channel)).toEqual(['world', 'reward', 'system']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §F — MATRIX 14: NO FARMING ECONOMY
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §F — the identity is the reward', () => {
  it('F.1 ⚠⚠⚠ MATRIX 14 — a foreign corpse still yields an EMPTY armour pool', () => {
    // OTA-1362's faucet limit, re-asserted because a "make Fallen feel good"
    // pass is exactly the pass that would quietly open it.
    expect(revenantFromFallen(FRANCIS as unknown as FallenHero, 120).loot).toEqual([]);
    // …and your own dead still drop their kit, unchanged.
    _setFallenCacheForTests([LOCAL]);
    expect(revenantFromFallen(LOCAL, 120).loot!.length).toBeGreaterThan(0);
    _setFallenCacheForTests(null);
  });

  it('F.2 ⚠⚠⚠ MATRIX 14 — this OTA adds no coin, no XP and no second reward path', () => {
    const rev = src('app', 'engine', 'fallenRevenants.ts');
    const code = rev.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    for (const w of ['tarnCoin', 'addCoin', 'grantXp', 'xpGain', 'resurrectionGem', 'currency']) {
      expect(code).not.toContain(w);
    }
  });

  it('F.3 ⚠⚠ the Hollowed is still a ONE-TIME event — rest removes it from the pool', () => {
    // `unrestedFallen` is the authority and this OTA did not touch it; the pin
    // is here because a repeatable Fallen IS the farming loop §14 forbids.
    const store = src('app', 'engine', 'fallenLedgerStore.ts');
    expect(store).toContain('unrestedFallen(l.foreign, cachedInstallId(), l.rests)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §G — MATRIX 1, 15: ARRIVAL, AND THE ROLL, ON THE REAL SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function textsOf(node: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') {
      const c = (n as { children?: unknown }).children;
      if (c !== undefined && c !== null) walk(c);
    }
  };
  walk(node);
  return out;
}

async function settle(): Promise<void> {
  await renderer.act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

async function mountExchange() {
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<FallenExchangeScreen />); });
  MOUNTED.push(tree);
  await settle();
  const byLabel = (l: string) => tree.root.findAll((n) => n.props.label === l);
  const press = async (l: string): Promise<void> => {
    await renderer.act(async () => { await (byLabel(l)[0]!.props.onPress as () => unknown)(); });
    await settle();
  };
  const type = async (al: string, v: string): Promise<void> => {
    const f = tree.root.findAll((n) => n.props.accessibilityLabel === al)[0]!;
    await renderer.act(async () => { (f.props.onChangeText as (x: string) => void)(v); });
  };
  return { tree, press, type, texts: () => textsOf(tree.toJSON()) };
}

/** House A mints a card and a sealed payload of its own dead. */
async function houseA() {
  await AsyncStorage.clear();
  _setIdentityForTests('inst-A', 'Sasmooch');
  _setSendingKeyForTests('k_aaaaaaaaaaaaaaaaaaaa');
  _setPairedForTests([]); _setLedgerForTests({ foreign: [], rests: [] });
  await ensureSendingKey();
  const card = await myHouseCode();
  await recordFallen({
    name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
    locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96, ts: 1_760_000_000_000,
  } as never);
  return { card, payload: await buildExportPayload() };
}

async function beHouseB(card: string): Promise<void> {
  await AsyncStorage.clear();
  _setIdentityForTests('inst-B', 'Brannoch');
  _setSendingKeyForTests('k_bbbbbbbbbbbbbbbbbbbb');
  _setPairedForTests([]); _setLedgerForTests({ foreign: [], rests: [] });
  await acceptHouseCode(card);
}

describe('OTA-1843 §G — the screen', () => {
  it('G.1 ⚠⚠⚠ MATRIX 1 — taking them in reads as an ARRIVAL, not a count', async () => {
    const a = await houseA();
    await beHouseB(a.card);
    const s = await mountExchange();
    await s.type('Incoming exchange', a.payload);
    await s.press('LOOK AT IT');
    await s.press('TAKE THEM IN');
    const shown = s.texts().join('\n');
    expect(shown).toContain('Francis child of Sasmooch');
    expect(shown).toContain('walk your wastes now');
    expect(shown).toContain("another player's world");
  });

  it('G.2 ⚠⚠ MATRIX 15 — the roll shows who is still walking, off durable state', async () => {
    const a = await houseA();
    await beHouseB(a.card);
    await importPayloadText(a.payload);
    const s = await mountExchange();
    const shown = s.texts().join('\n');
    expect(shown).toContain('THE ROLL');
    expect(shown).toContain('Francis child of Sasmooch');
    expect(shown).toContain('the Mud Flats');
  });

  it('G.3 ⚠ an empty roll says so in words rather than showing nothing', async () => {
    await AsyncStorage.clear();
    _setIdentityForTests('inst-B', 'Brannoch');
    _setSendingKeyForTests('k_bbbbbbbbbbbbbbbbbbbb');
    _setPairedForTests([]); _setLedgerForTests({ foreign: [], rests: [] });
    const s = await mountExchange();
    expect(s.texts().join('\n')).toContain("No one else's dead have walked here yet");
  });

  it('G.4 ⚠⚠ MATRIX 15 — the history is READ-ONLY and adds no persistence key', () => {
    // §13: a durable history needing a new schema must be DEFERRED. The screen
    // reads the ledger the exchange already writes and nothing else.
    const screen = src('app', 'screens', 'FallenExchangeScreen.tsx');
    expect(screen).toContain('foreignPool()');
    expect(screen).not.toMatch(/setItem\(|AsyncStorage/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §H — MATRIX 13: THE EXCHANGE AND ITS TRUST RULES WERE NOT TOUCHED
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1843 §H — security and exchange behaviour is exactly where OTA-1842 left it', () => {
  it('H.1 ⚠⚠⚠ MATRIX 13 — a sealed payload from a paired house is still admitted', async () => {
    const a = await houseA();
    await beHouseB(a.card);
    expect((await importPayloadText(a.payload)).added).toBe(1);
  });

  it('H.2 ⚠⚠⚠ MATRIX 13 — an unpaired house is still turned away', async () => {
    const a = await houseA();
    await AsyncStorage.clear();
    _setIdentityForTests('inst-B', 'Brannoch');
    _setSendingKeyForTests('k_bbbbbbbbbbbbbbbbbbbb');
    _setPairedForTests([]); _setLedgerForTests({ foreign: [], rests: [] });
    const out = await importPayloadText(a.payload);
    expect(out.added).toBe(0);
    expect(out.unpaired).toBe(1);
  });

  it('H.3 ⚠⚠ and this OTA changed no file that decides trust', () => {
    // The seal, the pairing and the acceptance gate are all in these two, and
    // the OTA marker appears in neither — the whole pass lives downstream of
    // "this corpse is admitted".
    expect(src('app', 'engine', 'fallenSeal.ts')).not.toContain('OTA-1843');
    const store = src('app', 'engine', 'fallenLedgerStore.ts');
    expect(store).not.toContain('OTA-1843');
  });
});
