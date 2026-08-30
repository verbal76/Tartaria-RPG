/**
 * OTA-1552 — ARE YOU SURE ABOUT THAT?
 *
 * ⚠⚠⚠ THE OWNER FOUND THIS BY LOSING THINGS, AND THEN NAMED THE BUG EXACTLY:
 * *"in pokemon if I go to transfer a pokémon to the professor and it's an event
 * pokémon … it says, are you sure you want to transfer this rare pokémon. in
 * this game you're like, hey, do you want to break stuff down and spend it and
 * I'm like well, yeah I can break it down, it's just garbage right? you never
 * say are you sure cuz this should be saved for the fuse crucible so you just
 * let me spend everything that I've been trying to save with no flag going …
 * some of these items are for the crucible would you like to save them? and then
 * I see you there get a pop-up asking which ones I want to save or a save all
 * button for crucible we need that safeguard … I'm the one making this game and
 * I work with you on every single decision and I didn't even know that was a
 * possibility. I didn't even know I could burn my items without knowing it."*
 *
 * ⚠⚠⚠ THE MECHANISM, FROM HIS OWN LOG. One REPAIR ALL at 23:18:30 consumed
 * Slate-Weighted Netting, Salt-Cured Dowel, Yellowed Tusk Stub, Coiled Snare
 * Thread, Faded Ribbon Coil, Frayed Rigging Twine, Glass-Beaded Strap and
 * Tar-Black Lashing. Every one of them catalog-absent — which is precisely the
 * `isInferredItem` pool `isForgeReservableItem` accepts. `isSubstitutable`
 * (OTA-194) does protect fusion material, but only material ALREADY heart-tapped
 * (`reservedForFusion`). Fodder gathered and not yet reserved is indistinguishable
 * from junk to the drain.
 *
 * ⚠⚠⚠ AND THE ASYMMETRY IS THE ACTUAL DEFECT. Selling forge stock warns. Gifting
 * it refuses outright (giftEligibility: "it is reserved for the Crucible").
 * Fusing it asks. Crafting with it asks — badly, but it asks. REPAIR, the one
 * path that spends it in BULK on a single tap, said nothing at all, and the
 * "Patched in: …" line that looks like a warning is printed by the drain, in the
 * past tense, after the material is gone.
 *
 * ⚠⚠ SO THE FIX IS A STOP, NOT A BETTER SENTENCE. The guard sits between the
 * point where the repair decides it CAN pay and the point where it spends —
 * there was nothing there before — and a warning the player cannot act on is
 * only a slower way to lose the item, so the answer includes SAVING it.
 *
 * ⚠ SAVING DELIBERATELY DOES NOT RESUME THE JOB. "Save it for the Crucible" is
 * an answer about the material, not permission to carry on; and once it is
 * reserved the repair usually cannot be paid for anyway. Spending, which IS
 * permission, resumes the whole queue.
 */

jest.setTimeout(30000);

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { crucibleAtRisk, crucibleWarningLine } from '../app/engine/crucibleGuard';
import { isForgeReservableItem } from '../app/engine/itemFusion';
import { previewSubstitutionsList } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

/** Eight of the curiosities the owner's REPAIR ALL actually ate, by name. */
const BURNED = [
  'Slate-Weighted Netting',
  'Salt-Cured Dowel',
  'Yellowed Tusk Stub',
  'Coiled Snare Thread',
  'Faded Ribbon Coil',
  'Frayed Rigging Twine',
  'Glass-Beaded Strap',
  'Tar-Black Lashing',
];

const misc = (id: string, name: string, tags: string[], quantity = 1): InventoryItem =>
  ({ id, name, kind: 'misc', quantity, tags } as unknown as InventoryItem);

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  store.setState({ crucibleGuardPrompt: null, crucibleGuardAllowedFor: null, craftSubConfirmedFor: null, craftSubstitutionPrompt: null });
  return store;
}

