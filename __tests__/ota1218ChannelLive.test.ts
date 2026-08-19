// OTA-1218 — LIVE PROOF FOR P16. A player buys a procedure, channels it, and something
// happens in the world.
//
// ⚠⚠ THIS SUITE IS THE POINT OF THE OTA. P16 is on the punch list precisely because
// `aetherTechniques.ts` shipped with 24 green unit tests and no caller — the rules were
// provably correct and provably unreachable. Unit tests cannot tell those apart, so every
// claim here drives the real store: real parser, real vendor, real combat.
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



import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';
import { AETHER_TECHNIQUES, techniqueForFaction, techniqueTextName, techniqueTextPrice } from '../app/engine/aetherTechniques';
import { rapportQuestId } from '../app/engine/factionRapport';
import { FACTION_STARTING_LOCATION } from '../app/engine/character';

jest.setTimeout(180000);

const SHIELD = AETHER_TECHNIQUES.find((t) => t.id === 'aether_shield')!;

async function freshCharacter(name: string, factionId = 'mud_monarchs') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  return store;
}

/** Fuel + a head steady enough to run the technique. INT is forced rather than levelled:
 *  the INT gate is `canAttempt`'s business and is pinned in the unit suite. */
function armFor(techId: string, opts?: { fuel?: boolean; int?: number }) {
  const store = useGameStore;
  const p = store.getState().player!;
  useGameStore.setState({
    player: {
      ...p,
      stats: { ...p.stats, intelligence: opts?.int ?? 20 },
      knownTechniques: [...(p.knownTechniques ?? []), techId],
      corruption: 0,
      inventory: opts?.fuel === false
        ? p.inventory.filter((i) => !/aether|golem core/i.test(i.name))
        : [...p.inventory.filter((i) => !/aether|golem core/i.test(i.name)),
           // ⚠ kind 'misc' + tags, i.e. a REAL InventoryItem. The first version wrote
           // kind: 'material', which is not in the union — the fuel picker matches on NAME
           // so the test passed anyway, and the typecheck gate is what caught the fixture.
           { id: 'fuel_1', name: 'Aether Residue', kind: 'misc', quantity: 3, tags: ['aether'] } as InventoryItem],
    },
  });
}

function tail(n = 40): string {
  return useGameStore.getState().gameLog.slice(-n).map((l: { text: string }) => l.text).join('\n');
}

