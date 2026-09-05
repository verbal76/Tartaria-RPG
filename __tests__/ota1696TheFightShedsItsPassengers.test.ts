jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

/**
 * OTA-1696 — THE FIGHT SHEDS ITS PASSENGERS. The 13:32 bundle (#mtof9i1d5eoj,
 * stamp 1690): seven freeze-watch stalls in a three-minute five-raider fight,
 * each right after a DODGE / APPROACH / attack, the JS thread 2.5–5.2s late
 * while frames kept coming, the engine's own lines 70–150ms apart, the MiniLM
 * classifier at 0.4–7.4s against its usual 0.35s. Two loads ride every combat
 * tap — an eight-thread onnxruntime pool for a mood tag, and a feed of up to
 * five hundred rich rows re-mapped on every log line. Four levers, two clocks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { cognitionSkippedInCombat, COGNITION_SKIP_CONFIDENCE } from '../app/ai/cognitionGate';
import { renderLagAfterEngine, RENDER_SLOW_MS } from '../app/diagnostics/renderClock';
import { readHermesStats, hermesDeltaLine } from '../app/diagnostics/runtimePressure';
import { FEED_WINDOW } from '../app/components/AdventureFeed';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1696 — the classifier gate', () => {
  it('skips a confident action with hostiles on the field; runs for free text, and for everything outside a fight', () => {
    expect(COGNITION_SKIP_CONFIDENCE).toBe(0.9);
    expect(cognitionSkippedInCombat(5, 1)).toBe(true);
    expect(cognitionSkippedInCombat(1, 0.9)).toBe(true);
    expect(cognitionSkippedInCombat(1, 0.89)).toBe(false); // "I try to swim the canal" mid-fight still gets its read
    expect(cognitionSkippedInCombat(0, 1)).toBe(false);
    expect(cognitionSkippedInCombat(0, 0.2)).toBe(false);
  });

  it('the store calls it on the dispatch condition and the OTA-1359 stamps keep their order inside it', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const cond = "if (!scriptedTutorial && get().cognitiveStatus === 'ready' && !cognitionSkippedInCombat(currentScene.enemies.length, parsed.confidence)) {";
    expect(store.includes(cond)).toBe(true);
    const at = store.indexOf(cond);
    const b = store.indexOf("stampBreadcrumbPhase('cognitive-dispatch');", at);
    const call = store.indexOf('.processInput(trimmed, worldCtx)', at);
    const c = store.indexOf("stampBreadcrumbPhase('cognitive-dispatched');", at);
    expect(b).toBeGreaterThan(at);
    expect(call).toBeGreaterThan(b);
    expect(c).toBeGreaterThan(call);
    expect(store.split('\n').length).toBeLessThan(37000);
  });

  it('the classifier session keeps two cores, on both create sites, through an option the JSI binding parses', () => {
    const svc = src('app', 'ai', 'embedding', 'SemanticEmbeddingService.ts');
    expect(svc.includes('export const COGNITION_SESSION_OPTIONS: ort.InferenceSession.SessionOptions = { intraOpNumThreads: 2, interOpNumThreads: 1 };')).toBe(true);
    expect(svc.includes('ort.InferenceSession.create(modelPath, COGNITION_SESSION_OPTIONS)')).toBe(true);
    expect(svc.includes('ort.InferenceSession.create(path, COGNITION_SESSION_OPTIONS)')).toBe(true);
    expect(/InferenceSession\.create\((modelPath|path)\)/.test(svc)).toBe(false);
    const cpp = src('node_modules', 'onnxruntime-react-native', 'cpp', 'SessionUtils.cpp');
    expect(cpp.includes('options.hasProperty(runtime, "intraOpNumThreads")')).toBe(true);
    expect(cpp.includes('sessionOptions.SetIntraOpNumThreads(numThreads);')).toBe(true);
  });
});

describe('OTA-1696 — the feed', () => {
  const feed = src('app', 'components', 'AdventureFeed.tsx');

  it('keeps a bounded window of memoised rows, keyed on stable inputs', () => {
    expect(FEED_WINDOW).toBe(150);
    expect(feed.includes("const visible = entries.filter((e) => !HIDDEN_CHANNELS.has(e.channel)).slice(-FEED_WINDOW);")).toBe(true);
    expect(feed.includes('const FeedRow = React.memo(function FeedRow({ entry, names }: { entry: GameLogEntry; names: string[] }) {')).toBe(true);
    expect(feed.includes('{visible.map((entry) => <FeedRow key={entry.id} entry={entry} names={names} />)}')).toBe(true);
    // The enemy-name list is keyed on its contents, not the array the screen rebuilds every render.
    expect(feed.includes("const names = useMemo(() => (namesKey ? namesKey.split('\\u0000') : []), [namesKey]);")).toBe(true);
    // Nothing that rendered before stopped rendering: the four row shapes are all inside the row.
    const row = feed.slice(feed.indexOf('const FeedRow = React.memo('), feed.indexOf('export function AdventureFeed('));
    expect(row.includes("outcome === 'player_dmg'")).toBe(true);
    expect(row.includes("outcome === 'enemy_miss'")).toBe(true);
    expect(row.includes('isStoryBeat')).toBe(true);
    expect(row.includes('renderBodyWithEnemyHighlight(entry.text, color, names)')).toBe(true);
    // The trailing chips stay OUTSIDE the map (OTA-1457's structural rule).
    expect(feed.indexOf('testID="feed-action-chip"')).toBeGreaterThan(feed.indexOf('<FeedRow key={entry.id}'));
  });
});

describe('OTA-1696 — the render clock', () => {
  it('measures the first commit after engine-done once, and only speaks past the threshold', () => {
    expect(RENDER_SLOW_MS).toBe(300);
    const crumb = { phase: 'engine-done', phaseAt: 10_000 };
    expect(renderLagAfterEngine(crumb, 0, 500, 13_210)).toEqual({ measuredAt: 10_000, line: 'render⏱ 3210ms after engine-done · feed 500' });
    expect(renderLagAfterEngine(crumb, 0, 500, 10_120)).toEqual({ measuredAt: 10_000, line: null });
    expect(renderLagAfterEngine(crumb, 0, 500, 10_300)!.line).toBe('render⏱ 300ms after engine-done · feed 500');
    // Same stamp again: already measured, no second reading (the effect runs on every commit).
    expect(renderLagAfterEngine(crumb, 10_000, 500, 20_000)).toBeNull();
    // Not an engine-done crumb, or no crumb: nothing.
    expect(renderLagAfterEngine({ phase: 'rendered', phaseAt: 10_000 }, 0, 500, 13_000)).toBeNull();
    expect(renderLagAfterEngine({ phase: 'engine-done' }, 0, 500, 13_000)).toBeNull();
    expect(renderLagAfterEngine(null, 0, 500, 13_000)).toBeNull();
  });

  it('the exploration screen reads the crumb BEFORE the heartbeat stamps over it, once per stamp', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const read = screen.indexOf('const lag = renderLagAfterEngine(peekLiveBreadcrumb(), renderMeasuredAt.current, gameLog.length);');
    const stamp = screen.indexOf("stampBreadcrumbPhase('rendered');");
    expect(read).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(read);
    expect(screen.includes("if (lag) { renderMeasuredAt.current = lag.measuredAt; if (lag.line) useGameStore.getState().appendLog('debug', lag.line); }")).toBe(true);
  });
});

describe('OTA-1696 — the heap on the stall line', () => {
  const g = globalThis as { HermesInternal?: unknown };
  afterEach(() => { delete g.HermesInternal; });

  it('reads the Hermes counters when they exist and prints the delta; answers nothing when they do not', () => {
    expect(readHermesStats()).toBeNull();
    expect(hermesDeltaLine(null, null)).toBe('');
    g.HermesInternal = { getInstrumentedStats: () => ({ js_heapSize: 48 * 1048576, js_gcTime: 4000, js_numGCs: 7, js_other: 'x' }) };
    const a = readHermesStats();
    expect(a).toEqual({ heapBytes: 48 * 1048576, gcMs: 4000, gcCount: 7 });
    g.HermesInternal = { getInstrumentedStats: () => ({ js_heapSize: 51 * 1048576, js_gcTime: 7120, js_numGCs: 9 }) };
    const b = readHermesStats();
    expect(hermesDeltaLine(a, b)).toBe(' · heap 51MB · gc +3120ms/2');
    // First sample of the process: no previous reading, so no delta is invented.
    expect(hermesDeltaLine(null, b)).toBe(' · heap 51MB · gc +0ms/0');
    // A throwing getter is a missing one.
    g.HermesInternal = { getInstrumentedStats: () => { throw new Error('no'); } };
    expect(readHermesStats()).toBeNull();
  });

  it('the watch samples every tick and rides the delta and the feed size on the stall edge, after the OTA-1634 context', () => {
    const w = src('app', 'diagnostics', 'runtimePressureWatch.ts');
    expect(w.includes('const hermesNow = readHermesStats();')).toBe(true);
    expect(w.includes('hermesAtLastSample = hermesNow;')).toBe(true);
    const ctx = w.indexOf('stallContextLine(crumbAtLastSample, crumbNow, nativeMlSnapshot(), t)');
    const heap = w.indexOf('ctx += `${hermesDeltaLine(hermesAtLastSample, hermesNow)} · feed ${get().gameLog.length}`;');
    expect(ctx).toBeGreaterThan(-1);
    expect(heap).toBeGreaterThan(ctx);
  });
});
