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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1071 — Phase 0, item 1: the contract-acceptance firehose.
 *
 * From the owner's 4.28.79 log: thirteen hunts accepted at one board inside
 * fifty-six seconds. Each one spent up to five lines — poster text, the stage
 * narration, an Arbiter line naming the destination, a "(paused)" notice, and
 * the difficulty warning — so a minute of chip-tapping buried the session in
 * roughly sixty-five lines of board copy. The same sentence,
 *
 *     "This one will kill you as you are right now..."
 *
 * appeared thirteen times. It reads as noise the second time and as a bug the
 * thirteenth; the existing per-message dedup could not catch it because the HP
 * numbers interpolated into it differ from hunt to hunt.
 *
 * The fix is not a smaller message. It is that the FIRST accept of a burst is
 * worth narrating and the twelfth is not — the player has stopped reading and
 * is collecting. So accept #1 keeps every line it had, and #2 onward collapse
 * to a single line carrying the title, the destination, and whether the
 * contract landed parked. Nothing is lost: poster text, stage narration and
 * the full recommended-HP numbers all live on the Contracts card, which is
 * where someone reviewing thirteen commitments actually looks.
 *
 * The burst boundary is the one already in the store (BURST_WINDOW_MS, 5s of
 * silence), reused rather than reinvented so the compaction and the Arbiter's
 * "you're stacking promises" nag agree about what a burst is.
 */
jest.setTimeout(60_000);

import { useGameStore, _resetAcceptBurst } from '../app/state/gameStore';
import { HUNTS } from '../app/engine/hunts';
import { getRaces, getFactions } from '../app/engine/character';

const FACTION = 'forgotten_order';
const NEUTRAL = HUNTS.filter((h) => h.factionId === null);

async function boot(name: string, withAgent = false) {
  _resetAcceptBurst();
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  store.setState((s) => ({
    player: {
      ...s.player!,
      factionStanding: [
        ...s.player!.factionStanding.filter((r) => r.factionId !== FACTION),
        { factionId: FACTION, standing: 60 },
      ],
    },
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [],
      ...(withAgent
        ? { vendor: { id: 'poster_agent', name: 'Poster Agent', title: 'agent', faction: FACTION, offers: [], demeanor: 'honest' } as never }
        : {}),
    },
  }));
  return store;
}

/** Everything the PLAYER has been shown since the marker. The debug channel is
 *  developer bookkeeping and never reaches the feed, so it is not part of the
 *  noise floor this OTA is measuring. */
const since = (store: typeof useGameStore, mark: number) =>
  store.getState().gameLog.slice(mark).filter((e) => e.channel !== 'debug').map((e) => e.text);

const logLength = (store: typeof useGameStore) => store.getState().gameLog.length;

describe('OTA-1071 — the first accept of a burst is narrated in full', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a faction hunt taken from a cold start keeps poster, destination and danger', async () => {
    const store = await boot('Reader', true);
    const hunt = HUNTS.find((h) => h.factionId === FACTION)!;
    const mark = logLength(store);
    store.getState().acceptHunt(hunt.title);
    const out = since(store, mark).join('\n');

    expect(out).toContain(hunt.posterText);
    expect(out).toContain(hunt.stages[0]!.narration);
    expect(out).toContain(hunt.targetLocationName ?? '');
    // Apex tier, Legendary weapon wanted, 75 HP wanted — a fresh character
    // meets neither, so the warning is exactly the one the owner saw.
    expect(out).toContain('This one will kill you as you are right now');
  });
});

describe('OTA-1071 — everything after it collapses to one line', () => {
  it('the SAME hunt taken mid-burst says one line and drops the rest', async () => {
    const store = await boot('Collector', true);
    // Spend the first accept of the burst on something else, so the hunt under
    // test is #2 rather than #1 — same hunt, same player, only the position
    // differs.
    store.getState().acceptHunt(NEUTRAL[0]!.title);
    const hunt = HUNTS.find((h) => h.factionId === FACTION)!;
    const mark = logLength(store);
    store.getState().acceptHunt(hunt.title);
    const out = since(store, mark);
    const joined = out.join('\n');

    expect(joined).toContain(`✦ Hunt accepted — ${hunt.title}`);
    expect(joined).toContain(hunt.targetLocationName!); // destination survives
    expect(joined).not.toContain(hunt.posterText);
    expect(joined).not.toContain(hunt.stages[0]!.narration);
    expect(joined).not.toContain('This one will kill you as you are right now');
    expect(joined).not.toContain('added to your slate (paused');
    // One player-visible line for the contract itself. (debug-channel bookkeeping
    // and the Arbiter's burst commentary are counted separately below.)
    expect(out.filter((t) => t.includes('Hunt accepted —')).length).toBe(1);
  });

  it('a parked contract still says so — the marker replaces the sentence, not the fact', async () => {
    const store = await boot('Parker', true);
    store.getState().acceptHunt(NEUTRAL[0]!.title); // goes LIVE, and is accept #1
    const hunt = HUNTS.find((h) => h.factionId === FACTION)!;
    store.getState().acceptHunt(hunt.title);

    const rec = (store.getState().player!.activeHunts ?? []).find((h) => h.id === hunt.id)!;
    expect(rec.tracked).toBe(false);
    const joined = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(joined).toContain(`✦ Hunt accepted — ${hunt.title} (parked)`);
  });
});

