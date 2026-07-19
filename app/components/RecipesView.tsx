import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { RECIPES, lookupCraftedItem, missingIngredientsList, type Recipe } from '../engine/crafting';
import { recipeIsUnlockedFor } from '../engine/recipeDiscovery';
import { getItemPreview } from './itemPreview';
import type { SortDirection } from './SearchSortBar';
import { computeInventoryDelta, type InventoryDelta } from './inventoryDelta';

// OTA-087 — rarity rank for sorting. Mirrors the table in
// InventoryScreen. Common = lowest, Legendary = highest.
const RECIPE_RARITY_RANK: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Legendary: 3,
};

interface RecipeStatus {
  recipe: Recipe;
  kind: 'weapon' | 'armor' | 'consumable' | 'relic' | 'misc' | 'dog_armor';
  missing: { name: string; short: number }[];
  available: boolean;
}

// OTA-401 — substitute-aware availability. Pre-OTA this counted only
// exact-name matches, so a recipe you could actually build using a
// material substitute (e.g. Cloth Scrap standing in for Patched Cloth)
// rendered as "Missing" / muted and never lit green. Now it routes
// through the same `missingIngredientsList` the engine uses, so the
// green "ready" styling matches what `craftRecipe` will actually accept.
function evaluateRecipe(recipe: Recipe, inventory: { name: string; quantity: number }[]): RecipeStatus {
  const short = missingIngredientsList(recipe.ingredients, inventory as never);
  const missing = short.map((m) => ({ name: m.name, short: m.quantity }));
  const cat = lookupCraftedItem(recipe.result);
  return { recipe, kind: cat.kind, missing, available: missing.length === 0 };
}

function rarityColor(rarity: string | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a';
  }
}

export type RecipeKindFilter = 'consumable' | 'non-consumable';

export interface RecipesViewProps {
  /** OTA-264 — called AFTER a successful craft attempt. Receives the
   *  inventory delta produced by the craft (snapshot of before-state
   *  diffed against after-state). Use it to drive a post-craft
   *  confirmation modal AND decide whether to keep the crafting menu
   *  open or navigate away. Empty delta = craft no-op'd (engine
   *  refused / failed validation) — caller should keep the menu open
   *  and rely on the world feed for the failure narration.
   *
   *  Pre-OTA-264 this was a parameterless `() => void` that the
   *  CraftingScreen used to `setScreen('exploration')` immediately
   *  on every craft. Player feedback: "the crafting menu shouldn't
   *  close it should stay open for me to craft something else." */
  onAfterCraft?: (delta: InventoryDelta[]) => void;
  /** OTA-833 — a craft that did NOTHING (gated on Cores, missing ingredients, pack
   *  full, …) used to leave the screen silent — the player couldn't tell their tap
   *  registered. Surface the engine's refusal narration so the screen can pop a
   *  "not yet" modal. Not called for the substitution-confirm case (its own modal). */
  onCraftRefused?: (message: string) => void;
  /** OTA-059 — kind filter. CRAFT tab passes 'non-consumable' to
   *  show weapons/armor/relics/gear; RECIPES tab passes 'consumable'
   *  to show stews / tinctures / draughts. Omitting the prop shows
   *  ALL recipes (legacy callers). */
  kindFilter?: RecipeKindFilter;
  /** OTA-087 — case-insensitive substring filter on the result
   *  name. Empty/undefined → no filter. Owned by the parent
   *  screen so the SearchSortBar above this view drives state. */
  query?: string;
  /** OTA-087 — sort axis. 'ready' is the pre-OTA default
   *  (available recipes float to top, then by missing-count
   *  ascending, then alphabetic). 'name' is straight
   *  alphabetic. 'rarity' sorts by output rarity rank. */
  sortKey?: 'ready' | 'name' | 'rarity' | string;
  /** OTA-087 — direction for the sort axis. */
  sortDirection?: SortDirection;
}

