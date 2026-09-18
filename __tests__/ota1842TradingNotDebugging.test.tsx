/* ⚠⚠⚠ OTA-1842 — TRADING A FALLEN, NOT DEBUGGING A PAYLOAD.
 *
 * The exchange has worked for a long time and has been unusable for just as
 * long. Owner: "trading a Fallen with a friend should feel closer to trading in
 * Pokémon GO than moving a save file." Everything it needed a player to do it
 * asked in the vocabulary of the thing underneath — copy this payload, paste
 * their ledger, read the result as a row of counts — and it asked it inside a
 * panel only two character names in the world could see.
 *
 * ⚠⚠ THIS SUITE DRIVES THE REAL SCREENS. Every claim about what a player can
 * see or do is made by mounting the component, finding the control by the label
 * it renders, pressing it, and reading what came back — not by grepping the file
 * for a string. A source pin proves a line exists; it never proves a player can
 * reach it, and reachability was this feature's entire defect.
 *
 * ⚠⚠ NOTHING HERE MAY MOVE THE SECURITY LINE. §H re-states the whole acceptance
 * table — sealed, legacy, downgrade, laundering, forged — as behaviour, so a UX
 * change that quietly softened one of them fails here rather than in a player's
 * world. This OTA PRESENTS trust state. It does not redefine it.
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
import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  loadPaired,
  loadLedger,
  myHouseCode,
  acceptHouseCode,
  setHouseName,
  buildExportPayload,
  previewPayloadText,
  importPayloadText,
  recordRest,
  ensureSendingKey,
  FallenPayloadTooLargeError,
  _setSendingKeyForTests,
  _setPairedForTests,
  _setIdentityForTests,
  _setLedgerForTests,
} from '../app/engine/fallenLedgerStore';
import { MAX_EXCHANGE_BYTES, fallenKey } from '../app/engine/fallenLedger';
import type { ForeignFallen, RestRecord } from '../app/engine/fallenLedger';
import { MAX_PAYLOAD_BYTES } from '../app/engine/fallenMailbox';
import { recordFallen } from '../app/engine/saveSystem';
import { createCharacter, getRaces, getFactions } from '../app/engine/character';
import { TRUST_LABEL, refusalLine, FallenExchangeScreen } from '../app/screens/FallenExchangeScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void>;
  create(el: React.ReactElement): {
    toJSON(): unknown;
    unmount(): void;
    root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] };
  };
};

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/** ⚠ OTA-1449's rule — close what you open. A mounted screen carries effects and
 *  a store subscription; left up, it outlives the file and kills the worker. */
const MOUNTED: Array<{ unmount(): void }> = [];
afterEach(async () => {
  const roots = MOUNTED.splice(0);
  await renderer.act(async () => {
    for (const r of roots) { try { r.unmount(); } catch { /* already gone */ } }
  });
  jest.restoreAllMocks();
});

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const realGetItem = AsyncStorage.getItem.bind(AsyncStorage);
const LEDGER_KEY = 'tartaria.fallenLedger.v1';

/** What is actually on disk, past every module cache. */
async function ledgerOnDisk(): Promise<{ fallen: unknown[]; rests: unknown[] }> {
  const raw = await realGetItem(LEDGER_KEY);
  if (!raw) return { fallen: [], rests: [] };
  const d = JSON.parse(raw) as { fallen?: unknown[]; rests?: unknown[] };
  return { fallen: d.fallen ?? [], rests: d.rests ?? [] };
}

const DEAD_A = {
  name: 'Francis', raceName: 'Aetherborn', epitaph: 'The mud took the last of the light.',
  locationName: 'the Mud Flats', kills: 42, corruption: 'Tainted', hours: 96,
};

/** Put the module set in one install's shoes, with a clean ledger. */
function beInstall(installId: string, house: string, sendKey: string | null): void {
  _setIdentityForTests(installId, house);
  _setSendingKeyForTests(sendKey);
  _setPairedForTests([]);
  _setLedgerForTests({ foreign: [], rests: [] });
}

interface HouseA { card: string; payload: string; body: string; key: string }

