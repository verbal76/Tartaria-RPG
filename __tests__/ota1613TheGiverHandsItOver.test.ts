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

// ⚠⚠⚠ OTA-1613 — THE GIVER HANDS IT OVER.
//
// Owner, on finishing Garrin's folio: "it was anticlimactic, it just gave me
// the generic mission complete. like it was a normal story hook completion. I
// should have talked to him again, and then given my award in the chat window
// from him."
//
// And the game never let him. His log, 20:31:23 → 20:31:28: he set a course to
// "Garrin (return the folio)", walked two tiles south, and the payout fired off
// the ARRIVAL — Garrin's line into the world feed as ambient narration, two
// reward lines, the generic completion card, record deleted. Five seconds, no
// tap. The chain hires you face to face and paid you by receipt.
//
// Arrival now ARMS the hand-over: the record moves to `handback`, the giver's
// greeting seeds the transcript the SPEAK TO bar renders, and nothing is paid.
// Handing it over is a deliberate act — a button, or the typed phrase — and the
// authored return line and the take land as HIS turns in that conversation.

import { useGameStore, resolveWhispersForTile } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findChain, whisperTargetGrid } from '../app/engine/whispers';
import { placedAt } from '../test-utils/placePlayer';
import { playerGridCell } from '../app/state/playerGrid';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

const CHAIN_ID = 'garrin_charts';
const chain = () => findChain(CHAIN_ID)!;
const rec = () => (get().player?.activeWhispers ?? []).find((w) => w.id === CHAIN_ID);

/** The walk home: goods in the pack, boots on the giver's own cell, the record
 *  at the stage his log was in when the payout ambushed him.
 *  ⚠ The whisper is pinned to the cell the player is ALREADY standing on rather
 *  than the player being walked onto the whisper — the arrival condition is a
 *  cell match, and steering map coordinates into a canon cell is the mover's
 *  job, not this suite's subject. */
function seedWalkedHome(opts: { carrying: boolean } = { carrying: true }) {
  const p0 = get().player!;
  const c = chain().content;
  store.setState({
    player: { ...p0, ...placedAt('reclaimers_stake'), hubRoomId: null } as never,
    activeBuildingId: null,
  });
  const here = playerGridCell(get().player!);
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      activeWhispers: [{
        id: CHAIN_ID, stage: 'fetch_returned', plantedAtHour: 0,
        targetMapX: p.mapX, targetMapY: p.mapY,
        targetGridX: here.x, targetGridY: here.y,
        targetLocationId: p.currentLocationId,
        talk: [{ who: 'them' as const, text: c.pitch }],
      } as never],
      inventory: [
        ...p.inventory.filter((i) => i.name !== c.stolen.name && i.name !== c.reward.item!.name),
        ...(opts.carrying
          ? [{ id: 'folio_1', name: c.stolen.name, kind: 'misc', quantity: 1, tags: ['quest'] } as never]
          : []),
      ],
    } as never,
  });
}

/** The arrival beat, run on the cell the boots are standing on. */
function arrive() {
  const p = get().player!;
  resolveWhispersForTile(
    () => useGameStore.getState() as never,
    ((fn: never) => useGameStore.setState(fn)) as never,
    p.mapX as never, p.mapY as never,
  );
}

const feed = () => get().gameLog.map((e) => e.text);
const hasCompass = () =>
  (get().player?.inventory ?? []).some((i) => i.name === chain().content.reward.item!.name);

