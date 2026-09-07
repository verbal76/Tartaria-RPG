/**
 * OTA-1728 - THE PARLEY STONE ATE THE MISSION.
 *
 * The audit brief: "The text says go here and find/fight/meet/recover X, but when
 * the player goes there X either doesn't exist, isn't the thing the trigger is
 * listening for, or the trigger never fires." This is that, found by driving
 * every storyline and mystery stage by stage rather than by reading data.
 *
 * WHAT THE WALK FOUND. 32 missions driven end to end - stand on the stage's own
 * ground, carry the item it requires, type the verb the card asks for. 30 walked
 * their whole chain. Two stalled dead, and both stalled on the SAME TILE with the
 * SAME CHECK KIND: a `diplomacy` stage whose ground is the Parley Ground.
 *
 *     story_dynasty_blood_aetherborn   stalled 3 of 6   "talk it through with the claimant"
 *     mystery_pale_signal              stalled 0 of 4   blocked at its FIRST stage
 *
 * WHY. `parleyInterceptEligible` hands any parley-ish verb typed on that tile to
 * the Guild Broker and the store RETURNS - before the mission matcher runs. Its
 * verb list is
 *
 *     parley|approach|examine|inspect|survey|meet|talk|speak|leaders?|factions?|broker
 *
 * and the ask the game itself prints for a diplomacy stage is "talk it through".
 * It matches on `talk`. So the card told the player the word, the player typed the
 * word on the right cell holding the right item, and the parley stone answered
 * instead. mystery_pale_signal could not be completed by anybody.
 *
 * CAUSATION WAS ISOLATED, NOT ARGUED. One predicate forced to false, nothing else
 * changed: 3/6 -> 6/6 and 0/4 -> 4/4.
 *
 * THE AUTHORITY. Two claims on one verb at one tile. The stone is always there;
 * the player was SENT here by a card that named the verb, so the stage is the more
 * specific claim and wins - but only where the collision is real, which keeps the
 * Guild Broker reachable for every other verb and every player not mid-stage.
 * `stageUnderfoot` already answers "which tracked contract's current stage stands
 * on this cell", through the same stageLocationId + standingAtLocation +
 * payingIntent the three verb matchers use, so no second answer was written.
 *
 * AND THE GUARD READS THE ASK, NOT A HARDCODED KIND. Of the seven asks exactly one
 * collides today; if a label is retuned the guard follows it. That is also why the
 * Silence's `attack_provoke` stage on this same tile always worked - "provoke it"
 * is not in the list.
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { STORYLINES } from '../app/engine/factionStorylines';
import { MYSTERIES } from '../app/engine/mysteries';
import { resolvePosterLocation, contractAnchorId } from '../app/engine/contractMarkers';
import { stageLocationId, payingIntent, stageVerbAsk } from '../app/engine/questStage';
import { canonicalCellOf } from '../app/engine/worldMap';
import { parleyInterceptEligible, PARLEY_VERB_RE, SEAL_VERB_RE } from '../app/engine/broker';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(300000);
const flush = () => new Promise((r) => setTimeout(r, 0));
type Fam = 'storyline' | 'mystery';
const recsKey = (f: Fam) => (f === 'storyline' ? 'activeStorylines' : 'activeMysteries');

const VERB: Record<string, string> = {
  diplomacy: 'talk it out', stealth: 'sneak', investigate: 'investigate',
  attack_provoke: 'attack', attack: 'attack', escape: 'escape', cast: 'cast aether',
};

async function boot(): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  await flush();
}
function standAt(locId: string): void {
  const c = canonicalCellOf(locId);
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, currentLocationId: locId, gridX: c.x, gridY: c.y, travelTarget: null } } as never);
}
function give(name: string): void {
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, inventory: [...p.inventory, { id: `probe_${name}_${Math.random()}`, name, kind: 'misc', rarity: 'Common', quantity: 1, tags: [] }] } } as never);
}
function seat(fam: Fam, id: string, stage = 0): void {
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, [recsKey(fam)]: [{ id, stage, tracked: true }] } } as never);
}
const stageOf = (fam: Fam, id: string): number =>
  ((useGameStore.getState().player as unknown as Record<string, Array<{ id: string; stage: number }>>)[recsKey(fam)] ?? [])
    .find((r) => r.id === id)?.stage ?? -1;

/** ⚠⚠ THE ADVANCE LOOP IS NOT ONE CALL, and a probe that does not model it
 *  measures silence. A stage that pays raises a ROLL CARD, and
 *  `submitPlayerAction` returns immediately while one is up - with no log line at
 *  all. Behind it come the mission beat card, parley/talk sheets and mission
 *  offers. Every one of those is a tap on a device. */