describe('OTA-1218 / P16 — a technique is reachable', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ `channel aether shield` runs: fuel spent, dose taken, field up', async () => {
    const store = await freshCharacter('Channel Probe');
    armFor('aether_shield');
    const before = store.getState().player!;
    const fuelBefore = before.inventory.find((i) => i.name === 'Aether Residue')!.quantity;

    await store.getState().submitPlayerAction('channel aether shield');

    const after = store.getState().player!;
    // The roll happened at all — this is the assertion that would have failed if the
    // parser never routed the verb.
    expect(tail()).toMatch(/Aether Shield — d20/);
    // Fuel is spent whether it holds or not.
    expect(after.inventory.find((i) => i.name === 'Aether Residue')?.quantity ?? 0).toBe(fuelBefore - 1);
    // The dose lands either way too.
    expect(after.corruption).toBeGreaterThan(0);
  });

  test('⚠ a CLEAN run raises AC — the status is real, not a log line', async () => {
    const store = await freshCharacter('Shield Probe');
    // INT 20 vs DC 12 + 3 (non-Mud-Dweller ladder) = needs a 20+... so force the roll by
    // repeating until it holds. ⚠ A retry loop is honest here: the roll is random and the
    // claim under test is "a success applies the field", not "this particular d20 landed".
    let held = false;
    for (let i = 0; i < 25 && !held; i++) {
      armFor('aether_shield');
      await store.getState().submitPlayerAction('channel aether shield');
      held = (store.getState().player!.statusEffects ?? []).some((e) => e.kind === 'aether_shield');
    }
    expect(held).toBe(true);
    const eff = (store.getState().player!.statusEffects ?? []).find((e) => e.kind === 'aether_shield')!;
    expect(eff.remainingRounds).toBe(3);
  });

  test('⚠ no fuel — it refuses, and it costs nothing', async () => {
    const store = await freshCharacter('Dry Probe');
    armFor('aether_shield', { fuel: false });
    const before = store.getState().player!;
    await store.getState().submitPlayerAction('channel aether shield');
    const after = store.getState().player!;
    expect(tail()).toMatch(/finds nothing to pull on/);
    // ⚠ No dose for an attempt that never happened. A refusal that still charged
    // corruption would be the loop ending in nothing WITH a bill.
    expect(after.corruption).toBe(before.corruption);
    expect(tail()).not.toMatch(/Aether Shield — d20/);
  });

  test('⚠ a technique you were never taught refuses by NAME, and says so', async () => {
    const store = await freshCharacter('Untaught Probe');
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, knownTechniques: [], stats: { ...p.stats, intelligence: 20 } } });
    await store.getState().submitPlayerAction('channel aether shield');
    expect(tail()).toMatch(/never been taught the Aether Shield/);
  });

  test('⚠⚠ AMBIGUITY REFUSES rather than picking one — the P12 rule, on this path', async () => {
    // "ether" is inside BOTH "Aether Shield" and "Veil of Ether".
    const store = await freshCharacter('Ambiguous Probe');
    armFor('aether_shield');
    await store.getState().submitPlayerAction('channel ether');
    expect(tail()).not.toMatch(/Aether Shield — d20/);
    expect(tail()).not.toMatch(/Veil of Ether — d20/);
  });
});

describe('OTA-1218 / P16 — buying the procedure', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ a rapport vendor stocks the text, and buying it TEACHES the technique', async () => {
    // ⚠ THE WORKSHOP, NOT THE GATE. Halem is factionless on purpose (OTA-1208 made him the
    // any-faction broker), so the gate anchor can never carry a procedure — a fact worth
    // failing on loudly rather than picking a room that happens to work.
    const store = await freshCharacter('Buyer', 'mud_monarchs');
    const faction = 'reclaimers_guild';
    const tech = techniqueForFaction(faction);
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: FACTION_STARTING_LOCATION['mud_monarchs']!,
        hubRoomId: 'outpost_workshop',
        completedFactionQuestIds: [...(p.completedFactionQuestIds ?? []), rapportQuestId(faction)],
        stats: { ...p.stats, intelligence: 20 },
        knownTechniques: [],
        tc: 5000,
      },
    });
    await store.getState().beginScene?.();
    const vendor = store.getState().currentScene?.vendor ?? null;
    // ⚠ The premise: a vendor is actually standing here and the row was appended. Without
    // this the buy below would be proving nothing but an error message.
    expect(vendor).not.toBeNull();
    expect(vendor!.offers.map((o) => o.itemName)).toContain(techniqueTextName(tech));

    const tcBefore = store.getState().player!.tc;
    store.getState().buyFromVendor(techniqueTextName(tech));
    const after = store.getState().player!;
    expect(after.knownTechniques ?? []).toContain(tech.id);
    expect(after.tc).toBe(tcBefore - techniqueTextPrice(tech));
    // It teaches; it does NOT mint an object.
    expect(after.inventory.some((i) => i.name === techniqueTextName(tech))).toBe(false);
  });

  test('⚠⚠ WITHOUT rapport the row is not there, and it cannot be bought anyway', async () => {
    const store = await freshCharacter('No Rapport', 'mud_monarchs');
    const tech = techniqueForFaction('reclaimers_guild');
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        currentLocationId: FACTION_STARTING_LOCATION['mud_monarchs']!,
        hubRoomId: 'outpost_workshop',
        completedFactionQuestIds: [],
        stats: { ...p.stats, intelligence: 20 },
        knownTechniques: [],
        tc: 5000,
      },
    });
    await store.getState().beginScene?.();
    const vendor = store.getState().currentScene?.vendor ?? null;
    expect(vendor).not.toBeNull();
    expect(vendor!.offers.map((o) => o.itemName)).not.toContain(techniqueTextName(tech));
    // ⚠ And typing the name anyway is refused. The rapport gate is the acquisition design;
    // a buy path that ignored the offer list would delete it.
    store.getState().buyFromVendor(techniqueTextName(tech));
    expect(store.getState().player!.knownTechniques ?? []).not.toContain(tech.id);
  });
});

