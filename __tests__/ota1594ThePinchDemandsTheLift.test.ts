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

// ⚠⚠⚠ OTA-1594 — THE PINCH DEMANDS THE LIFT.
//
// FROM THE OWNER'S 2026-08-31 16:45 PLAY SESSION (device on 1593). He activated
// "Pinch from the Monarchs" — objective: *"Steal successfully from any
// vendor."* He then investigated a patch, fled a fight, and killed a Mud
// Spider. The quest COMPLETED. He never stole anything. He typed the bug
// report straight into the game:
//
//   [player] mission completed on stage 1?
//
// Both stages shipped `advanceOn: 'any'` — a theft quest any action pays. The
// OTA-1584 class (a promise the machine cannot pay), in the one family the P19
// re-audits never fully reached, and it survived BECAUSE the trigger
// vocabulary had no word for theft: 'kill' | 'travel' | 'any' cannot spell
// "steal". The 18-quest audit found exactly one sibling: "Run the haul" —
// *"Reach 100 TC, then complete the quest"* — also ['any','any'], completable
// with 3 TC in the purse.
//
// The repair, one mechanism per promise:
//   • 'steal' joins StageAdvanceTrigger; BOTH clean-theft doors
//     (stealFromVendor and pickpocketPerson) report the deed.
//   • tcThreshold joins FactionQuestDef; the FINAL advance refuses, out loud,
//     until the purse holds the number the objective names.
//   • the mission trace learns the faction family — his log showed two PAUSED
//     hunts faithfully traced while the contract he was RUNNING was invisible.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { FACTION_QUESTS, findFactionQuestById } from '../app/engine/factionQuests';
import { missionTraceLines } from '../app/engine/missionTrace';
import type { PlayerCharacter } from '../app/engine/types';
import enemiesData from '../app/data/enemies/enemies.json';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function freshGame(name: string) {
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await settle(() => !!store.getState().currentScene);
}

/** Seed a live faction-quest record directly — the accept path has its own
 *  coverage; this suite is about what advances it. */
function seedQuest(id: string, stage: number) {
  store.setState((s) => (s.player ? {
    player: {
      ...s.player,
      activeFactionQuestIds: [id],
      activeFactionQuests: [{ id, stage, postedByFaction: 'reclaimers_guild', acceptedAt: Date.now(), tracked: true }],
    },
  } : s));
}

function questStage(id: string): number {
  return (store.getState().player?.activeFactionQuests ?? []).find((r) => r.id === id)?.stage ?? -1;
}

/** Kill trigger, the way the owner's Mud Spider fired it: a 0-HP enemy through
 *  resolveEnemyDefeat — the same flow combat takes after a fatal hit. */
function killSomething() {
  const sample = (enemiesData as any[])[0];
  store.setState((s) => (s.currentScene ? {
    currentScene: {
      ...s.currentScene,
      enemies: [{ ...sample }], enemyHps: [0], activeEnemyIdx: 0, range: 'close' as const,
    },
  } : s));
  store.getState().resolveEnemyDefeat();
}

/** A guaranteed clean lift: STE 30 clears the alert-merchant DC 16 on any d20,
 *  so the success branch — the one that reports the deed — always runs. */
function stealSomething() {
  store.setState((s) => {
    if (!s.player || !s.currentScene) return s;
    return {
      player: { ...s.player, stats: { ...s.player.stats, stealth: 30 } },
      currentScene: {
        ...s.currentScene,
        vendor: {
          id: 'mark_vendor', name: 'Distracted Mark', title: 'Trader',
          faction: 'mud_monarchs', description: '', gender: 'female' as const,
          demeanor: 'sketchy' as const,
          offers: [{ itemName: 'Loose Trinket', price: 1 }],
        },
        enemies: [], enemyHps: [], range: null,
      },
    };
  });
  store.getState().stealFromVendor('Loose Trinket');
}

describe('OTA-1594 — his exact session, replayed against the fix', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
  });

  it('⚠⚠⚠ THE PINCH NO LONGER PAYS FOR A KILL — only the lift closes it', async () => {
    await freshGame('Pincher');
    seedQuest('fq_reclaimers_pinch', 1);

    // The Mud Spider that completed his quest on device. Now: nothing.
    killSomething();
    expect(questStage('fq_reclaimers_pinch')).toBe(1);

    // And the deed itself pays. One clean lift off a vendor's table — the
    // objective's own words — crosses the final stage.
    const logBefore = store.getState().gameLog.length;
    stealSomething();
    expect(questStage('fq_reclaimers_pinch')).toBe(2);
    const lines = store.getState().gameLog.slice(logBefore).map((e) => e.text).join('\n');
    expect(lines).toContain('Pinch from the Monarchs');
  });

  it('⚠⚠ THE HAUL COUNTS THE PURSE — refuses poor, out loud; closes at 100', async () => {
    await freshGame('Hauler');
    seedQuest('fq_reclaimers_haul', 1);
    store.setState((s) => (s.player ? { player: { ...s.player, tc: 3 } } : s));

    const logBefore = store.getState().gameLog.length;
    killSomething();
    // The advance is HELD, and the hold has a voice — the OTA-1402 rule: a
    // refused hand-in must be impossible to miss.
    expect(questStage('fq_reclaimers_haul')).toBe(1);
    const refusal = store.getState().gameLog.slice(logBefore).map((e) => e.text).join('\n');
    expect(refusal).toContain('pays out at 100 TC in hand');

    // Fill the purse to the number the objective names; the next significant
    // action closes it.
    store.setState((s) => (s.player ? { player: { ...s.player, tc: 150 } } : s));
    killSomething();
    expect(questStage('fq_reclaimers_haul')).toBe(2);
  });
});

