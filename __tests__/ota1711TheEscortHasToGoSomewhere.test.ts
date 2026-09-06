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

/**
 * STEP 3d / OTA-1711 — THE ESCORT HAS TO GO SOMEWHERE.
 *
 * OTA-1710 audited the fetch counter, the staged beats and the wealth gate, and
 * said out loud that ESCORT — 29 of the 65 faction contracts, the largest family
 * in the game — was not reached, because its ledger is a party of bodies taking
 * collateral damage across real fights rather than a number you can set. This is
 * that probe set.
 *
 * ⚠⚠⚠ AND THE FIRST PROBE FOUND THE WORK WAS OPTIONAL.
 *
 * Accept an escort from an agent, hand it straight back to THAT SAME AGENT
 * without moving a step: complete, +70 TC and +8 rep on "The Survey Line", +160
 * on "The Founder's Bones". The party spawns at full health, so the scaled-pay
 * multiplier is 1, and nothing on the turn-in path asked where anybody had been.
 * `send word` did the same thing from anywhere on the map.
 *
 * ⚠ THE FIX IS THE WEAKEST RULE THAT CLOSES IT. Every escort objective reads
 * "escort them to a <faction> agent" — none of the 29 names a place, and none
 * carries a `targetLocationName` or `objectiveLocationId`. There is no
 * destination to check, and inventing 29 of them would be a redesign on my own
 * authority. What can be said without inventing anything: the party has to have
 * GONE somewhere. It reads `acceptedAtCell`, already stamped at accept and
 * already read one line below for the long-haul bonus.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import { escortWasCarried, escortSpecForQuest } from '../app/engine/escort';
import { canonicalCellOf } from '../app/engine/worldMap';
import { bootWithAgent, feedMark, feedSince, isActive, isComplete } from '../test-utils/factionProbes';
import type { PlayerCharacter } from '../app/engine/types';

jest.setTimeout(240_000);
const store = useGameStore;
const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const escorts = FACTION_QUESTS.filter((q) => !!escortSpecForQuest(q));
const rec = (id: string) =>
  (store.getState().player?.activeFactionQuests ?? []).find((q) => q.id === id);
const scaled = () => escorts.find((q) => q.escort?.mode !== 'all_or_nothing')!;

function agentInScene(factionId: string, name = 'Sallow Vek'): void {
  store.setState((s) => ({
    currentScene: {
      ...s.currentScene!, enemies: [], enemyHps: [],
      vendor: { id: 'v_probe_agent', name, title: 'agent', faction: factionId, description: 'an agent', offers: [] },
    } as never,
  }));
}

/** Walk to any location that is a different CELL from where the party was
 *  picked up — which is exactly what the rule asks for. */
async function carryThemSomewhere(id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LOCATIONS = require('../app/data/locations/locations.json') as { id: string }[];
  const from = rec(id)?.acceptedAtCell;
  const here = store.getState().player!.currentLocationId;
  const dest = LOCATIONS.find((l) => {
    if (l.id === here) return false;
    const c = canonicalCellOf(l.id);
    return !from || Math.abs(c.x - from.x) + Math.abs(c.y - from.y) > 0;
  })!;
  store.getState().travelTo(dest.id);
  await new Promise((r) => setTimeout(r, 30));
}

