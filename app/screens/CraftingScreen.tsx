import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import { repairCostMaterials } from '../engine/scrapEngine';
import { missingIngredientsList } from '../engine/crafting';
import { getPowers } from '../engine/powers';
import { RecipesView } from '../components/RecipesView';
import { CraftResultModal } from '../components/CraftResultModal';
import { BrandedModal } from '../components/BrandedModal';
import type { InventoryDelta } from '../components/inventoryDelta';
import { SearchSortBar, type SortDirection } from '../components/SearchSortBar';
import { FirstTimeHint } from '../components/FirstTimeHint';
import type { InventoryItem } from '../engine/types';
import { getItemPreview } from '../components/itemPreview';
import { GOLEM_DEFINITIONS, type GolemDefinition } from '../engine/golems';

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

// engine_Dev — the power set is data-driven (app/engine/powers.ts). getPowers()
// returns the built-in Aethercraft default OR the author's uploaded 'powers'
// table, so this tab reskins automatically. AethercraftDiscipline is a structural
// subset of Power, so the render below is unchanged.

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
const REPAIR_SORT_OPTIONS = [
  { key: 'available', label: 'READY' },
  { key: 'durability', label: 'DURABILITY' },
  { key: 'name', label: 'NAME' },
  { key: 'cost', label: 'COST' },
];

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

