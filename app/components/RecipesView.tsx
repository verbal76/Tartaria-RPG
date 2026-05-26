import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { RECIPES, lookupCraftedItem, type Recipe } from '../engine/crafting';
import { getItemPreview } from './itemPreview';

interface RecipeStatus {
  recipe: Recipe;
  kind: 'weapon' | 'armor' | 'consumable' | 'relic' | 'misc';
  missing: { name: string; needed: number; have: number }[];
  available: boolean;
}

function evaluateRecipe(recipe: Recipe, inventory: { name: string; quantity: number }[]): RecipeStatus {
  const missing: RecipeStatus['missing'] = [];
  for (const ing of recipe.ingredients) {
    const have = inventory
      .filter((i) => i.name.toLowerCase() === ing.name.toLowerCase())
      .reduce((sum, i) => sum + i.quantity, 0);
    if (have < ing.quantity) {
      missing.push({ name: ing.name, needed: ing.quantity, have });
    }
  }
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
  /** Called after a successful craft. Use to navigate away (Crafting
   *  screen goes back to exploration) or stay. */
  onAfterCraft?: () => void;
  /** OTA-059 — kind filter. CRAFT tab passes 'non-consumable' to
   *  show weapons/armor/relics/gear; RECIPES tab passes 'consumable'
   *  to show stews / tinctures / draughts. Omitting the prop shows
   *  ALL recipes (legacy callers). */
  kindFilter?: RecipeKindFilter;
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
export function RecipesView({ onAfterCraft, kindFilter }: RecipesViewProps) {
  const player = useGameStore((s) => s.player);
  const craftRecipe = useGameStore((s) => s.craftRecipe);

  const evaluated = useMemo(() => {
    if (!player) return [] as RecipeStatus[];
    const all = RECIPES.map((r) => evaluateRecipe(r, player.inventory));
    const filtered = kindFilter
      ? all.filter((e) =>
          kindFilter === 'consumable'
            ? e.kind === 'consumable'
            : e.kind !== 'consumable',
        )
      : all;
    // Sort: available (craftable) first, then by ascending missing-
    // count, then alphabetically. Stable + deterministic.
    return [...filtered].sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      return a.recipe.result.localeCompare(b.recipe.result);
    });
  }, [player?.inventory, kindFilter]);

  const availableCount = evaluated.filter((e) => e.available).length;

  const handleCraft = (recipe: Recipe) => {
    craftRecipe(recipe.result);
    onAfterCraft?.();
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
          evaluated.map((e) => {
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
                    <Text style={[styles.recipeName, !e.available && styles.recipeNameMuted]}>
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
                        Needs: {e.recipe.ingredients.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </Text>
                      <Text style={styles.recipeCta}>tap to craft</Text>
                    </>
                  ) : (
                    <Text style={styles.recipeMissing}>
                      Missing: {e.missing.map((m) => `${m.needed - m.have}× ${m.name}`).join(', ')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
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
  countDim: { color: '#7a705c' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
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
  recipeNameMuted: { color: '#a89a7a' },
  recipeRarity: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  recipeStats: { color: '#cdbf99', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
  recipeIng: { color: '#7a705c', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeMissing: { color: '#e07a5f', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeCta: { color: '#9ec96a', fontSize: 10, marginTop: 6, fontStyle: 'italic', letterSpacing: 1 },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 40, lineHeight: 18 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});