describe('STEP 3d — ⚠⚠⚠ the escort work was optional', () => {
  it('handing the party back where you collected them is REFUSED, and told why', async () => {
    const def = scaled();
    await bootWithAgent(def.factionId);
    const tc0 = store.getState().player!.tc;
    store.getState().acceptFactionQuest(def.title);
    expect(rec(def.id)?.escort?.hp).toBeGreaterThan(0);

    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    const saw = feedSince(m).join(' ');
    // ⚠ Before OTA-1711: complete, +70 TC, +8 rep, party never moved.
    expect({ done: isComplete(def.id), paid: store.getState().player!.tc - tc0 })
      .toEqual({ done: false, paid: 0 });
    // And it is still ON the slate — refused, not failed. Nobody lost a party
    // for asking too early.
    expect(isActive(def.id)).toBe(true);
    expect(saw.toLowerCase()).toContain('not taken them anywhere');
    expect(saw).toContain(escortSpecForQuest(def)!.label);
  });

  it('⚠⚠ `send word` cannot courier them either — you cannot mail people', async () => {
    const def = scaled();
    await bootWithAgent(def.factionId);
    const tc0 = store.getState().player!.tc;
    store.getState().acceptFactionQuest(def.title);
    store.setState((s) => ({ currentScene: { ...s.currentScene!, vendor: undefined, missionBoard: undefined } as never }));

    const m = feedMark();
    store.getState().turnInFactionQuest(def.title, true);
    expect({ done: isComplete(def.id), paid: store.getState().player!.tc - tc0 })
      .toEqual({ done: false, paid: 0 });
    // The same objection the FETCH rule already makes ("you cannot mail the
    // goods"), with more of it.
    expect(feedSince(m).join(' ').toLowerCase()).toContain('people, not paper');
  });

  it('⚠⚠⚠ THE POSITIVE CASE — walk them somewhere and they deliver, and the walk pays', async () => {
    // The half that matters most: a rule that closes an exploit by making 29
    // contracts unfinishable is not a fix. This is the same contract, done
    // properly.
    const def = scaled();
    await bootWithAgent(def.factionId);
    const tc0 = store.getState().player!.tc;
    store.getState().acceptFactionQuest(def.title);
    await carryThemSomewhere(def.id);
    agentInScene(def.factionId, 'Far Agent');

    store.getState().turnInFactionQuest(def.title);
    const paid = store.getState().player!.tc - tc0;
    expect(isComplete(def.id)).toBe(true);
    // ⚠ And carrying them FURTHER pays more, through the long-haul bonus that
    // reads the very same `acceptedAtCell` — so the gate and the reward price
    // one journey and cannot disagree about it.
    expect(paid).toBeGreaterThan(def.reward.tc);
  });
});

