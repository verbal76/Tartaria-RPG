// Phase 3D, Part 1 — vendor doors, small bounded scenarios.
//
// Scenario A: fresh character -> legitimate tutorial -> ordinary hub-room
// navigation (typed cardinal movement, free/costless per production's own
// "interior outpost movement is FREE" design) to a hand-authored vendor room
// (outpost_armory / outpost_messhall — guaranteed present at the tutorial
// hub itself, confirmed by Phase 3D research trace against
// app/data/world/static_hub.json). Zero wilderness exposure, zero combat
// risk. Qualifies BUY, SELL, NPC RECRUIT.
//
// Scenario B: a SEPARATE small bounded excursion — step outside the gate,
// resolve at most one naturally-spawned encounter with a conservative
// capable-human policy (flee well before critical, per the Phase 3C death
// post-mortem), return to the hub vendor. Only if this legitimately produces
// item durability loss does it attempt VENDOR REPAIR / REINFORCEMENT — never
// forced, never injected.
//
// Run focused: see the governed command in the Phase 3D final report.

// Phase 6 methodology correction (Section E.2) — bootFreshTutorialComplete()
// now fails closed unless production weather is demonstrably active. This
// file drives real gameplay actions through CanonicalActionExecutor, so it
// unmocks jest.setup.js's default pickWeather() stub the same way
// canonicalWeatherProduction.test.ts already proved restores it.
jest.unmock('../app/engine/encounter');

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

