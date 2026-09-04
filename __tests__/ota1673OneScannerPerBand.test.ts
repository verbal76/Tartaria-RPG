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

// OTA-1673 — ONE SCANNER PER BAND, CASTS BY THE HANDFUL, AND THE MENU STAYS OPEN.
//
// Owner, three things in one message: *"the pulse mud and etheric scanners —
// once you build one and have one that's in the pouch, it should not be
// buildable again. Under the etheric tab under crafting the … Stone
// manipulation should have a plus and minus button so you can do more than one
// at a time. It should also have the max button there as well, cuz every time
// you do one it kicks you back out of crafting to the exploration screen. You
// should be staying in crafting once you're done."*
//
// ⚠⚠ THE SCANNER RULE READS A PROPERTY, NOT THREE NAMES. `effect.kind ===
// 'scanner'` in exploration.json: an off-hand reader, one slot, one band. A
// second copy cannot be equipped and reads nothing the first does not. A
// hardcoded list of the three would go stale the moment a fourth is authored —
// the same shape as OTA-1603's dog-armour drift.
//
// ⚠ AND IT IS PER BAND. Pulse reads Sentinel tech, aetheric reads pre-flood
// phenomena, mud reads what the flood buried. Owning one must never block
// building another.
//
// ⚠⚠⚠ THE BATCH STOP-TEST IS THE PART THAT NEARLY SHIPPED WRONG, and it is
// pinned hardest for that reason. My first draft compared a fuel fingerprint
// before and after each pass and stopped when nothing moved. A probe caught it:
// a shape cast with fuel but NO Small Rock still BURNS the fuel, so the
// fingerprint moved, the loop ran on, and asking for 5 casts with 3 rocks rolled
// five times — spending two Aether Residue on attempts that could not produce
// anything, and reporting nothing wrong. The test now asks whether the NEXT cast
// can finish, and names what ran out.

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { oneToAPackRefusal, isOneToAPackTool, packAlreadyHolds } from '../app/engine/oneToAPack';
import { RECIPES } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const ROOT = join(__dirname, '..');
const code = (s: string): string => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const SCREEN = code(readFileSync(join(ROOT, 'app', 'screens', 'CraftingScreen.tsx'), 'utf8'));

const item = (name: string, quantity = 1): InventoryItem =>
  ({ id: `i-${name}-${quantity}`, name, kind: 'misc', quantity, tags: [] } as never as InventoryItem);

const SCANNERS = ['Pulse Scanner', 'Aetheric Scanner', 'Mud Scanner'];

describe('OTA-1673 — ⚠⚠ a scanner you already carry is not buildable again', () => {
  it('every scanner reads as a one-to-a-pack tool, and ordinary things do not', () => {
    for (const n of SCANNERS) {
      expect({ n, tool: isOneToAPackTool(n) }).toEqual({ n, tool: true });
    }
    // The rule must stay narrow: fuel, materials and gear are not one-per-pack.
    for (const n of ['Aether Crystal', 'Small Rock', 'Scrap Metal', 'Zzz Unlisted Thing']) {
      expect({ n, tool: isOneToAPackTool(n) }).toEqual({ n, tool: false });
    }
  });

  it('⚠⚠⚠ holding one refuses the rebuild — and holding none does not', () => {
    for (const n of SCANNERS) {
      expect({ n, held: !!oneToAPackRefusal(n, [item(n)]) }).toEqual({ n, held: true });
      expect({ n, empty: oneToAPackRefusal(n, []) }).toEqual({ n, empty: null });
    }
  });

  it('⚠ owning ONE band never blocks another — the three read different things', () => {
    // If this ever inverts, building the full set becomes impossible and the
    // rule turns from a courtesy into a wall.
    expect(oneToAPackRefusal('Aetheric Scanner', [item('Mud Scanner'), item('Pulse Scanner')])).toBeNull();
  });

  it('a spent husk is not a scanner you own', () => {
    // quantity 0 rows survive some consume paths; counting one as "held" would
    // refuse a rebuild the player genuinely needs.
    expect(packAlreadyHolds('Mud Scanner', [item('Mud Scanner', 0)])).toBe(false);
    expect(oneToAPackRefusal('Mud Scanner', [item('Mud Scanner', 0)])).toBeNull();
  });

  it('⚠⚠ the refusal SPEAKS, and names the reason rather than the shortfall', () => {
    // B15. And the reason has to be the true one: "you already carry one" is a
    // better answer than "you're short 3 Aether Crystal", which is what the
    // ingredient check below it would have said.
    const said = oneToAPackRefusal('Pulse Scanner', [item('Pulse Scanner')]) ?? '';
    expect(said.includes('already')).toBe(true);
    expect(said.includes('Pulse Scanner')).toBe(true);
  });

  it('⚠ the guard cannot throw a craft away — it fails OPEN', () => {
    expect(() => oneToAPackRefusal('', undefined)).not.toThrow();
    expect(oneToAPackRefusal('', undefined)).toBeNull();
    expect(oneToAPackRefusal('Pulse Scanner', undefined)).toBeNull();
  });

  it('the three scanners really are craftable — this suite is not guarding nothing', () => {
    const results = RECIPES.map((r) => r.result);
    for (const n of SCANNERS) {
      expect({ n, hasRecipe: results.includes(n) }).toEqual({ n, hasRecipe: true });
    }
  });
});