// 2026-05-24 — extracted from CraftingScreen.tsx so both the standalone
// Crafting screen and the new Inventory→Recipes tab render the same UI
// without code drift.
//
// 2026-05-26 OTA-059 — rendering reshaped. Pre-OTA the view showed only
// "available" + "almost (top 8)" sections, hiding the rest of the
// recipe book. A playtester asked to see EVERY craftable blueprint so
// they could plan what to chase. Now the view shows ALL recipes
// matching the kindFilter, sorts craftable to the top, and displays
// the missing-piece list for everything else so the goal is legible.
export function RecipesView({
  onAfterCraft,
  onCraftRefused,
  kindFilter,
  query,
  sortKey = 'ready',
  sortDirection = 'asc',
}: RecipesViewProps) {
  const player = useGameStore((s) => s.player);
  const craftRecipe = useGameStore((s) => s.craftRecipe);

  const evaluated = useMemo(() => {
    if (!player) return [] as RecipeStatus[];
    // OTA-718 — hide LOCKED cool recipes (rare/legendary results not yet
    // learned) until the player discovers them by reading a recipe/blueprint
    // note or pulling one from rare loot. Basic recipes always show.
    const all = RECIPES
      .filter((r) => recipeIsUnlockedFor(r, player.knownRecipes))
      .map((r) => evaluateRecipe(r, player.inventory));
    const kindFiltered = kindFilter
      ? all.filter((e) =>
          kindFilter === 'consumable'
            ? e.kind === 'consumable'
            : e.kind !== 'consumable',
        )
      : all;
    // OTA-087 — search filter (substring on the result name,
    // case-insensitive).
    const q = (query ?? '').trim().toLowerCase();
    const searched = q.length > 0
      ? kindFiltered.filter((e) => e.recipe.result.toLowerCase().includes(q))
      : kindFiltered;
    // OTA-087 — sort by the parent's chosen axis. The pre-OTA
    // 'ready' default (available first → missing-count asc →
    // alphabetic) is preserved as one of the choices and is
    // still the default when no prop is passed.
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...searched].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.recipe.result.localeCompare(b.recipe.result) * dir;
        case 'rarity': {
          const ar = a.kind && lookupCraftedItem(a.recipe.result).rarity;
          const br = b.kind && lookupCraftedItem(b.recipe.result).rarity;
          const arr = RECIPE_RARITY_RANK[ar ?? 'Common'] ?? 0;
          const brr = RECIPE_RARITY_RANK[br ?? 'Common'] ?? 0;
          if (arr !== brr) return (arr - brr) * dir;
          return a.recipe.result.localeCompare(b.recipe.result) * dir;
        }
        case 'ready':
        default: {
          if (a.available !== b.available) return (a.available ? -1 : 1) * dir;
          if (a.missing.length !== b.missing.length) {
            return (a.missing.length - b.missing.length) * dir;
          }
          return a.recipe.result.localeCompare(b.recipe.result) * dir;
        }
      }
    });
  }, [player?.inventory, kindFilter, query, sortKey, sortDirection]);

  const availableCount = evaluated.filter((e) => e.available).length;

  // OTA-264 — snapshot inventory before craft, diff after, pass
  // the delta to the parent. craftRecipe() routes through the
  // engine synchronously (gameStore.ts:14638 → submitPlayerAction),
  // so by the time getState() runs the inventory reflects the
  // craft's outcome. Empty delta means the engine refused / no-op'd
  // — caller keeps the menu open and lets the world feed surface
  // the failure narration.
  const handleCraft = (recipe: Recipe) => {
    const preInv = (useGameStore.getState().player?.inventory ?? []).map((i) => ({ ...i }));
    const preLogLen = useGameStore.getState().gameLog.length;
    craftRecipe(recipe.result);
    const state = useGameStore.getState();
    const postInv = state.player?.inventory ?? [];
    const delta = computeInventoryDelta(preInv, postInv);
    if (delta.length > 0) {
      onAfterCraft?.(delta);
      return;
    }
    // OTA-833 — the craft produced nothing. If it raised the substitution-confirm
    // prompt, that has its own modal — don't double up. Otherwise it was REFUSED
    // (gated on Cores, missing ingredients, pack full, …); surface the newest
    // refusal narration the engine logged so the screen pops a "not yet" modal
    // instead of sitting there silently (device report: a gated craft looked like a
    // dead tap — the player only found out by leaving the menu).
    if (state.craftSubstitutionPrompt) return;
    const reason = state.gameLog
      .slice(preLogLen)
      .filter((e) => e.channel === 'arbiter' || e.channel === 'world')
      .map((e) => e.text)
      .pop() ?? 'That didn’t take — check what the recipe needs and try again.';
    onCraftRefused?.(reason);
  };

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  // OTA-704 — a weapon COATING is a consumable tagged 'weapon_coating' (Poison
  // Vial, Incendiary Paste, …). Split those out from FOOD & HEALTH so the two
  // don't intermix on the RECIPES tab: food/health first, coatings second.
  const isCoating = (result: string): boolean =>
    (lookupCraftedItem(result).tags ?? []).includes('weapon_coating');
  const CATEGORY_ORDER: Array<{ key: string; label: string; match: (e: RecipeStatus) => boolean }> = [
    { key: 'weapon', label: 'WEAPONS', match: (e) => e.kind === 'weapon' },
    { key: 'armor', label: 'ARMOR', match: (e) => e.kind === 'armor' },
    { key: 'dog_armor', label: 'DOG ARMOR', match: (e) => e.kind === 'dog_armor' },
    { key: 'relic', label: 'RELICS', match: (e) => e.kind === 'relic' },
    { key: 'food', label: 'FOOD & HEALTH', match: (e) => e.kind === 'consumable' && !isCoating(e.recipe.result) },
    { key: 'coating', label: 'WEAPON COATINGS', match: (e) => e.kind === 'consumable' && isCoating(e.recipe.result) },
    { key: 'misc', label: 'GEAR & MISC', match: (e) => e.kind === 'misc' },
  ];
  const groups = CATEGORY_ORDER
    .map((c) => ({ ...c, items: evaluated.filter(c.match) }))
    .filter((g) => g.items.length > 0);
  const renderRow = (e: RecipeStatus) => {
            const cat = lookupCraftedItem(e.recipe.result);
            const preview = getItemPreview(e.recipe.result);
            const stripeColor = e.available ? '#9ec96a' : '#3a342c';
            return (
              <TouchableOpacity
                key={e.recipe.result}
                style={[styles.recipeRow, !e.available && styles.recipeRowMuted]}
                activeOpacity={e.available ? 0.7 : 1}
                disabled={!e.available}
                onPress={() => handleCraft(e.recipe)}
              >
                <View style={[styles.recipeStripe, { backgroundColor: stripeColor }]} />
                <View style={styles.recipeBody}>
                  <View style={styles.recipeHead}>
                    <Text style={[styles.recipeName, e.available && styles.recipeNameReady, !e.available && styles.recipeNameMuted]}>
                      {e.recipe.result}
                    </Text>
                    <Text style={[styles.recipeRarity, { color: rarityColor(cat.rarity) }]}>
                      {cat.rarity ?? 'Common'}
                    </Text>
                  </View>
                  {preview.stats.length > 0 && (
                    <Text style={styles.recipeStats}>
                      {preview.stats.join(' · ')}
                    </Text>
                  )}
                  {e.available ? (
                    <>
                      <Text style={styles.recipeIng}>
                        <Text style={styles.recipeIngLabel}>Needs: </Text>
                        {/* OTA-626 — when a recipe is craftable, the row lights
                            green but the ingredient line used to stay muted gray,
                            so it wasn't obvious WHICH items you already hold. Now
                            every ingredient in a ready recipe renders green (you
                            have them all — that's why it's craftable), matching the
                            green row/stripe. */}
                        {e.recipe.ingredients.map((ing, idx) => (
                          <Text key={ing.name}>
                            <Text style={styles.recipeIngHave}>{ing.quantity}× {ing.name}</Text>
                            {idx < e.recipe.ingredients.length - 1 ? (
                              <Text style={styles.recipeIngLabel}>, </Text>
                            ) : null}
                          </Text>
                        ))}
                      </Text>
                      <Text style={styles.recipeCta}>tap to craft</Text>
                    </>
                  ) : (
                    <Text style={styles.recipeIng}>
                      <Text style={styles.recipeIngLabel}>Needs: </Text>
                      {/* OTA-736 — even for recipes you can't complete yet, color
                          each ingredient you ALREADY hold green; short ones stay
                          red with the remaining count. Lets the player see how
                          close a blueprint is and decide whether to save toward it
                          (mirrors the all-green line on a ready recipe). */}
                      {e.recipe.ingredients.map((ing, idx) => {
                        const shortEntry = e.missing.find((m) => m.name === ing.name);
                        return (
                          <Text key={ing.name}>
                            <Text style={shortEntry ? styles.recipeIngShort : styles.recipeIngHave}>
                              {ing.quantity}× {ing.name}
                            </Text>
                            {shortEntry ? (
                              <Text style={styles.recipeIngShortNote}> (need {shortEntry.short} more)</Text>
                            ) : null}
                            {idx < e.recipe.ingredients.length - 1 ? (
                              <Text style={styles.recipeIngLabel}>, </Text>
                            ) : null}
                          </Text>
                        );
                      })}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
  };

  if (!player) {
    return <Text style={styles.placeholder}>No expedition is underway.</Text>;
  }

  const arbiterLine = kindFilter === 'consumable'
    ? 'The Arbiter eyes your pantry. "Food and tonics — what the body remembers."'
    : kindFilter === 'non-consumable'
      ? 'The Arbiter looks over your pack. "Every blueprint you carry. The lit ones you can build right now."'
      : 'The Arbiter looks over your pack. "These are the things you can — or nearly can — set together."';

  return (
    <>
      <Text style={styles.arbiterLine}>{arbiterLine}</Text>

      <View style={styles.countLine}>
        <Text style={styles.countText}>
          <Text style={styles.countReady}>{availableCount} ready</Text>
          <Text style={styles.countDim}> · {evaluated.length} total</Text>
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {evaluated.length === 0 ? (
          <Text style={styles.empty}>
            {kindFilter === 'consumable'
              ? 'No food / tonic recipes in the book yet.'
              : kindFilter === 'non-consumable'
                ? 'No gear blueprints in the book yet.'
                : 'Nothing fits together yet.'}
          </Text>
        ) : (
          groups.map((g) => {
            const isCollapsed = collapsed[g.key] ?? true; // default collapsed
            const readyN = g.items.filter((x) => x.available).length;
            return (
              <View key={g.key}>
                <TouchableOpacity
                  style={styles.catBanner}
                  activeOpacity={0.7}
                  onPress={() => setCollapsed((c) => ({ ...c, [g.key]: !(c[g.key] ?? true) }))}
                >
                  <Text style={styles.catChevron}>{isCollapsed ? '▸' : '▾'}</Text>
                  <Text style={styles.catLabel}>{g.label}</Text>
                  <Text style={styles.catCount}>{readyN} ready · {g.items.length}</Text>
                </TouchableOpacity>
                {!isCollapsed && g.items.map((e) => renderRow(e))}
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  arbiterLine: { color: '#cdbf99', fontSize: 12, fontStyle: 'italic', marginBottom: 6, lineHeight: 17 },
  countLine: { marginBottom: 8 },
  countText: { fontSize: 11, letterSpacing: 1 },
  countReady: { color: '#9ec96a', fontWeight: '700' },
  countDim: { color: '#a2977b' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  catBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1813', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, marginTop: 4 },
  catChevron: { color: '#cdbf99', fontSize: 12, width: 18 },
  catLabel: { color: '#cdbf99', fontSize: 12, fontWeight: '700', letterSpacing: 2, flex: 1 },
  catCount: { color: '#a2977b', fontSize: 11 },
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
  recipeStats: { color: '#cdbf99', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
  recipeIng: { color: '#a2977b', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeIngLabel: { color: '#a2977b' },
  recipeIngHave: { color: '#9ec96a', fontWeight: '600' },
  recipeIngShort: { color: '#e07a5f', fontWeight: '600' },
  recipeIngShortNote: { color: '#a2977b' },
  recipeMissing: { color: '#e07a5f', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeCta: { color: '#9ec96a', fontSize: 10, marginTop: 6, fontStyle: 'italic', letterSpacing: 1 },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', marginTop: 40, lineHeight: 18 },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },
});