/** A damaged piece that costs Patched Cloth, plus cloth-tagged fodder to pay it
 *  with. `repairCostMaterials` is 2× the scrap output, so a worn cloth item asks
 *  for cloth — which the curiosities below can satisfy by tag. */
const COST = [{ name: 'Patched Cloth', quantity: 2 }];

describe('OTA-1552 — the eight curiosities were forge stock all along', () => {
  it('⚠⚠⚠ every item the owner lost passes isForgeReservableItem — this was never junk', () => {
    // If even one of these read as ordinary material, the loss would be a
    // content problem (a curiosity that should not have been fusible) rather
    // than a safeguard problem. They all read as forge stock. It is the
    // safeguard.
    for (const name of BURNED) {
      expect(isForgeReservableItem({ name, kind: 'misc', tags: [] })).toBe(true);
    }
  });

  it('⚠⚠⚠ …and the drain would have taken them: the preview names them as substitutes', () => {
    const inv = BURNED.map((n, i) => misc(`b${i}`, n, ['cloth']));
    const subs = previewSubstitutionsList(COST, inv);
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) expect(BURNED).toContain(s.substitute);
  });

  it('⚠⚠ the guard reads the DRAIN\'s own preview, so it can never warn about a different set', () => {
    // The recurring class of bug this avoids: a warning computed separately from
    // the action it warns about, drifting apart the first time someone touches
    // the substitution rules. Same source, same order, same ids.
    const inv = BURNED.map((n, i) => misc(`b${i}`, n, ['cloth']));
    const subIds = previewSubstitutionsList(COST, inv).map((s) => s.id);
    const riskIds = crucibleAtRisk(COST, inv).map((a) => a.id);
    for (const id of riskIds) expect(subIds).toContain(id);
  });

  it('⚠⚠ a Bent Nail is NOT flagged — the guard fires on forge stock, not on every substitute', () => {
    // A guard that stopped on ordinary junk would be a prompt storm, and a
    // prompt storm trains the player to tap through the very warning this OTA
    // exists to show.
    const inv = [misc('nail', 'Bent Nail', ['metal'], 4)];
    expect(crucibleAtRisk([{ name: 'Scrap Metal', quantity: 2 }], inv)).toEqual([]);
  });

  it('⚠⚠ material ALREADY reserved is not re-flagged — the drain skips it anyway', () => {
    const inv = [{ ...misc('r1', 'Faded Ribbon Coil', ['cloth'], 3), reservedForFusion: true }];
    expect(crucibleAtRisk(COST, inv as InventoryItem[])).toEqual([]);
  });

  it('⚠⚠ an ALLOWED id is not re-flagged — one answer covers a stack for the whole run', () => {
    const inv = [misc('coil', 'Faded Ribbon Coil', ['cloth'], 4)];
    expect(crucibleAtRisk(COST, inv).length).toBe(1);
    expect(crucibleAtRisk(COST, inv, new Set(['coil']))).toEqual([]);
  });

  it('⚠ the flagged entry carries the WHOLE stack, not just the units the repair wanted', () => {
    // Saving reserves the row, so the modal must be able to say "you hold 9".
    // Half a saved stack still being eaten next time would be the same bug
    // wearing a smaller number.
    const inv = [misc('coil', 'Faded Ribbon Coil', ['cloth'], 9)];
    const risk = crucibleAtRisk(COST, inv);
    expect(risk).toHaveLength(1);
    expect(risk[0]!.held).toBe(9);
    expect(risk[0]!.quantity).toBeLessThanOrEqual(9);
  });

  it('⚠ the warning NAMES the material and COUNTS it — "some of these items" is not an answer', () => {
    const line = crucibleWarningLine(
      [{ id: 'a', name: 'Faded Ribbon Coil', quantity: 2, held: 4 }],
      'the Worn Cloak',
    );
    expect(line).toContain('Faded Ribbon Coil');
    expect(line).toContain('2 pieces');
    expect(line).toContain('the Worn Cloak');
    expect(line).toMatch(/set it aside/);
    // Singular reads as English, not as "1 pieces".
    expect(crucibleWarningLine([{ id: 'a', name: 'Tar-Black Lashing', quantity: 1, held: 1 }], 'the Boots'))
      .toContain('1 piece of this');
  });
});

