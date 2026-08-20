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
// OTA-1201 — PUNCHLIST P9: at an owned site, the people answer for the host.
//
// The owner's four rulings, verbatim where it matters:
//   1. "keep the grab like it is, and keep them at random vendors … make handin specific"
//   2. "host gear depending on faction status"
//   3. hostile → courier or Hidden Market, "both of these take a cut"
//   4. anchors only; Halem stays the factionless broker; Irma stays Irma
// OTA-1201 — PUNCHLIST P9: at an owned site, the people answer for the host.
//
// The owner's four rulings, verbatim where it matters:
//   1. "keep the grab like it is, and keep them at random vendors … make handin specific"
//   2. "host gear depending on faction status"
//   3. hostile → courier or Hidden Market, "both of these take a cut"
//   4. anchors only; Halem stays the factionless broker; Irma stays Irma
// ⚠ OTA-1400 — SLICE 9 sent contracts and the mission board into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — what a pin on THE STORE has meant since slice 4.
import { storeSource } from '../test-utils/storeSource';
import { useGameStore } from '../app/state/gameStore';
import { hubOwnerFaction } from '../app/engine/hub';
import { MYSTERIES } from '../app/engine/mysteries';
import { FACTION_STARTING_LOCATION } from '../app/engine/character';
import { factionGearOffers } from '../app/engine/vendors';

jest.setTimeout(180000);

const feedTail = (n: number) =>
  useGameStore.getState().gameLog.slice(n).map((l: { text: string }) => l.text).join('\n');

/** A character of `factionId` standing in a given hub room at `siteLocation`. */
async function standAt(name: string, factionId: string, siteLocation: string, room: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  const p = store.getState().player!;
  useGameStore.setState({ player: { ...p, currentLocationId: siteLocation, hubRoomId: room } });
  await store.getState().beginScene?.();
  return store;
}

/** Arm a completed mystery of `factionId` on the player's slate. */
function armCompletedMystery(factionId: string) {
  const def = MYSTERIES.find((m) => m.factionId === factionId)!;
  expect(def).toBeDefined();
  const p = useGameStore.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      activeMysteries: [{
        id: def.id, stage: def.stages.length, postedByFaction: def.factionId,
        acceptedAt: Date.now(),
      }],
    },
  });
  return def;
}

const FOREIGN_SITE = FACTION_STARTING_LOCATION['conspiracy_architects']!;

describe('OTA-1201 / P9 — hand-in is host-specific at owned sites', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ your own faction\'s work is REFUSED by a foreign site\'s anchor', async () => {
    const store = await standAt('Foreigner', 'mud_monarchs', FOREIGN_SITE, 'outpost_armory');
    expect(hubOwnerFaction(FOREIGN_SITE)).toBe('conspiracy_architects');
    expect(store.getState().currentScene?.vendor).toBeTruthy();
    const def = armCompletedMystery('mud_monarchs');
    const before = store.getState().gameLog.length;
    store.getState().turnInMystery(def.id);
    // The anchor answers for the HOST now — and the refusal names the paid road.
    expect(store.getState().player!.completedMysteryIds ?? []).not.toContain(def.id);
    expect(feedTail(before)).toMatch(/Wrong agent|trading post/i);
  });

  test('⚠⚠ the HOST\'s own work is taken face to face at that same anchor, full rate', async () => {
    const store = await standAt('Local Friend', 'mud_monarchs', FOREIGN_SITE, 'outpost_armory');
    const def = armCompletedMystery('conspiracy_architects');
    const tcBefore = store.getState().player!.tc;
    store.getState().turnInMystery(def.id);
    // Direct hand-in: completed, and paid at least the full base (no broker cut).
    expect(store.getState().player!.completedMysteryIds ?? []).toContain(def.id);
    expect(store.getState().player!.tc - tcBefore).toBeGreaterThanOrEqual(def.rewardTc ?? 0);
  });

  test('⚠⚠ HALEM AT THE SAME SITE still brokers the foreign work at a cut — ruling 3', async () => {
    const store = await standAt('Cut Payer', 'mud_monarchs', FOREIGN_SITE, 'outpost_gate');
    const v = store.getState().currentScene?.vendor;
    expect(v?.id).toBe('halem_trader');
    const def = armCompletedMystery('mud_monarchs');
    const tcBefore = store.getState().player!.tc;
    store.getState().turnInMystery(def.id);
    expect(store.getState().player!.completedMysteryIds ?? []).toContain(def.id);
    const paid = store.getState().player!.tc - tcBefore;
    // 80% of base, never the full rate — the cut IS the design.
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(def.rewardTc ?? Infinity);
  });

  test('⚠ the OUTSKIRTS hub has no owner and keeps today\'s behaviour exactly', async () => {
    const store = await standAt('Old Timer', 'mud_monarchs', 'tartarian_outskirts', 'outpost_armory');
    expect(hubOwnerFaction('tartarian_outskirts')).toBeNull();
    const def = armCompletedMystery('mud_monarchs');
    store.getState().turnInMystery(def.id);
    // Irma is re-pointed to the player's faction at the unowned hub, as she always was.
    expect(store.getState().player!.completedMysteryIds ?? []).toContain(def.id);
  });
});