function evaluateRepair(item: InventoryItem, inventory: InventoryItem[]): RepairStatus {
  const cost = repairCostMaterials(item);
  const short = missingIngredientsList(cost, inventory);
  const missing = short.map((m) => ({ name: m.name, short: m.quantity }));
  return { item, cost, missing, available: cost.length > 0 && missing.length === 0 };
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
const TAB_HINTS: Record<Tab, { title: string; body: string }> = {
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
    title: 'Aetheric tab',
    body: 'Aethercraft disciplines — shape stone, summon golem, mend wounds. Per-race DC + stat bonuses apply.',
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
  const queueInputDraft = useGameStore((s) => s.queueInputDraft);
  const [tab, setTab] = useState<Tab>('craft');
  // OTA-264 — post-craft confirmation modal state. Non-null after a
  // successful craft (RecipesView's inventory diff produced items);
  // CONTINUE CRAFTING clears it to null (popup closes, screen stays
  // on the active tab so the player can chain another craft); CLOSE
  // MENU clears it AND calls setScreen('exploration') so both close.
  // Empty / null delta = craft failed or no-op'd — the world feed
  // narrates the failure; no popup, screen stays on tab.
  const [craftResult, setCraftResult] = useState<InventoryDelta[] | null>(null);
  // OTA-095 — Aethercraft tab state. cycleIdx maps a discipline
  // id → which example phrase to surface next on repeat taps;
  // pulseAt timestamps a card so its "queued" pulse can fade.
  const [aetherCycleIdx, setAetherCycleIdx] = useState<Record<string, number>>({});
  const [aetherPulseAt, setAetherPulseAt] = useState<Record<string, number>>({});
  // OTA-111 — last phrase staged per discipline card. Lets the
  // summon card's per-golem variants drive the "✓ staged" hint
  // line with the SPECIFIC summon phrase ("summon iron golem"),
  // not just whatever generic discipline example was last in
  // play. Falls back to the cycled example phrase when nothing
  // variant-specific has been staged yet.
  const [aetherLastStaged, setAetherLastStaged] = useState<Record<string, string>>({});
  // arb147 — golem summon confirm. Tapping a golem variant used to only copy
  // "summon X golem" to the clipboard and make the player paste it back in
  // exploration. Now it opens a confirm → on Summon it dispatches the action and
  // bounces to exploration, where the d20+INT roll plays out live.
  const [golemConfirm, setGolemConfirm] = useState<GolemConfirm | null>(null);
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
  const [repairSortKey, setRepairSortKey] = useState('available');
  const [repairSortDir, setRepairSortDir] = useState<SortDirection>('asc');

  // OTA 228 — repair list: every durability-tracked item in the
  // inventory that's not at full HP. Repair cost = 2× scrap output
  // (playtester spec). Available when the materials are in stock.
  const repairable = useMemo(() => {
    if (!player) return [] as RepairStatus[];
    return player.inventory
      .filter((i) => i.durability && i.durability.current < i.durability.max)
      .map((i) => evaluateRepair(i, [...player.inventory]));
  }, [player?.inventory]);

  // OTA-087 — filter + sort the repair list. Search matches
  // the item NAME substring; sort axis selectable.
  const repairableView = useMemo(() => {
    const q = repairQuery.trim().toLowerCase();
    const filtered = q.length > 0
      ? repairable.filter((r) => r.item.name.toLowerCase().includes(q))
      : repairable;
    const dir = repairSortDir === 'asc' ? 1 : -1;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (repairSortKey) {
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
        id={`crafting_tab_${tab}`}
        title={hint.title}
        body={hint.body}
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
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
        >
          <Text style={[styles.tabBtnText, tab === 'craft' && styles.tabBtnTextActive]}>CRAFT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('repair')}
          style={[styles.tabBtn, tab === 'repair' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'repair' && styles.tabBtnTextActive]}>
            REPAIR {repairable.length > 0 ? `(${repairable.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('recipes')}
          style={[styles.tabBtn, tab === 'recipes' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'recipes' && styles.tabBtnTextActive]}>RECIPES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('aetheric')}
          style={[styles.tabBtn, tab === 'aetheric' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'aetheric' && styles.tabBtnTextActive]}>AETHERIC</Text>
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
            The Arbiter taps a finger to their temple. "Three disciplines. Aethercraft burns Aether-tagged fuel to bend the rules a little. Tap a golem to summon it on the spot; shape and mend stage their phrase for the input box."
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {getPowers().map((d) => {
              const queuedIdx = aetherCycleIdx[d.id];
              const queuedPhrase = aetherLastStaged[d.id]
                ?? (queuedIdx !== undefined ? d.examples[queuedIdx] : null);
              const pulse = aetherPulseAt[d.id];
              const queued = !!pulse && Date.now() - pulse < 1400;
              // OTA-111 — stage a phrase on the input draft +
              // clipboard, set the pulse, and remember which phrase
              // is "current" for the queued-hint line. Used by both
              // the discipline card's example-cycling tap and (when
              // showGolemVariants is true) by each golem variant row.
              const stageDraft = (phrase: string, exampleIdx: number | null) => {
                queueInputDraft(phrase);
                void Clipboard.setStringAsync(phrase).catch(() => { /* ignore */ });
                setAetherPulseAt((prev) => ({ ...prev, [d.id]: Date.now() }));
                setAetherLastStaged((prev) => ({ ...prev, [d.id]: phrase }));
                if (exampleIdx !== null) {
                  setAetherCycleIdx((prev) => ({ ...prev, [d.id]: exampleIdx }));
                }
              };
              return (
                <Pressable
                  key={d.id}
                  style={({ pressed }) => [
                    styles.aetherCard,
                    pressed && styles.aetherCardPressed,
                    queued && styles.aetherCardQueued,
                  ]}
                  onPress={() => {
                    // OTA-629 — the SUMMON card now opens the confirm popup
                    // (default: first golem you can afford, else Mud) instead of
                    // copying a phrase into the input. Shape/mend keep the
                    // tap-to-stage cycling — they have no per-variant confirm.
                    if (d.showGolemVariants) {
                      const pick = GOLEM_VARIANTS.find(
                        (g) => missingIngredientsList(g.fuel, player.inventory).length === 0,
                      ) ?? GOLEM_VARIANTS[0]!;
                      setGolemConfirm(buildGolemConfirm(pick, player.inventory));
                      return;
                    }
                    if (d.examples.length === 0) return;
                    const nextIdx = ((aetherCycleIdx[d.id] ?? -1) + 1) % d.examples.length;
                    const phrase = d.examples[nextIdx]!;
                    stageDraft(phrase, nextIdx);
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
                    {/* OTA-629 — the summon card opens the confirm popup on tap,
                        so it doesn't "queue" a phrase; the phrasings are shown as
                        type-it alternatives. Shape/mend still queue on tap. */}
                    <Text style={styles.aetherCardExamplesLabel}>
                      {d.showGolemVariants ? 'Or type: ' : 'Tap card to queue: '}
                    </Text>
                    {d.examples.map((ex, i) =>
                      i === queuedIdx ? `[${ex}]` : `"${ex}"`,
                    ).join(' · ')}
                  </Text>
                  {queued && queuedPhrase && (
                    <Text style={styles.aetherCardQueuedHint}>
                      ✓ "{queuedPhrase}" staged for the input box
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <>
          <Text style={styles.arbiterLine}>
            The Arbiter takes the damaged piece. "Material cost is double what it'd give if you scrapped it. That's the trade."
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
                return (
                  <TouchableOpacity
                    key={r.item.id}
                    style={[styles.recipeRow, !r.available && styles.recipeRowMuted]}
                    activeOpacity={r.available ? 0.7 : 1}
                    disabled={!r.available}
                    onPress={() => repairInventoryItem(r.item.id)}
                  >
                    <View style={[styles.recipeStripe, { backgroundColor: stripeColor }]} />
                    <View style={styles.recipeBody}>
                      <View style={styles.recipeHead}>
                        <Text style={[styles.recipeName, r.available && styles.recipeNameReady, !r.available && styles.recipeNameMuted]}>
                          {r.item.name}
                        </Text>
                        <Text style={styles.durabilityChip}>
                          {dur.current}/{dur.max}
                        </Text>
                      </View>
                      {preview.stats.length > 0 && (
                        <Text style={styles.recipeStats}>
                          {preview.stats.join(' · ')}
                        </Text>
                      )}
                      {r.cost.length === 0 ? (
                        <Text style={styles.recipeMissing}>No repair recipe — sell or scrap instead.</Text>
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

      {/* OTA-264 — post-craft confirmation popup. Renders whenever
          craftResult is non-null (set by RecipesView's onAfterCraft
          for both Craft and Recipes tabs). CONTINUE CRAFTING clears
          the state and keeps the screen on the active tab; CLOSE
          MENU clears state AND navigates back to exploration. */}
      <CraftResultModal
        visible={craftResult !== null}
        items={craftResult ?? []}
        onContinue={() => setCraftResult(null)}
        onClose={() => {
          setCraftResult(null);
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  tabBtnText: { color: '#7a705c', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
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
  sectionCount: { color: '#7a705c', fontSize: 11 },
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
  // OTA-165 — stats line on REPAIR rows. Same style as RecipesView's
  // recipeStats so the REPAIR tab matches CRAFT / RECIPES visually.
  recipeStats: { color: '#cdbf99', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
  recipeIng: { color: '#7a705c', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeMissing: { color: '#e07a5f', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeCta: { color: '#9ec96a', fontSize: 10, marginTop: 6, fontStyle: 'italic', letterSpacing: 1 },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 40, lineHeight: 18 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
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
  aetherCardFuel: { color: '#7a705c', fontSize: 11, lineHeight: 15, marginBottom: 4 },
  aetherCardFuelLabel: { color: '#9aaab0', fontWeight: '700' },
  fuelHave: { color: '#9ec96a', fontWeight: '700' },
  aetherCardExamples: { color: '#7a705c', fontSize: 11, lineHeight: 15 },
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
  golemVariantFuel: { color: '#7a705c', fontSize: 11, marginTop: 2, lineHeight: 15 },
  golemVariantFuelLabel: { color: '#9aaab0', fontWeight: '700' },
  golemVariantPhrase: { color: '#9ec96a', fontSize: 10, marginTop: 3, fontStyle: 'italic', letterSpacing: 1 },
  golemVariantsRequires: { color: '#9aaab0', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
});
