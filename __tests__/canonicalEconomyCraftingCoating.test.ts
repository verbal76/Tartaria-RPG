// Phase 3D, Parts 2/3/5/6 — SCRAP/SALVAGE, COATING, CRAFTING, remaining
// CONSUMABLE paths. Four SEPARATE small bounded scenarios (owner's explicit
// multi-scenario mandate), each its own it() block sharing one qualification
// ledger, all starting from the SAME legitimate boot (fresh tutorial-complete
// character standing in the hub gate room) — no travel required for any of
// these four doors (Phase 3D research trace: neither crafting nor bench
// repair is location-gated; the hub's own gate room interactables carry real
// salvage nouns; a coating requires crafting one, not travel to a vendor).

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
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
    setAudioModeAsync: jest.fn(async () => {}),
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', nativeBuildVersion: '0' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn(async () => {}) })) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: { requestPermissionsAsync: jest.fn(async () => ({ granted: false })) },
}));
jest.mock('expo-updates', () => ({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) }));

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { bootFreshTutorialComplete } from '../test-utils/canonical/bootHelpers';
import { buildPlayerView } from '../test-utils/canonical/playerView';
import { decide } from '../test-utils/canonical/policy';
import { fileFromActionRecord, blocked, sourceProvenOnly } from '../test-utils/canonical/qualificationHelpers';
import { getQualifications } from '../test-utils/canonical/qualification';
import type { ActionRecord } from '../test-utils/canonical/actionExecutor';
import { detachRngLedger } from '../test-utils/canonical/rngLedger';
import { detachStoreDiffer } from '../test-utils/canonical/storeDiffer';
import { uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { canScrap } from '../app/engine/scrapEngine';
import { isCoatableItem } from '../app/engine/weaponCoating';

describe('Phase 3D — economy/crafting/coating (bounded, small, human-legitimate scenarios)', () => {
  it('Part 2: SCRAP — a real store weapon, using canScrap() to pick a legitimate, non-destructive target', async () => {
    const { get, executor } = await bootFreshTutorialComplete();

    // A capable player scraps a genuinely spare item, never the single tool
    // that a rational human would keep (e.g. the best dig tool, the only
    // equipped weapon/armor). Prefer a DUPLICATE (qty > 1) when one exists;
    // otherwise the first canScrap()-eligible item that is not equipped and
    // not the Trowel (best dig tool) or Locket (detection relic) — same
    // "plausible disposal decision" standard as the owner's SCRAP instruction.
    const inv = get().player?.inventory ?? [];
    const equippedNames = new Set(Object.values(get().player?.equipped ?? {}).filter(Boolean) as string[]);
    const KEEP_NAMES = new Set(["Reclaimer's Trowel", 'Aetheric Locket']);
    const dupe = inv.find((it) => it.quantity > 1 && canScrap(it as never));
    const spare = dupe ?? inv.find((it) => !equippedNames.has(it.name) && !KEEP_NAMES.has(it.name) && canScrap(it as never));

    if (!spare) {
      blocked('ECONOMY-SCRAP', 'a legitimately spare, non-destructive scrappable item in the fresh-tutorial starting inventory', 'no canScrap()-eligible item found that a capable player would rationally give up (checked duplicates and the non-tool/non-relic set)');
    } else {
      const before = { name: spare.name, qty: spare.quantity, invLen: inv.length };
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const decision = decide(view, [{ id: 'scrap', category: 'scrap', label: `scrap ${spare.name}` }]);
      let record: ActionRecord | null = null;
      let err: unknown = null;
      try { record = await executor.scrapItem(spare.name, decision, spare.id); } catch (e) { err = e; }
      const afterInv = get().player?.inventory ?? [];
      const after = { invLen: afterInv.length, materials: afterInv.map((i) => `${i.name} x${i.quantity}`) };
      fileFromActionRecord(
        'ECONOMY-SCRAP', `owns a spare/non-critical scrappable item ('${spare.name}')`, `scrap ${spare.name}`,
        'InventoryScreen.tsx scrap control', record, err, before, after,
        `inventory changed from ${JSON.stringify(before)} to a materials list of ${JSON.stringify(after.materials)}`, 'n/a',
      );
    }

    const outPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase3D_econ.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));
    detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
  }, 60000);

  it('Part 2: SALVAGE (ambient) — bulk-salvage the hub gate room\'s own real interactable nouns', async () => {
    const { get, executor } = await bootFreshTutorialComplete(false);

    const nouns = (get().currentScene?.displayedAmbientNouns ?? get().currentScene?.ambientNouns ?? []) as string[];
    if (!nouns.length) {
      blocked('LOOT-SALVAGE-AMBIENT', 'the current scene exposes ambient salvage nouns (displayedAmbientNouns/ambientNouns)', `currentScene had no ambient nouns at all (room=${get().player?.hubRoomId ?? get().player?.currentLocationId})`);
    } else {
      const before = { nouns, invLen: (get().player?.inventory ?? []).length };
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const decision = decide(view, [{ id: 'salvage', category: 'loot', label: `salvage ${nouns.join(', ')}` }]);
      let record: ActionRecord | null = null;
      let err: unknown = null;
      try { record = await executor.salvageAmbient(nouns, decision); } catch (e) { err = e; }
      const afterInv = get().player?.inventory ?? [];
      fileFromActionRecord(
        'LOOT-SALVAGE-AMBIENT', `stands in a scene with real ambient salvage nouns (${JSON.stringify(nouns)})`, `salvage ${nouns.join(', ')}`,
        'GatherModal.tsx SALVAGE ALL control', record, err, before,
        { invLen: afterInv.length, materials: afterInv.map((i) => `${i.name} x${i.quantity}`) },
        'bulk ambient salvage resolved through salvageAllAmbient (engine/salvagePools.ts) — distinct RNG table/module from scrapInventoryItem, confirmed by Phase 3D research trace', 'n/a',
      );
    }

    const outPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase3D_econ.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));
    detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
  }, 60000);

  it('Part 5: CRAFTING — the cheapest always-visible Common recipe (Club: 1x Stick), ingredient gathered legitimately in-hub', async () => {
    const { get, executor } = await bootFreshTutorialComplete(false);

    // Club needs only 1 Stick (recipes.json) and Common-rarity recipes are
    // always craftable regardless of knownRecipes (Phase 3D research trace)
    // — no recipe-unlock action needed. Gather the Stick legitimately: the
    // gate room's 'table' noun resolves into the furniture salvage pool,
    // which can grant Stick.
    const nouns = (get().currentScene?.displayedAmbientNouns ?? get().currentScene?.ambientNouns ?? []) as string[];
    let guard = 0;
    while (!(get().player?.inventory ?? []).some((i) => i.name === 'Stick') && nouns.length && guard < 6) {
      guard++;
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const decision = decide(view, [{ id: 'salvage', category: 'loot', label: `salvage ${nouns.join(', ')}` }]);
      try { await executor.salvageAmbient(nouns, decision); } catch { /* best-effort, salvage pools are RNG */ }
    }
    const hasStick = (get().player?.inventory ?? []).some((i) => i.name === 'Stick');

    if (!hasStick) {
      blocked('CRAFTING', "the Club recipe's sole ingredient (1x Stick) obtained via bounded in-hub ambient salvage", `no Stick appeared after ${guard} bounded salvage attempts against the gate room's real ambient nouns — salvage yield is RNG-gated and did not land Stick within the small bounded budget`);
    } else {
      const before = { inventory: (get().player?.inventory ?? []).map((i) => `${i.name} x${i.quantity}`) };
      const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const decision = decide(view, [{ id: 'craft', category: 'craft', label: 'craft Club' }]);
      let record: ActionRecord | null = null;
      let err: unknown = null;
      try { record = await executor.craft('Club', decision); } catch (e) { err = e; }
      const afterInv = get().player?.inventory ?? [];
      fileFromActionRecord(
        'CRAFTING', 'owns 1x Stick; Club (Common rarity) is always player-visible/unlocked regardless of knownRecipes', 'craft Club',
        'CraftingScreen.tsx / RecipesView.tsx craft control', record, err, before,
        { inventory: afterInv.map((i) => `${i.name} x${i.quantity}`) },
        `Stick consumed, Club granted (or refused — see notes); inventory: ${JSON.stringify(afterInv.map((i) => i.name))}`, 'n/a',
      );
    }

    const outPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase3D_econ.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));
    detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
  }, 60000);

  it('Part 3: COATING — craft a coating (no vendor sells one in-hub) then apply it to a coatable weapon; application only, no forced proc', async () => {
    const { get, executor } = await bootFreshTutorialComplete(false);

    // Acid Flask (cheapest coating recipe): Aether Dust x1 + Scrap Metal x1.
    // Gather both legitimately: scrap a genuinely spare metal-tagged item for
    // Scrap Metal, and bulk-salvage the gate room's ambient nouns (rubble/
    // relic_site pools on 'brick'/'gate') hoping for Aether Dust — RNG-gated,
    // bounded, never injected.
    const nouns = (get().currentScene?.displayedAmbientNouns ?? get().currentScene?.ambientNouns ?? []) as string[];
    let guard = 0;
    const haveBoth = () => {
      const inv = get().player?.inventory ?? [];
      return inv.some((i) => i.name === 'Scrap Metal') && inv.some((i) => i.name === 'Aether Dust');
    };
    while (!haveBoth() && guard < 8) {
      guard++;
      const inv = get().player?.inventory ?? [];
      const equippedNames = new Set(Object.values(get().player?.equipped ?? {}).filter(Boolean) as string[]);
      const spareMetal = inv.find((it) => it.quantity > 1 && canScrap(it as never))
        ?? inv.find((it) => !equippedNames.has(it.name) && it.tags?.includes('metal') && canScrap(it as never));
      if (!inv.some((i) => i.name === 'Scrap Metal') && spareMetal) {
        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'scrap', category: 'scrap', label: `scrap ${spareMetal.name}` }]);
        try { await executor.scrapItem(spareMetal.name, decision, spareMetal.id); } catch { /* best-effort */ }
      }
      if (!inv.some((i) => i.name === 'Aether Dust') && nouns.length) {
        const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
        const decision = decide(view, [{ id: 'salvage', category: 'loot', label: `salvage ${nouns.join(', ')}` }]);
        try { await executor.salvageAmbient(nouns, decision); } catch { /* best-effort */ }
      }
    }

    if (!haveBoth()) {
      blocked('COATINGS', "Acid Flask's ingredients (Aether Dust x1, Scrap Metal x1) gathered via bounded in-hub scrap/salvage", `after ${guard} bounded gather attempts, inventory still lacked one or both ingredients: ${JSON.stringify((get().player?.inventory ?? []).map((i) => i.name))} — RNG-gated salvage did not land Aether Dust within budget`);
    } else {
      const view1 = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
      const craftDecision = decide(view1, [{ id: 'craft', category: 'craft', label: 'craft Acid Flask' }]);
      let craftRecord: ActionRecord | null = null;
      let craftErr: unknown = null;
      try { craftRecord = await executor.craft('Acid Flask', craftDecision); } catch (e) { craftErr = e; }
      const gotCoating = (get().player?.inventory ?? []).find((i) => i.name === 'Acid Flask');

      if (!gotCoating) {
        fileFromActionRecord(
          'COATINGS', 'owns Aether Dust x1 + Scrap Metal x1', 'craft Acid Flask',
          'CraftingScreen.tsx craft control', craftRecord, craftErr,
          { hadIngredients: true }, { gotCoating: false },
          'craft attempt did not yield an Acid Flask — see notes', 'n/a',
        );
      } else {
        const coatable = (get().player?.inventory ?? []).find((it) => isCoatableItem(it as never));
        if (!coatable) {
          blocked('COATINGS', 'owns a coating item (Acid Flask) and a coatable weapon', `crafted the Acid Flask successfully, but no isCoatableItem()-eligible weapon exists in the current inventory (checked: ${JSON.stringify((get().player?.inventory ?? []).map((i) => i.name))})`);
        } else {
          // The applied coating lives on item.coating/.coating2 (WeaponCoating),
          // NOT .coatingSlots (that field is only the slot CAPACITY, set by a
          // separate Crucible upgrade — checking it would silently pass even
          // on a no-op refusal, the exact false-positive class this package
          // already found and fixed once for summonCoreGuardian()).
          const before = { weapon: coatable.name, coating: coatable.coating ?? null, coating2: coatable.coating2 ?? null };
          const view2 = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
          const applyDecision = decide(view2, [{ id: 'coat', category: 'coating', label: `coat ${coatable.name} with Acid Flask` }]);
          let applyRecord: ActionRecord | null = null;
          let applyErr: unknown = null;
          try { applyRecord = await executor.applyCoating(gotCoating.id, coatable.id, applyDecision); } catch (e) { applyErr = e; }
          const afterItem = (get().player?.inventory ?? []).find((it) => it.id === coatable.id);
          const coatingApplied = !!(afterItem?.coating ?? afterItem?.coating2);
          if (!coatingApplied) {
            blocked('COATINGS', `owns a coating item (Acid Flask) and a coatable weapon (${coatable.name})`, `applyCoating call completed but the weapon's .coating/.coating2 field is still empty afterward (before=${JSON.stringify(before)}, after=${JSON.stringify({ coating: afterItem?.coating ?? null, coating2: afterItem?.coating2 ?? null })}) — the store action appears to have silently refused rather than applied`);
          } else {
            fileFromActionRecord(
              'COATINGS', `owns a coating item (Acid Flask) and a coatable weapon (${coatable.name})`, `coat ${coatable.name} with Acid Flask`,
              'InventoryScreen.tsx coating control', applyRecord, applyErr, before,
              { coating: afterItem?.coating ?? null, coating2: afterItem?.coating2 ?? null },
              `equipment coating state changed on '${coatable.name}': .coating is now ${JSON.stringify(afterItem?.coating)} — this proves COATING ITEM -> EQUIPMENT COATING STATE only, NOT the combat proc/DoT effect; no combat was forced to observe a proc, per owner instruction`,
              'NOT_YET_OBSERVED — no combat occurred in this bounded scenario to trigger the coating proc',
            );
          }
        }
      }
    }

    const outPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase3D_econ.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));
    detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
  }, 60000);

  it('Part 6: remaining CONSUMABLE paths — the free-water "drink" path (no inventory item, no travel)', async () => {
    const { get, executor } = await bootFreshTutorialComplete(false);

    // Path 4 (submitPlayerAction('use <item>')) was already RUNTIME_PROVEN in
    // Phase 3C. Of the remaining 4 source-proven-only paths (Phase 3D
    // research trace): path 1 (eat/consume, case 'rest' food branch) and
    // path 2 (coating-as-antidote sub-branch) both require a specific
    // consumable item this character may not hold; path 5 (useHealBatch) is
    // a mid-combat quick-bar action with no natural non-combat trigger.
    // Path 3 ('drink <text>', case 'drink') has a no-inventory-item branch —
    // "cup hands from a water source" — that needs no item and no travel,
    // so it is the one naturally reachable in this bounded scenario; the
    // other three are recorded SOURCE_PROVEN_ONLY with the specific reason
    // each is not a P7 prerequisite this package attempts.
    const before = { hp: get().player?.hp, corruption: (get().player as { corruption?: number } | undefined)?.corruption };
    const view = buildPlayerView({ player: get().player, currentScene: get().currentScene, worldMemory: get().worldMemory })!;
    const decision = decide(view, [{ id: 'drink', category: 'other', label: 'drink water' }]);
    let record: ActionRecord | null = null;
    let err: unknown = null;
    try { record = await executor.companionCommand('drink water', decision); } catch (e) { err = e; }
    const after = { hp: get().player?.hp, corruption: (get().player as { corruption?: number } | undefined)?.corruption };
    fileFromActionRecord(
      'CONSUMABLES-DRINK-FREE-WATER', 'standing anywhere (no item, no travel required)', 'drink water',
      "typed command 'drink <text>', case 'drink' (gameStore.ts, no-item cup-hands branch)", record, err, before, after,
      `no-inventory-item drink path executed; before/after: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`, 'n/a',
    );

    sourceProvenOnly('CONSUMABLES-EAT', 'requires a specific declared-healHP or legacy food/potion item in inventory', "not a P7 prerequisite this package attempts — the fresh-tutorial starting inventory's food items (Trail Rations) are reserved for the planned journey's actual survival use, not spent proving this path in isolation; already-proven path 4 ('use <item>') covers the general consumable-use door");
    sourceProvenOnly('CONSUMABLES-COATING-ANTIDOTE', "requires drinking a weapon-coating item as an antidote — a rare, situational sub-branch, not a P7 prerequisite", 'exercising it would consume a coating item this package needed for Part 3 (COATING) instead; not a planned P7 action');
    sourceProvenOnly('CONSUMABLES-HEAL-BATCH', 'useHealBatch is a mid-combat quick-bar action with no natural non-combat trigger', 'forcing it would require staging a combat encounter purely to exercise this one door, which is not a legitimate small bounded scenario per the owner\'s no-cheat instruction; not a P7 prerequisite outside ordinary combat healing already covered by path 4');

    const outPath = resolve(__dirname, '../test-utils/canonical/qualificationResultsPhase3D_econ.json');
    writeFileSync(outPath, JSON.stringify(getQualifications(), null, 2));
    expect(getQualifications().length).toBeGreaterThan(0);
    detachRngLedger(); detachStoreDiffer(); uninstallCanonicalClock();
  }, 60000);
});