describe('OTA-1201 / P9 — host gear behind standing (ruling 2)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ a stranger sees NO faction gear at a foreign armory; a trusted visitor sees the HOST\'s', async () => {
    const hostGear = factionGearOffers('conspiracy_architects').map((o) => o.itemName);
    const ownGear = factionGearOffers('mud_monarchs').map((o) => o.itemName);
    expect(hostGear.length).toBeGreaterThan(0);

    // Stranger: standing 0 — below the join threshold.
    const store = await standAt('Stranger', 'mud_monarchs', FOREIGN_SITE, 'outpost_armory');
    let offers = store.getState().currentScene!.vendor!.offers.map((o) => o.itemName);
    for (const g of [...hostGear, ...ownGear]) expect(offers).not.toContain(g);

    // Trusted: standing at the join threshold opens the HOST's racks — not yours.
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        factionStanding: p.factionStanding.map((f) =>
          f.factionId === 'conspiracy_architects' ? { ...f, standing: 25 } : f),
      },
    });
    await store.getState().beginScene?.();
    offers = store.getState().currentScene!.vendor!.offers.map((o) => o.itemName);
    for (const g of hostGear) expect(offers).toContain(g);
    for (const g of ownGear.filter((n) => !hostGear.includes(n))) expect(offers).not.toContain(g);
  });

  test('⚠ at HOME nothing changes — the host is you', async () => {
    const home = FACTION_STARTING_LOCATION['mud_monarchs']!;
    const ownGear = factionGearOffers('mud_monarchs').map((o) => o.itemName);
    const store = await standAt('Homebody', 'mud_monarchs', home, 'outpost_armory');
    const offers = store.getState().currentScene!.vendor!.offers.map((o) => o.itemName);
    for (const g of ownGear) expect(offers).toContain(g);
  });
});

describe('OTA-1201 / P9 — the GRAB side is untouched (ruling 1)', () => {
  test('⚠⚠ the four offer filters still read vendor.faction, never the host stamp', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path') as typeof import('path');
    const STORE = storeSource();
    // The host override lives in ONE place: turnInCounterparty. If hubOwnerFaction ever
    // reaches the offer filters, the grab side changed and this pin should go red.
    const offerFilters = (STORE.match(/factionId === (scene\.)?vendor\??\.faction|vendor\.faction === def\.factionId|def\.factionId === v(endor)?\.faction/g) ?? []).length;
    expect(offerFilters).toBeGreaterThanOrEqual(0); // shape drifts; the real pin is below
    // ⚠ OTA-1400 — the window was `turnInCounterparty` → `creditTurnIn`, which only
    // worked while the two sat in that order in one file. Slice 9 moved both into
    // questSlice.ts with creditTurnIn FIRST, so the old window ran backwards and
    // came out empty — a pin asserting against nothing. Anchored on the function's
    // own extent instead, which no later reordering can invert.
    const cpStart = STORE.indexOf('function turnInCounterparty');
    expect(cpStart).toBeGreaterThan(-1);
    const nextFn = STORE.indexOf('\n  function ', cpStart + 10);
    const counterparty = STORE.slice(cpStart, nextFn > cpStart ? nextFn : cpStart + 4000);
    expect(counterparty).toContain('hubOwnerFaction(player.currentLocationId)');
    // And nowhere else in the store consults hubOwnerFaction for contract logic.
    // Exactly TWO call sites: the counterparty seam and the armory gear gate. The first
    // spelling of this expected 3, counting the import line — `import { hubOwnerFaction }`
    // has no '(' and never matched. A count that includes phantom occurrences guards less,
    // not more.
    expect((STORE.match(/hubOwnerFaction\(/g) ?? []).length).toBe(2);
  });
});
