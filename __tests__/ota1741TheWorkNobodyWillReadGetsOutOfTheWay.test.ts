/**
 * OTA-1741 — THE WORK NOBODY WILL READ GETS OUT OF THE WAY (LAG-3-8D27).
 *
 * The final performance tranche: the native-AI queue, the lifecycle instrument,
 * hydration, and the long-session collections.
 *
 *   1. obsolete narration does not hold the one native-ML lock, and does not
 *      take a slot ahead of work the player is waiting on;
 *   2. the native queue's waits, refusals and cuts are visible to the
 *      diagnostics that already reach the bug report;
 *   3. the independent hydration reads run together; the dependent ones do not;
 *   4. the room ledger is bounded where new rooms are born, and a legacy
 *      save's rumour array is bounded on the way in;
 *   5. an utterance is encoded in slices, so it stops holding the JS thread;
 *   6. the alive beat runs app-wide, so a title-screen reclaim stops being
 *      recorded as a death one second into the process;
 *   7. a typed action refused by a pending roll says why.
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
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import {
  runExclusiveNativeMl, preemptObsoleteNativeWork, nativeQueuePressure, nativeQueuePressureLine,
  noteRejectedBeforePrefill, _resetNativeQueueStatsForTest, ML_PRIORITY_LLM, ML_PRIORITY_VOICE,
} from '../app/ai/nativeMlLock';
import { bumpArbiterGeneration, arbiterGeneration } from '../app/ai/narration';
import { pruneVisitedRooms, VISITED_ROOMS_CAP } from '../app/engine/worldMemory';
import { stampAliveBeat, peekLiveBreadcrumb, stampBreadcrumbPhase } from '../app/engine/saveSystem';
import { startAliveBeat, stopAliveBeat, setAliveBeatContext, _aliveBeatState, _resetAliveBeatForTest, ALIVE_BEAT_MS } from '../app/diagnostics/aliveBeat';
import { runtimePressureSummary } from '../app/diagnostics/runtimePressure';
import type { VisitedRoom } from '../app/engine/types';

jest.setTimeout(240000);
const S = () => useGameStore.getState();
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const tick = (ms = 0) => new Promise<void>((r) => { setTimeout(r, ms); });

async function boot(): Promise<void> {
  await S().hydrate();
  await S().startNewGame({ name: 'Lag3', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  S().skipTutorial?.();
  if (S().storyIntro) S().dismissStoryIntro();
  await tick(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. OBSOLETE NATIVE WORK DOES NOT HOLD THE LOCK, AND DOES NOT TAKE A SLOT
//    AHEAD OF WORK SOMEBODY IS WAITING FOR
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — work nobody will read yields to work somebody is waiting for', () => {
  beforeEach(() => { _resetNativeQueueStatsForTest(); });

  it('⚠⚠⚠ a RUNNING job that goes obsolete is cut, and the live job behind it goes next', async () => {
    let stale = false;
    let cut = false;
    const order: string[] = [];
    const running = runExclusiveNativeMl(
      () => new Promise<string>((res) => {
        const id = setInterval(() => { if (cut) { clearInterval(id); res('cut-short'); } }, 4);
        setTimeout(() => { clearInterval(id); res('ran-to-the-end'); }, 3000);
      }),
      ML_PRIORITY_LLM,
      undefined,
      { kind: 'narration:travel', isObsolete: () => stale, onObsolete: () => { cut = true; } },
    ).then((v) => { order.push(`narration:${v}`); });
    await tick(20);
    const lore = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_LLM, undefined,
      { kind: 'investigate_lore' }).then(() => { order.push('investigate_lore'); });

    // the player acts: the narration's reader has gone
    stale = true;
    expect(preemptObsoleteNativeWork()).toBe(true);
    await Promise.all([running, lore]);
    expect(order).toEqual(['narration:cut-short', 'investigate_lore']);
    expect(nativeQueuePressure().obsoleteCut).toBe(1);
  });

  it('⚠⚠ a job that is NOT obsolete is never cut, whatever else is queued', async () => {
    let cut = false;
    const running = runExclusiveNativeMl(
      () => new Promise<string>((res) => { setTimeout(() => res('finished'), 40); }),
      ML_PRIORITY_LLM, undefined,
      { kind: 'narration:live', isObsolete: () => false, onObsolete: () => { cut = true; } },
    );
    await tick(5);
    // even a VOICE job — which outranks it — must not cut a live narration:
    // OTA-1134 decided narration does not yield to rank, and LAG-3 does not
    // disturb that. Only obsolescence cuts.
    const voice = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_VOICE);
    expect(preemptObsoleteNativeWork()).toBe(false);
    expect(await running).toBe('finished');
    await voice;
    expect(cut).toBe(false);
    expect(nativeQueuePressure().obsoleteCut).toBe(0);
  });

  it('⚠⚠⚠ at the SAME rank an obsolete waiter loses its place to a live one, without promoting anything', async () => {
    const order: string[] = [];
    const blocker = runExclusiveNativeMl(() => new Promise((r) => { setTimeout(r, 40); }),
      ML_PRIORITY_LLM, undefined, { kind: 'blocker' });
    await tick(5);
    // the obsolete one is enqueued FIRST, so plain FIFO would run it first
    const dead = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_LLM, undefined,
      { kind: 'narration:stale', isObsolete: () => true }).then(() => order.push('stale'));
    const live = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_LLM, undefined,
      { kind: 'investigate_lore' }).then(() => order.push('live'));
    await Promise.all([blocker, dead, live]);
    expect(order).toEqual(['live', 'stale']);
    expect(nativeQueuePressure().obsoleteDeferred).toBe(1);
  });

  it('⚠ two live jobs of the same rank keep strict FIFO — the ordering repair is only about obsolete work', async () => {
    const order: string[] = [];
    const blocker = runExclusiveNativeMl(() => new Promise((r) => { setTimeout(r, 30); }), ML_PRIORITY_LLM);
    await tick(5);
    const first = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_LLM, undefined, { kind: 'a' })
      .then(() => order.push('a'));
    const second = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_LLM, undefined, { kind: 'b' })
      .then(() => order.push('b'));
    await Promise.all([blocker, first, second]);
    expect(order).toEqual(['a', 'b']);
    expect(nativeQueuePressure().obsoleteDeferred).toBe(0);
  });

  it('⚠⚠ the epoch moving IS the obsolescence signal — bumpArbiterGeneration tells the lock', async () => {
    let stale = false;
    let cut = false;
    const before = arbiterGeneration();
    const running = runExclusiveNativeMl(
      () => new Promise<string>((res) => {
        const id = setInterval(() => { if (cut) { clearInterval(id); res('cut'); } }, 4);
        setTimeout(() => { clearInterval(id); res('whole'); }, 2000);
      }),
      ML_PRIORITY_LLM, undefined,
      { kind: 'narration:travel', isObsolete: () => stale, onObsolete: () => { cut = true; } },
    );
    await tick(10);
    // exactly what a fresh narration / the player's next action does
    stale = true;
    bumpArbiterGeneration();
    expect(arbiterGeneration()).toBe(before + 1);
    expect(await running).toBe('cut');
  });

  it('⚠ the epoch still moves even if the scheduler throws — correctness never depends on the economy', () => {
    const src = read('app', 'ai', 'narration.ts');
    const fn = src.slice(src.indexOf('export function bumpArbiterGeneration('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body.indexOf('arbiterGenerationEpoch += 1;')).toBeLessThan(body.indexOf('preemptObsoleteNativeWork'));
    expect(body).toContain('} catch {');
  });

  it('⚠⚠ the door before prefill is still there, and it is now counted', () => {
    const src = read('app', 'ai', 'generation', 'LlamaRuntime.ts');
    // OTA-1368's door: the lock is ours, the native call has NOT started
    expect(src).toContain('if (wantsAbort()) {');
    expect(src).toContain('noteRejectedBeforePrefill()');
    // and the job hands the lock what it needs to schedule
    expect(src).toContain('kind: opts.job,');
    expect(src).toContain('isObsolete:');
    expect(src).toContain('onObsolete: opts.shouldAbort');
    // ⚠ narration still gets NO rank-preemption hook (OTA-1134 stands)
    expect(src).toContain('(opts.homework || opts.interruptible)');
  });

  it('⚠ the final discard guard is untouched: stale output still never surfaces', () => {
    const src = read('app', 'ai', 'narration.ts');
    expect(src).toContain('if (myEpoch !== arbiterGenerationEpoch && !preemptedFill) {');
    expect(src).toContain("noteQwenDiscarded('cancelled:player-acted-again');");
    expect(src).toContain('if (myEpoch !== arbiterGenerationEpoch) return;'); // the per-token guard
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. THE NATIVE QUEUE IS VISIBLE TO DIAGNOSTICS
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — a native queue wait is legible without forensic reconstruction', () => {
  beforeEach(() => { _resetNativeQueueStatsForTest(); });

  it('⚠⚠⚠ the snapshot names the wait, the job, the depth and the refusals', async () => {
    const idle = nativeQueuePressure();
    expect(idle).toMatchObject({ depth: 0, jobsRun: 0, runningLane: 'idle' });
    expect(nativeQueuePressureLine()).toBe('');

    // long enough that the WAIT is worth printing (the line stays quiet about
    // sub-250ms queueing on purpose — that is not a player waiting)
    const blocker = runExclusiveNativeMl(() => new Promise((r) => { setTimeout(r, 320); }),
      ML_PRIORITY_LLM, undefined, { kind: 'narration:travel' });
    await tick(10);
    const queued = runExclusiveNativeMl(() => Promise.resolve(0), ML_PRIORITY_LLM, undefined, { kind: 'investigate_lore' });
    const live = nativeQueuePressure();
    expect(live.runningLane).toBe('llm');
    expect(live.runningKind).toBe('narration:travel');
    expect(live.runningForMs).toBeGreaterThanOrEqual(0);
    expect(live.depth).toBe(1);
    expect(live.queuedLanes).toBe('llm');
    noteRejectedBeforePrefill();
    await Promise.all([blocker, queued]);

    const after = nativeQueuePressure();
    expect(after.jobsRun).toBe(2);
    expect(after.worstWaitMs).toBeGreaterThanOrEqual(250);
    expect(after.worstWaitKind).toBe('investigate_lore');
    expect(after.rejectedBeforePrefill).toBe(1);
    const line = nativeQueuePressureLine();
    expect(line).toContain('2 jobs');
    expect(line).toContain('investigate_lore');
    expect(line).toContain('refused before prefill');
  });

  it('⚠⚠ and it reaches the bug report, beside the generation numbers rather than instead of them', () => {
    const summary = runtimePressureSummary({
      memoryWarnings: 0, lastMemoryWarningAt: null, appStateTrail: ['active'],
      native: { worstWaitMs: 4400, slowJobs: 2, worstMsPerPromptTok: 12.4, wastedCalls: 11, wastedMs: 77900 },
      nativeQueue: {
        depth: 0, oldestWaitMs: 0, runningLane: 'idle', runningKind: null, runningForMs: 0, queuedLanes: '',
        jobsRun: 42, worstWaitMs: 4400, worstWaitKind: 'investigate_lore', longWaits: 2,
        rejectedBeforePrefill: 7, obsoleteCut: 4, obsoleteDeferred: 3,
      },
      lastVerdict: null, worstFrameGapMs: 0, worstJsGapMs: 0, uiStalls: 0,
    } as never);
    expect(summary).toContain('Native queue admission');
    expect(summary).toContain('worst wait 4.4s (investigate_lore)');
    expect(summary).toContain('7 refused before prefill');
    expect(summary).toContain('4 cut as obsolete');
    // the older generation-side block is still there — this adds, it does not replace
    expect(summary).toContain('11 generations thrown away');
  });

  it('⚠ the instrument is bounded: no per-token telemetry, and the snapshot is scalars', () => {
    const src = read('app', 'ai', 'nativeMlLock.ts');
    expect(src).not.toContain('onToken');
    const snap = nativeQueuePressure() as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(snap)) {
      expect([k, typeof v]).toEqual([k, v === null ? 'object' : typeof v]);
      expect(Array.isArray(v)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. HYDRATION
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — independent hydration reads run together, dependent ones do not', () => {
  it('⚠⚠⚠ the seed still runs BEFORE the stash read — a race there would cost a Resurrection Gem', () => {
    // ⚠⚠ OTA-1743 RE-AIMED THIS PIN, AND ONLY THE SHAPE MOVED. The group was
    // written with `Promise.allSettled`, which turned out to be the OTA-1741
    // boot hang: RN's Promise fallback and older Hermes builds do not provide
    // it, so on the owner's device that line threw and `hydrate()` never
    // reached its `hydrated: true`. The grouping is now `Promise.all` over a
    // local `settled()` — same concurrency, same isolation, no new builtin.
    // The ORDERING claim this test exists for is unchanged and still true.
    const src = read('app', 'state', 'slices', 'bootSlice.ts');
    expect(src).toContain('settled(loadActiveSlotId())');
    expect(src.indexOf('const seedResult = await ensureFirstInstallSeed();'))
      .toBeLessThan(src.indexOf('const stash = await loadGlobalStash();'));
    // and both come AFTER the parallel group, not inside it
    expect(src.indexOf('settled(loadActiveSlotId())'))
      .toBeLessThan(src.indexOf('const seedResult = await ensureFirstInstallSeed();'));
    // the legacy migration still precedes everything that enumerates slots
    expect(src.indexOf('await migrateLegacySlotIfPresent();'))
      .toBeLessThan(src.indexOf('settled(listSlots())'));
  });

  it('⚠⚠ isolation, not `all`: one failing read must not take the slot list down with it', () => {
    // Same claim, same guarantee — `settled()` resolves a rejection into a
    // value, so the `Promise.all` below it has no rejection path at all.
    const src = read('app', 'state', 'slices', 'bootSlice.ts');
    expect(src).toContain('if (activeR.ok) activeId = activeR.value;');
    expect(src).toContain('if (slotsR.ok) slots = slotsR.value;');
    expect(src).toContain('let slots: SlotSummary[] = [];');
  });

  it('⚠⚠⚠ hydration produces the same authoritative state, and a real save still loads', async () => {
    await boot();
    S().submitPlayerAction('look around');
    await tick(30);
    const name = S().player!.name;
    const slot = S().activeSlotId;
    await S().persist();
    await tick(20);
    useGameStore.setState({ player: null, hydrated: false } as never);
    await S().hydrate();
    expect(S().hydrated).toBe(true);
    // ⚠ The parallel group's whole job is to produce the same authoritative
    // state the sequential path did: the slot index enumerated (listSlots), the
    // active id resolved (loadActiveSlotId), the global stash counted after the
    // seed, and the crashed-slot health read — every one of them from a
    // different key, and every one of them present here.
    expect(S().slots.length).toBeGreaterThan(0);
    expect(S().slots.some((sl) => sl.playerName === name)).toBe(true);
    if (slot) expect(S().slots.some((sl) => sl.slotId === slot)).toBe(true);
    expect(typeof S().resurrectionGems).toBe('number');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. LONG-SESSION COLLECTIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — the support collections are bounded, and the bounds are the right ones', () => {
  it('⚠⚠⚠ the room ledger is capped at arrival, oldest first, and never drops the room being entered', () => {
    const rooms: Record<string, VisitedRoom> = {};
    for (let i = 0; i < VISITED_ROOMS_CAP + 40; i++) {
      rooms[`room_${i}`] = { firstVisitAt: i, lastVisitAt: i, visitCount: 1 } as VisitedRoom;
    }
    // the room being entered is the OLDEST, so a naive oldest-first cut loses it
    const kept = pruneVisitedRooms(rooms, 'room_0');
    expect(Object.keys(kept).length).toBe(VISITED_ROOMS_CAP);
    expect(kept.room_0).toBeTruthy();
    expect(kept.room_1).toBeUndefined(); // next-oldest went instead
    expect(kept[`room_${VISITED_ROOMS_CAP + 39}`]).toBeTruthy(); // newest kept
  });

  it('⚠ under the cap it is a no-op, and returns the SAME object (no copy per arrival)', () => {
    const rooms: Record<string, VisitedRoom> = { a: { firstVisitAt: 1, lastVisitAt: 1, visitCount: 1 } as VisitedRoom };
    expect(pruneVisitedRooms(rooms, 'a')).toBe(rooms);
  });

  it('⚠⚠ the arrival recorder is the one seam that prunes, and saveTrim is untouched beneath it', () => {
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('...pruneVisitedRooms(s.worldMemory.visitedRooms ?? {}, roomKey),');
    expect((store.match(/pruneVisitedRooms\(/g) ?? []).length).toBe(1);
    const trim = read('app', 'engine', 'saveTrim.ts');
    expect(trim).toContain('trimSaveStateToFit');
    expect(trim).toContain('roomsDropped');
  });

  it('⚠⚠ a legacy save\'s unbounded worldRumors is bounded on the way in, newest kept', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { migrateLoadedWorldMemory } = require('../app/state/gameStore');
    const rumors = Array.from({ length: 4000 }, (_, i) => ({ text: `rumor ${i}`, hour: i }));
    const out = migrateLoadedWorldMemory({ worldRumors: rumors } as never);
    expect(out.worldRumors!.length).toBe(50);
    expect(out.worldRumors![49]!.text).toBe('rumor 3999');
    // absent stays absent — an empty array is a different fact from no field
    expect(migrateLoadedWorldMemory({} as never).worldRumors).toBeUndefined();
  });

  it('⚠ and the caps Fable listed as missing are in the source, with their numbers', () => {
    expect(read('app', 'engine', 'vendors.ts')).toContain('export const ROADSIDE_NAME_MEMORY = 10;');
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('const ODOMETER_MEMORY = 8;');
    expect(store).toContain('.slice(-ODOMETER_MEMORY)');
    expect(store).toContain('.slice(0, ROADSIDE_NAME_MEMORY)');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. TTS ENCODING
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — the utterance encoder lets go of the JS thread', () => {
  it('⚠⚠⚠ playback uses the sliced encoder, and the bytes are produced the same way', () => {
    const src = read('app', 'voice', 'PiperTTSManager.ts');
    expect(src).toContain('const wavBase64 = await encodeWavYielding(buf, sampleRate);');
    expect(src).toContain('async function encodeWavYielding(');
    expect(src).toContain('async function bytesToBase64Yielding(');
    // both encoders write the SAME 44-byte header through one function
    expect((src.match(/writeWavHeader\(view,/g) ?? []).length).toBe(2);
    // and both base64 in the same 0x8000 chunks, so the strings cannot drift
    expect((src.match(/const CHUNK = 0x8000;/g) ?? []).length).toBe(2);
  });

  it('⚠⚠ it yields between slices — a tap arriving mid-encode is serviced, not queued behind it', () => {
    const src = read('app', 'voice', 'PiperTTSManager.ts');
    const fn = src.slice(src.indexOf('async function encodeWavYielding('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // a macrotask, not a microtask: a touch handler runs on the task queue
    expect(body).toContain('await new Promise<void>((r) => { setTimeout(r, 0); })');
    expect(body).toContain('ENCODE_SLICE_SAMPLES');
  });

  it('⚠ nothing about the audio changed: no resample, no bit depth, no channel count', () => {
    const src = read('app', 'voice', 'PiperTTSManager.ts');
    const hdr = src.slice(src.indexOf('function writeWavHeader('));
    const body = hdr.slice(0, hdr.indexOf('\n}\n'));
    expect(body).toContain('const numChannels = 1;');
    expect(body).toContain('const bitsPerSample = 16;');
    expect(src).toContain('data:audio/wav;base64,${wavBase64}');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. THE ALIVE BEAT
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — the app says "still here" from wherever it is', () => {
  afterEach(() => { _resetAliveBeatForTest(); });

  it('⚠⚠⚠ the beat runs at the app root and carries the screen it is on', async () => {
    stampBreadcrumbPhase('probe-phase');
    setAliveBeatContext(() => 'title', () => 'boot:qwen:deferred');
    startAliveBeat();
    expect(_aliveBeatState().running).toBe(true);
    const crumb = peekLiveBreadcrumb();
    expect(crumb?.screen).toBe('title');
    expect(crumb?.aliveStage).toBe('boot:qwen:deferred');
    expect(crumb?.appState).toBeTruthy();
    // ⚠ the beat dates life; it does not overwrite the last real checkpoint
    expect(crumb?.phase).toBe('probe-phase');
    stopAliveBeat();
    expect(_aliveBeatState().running).toBe(false);
  });

  it('⚠⚠ it advances the last-alive stamp while a screen that renders nothing sits idle', async () => {
    setAliveBeatContext(() => 'title');
    stampAliveBeat({ screen: 'title', appState: 'active' });
    const first = peekLiveBreadcrumb()?.aliveAt ?? 0;
    await tick(600); // past the 500ms crumb-write throttle
    stampAliveBeat({ screen: 'title', appState: 'active' });
    expect((peekLiveBreadcrumb()?.aliveAt ?? 0)).toBeGreaterThan(first);
  });

  it('⚠ it is mounted at the app root and writes no store state', () => {
    const app = read('App.tsx');
    expect(app).toContain('startAliveBeat();');
    expect(app).toContain('setAliveBeatContext(');
    const src = read('app', 'diagnostics', 'aliveBeat.ts');
    expect(src).not.toContain('useGameStore');
    expect(src).not.toContain('setState');
    expect(src).toContain('export const ALIVE_BEAT_MS = 3_000;');
    expect(ALIVE_BEAT_MS).toBe(3000);
  });

  it('⚠⚠⚠ a title-screen reclaim is classified as one, and is not fatal', () => {
    const src = read('app', 'state', 'slices', 'bootSlice.ts');
    expect(src).toContain("const onTitle = crumb.screen === 'title' || crumb.screen === 'character_creation';");
    expect(src).toContain('|| onTitle;');
    expect(src).toContain("${crumb.screen === 'title' ? 'title' : 'character-creation'} screen");
    expect(src).toContain('isFatal: !idle,');
  });

  it('⚠⚠ the OTA teardown names which component came back and which did not', () => {
    const src = read('app', 'updates', 'checkAndApplyOTA.ts');
    expect(src).toContain('ota:teardown:${label}:${outcome}');
    expect(src).toContain("mark('complete')");
    expect(src).toContain("mark('timeout')");
    expect(src).toContain("mark('failed')");
    // ⚠ and the apply order / deadlines are untouched
    expect(src).toContain("disposeWithDeadline('disposeAudio', disposeAudio()),");
    expect(src).toContain("disposeWithDeadline('shutdownQwen', useGameStore.getState().shutdownQwen()),");
    expect(src).toContain("stampOtaPhase('ota:teardown:done', otaContextTag());");
  });

  it('⚠ the native crash verdict is asked again once when the SDK has not resolved yet', () => {
    const app = read('App.tsx');
    expect(app).toContain('let verdict = await st.nativeSdkSawCrashLastRun();');
    expect(app).toContain('if (verdict === null) {');
    expect(app).toContain('verdict = await st.nativeSdkSawCrashLastRun();');
    // and the REASON is still recorded either way
    expect(app).toContain('native-sdk verdict: ${st.nativeSdkVerdictReason()}');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. BLOCKED INPUT EXPLAINS ITSELF
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — a typed action refused by a pending roll says so', () => {
  it('⚠⚠⚠ the refusal is spoken, the roll keeps its authority, and nothing settles twice', async () => {
    await boot();
    // stage a real pending roll through the engine
    S().submitPlayerAction('search the rubble');
    await tick(30);
    if (!S().pendingRolls) {
      useGameStore.setState({ pendingRolls: {
        steps: [{ kind: 'skill', label: 'probe', dc: 10, count: 1 }], currentStep: 0, results: [],
      } } as never);
    }
    const rollBefore = S().pendingRolls;
    expect(rollBefore).toBeTruthy();
    const n0 = S().gameLog.length;
    const hpBefore = S().player!.hp;
    S().submitPlayerAction('attack the raider');
    await tick(5);
    const fresh = S().gameLog.slice(n0).map((e) => e.text);
    expect(fresh.some((t) => /Settle the roll first/.test(t))).toBe(true);
    // the guard still holds: no action ran, the roll is untouched
    expect(S().pendingRolls).toBe(rollBefore);
    expect(S().player!.hp).toBe(hpBefore);
  });

  it('⚠ an empty submit is still silent — only a real command gets a refusal', async () => {
    await boot();
    useGameStore.setState({ pendingRolls: {
      steps: [{ kind: 'skill', label: 'probe', dc: 10, count: 1 }], currentStep: 0, results: [],
    } } as never);
    const n0 = S().gameLog.length;
    S().submitPlayerAction('   ');
    await tick(5);
    expect(S().gameLog.length).toBe(n0);
  });

  it('⚠⚠ and once the roll settles the same command runs normally', async () => {
    await boot();
    S().submitPlayerAction('search the rubble');
    await tick(30);
    let guard = 0;
    while (S().pendingRolls && guard++ < 20) {
      const pr = S().pendingRolls!;
      const st = pr.steps[pr.currentStep]!;
      S().resolveRollStep(Array.from({ length: st.count ?? 1 }, () => 14));
    }
    await tick(20);
    expect(S().pendingRolls).toBeFalsy();
    const n0 = S().gameLog.length;
    S().submitPlayerAction('look around');
    await tick(30);
    const fresh = S().gameLog.slice(n0).map((e) => e.text);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.some((t) => /Settle the roll first/.test(t))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. THE ALLOCATION CANDIDATE, RE-CHECKED
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1741 — the repeated-allocation candidate no longer exists', () => {
  it('⚠ allLocations is a module constant in both readers, and the allow-list is cached', () => {
    for (const f of [['app', 'ai', 'narration.ts'], ['app', 'state', 'gameStore.ts']]) {
      const src = read(...f);
      expect(src).toContain('const allLocations = locationsData as Location[];');
    }
    const nar = read('app', 'ai', 'narration.ts');
    expect(nar).toContain('let _narrationAllowStatic: Set<string> | null = null;');
    expect(nar).toContain('if (_narrationAllowStatic) return _narrationAllowStatic;');
  });
});