async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const st = useGameStore.getState();
    const any = st as unknown as Record<string, unknown>;
    if (st.pendingRolls) {
      const step = st.pendingRolls.steps[st.pendingRolls.currentStep] as { dice?: string } | undefined;
      const n = Number(/d(\d+)/.exec(String(step?.dice ?? 'd20'))?.[1] ?? 20);
      st.resolveRollStep([Math.max(1, n)]);
      await flush(); continue;
    }
    if (st.pendingMissionBeat) { st.dismissMissionBeat?.(); await flush(); continue; }
    if (any.pendingParley) { (any.closeParley as () => void)?.(); await flush(); continue; }
    if (any.pendingTalk) { (any.closeTalk as () => void)?.(); await flush(); continue; }
    if (any.pendingMissionOffer) { useGameStore.setState({ pendingMissionOffer: null } as never); await flush(); continue; }
    if (any.pendingPayoff) { useGameStore.setState({ pendingPayoff: null } as never); await flush(); continue; }
    break;
  }
  await flush();
}

async function playStage(fam: Fam, def: { id: string; stages: unknown[] }, anchor: string): Promise<void> {
  const i = stageOf(fam, def.id);
  const st = def.stages[i] as Record<string, unknown>;
  standAt(stageLocationId(st as never, anchor, resolvePosterLocation));
  // ⚠ A wandering pack can spawn on the stage's ground and the matcher correctly
  // refuses to advance mid-fight (measured: `talk it out` at the Sunken Enclave
  // parleyed with two Eternal Dynasty Raiders instead). Right, and not the subject.
  const sc = useGameStore.getState().currentScene;
  if (sc && (sc.enemies ?? []).length > 0) {
    useGameStore.setState({ currentScene: { ...sc, enemies: [], enemyHps: [], activeEnemyIdx: 0 } } as never);
  }
  const req = (st.requires as { item?: string } | undefined)?.item;
  if (req) give(req);
  const intent = payingIntent(fam, st as never);
  if (!intent) return;
  await useGameStore.getState().submitPlayerAction(VERB[intent] ?? intent);
  await settle();
  // ⚠⚠ A STAGE THAT SPAWNS HOLDS UNTIL THE BODY IS DOWN - OTA-1583 stands the pack
  // up and freezes the chapter on purpose. Finish it the way a player would.
  for (let k = 0; k < 30; k++) {
    const sc2 = useGameStore.getState().currentScene;
    if (!sc2 || (sc2.enemies ?? []).length === 0) break;
    const me = useGameStore.getState().player!;
    if ((me.hp ?? 0) < 30) useGameStore.setState({ player: { ...me, hp: me.hpMax ?? 60, stamina: me.staminaMax ?? 20 } } as never);
    if ((sc2 as unknown as { range?: string }).range && (sc2 as unknown as { range?: string }).range !== 'close') {
      await useGameStore.getState().submitPlayerAction('advance'); await settle();
    }
    await useGameStore.getState().submitPlayerAction('attack'); await settle();
  }
  await settle();
}

// ===== 1. the pure rule ==================================================

describe('OTA-1728 - the stone yields to the stage, and only where they collide', () => {
  // ⚠ OTA-1484 CLASS: "minimal argument objects for pure predicates … not player
  //   state; coords would be dead weight." `parleyInterceptEligible` takes a
  //   location ID and never a player, so there is no cell to place — the same
  //   reason ota1484 already lists parleyInterceptGuard as a deliberate bare site.
  const base = { labyrinthRun: false, insideBuilding: false, enemyCount: 0,
                 currentLocationId: 'parley_ground', challengeOn: true };

  it('⚠⚠⚠ THE COLLISION: a diplomacy stage underfoot stops the intercept', () => {
    expect(parleyInterceptEligible({ ...base, missionAskHere: 'talk it through' })).toBe(false);
  });

  it('and with NO mission underfoot the Guild Broker is untouched', () => {
    expect(parleyInterceptEligible({ ...base, missionAskHere: null })).toBe(true);
    expect(parleyInterceptEligible(base)).toBe(true);
  });

  it('⚠⚠ EXACTLY ONE of the seven asks collides - measured, not assumed', () => {
    // If a label is ever retuned into or out of the parley verb list, this is
    // where it is noticed rather than in a mission nobody can finish.
    const KINDS = ['investigate', 'stealth', 'diplomacy', 'cast', 'escape', 'attack_provoke', 'attack'];
    const collide = KINDS.filter((k) => {
      const ask = stageVerbAsk('storyline', { checkKind: k });
      return !!ask && PARLEY_VERB_RE.test(ask);
    });
    expect(collide).toEqual(['diplomacy']);
  });

  it('a non-colliding ask still lets the stone answer', () => {
    for (const ask of ['sneak', 'search this ground', 'strike', 'provoke it', 'flee', 'cast aether']) {
      expect(parleyInterceptEligible({ ...base, missionAskHere: ask })).toBe(true);
    }
  });

  it('the other guards survive - off-tile, in combat, indoors, in a labyrinth', () => {
    // ⚠ OTA-1484 CLASS: pure-predicate argument, as above.
    expect(parleyInterceptEligible({ ...base, currentLocationId: 'ostragar' })).toBe(false);
    expect(parleyInterceptEligible({ ...base, enemyCount: 1 })).toBe(false);
    expect(parleyInterceptEligible({ ...base, insideBuilding: true })).toBe(false);
    expect(parleyInterceptEligible({ ...base, labyrinthRun: true })).toBe(false);
    expect(parleyInterceptEligible({ ...base, challengeOn: false })).toBe(false);
  });

  it('⚠ ONE COPY OF EACH REGEX - the store no longer carries its own', () => {
    const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(STORE).toContain('const sealVerb = broker.SEAL_VERB_RE;');
    expect(STORE).toContain('const parleyVerb = broker.PARLEY_VERB_RE;');
    expect(STORE.includes('(parley|approach|examine|inspect|survey|meet|talk|speak')).toBe(false);
    expect(SEAL_VERB_RE.test('seal the alliance')).toBe(true);
    expect(PARLEY_VERB_RE.test('talk it through')).toBe(true);
  });
});