describe('OTA-1673 — ⚠⚠⚠ casts come in handfuls, and stop when they cannot finish', () => {
  const arm = async (residue: number, rocks: number) => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'V', raceId: 'mud_golem', factionId: 'eternal_dynasty' });
    store.getState().skipTutorial?.();
    store.setState((s) => (s.player ? {
      player: {
        ...s.player,
        // High INT so the d20 cannot fail and turn a batch-size test into a
        // luck test — this measures how many casts RUN, not how many land.
        stats: { ...s.player.stats, intelligence: 30 },
        inventory: [item('Aether Residue', residue), item('Small Rock', rocks)],
      },
    } : s));
    return store;
  };
  const qty = (store: typeof useGameStore, n: string) => (store.getState().player?.inventory ?? [])
    .filter((i) => i.name === n).reduce((s, i) => s + i.quantity, 0);
  const rollsSince = (store: typeof useGameStore, from: number) => store.getState().gameLog
    .slice(from).map((l) => l.text).filter((t) => t.includes('Aetherstone Manipulation — d20')).length;

  it('five casts with fuel and rocks for five run five times', async () => {
    const store = await arm(5, 5);
    const at = store.getState().gameLog.length;
    store.getState().submitPlayerAction('shape stone', { castCount: 5 } as never);
    expect(rollsSince(store, at)).toBe(5);
    expect(qty(store, 'Shaped Aetheric Shard')).toBe(5);
  });

  it('⚠⚠⚠ five casts with only THREE rocks run THREE times, not five', async () => {
    // The defect my first draft shipped past. Two extra rolls would have burned
    // two Aether Residue producing nothing at all, quietly.
    const store = await arm(5, 3);
    const at = store.getState().gameLog.length;
    store.getState().submitPlayerAction('shape stone', { castCount: 5 } as never);
    expect(rollsSince(store, at)).toBe(3);
    expect(qty(store, 'Shaped Aetheric Shard')).toBe(3);
    // ⚠ AND THE FUEL THAT COULD NOT BE USED IS STILL THERE. This is the
    // assertion that actually catches the regression: the roll count could be
    // right while the fuel was spent anyway.
    expect(qty(store, 'Aether Residue')).toBe(2);
  });

  it('⚠⚠ and it SAYS how far it got and what ran out', async () => {
    const store = await arm(5, 3);
    const at = store.getState().gameLog.length;
    store.getState().submitPlayerAction('shape stone', { castCount: 5 } as never);
    const said = store.getState().gameLog.slice(at).map((l) => l.text).join('\n');
    expect(said.includes('That is 3 of 5')).toBe(true);
    expect(said.includes('Small Rock')).toBe(true);
  });

  it('⚠ a batch that runs in full says nothing extra — no line where there is no news', async () => {
    const store = await arm(5, 5);
    const at = store.getState().gameLog.length;
    store.getState().submitPlayerAction('shape stone', { castCount: 5 } as never);
    expect(store.getState().gameLog.slice(at).map((l) => l.text).join('\n').includes('That is')).toBe(false);
  });

  it('no count at all still means exactly one cast — every older caller is unchanged', async () => {
    const store = await arm(5, 5);
    const at = store.getState().gameLog.length;
    store.getState().submitPlayerAction('shape stone');
    expect(rollsSince(store, at)).toBe(1);
  });
});

describe('OTA-1673 — ⚠⚠ the aetheric tab stops throwing you out', () => {
  it('the discipline confirm no longer leaves for exploration', () => {
    // ⚠ It was the LAST surface doing this: an ordinary craft has stayed put
    // since OTA-983, and only the disciplines still bounced. Sliced to the
    // confirm so a legitimate setScreen elsewhere on the file (BACK, the refusal
    // modal's CLOSE MENU) does not make this pass or fail by accident.
    const start = SCREEN.indexOf('visible={disciplineConfirm !== null}');
    const branch = SCREEN.slice(start, SCREEN.indexOf('onRequestClose={() => setDisciplineConfirm(null)}', start));
    expect(start).toBeGreaterThan(-1);
    expect(branch.includes("setScreen('exploration')")).toBe(false);
    // …and it reports the haul the same way a craft does, from the same helper.
    expect(branch.includes('computeInventoryDelta(preInv, post)')).toBe(true);
    expect(branch.includes('setCraftResult(delta)')).toBe(true);
  });

  it('⚠ the count rides the action rather than looping the verb', () => {
    // The OTA-1633 rule. Looping submitPlayerAction N times would be N parses,
    // N Arbiter remarks, N cognitive evals and N persists for one thumb tap.
    const start = SCREEN.indexOf('visible={disciplineConfirm !== null}');
    const branch = SCREEN.slice(start, SCREEN.indexOf('onRequestClose={() => setDisciplineConfirm(null)}', start));
    expect(branch.includes('submitPlayerAction(phrase, { castCount: n })')).toBe(true);
  });

  it('⚠⚠ MAX is bounded by BOTH costs, not just the fuel', () => {
    // A shape spends one fuel AND one Small Rock. A MAX counting only fuel would
    // offer casts that fizzle — which is the same promise-you-cannot-keep the
    // engine stop-test above refuses to make.
    expect(SCREEN.includes('Math.min(fuel, rocks)')).toBe(true);
  });

  it('⚠ the picker resets to 1 each time it opens', () => {
    // A ×9 inherited from the previous card is how somebody spends nine crystals
    // meaning to spend one.
    expect(SCREEN.includes('if (disciplineConfirm !== null) setCastCount(1);')).toBe(true);
  });

  it('a technique gets no stepper — a corruption dose per channel is not batched', () => {
    expect(SCREEN.includes('disciplineConfirm && !disciplineConfirm.technique')).toBe(true);
  });
});