describe('OTA-1071 — the reported case: thirteen contracts at one board', () => {
  it('spends one line per contract after the first instead of five', async () => {
    const store = await boot('Firehose');
    const take = NEUTRAL.slice(0, 13);
    expect(take.length).toBe(13); // guard: the catalog still holds enough to reproduce it

    const mark = logLength(store);
    for (const h of take) store.getState().acceptHunt(h.title);
    const out = since(store, mark).filter((t) => t.trim().length > 0);

    // All thirteen actually landed — compaction is a display change only.
    expect((store.getState().player!.activeHunts ?? []).length).toBe(13);

    // OTA-1078 — EXACT, not `<= 1`. Every bound here was satisfiable by ZERO,
    // so deleting the danger warning outright — or ceasing to narrate accept #1
    // in full — left this test green. A headline regression test that passes
    // when the feature is removed is not a regression test.
    //
    // ⚠ And the exact number here is ZERO, which is worth stating rather than
    // hiding behind `<= 1`: this burst is thirteen NEUTRAL hunts taken with no
    // agent in scene, and the danger warning only exists on the faction-hunt
    // path. The "fires once, not thirteen times" claim is carried by the two
    // faction-hunt tests above — full detail on accept #1, none on accept #2.
    const killYou = out.filter((t) => t.includes('This one will kill you')).length;
    expect(killYou).toBe(0);

    // The two-sentence parked notice fires at most once (accept #1, and only if
    // it parks at all).
    const parkedSentences = out.filter((t) => t.includes('added to your slate (paused')).length;
    expect(parkedSentences).toBe(0); // accept #1 goes LIVE, so nothing parks in full form

    // Twelve of the thirteen are one line each; the first keeps its detail and
    // the Arbiter keeps his first-contract / stacking / slow-down beats. That is
    // 16 lines of NARRATION on this input. Old behaviour was north of forty.
    //
    // ⚠ P19 — one line per accept is added on top, and it is not chatter: every hunt
    // now opens by having the giver hand you something, and an item entering the pack
    // has always been announced (`✦ … — mission item.`). Counted SEPARATELY rather than
    // rolled into a bigger magic number, because the rule OTA-1048 defends is about the
    // Arbiter repeating himself, and a grant receipt is not the Arbiter talking. If the
    // compaction ever regresses, the narration count below still catches it.
    const grantReceipts = out.filter((t) => t.endsWith('— mission item.'));
    expect(grantReceipts.length).toBe(take.length);
    expect(out.length - grantReceipts.length).toBe(16);

    // ...and the twelve really are the compact form, not merely fewer lines.
    const compact = out.filter((t) => t.startsWith('✦ Contract accepted —'));
    expect(compact.length).toBe(12);
    for (const t of compact) expect(t.split('\n').length).toBe(1);

    // Every contract is still named — compaction must not silently swallow one.
    // Case-insensitive: the full-detail line for accept #1 lowercases the
    // leading article ("You take the Bog Dragon of Old Drakova on").
    const joined = out.join('\n').toLowerCase();
    for (const h of take) expect(joined).toContain(h.title.toLowerCase());
  });
});

describe('OTA-1071 — the burst has to actually end for detail to return', () => {
  it('after five seconds of silence the next accept is narrated in full again', async () => {
    const store = await boot('Pacer');
    store.getState().acceptHunt(NEUTRAL[0]!.title); // #1 — full
    store.getState().acceptHunt(NEUTRAL[1]!.title); // #2 — compact

    const midBurst = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(midBurst).toContain(`✦ Contract accepted — ${NEUTRAL[1]!.title}`);

    // Walk the clock past BURST_WINDOW_MS. Only the burst comparison reads
    // Date.now() here, so shifting it is equivalent to the player pausing.
    const realNow = Date.now;
    Date.now = () => realNow.call(Date) + 10_000;
    try {
      const mark = logLength(store);
      store.getState().acceptHunt(NEUTRAL[2]!.title);
      const out = since(store, mark).join('\n');
      expect(out).toContain('Open the Contracts board to see the stages');
      expect(out).not.toContain(`✦ Contract accepted — ${NEUTRAL[2]!.title}`);
    } finally {
      Date.now = realNow;
    }
  });
});