describe('OTA-1552 — the repair stops, and nothing is spent while it is stopped', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  /** Put a damaged cloth piece + forge-grade cloth fodder in the pack and return
   *  the damaged piece's id. Uses the store's own repair cost, so the fixture
   *  cannot claim a cost the engine would not charge. */
  const armPack = async (who: string) => {
    const store = await boot(who);
    const worn: InventoryItem = {
      id: 'cloak1',
      name: 'Patched Cloth Cloak',
      kind: 'armor',
      rarity: 'Common',
      quantity: 1,
      tags: ['cloth'],
      durability: { current: 1, max: 10 },
    } as unknown as InventoryItem;
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          worn,
          misc('coil', 'Faded Ribbon Coil', ['cloth'], 6),
          misc('twine', 'Frayed Rigging Twine', ['cloth'], 6),
        ],
      },
    }));
    return { store, wornId: 'cloak1' };
  };

  it('⚠⚠⚠ THE BUG: a repair that would burn forge stock raises the guard and spends NOTHING', async () => {
    const { store, wornId } = await armPack('Bob');
    const before = JSON.stringify(store.getState().player!.inventory);

    const verdict = store.getState().repairInventoryItem(wornId);

    expect(verdict).toBe('crucible');
    const prompt = store.getState().crucibleGuardPrompt;
    expect(prompt).not.toBeNull();
    expect(prompt!.action).toBe('repair');
    expect(prompt!.atRisk.length).toBeGreaterThan(0);
    // ⚠ NOT ONE UNIT MOVED, and the cloak is still broken. A guard that warned
    // after the drain would be the bug with better prose.
    expect(JSON.stringify(store.getState().player!.inventory)).toBe(before);
    expect(store.getState().player!.inventory.find((i) => i.id === wornId)!.durability!.current).toBe(1);
  });

  it('⚠⚠⚠ SAVE ALL reserves the material for the Crucible and still spends nothing', async () => {
    const { store, wornId } = await armPack('Bob2');
    store.getState().repairInventoryItem(wornId);
    expect(store.getState().crucibleGuardPrompt).not.toBeNull();

    store.getState().resolveCrucibleGuard('save-all');

    const inv = store.getState().player!.inventory;
    const reserved = inv.filter((i) => i.reservedForFusion);
    expect(reserved.length).toBeGreaterThan(0);
    for (const r of reserved) expect(isForgeReservableItem(r)).toBe(true);
    // Total units of the two curiosities are unchanged — reserving moves rows,
    // it does not consume them.
    const units = (n: string) => inv.filter((i) => i.name === n).reduce((t, i) => t + (i.quantity ?? 1), 0);
    expect(units('Faded Ribbon Coil')).toBe(6);
    expect(units('Frayed Rigging Twine')).toBe(6);
    expect(store.getState().crucibleGuardPrompt).toBeNull();
  });

  it('⚠⚠⚠ …and the saved material is genuinely OUT of reach — even when the NEXT answer is "spend"', async () => {
    // ⚠⚠ THIS IS THE POINT OF THE SAVE, and the test that nearly lied about it.
    // The first draft asserted the follow-up repair would simply refuse. It does
    // not, and the reason is correct behaviour worth pinning: the guard only ever
    // flags the stacks the drain ACTUALLY REACHED for this cost. Saving the Coil
    // leaves the Twine unanswered, so the next repair stops again and asks about
    // the Twine — a different stack, a question the player has genuinely not been
    // asked yet, rather than the same one nagging.
    //
    // The property that has to hold is stronger than a refusal: once material is
    // held for the Crucible, saying SPEND to a LATER question must not reach it.
    // If it could, the button would be a lie and the owner would lose the
    // material one tap later holding a receipt that said he had protected it.
    const { store, wornId } = await armPack('Bob3');
    store.getState().repairInventoryItem(wornId);
    const first = store.getState().crucibleGuardPrompt!;
    const savedNames = first.atRisk.map((a) => a.name);
    expect(savedNames.length).toBeGreaterThan(0);
    store.getState().resolveCrucibleGuard('save-all');

    // Repair again and this time let it spend whatever it still may.
    const verdict = store.getState().repairInventoryItem(wornId);
    if (verdict === 'crucible') {
      // Whatever it is asking about now, it is NOT the material just saved.
      const second = store.getState().crucibleGuardPrompt!;
      for (const a of second.atRisk) expect(savedNames).not.toContain(a.name);
      store.getState().resolveCrucibleGuard('spend');
    }

    const inv = store.getState().player!.inventory;
    const units = (n: string) => inv.filter((i) => i.name === n).reduce((t, i) => t + (i.quantity ?? 1), 0);
    // Every saved stack is whole and still flagged for the forge.
    for (const name of savedNames) {
      expect(units(name)).toBe(6);
      expect(inv.filter((i) => i.name === name).every((i) => i.reservedForFusion)).toBe(true);
    }
  });

  it('⚠⚠ SPEND IT ALL proceeds — the safeguard is a question, not a prohibition', async () => {
    const { store, wornId } = await armPack('Bob4');
    store.getState().repairInventoryItem(wornId);

    store.getState().resolveCrucibleGuard('spend');

    const inv = store.getState().player!.inventory;
    const units = (n: string) => inv.filter((i) => i.name === n).reduce((t, i) => t + (i.quantity ?? 1), 0);
    expect(units('Faded Ribbon Coil') + units('Frayed Rigging Twine')).toBeLessThan(12);
    expect(inv.find((i) => i.id === wornId)!.durability!.current).toBe(10);
    expect(store.getState().crucibleGuardPrompt).toBeNull();
  });

  it('⚠⚠ CANCEL leaves the pack exactly as it was — no save, no spend, no repair', async () => {
    const { store, wornId } = await armPack('Bob5');
    store.getState().repairInventoryItem(wornId);
    const before = JSON.stringify(store.getState().player!.inventory);

    store.getState().resolveCrucibleGuard('cancel');

    expect(JSON.stringify(store.getState().player!.inventory)).toBe(before);
    expect(store.getState().crucibleGuardPrompt).toBeNull();
  });

  it('⚠⚠ the picker is real: SAVE TICKED reserves only what was ticked', async () => {
    // The owner asked for "a pop-up asking which ones I want to save OR a save
    // all button" — both, because the real answer is usually partial.
    const { store, wornId } = await armPack('Bob6');
    store.getState().repairInventoryItem(wornId);
    const prompt = store.getState().crucibleGuardPrompt!;
    const keep = prompt.atRisk.find((a) => a.name === 'Faded Ribbon Coil');
    expect(keep).toBeDefined();

    store.getState().resolveCrucibleGuard('save', [keep!.id]);

    const inv = store.getState().player!.inventory;
    const reservedNames = inv.filter((i) => i.reservedForFusion).map((i) => i.name);
    expect(reservedNames).toContain('Faded Ribbon Coil');
    expect(reservedNames).not.toContain('Frayed Rigging Twine');
  });

  it('⚠⚠⚠ REPAIR ALL: the guard holds the WHOLE remaining queue, and spending resumes it', async () => {
    // This is the tap that cost the owner eight curiosities. One answer has to
    // cover the run; a guard that mended one boot and left nine prompts behind
    // would be its own defect.
    const store = await boot('BobAll');
    const worn = (id: string): InventoryItem => ({
      id, name: 'Patched Cloth Cloak', kind: 'armor', rarity: 'Common', quantity: 1,
      tags: ['cloth'], durability: { current: 1, max: 10 },
    } as unknown as InventoryItem);
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          worn('c1'), worn('c2'), worn('c3'),
          misc('coil', 'Faded Ribbon Coil', ['cloth'], 30),
        ],
      },
    }));

    store.getState().repairInventoryItems(['c1', 'c2', 'c3']);

    const prompt = store.getState().crucibleGuardPrompt;
    expect(prompt).not.toBeNull();
    expect(prompt!.queue).toEqual(['c1', 'c2', 'c3']); // the whole run is held
    for (const id of ['c1', 'c2', 'c3']) {
      expect(store.getState().player!.inventory.find((i) => i.id === id)!.durability!.current).toBe(1);
    }

    store.getState().resolveCrucibleGuard('spend');

    // …and one answer mended all three, without asking again about the same stack.
    for (const id of ['c1', 'c2', 'c3']) {
      expect(store.getState().player!.inventory.find((i) => i.id === id)!.durability!.current).toBe(10);
    }
    expect(store.getState().crucibleGuardPrompt).toBeNull();
  });
});