/** House A: mints its card and a SEALED payload of its own dead, together, so
 *  the key in the card is the key the seal was made with. Leaves a clean disk
 *  behind it — everything it produced is in the return value. */
async function houseA(): Promise<HouseA> {
  await AsyncStorage.clear();
  beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
  const key = await ensureSendingKey();
  const card = await myHouseCode();
  await recordFallen({ ...DEAD_A, ts: 1_760_000_000_000 } as never);
  const payload = await buildExportPayload();
  // ⚠ The inner document, WITHOUT the envelope — this is what an unsealed paste
  // looks like, and it is how the downgrade case is reached honestly.
  const body = (JSON.parse(payload) as { body: string }).body;
  return { card, payload, body, key };
}

/** B, holding A's card — so B holds A's key and can actually check a seal. */
async function beB_ridingWithA(card: string): Promise<void> {
  await AsyncStorage.clear();
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
  await acceptHouseCode(card);
}

/** ⚠ B, paired with A the way an install that pre-dates seals is: a row with a
 *  house and an install id and NO KEY. `authenticate` holds nothing to check
 *  against, falls through to `unsealed`, and the engine admits it deliberately.
 *  That state is what the LEGACY label exists to describe. */
async function beB_legacyWithA(): Promise<void> {
  await AsyncStorage.clear();
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
  _setPairedForTests([{ player: 'Sasmooch', installId: 'inst-A', addedTs: 1 }]);
}

/** B, riding with nobody. */
async function beB_alone(): Promise<void> {
  await AsyncStorage.clear();
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
}

/** B, holding SOMEBODY ELSE'S key — so a seal from A is checked and fails. */
async function beB_ridingWithC(): Promise<void> {
  await AsyncStorage.clear();
  beInstall('inst-C', 'Ghislain', 'k_cccccccccccccccccccc');
  await ensureSendingKey();
  const cCard = await myHouseCode();
  await AsyncStorage.clear();
  beInstall('inst-B', 'Brannoch', 'k_bbbbbbbbbbbbbbbbbbbb');
  await acceptHouseCode(cCard);
}

const restFor = (f: ForeignFallen): RestRecord => ({
  fallenKey: fallenKey(f),
  fallenName: f.name,
  fallenOriginPlayer: f.origin.player,
  byPlayer: 'Brannoch',
  byInstallId: 'inst-B',
  byCharacter: 'Stellan',
  whereRested: 'the Ashen Steps',
  ts: 1_760_000_100_000,
  description: 'Put down at the water line.',
});

// ── rendering ──────────────────────────────────────────────────────────────
type Node = { props: Record<string, unknown> };

/** Every string a player can actually read on the mounted tree. */
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
const readsLike = (texts: string[], needle: string): boolean => texts.some((t) => t.includes(needle));

async function settle(): Promise<void> {
  await renderer.act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

async function mountExchange() {
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<FallenExchangeScreen />); });
  MOUNTED.push(tree);
  await settle();                                  // the screen hydrates in an effect
  const byLabel = (label: string): Node[] => tree.root.findAll((n) => n.props.label === label);
  const press = async (label: string): Promise<void> => {
    const hits = byLabel(label);
    if (hits.length !== 1) throw new Error(`expected one control labelled ${label}, found ${hits.length}`);
    await renderer.act(async () => { await (hits[0]!.props.onPress as () => unknown)(); });
    await settle();
  };
  const field = (accessibilityLabel: string): Node =>
    tree.root.findAll((n) => n.props.accessibilityLabel === accessibilityLabel)[0]!;
  const type = async (accessibilityLabel: string, value: string): Promise<void> => {
    const f = field(accessibilityLabel);
    await renderer.act(async () => { (f.props.onChangeText as (v: string) => void)(value); });
  };
  return { tree, byLabel, press, field, type, texts: () => textsOf(tree.toJSON()) };
}

/** ⚠ A REAL CHARACTER, BUILT BY THE GAME'S OWN MAKER, with a name nobody has
 *  ever put on an unlock list. The screen refuses to draw without a player at
 *  all, so this is not scaffolding — it is the acceptance condition of the
 *  owner's ruling §6. */
