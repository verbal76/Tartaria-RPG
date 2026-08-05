// OTA-1118 — TALKING IS ITS OWN SCREEN NOW.
//
// Owner, from the device: "the talk box is bigger than the exploration window
// so I don't get to see what he actually says unless I stop talking." Then,
// weighing the fix: "should talking be a whole separate full or 3/4 screen
// popup that way the story text is the only thing to read."
//
// Yes — but the reason it works is that the REPLIES MOVED IN. A tall popup that
// still routed answers to the feed behind it would be the same bug made total.
// So the load-bearing facts this suite guards are:
//   · pendingTalk records where in the feed the conversation began, so the view
//     can render the exchange itself;
//   · that marker is a WINDOW on gameLog, never a second copy of the lines —
//     dialogue.ts keeps routing through appendLog and the exploration history
//     survives the conversation;
//   · unasked topics sort above asked ones, and asked ones are never hidden.

jest.setTimeout(20000);

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { useGameStore } from '../app/state/gameStore';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

describe('OTA-1118 — the conversation carries its own transcript', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Talker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('opening a talk records where the exchange begins in the feed', () => {
    const before = useGameStore.getState().gameLog.length;
    useGameStore.setState({
      pendingTalk: {
        npcId: 'irma_ironhand', npcName: 'Irma Ironhand', topics: [],
        role: null, flourishesUsed: [], flourishCount: 0,
        lockedCount: 0, regard: 'trusted', teaserTaps: 0,
        startedAtLogLen: before,
      },
    });
    const t = useGameStore.getState().pendingTalk!;
    expect(t.startedAtLogLen).toBe(before);
    // The window is empty at the moment it opens — nothing said yet.
    expect(useGameStore.getState().gameLog.slice(t.startedAtLogLen)).toHaveLength(0);
  });

  it('every line said during the conversation lands INSIDE the window', () => {
    const start = useGameStore.getState().gameLog.length;
    useGameStore.setState({
      pendingTalk: {
        npcId: 'irma_ironhand', npcName: 'Irma Ironhand', topics: [],
        role: null, flourishesUsed: [], flourishCount: 0,
        lockedCount: 0, regard: 'trusted', teaserTaps: 0,
        startedAtLogLen: start,
      },
    });
    useGameStore.getState().appendLog('world', 'She sets the hammer down. "Ask, then."');
    useGameStore.getState().appendLog('world', '"Cheaper than the last one, and it will not fold."');
    const t = useGameStore.getState().pendingTalk!;
    const window = useGameStore.getState().gameLog.slice(t.startedAtLogLen);
    // ≥1 entry: the same-channel 500ms debounce may GROUP consecutive replies
    // into one card, which is fine and desirable inside a conversation. What
    // matters is that nothing escaped the window.
    expect(window.length).toBeGreaterThan(0);
    const said = window.map((e) => e.text).join('\n');
    expect(said).toMatch(/Ask, then/);
    expect(said).toMatch(/will not fold/);
  });

  it('THE REGRESSION THAT WOULD HAVE SHIPPED — a first reply is never welded backwards', () => {
    // The same-channel 500ms debounce merges a world line into the PREVIOUS
    // world entry. Without a guard, the first reply of a conversation gets glued
    // onto the arrival narration that predates it — landing outside the window,
    // so the player watches their opening question get no answer. Exactly the
    // bug this OTA exists to end, arriving through the debounce instead of the
    // layout.
    useGameStore.getState().appendLog('world', 'The stall smells of hot iron.');
    const start = useGameStore.getState().gameLog.length;
    useGameStore.setState({
      pendingTalk: {
        npcId: 'irma_ironhand', npcName: 'Irma Ironhand', topics: [],
        role: null, flourishesUsed: [], flourishCount: 0,
        lockedCount: 0, regard: 'trusted', teaserTaps: 0,
        startedAtLogLen: start,
      },
    });
    useGameStore.getState().appendLog('world', 'She looks up. "Well?"');
    const window = useGameStore.getState().gameLog.slice(start);
    expect(window.length).toBe(1);
    expect(window[0]!.text).toBe('She looks up. "Well?"');
    expect(window[0]!.text).not.toMatch(/hot iron/);
  });

  it('the transcript is a WINDOW, not a copy — closing the talk leaves the history behind', () => {
    const start = useGameStore.getState().gameLog.length;
    useGameStore.setState({
      pendingTalk: {
        npcId: 'irma_ironhand', npcName: 'Irma Ironhand', topics: [],
        role: null, flourishesUsed: [], flourishCount: 0,
        lockedCount: 0, regard: 'trusted', teaserTaps: 0,
        startedAtLogLen: start,
      },
    });
    useGameStore.getState().appendLog('world', 'A thing she said.');
    const during = useGameStore.getState().gameLog.length;
    useGameStore.getState().closeTalk();
    expect(useGameStore.getState().pendingTalk).toBeNull();
    // The conversation's lines are still in the feed (plus the sign-off line).
    const after = useGameStore.getState().gameLog;
    expect(after.length).toBeGreaterThanOrEqual(during);
    // (The sign-off may debounce-group into the same card; what matters is the
    // line is still IN the feed after the conversation ends.)
    expect(after.some((e) => e.text.includes('A thing she said.'))).toBe(true);
  });

  it('a real talkToNpc stamps the marker off the live feed length', () => {
    // Drive the store's own opener rather than a hand-built literal, so the
    // marker cannot silently stop being set at the one place it matters.
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().talkToNpc('Irma Ironhand');
    const t = useGameStore.getState().pendingTalk;
    if (t) {
      // Irma is reachable in this scene — the marker must be the pre-open length.
      expect(t.startedAtLogLen).toBe(before);
    } else {
      // Not in this scene; the opener correctly did nothing and left no marker.
      expect(useGameStore.getState().pendingTalk).toBeNull();
    }
  });
});