describe('OTA-1552 — the craft door asks the better question too', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('⚠⚠ a craft that would strip forge stock raises the GUARD, not the generic strip prompt', async () => {
    // Craft already asked (OTA-439) — but "Strip these for parts?" reads as a
    // question about junk, never says the material is Crucible stock, and offers
    // no way to save it. Where forge stock is in the pile, the specific question
    // replaces the generic one.
    const store = await boot('Tinker1552');
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          misc('dust1', 'Aether Dust', [], 1),
          misc('strap', 'Glass-Beaded Strap', ['metal'], 1),
        ],
      },
    }));

    store.getState().submitPlayerAction('craft Acid Flask');

    const guard = store.getState().crucibleGuardPrompt;
    expect(guard).not.toBeNull();
    expect(guard!.action).toBe('craft');
    expect(guard!.recipeResult).toBe('Acid Flask');
    expect(guard!.atRisk.map((a) => a.name)).toContain('Glass-Beaded Strap');
    // The generic prompt stays down — two modals for one question is a bug.
    expect(store.getState().craftSubstitutionPrompt).toBeNull();
    // And nothing was crafted or consumed while the question stands.
    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Acid Flask')).toBe(false);
    expect(inv.some((i) => i.id === 'strap')).toBe(true);
  });

  it('⚠⚠ spending re-dispatches the craft ONCE and does not ask again', async () => {
    const store = await boot('Tinker1552b');
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          misc('dust1', 'Aether Dust', [], 1),
          misc('strap', 'Glass-Beaded Strap', ['metal'], 1),
        ],
      },
    }));
    store.getState().submitPlayerAction('craft Acid Flask');
    expect(store.getState().crucibleGuardPrompt).not.toBeNull();

    store.getState().resolveCrucibleGuard('spend');

    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Acid Flask')).toBe(true);
    expect(inv.some((i) => i.id === 'strap')).toBe(false);
    expect(store.getState().crucibleGuardPrompt).toBeNull();
    expect(store.getState().craftSubstitutionPrompt).toBeNull();
    // Both one-shot latches are spent, so the NEXT craft asks again.
    expect(store.getState().crucibleGuardAllowedFor).toBeNull();
    expect(store.getState().craftSubConfirmedFor).toBeNull();
  });

  it('⚠⚠ saving on the craft door does NOT craft — it sets the material aside and stops', async () => {
    const store = await boot('Tinker1552c');
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          misc('dust1', 'Aether Dust', [], 1),
          misc('strap', 'Glass-Beaded Strap', ['metal'], 1),
        ],
      },
    }));
    store.getState().submitPlayerAction('craft Acid Flask');

    store.getState().resolveCrucibleGuard('save-all');

    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Acid Flask')).toBe(false);
    expect(inv.find((i) => i.name === 'Glass-Beaded Strap')!.reservedForFusion).toBe(true);
  });
});

