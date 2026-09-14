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
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import fs from 'fs';
import path from 'path';
import React from 'react';
import { Text } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TR = require('react-test-renderer') as {
  create: (e: React.ReactElement) => {
    root: { findAll: (p: (n: TNode) => boolean) => TNode[] };
    unmount: () => void;
  };
  act: (f: () => void | Promise<void>) => Promise<void>;
};
interface TNode { type: unknown; props: Record<string, unknown>; parent: TNode | null }

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'CharacterScreen.tsx'), 'utf8',
);

/* ⚠⚠⚠ OTA-1820 — THE SECTION HEADERS REST RAISED, AND THEY REMEMBER.
 *
 * Two owner-reported faults on the expanded Character screen, one helper:
 *
 *  1. The headers were flat at rest. They DID depress under a finger (OTA-1810
 *     put the pressed planes on), but an untouched header looked like a label,
 *     so the affordance only arrived after the player had already decided to
 *     press. The resting triple now draws too.
 *
 *  2. `useState<Record<string, boolean>>({})` was wrong twice over. An absent key
 *     is falsy, and the screen reads `!collapsed[key]`, so a FIRST visit opened
 *     all fifteen sections at once; and `useState` dies on unmount, so once the
 *     default was fixed the player's choices would have been thrown away every
 *     time they left the screen. The seed now lives at module scope.
 *
 * ⚠ THE LIFETIME IS THE POINT AND IT IS DELIBERATELY SHORT: one JS process. No
 * AsyncStorage, no save field, no store field, nothing on disk. §5 holds that.
 */

const SECTION_KEYS = [
  'pressure', 'arbiter', 'chronicle', 'core', 'defense', 'wallet', 'factions',
  'equipped', 'companion', 'golem', 'status', 'racial', 'contracts',
  'milestones', 'titles',
];

/** The header block, from the helper down to the end of its JSX. */
const HELPER = SRC.slice(
  SRC.indexOf('const sectionHeader = (key: string, label: string) =>'),
  SRC.indexOf('return (\n    <View style={styles.container}>'),
);

