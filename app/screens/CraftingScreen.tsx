import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { repairCostMaterials } from '../engine/scrapEngine';
// OTA-1650 — the golem's weapon lives outside the pack; the repair list needs it.
import { offInventoryRepairables } from '../engine/companionGear';
import { missingIngredientsList, consumeIngredientsList, craftableRecipeCounts } from '../engine/crafting';
import { RecipesView } from '../components/RecipesView';
import { CraftRefusalModal } from '../components/CraftRefusalModal';
import { BrandedModal } from '../components/BrandedModal';
// OTA-1552 — the Crucible guard. Mounted on both screens that can start a job
// which spends substitutes, exactly like the craft substitution prompt above it.
import { CrucibleGuardModal } from '../components/CrucibleGuardModal';
import { computeInventoryDelta, type InventoryDelta } from '../components/inventoryDelta';
// OTA-1673 — the cast-count bound, shared with the engine so the picker can
// never offer a number the action would silently clamp.
import { MAX_CAST_BATCH } from '../state/aethercraftBatch';
import { SearchSortBar, type SortDirection } from '../components/SearchSortBar';
import { FirstTimeHint } from '../components/FirstTimeHint';
import type { InventoryItem, PlayerCharacter } from '../engine/types';
// OTA-1195 — PUNCHLIST P16. The Aetheric tab is where the disciplines already live, so it
// is where the techniques belong: same energy, same fuel, same corruption ledger.
import {
  AETHER_TECHNIQUES, TECHNIQUE_FUEL_PREFERENCE, dcForRank, proficiencyRank, proficiencyLabel,
  usesOf, type AetherTechnique,
} from '../engine/aetherTechniques';
import { getItemPreview } from '../components/itemPreview';
import { GOLEM_DEFINITIONS, type GolemDefinition } from '../engine/golems';
import { wornInstanceIds, validSlotsForItem } from '../engine/equipment';

// 2026-05-27 OTA-095 — Aethercraft disciplines moved from
// ActionReferenceScreen's "Recipes" mode (now deleted) into a
// new 4th tab on this screen. These aren't normal craft recipes
// — they're spell-equivalents the player casts by TYPING the
// phrase ("shape stone", "summon golem", "mend wounds") into
// the exploration input box. Tapping a card queues the phrase
// + drops it on the clipboard, matching the ActionReference
// Screen pattern verbatim. Cycle through example phrasings on
// repeat taps.
interface AethercraftDiscipline {
  id: string;
  title: string;
  body: string;
  fuels: string[];
  examples: string[];
  /** OTA-111 — when true, the card renders a per-golem-variant
   *  block (HP / attack / damage type / fuel cost) under the body
   *  so the player can decide which golem to summon. Data is
   *  pulled live from GOLEM_DEFINITIONS so a new golem kind shows
   *  up automatically. */
  showGolemVariants?: boolean;
}

const AETHERCRAFT_DISCIPLINES: AethercraftDiscipline[] = [
  {
    id: 'aether_shape',
    title: 'Aetherstone Manipulation (shape)',
    body:
      'INT check, DC 12. In combat: +4 AC for one turn (shaped-stone ward). Out of combat: ' +
      'binds an Aetheric Shard to a Small Rock, producing a throwable Shaped Aetheric Shard. ' +
      'Mud Dwellers and Aetherborn cast at the base DC; every other race rolls +4 harder.',
    fuels: ['Aetheric Shard', 'Aether Crystal', 'Aether Mud', 'Aether Residue', 'Golem Core', 'Aetheric Locket'],
    examples: ['shape stone', 'mold the aetherstone', 'manipulate stone'],
  },
  {
    id: 'aether_summon',
    title: 'Aether Golem Constructor (summon)',
    body:
      'INT check, DC 15 (harder than the other two — golems take stronger anchors). Summons ' +
      'a golem ally that fights for you for the rest of the scene. ' +
      'Mud Dwellers and Aetherborn cast at the base DC; every other race rolls +4 harder.',
    fuels: ['Aetheric Shard', 'Aether Crystal', 'Golem Core'],
    examples: ['summon golem', 'summon an aether golem', 'call a golem'],
    showGolemVariants: true,
  },
  {
    id: 'aether_mend',
    title: 'Aetheric Healing (mend)',
    body:
      'WIS check, DC 12. Restores HP to you or an ally. Aetherborn pay HP instead of corruption ' +
      'when they cast this — racial trait. Mud Dwellers and Aetherborn cast at the base DC; ' +
      'every other race rolls +4 harder.',
    fuels: ['Aetheric Shard', 'Aether Crystal'],
    examples: ['mend wounds', 'heal me', 'mend self', 'aetheric healing'],
  },
];

// OTA-111 — phrasing that ROUTES to each golem kind via
// parseGolemKind in app/engine/golems.ts. The keyword each phrase
// has to carry (iron / aether / crystal / mud) is what the parser
// looks at. The order here mirrors GOLEM_DEFINITIONS' insertion
// order so the cards read mud → iron → aether → crystal (lightest
// fuel to heaviest, then HP / damage trade-offs).
const GOLEM_VARIANT_PHRASE: Record<GolemDefinition['kind'], string> = {
  mud_golem: 'summon mud golem',
  iron_golem: 'summon iron golem',
  aether_golem: 'summon aether golem',
  crystal_golem: 'summon crystal golem',
};

const GOLEM_VARIANTS: GolemDefinition[] = [
  GOLEM_DEFINITIONS.mud_golem,
  GOLEM_DEFINITIONS.iron_golem,
  GOLEM_DEFINITIONS.aether_golem,
  GOLEM_DEFINITIONS.crystal_golem,
];

// OTA-629 — payload for the summon-confirm popup. Built once here so the summon
// card tap AND each per-golem variant row produce the SAME confirm (no copy-to-
// input / clipboard step anywhere in the golem flow).
type GolemConfirm = { name: string; phrase: string; stats: string; fuel: string; afford: boolean };
function buildGolemConfirm(g: GolemDefinition, inventory: InventoryItem[]): GolemConfirm {
  const phrase = GOLEM_VARIANT_PHRASE[g.kind];
  const afford = missingIngredientsList(g.fuel, inventory).length === 0;
  const fuel = g.fuel.map((f) => `${f.quantity}× ${f.name}`).join(', ');
  const modSign = g.attackMod >= 0 ? '+' : '';
  const hitTxt = g.hitBonus !== 0 ? `, +${g.hitBonus} hit` : '';
  const stats = `HP ${g.hpMax} · ${g.attackDie}${modSign}${g.attackMod} ${g.damageType}${hitTxt}`;
  return { name: g.name, phrase, stats, fuel, afford };
}

// OTA-087 — sort axes for the REPAIR tab. 'durability' sorts
// by current/max ratio so most-damaged-first when desc.
// 'available' floats items the player can fix RIGHT NOW (all
// materials in stock) to the top. 'cost' sorts by total
// material count required.
//
// OTA-1096 — owner: "let's add some different sorting options in the craft
// repair tab, still prioritize equipped it's on top as default sort." So
// EQUIPPED becomes a REAL axis and the default one, rather than an invisible
// pre-key welded onto every other axis (OTA-1094's first cut). Opening the tab
// still puts what you're wearing on top — that ask is unchanged — but tapping
// NAME now actually sorts by name instead of sorting by name *within* worn and
// unworn. A sort you pick should do the thing it says.
//
// The worn ★ badge shows on EVERY axis, so you can still find your gear after
// switching. Three new axes:
//   · SLOT   — head-to-toe body order (main → off → head → … → ring), so a
//              full kit reads like a paper doll instead of an alphabet.
//   · RARITY — Common → Legendary; desc puts your best pieces first.
//   · KIND   — weapons together, armor together, tools together.
const REPAIR_SORT_OPTIONS = [
  { key: 'equipped', label: 'EQUIPPED' },
  { key: 'available', label: 'READY' },
  { key: 'durability', label: 'DURABILITY' },
  { key: 'slot', label: 'SLOT' },
  { key: 'rarity', label: 'RARITY' },
  { key: 'kind', label: 'KIND' },
  { key: 'name', label: 'NAME' },
  { key: 'cost', label: 'COST' },
];

// OTA-1096 — shared ranks for the two new ordering axes. Deliberately the same
// numbers InventoryScreen uses, so "sorted by slot" means the identical
// head-to-toe order on both screens.
const REPAIR_RARITY_RANK: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, Legendary: 3,
};
const REPAIR_SLOT_RANK: Record<string, number> = {
  main: 0, off: 1, head: 2, chest: 3, hands: 4, legs: 5, feet: 6, cloak: 7, amulet: 8, ring: 9,
};
function repairSlotRank(item: InventoryItem): number {
  const s = validSlotsForItem(item)[0];
  // No equip slot (a rope, a lantern, a tool) sorts below the worn kit rather
  // than scattering through it.
  return s ? (REPAIR_SLOT_RANK[s] ?? 50) : 99;
}

