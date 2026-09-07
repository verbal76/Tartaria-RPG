/**
 * OTA-1737 (repair 1 of 3) - THE MYSTERY DOES NOT STARVE THE LEAD.
 *
 * PROVEN before the fix (audit pass #3, probe P4): a tracked mystery parked on an
 * investigate-paying stage ANYWHERE ELSE on the map made every investigate-lead
 * in the game uncompletable. Control: the lead on the player's own cell completes
 * (+50 TC). With the mystery: the lead stays open, 0 TC.
 *
 * ⚠⚠⚠ THE CAUSE WAS ONE `return false`. `advanceStagesOnIntent`'s mystery
 * wrong-ground branch (gameStore.ts ~1182) returned out of the whole function -
 * which read as "this mystery did not advance" and MEANT "stop evaluating every
 * other contract": the storyline matcher and the lead loop sit below it and never
 * ran. The hunt branch above always fell through. The storyline branch had the
 * same shape and is fixed by the same change (the owner asked for the adjacent
 * branches to be inspected: that is the only other one).
 *
 * ⚠ The distinction is preserved: the wrong-ground line still prints, the mystery
 * still does NOT advance, and the heal / advance paths still `return` when THEY
 * consume the action (a real advance or a real heal). Only "I was not on my
 * ground" stopped meaning "nobody else gets a turn".
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


import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { MYSTERIES, findMysteryById } from '../app/engine/mysteries';
import { stageLocationId } from '../app/engine/questStage';
import { contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { between, expectAbsent } from '../test-utils/srcBlock';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');
const S = () => useGameStore.getState();

async function boot(): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  useGameStore.setState({ player: { ...st.getState().player!, tc: 1000, inventory: [] }, tutorialStep: null } as never);
  await flush();
}
const lead = (locationId: string) => ({
  id: 'lead_probe', objective: { verb: 'investigate', target: 'the cache' },
  location: { id: locationId, name: 'here' }, complication: {}, reward: { type: 'currency', amount: 50, label: '50 TC' },
  generatedAt: 0, state: 'open', tracked: true,
});
async function tryLead(): Promise<{ state: string | undefined; tcGain: number }> {
  const tc0 = S().player!.tc;
  await S().submitPlayerAction('investigate the cache'); await flush();
  if (S().pendingRolls) { S().cancelPendingRolls?.(); await flush(); }
  return { state: S().player!.activeQuests?.find((q) => q.id === 'lead_probe')?.state, tcGain: S().player!.tc - tc0 };
}
/** Stage indices of `def` that pay `investigate` and whose ground is NOT the player's cell.
 *  ⚠ The ground is the ENGINE's answer (stageLocationId over the poster resolver), not a
 *  slug of the prose name: "The Monarch's Waystation" is `monarch_waystation`, and it is
 *  the starting cell of the first faction — so The Hollow Crown's boss beat is ON this
 *  ground, and a mystery on its own ground with its item missing heals the prefix and
 *  consumes the action by design (that is the adjacent `return true`, not the defect). */
function investigateStagesElsewhere(def: { id: string; stages: Array<{ checkKind?: string | null; locationName?: string }> }, here: string, onGround: string[]): number[] {
  const out: number[] = [];
  const anchor = contractAnchorId(def as never);
  def.stages.forEach((st, i) => {
    const pays = st.checkKind === 'investigate' || st.checkKind === 'boss'; // mystery boss → investigate (BOSS_IS_PAID_BY)
    if (!pays) return;
    const ground = stageLocationId(st as never, anchor, resolvePosterLocation);
    if (ground === here) onGround.push(`${def.id}#${i}`); else out.push(i);
  });
  return out;
}