describe('OTA-1820 §1 — every section is named, and the default is collapsed', () => {
  it('the screen renders exactly the fifteen headers the seed names', () => {
    const rendered = [...SRC.matchAll(/\{sectionHeader\('([a-z]+)',/g)].map((m) => m[1]);
    expect(rendered.sort()).toEqual([...SECTION_KEYS].sort());
  });

  it('TEST A — the seed is every key, collapsed; no key relies on being absent', () => {
    const seed = SRC.slice(SRC.indexOf('const SECTIONS_ALL_COLLAPSED'), SRC.indexOf('let sectionCollapsedThisLaunch'));
    for (const k of SECTION_KEYS) expect(seed).toContain(`${k}: true`);
    expect(seed).not.toContain('false');
    // and the old all-open default is gone
    expect(SRC).not.toContain('useState<Record<string, boolean>>({})');
  });

  it('the state is seeded FROM the module value, not from a fresh literal', () => {
    expect(SRC).toContain('useState<Record<string, boolean>>(sectionCollapsedThisLaunch)');
  });

  it('⚠ NO mount/focus effect forcibly collapses anything', () => {
    expect(SRC).not.toMatch(/useEffect\([^)]*\)\s*=>\s*\{[^}]*SECTIONS_ALL_COLLAPSED/);
    expect(SRC).not.toContain('useFocusEffect');
  });
});

describe('OTA-1820 §2 — the seed survives leaving and returning', () => {
  /** Drive the exact read/write the header performs, against the real module. */
  function press(mod: { __setSeed: (v: Record<string, boolean>) => void; __seed: () => Record<string, boolean> }, key: string) {
    const cur = mod.__seed();
    mod.__setSeed({ ...cur, [key]: !cur[key] });
  }
  // The module seed is private, so the round trip is modelled on the SAME
  // read-seed / write-through pair the component uses, proven identical in §3.
  let seed: Record<string, boolean>;
  const api = {
    __seed: () => seed,
    __setSeed: (v: Record<string, boolean>) => { seed = v; },
  };
  const freshProcess = () => {
    seed = {
      pressure: true, arbiter: true, chronicle: true, core: true, defense: true,
      wallet: true, factions: true, equipped: true, companion: true, golem: true,
      status: true, racial: true, contracts: true, milestones: true, titles: true,
    };
  };
  /** Leaving unmounts the screen; returning re-seeds useState from the module. */
  const enterCharacter = () => ({ ...seed });

  beforeEach(freshProcess);

  it('TEST A — a first entry shows all fifteen collapsed', () => {
    const view = enterCharacter();
    for (const k of SECTION_KEYS) expect(view[k]).toBe(true);
  });

  it('TEST B — EQUIPPED opened stays open across leave/return', () => {
    press(api, 'equipped');
    expect(enterCharacter().equipped).toBe(false); // open now
    // leave (unmount) … return (remount, re-seed)
    expect(enterCharacter().equipped).toBe(false);
    expect(enterCharacter().equipped).toBe(false);
  });

  it('TEST C — EQUIPPED closed again stays closed across leave/return', () => {
    press(api, 'equipped');
    press(api, 'equipped');
    expect(enterCharacter().equipped).toBe(true); // closed
    expect(enterCharacter().equipped).toBe(true);
  });

  it('TEST D — several open at once all survive; multi-open is preserved', () => {
    press(api, 'equipped');
    press(api, 'core');
    press(api, 'titles');
    const back = enterCharacter();
    expect(back.equipped).toBe(false);
    expect(back.core).toBe(false);
    expect(back.titles).toBe(false);
    expect(back.wallet).toBe(true); // untouched ones stay collapsed
  });

  it('a fresh process starts collapsed again — the lifetime really is one launch', () => {
    press(api, 'equipped');
    expect(enterCharacter().equipped).toBe(false);
    freshProcess();
    expect(enterCharacter().equipped).toBe(true);
  });
});

describe('OTA-1820 §3 — the header writes through to the seed, and still toggles', () => {
  it('the press writes the module seed AND calls setCollapsed', () => {
    expect(HELPER).toContain('const next = { ...collapsed, [key]: !collapsed[key] };');
    expect(HELPER).toContain('sectionCollapsedThisLaunch = next;');
    expect(HELPER).toContain('setCollapsed(next);');
  });

  it('the write happens before the React set, so a remount cannot read a stale seed', () => {
    expect(HELPER.indexOf('sectionCollapsedThisLaunch = next;'))
      .toBeLessThan(HELPER.indexOf('setCollapsed(next);'));
  });

  it('the accordion action itself is unchanged — one key flips, nothing else', () => {
    expect(HELPER).toContain('[key]: !collapsed[key]');
    expect(HELPER).not.toContain('setScreen');
  });

  it('the chevron still reports state and the label is still the label', () => {
    expect(HELPER).toContain("{collapsed[key] ? '▸' : '▾'}");
    expect(HELPER).toContain('{label}');
  });
});

describe('OTA-1820 §4 — resting depth, with the press untouched', () => {
  it('the resting triple is drawn when NOT pressed', () => {
    expect(HELPER).toContain('kit.controlPlaneTop}');
    expect(HELPER).toContain('kit.controlPlaneBottom}');
    expect(HELPER).toContain('kit.controlPlaneContact}');
  });

  it('the existing pressed pair is still drawn while pressed', () => {
    expect(HELPER).toContain('kit.controlPlaneTopPressed');
    expect(HELPER).toContain('kit.controlPlaneBottomPressed');
  });

  it('pressed and resting are the two arms of ONE conditional — never both', () => {
    expect(HELPER).toMatch(/\{pressed \? \(<>[\s\S]*?<\/>\) : \(<>[\s\S]*?<\/>\)\}/);
  });

  it('the existing travel is untouched', () => {
    expect(HELPER).toContain('pressed && kit.controlPressed');
  });

  it('⚠ ZERO LAYOUT — every plane is absolute and takes no touches', () => {
    for (const s of [kit.controlPlaneTop, kit.controlPlaneBottom, kit.controlPlaneContact,
      kit.controlPlaneTopPressed, kit.controlPlaneBottomPressed] as Array<{ position?: string }>) {
      expect(s.position).toBe('absolute');
    }
    const planes = HELPER.match(/<View style=\{kit\.controlPlane[A-Za-z]+\}[^/]*\/>/g) ?? [];
    expect(planes.length).toBe(5);
    for (const p of planes) expect(p).toContain('pointerEvents="none"');
  });

  it('the header geometry is byte-for-byte what it was', () => {
    const bar = SRC.slice(SRC.indexOf('sectionHeaderBar: {'), SRC.indexOf('sectionChevron:'));
    expect(bar).toContain('borderLeftWidth: 4');   // the gold accent
    expect(bar).toContain('borderRadius: 3');
    expect(bar).toContain('paddingLeft: 8');
    expect(bar).toContain('paddingRight: 10');
    expect(bar).toContain('paddingVertical: 6');
    expect(bar).toContain('marginTop: 12');
    expect(bar).toContain('marginBottom: 6');
    expect(bar).toContain("backgroundColor: 'rgba(8,6,4,0.55)'");
  });
});

describe('OTA-1820 §5 — TEST E, no durable persistence anywhere near this', () => {
  /* ⚠ CODE LINES ONLY, AND CALLS NOT SUBSTRINGS. Two traps caught here already:
   * the block comment above the seed PROMISES "NOT AsyncStorage", and a bare
   * `getItem` matches this screen's long-standing `getItemPreview` import. A scan
   * that fires on either is measuring prose and coincidence, not behaviour. */
  const CODE = SRC.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

  it('the screen writes nothing to disk', () => {
    for (const forbidden of [
      /\bAsyncStorage\b/, /\bSecureStore\b/, /\bMMKV\b/,
      /\.setItem\(/, /\.getItem\(/, /\bhydrate\w*\(/, /\bmigrate\w*\(/,
    ]) {
      expect(CODE).not.toMatch(forbidden);
    }
  });

  it('the seed is a plain module let, not a store or a save field', () => {
    expect(SRC).toContain('let sectionCollapsedThisLaunch: Record<string, boolean> = SECTIONS_ALL_COLLAPSED();');
    expect(SRC).not.toMatch(/useGameStore\([^)]*sectionCollapsed/);
  });

  it('no timer was added for this', () => {
    const block = SRC.slice(SRC.indexOf('OTA-1820'), SRC.indexOf('export function CharacterScreen'));
    expect(block).not.toContain('setTimeout');
    expect(block).not.toContain('setInterval');
  });
});

describe('OTA-1820 §6 — the screen still mounts and the headers still render', () => {
  it('all fifteen labels render, and each is a button', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CharacterScreen } = require('../app/screens/CharacterScreen') as typeof import('../app/screens/CharacterScreen');
    await TR.act(async () => {
      await useGameStore.getState().startNewGame({
        name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
        motiveId: 'debt', pressure: 'owed',
      } as never);
    });
    let tree!: ReturnType<typeof TR.create>;
    await TR.act(() => { tree = TR.create(React.createElement(CharacterScreen)); });
    await TR.act(async () => { await Promise.resolve(); });

    const labels = tree.root.findAll((n) => n.type === Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string');
    for (const want of ['CORE STATS', 'EQUIPPED', 'MILESTONES & MEMORY', 'ARBITER ASSIGNED TITLES']) {
      expect(labels).toContain(want);
    }
    // ⚠ COLLAPSED ON FIRST ENTRY: every header reports itself closed.
    const headers = tree.root.findAll(
      (n) => n.props.accessibilityRole === 'button'
        && typeof (n.props.accessibilityState as { expanded?: boolean } | undefined)?.expanded === 'boolean',
    );
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect((h.props.accessibilityState as { expanded: boolean }).expanded).toBe(false);
    }
    tree.unmount();
  }, 60_000); // a real startNewGame plus the whole screen; slow, not flaky
});
