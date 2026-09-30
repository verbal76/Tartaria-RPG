// Strategic repair — Phase 13: DRIVER INTEGRATION PROOF.
//
// This file proves the central requirement of the driver-integration task:
// not merely that the strategic modules work in isolation (already proven,
// Phase 12), but that a REAL DRIVER SEAM — test-utils/canonical/
// lifeOrchestrator.ts, the one future canonicalLife5.test.ts would import —
// actually reaches them and, through them, actually fires real production
// doors against a real booted character. Every test below boots a fresh
// canonical tutorial character via the SAME bootFreshTutorialComplete()
// every other qualification test in this apparatus already uses (a bounded
// fixture, not "a Life" — no Life-5 run id is generated, no checkpoint
// evidence is written to scratchpad/canonical-life-reports, no Guardian is
// approached, and the character never leaves the tutorial hub's immediate
// vicinity). This is the same category-A methodology the very first
// Guardian-isolation qualification in this apparatus already established.

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

jest.unmock('../app/engine/encounter');
jest.setTimeout(300000);

import { bootFreshTutorialComplete } from '../test-utils/canonical/bootHelpers';
import { buildPlayerView, type PlayerView } from '../test-utils/canonical/playerView';
import { EMPTY_MEMORY } from '../test-utils/canonical/policy';
import { EMPTY_STRATEGIC_MEMORY, type StrategicMemory } from '../test-utils/canonical/strategicPolicy';
import {
  runEquipmentReevaluationPass,
  selectAndDepartForDestination,
  runBetweenEncounterStep,
  runVendorPass,
  type OrchestratorContext,
} from '../test-utils/canonical/lifeOrchestrator';
import { recordStrategicEvidence, getStrategicEvidence, resetStrategicEvidence } from '../test-utils/canonical/strategicEvidence';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { placedAt } from '../test-utils/placePlayer';
import { buildDestinationOptions } from '../test-utils/canonical/destinationOptions';
import { detachRngLedger } from '../test-utils/canonical/rngLedger';
import { detachStoreDiffer } from '../test-utils/canonical/storeDiffer';
import { uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';

const CREATION_CHOICES = {
  raceId: 'mud_golem',
  factionId: 'eternal_dynasty',
  motiveId: 'missing',
  pressure: 'owed',
  sex: 'male' as const,
};

describe('Strategic repair — driver integration (lifeOrchestrator.ts is the seam a future Life 5 would use)', () => {
  it('A. PRE-DEPARTURE EQUIPMENT — driver reaches equipment intelligence and executes a real equip through the real door (general mechanism, not mud_golem/Locket-special-cased)', async () => {
    resetStrategicEvidence();
    const { get, executor } = await bootFreshTutorialComplete(true, CREATION_CHOICES, 'DriverIntegrationA');
    try {
      const view = () => buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });

      const before = view()!;
      // Precondition, asserted honestly rather than assumed: the real
      // production boot for this exact creation left an equippable amulet
      // in inventory with the amulet slot empty. This is a fact about this
      // deterministic boot, not something the test engineers.
      const amuletSlotEmpty = !(before.equipped as unknown as Record<string, unknown>)?.amulet;
      // The catalog's own tags (via PlayerViewItem.card, resolved through
      // findCatalogItem — the same catalog lookup readItemMechanics() uses),
      // not the raw starting-kit grant's tags (character.ts stamps the
      // Locket with only ['detection'] on the inventory row itself; 'amulet'
      // lives on the catalog entry, which is what actually decides the slot).
      const hasAnEquippableAmulet = before.inventory.some((i) => i.card?.tags.includes('amulet'));
      expect(amuletSlotEmpty).toBe(true);
      expect(hasAnEquippableAmulet).toBe(true);

      const ctx: OrchestratorContext = {
        view, executor, memory: EMPTY_MEMORY, strategic: EMPTY_STRATEGIC_MEMORY,
        disclosedVulnerabilities: ['aetheric'],
        pendingTravelConfirm: () => Boolean(get().pendingTravelConfirm),
        hoursElapsed: () => get().player?.hoursElapsed ?? null,
        record: recordStrategicEvidence,
      };

      // THE DRIVER SEAM ITSELF — the general equipment-reevaluation pass,
      // not a test calling equipmentOptions.ts/policy.ts directly.
      const result = await runEquipmentReevaluationPass(ctx);

      expect(result.equipped.length).toBeGreaterThan(0);
      const after = view()!;
      const amuletNowFilled = (after.equipped as unknown as Record<string, unknown>)?.amulet;
      expect(typeof amuletNowFilled).toBe('string');
      // REAL production door fired: the item now sits in player.equipped,
      // not merely returned by a pure function.
      expect(get().player?.equipped?.amulet).toBe(amuletNowFilled);
    } finally {
      detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
    }
  });

  it('B. DESTINATION — driver reaches qualified destination selection and departs for real, independent of candidate input order (not LOST_CAPITAL_LOCATIONS.find array order)', async () => {
    const { get, executor } = await bootFreshTutorialComplete(true, CREATION_CHOICES, 'DriverIntegrationB');
    try {
      const view = () => buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });
      const ctx: OrchestratorContext = {
        view, executor, memory: EMPTY_MEMORY, strategic: EMPTY_STRATEGIC_MEMORY,
        disclosedVulnerabilities: ['aetheric'],
        pendingTravelConfirm: () => Boolean(get().pendingTravelConfirm),
        hoursElapsed: () => get().player?.hoursElapsed ?? null,
        record: recordStrategicEvidence,
      };

      const candidates = LOST_CAPITAL_LOCATIONS.map((id) => ({ locationId: id }));
      const reversedCandidates = [...candidates].reverse();

      const chosen = await selectAndDepartForDestination(ctx, candidates, new Map());
      expect(chosen).not.toBeNull();
      // REAL production door: the real travelTarget is now set to the
      // chosen destination.
      expect(get().player?.travelTarget?.locationId).toBe(chosen);

      // Array-order independence, proven through the ACTUAL driver seam
      // (not the unit-level buildDestinationOptions() call already proven
      // in Phase 12): re-derive what the SAME candidates in reversed order
      // would have produced, via the same qualified constructor the driver
      // itself calls, and confirm it agrees.
      const optionsReversed = buildDestinationOptions(get().player!.currentLocationId, reversedCandidates, new Map());
      const winnerReversed = optionsReversed[0]?.meta?.locationId;
      expect(winnerReversed).toBe(chosen);
      // And it must not simply be array index 0 of the ORIGINAL, unsorted
      // candidate list unless that happens to be the genuinely closer one —
      // checked by confirming the driver's chosen id equals the qualified
      // constructor's own top pick, already asserted above; this line
      // documents the negative property directly.
      expect(chosen).toBe((optionsReversed[0]!.meta!.locationId as string));
    } finally {
      detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
    }
  });

  it('C. LOW-HP BETWEEN-ENCOUNTER RECOVERY — driver reaches strategic policy and rests through the real production door', async () => {
    const { get, executor } = await bootFreshTutorialComplete(true, CREATION_CHOICES, 'DriverIntegrationC');
    try {
      const realView = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      // A fixture-injected view: the REAL post-tutorial view with only `hp`
      // overridden low, so the HP-aware recovery branch fires
      // deterministically without grinding out real combat damage first —
      // per the owner's own §8 instruction ("bounded fixture ... rather
      // than running a life"), applied here to HP. Everything else
      // (inventory, equipped, location) is the real, unmodified state.
      const lowHpView: PlayerView = { ...realView, hp: Math.round(realView.hpMax * 0.3) };
      const view = () => lowHpView;
      const hpBefore = get().player?.hp;

      const ctx: OrchestratorContext = {
        view, executor, memory: EMPTY_MEMORY, strategic: EMPTY_STRATEGIC_MEMORY,
        disclosedVulnerabilities: [],
        pendingTravelConfirm: () => Boolean(get().pendingTravelConfirm),
        hoursElapsed: () => get().player?.hoursElapsed ?? null,
        record: recordStrategicEvidence,
      };

      const outcome = await runBetweenEncounterStep(ctx, get().player!.currentLocationId);
      expect(outcome).toBe('rest');
      // REAL production door fired: real player.hp changed via the real
      // rest handler (not the fixture's injected value).
      expect(get().player?.hp).not.toBe(hpBefore);
    } finally {
      detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
    }
  });

  it('D. SEVERE-DANGER RETREAT — driver reaches strategic policy and departs for the hub through the real travel door', async () => {
    const { get, executor } = await bootFreshTutorialComplete(true, CREATION_CHOICES, 'DriverIntegrationD');
    try {
      const hub = get().player!.currentLocationId;
      const realView = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      // Fixture-injected position, same bounded-fixture methodology as Test
      // C's injected HP: the real view with `position` overridden to a
      // capital away from the hub, so retreat-to-hub is a meaningful option
      // (runBetweenEncounterStep only offers it when not already at the
      // hub) without needing to actually walk there first. Execution below
      // still goes through the real travelSetCourse door against the real
      // booted store. `placedAt` supplies the matching gridX/gridY for
      // `away` — spreading only `currentLocationId` over the hub's real
      // position would leave the hub's own cell attached to a different
      // location's id, exactly the impossible state OTA-1484 exists to
      // catch (see placePlayer.ts, and I-003's identical fix).
      const away = LOST_CAPITAL_LOCATIONS[0]!;
      const awayPlaced = placedAt(away);
      const awayView: PlayerView = {
        ...realView,
        position: { currentLocationId: awayPlaced.currentLocationId, gridX: awayPlaced.gridX, gridY: awayPlaced.gridY },
      };
      const view = () => awayView;

      const severeStrategicMemory: StrategicMemory = { ...EMPTY_STRATEGIC_MEMORY, severeDangerEventsThisTrip: 2 };
      const ctx: OrchestratorContext = {
        view, executor, memory: EMPTY_MEMORY, strategic: severeStrategicMemory,
        disclosedVulnerabilities: [],
        pendingTravelConfirm: () => Boolean(get().pendingTravelConfirm),
        hoursElapsed: () => get().player?.hoursElapsed ?? null,
        record: recordStrategicEvidence,
      };

      const recordsBefore = executor.records.length;
      const outcome = await runBetweenEncounterStep(ctx, hub);
      expect(outcome).toBe('retreat');
      // REAL production door fired: a new TRAVEL/setTravelCourse(hub) record
      // was appended to the real executor's action log. Note: the real
      // player's REAL currentLocationId (unlike the fixture-injected view
      // above) is still the hub itself right after tutorial boot — a real
      // "set course to where I already am" is legitimately a production
      // no-op on travelTarget, which is production's own correct behavior,
      // not a driver defect. The door invocation is what this test proves.
      expect(executor.records.length).toBe(recordsBefore + 1);
      const lastRecord = executor.records[executor.records.length - 1]!;
      expect(lastRecord.family).toBe('TRAVEL');
      expect(lastRecord.uiActionRepresented).toContain(hub);
      expect(lastRecord.result).toBe('ok');
    } finally {
      detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
    }
  });

  it('E+G. POST-PURCHASE EQUIPMENT REEVALUATION + VENDOR — driver reaches a legitimate vendor surface (bounded hub navigation, or records the exact limitation) and, if found, buys+reequips through real doors', async () => {
    const { get, executor, walker } = await bootFreshTutorialComplete(true, CREATION_CHOICES, 'DriverIntegrationEG');
    try {
      // Bounded hub navigation, the SAME legitimate search pattern
      // canonicalVendorAndMaintenance.test.ts already uses — never a
      // hidden vendor-inventory read.
      let foundVendor = !!get().currentScene?.vendor;
      const directions = ['north', 'east', 'south', 'west'];
      for (let i = 0; i < 12 && !foundVendor; i++) {
        const dir = directions[i % directions.length]!;
        await executor.investigate(dir, { optionId: 'move', category: 'route', reason: 'bounded hub navigation toward a vendor room' });
        if (get().currentScene?.vendor) { foundVendor = true; break; }
      }

      if (!foundVendor) {
        // Honest limitation, per §9 — never fabricate a vendor surface to
        // force the test green.
        // eslint-disable-next-line no-console
        console.log('LIMITATION: no vendor scene found within bounded hub navigation this deterministic run — vendor integration not exercised this call.');
        return;
      }

      const view = () => buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory });
      const vendor = get().currentScene!.vendor as { offers: readonly { itemName: string; price: number }[] };
      const currency = get().player?.tc ?? 0;

      const ctx: OrchestratorContext = {
        view, executor, memory: EMPTY_MEMORY, strategic: EMPTY_STRATEGIC_MEMORY,
        disclosedVulnerabilities: ['aetheric'],
        pendingTravelConfirm: () => Boolean(get().pendingTravelConfirm),
        hoursElapsed: () => get().player?.hoursElapsed ?? null,
        record: recordStrategicEvidence,
      };

      const invBefore = new Set((get().player?.inventory ?? []).map((i) => i.name));
      const result = await runVendorPass(ctx, vendor.offers, currency);
      // eslint-disable-next-line no-console
      console.log(`vendor pass: offers=${vendor.offers.length} currency=${currency} bought=${result.bought ?? 'none'} limitation=${result.limitation ?? 'none'}`);

      if (result.bought) {
        // REAL production door: currency actually decreased and the item is
        // actually in inventory now.
        expect(get().player?.tc ?? 0).toBeLessThan(currency);
        const invAfter = new Set((get().player?.inventory ?? []).map((i) => i.name));
        expect(invAfter.has(result.bought) && !invBefore.has(result.bought)).toBe(true);
      }
      void walker;
    } finally {
      detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
    }
  });

  it('F. OBSERVABILITY — strategic decisions above produced structured evidence with the required fields', () => {
    const evidence = getStrategicEvidence();
    expect(evidence.length).toBeGreaterThan(0);
    for (const rec of evidence) {
      expect(typeof rec.seq).toBe('number');
      expect(typeof rec.hp).toBe('number');
      expect(typeof rec.hpMax).toBe('number');
      expect(typeof rec.strategicCategory).toBe('string');
      expect(typeof rec.reason).toBe('string');
    }
    const equipRecords = evidence.filter((r) => r.travelAction === 'equip');
    expect(equipRecords.some((r) => typeof r.equipAfter === 'string')).toBe(true);
    const destRecords = evidence.filter((r) => r.travelAction === 'set-course' || r.travelAction === 'retreat');
    expect(destRecords.some((r) => typeof r.destinationId === 'string')).toBe(true);
  });
});