describe('STEP 3d — the rule itself', () => {
  it('the pure test says what it means: any distance at all is enough', () => {
    expect(escortWasCarried({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(false);
    expect(escortWasCarried({ x: 5, y: 5 }, { x: 6, y: 5 })).toBe(true);
    expect(escortWasCarried({ x: 5, y: 5 }, { x: 5, y: 4 })).toBe(true);
  });

  it('⚠⚠ it FAILS OPEN on a contract accepted before this OTA', () => {
    // A save carrying an escort with no stamped cell must not be stranded — the
    // player is already holding those people. An un-stamped escort delivers
    // exactly as it did before.
    expect(escortWasCarried(undefined, { x: 1, y: 1 })).toBe(true);
    expect(escortWasCarried(null, { x: 1, y: 1 })).toBe(true);
  });

  it('⚠ no escort names a destination — which is WHY the rule is this weak', () => {
    // If any of them did, "arrive at the named place" would be the better rule.
    // This fails the moment one is authored with a destination, which is the
    // right time to revisit it.
    expect(escorts.length).toBe(29);
    for (const q of escorts) {
      expect({ id: q.id, named: !!(q.targetLocationName || q.objectiveLocationId) })
        .toEqual({ id: q.id, named: false });
    }
  });
});

describe('STEP 3d — what the audit found and did NOT change', () => {
  it('⚠⚠ a dead pool cannot REACH a turn-in — the on-the-spot failure is the guard', async () => {
    // The probe found that an all-or-nothing contract delivered with hp 0 pays
    // in FULL, because the pay code skips the scaling for that mode entirely:
    //     if (activeRecord?.escort && candidate.escort?.mode !== 'all_or_nothing')
    // OTA-964's stated intent is "deliver them alive for FULL pay, or lose
    // everything when the pool dies", and the second half is not in that branch.
    //
    // ⚠ It is UNREACHABLE IN PLAY, and this test is why I did not change the pay
    // code on the strength of a state I had to build by hand: the only path that
    // damages a pool fails the contract the moment it hits zero and DROPS the
    // record, so there is no contract left to turn in. Pinned here so that if a
    // future damage path forgets to fail the quest, this names it instead of the
    // full payout quietly becoming reachable.
    const combat = src('app', 'state', 'combatResolution.ts');
    expect(combat.includes('if (hp <= 0) failEscortQuests')).toBe(false);
    expect(combat.includes('if (hp <= 0) failed.push(q.id);')).toBe(true);
    expect(combat.includes('if (failed.length > 0) failEscortQuests(get, set, failed);')).toBe(true);
    // And the drop really removes it from both lists, so nothing can hand it in.
    expect(combat.includes("activeFactionQuests: (s.player.activeFactionQuests ?? []).filter((q) => !ids.has(q.id))")).toBe(true);
    expect(combat.includes("activeFactionQuestIds: (s.player.activeFactionQuestIds ?? []).filter((id) => !ids.has(id))")).toBe(true);
  });

  it('⚠ PARKING protects the party by design — named, not silently changed', async () => {
    // `setFactionQuestActive(id, false)` parks the party: OTA-962's own words,
    // "off the HUD, no combat damage", and the feed tells the player they "fall
    // back to safety and wait". So walking every fight with the party parked and
    // delivering them pristine is currently the optimal play, and the collateral
    // mechanic is opt-in.
    //
    // ⚠ That is a BALANCE call, not a defect, so this OTA does not touch it. It
    // is recorded here because the alternative is that nobody notices it until a
    // player does. The delivery gate above is unaffected either way — parked or
    // not, the party still has to have gone somewhere.
    const q = src('app', 'state', 'slices', 'questSlice.ts');
    expect(q.includes("an escort's party PARKS when its contract is deactivated")).toBe(true);
    const combat = src('app', 'state', 'combatResolution.ts');
    expect(combat.includes("if (!q.escort || q.tracked === false || q.escort.hp <= 0) return q;")).toBe(true);
  });

  it('abandoning takes the party with the contract, and that is right', async () => {
    const def = escorts[0]!;
    await bootWithAgent(def.factionId);
    store.getState().acceptFactionQuest(def.title);
    expect(rec(def.id)?.escort).toBeTruthy();
    store.getState().abandonContract('faction_quest', def.id);
    // No orphaned party left walking around with no contract to belong to.
    expect({ active: isActive(def.id), record: rec(def.id) }).toEqual({ active: false, record: undefined });
  });

  it('two escorts at once: both keep their own party, and only one is tracked', async () => {
    const a = escorts[0]!;
    const b = escorts.find((q) => q.factionId === a.factionId && q.id !== a.id)!;
    await bootWithAgent(a.factionId);
    store.getState().acceptFactionQuest(a.title);
    store.getState().acceptFactionQuest(b.title);
    expect({ a: !!rec(a.id)?.escort, b: !!rec(b.id)?.escort }).toEqual({ a: true, b: true });
    // The NEW one does not steal the focus; the first keeps it.
    expect({ a: rec(a.id)?.tracked, b: rec(b.id)?.tracked }).toEqual({ a: true, b: false });
  });

  it('scaled pay still prices the state you delivered them in', async () => {
    const def = scaled();
    await bootWithAgent(def.factionId);
    const tc0 = store.getState().player!.tc;
    store.getState().acceptFactionQuest(def.title);
    store.setState((s) => ({
      player: {
        ...s.player!,
        activeFactionQuests: (s.player!.activeFactionQuests ?? []).map((q) =>
          q.id === def.id && q.escort ? { ...q, escort: { ...q.escort, hp: Math.round(q.escort.hpMax / 2) } } : q),
      } as PlayerCharacter,
    }));
    await carryThemSomewhere(def.id);
    agentInScene(def.factionId, 'Far Agent');
    const m = feedMark();
    store.getState().turnInFactionQuest(def.title);
    const paid = store.getState().player!.tc - tc0;
    expect(isComplete(def.id)).toBe(true);
    // Half the party's health, so roughly half of what the walk would otherwise
    // have paid — and the line says so rather than leaving them to wonder.
    expect(feedSince(m).join(' ').toLowerCase()).toContain('% pay');
    expect(paid).toBeGreaterThan(0);
  });
});