// OTA-087 — Craft + Recipes tabs share an axis set. 'ready'
// is the existing "available first" pre-OTA sort; offered
// here as the default. 'rarity' floats higher-tier outputs to
// the top when sorted desc.
const RECIPE_SORT_OPTIONS = [
  { key: 'ready', label: 'READY' },
  { key: 'name', label: 'NAME' },
  { key: 'rarity', label: 'RARITY' },
];

interface RepairStatus {
  item: InventoryItem;
  cost: { name: string; quantity: number }[];
  missing: { name: string; short: number }[];
  available: boolean;
  // OTA-1094 — is this the piece the player is actually WEARING? Worn gear is what
  // breaks mid-fight, so it floats above every sort axis and carries a badge.
  worn: boolean;
}

// OTA-401 — substitute-aware repair affordability. The engine's
// repairInventoryItem (OTA-205) already accepts material substitutes
// (Cloth Scrap → Patched Cloth, Bent Nails → Scrap Metal, …) via
// missingIngredientsList, but this UI check still required exact-name
// matches — so a repair you could actually afford rendered as "Missing"
// and never lit green. Route it through the same engine helper so the
// highlight matches what repairInventoryItem will accept.
// OTA-401 — exact-name owned quantity. Used by the aetheric tab to
// light fuel names green when they're in the pack.
function ownedQty(inventory: InventoryItem[], name: string): number {
  const lower = name.toLowerCase();
  return inventory
    .filter((i) => i.name.toLowerCase() === lower)
    .reduce((s, i) => s + i.quantity, 0);
}

// OTA-983 — confirm popup for the NON-golem disciplines (shape / mend), mirroring the
// golem summon confirm. Tapping the card no longer copies a phrase to the clipboard
// for the player to paste back — it opens this confirm, and on Cast it dispatches
// the action and bounces to exploration so the roll plays out live.
// OTA-1195 — `technique` distinguishes an AETHER TECHNIQUE from an Aethercraft discipline
// inside the shared confirm popup. They earn the same two-tap flow but not the same words:
// nothing about a technique is a cast, so the button reads CHANNEL and the body talks about
// dose. One extra field beat a second, near-identical modal.
type DisciplineConfirm = {
  title: string; phrase: string; body: string; fuel: string; afford: boolean; technique?: boolean;
  /** ⚠ OTA-1673 — how many casts this pack could pay for. `null` on the golem
   *  summon and on techniques, which are one-at-a-time by their own rules. */
  maxCasts?: number | null;
};

/** ⚠⚠⚠ OTA-1673 — HOW MANY TIMES CAN THIS DISCIPLINE ACTUALLY FIRE. Owner wanted
 *  MAX on the shape card, and MAX has to mean what OTA-1631 made it mean on the
 *  craft picker: everything the pack can really pay for, never a number that
 *  runs out halfway.
 *
 *  ⚠ A cast spends ONE fuel from the "any one of" list — and, for shape out of
 *  combat, ALSO one Small Rock, because the shard is pulled from a rock. The
 *  binding constraint is the smaller of the two, and a MAX that counted only
 *  fuel would promise casts that fizzle with "no Small Rock to bind it to". */
function maxDisciplineCasts(d: AethercraftDiscipline, player: PlayerCharacter): number {
  const fuel = d.fuels.reduce((n, f) => n + ownedQty(player.inventory, f), 0);
  if (fuel <= 0) return 0;
  const isShape = /aetherstone manipulation|shape/i.test(`${d.id} ${d.title}`);
  if (!isShape) return fuel;
  const rocks = ownedQty(player.inventory, 'Small Rock');
  return Math.max(0, Math.min(fuel, rocks));
}

function buildDisciplineConfirm(d: AethercraftDiscipline, player: PlayerCharacter): DisciplineConfirm {
  const phrase = d.examples[0] ?? d.id;
  // Aethercraft fuels are an "any ONE of" list — affordable if the player holds ≥1.
  const afford = d.fuels.some((f) => ownedQty(player.inventory, f) >= 1);
  const fuel = `any one of: ${d.fuels.join(', ')}`;
  // ⚠ The summon card never reaches here (it opens the golem confirm), so every
  // discipline that does is battable.
  return { title: d.title, phrase, body: d.body, fuel, afford, maxCasts: maxDisciplineCasts(d, player) };
}

/** OTA-1195 — the same popup, aimed at a technique. ⚠ It states the DOSE up front: this is
 *  the one action in the game whose price is paid in corruption, and a confirm screen that
 *  hid that would be selling the player something they did not agree to. */
function buildTechniqueConfirm(
  tech: AetherTechnique,
  player: PlayerCharacter,
): DisciplineConfirm {
  const afford = TECHNIQUE_FUEL_PREFERENCE.some((f) => ownedQty(player.inventory, f) >= 1);
  const rank = proficiencyRank(usesOf(player, tech.id));
  return {
    title: tech.name,
    phrase: `channel ${tech.name.toLowerCase()}`,
    body: `${tech.effect}\n\nDC ${dcForRank(tech.baseDc, rank)} on d20 + INT (your race ladder still applies).`
      + ` Dose ${tech.baseDose} corruption on a clean run, half of that when it slips.`,
    fuel: `any one of: ${TECHNIQUE_FUEL_PREFERENCE.join(', ')}`,
    afford,
    technique: true,
  };
}

function evaluateRepair(
  item: InventoryItem,
  inventory: InventoryItem[],
  worn: ReadonlySet<string>,
): RepairStatus {
  const cost = repairCostMaterials(item);
  const short = missingIngredientsList(cost, inventory);
  const missing = short.map((m) => ({ name: m.name, short: m.quantity }));
  return {
    item,
    cost,
    missing,
    available: cost.length > 0 && missing.length === 0,
    worn: worn.has(item.id),
  };
}

// 2026-05-26 OTA-059 — three tabs. CRAFT shows every gear/relic
// blueprint with craftable ones highlighted; REPAIR shows every
// inventory item that's wearing down with repairable ones highlighted;
// RECIPES (formerly an Inventory tab) shows every food / tonic /
// elixir blueprint with the same craftable-highlight rule.
// OTA-095 — added 'aetheric' as the 4th tab. Houses Aethercraft
// disciplines (shape / summon / mend). Used to live in
// ActionReferenceScreen's "Recipes" mode, which has been
// stripped. Player request: actions = actions only; food recipes
// = Recipes tab; aether disciplines = new Aetheric tab.
type Tab = 'craft' | 'repair' | 'recipes' | 'aetheric';

// OTA-230 — per-tab first-time hints. Each entry pops once per
// install when the player first lands on that tab. Authoring rule:
// ~25 words / 2 sentences max — longer copy goes in the future
// Tutorial Replay docs (TUTORIAL_DOCS_FULL).
// OTA-1205 — exported so the copy can be pinned by test: the aetheric card shipped
// stale for a full feature wave (it described only the three disciplines while the
// tab's headline became the four techniques), and nothing could notice.
export const TAB_HINTS: Record<Tab, { title: string; body: string; id?: string }> = {
  craft: {
    title: 'Craft tab',
    body: 'Every gear / relic blueprint. Ready-to-craft ones are highlighted; the rest list what you\'re missing.',
  },
  repair: {
    title: 'Repair tab',
    body: 'Damaged weapons, armor, and relics. Tap one to spend TC and restore durability — cost scales with missing points.',
  },
  recipes: {
    title: 'Recipes tab',
    body: 'Food, tonics, elixirs. Tap a recipe with materials in hand to fire it. Same craftable-highlight rule as Craft.',
  },
  aetheric: {
    // ⚠ v2 id, deliberately: hint dismissals are per-install, so an edited body under
    // the old id would never be seen by a tester who dismissed the pre-technique card.
    // Bump the id again if this card is ever rewritten again.
    id: 'crafting_tab_aetheric_v2',
    title: 'Aetheric tab',
    body: 'Your aether techniques live here — tap Channel to raise one; each channel costs a dose, and practice raises your rank. Techniques are learned from Procedure Texts: bought from a faction that trusts you, found at aether-heavy ruins, or earned in stories. Below them, the three disciplines — shape stone, summon golem, mend wounds.',
  },
};