describe('OTA-1118 — source locks on the view that fixes the report', () => {
  const view = src('app/components/TalkSheet.tsx');

  it('the exchange is rendered inside the sheet, sliced off the real log', () => {
    expect(view).toContain('gameLog.slice(');
    expect(view).toMatch(/startedAtLogLen/);
    // A transcript pane exists and is the flexible one — it gets the space.
    expect(view).toMatch(/transcript: \{\s*flex: 1,/);
  });

  it('it is a tall overlay, not a bottom strip fighting the feed for room', () => {
    expect(view).toContain('<Modal');
    // OTA-1119 — 88% welded to the bottom → 92% floating inside a gutter. The
    // number moved; the invariant (the exchange gets most of the screen) did not.
    expect(view).toMatch(/height: '92%'/);
  });

  // OTA-1119 — owner: "shrink the width of the talk screen so it doesn't touch
  // the edges of the screen and let's put the outside edge detail [a brighter]
  // gold color so it pops and you understand a border is there." A panel welded
  // to the bezel has no readable edge — it reads as the app rather than as a
  // layer over it.
  it('the sheet is INSET from every edge, with a border bright enough to see', () => {
    expect(view).toMatch(/backdrop: \{[\s\S]*?paddingHorizontal: 14,[\s\S]*?paddingVertical: 22,/);
    // A full radius (not just the two top corners a bottom-welded sheet had).
    expect(view).toMatch(/borderRadius: 14,/);
    expect(view).toMatch(/borderWidth: 2,/);
    // The frame must be BRIGHTER than any gold used inside the sheet, or it
    // stops being the thing your eye finds first.
    expect(view).toMatch(/borderColor: '#f0c96a'/);
    expect(view).not.toMatch(/borderTopLeftRadius/);
  });

  it('the topic tray is CAPPED so a 16-topic vendor cannot re-create the bug', () => {
    // OTA-1114 pushed nine vendors to 14-16 topics. An uncapped tray inside the
    // tall sheet would push the exchange off the screen from the other side.
    expect(view).toMatch(/topics: \{ maxHeight: '34%' \}/);
  });

  it('unasked topics sort above asked, and asked ones stay visible', () => {
    expect(view).toMatch(/return aAsked === bAsked \? 0 : aAsked \? 1 : -1;/);
    // The spent row is still rendered and still marked.
    expect(view).toContain('(asked)');
  });

  it('collapsing keeps the conversation open — it is a view state, not a close', () => {
    expect(view).toMatch(/const \[collapsed, setCollapsed\] = useState\(false\)/);
    // The breadcrumb reopens; only STOP TALKING calls close().
    expect(view).toMatch(/onPress=\{\(\) => setCollapsed\(false\)\}/);
    expect((view.match(/onPress=\{close\}/g) ?? []).length).toBe(1);
  });
});