// ─── IN COMBAT ──────────────────────────────────────────────────────────────────────────
//
// ⚠⚠ The three claims below are the ones a source-reading test cannot make. "The runner
// calls runSurvivorVolley" is not "the enemy actually swung"; "the slip is filtered out of
// statusEffects" is not "the blow did not land".

import { findEnemyByName } from '../app/engine/encounter';
import { runEnemyGroupCounters } from '../app/state/gameStore';

function plantEnemies(count: number) {
  const proto = findEnemyByName('Silt Serpent') ?? findEnemyByName('Mud Spider');
  const enemies = Array.from({ length: count }, () => JSON.parse(JSON.stringify(proto)));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies,
      enemyHps: enemies.map((e: { hp: number }) => e.hp),
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: enemies.map(() => false),
      enemyKnockedOut: enemies.map(() => false),
    },
  });
  return enemies;
}

describe('OTA-1218 / P16 — in a fight', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ channelling COSTS THE TURN — the enemy group answers', async () => {
    const store = await freshCharacter('Turn Probe');
    armFor('aether_shield');
    plantEnemies(1);
    const enemyName = store.getState().currentScene!.enemies[0]!.name;
    const before = store.getState().gameLog.length;

    await store.getState().submitPlayerAction('channel aether shield');

    const since = store.getState().gameLog.slice(before).map((l: { text: string }) => l.text).join('\n');
    // ⚠ Scoped to the lines THIS action emitted. A whole-feed join would let an earlier
    // arrival's combat line answer for this one — the OTA-1209 mistake.
    expect(since).toMatch(/Aether Shield — d20/);
    expect(since).toMatch(new RegExp(`${enemyName} — d20`));
  });

  test('⚠⚠ a held Temporal Slip eats a blow that would otherwise have landed', async () => {
    const store = await freshCharacter('Slip Probe');
    plantEnemies(1);
    // The slip is planted directly: the CHANNEL is proved above, and forcing a specific
    // technique to succeed on a d20 would make this test about the roll instead of the
    // effect. AC 1 so the enemy connects on essentially anything.
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p, hp: p.hpMax,
        statusEffects: [{ kind: 'temporal_slip', remainingRounds: 3, label: 'temporal slip (one blow)' }],
      },
    });

    let sawSlip = false;
    for (let i = 0; i < 30 && !sawSlip; i++) {
      const before = store.getState().gameLog.length;
      runEnemyGroupCounters(useGameStore.getState as never, useGameStore.setState as never, store.getState().player!);
      const since = store.getState().gameLog.slice(before).map((l: { text: string }) => l.text).join('\n');
      if (/SLIPPED/.test(since)) sawSlip = true;
      if (!sawSlip) {
        // Re-arm and heal: only a swing that WOULD have landed can be slipped, so a run of
        // misses is not evidence of anything either way.
        const q = store.getState().player!;
        useGameStore.setState({
          player: {
            ...q, hp: q.hpMax,
            statusEffects: [{ kind: 'temporal_slip', remainingRounds: 3, label: 'temporal slip (one blow)' }],
          },
        });
      }
    }
    expect(sawSlip).toBe(true);
    // Spent, not lingering.
    expect((store.getState().player!.statusEffects ?? []).some((e) => e.kind === 'temporal_slip')).toBe(false);
  });

  test('⚠⚠ THE ANTI-FARM GUARD, LIVE — practice at a wall teaches nothing', async () => {
    // Growth-through-use is farmable by construction, so `practiceCounts` requires a
    // success UNDER PRESSURE. This drives it both ways rather than trusting the source pin.
    const store = await freshCharacter('Farm Probe');

    // (a) Empty room, up to 30 channels. Successes happen; the counter must not move.
    for (let i = 0; i < 30; i++) {
      armFor('aether_shield');
      await store.getState().submitPlayerAction('channel aether shield');
    }
    const quiet = store.getState().player!;
    expect(quiet.techniqueProficiency?.['aether_shield'] ?? 0).toBe(0);
    // ⚠ The premise: it really was succeeding. Otherwise this proves nothing but bad luck.
    expect(tail(400)).toMatch(/Aether Shield — d20.*✓ CHANNELLED/s);

    // (b) With something in the room trying to kill you, a success counts.
    let grew = false;
    for (let i = 0; i < 30 && !grew; i++) {
      armFor('aether_shield');
      if ((store.getState().currentScene?.enemies.length ?? 0) === 0) plantEnemies(1);
      const q = store.getState().player!;
      useGameStore.setState({ player: { ...q, hp: q.hpMax } });
      await store.getState().submitPlayerAction('channel aether shield');
      grew = (store.getState().player!.techniqueProficiency?.['aether_shield'] ?? 0) > 0;
    }
    expect(grew).toBe(true);
  });

  test('⚠⚠ Resonance Cascade hits EVERY standing enemy and comes back through you', async () => {
    const store = await freshCharacter('Cascade Probe');
    armFor('resonance_cascade');
    const enemies = plantEnemies(3);
    const hpBefore = store.getState().player!.hp;

    let fired = false;
    for (let i = 0; i < 40 && !fired; i++) {
      const before = store.getState().gameLog.length;
      await store.getState().submitPlayerAction('channel resonance cascade');
      const since = store.getState().gameLog.slice(before).map((l: { text: string }) => l.text).join('\n');
      if (/Resonance Cascade — 5d10/.test(since)) { fired = true; break; }
      // Re-arm fuel and clear the dose so the loop is about the d20, not attrition.
      armFor('resonance_cascade');
      if ((store.getState().currentScene?.enemies.length ?? 0) === 0) plantEnemies(3);
      const q = store.getState().player!;
      useGameStore.setState({ player: { ...q, hp: q.hpMax } });
    }
    expect(fired).toBe(true);
    // Everything that was standing took it — either it is hurt, or it is dead and gone.
    const sc = store.getState().currentScene;
    const survivors = sc?.enemies.length ?? 0;
    const allHurt = (sc?.enemyHps ?? []).every((h, i) => (h ?? 0) < (sc!.enemies[i]!.hp));
    expect(survivors < enemies.length || allHurt).toBe(true);

    // ⚠⚠ THE KICKBACK IS READ OFF ITS OWN LINE, NOT OFF THE PLAYER'S FINAL HP — and the
    // first version of this test got that wrong and went red for the right reason. The
    // channel costs the turn, so three surviving serpents swing immediately afterwards and
    // CAN kill a fresh character. That is combat working, not the technique killing you.
    // Asserting on final HP would have made this test fail whenever the volley rolled well
    // and pass whenever it rolled badly, while claiming to be about the 1d10.
    const feed = store.getState().gameLog.map((l: { text: string }) => l.text).join('\n');
    const kick = /comes back through you — 1d10 → (\d+)\. \(HP (\d+)\/(\d+)\)/.exec(feed);
    expect(kick).not.toBeNull();
    expect(Number(kick![1])).toBeGreaterThan(0);
    expect(Number(kick![2])).toBeGreaterThan(0);   // the 1d10 alone never kills the operator
    expect(Number(kick![2])).toBeLessThan(hpBefore);
  });
});
