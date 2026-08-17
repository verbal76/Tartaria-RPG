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

// ⚠⚠ OTA-1271 — THE WORKSHOP GETS A DOOR, AND EVERY OUTPOST IS GUARANTEED ONE.
//
// Owner, after being stranded in the workshop cluster typing "why is there no
// exit button": *"the map seemed to have 2 anchor rooms, workshop and another.
// add an exit button there or find a room named after a room that would
// normally have an exit and put it in that room. all outposts should have at
// least 1 exit."*
//
// ⚠⚠ THIS OVERRULES OTA-1194 (PUNCHLIST P11) BY THE SAME AUTHORITY THAT SET IT.
// 1194 restricted EXIT to the gate because exit-everywhere let players leave
// through the armory wall. The owner's new ruling is not exit-everywhere — it
// is exits where a door would BE: the gate keeps `entrance`, the Workshop
// (his named anchor; a working shop has a service door) gains `exterior_door`,
// and `roomIsExit` honours either tag. The chip logic stays data-driven —
// InputBox decides nothing about which rooms have doors.
//
// ⚠ The "at least 1 exit per outpost" half is an INVARIANT on the layout data,
// pinned here — all nine faction skins share this one room graph, and skins
// re-write only strings, never tags, so one assertion covers all nine.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { HUB, roomIsExit, hubDefinesExitRoom } from '../app/engine/hub';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/* eslint-disable @typescript-eslint/no-require-imports */
const React = require('react');
const renderer = require('react-test-renderer');
const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown> };
type Tree = { root: { findAll(f: (n: Node) => boolean): Node[] }; unmount(): void };

// ⚠ OTA-1339 — ONE LIVING CHARACTER PER NAME now holds at the tutorial name beat,
// and every fresh character this file creates lives on in its slot. A fixed name
// here would be refused from the second creation onward, wedging the helper at the
// name ask — so each birth types a unique letter suffix (digits would be sanitized
// away by the name cleaner, so letters it is).
let bornSerial = 0;
const bornTag = (): string =>
  String.fromCharCode(97 + Math.floor(bornSerial / 26)) + String.fromCharCode(97 + (bornSerial++ % 26));
function textOf(n: unknown): string {
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(textOf).join(' ');
  const node = n as { props?: { children?: unknown } } | null;
  return node?.props ? textOf(node.props.children) : '';
}

function exitChipVisible(): boolean {
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(React.createElement(ExplorationScreen)); });
  const hits = tree.root.findAll((n) =>
    typeof n.props?.onPress === 'function'
    && /^exit$/i.test((typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.length > 0
      ? n.props.accessibilityLabel : textOf(n)).trim()));
  renderer.act(() => { tree.unmount(); });
  return hits.length > 0;
}

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

describe('OTA-1271 — the layout invariant', () => {
  it('⚠⚠ every outpost has at least one exit-bearing room — the owner\'s floor, as data', () => {
    const outpostRooms = HUB.rooms.filter((r) => r.tags.includes('outpost'));
    expect(outpostRooms.length).toBeGreaterThan(0);
    expect(outpostRooms.some((r) => roomIsExit(r))).toBe(true);
    expect(hubDefinesExitRoom()).toBe(true);
  });

  // ⚠⚠ OTA-1279 MOVED THE SPARE DOOR, ON THE OWNER'S OWN LATER RULING:
  // *"there's a central hub structure where there's a central room that's where
  // the ex[it] should be."* OTA-1271 put it on the Workshop because at the time
  // the Workshop was the outpost's northern junction. Under the repaired graph
  // the Workshop is R04 — a DEAD END in the far north corner, the worst room in
  // the building to hide the way out in. What this suite really guards is his
  // floor — "all outposts should have at least 1 exit" — and that still holds;
  // only which room carries it changed.
  it('⚠⚠ the Gate AND the central room are exit rooms; the deep rooms are not', () => {
    const byId = Object.fromEntries(HUB.rooms.map((r) => [r.id, r]));
    expect(roomIsExit(byId.outpost_gate)).toBe(true);
    expect(roomIsExit(byId.outpost_central)).toBe(true);
    // 1194's half of the ruling survives: no door through the armory wall,
    // and the vault — the deep room the owner was stranded near — stays
    // doorless so its locked-treasury fiction holds.
    expect(roomIsExit(byId.outpost_armory)).toBe(false);
    expect(roomIsExit(byId.outpost_relic_vault)).toBe(false);
    expect(roomIsExit(byId.outpost_workshop)).toBe(false);
  });

  it('⚠ the rooms keep their identity — the door is an addition, not a rewrite', () => {
    const ws = HUB.rooms.find((r) => r.id === 'outpost_workshop')!;
    for (const t of ['workshop', 'crafting', 'vendor', 'safe', 'outpost']) {
      expect(ws.tags).toContain(t);
    }
    const mid = HUB.rooms.find((r) => r.id === 'outpost_central')!;
    for (const t of ['hub', 'central', 'safe', 'outpost']) {
      expect(mid.tags).toContain(t);
    }
  });
});

describe('OTA-1271 — played on the real screen', () => {
  beforeAll(async () => {
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
    sub('Frank' + bornTag()); sub('look around'); sub('take the cudgel');
    sub("take the Mud-Warden's Vest");
    useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
    await new Promise((r) => setTimeout(r, 0));
    sub('take the rope'); sub('scrap the chest plate');
    for (let i = 0; i < 8 && beat() === 'climb'; i++) {
      sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
    }
    sub('investigate door');
    useGameStore.getState().chooseTutorialExplore();
  });

  it('⚠⚠ EXIT shows at the Gate, shows in the middle, and NOT in the Vault', () => {
    expect(useGameStore.getState().player?.hubRoomId).toBe('outpost_gate');
    expect(exitChipVisible()).toBe(true);
    // ⚠ OTA-1279 — walked one legal edge at a time. The old version of this
    // test used `go to the workshop` and relied on earned fast-travel, which
    // the owner's navigation spec deleted.
    useGameStore.getState().submitPlayerAction('go north');   // gate → square (R10→R01)
    expect(useGameStore.getState().player?.hubRoomId).toBe('outpost_central');
    expect(exitChipVisible()).toBe(true);          // ← the owner's missing button
    useGameStore.getState().submitPlayerAction('go north');   // square → vault (R01→R02)
    expect(useGameStore.getState().player?.hubRoomId).toBe('outpost_relic_vault');
    expect(exitChipVisible()).toBe(false);         // ← 1194's half still holds
  });

  it('⚠⚠ leaving FROM the middle narrates its own door, not the gate', () => {
    useGameStore.getState().submitPlayerAction('go south');   // vault → square
    expect(useGameStore.getState().player?.hubRoomId).toBe('outpost_central');
    const from = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction('leave outpost');
    expect(useGameStore.getState().player?.hubRoomId).toBeNull();
    const feed = useGameStore.getState().gameLog.slice(from)
      .map((e: { text: string }) => String(e.text)).join(' | ');
    expect(feed).toContain('side door');
    expect(feed).not.toContain('back through the gate');
  });
});
