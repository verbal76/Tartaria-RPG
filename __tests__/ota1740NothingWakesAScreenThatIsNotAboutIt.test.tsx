/**
 * OTA-1740 — NOTHING WAKES A SCREEN THAT IS NOT ABOUT IT (LAG-2-5E91).
 *
 * Fable's 91C4B8 audit measured the infrastructure around the game rather than
 * the game: a world heartbeat that re-rendered four screens the player was not
 * looking at, an action that swept every mounted subscriber once per log line,
 * a counter that re-priced a 250-item pack whenever anything at all changed,
 * and a tap ledger that woke the whole store to write a line the feed hides.
 *
 * Five repairs, no gameplay change:
 *   1. the 6s `worldRealtimeTick` reaches a screen only through the fields that
 *      screen actually reads (and, where the field is realtime, through the
 *      DERIVED value it draws — a war-heat number, a tide label);
 *   2. the log lines one action produces are one subscriber sweep, not one
 *      each — state stays synchronous, only the notification is folded in;
 *   3. the vendor's whole-inventory projections are memoized against the
 *      inputs that can actually move a price;
 *   4. the ordinary tap ledger writes to the disk log, not the game store —
 *      the synchronous crash breadcrumb is untouched;
 *   5. the pack's rows are memoized and its search → sort → group pipeline
 *      runs once per real change instead of once per render.
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

import React, { Profiler } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore, logUiTap } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { WEAPONS, ARMOR } from '../app/engine/crafting';
import { ExplorationScreen } from '../app/screens/ExplorationScreen';
import { InventoryScreen } from '../app/screens/InventoryScreen';
import { VendorScreen } from '../app/screens/VendorScreen';
import { ContractsScreen } from '../app/screens/ContractsScreen';
import { CharacterScreen } from '../app/screens/CharacterScreen';
import { flushLogWrites, peekLiveBreadcrumb, readFullLog, setActiveSlot } from '../app/engine/saveSystem';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(240000);
const S = () => useGameStore.getState();
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* already gone */ } });
  }
});