// ===== 2. the whole gamut, driven ========================================

describe('OTA-1728 - every storyline and mystery walks its whole chain', () => {
  it('⚠⚠⚠ 32 missions, played properly, stall NOWHERE', async () => {
    const stalls: string[] = [];
    let advances = 0;
    for (const [fam, defs] of [['storyline', STORYLINES], ['mystery', MYSTERIES]] as Array<[Fam, Array<{ id: string; stages: unknown[] }>]>) {
      for (const def of defs) {
        await boot(); seat(fam, def.id, 0);
        const anchor = contractAnchorId(def as never);
        let guard = 0;
        while (guard++ < 24) {
          const before = stageOf(fam, def.id);
          if (before < 0 || before >= def.stages.length) break;
          await playStage(fam, def, anchor);
          const after = stageOf(fam, def.id);
          if (after === before) {
            const s = def.stages[before] as Record<string, unknown>;
            stalls.push(`${fam} ${def.id} stage ${before}/${def.stages.length} kind=${String(s.checkKind)} loc=${String(s.locationName)}`);
            break;
          }
          advances += after - before;
        }
      }
    }
    process.stdout.write(`\nGAMUT: ${STORYLINES.length + MYSTERIES.length} missions · ${advances} stage advances · ${stalls.length} stalled\n`);
    for (const s of stalls) process.stdout.write('  STALLED ' + s + '\n');
    expect(stalls).toEqual([]);
    // the two that used to die here, by name
    expect(advances).toBeGreaterThanOrEqual(160);
  });
});

// ===== 3. out of order, twice over, and across a reload ==================

describe('OTA-1728 - a stage advances once, for the right reasons', () => {
  const DEF = STORYLINES.find((d) => d.id === 'story_dynasty_blood_aetherborn')!;
  const anchor = () => contractAnchorId(DEF as never);

  it('⚠⚠ WRONG GROUND does not advance it', async () => {
    await boot(); seat('storyline', DEF.id, 3);
    const st = DEF.stages[3] as unknown as Record<string, unknown>;
    standAt('ostragar');                                   // anywhere but the stage's ground
    const req = (st.requires as { item?: string } | undefined)?.item;
    if (req) give(req);
    await useGameStore.getState().submitPlayerAction('talk it out');
    await settle();
    expect(stageOf('storyline', DEF.id)).toBe(3);
  });

  it('⚠⚠ MISSING ITEM does not advance it, even on the right ground', async () => {
    await boot(); seat('storyline', DEF.id, 3);
    const st = DEF.stages[3] as unknown as Record<string, unknown>;
    standAt(stageLocationId(st as never, anchor(), resolvePosterLocation));
    // deliberately do NOT give the required item
    await useGameStore.getState().submitPlayerAction('talk it out');
    await settle();
    expect(stageOf('storyline', DEF.id)).toBe(3);
  });

  it('⚠⚠⚠ TWO SUBMITS IN ONE BREATH advance it exactly ONCE', async () => {
    await boot(); seat('storyline', DEF.id, 3);
    const st = DEF.stages[3] as unknown as Record<string, unknown>;
    standAt(stageLocationId(st as never, anchor(), resolvePosterLocation));
    const req = (st.requires as { item?: string } | undefined)?.item;
    if (req) { give(req); give(req); }                     // two copies, so quantity cannot be the limiter
    const before = stageOf('storyline', DEF.id);
    const a = useGameStore.getState().submitPlayerAction('talk it out');
    const b = useGameStore.getState().submitPlayerAction('talk it out');
    await Promise.all([a, b]);
    await settle();
    const after = stageOf('storyline', DEF.id);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(before + 1);
  });

  it('⚠⚠ A RELOAD MID-CHAIN KEEPS THE STAGE', async () => {
    await boot(); seat('storyline', DEF.id, 3);
    const st = DEF.stages[3] as unknown as Record<string, unknown>;
    standAt(stageLocationId(st as never, anchor(), resolvePosterLocation));
    const req = (st.requires as { item?: string } | undefined)?.item;
    if (req) give(req);
    await useGameStore.getState().submitPlayerAction('talk it out');
    await settle();
    const mid = stageOf('storyline', DEF.id);
    expect(mid).toBeGreaterThan(3);
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate();
    await flush();
    expect(stageOf('storyline', DEF.id)).toBe(mid);
  });
});
