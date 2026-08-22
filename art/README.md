# art/ — the drop folder

Finished images go in here, in the right subfolder, **under the exact filename listed below**. Nothing else is required — no renaming pass, no manifest to update, no message to me describing what landed.

Every filename below is the **id the game already uses internally**, so wiring an image into the code is mechanical rather than a guessing game. `art/02-crests/mud_monarchs.png` matches `"id": "mud_monarchs"` in `app/data/factions/factions.json`. Get the filename right and the wiring is one line.

**Prompts and lore live in [`docs/art-brief-section-1.md`](../docs/art-brief-section-1.md).** This file is only the drop convention and the technical spec.

---

## The one rule that matters

**Push images to GitHub. Do not paste them into chat.**

Images pasted into a chat window are expensive to look at, stay in the conversation crowding out everything else, and — critically — are not saved anywhere. The working container is wiped at the end of a session. An image in `art/` is versioned, backed up, and readable on demand without costing anything until it is actually needed.

---

## Format rules

| | |
|---|---|
| **File type** | PNG. `.jpg` only for the big landscape plates, if size becomes a problem. |
| **Alpha** | **Required** for crests, weather, hazards and slot icons. **Not** used for portraits, plates or the death screen. |
| **Colour** | sRGB. |
| **Naming** | Lowercase, underscores, exactly as listed. No spaces, no capitals, no version suffixes (`_v2`, `_final`) — overwrite instead, git keeps the history. |

### Size, before you commit

The generator's raw output is fine to keep. If a file lands over ~4 MB, say so and I will add an optimisation pass — the repo already carries five building paintings at ~3 MB each and 78 more at that size is worth watching, but it is not a reason to hold anything back. **Do not shrink images to be polite.** Losing detail is worse than carrying megabytes.

---

## Where each file goes

### `01-races/` — 7 files · **portrait, no alpha**
Character creation. Filenames are the race ids from `app/data/races/races.json`.

```
tartarian_giant.png
mud_dweller.png
reclaimer.png
architectural_sentinel.png
mud_golem.png
unknowing_mass.png
aetherborn.png
```

### `02-crests/` — ✅ **DONE, AND MOVED OUT**
All nine landed and are **wired in** as of OTA-1431. They now live in
**`assets/crests/`**, not here.

⚠ **That move is the flow, not a one-off.** `art/` is the INBOX — where a
finished image lands from the generator. `assets/` is what SHIPS: it is the only
tree `app.json`'s `assetBundlePatterns` bundles into the app, and it is where
every other piece of the game's art already lives (`assets/buildings/`,
`assets/outposts/`, `assets/minimap/`). So when a group gets wired, its files are
`git mv`'d from `art/<group>/` into `assets/<name>/` and the folder here goes
back to empty. Leaving a shipped asset in `art/` would mean the game references
a file from a folder that is not part of the app.

**What each emblem depicts, and why six of them were renamed:**
[`assets/crests/README.md`](../assets/crests/README.md).

Ids from `app/data/factions/factions.json`.

```
mud_monarchs.png
forgotten_order.png
reclaimers_guild.png
true_tartarians.png
eternal_dynasty.png
conspiracy_architects.png
servants_of_giants.png
stone_builders.png
tartarian_revivalists.png
```

### `03-arbiter/` — 1 file · **portrait, no alpha**
```
arbiter.png
```

### `04-dogs/` — 5 files · **landscape, no alpha**
Filenames are the starting-profile ids from `app/engine/dogCompanion.ts`.
```
mongrel.png
shepherd.png
hound.png
mutt.png
puppy.png
```

### `05-golems/` — 4 files · **portrait, no alpha**
Filenames are the `GolemKind` ids from `app/engine/golems.ts`.
```
mud_golem.png
iron_golem.png
aether_golem.png
crystal_golem.png
```
*(`mud_golem.png` appears in both `01-races/` and `05-golems/` — different images, different folders, both correct. The race is a playable person; the golem is a thing you built.)*

### `06-bosses/` — 8 files · **landscape, no alpha**
```
aetheric_behemoth.png
aetheric_lich.png
mud_tyrant.png
hollow_king.png
iron_worm.png
bog_wyrm.png
voidspawn_matriarch.png
tartarian_reaver.png
```

### `07-locations/` — 20 files · **landscape, no alpha**
Ids from `app/data/locations/locations.json`. Priority twelve first.

```
asgardar.png                 samarran.png
nimari.png                   voronov.png
varakush.png                 drakova.png
karok_sa.png                 yuldra_tul.png
ostragar.png                 iskan_veil.png
hidden_market.png            black_reach.png
```
Second wave — the four towers are **vertical**, the rest landscape:
```
grand_spire_of_asgardar.png  grand_spire_of_etheria.png
thametans_tower.png          red_tower_of_nimari.png
sinking_cathedral.png        zharaks_teeth.png
endless_stair.png            obsidian_pillars.png
giant_vault.png              mud_flood_nexus.png
parley_ground.png
```

### `08-weather/` — 9 files · **square icon, ALPHA REQUIRED**
Ids from `app/data/weather/weather.json`. Note two spellings the data uses: `etheric_storm` (no *a*) and `calm` for Eerie Calm.
```
etheric_storm.png    aether_lightning.png   ash_storm.png
black_rain.png       iron_fog.png           glass_hail.png
whisper_fog.png      silent_blizzard.png    calm.png
```

### `09-hazards/` — 11 files · **square icon, ALPHA REQUIRED**
Ids from `app/data/hazards/hazards.json`.
```
temporal_loop.png        spatial_distortion.png   etheric_storm_burst.png
ancient_trap.png         aetherstone_seal.png     magnetic_distortion.png
flooded_tunnel.png       corrupted_spores.png     reality_fracture.png
aether_mist.png          automated_defenses.png
```

### `10-slots/` — 11 files · **square silhouette, ALPHA REQUIRED**
Empty equipment-slot placeholders. Ids are the `EquipSlot` union from `app/engine/types.ts`.
```
main.png   off.png    head.png   chest.png   hands.png   legs.png
feet.png   cloak.png  amulet.png ring.png    lens.png
```
*(All three ring slots share `ring.png`.)*

### `11-death/` — 1 file · **landscape, no alpha**
```
death.png
```

---

## If the generator will not do alpha

It often won't, reliably. **Do not fight it.** Generate the emblem or icon on a **flat pure black background (#000000)** with no shadow and no glow reaching the edge of frame, save it as `<name>.png` anyway, and note it when you push. Keying a clean flat black to alpha is a script I can run over the whole folder in one pass — far more reliable than arguing with the image model, and it never damages the artwork.

The one thing that *does* break keying is a **soft drop shadow falling onto the background**, because the shadow is neither the emblem nor the background and there is no clean line to cut on. The prompts in the brief all say "no drop shadow" for exactly this reason. Keep that line in.

---

## Partial deliveries are fine

Push whatever is finished. Nothing here needs to arrive as a complete set, and no folder needs to be full before it is useful — the code falls back to what it does today whenever a file is absent, so a half-finished folder never breaks a build.
