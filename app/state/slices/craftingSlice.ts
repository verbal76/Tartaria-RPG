/**
 * OTA-1399 — SLICE 8c OF THE gameStore SPLIT: crafting and the Crucible.
 *
 * Three actions, 261 lines: craft one recipe, craft a batch, and fuse at the
 * Crucible — the last of which mints an item instantly on deterministic stats
 * and then lets a background model name it, with a timeout so a forging can
 * never be stuck nameless.
 *
 * ⚠⚠ THE SMALLEST OF THE THREE, AND THE MOST CLEANLY SEPARATED. Its dependency
 * set does not intersect the inventory slice's AT ALL — zero shared unexported
 * symbols — which is the same signal slice 3 used to split a ten-action cluster
 * in two. Its only overlap is with the vendor counter (`recordTitleProgress`
 * and `slotOfEquippedId`), which is what you would expect: the Crucible is a
 * thing you PAY a vendor for.
 *
 * ⚠ `FUSE_NAME_TIMEOUT_MS` travelled with it — the safety cap on the background
 * namer, read nowhere else.
 *
 * ⚠ NO MUTABLE STATE. ⚠ WHAT DID NOT CHANGE: three bodies, verbatim.
 */
import { anOrA } from '../../engine/grammar';
import type { InventoryItem } from '../../engine/types';
import { qwen } from '../../ai/engines';
import { SLOT_LABEL } from '../../engine/equipment';
import { FACTIONS } from '../../engine/factions';
import { canonicalItemTags, MAX_CRAFT_BATCH } from '../../engine/crafting';
// ⚠ SHARED BY TWO SLICES AND NOTHING ELSE, so it moved DOWN rather than being
// injected twice. It is a pure lookup over SLOT_ID_KEY, which app/engine/equipment.ts
// already owns — so that is where it went, beside the table it indexes.
import { slotOfEquippedId } from '../../engine/equipment';

/**
 * ⚠ `import type * as` is fully erased at compile time, so this is NOT a runtime
 * cycle. It lets every dep below be typed `typeof Store.fn`, which means their
 * signatures cannot drift from the real functions: change one in gameStore and
 * this file stops compiling rather than silently accepting the wrong shape.
 */
import type * as Store from '../gameStore';

type GameStore = Store.GameStore;
type SetState = (
  partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
) => void;


export interface CraftingSlice {
  craftRecipe: (recipeName: string) => void;
  craftRecipeBatch: (recipeName: string, count: number) => number;
  fuseAtCrucible: () => Promise<void>;
}

export interface CraftingSliceDeps {
  chargeOutpostCrucibleFee: typeof Store.chargeOutpostCrucibleFee;
  recordTitleProgress: typeof Store.recordTitleProgress;
}
// OTA-631 — the Crucible no longer BLOCKS on Qwen at all: stats are forged
// deterministically and the item is minted instantly, then a BACKGROUND Qwen call
// names it ("the Aether settling its name") and a reveal pops when it forms. This
// is the safety cap on that background namer — if the on-device LLM truly hangs
// (vs. just being slow), settle to the deterministic name after it so a forging
// can never be stuck nameless. Generous, because the player isn't waiting on it.
const FUSE_NAME_TIMEOUT_MS = 120000;

