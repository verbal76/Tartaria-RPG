// OTA-1151 — THE CONVERSATION REMEMBERS, and the question was never written down.
//
// Owner: *"I would like the talk screens to remember the conversations and type
// the question on an off-white so later we know what we asked. with so many
// conversations it will get confusing without a history."*
//
// ⚠ READING THAT AS A STYLING REQUEST UNDERSELLS IT — THERE WAS NOTHING TO
// STYLE. `raiseTopic` only ever logged the NPC's reply. Both the talk sheet and
// the exploration feed were a wall of answers with the questions missing; the
// only surviving evidence of what you had raised was the topic list sinking
// asked entries to the bottom, which tells you a question was spent but not
// which answer belonged to it.
//
// Two halves, and they fail differently:
//   1. The question is logged, on the 'player' channel — the same channel a
//      typed command uses, so speaking and acting read as the same person.
//   2. The exchange is STORED per NPC, because the sheet's transcript is a
//      window on gameLog (OTA-1095) that closes with the conversation, and
//      gameLog is itself `.slice(-MAX_LOG_IN_MEMORY)`d. Neither survives a walk
//      away, which is precisely the span the owner wants to look back across.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: unknown = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(30000);

const NPC = 'ota1151-npc';

// ⚠ ONE boot for the whole file. hydrate + startNewGame costs ~15s, so a boot
// per test put this suite over its own timeout — the failure looked like a hang
// and was arithmetic. The store is reset between tests instead: only the log and
// the transcript map carry state across a raiseTopic, so clearing those two is
// the same isolation a fresh boot would buy, for none of the cost.
beforeAll(async () => {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
});

beforeEach(() => {
  useGameStore.setState((s) => ({
    gameLog: [],
    pendingTalk: null,
    worldMemory: { ...s.worldMemory, npcTranscripts: {}, talkedTopics: {} },
  }));
});

/** Plant a conversation with two authored topics, one of them single-line so
 *  the re-ask path is reachable. */
function openTalk(startedAtTs = Date.now()) {
  useGameStore.setState({
    pendingTalk: {
      npcId: NPC,
      npcName: 'Odar Flameforge',
      startedAtTs,
      topics: [
        { id: 'forge', label: 'What do you make here?', lines: ['Fire. Everything on this rack burns something.'] },
        { id: 'seam', label: 'Who made that seam?', lines: ['Someone with time. A whole life for one seam.'] },
      ],
      lockedCount: 0,
      regard: 'known',
      flourishesUsed: [],
      flourishCount: 0,
    } as never,
  });
}

describe('OTA-1151 — the question is written down', () => {
  it('⚠ raising a topic logs the QUESTION, not just the answer', async () => {
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    const log = useGameStore.getState().gameLog;
    const q = log.find((e) => e.text === 'What do you make here?');
    expect(q).toBeDefined();
    // The 'player' channel is the load-bearing part: TalkSheet paints the
    // off-white plate off `channel === 'player'`, so a question logged as
    // 'world' would be invisible as a question no matter how it is styled.
    expect(q!.channel).toBe('player');
  });

  it('the question lands BEFORE the reply, so the pair reads in order', async () => {
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    const log = useGameStore.getState().gameLog;
    const qi = log.findIndex((e) => e.text === 'What do you make here?');
    const ai = log.findIndex((e) => e.text.includes('Everything on this rack burns'));
    expect(qi).toBeGreaterThanOrEqual(0);
    expect(ai).toBeGreaterThan(qi);
  });

  it('⚠ asking again is still logged — a re-ask is a thing you did', async () => {
    // Without this the "I have told you that one" reply arrives unprompted, as
    // though the NPC volunteered it.
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    useGameStore.getState().raiseTopic('forge');
    const asks = useGameStore.getState().gameLog
      .filter((e) => e.text === 'What do you make here?');
    expect(asks).toHaveLength(2);
  });
});

describe('OTA-1151 — the exchange survives the conversation closing', () => {
  it('a raised topic is recorded against the NPC', async () => {
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    const turns = useGameStore.getState().worldMemory.npcTranscripts?.[NPC] ?? [];
    expect(turns).toHaveLength(1);
    expect(turns[0]!.q).toBe('What do you make here?');
    expect(turns[0]!.a).toContain('Everything on this rack burns');
  });

  it('⚠ it outlives pendingTalk — that is the entire point', async () => {
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    useGameStore.setState({ pendingTalk: null });
    const turns = useGameStore.getState().worldMemory.npcTranscripts?.[NPC] ?? [];
    expect(turns).toHaveLength(1);
  });

  it('a second visit appends rather than replacing', async () => {
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    useGameStore.setState({ pendingTalk: null });
    openTalk(Date.now() + 1000);
    useGameStore.getState().raiseTopic('seam');
    const turns = useGameStore.getState().worldMemory.npcTranscripts?.[NPC] ?? [];
    expect(turns.map((t) => t.q)).toEqual([
      'What do you make here?',
      'Who made that seam?',
    ]);
  });

  it('transcripts are keyed per NPC, so two people never share a history', async () => {
    openTalk();
    useGameStore.getState().raiseTopic('forge');
    useGameStore.setState({
      pendingTalk: { ...useGameStore.getState().pendingTalk!, npcId: 'someone-else' } as never,
    });
    useGameStore.getState().raiseTopic('seam');
    const wm = useGameStore.getState().worldMemory.npcTranscripts ?? {};
    expect(wm[NPC]).toHaveLength(1);
    expect(wm['someone-else']).toHaveLength(1);
    expect(wm['someone-else']![0]!.q).toBe('Who made that seam?');
  });

  it('⚠ the history is CAPPED — worldMemory persists on every action', async () => {
    // An unbounded transcript is a save-size leak that only appears in the long
    // sessions this feature exists to serve, which is the worst way to find one.
    openTalk();
    for (let i = 0; i < 50; i++) useGameStore.getState().raiseTopic('forge');
    const turns = useGameStore.getState().worldMemory.npcTranscripts?.[NPC] ?? [];
    expect(turns.length).toBeLessThanOrEqual(40);
    // Oldest falls off the front, so the most RECENT exchange is always kept.
    expect(turns[turns.length - 1]!.q).toBe('What do you make here?');
  });
});
