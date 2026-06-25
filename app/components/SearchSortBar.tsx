// 2026-05-27 OTA-087 — Shared search + sort bar for list-view
// screens (Inventory, Crafting [Craft/Repair/Recipes tabs]).
// Single component so the four surfaces stay visually
// consistent and behavior changes ripple in one place.
//
// API: the parent owns query/sortKey/direction state; the bar
// is a controlled component that emits change callbacks. Sort
// options are passed in so each screen can declare its
// category-relevant axes (e.g., inventory: name/rarity/kind/
// quantity; repair: durability%; recipes: ready-first/name).
// Tapping the active sort toggles its direction (asc ↔ desc).

import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export type SortDirection = 'asc' | 'desc';

export interface SortOption {
  /** Stable id used by the parent to dispatch the actual sort. */
  key: string;
  /** Short label rendered on the segmented control (5–8 chars
   *  ideal — 'NAME', 'RARITY', 'KIND', 'QTY', 'DURABILITY',
   *  'READY', 'COST'). */
  label: string;
}

export interface SearchSortBarProps {
  /** Current search query (case-insensitive substring match). */
  query: string;
  onQueryChange: (next: string) => void;
  /** Placeholder for the search input. Defaults to "Search…". */
  placeholder?: string;
  /** Available sort axes for this screen. */
  sortOptions: SortOption[];
  /** Currently active sort key. */
  sortKey: string;
  /** Currently active sort direction. */
  sortDirection: SortDirection;
  /** Called when the user taps a sort button. If the tapped key
   *  is already active, the direction should toggle; otherwise
   *  the new key becomes active with the parent's preferred
   *  default direction. */
  onSortChange: (key: string, direction: SortDirection) => void;
}

export function SearchSortBar({
  query,
  onQueryChange,
  placeholder = 'Search…',
  sortOptions,
  sortKey,
  sortDirection,
  onSortChange,
}: SearchSortBarProps) {
  const handleSortTap = (key: string) => {
    if (key === sortKey) {
      onSortChange(key, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New axis selected — keep current direction or default to
      // asc. Parent can override by ignoring the direction in
      // its onSortChange handler if it prefers per-axis defaults.
      onSortChange(key, sortDirection);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          placeholderTextColor="#6ab0c9"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => onQueryChange('')}
            style={styles.clearBtn}
            hitSlop={6}
            activeOpacity={0.7}
          >
            <Text style={styles.clearText}>×</Text>
          </TouchableOpacity>
        )}
      </View>
      {sortOptions.length > 0 && (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>SORT</Text>
          {sortOptions.map((opt) => {
            const active = opt.key === sortKey;
            const arrow = active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '';
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => handleSortTap(opt.key)}
                style={[styles.sortBtn, active && styles.sortBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>
                  {opt.label}{arrow}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 4,
  },
  input: {
    flex: 1,
    color: '#d6e4e8',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clearText: { color: '#6c8088', fontSize: 18, fontWeight: '700' },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  sortLabel: {
    color: '#6c8088',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
    marginRight: 4,
  },
  sortBtn: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sortBtnActive: { borderColor: '#6ab0c9' },
  sortBtnText: {
    color: '#6c8088',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sortBtnTextActive: { color: '#6ab0c9' },
});