describe('OTA-1552 — the wiring', () => {
  const SLICE = src('app/state/slices/inventorySlice.ts');
  const STORE = src('app/state/gameStore.ts');
  const MODAL = src('app/components/CrucibleGuardModal.tsx');
  const CRAFTING = src('app/engine/crafting.ts');

  it('⚠⚠⚠ the guard sits BETWEEN the affordability check and the drain', () => {
    // The whole fix is the position. Above it the repair decides it can pay;
    // below it, it spends. Anywhere else and it is either a warning about a
    // repair that was never going to happen, or an obituary.
    const gate = SLICE.indexOf('const atRisk = crucibleAtRisk(cost, player.inventory');
    const shortage = SLICE.indexOf('"Short on stock: ${shortages.join');
    const patched = SLICE.indexOf('The Arbiter nods. "Patched in:');
    const drain = SLICE.indexOf('craftingMod.consumeIngredientsList(s.player.inventory, cost)');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(shortage);
    expect(gate).toBeLessThan(patched);
    expect(gate).toBeLessThan(drain);
  });

  it('⚠⚠⚠ the guarded repair returns before consuming — the bail is a return, not a flag', () => {
    expect(SLICE).toMatch(/crucibleGuardPrompt: \{[\s\S]{0,320}\},\s*\}\);\s*return 'crucible';/);
  });

  it('⚠⚠ the substitution preview carries the instance id — without it there is no picker', () => {
    expect(CRAFTING).toContain('out.push({ ingredient: ing.name, substitute: item.name, quantity: take, id: item.id });');
  });

  it('⚠⚠ saving routes through the EXISTING reserve action, not a second way to set the flag', () => {
    // reserveManyForFusion already enforces every eligibility rule the ♥ toggle
    // does and already folds merged rows. A hand-rolled `reservedForFusion: true`
    // here would be a second writer that could drift from it.
    expect(SLICE).toContain('get().reserveManyForFusion(saveIds, true);');
    expect(SLICE).not.toMatch(/resolveCrucibleGuard\([\s\S]{0,1200}reservedForFusion: true/);
  });

  it('⚠⚠ saving does NOT resume the job; only spending does', () => {
    expect(SLICE).toContain("if (mode !== 'spend') return;");
    const stop = SLICE.indexOf("if (mode !== 'spend') return;");
    const resume = SLICE.indexOf('get().repairInventoryItems(prompt.queue, { allowIds: allow });');
    expect(resume).toBeGreaterThan(stop);
  });

  it('⚠⚠ the craft latch is one-shot, exactly like the OTA-439 latch beside it', () => {
    expect(STORE).toContain("if (get().crucibleGuardAllowedFor === recipe.result) {");
    expect(STORE).toContain('set({ crucibleGuardAllowedFor: null });');
    expect(SLICE).toContain("set({ crucibleGuardAllowedFor: prompt.recipeResult, craftSubConfirmedFor: prompt.recipeResult });");
  });

  it('⚠ the modal opens with everything TICKED, and only one button is destructive', () => {
    // The guard only ever fires on forge stock, so "save it" is the answer that
    // matches why the modal exists. And nothing about tapping past it quickly
    // ends with material gone: the backdrop closes as CANCEL.
    expect(MODAL).toContain('setTicked(prompt ? prompt.atRisk.map((a) => a.id) : []);');
    expect(MODAL).toContain("const close = () => resolve('cancel');");
    expect(MODAL).toContain('onRequestClose={close}');
    expect(MODAL).toContain('♥ SAVE ALL FOR THE CRUCIBLE');
    expect(MODAL).toContain('SPEND IT ALL');
  });

  it('⚠ the modal is mounted on BOTH screens that can start such a job', () => {
    // A modal flag set with nothing on screen is a silent no-op the player reads
    // as a broken button — the exact failure arb137 fixed for the craft prompt.
    expect(src('app/screens/CraftingScreen.tsx')).toContain('<CrucibleGuardModal />');
    expect(src('app/screens/ExplorationScreen.tsx')).toContain('<CrucibleGuardModal />');
  });
});
