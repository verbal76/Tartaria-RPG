// Ambient-noun → catalog-item aliases. The location interactables
// hold many variants of portable items ('rope coil', 'broken compass',
// 'dust lantern', 'rusted knife', 'sealed letter') that aren't an
// exact catalog match but reasonably resolve to one. This layer
// gives the pickup path more coverage without authoring 100+ new
// catalog entries.
//
// Conservative mappings only — when the alias is unambiguous AND
// the catalog target is a sensible portable item for the player to
// carry. Multi-word variants (e.g., 'aether lantern', 'frost
// lantern') all collapse to the same canonical 'Aetheric Torch'
// because they're all "a light source" mechanically.
//
// Anything NOT in this map AND not in the catalog directly stays
// as a scene feature → salvage redirect path.

const ALIAS_MAP: Record<string, string> = {
  // OTA-938 — loot-name near-duplicate: the Aetheric Phoenix authored 'Aetherwing' while
  // the catalog's material is 'Aether Wing'; the split minted a phantom Common item.
  'aetherwing': 'Aether Wing',
  // OTA-939 — the Aetheric<->Aether prefix family: the only PROVABLE loot-name synonyms
  // (same words modulo the prefix). Everything else uncatalogued stays a rarity-priced
  // trophy — sharing one word does not make two items the same thing.
  'aetheric residue': 'Aether Residue',
  'aetheric crystal': 'Aether Crystal',

  // ⚠⚠ THE LIGHT FAMILY WAS HERE AND IS GONE — IT WAS UNDOING THE TORCH'S SCARCITY.
  //
  // Owner: *"reduce the free lantern spawn rate, they should be a rare find, mostly
  // crafted."* Measured from his 4.29.186 log: FIVE Aetheric Torches taken in about
  // an hour, roughly one per outpost room entered — and not one of them appears in
  // that room's gear-spawn line. They came from here. `lantern` is ordinary authored
  // furniture (14 rooms in locations.json alone), so every room holding one handed
  // over a free torch through this map.
  //
  // ⚠ THAT DIRECTLY UNDID A DECISION ALREADY MADE. OTA-752 stripped the torch out of
  // the generic salvage pools in as many words — "the Aetheric Torch is a managed
  // resource now (its use is a scarce Rare/Legendary gamble); it no longer falls out
  // of generic rubble" — and left it in the `light` pool at weight 4 of 89, "a broken
  // lantern only occasionally yields a still-working one." The pools were rationing
  // it and this map was giving it away.
  //
  // ⚠ REMOVING THEM RESTORES EXACTLY THE ECONOMY THAT WAS ALREADY WRITTEN DOWN, and
  // does not make the torch unobtainable: a room lantern is now scenery that
  // SALVAGES, hitting the `light` pool — ~4.5% a working torch, otherwise Aether
  // Dust / Aether Crystal / Scrap Metal. Aether Crystal is one of the two recipe
  // ingredients (with Mud Fragment), so working lanterns over feeds the forge. Plus
  // the 35 TC vendor buy. Rare find, mostly crafted.
  //
  // ⚠ Typed use is unaffected: the parser resolves `use torch` against the player's
  // own inventory by name, not through this map, and 'torch' is already a substring
  // of 'Aetheric Torch'. This map only ever served SCENE-NOUN pickup, which is the
  // one path that had to close.

  // Rope variants
  'rope': 'Climbing Rope',
  'rope coil': 'Climbing Rope',
  'rope bundle': 'Climbing Rope',
  'aether-woven rope coil': 'Climbing Rope',
  'frozen rope': 'Climbing Rope',

  // Compass variants
  'compass': 'Aetheric Compass',
  'broken compass': 'Aetheric Compass',
  'dust compass': 'Aetheric Compass',
  'lost echo compass': 'Aetheric Compass',
  'spatial distortion compass': 'Aetheric Compass',

  // Knife variants
  'knife': 'Throwing Knife',
  'bone knife': 'Throwing Knife',
  'rusted knife': 'Throwing Knife',
  'obsidian knife': 'Throwing Knife',
  'pocket knife': 'Pocket Knife',
  'bone shiv': 'Bone Shiv',

  // Blade — already in catalog as 'Rusted Blade'
  'rusted blade': 'Rusted Blade',
  'broken blade': 'Rusted Blade',
  'discarded rusted blade': 'Rusted Blade',
  'shattered ether rod': 'Rusted Blade',

  // Spear variants → Stone Spear when generic, Iron Spear when ferrous
  'spear': 'Stone Spear',
  'bone spear': 'Stone Spear',
  'rusted spear': 'Iron Spear',
  'broken harpoon': 'Iron Spear',
  'rusted harpoon': 'Iron Spear',
  'shattered pike': 'Iron Spear',
  'pike fragment': 'Iron Spear',

  // Amulet / relic
  'aetheric locket': 'Aetheric Locket',
  'tarnished ether necklace': 'Aetheric Locket',
  'glowstone pendant': 'Aetheric Locket',
  'noble mask': 'Aetheric Locket',
  'ancient mask': 'Aetheric Locket',

  // Coin / currency
  'coin pouch': 'Worn Tartarian Coin',
  'hidden pouch': 'Worn Tartarian Coin',
  'ancient coin cache': 'Worn Tartarian Coin',

  // Crystals + shards
  'aether crystal': 'Aether Crystal',
  'storm crystal': 'Aether Crystal',
  'crystal shard': 'Aether Crystal',
  'pulse crystal': 'Aether Crystal',
  'relay crystal': 'Aether Crystal',
  'resonance crystal': 'Aether Crystal',
  'crystalline echo': 'Aether Crystal',
  'whispering aether crystal': 'Aether Crystal',
  'crystal bloom': 'Aether Crystal',
  'crystal lens': 'Aether Crystal',
  'aetheric shard': 'Aetheric Shard',
  'rift shard': 'Aetheric Shard',
  'obsidian shard': 'Aetheric Shard',
  'coral shard': 'Aetheric Shard',
  'red glass': 'Aetheric Shard',

  // Dust / aether residue
  'aether dust': 'Aether Dust',
  'aether residue': 'Aether Dust',
  'ether residue': 'Aether Dust',
  'dust mound': 'Aether Dust',
  'ash pile': 'Aether Dust',
  'ash drift': 'Aether Dust',
  'ash cloud': 'Aether Dust',
  'tower ash': 'Aether Dust',
  'mud fragment': 'Mud Fragment',

  // Scrap metal variants
  'scrap pile': 'Scrap Metal',
  'scrap metal': 'Scrap Metal',
  'rail fragment': 'Scrap Metal',
  'rail spike': 'Scrap Metal',
  'frost rail': 'Scrap Metal',
  'shell casing': 'Scrap Metal',
  'shrapnel': 'Scrap Metal',
  'bent iron spike': 'Scrap Metal',
  'bent spike': 'Scrap Metal',
  'scrap drone': 'Scrap Metal',

  // Food / consumables
  'trail rations': 'Trail Rations',

  // First aid
  'first aid kit': 'First Aid Kit',
  'aid kit': 'First Aid Kit',

  // Flares
  'flare': 'Aetheric Torch',
  'flare tube': 'Aetheric Torch',
  'broken flare': 'Aetheric Torch',
  'signal flare': 'Aetheric Torch',
  'aetheric flare shell': 'Aetheric Torch',

  // Throwing weapons
  'throwing knife': 'Throwing Knife',
};

/** Returns the canonical catalog item name for an alias, or null. */
export function resolveItemAlias(name: string): string | null {
  if (!name) return null;
  const q = name.trim().toLowerCase();
  return ALIAS_MAP[q] ?? null;
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { ALIAS_MAP };
