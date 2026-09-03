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

// ⚠⚠⚠ OTA-1630 — THE CHIP IS NOT THE MISSION.
//
// Owner: *"investigate still hangs on Mud and never closes the lit button."*
// His device log, 01:41: tap INVESTIGATE, "investigate the mud", the parser
// resolves it to the Aether Mud chip — and the tracked Bog Dragon hunt, whose
// current stage pays on `investigate`, claims the verb: *"Not here. The Bog
// Dragon of Old Drakova points elsewhere — set a course from Contracts and do
// it there."* The chip was never touched. Reproduced against the live store:
// the second tap printed NOTHING — the Not-here line and the scanner refusal
// behind it both de-duplicated into silence — and the chip stayed lit.
//
// A verb that NAMES a scene noun is aimed at that noun. The stage's own ask
// ("search this ground") names none, so the stage matcher stays out whenever
// the parsed noun is a chip on the ground. The scanner refusal speaks on every
// tap (OTA-1352), and every investigate leaves a debug line saying what it did
// to the chip, so the next device log is decisive.

import { useGameStore, makeRoomKey } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

/** An investigate can go through the lore table (a chance roll) or the
 *  ambient path the owner's log shows. Pin the dice mid so the suite measures
 *  that path, not the roll — 0.5 clears the ambush roll and misses the table. */
async function tapWithDiceHigh(text: string) {
  const realRandom = Math.random;
  Math.random = () => 0.5;
  try { await get().submitPlayerAction(text); await new Promise((r) => setTimeout(r, 150)); } finally { Math.random = realRandom; }
}
const roomKey = () => { const p = get().player!; return makeRoomKey(p.currentLocationId, get().currentScene?.microMicroId, p.mapX, p.mapY, p.hubRoomId); };
const searched = () => (get().worldMemory.visitedRooms?.[roomKey()]?.searchedAmbientNouns ?? []) as string[];
const huntStage = () => get().player!.activeHunts?.[0]?.stage;
const said = (from: number) => get().gameLog.slice(from).map((e) => e.text).join('\n');

/** The owner's ground: away from the Bog Dragon's anchor, its investigate stage
 *  tracked, an Aether Mud chip on the tile, no scanner in hand. The room's lore
 *  table is present but empty, so the investigate takes the ambient path (the
 *  one with the scanner gate) rather than the table's own narration. */
async function seedOwnersGround() {
  store.setState({
    player: { ...get().player!, ...placedAt('slack_flats'), hubRoomId: null, activeHunts: [{ id: 'hunt_bog_dragon', stage: 1, tracked: true, acceptedAt: Date.now() }] } as never,
    activeBuildingId: null,
  });
  await get().submitPlayerAction('north');
  await get().submitPlayerAction('south');
  await new Promise((r) => setTimeout(r, 200));
  const sc = get().currentScene!;
  store.setState({
    currentScene: { ...sc, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null, ambientNouns: ['Aether Mud', ...(sc.ambientNouns ?? []).filter((n) => !/mud/i.test(n))], displayedAmbientNouns: undefined } as never,
    worldMemory: { ...get().worldMemory, visitedRooms: { ...get().worldMemory.visitedRooms, [roomKey()]: { firstVisitAt: 0, lastVisitAt: 0, visitCount: 1, searchedAmbientNouns: [], flavorExhaustedNouns: [], roomInvestigationTable: {} } } } as never,
  });
}

describe('OTA-1630 — the chip is not the mission', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Mudlark', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ HIS TAP, REPLAYED: "investigate the mud" is the chip\'s, not the hunt\'s — no "Not here", and the refusal speaks twice', async () => {
    await seedOwnersGround();
    const n0 = get().gameLog.length;
    await tapWithDiceHigh('investigate the mud');
    expect(said(n0)).not.toMatch(/points elsewhere/);
    expect(said(n0)).toMatch(/Equip a Mud Scanner/);
    expect(huntStage()).toBe(1);
    const n1 = get().gameLog.length;
    await tapWithDiceHigh('investigate the mud');
    // ⚠ The second tap used to be silent.
    expect(said(n1)).toMatch(/Equip a Mud Scanner/);
    expect(said(n1)).toMatch(/investigate: "Aether Mud" refused — needs a mud scanner/);
  });

  it('⚠⚠ with the scanner in the off hand the chip is searched and marked, and the hunt still does not move', async () => {
    await seedOwnersGround();
    const p = get().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, { id: 'scan1', name: 'Mud Scanner', kind: 'tool', rarity: 'Uncommon', quantity: 1, tags: [] }], equipped: { ...(p.equipped ?? {}), off: 'Mud Scanner' } } as never });
    const n0 = get().gameLog.length;
    await tapWithDiceHigh('investigate the mud');
    await settle(() => searched().includes('aether mud'));
    expect(searched()).toContain('aether mud');
    expect(said(n0)).toMatch(/investigate: "Aether Mud" marked searched/);
    expect(said(n0)).not.toMatch(/points elsewhere/);
    expect(huntStage()).toBe(1);
  });

  it('the stage\'s own ask still pays the stage on its anchor — "search this ground" names no chip', async () => {
    await seedOwnersGround();
    // ⚠ OTA-1637 — with a full tank, so the step back SOUTH actually lands. The
    // earlier tests drained the stamina; "south" was refused and the player stood
    // one tile north of the anchor while `currentLocationId` still said Cradle.
    // The verb paid anyway — the exact location-wide defect OTA-1637 closes.
    store.setState({ player: { ...get().player!, ...placedAt('cradle_of_dusk'), hubRoomId: null, stamina: 100 } as never });
    await get().submitPlayerAction('north');
    await get().submitPlayerAction('south');
    await new Promise((r) => setTimeout(r, 200));
    store.setState({ currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never });
    await get().submitPlayerAction('search this ground');
    await settle(() => huntStage() === 2);
    expect(huntStage()).toBe(2);
  });

  it('source pin — the matcher reads the parsed noun, and the scanner refusal skips dedup', () => {
    const src = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    expect(src).toContain('if (advanceStagesOnIntent(get, set, parsed.intent, parsed.resolvedNoun)) {');
    expect(src).toContain("const namesChip = !!resolvedNoun && (currentScene.ambientNouns ?? []).some((n) => n.toLowerCase() === resolvedNoun.toLowerCase());");
    // Three families, three "Not here" claims, every one of them steps aside for a named chip.
    expect(src).toContain('} else if (!inCombat && !namesChip) {');
    expect((src.match(/if \(!recent && !namesChip\) get\(\)\.appendLog\('arbiter', line\);/g) ?? []).length).toBe(2);
    expect(src).toContain('get().appendLog(\'arbiter\', `The Arbiter shakes their head. "${req.hint}"`, { skipDedup: true });');
  });
});