function explorationStateFor(name: string) {
  const player = createCharacter({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  return {
    currentScreen: 'exploration',
    player,
    currentScene: {
      location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'], danger: 1 },
      ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
      enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '', activeEnemyIdx: 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// §A — MATRIX 1: THE FEATURE HAS A DOOR, AND ANYONE CAN WALK THROUGH IT
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §A — reachable through the normal UI', () => {
  it('A.1 ⚠⚠ MATRIX 1 — the exploration corner carries a FALLEN door that OPENS the screen', async () => {
    // ⚠ Proven by pressing the real control on the real screen and reading where
    // the store went — never by finding the word 'fallen' in a file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
    useGameStore.setState(explorationStateFor('Perrin Halfhand') as never);
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<ExplorationScreen />); });
    MOUNTED.push(tree);
    const doors = tree.root.findAll((n) => n.props.label === '☗ FALLEN');
    expect(doors).toHaveLength(1);
    await renderer.act(async () => { (doors[0]!.props.onPress as () => void)(); });
    expect(useGameStore.getState().currentScreen).toBe('fallen');
  });

  it('A.2 ⚠⚠ OWNER RULING §6 — and it is there for an ORDINARY name, not Verbal or Sasmooch', async () => {
    // "Normal access is product-state driven, not player-name driven." The gate
    // this replaces admitted two character names; this asserts a third, invented
    // one, which is the only kind of proof the ruling accepts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
    useGameStore.setState(explorationStateFor('Maud of the Nine Wells') as never);
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<ExplorationScreen />); });
    MOUNTED.push(tree);
    expect(tree.root.findAll((n) => n.props.label === '☗ FALLEN')).toHaveLength(1);
  });

  it('A.3 ⚠ App routes the screen name, so the door leads somewhere', () => {
    // A door that sets a screen nothing renders is still a hidden feature.
    expect(src('App.tsx')).toContain("screen === 'fallen' && <FallenExchangeScreen />");
  });

  it('A.4 ⚠ the Codex panel remains a SECONDARY route — permitted, and no longer the only one', () => {
    expect(src('app', 'components', 'LoreCodexBody.tsx')).toContain('{exchangeUnlocked && (');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §B — MATRIX 2, 3: THE HOME SAYS WHO YOU ARE AND WHO YOU RIDE WITH
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §B — the exchange home', () => {
  it('B.1 ⚠ MATRIX 2 — it shows the house name on disk, not a placeholder', async () => {
    await AsyncStorage.clear();
    beInstall('inst-B', '', 'k_bbbbbbbbbbbbbbbbbbbb');
    await setHouseName('Brannoch');
    _setIdentityForTests('inst-B', null);            // cold: force a read from disk
    const s = await mountExchange();
    expect(s.field('Your house name').props.value).toBe('Brannoch');
  });

  it('B.2 ⚠⚠ MATRIX 3 — paired houses are listed BY NAME', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const s = await mountExchange();
    expect(readsLike(s.texts(), 'Sasmooch')).toBe(true);
  });

  it('B.3 ⚠ …and each one says whether it can be checked at all', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    expect(readsLike((await mountExchange()).texts(), 'verified')).toBe(true);
    await beB_legacyWithA();
    expect(readsLike((await mountExchange()).texts(), 'legacy')).toBe(true);
  });

  it('B.4 ⚠ riding alone says so in words, not as an empty list', async () => {
    await beB_alone();
    expect(readsLike((await mountExchange()).texts(), 'You ride alone')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §C — MATRIX 4: PAIRING IS UNCHANGED UNDERNEATH THE NEW PRESENTATION
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §C — pairing: same engine, new words', () => {
  it('C.1 ⚠⚠ MATRIX 4 — ACCEPT THEIR CARD pairs exactly as the engine call does', async () => {
    const a = await houseA();

    // Reference: the engine path, measured.
    await beB_alone();
    expect((await acceptHouseCode(a.card)).ok).toBe(true);
    const viaEngine = (await loadPaired()).map((h) => ({ player: h.player, installId: h.installId, key: h.key }));

    // The screen path, driven through the control a player presses.
    await beB_alone();
    const s = await mountExchange();
    await s.type('Their house card', a.card);
    await s.press('ACCEPT THEIR CARD');
    const viaScreen = (await loadPaired()).map((h) => ({ player: h.player, installId: h.installId, key: h.key }));

    expect(viaScreen).toEqual(viaEngine);
    expect(viaScreen[0]?.key).toBe(a.key);           // the key itself, not just a row
  });

  it('C.2 ⚠ SEND MY HOUSE CARD hands the engine\'s own code to the share sheet', async () => {
    await beB_alone();
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const s = await mountExchange();
    await s.press('SEND MY HOUSE CARD');
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0]![0] as { message: string }).message).toBe(await myHouseCode());
  });

  it('C.3 ⚠ your own card is refused, and said so plainly', async () => {
    await beB_alone();
    const mine = await myHouseCode();
    const s = await mountExchange();
    await s.type('Their house card', mine);
    await s.press('ACCEPT THEIR CARD');
    expect(readsLike(s.texts(), 'your own house card')).toBe(true);
    expect(await loadPaired()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §D — MATRIX 5, 6, 7: LOOK BEFORE YOU LET THEM IN
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §D — preview before commit', () => {
  it('D.1 ⚠⚠⚠ MATRIX 5 — LOOK AT IT names who is arriving and writes NOTHING', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const before = await ledgerOnDisk();
    const s = await mountExchange();
    await s.type('Incoming exchange', a.payload);
    await s.press('LOOK AT IT');
    expect(readsLike(s.texts(), 'Francis')).toBe(true);
    expect(readsLike(s.texts(), TRUST_LABEL.verified)).toBe(true);
    expect(await ledgerOnDisk()).toEqual(before);                 // ← the whole point
    expect((await loadLedger()).foreign).toHaveLength(0);
  });

  it('D.2 ⚠⚠ MATRIX 6 — TAKE THEM IN commits, exactly once', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const s = await mountExchange();
    await s.type('Incoming exchange', a.payload);
    await s.press('LOOK AT IT');
    await s.press('TAKE THEM IN');
    expect((await ledgerOnDisk()).fallen).toHaveLength(1);
    // ⚠ And the preview is gone, so the confirm cannot be pressed a second time.
    expect(s.byLabel('TAKE THEM IN')).toHaveLength(0);
  });

  it('D.3 ⚠⚠⚠ MATRIX 7 — CANCEL takes in nothing, and changes nothing', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const before = await ledgerOnDisk();
    const s = await mountExchange();
    await s.type('Incoming exchange', a.payload);
    await s.press('LOOK AT IT');
    await s.press('CANCEL');
    expect(await ledgerOnDisk()).toEqual(before);
    expect((await loadLedger()).foreign).toHaveLength(0);
    expect(readsLike(s.texts(), 'Nothing was taken in')).toBe(true);
  });

  it('D.4 ⚠⚠ the preview CANNOT disagree with the commit — one decision, two endings', async () => {
    // A separate describe-this-payload path could drift and tell a player
    // VERIFIED while the commit refused. They must be the same decision.
    const a = await houseA();

    await beB_ridingWithA(a.card);
    const p = await previewPayloadText(a.payload);

    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);

    expect(p.arrivals).toEqual(out.arrivals);
    expect(p.turnedAway).toBe(out.unpaired);
    expect(p.rests).toBe(out.rests);
    expect(p.trust).toBe('verified');
    expect(out.forged).toBe(false);
  });

  it('D.5 ⚠ looking three times still writes nothing — a preview is not a half-import', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const before = await ledgerOnDisk();
    await previewPayloadText(a.payload);
    await previewPayloadText(a.payload);
    await previewPayloadText(a.payload);
    expect(await ledgerOnDisk()).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §E — MATRIX 8-13: WHAT THE PLAYER IS TOLD, AND WHAT IS REFUSED
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §E — trust, refusal and the ceiling', () => {
  it('E.1 ⚠⚠ MATRIX 8 — a sealed payload from a house whose key we hold reads VERIFIED', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    expect((await previewPayloadText(a.payload)).trust).toBe('verified');
    expect(TRUST_LABEL.verified).toBe('VERIFIED HOUSE');
  });

  it('E.2 ⚠⚠ MATRIX 9 — a house paired before seals existed reads LEGACY, and says why', async () => {
    // ⚠ The engine ADMITS these deliberately. The player is told there was
    // nothing to check rather than reassured that it checked out.
    const a = await houseA();
    await beB_legacyWithA();
    const p = await previewPayloadText(a.payload);
    expect(p.trust).toBe('legacy');
    expect(p.arrivals).toHaveLength(1);
    expect(TRUST_LABEL.legacy).toContain('no signature to check');
  });

  it('E.3 ⚠⚠⚠ MATRIX 10 — a payload sealed by a key nobody holds is still REFUSED', async () => {
    const a = await houseA();
    await beB_ridingWithC();                 // holds a key, but not A's
    const p = await previewPayloadText(a.payload);
    expect(p.trust).toBe('refused');
    expect(p.refusal).toBe('forged');
    expect(p.arrivals).toEqual([]);
    const out = await importPayloadText(a.payload);
    expect(out.forged).toBe(true);
    expect(out.added).toBe(0);
    expect((await ledgerOnDisk()).fallen).toHaveLength(0);
  });

  it('E.4 ⚠⚠ MATRIX 11 — a torn paste fails CLEARLY, and takes nothing', async () => {
    // ⚠ FOUND BY WRITING THIS TEST. `parseLedgerPayload` is total by design, so
    // a half-copied string used to come back as an empty batch and be presented
    // as LEGACY HOUSE / "No new dead in this one" — safe, and a lie. The
    // decision now carries whether the TEXT parsed, not whether the batch was
    // empty, so an honest payload with no dead in it still reads correctly.
    await beB_alone();
    const before = await ledgerOnDisk();
    const s = await mountExchange();
    await s.type('Incoming exchange', '{"v":1,"fallen":[  <-- not a document at all');
    await s.press('LOOK AT IT');
    expect(readsLike(s.texts(), TRUST_LABEL.refused)).toBe(true);
    expect(await ledgerOnDisk()).toEqual(before);
    const p = await previewPayloadText('{"v":1,"fallen":[  <--');
    expect(p.refusal).toBe('unreadable');
    expect(refusalLine(p)).toBe('That was not an exchange. Nothing was read.');
  });

  it('E.5 ⚠⚠ …and an honest payload carrying no dead is NOT called unreadable', async () => {
    // The other half of E.4: a friend who has lost nobody yet sends a real,
    // sealed, empty exchange. That is a quiet house, not a torn paste.
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
    await ensureSendingKey();
    const card = await myHouseCode();
    const emptyPayload = await buildExportPayload();          // no recordFallen
    await beB_ridingWithA(card);
    const p = await previewPayloadText(emptyPayload);
    expect(p.trust).toBe('verified');
    expect(p.refusal).toBeUndefined();
    expect(p.arrivals).toEqual([]);
  });

  it('E.6 ⚠⚠⚠ MATRIX 12 — oversized input is refused BEFORE it is parsed', async () => {
    await beB_alone();
    const huge = 'x'.repeat(MAX_EXCHANGE_BYTES + 1);
    const parse = jest.spyOn(JSON, 'parse');
    const p = await previewPayloadText(huge);
    expect(p.trust).toBe('refused');
    expect(p.refusal).toBe('too-large');
    expect(parse).not.toHaveBeenCalled();                     // ← before, not after
    parse.mockRestore();
    await expect(importPayloadText(huge)).rejects.toBeInstanceOf(FallenPayloadTooLargeError);
    expect((await ledgerOnDisk()).fallen).toHaveLength(0);
  });

  it('E.7 ⚠⚠ the ceiling is ONE number, not two opinions', async () => {
    // It used to live in `fallenMailbox` and guard exactly one caller: the
    // `res.text()` of a remote fetch nobody can reach yet. The transport every
    // player actually uses — pasting — had no ceiling at all.
    expect(MAX_PAYLOAD_BYTES).toBe(MAX_EXCHANGE_BYTES);
    expect(src('app', 'engine', 'fallenMailbox.ts')).toContain('MAX_PAYLOAD_BYTES = MAX_EXCHANGE_BYTES');
  });

  it('E.8 ⚠ a payload right ON the ceiling is not refused FOR ITS SIZE', async () => {
    // A guard that refuses everything is not a guard, it is an outage.
    await beB_alone();
    expect((await previewPayloadText('y'.repeat(MAX_EXCHANGE_BYTES))).refusal).toBe('unreadable');
  });

  it('E.9 ⚠⚠ MATRIX 13 — and an ordinary payload is still accepted', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const out = await importPayloadText(a.payload);
    expect(out.added).toBe(1);
    expect(out.arrivals).toHaveLength(1);
    expect((await ledgerOnDisk()).fallen).toHaveLength(1);
  });

  it('E.10 ⚠ dead from a house you do not ride with are turned away, in the player\'s words', async () => {
    const a = await houseA();
    await beB_alone();
    const p = await previewPayloadText(a.payload);
    expect(p.trust).toBe('refused');
    expect(p.refusal).toBe('unpaired');
    expect(refusalLine(p)).toContain('Trade house cards first');
    expect(refusalLine(p)).not.toMatch(/HMAC|install|payload|JSON|seal/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §F — MATRIX 14-17: SENDING, AND WHERE THE RAW TEXT WENT
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §F — the send half', () => {
  it('F.1 ⚠⚠ MATRIX 16 — SEND MY DEAD goes through the OS share sheet the app already uses', async () => {
    // ⚠ RN core `Share` — the same abstraction `ui/backupCharacter`, TitleScreen
    // and LogScreen already ship. No native expansion was required, and none was
    // made: expo-sharing, QR and camera packages are all absent from this tree.
    const a = await houseA();
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const s = await mountExchange();
    await s.press('SEND MY DEAD');
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0]![0] as { message: string }).message).toBe(a.payload);
  });

  it('F.2 ⚠ MATRIX 14 — and the screen says what was sent and what to expect back', async () => {
    await houseA();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    const s = await mountExchange();
    await s.press('SEND MY DEAD');
    expect(readsLike(s.texts(), 'Sent.')).toBe(true);
    expect(readsLike(s.texts(), 'send the result back')).toBe(true);
  });

  it('F.3 ⚠⚠ MATRIX 15 — the raw payload is NOT on the normal road', async () => {
    // At rest a player sees a send button and a paste box, never a
    // copy-the-JSON control. That one is behind a collapsed advanced section.
    await houseA();
    const s = await mountExchange();
    expect(s.byLabel('COPY RAW EXCHANGE')).toHaveLength(0);
    expect(s.byLabel('SEND MY DEAD')).toHaveLength(1);
  });

  it('F.4 ⚠ MATRIX 17 — but the manual fallback is still there for whoever needs it', async () => {
    const a = await houseA();
    const s = await mountExchange();
    // ⚠ The label lands on the Pressable AND on the host view it renders, so
    // several instances carry it; one press is one press either way.
    const toggles = s.tree.root.findAll(
      (n) => n.props.accessibilityLabel === 'Manual exchange' && typeof n.props.onPress === 'function');
    expect(toggles.length).toBeGreaterThan(0);
    await renderer.act(async () => { (toggles[0]!.props.onPress as () => void)(); });
    await settle();
    expect(s.byLabel('COPY RAW EXCHANGE')).toHaveLength(1);
    await s.press('COPY RAW EXCHANGE');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(a.payload);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §G — MATRIX 18: THE NEWS COMES BACK
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §G — closure returns without anyone typing JSON', () => {
  /** A takes B's payload home, having paired with B. Returns what arrived. */
  async function aTakesHome(bPayload: string, bCard: string) {
    await AsyncStorage.clear();
    beInstall('inst-A', 'Sasmooch', 'k_aaaaaaaaaaaaaaaaaaaa');
    await acceptHouseCode(bCard);
    return bPayload;
  }

  /** B rides with A, takes Francis in, puts him down, and sends his story back. */
  async function bRestsAndReports(a: HouseA): Promise<{ bPayload: string; bCard: string }> {
    await beB_ridingWithA(a.card);
    await ensureSendingKey();
    const bCard = await myHouseCode();
    expect((await importPayloadText(a.payload)).added).toBe(1);
    const foreign = (await loadLedger()).foreign;
    await recordRest(restFor(foreign[0]!));
    return { bPayload: await buildExportPayload(), bCard };
  }

  it('G.1 ⚠⚠ MATRIX 18 — a rest recorded on B rides home inside B\'s ORDINARY payload', async () => {
    // ⚠ NOT A SCHEMA CHANGE. `buildExportPayload` has always carried
    // `{v, house, installId, fallen, rests}`; the closure return is existing
    // architecture surfaced, which is why STOP 5 never fired.
    const a = await houseA();
    const { bPayload, bCard } = await bRestsAndReports(a);
    const payload = await aTakesHome(bPayload, bCard);
    const home = await importPayloadText(payload);
    expect(home.rests).toBe(1);
    expect((await ledgerOnDisk()).rests).toHaveLength(1);
  });

  it('G.2 ⚠ and the preview counts that news before any of it is taken in', async () => {
    const a = await houseA();
    const { bPayload, bCard } = await bRestsAndReports(a);
    const payload = await aTakesHome(bPayload, bCard);
    const before = await ledgerOnDisk();
    expect((await previewPayloadText(payload)).rests).toBe(1);
    expect(await ledgerOnDisk()).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §H — MATRIX 19, 20: THE TWO FIREWALLS, RE-STATED AS BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════════
describe('OTA-1842 §H — nothing moved that was not meant to move', () => {
  it('H.1 ⚠⚠⚠ MATRIX 19 — SEALED from a keyed house → admitted', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    expect((await importPayloadText(a.payload)).added).toBe(1);
  });

  it('H.2 ⚠⚠⚠ MATRIX 19 — UNSEALED from a house we hold NO key for → admitted (legacy, deliberate)', async () => {
    const a = await houseA();
    await beB_legacyWithA();
    expect((await importPayloadText(a.body)).added).toBe(1);
  });

  it('H.3 ⚠⚠⚠ MATRIX 19 — DOWNGRADE: a house that gave us a key then sends unsealed → refused', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);                 // B holds A's key
    const out = await importPayloadText(a.body);  // …and A sends the bare document
    expect(out.added).toBe(0);
    expect(out.unpaired).toBe(1);
  });

  it('H.4 ⚠⚠⚠ MATRIX 19 — FORGED: sealed by a key none of ours matches → refused wholesale', async () => {
    const a = await houseA();
    await beB_ridingWithC();
    expect((await importPayloadText(a.payload)).forged).toBe(true);
  });

  it('H.5 ⚠⚠⚠ MATRIX 20 — the whole round trip runs with the network torn out', async () => {
    // ⚠ TWO DEVICES, NO SERVER. If any part of pair → send → preview → take in
    // reached a network this fails. `fetch` is not stubbed to a benign value —
    // it throws, so a swallowed failure cannot pass for a clean run either.
    const boom = jest.fn(() => { throw new Error('the exchange reached a network'); });
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { f: g.fetch, x: g.XMLHttpRequest, w: g.WebSocket };
    g.fetch = boom; g.XMLHttpRequest = boom; g.WebSocket = boom;
    try {
      const a = await houseA();
      await beB_alone();
      const s = await mountExchange();
      await s.type('Their house card', a.card);
      await s.press('ACCEPT THEIR CARD');
      jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
      await s.press('SEND MY DEAD');
      await s.type('Incoming exchange', a.payload);
      await s.press('LOOK AT IT');
      await s.press('TAKE THEM IN');
      expect((await ledgerOnDisk()).fallen).toHaveLength(1);
      expect(boom).not.toHaveBeenCalled();
    } finally {
      g.fetch = saved.f; g.XMLHttpRequest = saved.x; g.WebSocket = saved.w;
    }
  });

  it('H.6 ⚠⚠ a normal player never has to read JSON — not on either side', async () => {
    const a = await houseA();
    await beB_ridingWithA(a.card);
    const s = await mountExchange();
    await s.type('Incoming exchange', a.payload);
    await s.press('LOOK AT IT');
    const shown = s.texts().join('\n').toLowerCase();
    for (const word of ['hmac', 'installid', 'install id', 'json', 'payload', 'hash', 'base64', 'hmac-sha']) {
      expect(shown).not.toContain(word);
    }
    expect(s.texts().join('\n')).toContain('Francis');
  });
});