describe('OTA-1594 — the trace learns the family he was actually playing', () => {
  // His log traced two PAUSED hunts line by line while the faction quest he
  // was running never appeared — a slate trace that omits a family is the
  // OTA-1586 defect it was built to end, one door over.
  const base = {
    ...placedAt('outpost_central'),
    activeHunts: [], activeMysteries: [], activeStorylines: [],
    inventory: [], tc: 3,
  } as unknown as PlayerCharacter;

  it('⚠⚠ a live pinch shows its stage AND the gate that pays it', () => {
    const p = { ...base, activeFactionQuests: [{ id: 'fq_reclaimers_pinch', stage: 1 }] } as unknown as PlayerCharacter;
    const joined = missionTraceLines(p).join('\n');
    expect(joined).toContain('faction:fq_reclaimers_pinch stage 1/2 [advanceOn=steal]');
  });

  it('⚠⚠ the haul on its final stage shows the purse against the price', () => {
    const p = { ...base, activeFactionQuests: [{ id: 'fq_reclaimers_haul', stage: 1 }] } as unknown as PlayerCharacter;
    expect(missionTraceLines(p).join('\n')).toContain('tc=3/100✗SHORT');
    const rich = { ...p, tc: 120 } as unknown as PlayerCharacter;
    expect(missionTraceLines(rich).join('\n')).toContain('tc=120/100✓');
  });

  it('⚠ a paused faction quest says PAUSED — the fact that explains a dead tile', () => {
    const p = { ...base, activeFactionQuests: [{ id: 'fq_reclaimers_pinch', stage: 0, tracked: false }] } as unknown as PlayerCharacter;
    expect(missionTraceLines(p).join('\n')).toContain('PAUSED');
  });
});

describe('OTA-1594 — the data now spells the promise it makes', () => {
  it('⚠⚠⚠ the pinch: the FINAL stage advances only on a steal', () => {
    const q = findFactionQuestById('fq_reclaimers_pinch')!;
    expect((q.stages ?? []).map((s) => s.advanceOn)).toEqual(['any', 'steal']);
  });

  it('⚠⚠ the haul: the threshold matches the number the objective speaks', () => {
    const q = findFactionQuestById('fq_reclaimers_haul')!;
    expect(q.tcThreshold).toBe(100);
    expect(q.objective).toMatch(/100 TC/);
  });

  it('⚠⚠ SWEEP — every staged objective that promises a theft or a price carries its gate', () => {
    // The audit that found these two, kept running: an objective whose own
    // words say "steal" must have a steal-gated stage; one that names a TC
    // figure must carry that figure as its threshold. A third sibling cannot
    // ship quietly.
    for (const q of FACTION_QUESTS) {
      const stages = q.stages ?? [];
      if (stages.length === 0) continue;
      if (/\bsteal\b/i.test(q.objective)) {
        expect(stages.some((s) => s.advanceOn === 'steal')).toBe(true);
      }
      const tc = /\breach (\d+) tc\b/i.exec(q.objective);
      if (tc) expect(q.tcThreshold).toBe(Number(tc[1]));
    }
  });

  it("⚠ today's whole surface is exactly these two — the OTA-1332 over-correction guard", () => {
    // 16 of the 18 staged quests are honest tallies and stay untouched; a gate
    // spreading to them would break contracts never written as thefts or
    // hauls. If this grows, it must grow on purpose.
    const stealGated = FACTION_QUESTS.filter((q) => (q.stages ?? []).some((s) => s.advanceOn === 'steal'));
    expect(stealGated.map((q) => q.id)).toEqual(['fq_reclaimers_pinch']);
    const priced = FACTION_QUESTS.filter((q) => q.tcThreshold != null);
    expect(priced.map((q) => q.id)).toEqual(['fq_reclaimers_haul']);
  });
});

describe('OTA-1594 — both theft doors report, and the screen speaks the new verb', () => {
  const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const SCREEN = readFileSync(join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');

  it('⚠⚠⚠ THE POCKET DOOR — the pickpocket clean lift fires the steal trigger', () => {
    // Anchored on the ledger write only the clean-lift branch performs. A
    // 'steal'-gated stage only one door advances would be the OTA-1584
    // partial-instrument lesson as gameplay.
    const i = STORE.indexOf('pocketsLifted: 1');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.slice(i, i + 600)).toContain("advanceActiveFactionQuests(get, set, 'steal');");
  });

  it('⚠⚠⚠ THE TABLE DOOR — stealFromVendor success fires it too', () => {
    const i = STORE.indexOf('✦ Successfully stole');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.slice(i, i + 1600)).toContain("advanceActiveFactionQuests(get, set, 'steal');");
  });

  it('⚠⚠ the Contracts card no longer tells the thief to go traveling', () => {
    // Before these branches existed, the kill/travel ternaries defaulted a
    // 'steal' stage into the travel wording — a hint pointing at the wrong verb
    // is the OTA-1588 defect in the UI layer. Stated against the branch
    // conditions, not the sentences (the check:quotedpins rule): both hint
    // sites must dispatch on the new trigger before falling through to travel.
    expect(SCREEN).toContain("stageDef.advanceOn === 'steal'");
    expect(SCREEN).toContain("stageDef?.advanceOn === 'steal'");
    // And the purse gate surfaces on the card's final stage, from the same
    // field the engine gates on.
    expect(SCREEN).toContain('def.tcThreshold && rec.stage >= (def.stages?.length ?? 0) - 1');
  });
});