describe('OTA-1613 — the giver hands it over', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Runner', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ ARRIVING NO LONGER PAYS YOU — the giver stands up and waits', () => {
    seedWalkedHome();
    const before = get().player!.tc;
    arrive();
    // The record moved to the hand-over beat, and NOTHING was paid.
    expect(rec()?.stage).toBe('handback');
    expect(get().player!.tc).toBe(before);
    expect(hasCompass()).toBe(false);
    // His authored line has NOT been spent as ambient narration.
    expect(feed()).not.toContain(chain().content.returnLine);
    // The conversation is seeded and the player is pointed at it.
    expect((rec()?.talk ?? []).length).toBeGreaterThan(1);
    expect(feed().some((t) => /SPEAK TO GARRIN/.test(t))).toBe(true);
  });

  it('⚠⚠⚠ HANDING IT OVER IS THE BEAT — and he speaks the take in the conversation', () => {
    seedWalkedHome();
    arrive();
    expect(rec()?.stage).toBe('handback');
    const before = get().player!.tc;
    const turns = get().handBackWhisperGoods();
    // Paid, in full, and only now.
    expect(hasCompass()).toBe(true);
    expect(get().player!.tc).toBe(before + chain().content.reward.tc);
    expect((get().player?.completedWhisperIds ?? [])).toContain(CHAIN_ID);
    // ⚠ The award comes back as HIS words plus the take — what the owner asked
    // for: "given my award in the chat window from him".
    expect(turns.some((t) => t.who === 'you')).toBe(true);
    expect(turns.some((t) => t.who === 'them' && t.text === chain().content.returnLine)).toBe(true);
    expect(turns.some((t) => t.who === 'note' && /Compass/.test(t.text))).toBe(true);
  });

  it('⚠⚠ empty hands are still refused at the door — no dead button to press', () => {
    seedWalkedHome({ carrying: false });
    arrive();
    // The stage does NOT advance, so coming back with the folio still arms it.
    expect(rec()?.stage).toBe('fetch_returned');
    expect(feed()).toContain(chain().content.emptyHandsLine);
    expect(get().handBackWhisperGoods()).toEqual([]);
  });

  it('⚠⚠ the typed phrase finishes it too — a menu is not the only door', async () => {
    seedWalkedHome();
    arrive();
    expect(rec()?.stage).toBe('handback');
    await get().submitPlayerAction('give garrin the folio');
    expect(hasCompass()).toBe(true);
    expect(rec()).toBeUndefined();
  });

  it('⚠ the wiring is pinned — arrival arms, the button pays, the sheet holds the farewell', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // Arrival routes to the ARM, not the payout.
    expect(GS).toContain('return armWhisperHandback(get, set, ret, retChain);');
    expect(GS).toContain("w.id === whisper.id ? { ...w, stage: 'handback' } : w,");
    // The payout is reachable only through the deliberate hand-over.
    expect(GS).toContain('handBackWhisperGoods() {');
    const SH = readFileSync(join(__dirname, '..', 'app', 'components', 'WhisperTalkSheet.tsx'), 'utf8');
    expect(SH).toContain("const handing = w.stage === 'handback';");
    expect(SH).toContain('HAND OVER {c.goodsShort.toUpperCase()}');
    // ⚠ The record dies with the payment, so the sheet keeps the last words
    // itself — otherwise it unmounts mid-sentence and the generic card wins.
    expect(SH).toContain('setFarewell({ npcName: c.npcName, kicker: c.kicker, turns });');
  });

  it('⚠ every chain gets the beat, not just Garrin — the lines it needs are all authored', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CHAINS } = require('../app/engine/whisperChains') as { CHAINS: Array<{ id: string; content: Record<string, unknown> }> };
    expect(CHAINS.length).toBeGreaterThanOrEqual(20);
    for (const ch of CHAINS) {
      const c = ch.content as { goodsLong?: string; goodsShort?: string; returnLine?: string; npcName?: string; pronoun?: string };
      // The greeting and the button are generated from these four; a chain
      // missing one would render "undefined" at the player.
      expect(typeof c.goodsLong).toBe('string');
      expect(typeof c.goodsShort).toBe('string');
      expect(typeof c.returnLine).toBe('string');
      expect(typeof c.npcName).toBe('string');
      expect(['he', 'she', 'they']).toContain(c.pronoun);
    }
  });
});