jest.setTimeout(180000);

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { bootFreshTutorialComplete } from '../test-utils/canonical/bootHelpers';
import { buildPlayerView } from '../test-utils/canonical/playerView';
import { decide, type DecisionOption } from '../test-utils/canonical/policy';
import { fileFromActionRecord, blocked } from '../test-utils/canonical/qualificationHelpers';
import { getQualifications } from '../test-utils/canonical/qualification';
import type { ActionRecord } from '../test-utils/canonical/actionExecutor';
import { detachRngLedger } from '../test-utils/canonical/rngLedger';
import { detachStoreDiffer } from '../test-utils/canonical/storeDiffer';
import { uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';

describe('Phase 3D — vendor doors (bounded, small, human-legitimate scenarios)', () => {
  it('Scenario A: hub-only navigation to a vendor room; BUY/SELL/NPC-RECRUIT', async () => {
    const { store, get, executor } = await bootFreshTutorialComplete();

    // Locate a vendor room via ordinary, bounded hub navigation — no
    // teleport, no injected state. The hub graph (static_hub.json) puts the
    // Armory/Mess Hall/Workshop one edge off the Central Square, which is
    // itself one edge off the Gate (the documented tutorial entry room).
    // Try a small, bounded sequence of legitimate typed directions.
    const CANDIDATE_PATHS: string[][] = [
      ['north', 'east'],  // gate -> central -> armory
      ['north', 'west'],  // gate -> central -> mess
      ['east'], ['west'], ['north'], ['south'],
    ];
    let foundVendor = !!get().currentScene?.vendor;
    if (!foundVendor) {
      for (const path of CANDIDATE_PATHS) {
        // Reset to the gate room isn't a door we have — so this is a single
        // forward walk, trying the most likely path first and stopping the
        // moment a vendor is found; a real player exploring a 4-exit square
        // would do exactly this.
        for (const dir of path) {
          await get().submitPlayerAction(dir);
          if (get().currentScene?.vendor) { foundVendor = true; break; }
        }
        if (foundVendor) break;
      }
    }

    if (!foundVendor) {
      blocked('ECONOMY-BUY', 'a vendor room reachable via bounded hub navigation', 'no vendor scene found within the bounded directional search from the tutorial gate room');
      blocked('ECONOMY-SELL', 'a vendor room reachable via bounded hub navigation', 'no vendor scene found within the bounded directional search from the tutorial gate room');
      blocked('COMPANIONS', 'a vendor room reachable via bounded hub navigation', 'no vendor scene found within the bounded directional search from the tutorial gate room');
    } else {
      const vendor = get().currentScene!.vendor!;

      // BUY — cheapest offer the character can actually afford.
      const tc = get().player?.tc ?? 0;
      const offers = (vendor as { offers?: readonly { itemName: string; price: number }[] }).offers ?? [];
      const affordable = [...offers].filter((o) => o.price <= tc).sort((a, b) => a.price - b.price)[0];
      if (affordable) {
        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'buy', category: 'buy', label: `buy ${affordable.itemName}` }]);
        let record: ActionRecord | null = null;
        try { record = await executor.buy(affordable.itemName, decision); } catch { record = null; }
        fileFromActionRecord(
          'ECONOMY-BUY', `vendor offer '${affordable.itemName}' priced ${affordable.price} <= player.tc ${tc}, reached via bounded hub navigation`, `buy ${affordable.itemName}`,
          'VendorScreen.tsx buy row', record, null, { tc }, { tc: get().player?.tc },
          'player.tc decreases by displayed price; item granted to inventory', 'vendor.offers[].quantity decremented',
        );
      } else {
        blocked('ECONOMY-BUY', 'an affordable vendor offer', `no vendor offer priced at or under player.tc (${tc}) — character's starting TC roll was too low for anything on this shelf`);
      }

      // SELL — an unequipped, non-cudgel item (a capable player would sell a
      // spare, not their only weapon or worn armor).
      const view2 = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const equippedIds = new Set(Object.values(get().player?.equipped ?? {}).filter((v): v is string => typeof v === 'string'));
      const sellCandidate = view2.inventory.find((i) => !equippedIds.has(i.instanceId) && !i.name.toLowerCase().includes('cudgel'));
      if (sellCandidate) {
        const decision = decide(view2, [{ id: 'sell', category: 'sell', label: `sell ${sellCandidate.name}` }]);
        let record: ActionRecord | null = null;
        try { record = await executor.sell(sellCandidate.name, decision, sellCandidate.instanceId); } catch { record = null; }
        fileFromActionRecord(
          'ECONOMY-SELL', `unequipped item '${sellCandidate.name}' in inventory, at a vendor room reached via bounded hub navigation`, `sell ${sellCandidate.name}`,
          'VendorScreen.tsx sell row', record, null, { tc: get().player?.tc }, { tc: get().player?.tc },
          'player.tc increases by displayed price; item removed/decremented', 'NPC relationship ledger (recordNpcDealing) updated',
        );
      } else {
        blocked('ECONOMY-SELL', 'an unequipped, non-cudgel sellable item', 'no unequipped non-cudgel item available to sell after the tutorial');
      }

      // NPC RECRUIT — free, any vendor scene, no existing companion.
      if (!get().player?.companion) {
        const view3 = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view3, [{ id: 'recruit', category: 'companion', label: 'recruit' }]);
        let record: ActionRecord | null = null;
        try { record = await executor.companionCommand('recruit', decision); } catch { record = null; }
        fileFromActionRecord(
          'COMPANIONS', 'standing in a vendor room reached via bounded hub navigation, no existing NPC companion', 'recruit',
          'universal text input (no cost, no roll)', record, null, { companion: null }, { companion: get().player?.companion ?? null },
          'player.companion set; companionAssist bonus now feeds investigate/maneuver/rest/escape skill checks', 'buildSkillSteps reads companionAssist:!!player.companion',
        );
      } else {
        blocked('COMPANIONS', 'no existing NPC companion', 'player already has a companion');
      }
    }

    const outPath = resolve(__dirname, '..', 'test-utils', 'canonical', 'qualificationResultsPhase3D.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));

    expect(getQualifications().length).toBeGreaterThan(0);
    detachRngLedger();
    detachStoreDiffer();
    uninstallCanonicalClock();
  });

  it('Scenario B: one controlled wilderness excursion; VENDOR REPAIR / REINFORCEMENT if damage naturally occurs', async () => {
    // resetQualLedger=false: appends to Scenario A's qualification entries
    // within this same test file/process (one file's ledger, not reset
    // between its own it() blocks).
    const { get, executor, walker } = await bootFreshTutorialComplete(false);
    const startingLocationId = get().player!.currentLocationId;

    // Step out of the hub, then advance a small, BOUNDED number of
    // wilderness tiles along the course the tutorial's own pick_city beat
    // already set — the same door Phase 3B/3C's proofs use — stopping the
    // moment an encounter appears. This is a short leg, not a journey to
    // the capital.
    await get().submitPlayerAction('leave outpost');
    const MAX_TRAVEL_STEPS = 25;
    for (let i = 0; i < MAX_TRAVEL_STEPS && (get().currentScene?.enemies.length ?? 0) === 0; i++) {
      await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'bounded excursion — looking for one natural encounter' });
    }

    const MAX_ROUNDS = 12;
    let tookDamage = false;
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const enemyCount = get().currentScene?.enemies.length ?? 0;
      if (enemyCount === 0) break;
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const hpRatio = view.hp / view.hpMax;
      // Conservative capable-human threshold this time (flee at 50%, not
      // 30%) — the direct post-mortem lesson from Phase 3C's death.
      if (hpRatio < 0.5) {
        const decision = decide(view, [{ id: 'flee', category: 'survive-flee', label: 'flee' }]);
        await executor.combatFlee(decision);
      } else {
        const decision = decide(view, [{ id: 'attack', category: 'critical-path', label: 'attack' }]);
        await executor.combatAttack(decision);
      }
      const dmg = (get().player?.inventory ?? []).some((it) => it.durability && it.durability.current < it.durability.max);
      if (dmg) { tookDamage = true; break; }
    }
    if (process.env.QUAL_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('QUAL_DEBUG post-combat', JSON.stringify({
        enemies: get().currentScene?.enemies.length,
        hp: get().player?.hp,
        inv: (get().player?.inventory ?? []).map((i) => ({ name: i.name, dur: i.durability })),
      }));
    }

    // A capable player who just took a hit worth noticing disengages rather
    // than pressing a fight they didn't need to finish — flee any remaining
    // live hostiles before heading home (avoidance is legitimate; see Phase
    // 3D research trace on continueTravel()'s lack of an enemy gate).
    if ((get().currentScene?.enemies.length ?? 0) > 0 && !get().player?.dead) {
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const decision = decide(view, [{ id: 'flee', category: 'survive-flee', label: 'flee' }]);
      try { await executor.combatFlee(decision); } catch { /* best-effort disengage */ }
    }

    if (!get().currentScene?.vendor) {
      // A capable player heads for the NEAREST vendor, not necessarily
      // home — every Lost Capital always carries a named vendor (Phase 3D
      // research trace, gameStore.ts:9926-9967). If the excursion already
      // carried the character into a different capital's territory, that
      // capital's own canonical cell is a legitimately closer repair stop
      // than trekking all the way back to the tutorial outpost.
      const nearestCapital = LOST_CAPITAL_LOCATIONS.find((id) => id === get().player?.currentLocationId);
      get().setTravelCourse(nearestCapital ?? startingLocationId);
      for (let i = 0; i < 70 && !get().currentScene?.vendor && get().player?.travelTarget; i++) {
        const p = get().player!;
        if (p.dead) break;
        const enemiesHere = get().currentScene?.enemies.length ?? 0;
        if (enemiesHere > 0) {
          // Resolve it through the real combat door rather than stalling —
          // flee can itself require stamina/fail, so a depleted character
          // fights it out (attack unless critically low, matching the
          // same survive-heal/flee thresholds proven safe already).
          const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
          const hpRatio = view.hp / view.hpMax;
          const options: DecisionOption[] = hpRatio < 0.3
            ? [{ id: 'flee', category: 'survive-flee', label: 'flee' }]
            : [{ id: 'attack', category: 'critical-path', label: 'attack' }];
          const decision = decide(view, options);
          if (decision.optionId === 'flee') { try { await executor.combatFlee(decision); } catch { /* best-effort */ } }
          else { try { await executor.combatAttack(decision); } catch { /* best-effort */ } }
          continue;
        }
        if (p.stamina <= 0 || p.hp / p.hpMax < 0.4) {
          await executor.restNormally({ optionId: 'rest', category: 'other', reason: 'stamina/hp low on the return leg' });
          continue;
        }
        await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'returning to the outpost vendor after the excursion' });
      }
      if (process.env.QUAL_DEBUG) {
        // eslint-disable-next-line no-console
        console.log('QUAL_DEBUG post-return', JSON.stringify({
          locationId: get().player?.currentLocationId, startingLocationId, hubRoomId: get().player?.hubRoomId,
          travelTarget: get().player?.travelTarget, vendor: !!get().currentScene?.vendor,
          hp: get().player?.hp, stamina: get().player?.stamina, dead: get().player?.dead, enemies: get().currentScene?.enemies.length,
        }));
      }
      // Arrival at a Lost Capital's tile is NOT arrival inside its hub — the
      // gate opens on a tap, not on arrival (OTA-1606, gameStore.ts:12649).
      // A capable player standing on the capital's ground types the real
      // door ('enter outpost'/'enter gate') before trying interior moves.
      if (!get().player?.hubRoomId) {
        await get().submitPlayerAction('enter outpost');
      }
      // Arriving back inside the hub may land in a non-vendor room; take a
      // couple of bounded interior steps toward the known armory route.
      for (const dir of ['north', 'east'] as const) {
        if (get().currentScene?.vendor) break;
        await get().submitPlayerAction(dir);
      }
      if (process.env.QUAL_DEBUG) {
        // eslint-disable-next-line no-console
        console.log('QUAL_DEBUG post-enter', JSON.stringify({
          hubRoomId: get().player?.hubRoomId, vendor: !!get().currentScene?.vendor,
        }));
      }
    }

    const damaged = (get().player?.inventory ?? []).find((it) => it.durability && it.durability.current < it.durability.max);
    if (damaged && get().currentScene?.vendor) {
      const view4 = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const decision = decide(view4, [{ id: 'repair', category: 'repair', label: `repair ${damaged.name}` }]);
      let record: ActionRecord | null = null;
      try { record = await executor.repair(damaged.name, decision); } catch { record = null; }
      fileFromActionRecord(
        'MAINTENANCE-VENDOR-REPAIR', `item '${damaged.name}' durability ${damaged.durability!.current}/${damaged.durability!.max} from a real, legitimately-fought controlled encounter; vendor present`, `repair ${damaged.name}`,
        'VendorScreen.tsx repair card', record, null, { tc: get().player?.tc, durability: damaged.durability }, { tc: get().player?.tc },
        'durability restored to max, TC spent', 'combat AC/effectiveness reads restored durability',
      );
      const tc2 = get().player?.tc ?? 0;
      if (tc2 > 0) {
        const view5 = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const reinforceCandidate = view5.inventory.find((i) => i.durability);
        if (reinforceCandidate) {
          const decision2 = decide(view5, [{ id: 'reinforce', category: 'reinforce', label: `reinforce ${reinforceCandidate.name}` }]);
          let record2: ActionRecord | null = null;
          try { record2 = await executor.reinforce(reinforceCandidate.name, decision2, reinforceCandidate.instanceId); } catch { record2 = null; }
          fileFromActionRecord(
            'MAINTENANCE-REINFORCE', `item '${reinforceCandidate.name}' owned, vendor present, player.tc ${tc2}`, `reinforce ${reinforceCandidate.name}`,
            'VendorScreen.tsx reinforce row', record2, null, { tc: tc2 }, { tc: get().player?.tc },
            'durability.max permanently increased (capped at REINFORCE_MAX_LEVEL), TC+materials spent', 'combat AC/effectiveness reads the new max',
          );
        } else {
          blocked('MAINTENANCE-REINFORCE', 'an item with a durability field owned', 'no durability-bearing item found post-repair');
        }
      } else {
        blocked('MAINTENANCE-REINFORCE', 'sufficient TC for a reinforceWithVendor quote', 'player.tc is 0 after this bounded excursion (any starting TC was not spent here, or race rolled 0)');
      }
    } else if (!tookDamage) {
      blocked('MAINTENANCE-VENDOR-REPAIR', 'a damaged item from a legitimate controlled encounter', `no durability loss occurred within ${MAX_ROUNDS} bounded combat rounds — either no encounter spawned on the single wilderness tile, or the fight ended before any item took wear`);
      blocked('MAINTENANCE-REINFORCE', 'a vendor scene reached after the excursion (or a damaged item)', 'no damaged item and/or no vendor reached this run');
    } else {
      blocked('MAINTENANCE-VENDOR-REPAIR', 'a vendor scene reached after the excursion', 'durability loss occurred but the return path to a vendor scene was not found within the bounded step budget');
      blocked('MAINTENANCE-REINFORCE', 'a vendor scene reached after the excursion', 'same — vendor not reached');
    }

    const outPath = resolve(__dirname, '..', 'test-utils', 'canonical', 'qualificationResultsPhase3D.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));

    walker.drainRolls(); // safety: settle any open roll before teardown
    detachRngLedger();
    uninstallCanonicalClock();
  });

  it('Scenario C: BENCH REPAIR — independent of vendor repair, using legitimately-worn gear and gathered materials', async () => {
    const { get, executor, walker } = await bootFreshTutorialComplete(false);

    // Same small controlled excursion pattern as Scenario B, but this
    // mechanism needs no vendor at all (repairInventoryItem is not
    // location-gated — Phase 3D research trace) — only a legitimately
    // damaged item and the materials repairCostMaterials() asks for.
    const MAX_TRAVEL_STEPS = 25;
    const MAX_ROUNDS = 12;
    get().submitPlayerAction('leave outpost');
    for (let i = 0; i < MAX_TRAVEL_STEPS && (get().currentScene?.enemies.length ?? 0) === 0; i++) {
      await executor.travelContinue({ optionId: 'continue', category: 'journey', reason: 'small bounded excursion to find a natural encounter' });
    }
    for (let round = 0; round < MAX_ROUNDS && (get().currentScene?.enemies.length ?? 0) > 0; round++) {
      const p = get().player!;
      if (p.dead) break;
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const hpRatio = view.hp / view.hpMax;
      const options: DecisionOption[] = hpRatio < 0.5
        ? [{ id: 'flee', category: 'survive-flee', label: 'flee' }]
        : [{ id: 'attack', category: 'critical-path', label: 'attack' }];
      const decision = decide(view, options);
      if (decision.optionId === 'flee') { try { await executor.combatFlee(decision); } catch { /* best-effort */ } }
      else { try { await executor.combatAttack(decision); } catch { /* best-effort */ } }
      const anyDamaged = (get().player?.inventory ?? []).some((it) => it.durability && it.durability.current < it.durability.max);
      if (anyDamaged) break;
    }

    const damaged = (get().player?.inventory ?? []).find((it) => it.durability && it.durability.current < it.durability.max);
    if (!get().player?.dead && !damaged) {
      blocked('MAINTENANCE-BENCH-REPAIR', 'a damaged item from a legitimate controlled encounter', `no durability loss occurred within ${MAX_ROUNDS} bounded combat rounds in this SEPARATE excursion`);
    } else if (get().player?.dead) {
      blocked('MAINTENANCE-BENCH-REPAIR', 'a damaged item, reached alive', 'the character died legitimately during this bounded excursion before any repair could be attempted — no revive attempted');
    } else {
      // Gather repairCostMaterials(item) legitimately: scrap a spare item for
      // generic materials (metal/cloth), bounded, before attempting the repair.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { repairCostMaterials, canScrap } = require('../app/engine/scrapEngine') as {
        repairCostMaterials: (item: unknown) => Array<{ name: string; quantity: number }>;
        canScrap: (item: unknown) => boolean;
      };
      const damagedItem = damaged!;
      const cost = repairCostMaterials(damagedItem);
      let guard = 0;
      const haveAll = () => cost.every((c) => (get().player?.inventory ?? []).filter((i) => i.name === c.name).reduce((s, i) => s + i.quantity, 0) >= c.quantity);
      while (!haveAll() && guard < 10) {
        guard++;
        const inv = get().player?.inventory ?? [];
        const equippedNames = new Set(Object.values(get().player?.equipped ?? {}).filter(Boolean) as string[]);
        const spare = inv.find((it) => it.id !== damagedItem.id && it.quantity > 1 && canScrap(it))
          ?? inv.find((it) => it.id !== damagedItem.id && !equippedNames.has(it.name) && canScrap(it));
        if (spare) {
          const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
          const decision = decide(view, [{ id: 'scrap', category: 'scrap', label: `scrap ${spare.name}` }]);
          try { await executor.scrapItem(spare.name, decision, spare.id); } catch { /* best-effort, RNG-gated */ }
          continue;
        }
        // Scrap alone does not cover every material family (e.g. stone-tagged
        // materials like Small Rock come from ambient salvage pools, not
        // scrapInventoryItem — Phase 3D research trace). Fall back to
        // bulk-salvaging whatever real ambient nouns this wilderness scene
        // exposes, still bounded, still never injected.
        const nouns = (get().currentScene?.displayedAmbientNouns ?? get().currentScene?.ambientNouns ?? []) as string[];
        if (nouns.length) {
          const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
          const decision = decide(view, [{ id: 'salvage', category: 'loot', label: `salvage ${nouns.join(', ')}` }]);
          try { await executor.salvageAmbient(nouns, decision); } catch { /* best-effort, RNG-gated */ }
          continue;
        }
        break;
      }

      if (!haveAll()) {
        blocked('MAINTENANCE-BENCH-REPAIR', `owns the repair materials repairCostMaterials() requires (${JSON.stringify(cost)}) for the damaged '${damagedItem.name}'`, `could not gather all required materials within ${guard} bounded scrap attempts — inventory: ${JSON.stringify((get().player?.inventory ?? []).map((i) => `${i.name} x${i.quantity}`))}`);
      } else {
        const before = { name: damagedItem.name, durability: { ...damagedItem.durability } };
        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'repair', category: 'repair', label: `repair (bench) ${damagedItem.name}` }]);
        let record: ActionRecord | null = null;
        let err: unknown = null;
        try { record = await executor.repairAtBench(damagedItem.id, decision); } catch (e) { err = e; }
        const afterItem = (get().player?.inventory ?? []).find((it) => it.id === damagedItem.id);
        fileFromActionRecord(
          'MAINTENANCE-BENCH-REPAIR', `owns a damaged item ('${damagedItem.name}') and its required materials (${JSON.stringify(cost)})`, `repair (bench) ${damagedItem.name}`,
          'CraftingScreen.tsx Repair control', record, err, before,
          { durability: afterItem?.durability ?? null },
          `durability changed ${JSON.stringify(before.durability)} -> ${JSON.stringify(afterItem?.durability)}, materials consumed — distinct cost model (materials, not TC) from vendor repair, per owner instruction never merged into one generic claim`,
          'n/a',
        );
      }
    }

    const outPath = resolve(__dirname, '..', 'test-utils', 'canonical', 'qualificationResultsPhase3D.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));

    walker.drainRolls();
    detachRngLedger();
    uninstallCanonicalClock();
  });
});