describe('OTA-1737 - the observed case, both ways', () => {
  it('⚠⚠⚠ control: an investigate-lead on this cell completes', async () => {
    await boot();
    useGameStore.setState({ player: { ...S().player!, activeQuests: [lead(S().player!.currentLocationId)] } } as never);
    const r = await tryLead();
    expect(r).toEqual({ state: 'completed', tcGain: 50 });
  });
  it('⚠⚠⚠ with mystery_red_tower tracked on its investigate stage elsewhere, the lead STILL completes — and the mystery does not advance', async () => {
    await boot();
    const def = findMysteryById('mystery_red_tower')!;
    useGameStore.setState({ player: { ...S().player!, activeQuests: [lead(S().player!.currentLocationId)], activeMysteries: [{ id: def.id, stage: 1, tracked: true, acceptedAt: 0 }] } } as never);
    const r = await tryLead();
    expect(r).toEqual({ state: 'completed', tcGain: 50 });
    expect(S().player!.activeMysteries?.[0]?.stage).toBe(1);     // "this mystery did not advance" — preserved
    const said = S().gameLog.slice(-6).some((l) => /red tower|Cradle of Dusk/i.test(l.text));
    W(`  lead completed beside a parked mystery; the wrong-ground line still ${said ? 'printed' : 'did not print (throttled)'}`);
  });
});

describe('OTA-1737 - data-driven: EVERY mystery × an investigate-lead here', () => {
  it('⚠⚠⚠ no mystery, on any of its investigate-paying stages, can starve a lead', async () => {
    await boot();
    const here = S().player!.currentLocationId;
    const base = S().player!;
    let cases = 0; const failures: string[] = []; const onGround: string[] = [];
    for (const def of MYSTERIES as Array<{ id: string; stages: Array<{ checkKind?: string | null; locationName?: string }> }>) {
      for (const i of investigateStagesElsewhere(def, here, onGround)) {
        cases++;
        useGameStore.setState({ player: { ...base, tc: 1000, activeQuests: [lead(here)], activeMysteries: [{ id: def.id, stage: i, tracked: true, acceptedAt: 0 }] } } as never);
        const r = await tryLead();
        if (r.state !== 'completed' || r.tcGain !== 50) failures.push(`${def.id}#${i} → ${r.state}/${r.tcGain}`);
        if (S().player!.activeMysteries?.[0]?.stage !== i) failures.push(`${def.id}#${i} ADVANCED off its ground`);
      }
    }
    W(`  ${cases} mystery×stage cases, ${failures.length} failures${failures.length ? ':\n   ' + failures.join('\n   ') : ''}`);
    W(`  excluded as ON this cell (${here}): ${onGround.join(', ') || 'none'}`);
    expect(cases).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  });
});

describe('OTA-1737 - the adjacent branch, and the pin', () => {
  it('⚠⚠ a storyline parked on an investigate stage elsewhere does not starve the lead either', async () => {
    await boot();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SL = require('../app/engine/factionStorylines') as { STORYLINES: Array<{ id: string; stages: Array<{ checkKind?: string | null; locationName?: string }> }> };
    const list = SL.STORYLINES;
    const here = S().player!.currentLocationId;
    let cases = 0; const failures: string[] = [];
    for (const def of list) {
      const anchor = contractAnchorId(def as never);
      for (const i of def.stages.map((st, k) => (st.checkKind === 'investigate' && stageLocationId(st as never, anchor, resolvePosterLocation) !== here ? k : -1)).filter((k) => k >= 0)) {
        cases++;
        useGameStore.setState({ player: { ...S().player!, tc: 1000, activeQuests: [lead(here)], activeMysteries: [], activeStorylines: [{ id: def.id, stage: i, tracked: true, acceptedAt: 0 }] } } as never);
        const r = await tryLead();
        if (r.state !== 'completed') failures.push(`${def.id}#${i} → ${r.state}`);
      }
    }
    W(`  ${cases} storyline×stage cases, ${failures.length} failures`);
    expect(failures).toEqual([]);
  });

  it('⚠ neither wrong-ground branch returns out of the function any more', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const fn = between(src, 'const mysteryMatch = (player.activeMysteries ?? [])', "const flightKey = `storyline:${storyMatch.rec.id}`");
    // canary: both wrong-ground lines are in the window
    expect(fn).toContain('wrongGroundLine(player, ground, mysteryMatch.def.title)');
    expect(fn).toContain('wrongGroundLine(player, ground, storyMatch.def.title)');
    expectAbsent(fn, 'return false; // nothing granted — the generic beat may still play', 'wrongGroundLine(player, ground, mysteryMatch.def.title)');
  });
});