async function boot(): Promise<void> {
  await S().hydrate();
  await S().startNewGame({ name: 'Lag2', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  S().skipTutorial?.();
  if (S().storyIntro) S().dismissStoryIntro();
  await flush();
}

/** A pack the size the owner actually carries. */
function inflate(items: number): void {
  const p = S().player!;
  const inv: InventoryItem[] = [...p.inventory];
  const rows = [...WEAPONS, ...ARMOR];
  for (let i = 0; i < items; i++) {
    const r = rows[i % rows.length]!;
    inv.push({
      id: `bulk_${i}`, name: r.name,
      kind: (r as { kind?: string }).kind === 'armor' ? 'armor' : 'weapon',
      rarity: 'Common', quantity: 1,
      tags: [...((r as { tags?: string[] }).tags ?? ['weapon'])],
      durability: { current: 12, max: 20 },
    } as unknown as InventoryItem);
  }
  useGameStore.setState({ player: { ...p, inventory: inv, tc: 9000 } as PlayerCharacter } as never);
}

const VENDOR = {
  id: 'v_lag2', name: 'Duvo', title: 'trader', faction: 'silt_wardens',
  offers: [{ itemName: 'Rope', price: 10, quantity: 2 }, { itemName: 'Trail Rations', price: 4, quantity: 5 }],
};
function stallOpen(): void {
  useGameStore.setState({ currentScene: { ...S().currentScene!, vendor: VENDOR, enemies: [], enemyHps: [] } } as never);
}

/** One heartbeat that moves ONLY realtime fields no screen below consumes. */
function inertHeartbeat(): void {
  useGameStore.setState((s) => ({ worldMemory: {
    ...s.worldMemory,
    worldRealtimeTicks: (s.worldMemory.worldRealtimeTicks ?? 0) + 1,
    worldEvents: [...(s.worldMemory.worldEvents ?? [])],
    recentRaids: [...(s.worldMemory.recentRaids ?? [])],
    patrols: [...(s.worldMemory.patrols ?? [])],
  } }) as never);
}

let commits = 0;
const onRender = () => { commits++; };
async function mountCounted(screen: string, el: React.ReactElement) {
  useGameStore.setState({ currentScreen: screen } as never);
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<Profiler id={screen} onRender={onRender}>{el}</Profiler>); });
  mounted.push(tree);
  await flush();
  commits = 0;
  return tree;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. THE 6-SECOND WORLD HEARTBEAT DOES NOT REACH A SCREEN THAT DOES NOT READ IT
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1740 — the heartbeat only wakes what it feeds', () => {
  it('⚠⚠⚠ five heartbeats that move no consumed field render NOTHING on any of the five screens', async () => {
    await boot();
    inflate(258);
    stallOpen();
    await flush();
    for (const [screen, el] of [
      ['exploration', <ExplorationScreen key="e" />],
      ['vendor', <VendorScreen key="v" />],
      ['contracts', <ContractsScreen key="c" />],
      ['character', <CharacterScreen key="h" />],
      ['inventory', <InventoryScreen key="i" />],
    ] as Array<[string, React.ReactElement]>) {
      const tree = await mountCounted(screen, el);
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-await-in-loop
        await renderer.act(async () => { inertHeartbeat(); });
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }
      expect({ screen, commits }).toEqual({ screen, commits: 0 });
      await renderer.act(async () => { tree.unmount(); });
      mounted.pop();
    }
  });

  it('⚠⚠ but a world change the screen DOES read still redraws it', async () => {
    await boot();
    await mountCounted('exploration', <ExplorationScreen />);
    await renderer.act(async () => {
      useGameStore.setState((s) => ({ worldMemory: {
        ...s.worldMemory,
        visitedRooms: { ...(s.worldMemory.visitedRooms ?? {}), lag2_probe_room: { searchedAmbientNouns: ['stone'] } },
      } }) as never);
    });
    await flush();
    expect(commits).toBeGreaterThan(0);
  });

  it('⚠ no screen subscribes to the whole worldMemory except the two that display it', () => {
    const WHOLE = /useGameStore\(\((?:s|st)\) => \1?\.?worldMemory\)/;
    for (const f of ['ExplorationScreen', 'VendorScreen', 'ContractsScreen', 'CharacterScreen', 'InventoryScreen']) {
      const src = read('app', 'screens', `${f}.tsx`);
      expect([f, /useGameStore\(\(s\) => s\.worldMemory\)/.test(src)]).toEqual([f, false]);
      expect(WHOLE.test(src)).toBe(false);
    }
    // GiftModal is mounted by ExplorationScreen on every render — it counts too.
    expect(/useGameStore\(\(s\) => s\.worldMemory\)/.test(read('app', 'components', 'GiftModal.tsx'))).toBe(false);
    // The war board is the screen the heartbeat is FOR; it keeps its subscription.
    expect(/useGameStore\(\(s\) => s\.worldMemory\)/.test(read('app', 'screens', 'WorldScreen.tsx'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ONE ACTION'S LOG LINES ARE ONE SUBSCRIBER SWEEP
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1740 — logging six lines is not six subscriber sweeps', () => {
  it('⚠⚠⚠ six appendLog calls in one turn notify ONCE, in exact order', async () => {
    await boot();
    let notifies = 0;
    const unsub = useGameStore.subscribe(() => { notifies++; });
    const n0 = S().gameLog.length;
    // ⚠ `combat`, not `world`/`system`: those two carry HANDOFF #4's same-channel
    // 500ms merge, which would weld the six into one entry and hide the ordering
    // this test exists to prove. Nothing about the merge changed here.
    for (let i = 0; i < 6; i++) S().appendLog('combat', `lag2 line ${i}`);
    expect(notifies).toBe(0); // nothing has swept yet — the turn is still running
    await new Promise((r) => setTimeout(r, 5));
    unsub();
    expect(notifies).toBe(1);
    const texts = S().gameLog.slice(n0).map((e) => e.text);
    expect(texts.join('|')).toContain('lag2 line 0');
    expect(texts.join('|')).toContain('lag2 line 5');
    expect(texts.findIndex((t) => t.includes('lag2 line 0')))
      .toBeLessThan(texts.findIndex((t) => t.includes('lag2 line 5')));
  });

  it('⚠⚠ the STATE is synchronous — the dedup guards that read gameLog mid-turn still see the line', async () => {
    await boot();
    const n0 = S().gameLog.length;
    S().appendLog('combat', 'lag2 sync visibility probe');
    // read it back in the SAME synchronous turn, exactly as ~30 guards in the
    // store do ("have I already said this line?")
    expect(S().gameLog.slice(n0).some((e) => e.text === 'lag2 sync visibility probe')).toBe(true);
  });

  it('⚠⚠ nothing is suppressed: an ordinary mutation between two log lines still notifies, and carries them', async () => {
    await boot();
    const seen: Array<{ tc: number; logLen: number }> = [];
    const unsub = useGameStore.subscribe((s) => { seen.push({ tc: s.player?.tc ?? -1, logLen: s.gameLog.length }); });
    const before = S().gameLog.length;
    S().appendLog('combat', 'lag2 before the mutation');
    useGameStore.setState({ player: { ...S().player!, tc: 4242 } } as never);
    S().appendLog('combat', 'lag2 after the mutation');
    // The gameplay write swept, and the log line before it rode along.
    expect(seen.length).toBe(1);
    expect(seen[0]!.tc).toBe(4242);
    expect(seen[0]!.logLen).toBeGreaterThan(before);
    await new Promise((r) => setTimeout(r, 5));
    unsub();
    // ...and the trailing line got its own sweep at the end of the turn.
    expect(seen.length).toBe(2);
    expect(S().gameLog.some((e) => e.text === 'lag2 after the mutation')).toBe(true);
  });

  it('⚠⚠ a representative movement step and attack round cost far fewer sweeps', async () => {
    await boot();
    let notifies = 0;
    const unsub = useGameStore.subscribe(() => { notifies++; });
    S().submitPlayerAction('go north');
    const move = notifies;
    await new Promise((r) => setTimeout(r, 200));
    unsub();
    // Measured before this repair: 21 in the synchronous turn. The ceiling is
    // generous on purpose — it is a regression guard, not a benchmark.
    expect(move).toBeLessThanOrEqual(15);
  });

  it('⚠ only the game-log write is marked log-only — a gameplay set is never folded into it', () => {
    const src = read('app', 'state', 'gameStore.ts');
    expect((src.match(/asLogOnlyWrite\(/g) ?? []).length).toBe(1);
    expect(src).toContain('asLogOnlyWrite(() => set((state) => {');
    expect(src).toContain('coalesceLogNotifications((set, get)');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. THE COUNTER STOPS RE-PRICING THE PACK FOR THINGS THAT CANNOT MOVE A PRICE
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1740 — the vendor projections are memoized against their real authorities', () => {
  it('⚠⚠ the three whole-inventory projections are memos, with the pricing inputs as dependencies', () => {
    const src = read('app', 'screens', 'VendorScreen.tsx');
    expect(src).toContain('const reinforceRows = useMemo(');
    expect(src).toContain('const sellable = useMemo(');
    expect(src).toContain('const recipeOffers = useMemo(');
    // the sell projection must depend on every input that moves a sell price
    expect(src).toContain('[player?.inventory, equippedItemIds, vendor, rapportMod, warSellMult, sellSort]');
    expect(src).toContain('[player?.inventory, equippedItemIds]');
    expect(src).toContain('[player?.knownRecipes, vendor]');
    // OTA-022's rule: every hook precedes the `!player || !vendor` return.
    expect(src.indexOf('const sellable = useMemo(')).toBeLessThan(src.indexOf('if (!player || !vendor) {'));
  });

  it('⚠⚠⚠ prices and options never go stale: inventory, TC, a sale, a vendor swap — and a heartbeat changes nothing', async () => {
    await boot();
    inflate(20);
    stallOpen();
    await flush();
    const tree = await mountCounted('vendor', <VendorScreen />);
    const shown = () => tree.root.findAll(() => true).map(textOf).join('\n');

    // an inventory mutation reaches the REINFORCE projection
    expect(shown()).not.toContain('Lag2 Probe Blade');
    const blade = {
      id: 'lag2_blade', name: 'Lag2 Probe Blade', kind: 'weapon', rarity: 'Common', quantity: 1,
      tags: ['weapon'], durability: { current: 9, max: 20 },
    } as unknown as InventoryItem;
    await renderer.act(async () => {
      useGameStore.setState({ player: { ...S().player!, inventory: [...S().player!.inventory, blade] } } as never);
    });
    await flush();
    expect(shown()).toContain('Lag2 Probe Blade');

    // a TC change reaches the purse line
    await renderer.act(async () => {
      useGameStore.setState({ player: { ...S().player!, tc: 1234 } } as never);
    });
    await flush();
    expect(shown()).toContain('1234');

    // removing the instance removes its row
    await renderer.act(async () => {
      useGameStore.setState({ player: {
        ...S().player!, inventory: S().player!.inventory.filter((i) => i.id !== 'lag2_blade'),
      } } as never);
    });
    await flush();
    expect(shown()).not.toContain('Lag2 Probe Blade');

    // swapping the vendor rebuilds the counter
    await renderer.act(async () => {
      useGameStore.setState({ currentScene: { ...S().currentScene!, vendor: {
        ...VENDOR, id: 'v_other', name: 'Halem', offers: [{ itemName: 'Lantern Oil', price: 6, quantity: 3 }],
      } } } as never);
    });
    await flush();
    expect(shown()).toContain('Halem');

    // and a heartbeat that moves nothing the counter charges by changes nothing
    const before = shown();
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      await renderer.act(async () => { inertHeartbeat(); });
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
    expect(shown()).toBe(before);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. THE ORDINARY TAP LEDGER IS OFF THE GAME STORE, THE BREADCRUMB IS NOT
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1740 — a tap records itself without waking the game store', () => {
  it('⚠⚠⚠ logUiTap notifies no subscriber and adds no in-memory entry', async () => {
    await boot();
    await setActiveSlot('ota1740_tap');
    let notifies = 0;
    const unsub = useGameStore.subscribe(() => { notifies++; });
    const before = S().gameLog.length;
    logUiTap('lag2 probe control');
    await new Promise((r) => setTimeout(r, 5));
    unsub();
    expect(notifies).toBe(0);
    expect(S().gameLog.length).toBe(before);
  });

  it('⚠⚠ the evidence is intact: the line is on the disk log and the breadcrumb is stamped synchronously', async () => {
    await boot();
    await setActiveSlot('ota1740_tap2');
    logUiTap('lag2 evidence control');
    // the crash breadcrumb must be readable the instant the tap returns — no
    // promise, no batching. This is what a wedged JS thread cannot swallow.
    expect(peekLiveBreadcrumb()?.what).toBe('tap "lag2 evidence control"');
    await flushLogWrites();
    expect(await readFullLog()).toContain('[debug] ui: tap "lag2 evidence control"');
  });

  it('⚠ the tap is still recorded BEFORE the handler, and through the persist sink appendLog uses', () => {
    const src = read('app', 'state', 'gameStore.ts');
    const fn = src.slice(src.indexOf('export function logUiTap('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('persistEntry(makeEntry(\'debug\'');
    expect(body).toContain('takeTouchLateSuffix()');
    expect(body).toContain('stampLiveBreadcrumb(');
    // the ledger write precedes the breadcrumb, and neither goes near appendLog
    expect(body.indexOf('persistEntry(')).toBeLessThan(body.indexOf('stampLiveBreadcrumb('));
    expect(body).not.toContain('appendLog(');
    // and the ledger call sites still run before their handler
    const input = read('app', 'components', 'InputBox.tsx');
    expect(input).toContain('logUiTap(label)');
  });

  it('⚠⚠ the handler still runs: a QuickBtn press reaches the store', async () => {
    await boot();
    await mountCounted('exploration', <ExplorationScreen />);
    const before = S().gameLog.length;
    const btn = (mounted[mounted.length - 1] as unknown as { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }).root
      .findAll((n) => typeof n.props?.onPress === 'function'
        && n.props?.accessibilityRole === 'button'
        && /LOOK|SEARCH|WAIT/i.test(textOf(n)));
    expect(btn.length).toBeGreaterThan(0);
    await renderer.act(async () => { (btn[0]!.props.onPress as () => void)(); });
    await flush();
    expect(S().gameLog.length).toBeGreaterThan(before);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. THE PACK SCALES
// ═════════════════════════════════════════════════════════════════════════════

describe('OTA-1740 — a 250-row pack is not rebuilt for every render', () => {
  it('⚠⚠ the row is memoized and its two handlers are stable across renders', () => {
    const src = read('app', 'screens', 'InventoryScreen.tsx');
    expect(src).toContain('const ItemRow = React.memo(function ItemRow({');
    expect(src).toContain('const handleItemTap = useCallback((item: InventoryItem) => {');
    expect(src).toContain('const handleItemLongPress = useCallback((item: InventoryItem) => {');
    // handed to the row by identity, not as a fresh closure per row per render
    expect(src).toContain('onPress={handleItemTap}');
    expect(src).toContain('onLongPress={handleItemLongPress}');
    // the whole search → filter → sort → group pipeline is one memo, and it sits
    // ABOVE the `!player` guard so the hook count cannot change between renders
    expect(src).toContain('const { sorted, grouped } = useMemo(() => {');
    expect(src.indexOf('const { sorted, grouped } = useMemo(() => {'))
      .toBeLessThan(src.indexOf('if (!player) {'));
  });

  for (const n of [50, 100, 258]) {
    it(`⚠⚠ ${n} rows: the pack renders, the rows act, and a mutation lands`, async () => {
      await boot();
      inflate(n);
      await flush();
      const tree = await mountCounted('inventory', <InventoryScreen />);
      // open every category so the rows are genuinely on screen
      // ⚠ a TouchableOpacity is found TWICE (composite + host node) with the same
      // props, and pressing both would toggle each section open then shut again.
      const seen = new Set<string>();
      const headers = tree.root.findAll((x) => typeof x.props?.onPress === 'function'
        && typeof (x.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded === 'boolean')
        .filter((x) => { const t = textOf(x); if (seen.has(t)) return false; seen.add(t); return true; });
      expect(headers.length).toBeGreaterThan(0);
      await renderer.act(async () => { for (const h of headers) (h.props.onPress as () => void)(); });
      await flush();
      const all = tree.root.findAll(() => true).map(textOf).join('\n');
      const anyItem = S().player!.inventory[0]!;
      expect(all).toContain(anyItem.name);

      // an inventory mutation reaches the list. A WEAPON, so it lands in a
      // section the loop above opened — this asserts the pipeline memo saw the
      // new inventory, not which sections happen to be expanded.
      await renderer.act(async () => {
        useGameStore.setState({ player: { ...S().player!, inventory: [
          ...S().player!.inventory,
          { id: 'lag2_new_row', name: 'Lag2 Beacon', kind: 'weapon', rarity: 'Common', quantity: 1,
            tags: ['weapon'], durability: { current: 5, max: 10 } } as unknown as InventoryItem,
        ] } } as never);
      });
      await flush();
      expect(tree.root.findAll(() => true).map(textOf).join('\n')).toContain('Lag2 Beacon');

      // and a row still opens its sheet
      const rows = tree.root.findAll((x) => typeof x.props?.onPress === 'function'
        && typeof x.props?.onLongPress === 'function'
        && String(x.props?.accessibilityRole ?? '') === 'button');
      expect(rows.length).toBeGreaterThan(0);
      await renderer.act(async () => { (rows[0]!.props.onPress as () => void)(); });
      await flush();
      expect(tree.root.findAll(() => true).map(textOf).join('\n')).toContain('CLOSE');
    });
  }
});
