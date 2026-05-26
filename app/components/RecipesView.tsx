import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { RECIPES, lookupCraftedItem, type Recipe } from '../engine/crafting';
import { getItemPreview } from './itemPreview';

interface RecipeStatus {
  recipe: Recipe;
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
  return { recipe, missing, available: missing.length === 0 };
}

function rarityColor(rarity: string | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a';
  }
}

export interface RecipesViewProps {
  /** Called after a successful craft. Use to navigate away (Crafting
   *  screen goes back to exploration) or stay (Inventory screen
   *  stays on the recipes tab so the player can keep stacking
   *  crafts back-to-back). */
  onAfterCraft?: () => void;
}

// 2026-05-24 — extracted from CraftingScreen.tsx so both the standalone
// Crafting screen and the new Inventory→Recipes tab render the same UI
// without code drift. Behavior identical to the CRAFT tab on the
// standalone screen; the only configurable bit is what happens after
// craftRecipe completes.
export function RecipesView({ onAfterCraft }: RecipesViewProps) {
  const player = useGameStore((s) => s.player);
  const craftRecipe = useGameStore((s) => s.craftRecipe);

  const evaluated = useMemo(() => {
    if (!player) return [] as RecipeStatus[];
    return RECIPES.map((r) => evaluateRecipe(r, player.inventory));
  }, [player?.inventory]);

  const available = evaluated.filter((e) => e.available);
  const almost = evaluated
    .filter((e) => !e.available && e.missing.length <= 2)
    .sort((a, b) => a.missing.length - b.missing.length)
    .slice(0, 8);

  const handleCraft = (recipe: Recipe) => {
    craftRecipe(recipe.result);
    onAfterCraft?.();
  };

  if (!player) {
    return <Text style={styles.placeholder}>No expedition is underway.</Text>;
  }

  return (
    <>
      <Text style={styles.arbiterLine}>
        The Arbiter looks over your pack. "These are the things you can — or nearly can — set together."
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {available.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { borderLeftColor: '#9ec96a' }]}>
              <Text style={[styles.sectionLabel, { color: '#9ec96a' }]}>READY TO CRAFT</Text>
              <Text style={styles.sectionCount}>{available.length}</Text>
            </View>
            {available.map((e) => {
              const cat = lookupCraftedItem(e.recipe.result);
              const preview = getItemPreview(e.recipe.result);
              return (
                <TouchableOpacity
                  key={e.recipe.result}
                  style={styles.recipeRow}
                  activeOpacity={0.7}
                  onPress={() => handleCraft(e.recipe)}
                >
                  <View style={[styles.recipeStripe, { backgroundColor: '#9ec96a' }]} />
                  <View style={styles.recipeBody}>
                    <View style={styles.recipeHead}>
                      <Text style={styles.recipeName}>{e.recipe.result}</Text>
                      <Text style={[styles.recipeRarity, { color: rarityColor(cat.rarity) }]}>
                        {cat.rarity ?? 'Common'}
                      </Text>
                    </View>
                    {/* 2026-05-26 OTA-049 — playtester ask: show item stats
                        so the player can compare weapons/armor before
                        committing material to a craft. getItemPreview
                        returns the compact "Damage: 2d6 (slashing)" /
                        "AC +2" / "Effect: +1 INT" lines used elsewhere
                        in the game (Player Sheet equipped slots, vendor
                        offers). Single line, dot-separated. */}
                    {preview.stats.length > 0 && (
                      <Text style={styles.recipeStats}>
                        {preview.stats.join(' · ')}
                      </Text>
                    )}
                    <Text style={styles.recipeIng}>
                      Needs: {e.recipe.ingredients.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                    </Text>
                    <Text style={styles.recipeCta}>tap to craft</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {almost.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { borderLeftColor: '#7a705c' }]}>
              <Text style={[styles.sectionLabel, { color: '#7a705c' }]}>ALMOST — MISSING A PIECE OR TWO</Text>
            </View>
            {almost.map((e) => {
              const cat = lookupCraftedItem(e.recipe.result);
              const preview = getItemPreview(e.recipe.result);
              return (
                <View key={e.recipe.result} style={[styles.recipeRow, styles.recipeRowMuted]}>
                  <View style={[styles.recipeStripe, { backgroundColor: '#3a342c' }]} />
                  <View style={styles.recipeBody}>
                    <View style={styles.recipeHead}>
                      <Text style={[styles.recipeName, styles.recipeNameMuted]}>{e.recipe.result}</Text>
                      <Text style={[styles.recipeRarity, { color: rarityColor(cat.rarity) }]}>
                        {cat.rarity ?? 'Common'}
                      </Text>
                    </View>
                    {preview.stats.length > 0 && (
                      <Text style={styles.recipeStats}>
                        {preview.stats.join(' · ')}
                      </Text>
                    )}
                    <Text style={styles.recipeMissing}>
                      Missing: {e.missing.map((m) => `${m.needed - m.have}× ${m.name}`).join(', ')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {available.length === 0 && almost.length === 0 && (
          <Text style={styles.empty}>
            Nothing fits together yet. Keep hunting and digging — Tartaria gives up its pieces slowly.
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
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
  recipeNameMuted: { color: '#a89a7a' },
  recipeRarity: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  // 2026-05-26 OTA-049 — recipe stats line. Brighter than recipeIng so
  // the player's eye lands on stats first (the comparison-driver),
  // ingredients second (the cost). Matches the cdbf99 tone the
  // CharacterScreen / VendorScreen use for equipped-item readouts.
  recipeStats: { color: '#cdbf99', fontSize: 11, marginTop: 4, lineHeight: 15, fontStyle: 'italic' },
  recipeIng: { color: '#7a705c', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeMissing: { color: '#e07a5f', fontSize: 11, marginTop: 4, lineHeight: 15 },
  recipeCta: { color: '#9ec96a', fontSize: 10, marginTop: 6, fontStyle: 'italic', letterSpacing: 1 },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 40, lineHeight: 18 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});