export function CraftingScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  // arb137 — the craft substitution prompt is set by the shared craft path, but
  // was only rendered in ExplorationScreen — so crafting from THIS screen (when the
  // recipe needs to strip substitutes) set the flag with nothing on screen, and the
  // prompt "only appeared after hitting back." Render it here too.
  const craftSubstitutionPrompt = useGameStore((s) => s.craftSubstitutionPrompt);
  const repairInventoryItem = useGameStore((s) => s.repairInventoryItem);
  // ⚠ OTA-1552 — REPAIR ALL and the repair group hand the whole list to the store
  // now instead of looping here. A guard that can stop the run has to be able to
  // keep the REST of the run, and a screen-side loop has nowhere to keep it.
  const repairInventoryItems = useGameStore((s) => s.repairInventoryItems);
  const [tab, setTab] = useState<Tab>('craft');
  // OTA-264 — post-craft confirmation modal state. Non-null after a
  // successful craft (RecipesView's inventory diff produced items);
  // CONTINUE CRAFTING clears it to null (popup closes, screen stays
  // on the active tab so the player can chain another craft); CLOSE
  // MENU clears it AND calls setScreen('exploration') so both close.
  // Empty / null delta = craft failed or no-op'd — the world feed
  // narrates the failure; no popup, screen stays on tab.
  const [craftResult, setCraftResult] = useState<InventoryDelta[] | null>(null);
  // OTA-983 — the haul banner clears itself; there is no button to hunt for.
  useEffect(() => {
    if (craftResult === null) return;
    const t = setTimeout(() => setCraftResult(null), 2600);
    return () => clearTimeout(t);
  }, [craftResult]);
  // OTA-833 — refusal popup message. Set when a craft did nothing and wasn't a
  // substitution-confirm (gated on Cores / missing ingredients / pack full). Renders
  // the CraftRefusalModal so a gated tap isn't a silent no-op.
  const [craftRefusal, setCraftRefusal] = useState<string | null>(null);
  // arb147 — golem summon confirm. Tapping a golem variant used to only copy
  // "summon X golem" to the clipboard and make the player paste it back in
  // exploration. Now it opens a confirm → on Summon it dispatches the action and
  // bounces to exploration, where the d20+INT roll plays out live.
  const [golemConfirm, setGolemConfirm] = useState<GolemConfirm | null>(null);
  // OTA-983 — confirm popup for shape/mend (Aetherstone Manipulation / Aetheric
  // Healing). Same UX as the golem summon: tap the card → confirm → cast (no
  // clipboard copy-paste).
  const [disciplineConfirm, setDisciplineConfirm] = useState<DisciplineConfirm | null>(null);
  // ⚠ OTA-1673 — the discipline's cast count. Reset to 1 whenever the confirm
  // opens, so a ×9 chosen on the last card is never inherited by the next one —
  // a stale count on an action that spends crystals is how a player burns nine
  // meaning to burn one.
  const [castCount, setCastCount] = useState(1);
  useEffect(() => { if (disciplineConfirm !== null) setCastCount(1); }, [disciplineConfirm]);
  // A technique is one channel per tap (each carries its own corruption dose), so
  // it gets no stepper at all — the picker only appears where batching is honest.
  const castBatchMax = disciplineConfirm && !disciplineConfirm.technique
    ? Math.max(1, Math.min(disciplineConfirm.maxCasts ?? 1, MAX_CAST_BATCH))
    : 1;
  // OTA-087 — per-tab search + sort state. Each tab keeps its
  // own so switching tabs doesn't clobber the user's filter.
  // Defaults are tuned per category: craft/recipes default to
  // 'ready' (matches pre-OTA RecipesView sort), repair to
  // 'available' which prioritizes fixable items.
  const [craftQuery, setCraftQuery] = useState('');
  const [craftSortKey, setCraftSortKey] = useState('ready');
  const [craftSortDir, setCraftSortDir] = useState<SortDirection>('asc');
  const [recipesQuery, setRecipesQuery] = useState('');
  const [recipesSortKey, setRecipesSortKey] = useState('ready');
  const [recipesSortDir, setRecipesSortDir] = useState<SortDirection>('asc');
  const [repairQuery, setRepairQuery] = useState('');
  // OTA-1096 — EQUIPPED is the default axis. Opening the tab still puts what
  // you are wearing on top; picking any other axis now genuinely sorts by it.
  const [repairSortKey, setRepairSortKey] = useState('equipped');
  // OTA-1102 — REPAIR group mode. Owner: "I thought we were going to do the same
  // tap and hold to multiselect for repair too. it will have to take into
  // account the items needed for each item you sent and dim make items in
  // selectable if the items you selected consume the items needed."
  //
  // That second sentence is the whole feature. Repairs draw from ONE shared pile
  // of materials, so unlike sell (where every row is independent) each pick
  // changes what the next pick can afford. A group builder that ignored that
  // would happily let you tick eight things and then quietly fix three.
  const [repairSelectMode, setRepairSelectMode] = useState(false);
  const [repairSelected, setRepairSelected] = useState<string[]>([]);
  const [repairGroupConfirm, setRepairGroupConfirm] = useState(false);
  const [repairSortDir, setRepairSortDir] = useState<SortDirection>('asc');

  // OTA 228 — repair list: every durability-tracked item in the
  // inventory that's not at full HP. Repair cost = 2× scrap output
  // (playtester spec). Available when the materials are in stock.
  const repairable = useMemo(() => {
    if (!player) return [] as RepairStatus[];
    // OTA-1094 — resolve worn instances ONCE per inventory change (it walks every
    // equip slot), then stamp `worn` on each row.
    const worn = wornInstanceIds(player);
    const fromPack = player.inventory
      .filter((i) => i.durability && i.durability.current < i.durability.max)
      .map((i) => evaluateRepair(i, [...player.inventory], worn));
    // ⚠⚠ OTA-1650 — AND THE PIECES THAT ARE NOT IN THE PACK. The dog's vest is
    // already above (it lives in the inventory with `vestId` pointing at it),
    // but the golem's weapon is held on `player.golem.weapon` — outside the
    // inventory entirely — so this list has never once shown it and there was no
    // way in the game to mend one. `offInventoryRepairables` returns exactly the
    // damaged companion pieces this filter cannot see, and nothing that would
    // duplicate a row already in it.
    const offPack = offInventoryRepairables(player)
      .map((r) => ({ ...evaluateRepair(r.item, [...player.inventory], worn), worn: true }));
    return [...fromPack, ...offPack];
  }, [player?.inventory, player?.equipped, player?.dog?.equipped, player?.golem?.weapon]);

  // OTA-087 — filter + sort the repair list. Search matches
  // the item NAME substring; sort axis selectable.
  const repairableView = useMemo(() => {
    const q = repairQuery.trim().toLowerCase();
    const filtered = q.length > 0
      ? repairable.filter((r) => r.item.name.toLowerCase().includes(q))
      : repairable;
    const dir = repairSortDir === 'asc' ? 1 : -1;
    const sorted = [...filtered];
    const byName = (x: RepairStatus, y: RepairStatus) => x.item.name.localeCompare(y.item.name) * dir;
    sorted.sort((a, b) => {
      switch (repairSortKey) {
        // OTA-1094 → OTA-1096. Worn gear used to be an unconditional pre-key on
        // every axis. Owner: "when you open the repair tab, it should prioritize
        // all of the things that are equipped that can be repaired at the top" —
        // which is about the tab's DEFAULT state, and this axis is now that
        // default. Making it an axis instead of a hidden pre-key means picking
        // NAME sorts by name, rather than by name within worn and within unworn.
        // The piece you are standing in is the one whose durability decides the
        // next fight, so it still leads the moment you open the tab; within the
        // worn block, what you can actually fix right now comes first.
        case 'equipped': {
          if (a.worn !== b.worn) return (a.worn ? -1 : 1) * dir;
          if (a.available !== b.available) return a.available ? -1 : 1;
          return byName(a, b);
        }
        // OTA-1096 — head-to-toe body order, so a full kit reads like a paper
        // doll. Gear with no equip slot (rope, lantern, tools) sits below it.
        case 'slot': {
          const ar = repairSlotRank(a.item);
          const br = repairSlotRank(b.item);
          if (ar !== br) return (ar - br) * dir;
          return byName(a, b);
        }
        // OTA-1096 — Common → Legendary asc; tap again for your best first.
        case 'rarity': {
          const ar = REPAIR_RARITY_RANK[a.item.rarity ?? 'Common'] ?? 0;
          const br = REPAIR_RARITY_RANK[b.item.rarity ?? 'Common'] ?? 0;
          if (ar !== br) return (ar - br) * dir;
          return byName(a, b);
        }
        // OTA-1096 — weapons together, armor together, tools together.
        case 'kind': {
          const ak = a.item.kind ?? '';
          const bk = b.item.kind ?? '';
          if (ak !== bk) return ak.localeCompare(bk) * dir;
          return byName(a, b);
        }
        case 'available': {
          // available=true floats to top when asc (the playtester-
          // friendly default — what can I fix RIGHT NOW?).
          if (a.available !== b.available) {
            return (a.available ? -1 : 1) * dir;
          }
          return a.item.name.localeCompare(b.item.name) * dir;
        }
        case 'durability': {
          const ad = a.item.durability!;
          const bd = b.item.durability!;
          const ap = ad.current / Math.max(1, ad.max);
          const bp = bd.current / Math.max(1, bd.max);
          if (ap !== bp) return (ap - bp) * dir;
          return a.item.name.localeCompare(b.item.name) * dir;
        }
        case 'cost': {
          const ac = a.cost.reduce((s, c) => s + c.quantity, 0);
          const bc = b.cost.reduce((s, c) => s + c.quantity, 0);
          if (ac !== bc) return (ac - bc) * dir;
          return a.item.name.localeCompare(b.item.name) * dir;
        }
        case 'name':
        default:
          return a.item.name.localeCompare(b.item.name) * dir;
      }
    });
    return sorted;
  }, [repairable, repairQuery, repairSortKey, repairSortDir]);

  // OTA-708 — per-tab "craftable NOW" counts for the tab-bar badges (like REPAIR's).
  const craftableCounts = useMemo(() => {
    const inv = player?.inventory ?? [];
    // OTA-718 — exclude locked (undiscovered) cool recipes from the tab badges.
    const { craft, recipes } = craftableRecipeCounts(inv, player?.knownRecipes);
    const aetheric = AETHERCRAFT_DISCIPLINES.filter(
      (d) => d.fuels.some((f) => ownedQty(inv, f) >= 1),
    ).length;
    return { craft, recipes, aetheric };
  }, [player?.inventory]);
  // ⚠⚠⚠ OTA-1720 — "EVERYTHING I NEED FOR THIS NEXT FIGHT". Owner: *"when you say
  // repair all ready that also repairs stuff that I've scavenged off and killed
  // enemies. I'm not going to use the seven cudgels that I'm going to repair by
  // accident. what I'm really concerned about is everything that I'm going to
  // wear into combat — all my gear, weapons and armor and shields and everything
  // like that that is equipped on my body. that's the quick fix."*
  //
  // `worn` is already stamped on every row by wornInstanceIds (OTA-1094), and the
  // tab's default sort axis already floats it — the number was simply never asked
  // for. It costs one filter, and it is the only count on this screen that
  // answers "am I about to walk into a fight in broken gear".
  //
  // ⚠ It INCLUDES the dog's vest and the golem's weapon (offInventoryRepairables
  // stamps those `worn`). They are not on your body, but they are in the fight,
  // and a button that mends your boots and leaves your dog's vest split is not
  // the button he asked for.
  const repairReady = useMemo(() => repairable.filter((r) => r.available).length, [repairable]);
  const repairEquippedReady = useMemo(
    () => repairable.filter((r) => r.worn && r.available).length,
    [repairable],
  );
  // ⚠⚠ WHAT IS WORN, DAMAGED, AND NOT AFFORDABLE — the honest reason a button is
  // not offered. Owner: *"if you can't repair it cuz you don't have enough pieces
  // then it shouldn't be highlighted."* Right, and the other half of that is that
  // a control which simply vanishes teaches nobody anything; this is the same
  // silent-absence defect OTA-1719 closed on the report screen.
  const equippedShortOf = useMemo(() => {
    const short = new Map<string, number>();
    for (const r of repairable) {
      if (!r.worn || r.available) continue;
      for (const m of r.missing) short.set(m.name, (short.get(m.name) ?? 0) + m.short);
    }
    return [...short.entries()].map(([name, qty]) => `${qty}× ${name}`);
  }, [repairable]);
  // OTA-1098 — what REPAIR ALL would actually touch: the READY rows in the
  // CURRENT view, in display order. Reading off repairableView (not repairable)
  // is what lets the search box act as the selection — filter to what you mean,
  // then mend that. Order carries through, so on the default EQUIPPED axis the
  // gear you are standing in is mended first, which matters when materials run
  // out partway.
  const repairReadyInView = useMemo(
    () => repairableView.filter((r) => r.available).map((r) => r.item.id),
    [repairableView],
  );
  // Each call re-checks stock against the live inventory and refuses honestly if
  // an earlier repair drained a shared material, so this is exactly "tapping
  // every ready row, top to bottom" — no second code path that could disagree
  // with the single-row one about cost, substitutions, or eligibility. The
  // per-repair lines land within the feed's 500ms same-channel window, so they
  // group into one card rather than spraying the log.
  const repairAllReady = () => {
    repairInventoryItems(repairReadyInView);
  };
  // OTA-1720 — same single code path, filtered to the kit. Order carries through
  // from the view, so on the default EQUIPPED axis the gear you are standing in
  // is mended first when materials run out partway.
  const repairEquippedInView = useMemo(
    () => repairableView.filter((r) => r.worn && r.available).map((r) => r.item.id),
    [repairableView],
  );
  const repairKitNow = () => {
    repairInventoryItems(repairEquippedInView);
  };

  // OTA-1102 — THE RUNNING MATERIAL BUDGET. This is the part that makes a repair
  // group different from a sell group: repairs draw from ONE shared pile, so
  // every pick changes what the next pick can afford.
  //
  // Rather than model that with our own arithmetic, we SIMULATE with the engine's
  // own functions — `missingIngredientsList` to ask "can I afford this against
  // the stock left?", `consumeIngredientsList` to spend it. Both are
  // substitution-aware (Cloth Scrap standing in for Patched Cloth, and so on),
  // so the dimming matches to the unit what the repairs will actually spend. A
  // hand-rolled cost tally would drift from the substitution rules the moment
  // someone touched them, and the drift would show up as a button that lies.
  //
  // Selection ORDER decides who gets the materials — first ticked, first served,
  // same as the order the repairs then run in.
  const repairPlan = useMemo(() => {
    const picked: RepairStatus[] = [];
    const starved: RepairStatus[] = [];
    let stock: InventoryItem[] = [...(player?.inventory ?? [])];
    for (const id of repairSelected) {
      const row = repairable.find((r) => r.item.id === id);
      if (!row) continue; // repaired, dropped or sold since — falls out of the group
      if (row.cost.length === 0) { starved.push(row); continue; }
      if (missingIngredientsList(row.cost, stock).length > 0) { starved.push(row); continue; }
      stock = consumeIngredientsList(stock, row.cost);
      picked.push(row);
    }
    // What is STILL affordable out of the remainder. An unpicked row that fails
    // here is dimmed and un-tappable — the owner's ask, and the honest answer to
    // "why can't I add this?": the pieces you already picked are spending it.
    const affordable = new Set<string>();
    for (const r of repairable) {
      if (repairSelected.includes(r.item.id)) continue;
      if (r.cost.length === 0) continue;
      if (missingIngredientsList(r.cost, stock).length === 0) affordable.add(r.item.id);
    }
    const spend = new Map<string, number>();
    for (const row of picked) {
      for (const c of row.cost) spend.set(c.name, (spend.get(c.name) ?? 0) + c.quantity);
    }
    return { picked, starved, affordable, spend };
  }, [player?.inventory, repairable, repairSelected]);

  const exitRepairSelect = () => { setRepairSelectMode(false); setRepairSelected([]); setRepairGroupConfirm(false); };
  const toggleRepairSelect = (id: string) => {
    setRepairSelected((cur) => {
      if (cur.includes(id)) {
        const next = cur.filter((x) => x !== id);
        // Emptying the group leaves the mode — never a bar reading "0".
        if (next.length === 0) setRepairSelectMode(false);
        return next;
      }
      // Adding is gated on affordability against the REMAINING stock, so the
      // group can never contain something it cannot pay for.
      if (!repairPlan.affordable.has(id)) return cur;
      return [...cur, id];
    });
  };
  const beginRepairSelect = (id: string) => {
    // The first pick only needs to be affordable on its own, which `available`
    // already says.
    const row = repairable.find((r) => r.item.id === id);
    if (!row?.available) return;
    setRepairSelectMode(true);
    setRepairSelected([id]);
  };
  const runRepairGroup = () => {
    // Snapshot the ids first — each repair mutates the inventory the plan was
    // derived from. `repairInventoryItem` re-checks stock itself, so even if
    // something shifts underneath, the worst case is an honest shortage line
    // rather than a silent skip.
    repairInventoryItems(repairPlan.picked.map((r) => r.item.id));
    exitRepairSelect();
  };

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  // OTA-230 — per-tab first-time hint. Each tab has its own
  // dismissable popup that fires the first time the player lands on
  // it. The hook re-reads AsyncStorage when `id` changes so switching
  // tabs surfaces the next hint correctly.
  const hint = TAB_HINTS[tab];

  return (
    <View style={styles.container}>
      <FirstTimeHint
        id={hint.id ?? `crafting_tab_${tab}`}
        title={hint.title}
        body={hint.body}
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">
          {tab === 'craft' ? 'CRAFTING'
            : tab === 'repair' ? 'REPAIR'
            : tab === 'recipes' ? 'RECIPES'
            : 'AETHERIC'}
        </Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setTab('craft')}
          style={[styles.tabBtn, tab === 'craft' && styles.tabBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'craft' }}
        >
          <Text style={[styles.tabBtnText, tab === 'craft' && styles.tabBtnTextActive]}>
            CRAFT {craftableCounts.craft > 0 ? `(${craftableCounts.craft})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('repair')}
          style={[styles.tabBtn, tab === 'repair' && styles.tabBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'repair' }}
        >
          <Text style={[styles.tabBtnText, tab === 'repair' && styles.tabBtnTextActive]}>
            {/* ⚠⚠ OTA-1720 — the badge counts what you are WEARING. It used to
                count every affordable row, so seven scavenged cudgels made the
                tab shout REPAIR (9) when nothing you fight in needed a thing.
                A number that is mostly junk is a number you learn to ignore. */}
            REPAIR {repairEquippedReady > 0 ? `(${repairEquippedReady})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('recipes')}
          style={[styles.tabBtn, tab === 'recipes' && styles.tabBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'recipes' }}
        >
          <Text style={[styles.tabBtnText, tab === 'recipes' && styles.tabBtnTextActive]}>
            RECIPES {craftableCounts.recipes > 0 ? `(${craftableCounts.recipes})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('aetheric')}
          style={[styles.tabBtn, tab === 'aetheric' && styles.tabBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'aetheric' }}
        >
          <Text style={[styles.tabBtnText, tab === 'aetheric' && styles.tabBtnTextActive]}>
            AETHERIC {craftableCounts.aetheric > 0 ? `(${craftableCounts.aetheric})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'craft' ? (
        <>
          <SearchSortBar
            query={craftQuery}
            onQueryChange={setCraftQuery}
            placeholder="Search blueprints…"
            sortOptions={RECIPE_SORT_OPTIONS}
            sortKey={craftSortKey}
            sortDirection={craftSortDir}
            onSortChange={(k, d) => { setCraftSortKey(k); setCraftSortDir(d); }}
          />
          <RecipesView
            kindFilter="non-consumable"
            onAfterCraft={(delta) => {
              if (delta.length > 0) setCraftResult(delta);
              // Empty delta = craft failed; world feed shows the
              // error and the screen stays on the active tab.
            }}
              onCraftRefused={setCraftRefusal}
            query={craftQuery}
            sortKey={craftSortKey}
            sortDirection={craftSortDir}
          />
        </>
      ) : tab === 'recipes' ? (
        <>
          <SearchSortBar
            query={recipesQuery}
            onQueryChange={setRecipesQuery}
            placeholder="Search recipes…"
            sortOptions={RECIPE_SORT_OPTIONS}
            sortKey={recipesSortKey}
            sortDirection={recipesSortDir}
            onSortChange={(k, d) => { setRecipesSortKey(k); setRecipesSortDir(d); }}
          />
          <RecipesView
            kindFilter="consumable"
            onAfterCraft={(delta) => {
              if (delta.length > 0) setCraftResult(delta);
              // Empty delta = craft failed; world feed shows the
              // error and the screen stays on the active tab.
            }}
              onCraftRefused={setCraftRefusal}
            query={recipesQuery}
            sortKey={recipesSortKey}
            sortDirection={recipesSortDir}
          />
        </>
      ) : tab === 'aetheric' ? (
        <>
          {/* 2026-05-27 OTA-095 — Aethercraft disciplines tab.
              Three spell-equivalents (shape / summon / mend)
              that burn Aether-tagged fuel. Tapping a card cycles
              through its example phrasings and queues the
              picked phrase into the exploration input box +
              clipboard. Player then hits BACK and the phrase is
              already staged in the input — they just submit. */}
          <Text style={styles.arbiterLine}>
            The Arbiter taps a finger to their temple. "Three disciplines. Aethercraft burns Aether-tagged fuel to bend the rules a little. Tap any of them — golem, shape, or mend — and confirm; the roll plays out in the world view."
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {AETHERCRAFT_DISCIPLINES.map((d) => {
              return (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.aetherCard,
                    pressed && styles.aetherCardPressed,
                  ]}
                  onPress={() => {
                    // OTA-629 — the SUMMON card opens the golem confirm popup.
                    // OTA-983 — shape (Aetherstone Manipulation) and mend (Aetheric
                    // Healing) now open their OWN confirm popup too, instead of
                    // copying a phrase to the clipboard for the player to paste
                    // back. No copy-paste anywhere in the aetheric flow.
                    if (d.showGolemVariants) {
                      const pick = GOLEM_VARIANTS.find(
                        (g) => missingIngredientsList(g.fuel, player.inventory).length === 0,
                      ) ?? GOLEM_VARIANTS[0]!;
                      setGolemConfirm(buildGolemConfirm(pick, player.inventory));
                      return;
                    }
                    setDisciplineConfirm(buildDisciplineConfirm(d, player));
                  }}
                >
                  <Text style={styles.aetherCardTitle}>{d.title}</Text>
                  <Text style={styles.aetherCardBody}>{d.body}</Text>
                  {/* OTA-401 — light each fuel name green when it's in the
                      pack so the player can see at a glance which discipline
                      they can fire right now. "Any one" → each name is judged
                      independently (need ≥1 of it). */}
                  <Text style={styles.aetherCardFuel}>
                    <Text style={styles.aetherCardFuelLabel}>Fuel (any one): </Text>
                    {d.fuels.map((f, i) => (
                      <Text key={f} style={ownedQty(player.inventory, f) >= 1 ? styles.fuelHave : undefined}>
                        {f}{i < d.fuels.length - 1 ? ', ' : ''}
                      </Text>
                    ))}
                  </Text>
                  {/* OTA-111 — per-golem stats + fuel recipe. Only
                      the summon card sets showGolemVariants. Each
                      row is independently tappable: tapping a row
                      stages the SPECIFIC `summon <kind> golem`
                      phrase so the player gets the variant they
                      picked, instead of the parser defaulting to
                      mud_golem on a bare `summon golem`. */}
                  {d.showGolemVariants && (
                    <View style={styles.golemVariants}>
                      <Text style={styles.golemVariantsHeader}>Golem variants — tap to stage that summon:</Text>
                      {GOLEM_VARIANTS.map((g) => {
                        // OTA-629 — same payload the summon card uses; tapping a
                        // row opens the confirm popup (→ Summon dispatches and
                        // jumps to exploration), no copy-to-input step.
                        const c = buildGolemConfirm(g, player.inventory);
                        return (
                          <Pressable
                            key={g.kind}
                            accessibilityRole="button"
                            style={({ pressed }) => [
                              styles.golemVariantRow,
                              pressed && styles.golemVariantRowPressed,
                            ]}
                            onPress={() => setGolemConfirm(c)}
                          >
                            <Text style={styles.golemVariantName}>{g.name}</Text>
                            <Text style={styles.golemVariantStats}>{c.stats}</Text>
                            <Text style={styles.golemVariantBlurb}>{g.blurb}</Text>
                            <Text style={styles.golemVariantFuel}>
                              <Text style={styles.golemVariantFuelLabel}>Needs: </Text>
                              <Text style={c.afford ? styles.fuelHave : undefined}>{c.fuel}</Text>
                            </Text>
                            <Text style={styles.golemVariantPhrase}>tap to summon →</Text>
                          </Pressable>
                        );
                      })}
                      <Text style={styles.golemVariantsRequires}>
                        Requires: d20 + INT vs per-golem DC — Mud 13, Iron 15, Aether 17, Crystal 19. Shape and mend roll vs DC 12. Mud Dwellers cast at base DC and gain +2 INT, Aetherborn +2 DC, other races +3 DC.
                      </Text>
                    </View>
                  )}
                  <Text style={styles.aetherCardExamples}>
                    {/* OTA-983 — every discipline card opens a confirm popup on tap
                        (golem, shape, mend). No copy-to-input; the phrasings are
                        just the equivalent things you could type. */}
                    <Text style={styles.aetherCardExamplesLabel}>
                      Tap card to cast · or type:{' '}
                    </Text>
                    {d.examples.map((ex) => `"${ex}"`).join(' · ')}
                  </Text>
                </Pressable>
              );
            })}

            {/* ⚠ OTA-1195 — AETHER TECHNIQUES (PUNCHLIST P16). The rules shipped in
                OTA-1191 with no caller and no screen, which is the same defect P4 and P14
                are filed for. This is the screen.

                ⚠ UNKNOWN TECHNIQUES ARE LISTED, NOT HIDDEN — and that is the design
                decision on this block. A hidden list means a player who has never met a
                rapport vendor has no way to learn the feature exists, so the only route in
                depends on stumbling across it. Shown-but-locked turns each row into a
                goal: it names the INT it wants and says where the procedure is sold. */}
            <Text style={styles.techHeader}>AETHER TECHNIQUES</Text>
            <Text style={styles.techIntro}>
              Not casting — procedures, run on a hazard. Each one burns the same Aetheric fuel the
              disciplines do and costs you a dose of corruption whether it holds or not. Practice
              makes them easier, never stronger, and only counts when something was actually
              trying to kill you.
            </Text>
            {AETHER_TECHNIQUES.map((t) => {
              const known = (player.knownTechniques ?? []).includes(t.id);
              const rank = proficiencyRank(usesOf(player, t.id));
              const intOk = player.stats.intelligence >= t.intRequired;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  disabled={!known}
                  style={({ pressed }) => [
                    styles.aetherCard,
                    !known && styles.techCardLocked,
                    known && pressed && styles.aetherCardPressed,
                  ]}
                  onPress={() => { if (known) setDisciplineConfirm(buildTechniqueConfirm(t, player)); }}
                >
                  <Text style={styles.aetherCardTitle}>
                    {t.name} <Text style={styles.techTier}>· {t.tier}</Text>
                    {known ? <Text style={styles.techRank}>  {proficiencyLabel(rank)}</Text> : null}
                  </Text>
                  <Text style={styles.aetherCardBody}>{t.effect}</Text>
                  <Text style={styles.aetherCardFuel}>
                    <Text style={styles.aetherCardFuelLabel}>Needs: </Text>
                    <Text style={intOk ? styles.fuelHave : undefined}>INT {t.intRequired}</Text>
                    <Text> · DC {dcForRank(t.baseDc, rank)} · dose {t.baseDose} corruption</Text>
                  </Text>
                  <Text style={styles.aetherCardExamples}>
                    {known
                      ? <Text style={styles.aetherCardExamplesLabel}>Tap to channel · or type: </Text>
                      : <Text style={styles.aetherCardExamplesLabel}>Not yet taught — </Text>}
                    {known
                      ? `"channel ${t.name.toLowerCase()}"`
                      : 'a faction whose rapport you have earned sells this procedure.'}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={styles.techFootnote}>
              Channelling in a fight costs you the round — the enemy answers. Outside one it costs
              minutes and stamina. Aetherborn take half the dose; everyone else pays it in full.
            </Text>
          </ScrollView>
        </>
      ) : (
        <>
          <Text style={styles.arbiterLine}>
            The Arbiter takes the damaged piece. "Material cost is double what it'd give if you salvaged it. That's the trade."
          </Text>

          <SearchSortBar
            query={repairQuery}
            onQueryChange={setRepairQuery}
            placeholder="Search damaged gear…"
            sortOptions={REPAIR_SORT_OPTIONS}
            sortKey={repairSortKey}
            sortDirection={repairSortDir}
            onSortChange={(k, d) => { setRepairSortKey(k); setRepairSortDir(d); }}
          />

          {/* OTA-1098 — REPAIR ALL. Owner: "let's also add a select all to the
              repair tab." Repair has no deferred step — the action IS the
              repair — so a select-all with nothing to press afterwards would be
              two taps where there is one job. This is the same idea aimed at
              the actual work: fix everything currently listed as READY, in the
              order shown, so worn gear goes first on the default axis.
              It acts on the FILTERED view, which is what makes it a selection
              rather than a blunt instrument: search "boot", tap REPAIR ALL, and
              only boots get mended. */}
          {/* OTA-1102 — while a group is open the bar TAKES REPAIR ALL's place
              and holds it, the same way the sell group took the tab row (1124).
              It sits above the ScrollView, so it cannot scroll away from you
              while you tick rows further down — which is exactly when the
              running material cost starts to matter. */}
          {repairSelectMode ? (
            <View style={styles.groupBar}>
              <View style={styles.groupBarHead}>
                <Text style={styles.groupBarCount}>
                  ☑ {repairPlan.picked.length} to mend
                </Text>
                <TouchableOpacity
                  onPress={exitRepairSelect}
                  style={styles.groupBarCancel}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel the group and go back to repairing one at a time"
                >
                  <Text style={styles.groupBarCancelText}>CANCEL</Text>
                </TouchableOpacity>
              </View>
              {/* The running bill. This is the number the dimming is derived
                  from, so showing it turns "why is that greyed out?" into
                  "because I already spent the cloth." */}
              <Text style={styles.groupBarSpend}>
                {repairPlan.spend.size === 0
                  ? 'No materials committed yet.'
                  : `Costs: ${[...repairPlan.spend.entries()].map(([n, q]) => `${q}× ${n}`).join(', ')}`}
              </Text>
              <TouchableOpacity
                onPress={() => setRepairGroupConfirm(true)}
                disabled={repairPlan.picked.length === 0}
                style={[styles.groupBarGo, repairPlan.picked.length === 0 && styles.groupBarGoOff]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ disabled: repairPlan.picked.length === 0 }}
                accessibilityLabel={`Repair the group of ${repairPlan.picked.length}`}
              >
                <Text style={styles.groupBarGoText}>⚒ REPAIR GROUP ({repairPlan.picked.length})</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ⚠⚠⚠ OTA-1720 — THE BUTTON HE ASKED FOR, and it leads. Everything
                  you are wearing, wielding, or fighting beside, mended in one
                  tap. The all-ready sweep stays underneath it, smaller and
                  honestly labelled, because filtering by search and sweeping is
                  still the right tool for a pack full of loot — it is just not
                  the thing you reach for between fights. */}
              {repairEquippedInView.length > 0 && (
                <TouchableOpacity
                  style={styles.repairAllBtn}
                  activeOpacity={0.7}
                  onPress={() => repairKitNow()}
                  accessibilityRole="button"
                  accessibilityLabel={`Repair the ${repairEquippedInView.length} damaged ${repairEquippedInView.length === 1 ? 'piece' : 'pieces'} you have equipped, including your companions' gear`}
                >
                  <Text style={styles.repairAllText}>
                    ⚒ REPAIR MY KIT ({repairEquippedInView.length}) — everything equipped
                  </Text>
                </TouchableOpacity>
              )}
              {/* Only offered when it would actually do MORE than the kit button,
                  so the two never sit there as a redundant pair. */}
              {repairReadyInView.length > repairEquippedInView.length && (
                <TouchableOpacity
                  style={styles.repairSweepBtn}
                  activeOpacity={0.7}
                  onPress={() => repairAllReady()}
                  accessibilityRole="button"
                  accessibilityLabel={`Also repair the ${repairReadyInView.length - repairEquippedInView.length} damaged pieces you are not using${repairQuery.trim() ? ', matching your search' : ''}`}
                >
                  <Text style={styles.repairSweepText}>
                    ⚒ repair everything listed ({repairReadyInView.length}) — includes {repairReadyInView.length - repairEquippedInView.length} you are not wearing{repairQuery.trim() ? ' · matching search' : ''}
                  </Text>
                </TouchableOpacity>
              )}
              {/* ⚠⚠ AND WHEN THERE IS NO BUTTON, IT SAYS WHY. This whole row used
                  to render `null`: short on materials and the control simply was
                  not there, which is the defect OTA-1719 closed on the report
                  screen and OTA-1715 closed on the dog. */}
              {repairReadyInView.length === 0 && repairableView.length > 0 && (
                <Text style={styles.repairNothingReady}>
                  {equippedShortOf.length > 0
                    ? `Nothing can be mended yet — your equipped gear is short ${equippedShortOf.join(', ')}.`
                    : 'Nothing listed can be mended yet — you are short the materials each piece asks for.'}
                </Text>
              )}
            </>
          )}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {repairableView.length === 0 ? (
              <Text style={styles.empty}>
                {repairable.length === 0
                  ? 'Nothing in your pack needs mending. Take a few more hits and check back.'
                  : 'No damaged items match the search.'}
              </Text>
            ) : (
              repairableView.map((r) => {
                const dur = r.item.durability!;
                const stripeColor = r.available ? '#9ec96a' : '#3a342c';
                // OTA-165 — stats line on the REPAIR row. Pre-OTA the
                // repair tab showed only name + durability + cost so a
                // player with three damaged blades couldn't tell which
                // one was which from this screen. getItemPreview surfaces
                // damage / AC / scales-with-STR / passive bonuses / etc.
                // — same data the CRAFT and RECIPES tabs already show
                // via RecipesView. Player ask: "any of the tabs that are
                // in there all of the items that you're crafting. it
                // should show the stats for them. that way you know what
                // you're crafting so you know which one to pick."
                const preview = getItemPreview(r.item.name);
                // OTA-1102 — group state for this row. `groupStarved` is the
                // owner's dimming rule: not picked, and the picks already made
                // have claimed the materials it would need. Outside group mode
                // none of this applies and the row behaves exactly as before.
                const groupPicked = repairSelectMode && repairSelected.includes(r.item.id);
                const groupBlocked = repairSelectMode && !groupPicked && !repairPlan.affordable.has(r.item.id);
                // STARVED is the narrower case worth explaining out loud: a row
                // you COULD afford on its own that the group has already spent
                // the materials for. A row that was never affordable is blocked
                // too, but it already carries its own "Missing:" line — telling
                // that player the group ate their cloth would be a lie.
                const groupStarved = groupBlocked && r.available;
                // In group mode a picked row can always be un-picked, and a
                // blocked one can never be picked. Outside it, the old
                // "available materials" gate still decides.
                const rowTappable = repairSelectMode ? (groupPicked || !groupBlocked) : r.available;
                return (
                  <TouchableOpacity
                    key={r.item.id}
                    style={[
                      styles.recipeRow,
                      !r.available && styles.recipeRowMuted,
                      // OTA-1102 — a picked row is outlined; a row the group has
                      // already spent the materials for is DIMMED. Owner: "dim
                      // make items in selectable if the items you selected
                      // consume the items needed."
                      groupPicked && styles.recipeRowPicked,
                      groupStarved && styles.recipeRowStarved,
                    ]}
                    activeOpacity={rowTappable ? 0.7 : 1}
                    disabled={!rowTappable}
                    onPress={() => (repairSelectMode
                      ? toggleRepairSelect(r.item.id)
                      : repairInventoryItem(r.item.id))}
                    onLongPress={() => (repairSelectMode
                      ? toggleRepairSelect(r.item.id)
                      : beginRepairSelect(r.item.id))}
                    delayLongPress={350}
                    accessibilityRole={repairSelectMode ? 'checkbox' : 'button'}
                    accessibilityLabel={`${r.item.name}${r.worn ? ', equipped' : ''}, ${dur.current} of ${dur.max} durability`}
                    accessibilityState={repairSelectMode
                      ? { checked: groupPicked, disabled: !rowTappable }
                      : { disabled: !r.available }}
                    accessibilityHint={repairSelectMode
                      ? (groupPicked
                        ? 'In the group. Tap to take it out.'
                        : groupStarved
                          ? 'Cannot be added — the pieces already picked are spending the materials it needs.'
                          : groupBlocked
                            ? 'Cannot be added — you do not have the materials it needs.'
                            : 'Tap to add it to the group.')
                      : 'Tap to repair this one. Hold to start a group.'}
                  >
                    <View style={[styles.recipeStripe, { backgroundColor: stripeColor }]} />
                    <View style={styles.recipeBody}>
                      <View style={styles.recipeHead}>
                        <Text style={[styles.recipeName, r.available && styles.recipeNameReady, !r.available && styles.recipeNameMuted]}>
                          {/* OTA-1102 — the group box leads the row, the way a
                              checklist does. */}
                          {repairSelectMode ? (groupPicked ? '☑ ' : '☐ ') : ''}
                          {/* OTA-1094 — the worn marker rides the NAME so it survives
                              every sort axis and reads at a glance in the top block. */}
                          {r.worn ? '★ ' : ''}{r.item.name}
                        </Text>
                        <Text style={styles.durabilityChip}>
                          {dur.current}/{dur.max}
                        </Text>
                      </View>
                      {r.worn && (
                        <Text style={styles.repairWorn}>EQUIPPED — this is what breaks mid-fight</Text>
                      )}
                      {/* OTA-1102 — say WHY it is dimmed. "Greyed out" with no
                          reason is the silent-rule failure OTA-1094 was written
                          against; this one has a precise, honest answer. */}
                      {groupStarved && (
                        <Text style={styles.repairStarved}>
                          The pieces you already picked are spending the materials this needs.
                        </Text>
                      )}
                      {preview.stats.length > 0 && (
                        <Text style={styles.recipeStats}>
                          {preview.stats.join(' · ')}
                        </Text>
                      )}
                      {r.cost.length === 0 ? (
                        <Text style={styles.recipeMissing}>No repair recipe — sell or salvage instead.</Text>
                      ) : r.available ? (
                        <>
                          <Text style={styles.recipeIng}>
                            Cost: {r.cost.map((c) => `${c.quantity}× ${c.name}`).join(', ')}
                          </Text>
                          <Text style={styles.recipeCta}>tap to repair</Text>
                        </>
                      ) : (
                        <Text style={styles.recipeMissing}>
                          Missing: {r.missing.map((m) => `${m.short}× ${m.name}`).join(', ')}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </>
      )}

      {/* OTA-983 — SUPERSEDES OTA-264's popup. That modal asked "CONTINUE CRAFTING
          or CLOSE MENU" after every single craft — a question whose answer was
          always the same (owner: "assume they always want to continue crafting,
          never close the crafting menu till they hit a back button"). The count
          is chosen up front now, so all that's left is to say what was made.
          This banner does that and fades itself; nothing to dismiss, and the
          menu stays exactly where it was. */}
      {craftResult !== null && (
        <View style={styles.craftBanner} accessibilityRole="alert">
          <Text style={styles.craftBannerText} numberOfLines={2}>
            ✦ {craftResult.map((d) => `${d.name}${d.quantity > 1 ? ` ×${d.quantity}` : ''}`).join(', ')} added
          </Text>
        </View>
      )}

      {/* OTA-833 — craft-REFUSAL popup. A gated / unaffordable craft used to do
          nothing visible (silent fail); now the engine's refusal narration surfaces
          here so the tap clearly registered. KEEP CRAFTING stays; CLOSE MENU exits. */}
      <CraftRefusalModal
        visible={craftRefusal !== null}
        message={craftRefusal ?? ''}
        onContinue={() => setCraftRefusal(null)}
        onClose={() => {
          setCraftRefusal(null);
          setScreen('exploration');
        }}
      />

      {/* arb137 — substitution confirm prompt, also rendered on this screen so a
          craft started here doesn't silently wait on a modal back in exploration. */}
      <BrandedModal
        visible={craftSubstitutionPrompt !== null}
        title="Strip these for parts?"
        body={craftSubstitutionPrompt
          ? `Crafting ${craftSubstitutionPrompt.recipeResult} will consume substitutes from your pack:\n\n${craftSubstitutionPrompt.subsList}\n\nThese stand in for the listed ingredients and will be used up. Proceed?`
          : undefined}
        buttons={[
          {
            label: 'Keep them',
            onPress: () => useGameStore.getState().cancelCraftSubstitution(),
            tone: 'neutral',
          },
          {
            label: 'Craft & strip',
            onPress: () => useGameStore.getState().confirmCraftSubstitution(),
            tone: 'primary',
          },
        ]}
        onRequestClose={() => useGameStore.getState().cancelCraftSubstitution()}
      />

      {/* ⚠ OTA-1552 — the Crucible guard. Rendered here for the same reason
          arb137 rendered the substitution prompt here: repair and craft both
          start on THIS screen, and a modal set with nothing on screen is a
          silent no-op the player reads as a broken button. */}
      <CrucibleGuardModal />

      {/* arb147 — golem summon confirm. Dispatches the summon and returns to
          exploration so the d20+INT roll plays out live (no clipboard paste). */}
      <BrandedModal
        visible={golemConfirm !== null}
        title="Summon a golem?"
        body={golemConfirm
          ? `${golemConfirm.name}\n${golemConfirm.stats}\nNeeds: ${golemConfirm.fuel}\n\n${golemConfirm.afford
              ? 'You have the materials. Summoning rolls d20 + INT against this golem’s DC — watch the roll play out in the world view.'
              : 'You’re short on materials — the attempt will name exactly what’s missing.'}\n\nOnly one golem at a time; dismiss the current one first if you already have it out.`
          : undefined}
        buttons={[
          {
            label: 'Summon',
            tone: 'primary',
            onPress: () => {
              const phrase = golemConfirm?.phrase;
              setGolemConfirm(null);
              if (phrase) {
                useGameStore.getState().submitPlayerAction(phrase);
                setScreen('exploration');
              }
            },
          },
          { label: 'Cancel', tone: 'neutral', onPress: () => setGolemConfirm(null) },
        ]}
        onRequestClose={() => setGolemConfirm(null)}
      />

      {/* OTA-983 — shape (Aetherstone Manipulation) + mend (Aetheric Healing) confirm.
          ⚠⚠⚠ OTA-1673 — AND IT NO LONGER THROWS YOU OUT. Owner: *"every time you do
          one it kicks you back out of crafting to the exploration screen — you
          should be staying in crafting once you're done."* He is right, and this
          was the only surface still doing it: an ordinary craft has stayed put
          since OTA-983, and only the aetheric disciplines still called
          setScreen('exploration'). The roll still narrates into the world feed —
          nothing is lost by staying — and the same transient banner an ordinary
          craft uses reports what came of it.

          ⚠⚠ The +/− and MAX ride the same NumberStepper BrandedModal already
          carries, so this is one control the player has met before rather than a
          second picker with its own habits. Techniques keep a single cast: a
          dose of corruption per channel is not something to batch behind one tap. */}
      <BrandedModal
        visible={disciplineConfirm !== null}
        title={disciplineConfirm?.title ?? 'Aethercraft'}
        body={disciplineConfirm
          ? `${disciplineConfirm.body}\n\nFuel — ${disciplineConfirm.fuel}\n\n${disciplineConfirm.afford
              ? (disciplineConfirm.technique
                  // OTA-1195 — a technique's line names the two costs a discipline does not
                  // have: the dose lands either way, and in a fight this IS your round.
                  ? 'You have fuel for it. The dose lands whether the field holds or not, and in a fight this spends your turn — watch it play out in the world view.'
                  : 'You have fuel for it. Each cast rolls against the discipline’s DC on its own — the results land in the world feed, and this menu stays open.')
              : 'You’re short on fuel — the attempt will name exactly what’s missing.'}`
          : undefined}
        quantityStepper={castBatchMax > 1 ? {
          label: `How many casts? (fuel and rock for ${castBatchMax})`,
          value: castCount,
          min: 1,
          max: castBatchMax,
          onChange: setCastCount,
        } : undefined}
        buttons={[
          {
            label: disciplineConfirm?.technique
              ? 'Channel'
              : (castBatchMax > 1 && castCount > 1 ? `Cast ×${castCount}` : 'Cast'),
            tone: 'primary',
            onPress: () => {
              const phrase = disciplineConfirm?.phrase;
              const n = castBatchMax > 1 ? castCount : 1;
              setDisciplineConfirm(null);
              if (phrase) {
                const preInv = (useGameStore.getState().player?.inventory ?? []).map((i) => ({ ...i }));
                useGameStore.getState().submitPlayerAction(phrase, { castCount: n });
                // ⚠ The SAME banner an ordinary craft uses, from the same delta
                // helper — so "what did I just get" is answered identically
                // whichever tab produced it, and neither surface can drift.
                const post = useGameStore.getState().player?.inventory ?? [];
                const delta = computeInventoryDelta(preInv, post).filter((d) => d.quantity > 0);
                if (delta.length > 0) setCraftResult(delta);
              }
            },
          },
          { label: 'Cancel', tone: 'neutral', onPress: () => setDisciplineConfirm(null) },
        ]}
        onRequestClose={() => setDisciplineConfirm(null)}
      />

      {/* OTA-1102 — the group repair confirm. A repair is not reversible and the
          whole group spends from one pile, so the last screen before the hammer
          falls itemises what is being mended AND what it costs. The bar above
          already showed the running bill; this is where it stops being a
          running number and becomes a bargain you agreed to. */}
      <BrandedModal
        visible={repairGroupConfirm}
        title={`Repair ${repairPlan.picked.length} ${repairPlan.picked.length === 1 ? 'piece' : 'pieces'}?`}
        body={[
          repairPlan.picked
            .map((r) => `· ${r.worn ? '★ ' : ''}${r.item.name} (${r.item.durability?.current ?? 0}/${r.item.durability?.max ?? 0})`)
            .join('\n'),
          repairPlan.spend.size > 0
            ? `\nMaterials spent:\n${[...repairPlan.spend.entries()].map(([n, q]) => `· ${q}× ${n}`).join('\n')}`
            : '',
          // A ticked row the budget cannot pay for is NAMED, never dropped in
          // silence. Stock can shift under a group — a craft in the next tab,
          // a repair that resolved first — and a group that mends six of the
          // seven pieces you picked without saying which one it skipped is the
          // exact bulk-action failure this whole run has been written against.
          repairPlan.starved.length > 0
            ? `\nNot enough materials for:\n${repairPlan.starved.map((r) => `· ${r.item.name}`).join('\n')}\nThese stay damaged.`
            : '',
        ].filter(Boolean).join('\n')}
        buttons={[
          { label: 'Back', tone: 'neutral', onPress: () => setRepairGroupConfirm(false) },
          { label: '⚒ Repair them', tone: 'primary', onPress: runRepairGroup },
        ]}
        onRequestClose={() => setRepairGroupConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // OTA-983 — the post-craft haul banner that replaced the "continue crafting?"
  // question. Sits over the list, says what landed, and fades on its own.
  craftBanner: {
    position: 'absolute', top: 8, left: 12, right: 12,
    backgroundColor: '#1d2416', borderWidth: 1, borderColor: '#9ec96a',
    borderRadius: 4, paddingVertical: 10, paddingHorizontal: 14, zIndex: 20,
  },
  craftBannerText: { color: '#9ec96a', fontSize: 13, lineHeight: 18 },
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
  },
  tabBtnActive: { borderColor: '#c9a86a' },
  tabBtnText: { color: '#a2977b', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  tabBtnTextActive: { color: '#c9a86a' },
  arbiterLine: { color: '#cdbf99', fontSize: 12, fontStyle: 'italic', marginBottom: 10, lineHeight: 17 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sectionCount: { color: '#a2977b', fontSize: 11 },
  recipeRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  recipeRowMuted: { opacity: 0.6 },
  recipeStripe: { width: 4 },
  recipeBody: { flex: 1, padding: 10 },
  recipeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  recipeName: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  recipeNameReady: { color: '#9ec96a' },
  recipeNameMuted: { color: '#a89a7a' },
  recipeRarity: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  durabilityChip: { color: '#c9a86a', fontSize: 11, fontWeight: '700' },
  // OTA-1094 — the worn-gear callout on a REPAIR row. Same gold as the EQUIPPED
  // badge in the Crucible upgrade list so "worn" reads identically everywhere.
  repairWorn: { color: '#e6c67a', fontSize: 10, marginTop: 3, letterSpacing: 0.6, fontWeight: '700' },
  // OTA-1098 — the REPAIR ALL bar. Green like the per-row "tap to repair" cue,
  // because it does the same thing at scale; full width so it reads as an
  // action on the list rather than a filter chip on the bar above it.
  repairAllBtn: {
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#1a2614',
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  repairAllText: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  // ⚠ OTA-1720 — the sweep is SECONDARY now: same green family, quieter frame and
  // no fill, so the eye lands on the kit button first. It is still a real
  // control, not a hint.
  repairSweepBtn: {
    borderColor: '#4a5a38',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 7,
    alignItems: 'center',
    marginBottom: 8,
  },
  repairSweepText: { color: '#7f9a5e', fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },
  repairNothingReady: {
    color: '#a89a7a', fontSize: 11, fontStyle: 'italic', marginBottom: 8, textAlign: 'center',
  },
  // OTA-1102 — the repair group bar. Same trade-gold frame as the vendor's
  // group-sell bar (1122/1124) because it is the same gesture doing the same
  // job in a different room; it stacks rather than sits in one row because the
  // running material bill needs a line of its own.
  groupBar: {
    backgroundColor: '#1e1a12',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 6,
  },
  groupBarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  groupBarCount: { color: '#e6d8b3', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  groupBarCancel: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupBarCancelText: { color: '#a2977b', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  // The running bill — the number every dimmed row downstream is derived from.
  groupBarSpend: { color: '#c9a86a', fontSize: 11, lineHeight: 15 },
  groupBarGo: {
    backgroundColor: '#1a2614',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 8,
    alignItems: 'center',
  },
  groupBarGoOff: { opacity: 0.4 },
  groupBarGoText: { color: '#9ec96a', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  // A picked row is outlined in the same gold as the bar, so a group reads as
  // one block down the list; a starved one is pushed back behind it.
  recipeRowPicked: { borderColor: '#c9a86a', backgroundColor: '#1e1a12' },
  recipeRowStarved: { opacity: 0.45 },
  repairStarved: { color: '#c9a86a', fontSize: 10, marginTop: 3, lineHeight: 14, fontStyle: 'italic' },
  // OTA-165 — stats line on REPAIR rows. Same style as RecipesView's
  // recipeStats so the REPAIR tab matches CRAFT / RECIPES visually.
  recipeStats: { color: '#cdbf99', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
  recipeIng: { color: '#a2977b', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeMissing: { color: '#e07a5f', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeCta: { color: '#9ec96a', fontSize: 10, marginTop: 6, fontStyle: 'italic', letterSpacing: 1 },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', marginTop: 40, lineHeight: 18 },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },
  // OTA-095 — Aethercraft discipline card styles. Mirrors the
  // recipe-row look but with a slightly cooler border tint to
  // visually mark these as not-quite-craft (spells, not items).
  aetherCard: {
    backgroundColor: '#13110f',
    borderColor: '#3a5a6c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 8,
    padding: 12,
  },
  aetherCardPressed: { opacity: 0.7 },
  aetherCardQueued: { borderColor: '#9ec96a' },
  aetherCardTitle: { color: '#cdbf99', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  aetherCardBody: { color: '#a89a7a', fontSize: 12, lineHeight: 17, marginBottom: 6 },
  aetherCardFuel: { color: '#a2977b', fontSize: 11, lineHeight: 15, marginBottom: 4 },
  aetherCardFuelLabel: { color: '#9aaab0', fontWeight: '700' },
  fuelHave: { color: '#9ec96a', fontWeight: '700' },
  // OTA-1195 — technique rows in the Aetheric tab. Locked rows are dimmed rather than
  // hidden (see the block comment at the list) so an untaught procedure reads as a goal.
  techHeader: { color: '#cdbf99', fontSize: 13, fontWeight: '700', letterSpacing: 1.5, marginTop: 18, marginBottom: 4 },
  techIntro: { color: '#a89a7a', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  techCardLocked: { opacity: 0.55 },
  techTier: { color: '#a2977b', fontSize: 12, fontWeight: '400' },
  techRank: { color: '#9ec96a', fontSize: 11, fontWeight: '700' },
  techFootnote: { color: '#8b7f66', fontSize: 11, lineHeight: 16, marginTop: 10, marginBottom: 4 },
  aetherCardExamples: { color: '#a2977b', fontSize: 11, lineHeight: 15 },
  aetherCardExamplesLabel: { color: '#9aaab0', fontWeight: '700' },
  aetherCardQueuedHint: { color: '#9ec96a', fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  // OTA-111 — per-golem variant rows under the summon discipline
  // card. Same dark inset look as the parent card, slightly muted
  // borders so the variants read as a nested list. Each row is
  // tappable and stages the specific `summon <kind> golem` phrase
  // so the player gets the variant they picked (parser otherwise
  // defaults to mud_golem on a bare `summon golem`).
  golemVariants: { marginTop: 6, marginBottom: 4 },
  golemVariantsHeader: { color: '#9aaab0', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  golemVariantRow: {
    backgroundColor: '#0e0d0c',
    borderColor: '#2a2620',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  golemVariantRowPressed: { opacity: 0.65 },
  golemVariantName: { color: '#cdbf99', fontSize: 12, fontWeight: '700' },
  golemVariantStats: { color: '#c9a86a', fontSize: 11, marginTop: 2 },
  golemVariantBlurb: { color: '#a89a7a', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  golemVariantFuel: { color: '#a2977b', fontSize: 11, marginTop: 2, lineHeight: 15 },
  golemVariantFuelLabel: { color: '#9aaab0', fontWeight: '700' },
  golemVariantPhrase: { color: '#9ec96a', fontSize: 10, marginTop: 3, fontStyle: 'italic', letterSpacing: 1 },
  golemVariantsRequires: { color: '#9aaab0', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
});