export const createCraftingSlice = (
  set: SetState,
  get: () => GameStore,
  deps: CraftingSliceDeps,
): CraftingSlice => ({
  craftRecipe(recipeName: string) {
    get().submitPlayerAction(`craft ${recipeName}`);
  },

  craftRecipeBatch(recipeName, count) {
    const want = Math.max(1, Math.min(Math.floor(count), MAX_CRAFT_BATCH)); // OTA-1631 — the one bound
    // ⚠⚠⚠ OTA-1633 — A BATCH IS ONE ACTION. This used to loop `craft X` want
    // times behind a quiet flag: N parser passes, N Arbiter remarks, N cognitive
    // evals, N persists, N ambush rolls, for one tap of the thumb. Now the count
    // rides the action: the craft case sizes it to what the pack can pay for,
    // runs its guards ONCE, applies the recipe that many times, and speaks one
    // reward line. The confirm prompts carry the count, so a "yes" finishes the
    // batch. OTA-989 — count the RESULT, not the whole pack (the Club nets zero).
    const countResult = () => (get().player?.inventory ?? [])
      .filter((it) => it.name === recipeName)
      .reduce((n, it) => n + (it.quantity ?? 0), 0);
    const before = countResult();
    get().submitPlayerAction(`craft ${recipeName}`, { craftCount: want });
    return Math.max(0, countResult() - before);
  },

  async fuseAtCrucible() {
    const player = get().player;
    if (!player) return;
    // Gate 1 — permit. A wild fusion_bench encounter sets fusionPending;
    // additionally (arb103) EVERY outpost has its own Crucible, so being
    // inside your outpost grants access without the flag.
    // arb108 — but NOT the spawn outpost you wake in: the outpost Crucible
    // only fires once you've ventured out to another named location and come
    // back (macroVisitSeq ≥ 1; it's 0 only while you've never left the spawn
    // macro-location). This keeps fusion out of the tutorial / first beat.
    const hasLeftOutpost = (player.macroVisitSeq ?? 0) >= 1;
    const atOutpostCrucible = !!player.hubRoomId && hasLeftOutpost;
    // OTA-508 — the Hidden Market offers the Fuse Cauldron at every stall.
    const atMarketCrucible = get().activeBuildingId === 'market';
    if (!player.fusionPending && !atOutpostCrucible && !atMarketCrucible) {
      get().appendLog(
        'arbiter',
        !!player.hubRoomId && !hasLeftOutpost
          ? `The foreman shakes his head. "The Crucible's not for first-timers. Leave the outpost and see something of the world first — travel out to a named place and come back, then I'll fire it for you."`
          : `"There's no Crucible here," the Arbiter says. "Find one — they wait in the silt and the ruins, and every outpost keeps one. Reserve your pieces, then bring them to the bowl."`,
      );
      return;
    }
    // Gate 2 — input rules. Need ≥3 reserved inferred items spanning
    // ≥3 distinct material tags. gateFusion returns the eligible
    // inputs + a refusal reason if not.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fusion = require('../../engine/itemFusion');
    // arb-fix — resolve the faction catalyst BEFORE gating, excluding EQUIPPED
    // instances (the Crucible CONSUMES the catalyst, so it must never eat worn
    // gear). The catalyst now counts toward the input gate: 2 inferred + 1
    // reserved faction item = a faction fusion.
    const eqForFuse = player.equipped ?? {};
    const equippedIdSet = new Set(
      [eqForFuse.mainId, eqForFuse.offId, eqForFuse.headId, eqForFuse.chestId, eqForFuse.handsId, eqForFuse.legsId, eqForFuse.feetId, eqForFuse.cloakId, eqForFuse.amuletId, eqForFuse.ringId, eqForFuse.ring2Id, eqForFuse.ring3Id].filter(Boolean) as string[],
    );
    const preCatalyst = fusion.findFactionCatalyst(player.inventory, equippedIdSet) as ReturnType<typeof import('../../engine/itemFusion').findFactionCatalyst>;
    const gate = fusion.gateFusion(player.inventory, preCatalyst) as ReturnType<typeof import('../../engine/itemFusion').gateFusion>;
    if (!gate.ok) {
      // arb-fix — if a reserved faction item is EQUIPPED and using it WOULD
      // complete the fusion, ASK before burning it (don't silently eat worn
      // gear). On confirm we unequip it (freeing the slot) and fuse.
      const equippedReservedFaction = player.inventory.find(
        (i) => i.reservedForFusion && canonicalItemTags(i).includes('faction_gear') && equippedIdSet.has(i.id),
      );
      if (equippedReservedFaction && fusion.gateFusion(player.inventory, equippedReservedFaction).ok) {
        const slot = slotOfEquippedId(player.equipped, equippedReservedFaction.id);
        if (slot) {
          set({ fusionCatalystPrompt: { itemName: equippedReservedFaction.name, slot, slotLabel: SLOT_LABEL[slot] ?? slot, cost: 0 } });
          return;
        }
      }
      // OTA-984 — SUPERSEDES OTA-801. That fix opened the picker on a FAILED gate so
      // the player wouldn't hit a repeated refusal line; the cure was worse than
      // the disease — a menu you cannot act in, emitting NOTHING to the log, read
      // on device as "I'm fusing" for ten minutes. A Crucible that can't fire now
      // says so plainly, holds the message until it's read, and closes.
      const shortInputs = fusion.eligibleInputs(player.inventory);
      const shortMats = Array.from(
        new Set(shortInputs.flatMap((i: InventoryItem) => fusion.fusionMaterialTags(i) as string[])),
      );
      const hasCat = !!fusion.findFactionCatalyst(player.inventory, equippedIdSet);
      // Plain English — no "inferred", which is an engine word the player can't
      // act on. The pieces the Crucible eats are odd salvage: the finds that
      // carry no quartermaster's name.
      let blockBody: string;
      if (shortInputs.length === 0 && !hasCat) {
        blockBody = "You haven't set anything aside for the forge. Odd salvage — the pieces that answer to no catalogue — can be saved for fusing from your pack.";
      } else if (shortInputs.length < 3) {
        blockBody = `The forge wants three pieces and you've set aside ${shortInputs.length}. Save more odd salvage for fusing.`;
      } else {
        blockBody = `The forge wants three DIFFERENT materials. Your ${shortInputs.length} pieces are all ${shortMats.join(' and ')}. Set aside something of another make — metal, bone, stone, cloth, wood, crystal.`;
      }
      set({
        fusionPickerOpen: false,
        pendingFusionSelection: null,
        fusionBlockedNotice: {
          title: 'The Crucible stays cold',
          body: blockBody,
          hint: 'Reserved pieces carry a ♥ in your pack.',
        },
      });
      get().appendLog('arbiter', `The Crucible hums, then cools. "${blockBody}"`);
      get().appendLog('debug', `fuse: refused pieces=${shortInputs.length} mats=[${shortMats.join(',')}] catalyst=${hasCat}`);
      return;
    }
    const sel = get().pendingFusionSelection;
    if (!sel) { set({ fusionPickerOpen: true }); return; }
    const selCatalyst = sel.catalystId ? (player.inventory.find((i) => i.id === sel.catalystId) ?? null) : null;
    const selChosen = sel.itemIds
      .map((id) => player.inventory.find((i) => i.id === id && i.reservedForFusion && i.quantity > 0))
      .filter(Boolean) as InventoryItem[];
    const selGate = fusion.gateFusion(player.inventory, selCatalyst, selChosen) as ReturnType<typeof import('../../engine/itemFusion').gateFusion>;
    if (selChosen.length < 3 || selChosen.length > 5 || !selGate.ok) {
      set({ pendingFusionSelection: null });
      get().appendLog('arbiter', `The Crucible cools. "${selGate.reason ?? 'Pick 3 to 5 reserved pieces spanning different materials.'}"`);
      return;
    }
    // Gate 3 — Qwen readiness. The static-inference path can't design
    // OTA-195 → OTA-221 — Qwen path PREFERRED but no longer required.
    // Playtest log: player tapped fuse 20+ times after meeting every
    // input gate, got "Aether-engine in your pack isn't ready"
    // forever. They earned the fusion (3 reserved items, 3 tags) and
    // must not be permanently blocked by Qwen state. When Qwen isn't
    // ready (or throws / returns null), the engine falls back to
    // synthesizeFusionDeterministic which produces a clamped valid
    // result from the input tag profile. Less varied than Qwen-
    // synthesized but always serviceable.
    // OTA-967 — outpost fires cost coin now, same as the roadside vendor's rig.
    // OTA-1537 - the toll is quoted for the tier this pack will actually forge.
    // selGate is already resolved above, so the tier is knowable BEFORE the
    // charge - which keeps OTA-967's ordering intact (fee after every gate,
    // before any consume) while making the price honest about what is bought.
    if (!deps.chargeOutpostCrucibleFee(
      get,
      set,
      fusion.fusionOutputRarity(selGate.inputs, selGate.tagProfile),
    )) { set({ pendingFusionSelection: null }); return; }
    get().appendLog(
      'world',
      `You set your reserved pieces on the three pedestals. The Crucible takes them in.`,
    );
    // OTA-631 — DETERMINISTIC-FIRST forge. Stats are decided and the weapon is
    // minted INSTANTLY — no blocking on Qwen (that await was the ~37s "long breath
    // in" on slow phones). The Aether "still settling its name" is now lore: the
    // item enters the pack as a placeholder-named "materializing" weapon, a
    // BACKGROUND Qwen call names + describes it, and a reveal pops when it forms.
    // If Qwen is slow / dormant / unavailable, the deterministic name settles
    // instead. The loot is mechanically identical either way — Qwen only adds
    // bespoke flavor, so nothing of value is lost when it doesn't land.
    // OTA-739 — pass recently forged armor slots so the slot picker rotates
    // instead of returning the same slot every time. Armor-only; safe for weapons.
    const det = fusion.synthesizeFusionDeterministic(
      selGate.inputs,
      selGate.tagProfile,
      sel.kind,
      get().player?.recentFusedArmorSlots ?? [],
    );

    const livePlayer = get().player;
    if (!livePlayer) return;
    const seed = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    // arb105 — optional faction catalyst. If the player reserved a faction-gear
    // item alongside their scraps, theme the output as a unique faction item; the
    // catalyst is consumed by applyFusion. arb107 — catalyst bumps rarity to
    // Legendary at 4+ material tags, else Rare.
    const catalyst = selCatalyst;
    let factionTheme: import('../../engine/itemFusion').FactionTheme | null = null;
    if (catalyst) {
      // OTA-1001 — canonical: the item passed the faction_gear gate but a stale
      // faction-id tag nulled the theme — the catalyst burned un-themed.
      const fac = FACTIONS.find((f) => canonicalItemTags(catalyst).includes(f.id));
      if (fac) {
        // OTA-1536 - THE SAME DEFECT LIVED HERE TOO. This line duplicated the
        // synth's old expression verbatim, so the catalyst path also graded a
        // pack purely on material variety and also minted Legendary from four
        // Commons. Worse, it made arb107's documented contract untrue: computing
        // the SAME value as the synth is not "one tier above" anything. Both are
        // fixed at once - the natural rarity is now quality-bounded, and the
        // catalyst genuinely confers the tier above it (capped at Legendary).
        const facRarity = fusion.bumpRarity(
          fusion.fusionOutputRarity(selGate.inputs, selGate.tagProfile),
          1,
        );
        factionTheme = { id: fac.id, label: fac.name, catalystId: catalyst.id, rarity: facRarity };
      }
    }
    // Deterministic fallback name/description — used if Qwen never names it, AND
    // stashed on the item so a reload mid-forge (background namer gone, inputs
    // already consumed) can still settle it instead of leaving it nameless.
    const detName = factionTheme ? `${factionTheme.label} ${det.name}`.slice(0, 48) : det.name;
    const detDesc = factionTheme ? `${det.description} It bears the mark of ${factionTheme.label}.` : det.description;
    // Mint NOW with a "forming" placeholder name; settleFusion stamps the real
    // name (Qwen's, or the deterministic fallback) when the Aether finishes.
    const formingResult = {
      name: 'Cooling Crucible-Work',
      description: 'Still cooling on the pedestal — the Aether has not settled its name. It will announce itself when fully formed.',
      stats: det.stats,
    };
    const { inventory: newInv, fused } = fusion.applyFusion(
      livePlayer.inventory,
      selGate.inputs,
      formingResult,
      seed,
      factionTheme,
    );
    const newInvForming = (newInv as InventoryItem[]).map((i) =>
      i.id === fused.id
        ? { ...i, materializing: true, formingName: detName, formingDesc: detDesc }
        : i,
    );
    // OTA-739 — remember the slot we just forged (armor only) so the next forge
    // rotates off it. Keep the last 2 so a 4-slot set can't immediately repeat.
    const forgedSlot = det.stats.kind === 'armor' ? det.stats.armorSlot : undefined;
    const nextRecentSlots = forgedSlot
      ? [forgedSlot, ...(livePlayer.recentFusedArmorSlots ?? [])].slice(0, 2)
      : livePlayer.recentFusedArmorSlots;
    set((s) => s.player
      ? { player: { ...s.player, inventory: newInvForming, fusionPending: false, recentFusedArmorSlots: nextRecentSlots } }
      : s);
    // arb45 — Master of Aethercraft: the fusion IS complete mechanically.
    set({ pendingFusionSelection: null, fusionPickerOpen: false });
    deps.recordTitleProgress(get, set, { fusionsCompleted: 1 });
    get().appendLog(
      'reward',
      // OTA-688 — name the ACTUAL kind the player chose (was hard-coded "weapon").
      `✦ The Crucible forges ${anOrA(fused.rarity ?? 'Rare')} ${fused.rarity ?? 'Rare'} ${sel.kind === 'armor' ? 'piece of armor' : sel.kind === 'dog_armor' ? 'piece of dog armor' : det.stats.reachClass === 'ranged' ? 'RANGED weapon' : det.stats.reachClass === 'long' ? 'reach weapon (mid range and closer)' : 'close-quarters weapon'} from your reserved pieces — and it's in your pack, still cooling.`,
    );
    get().appendLog(
      'world',
      `The Crucible exhales slow. The shape is set, but the Aether hasn't named it yet — let it finish. You'll know it the moment it announces itself.`,
    );
    void get().persist();

    // Background namer — NON-BLOCKING. The player already holds the weapon; this
    // just settles its true name when (if) Qwen returns. Falls back to the
    // deterministic name on slow / dormant / failed Qwen, or after the safety cap.
    const fusedId = fused.id;
    void (async () => {
      let finalName = detName;
      let finalDesc = detDesc;
      try {
        if (qwen.isReady()) {
          const named = await Promise.race([
            fusion.synthesizeFusionNameViaQwen(det.stats, selGate.inputs, selGate.tagProfile, qwen),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), FUSE_NAME_TIMEOUT_MS)),
          ]);
          if (named) {
            finalName = factionTheme ? `${factionTheme.label} ${named.name}`.slice(0, 48) : named.name;
            finalDesc = factionTheme ? `${named.description} It bears the mark of ${factionTheme.label}.` : named.description;
          }
        }
      } catch {
        /* deterministic name stands */
      }
      get().settleFusion(fusedId, finalName, finalDesc);
    })();
  },
});
