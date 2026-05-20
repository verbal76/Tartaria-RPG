# Tartaria Prima: Master Exploration and Salvage Registry — v2

> Authored source for location interactables. v2 expanded to 24 location
> families (toward an eventual 50-section world index). Noun-cores from
> each section have been merged into `app/data/locations/locations.json`
> `interactables` arrays via `tools/merge_registry_v2.py`.

The full descriptive registry lives in this doc; only the noun-cores
land in JSON. Reach back here when authoring container_loot entries,
hook outcomes, area-search MATERIAL_LINES, or quest items.

**Section → macro-location mapping** (sub-areas fold into closest macro;
promotable to standalone hubs/rooms later if/when needed):

| Section | Folds into |
|---|---|
| Asgardar (Ancient Capital) | `asgardar` |
| Sovereign Plaza | `asgardar` |
| The Hanging Gardens | `asgardar` |
| Nimari (Buried Trade City) | `nimari` |
| Silt Bazaar | `nimari` |
| The Great Tartary Plains | `great_tartary_plains` |
| The Mud Seas | `mud_seas` |
| The Cradle of Dusk | `cradle_of_dusk` |
| The Gate (Tartarian Outskirts) | `tartarian_outskirts` |
| The Subterranean Catacombs | `buried_cities` |
| The Bone Vaults | `buried_cities` |
| Echo Shrine | `buried_cities` |
| The Fungus Farms | `buried_cities` |
| The Obsidian Vault | `obsidian_pillars` |
| The Rift Fields | `etheric_chamber` + `obsidian_pillars` |
| The Forgotten Aetherforge | `thametans_tower` |
| Zalmar's Reach | `thametans_tower` |
| Ural Mountains (Giant Vault) | `giant_vault` |
| Istanbul Archives | `varakush` |
| St. Petersburg Ruins | `drakova` |
| The Flooded Armory | `drakova` |
| The Mud Flood Nexus | `mud_flood_nexus` |
| Grand Spire District | `grand_spire_of_etheria` |
| Red Tower Sector | `red_tower_of_nimari` |

---

# Sections

## 1. Asgardar (The Ancient Capital)
*The buried heart of the Tartarian Empire beneath the Grand Spire.*

exposed capacitor · ether cable · sentinel shell · cracked arch · hover rail · ash pile · noble skeleton · aether lantern · rusted drone · broken seal · crystal lens · flood debris · sovereign banner · mud fissure · relay conduit · ruined elevator · battery core · stone tablet · dust cloud · burnt tapestry · gear assembly · rubble mound · cracked walkway · energy vent · ether residue

## 2. Nimari (The Buried Trade City)
*Ancient market city wrapped around the still-active Red Tower.*

red glass · steam pipe · mud pit · tower relay · broken scaffold · coin pouch · rusted lockbox · cracked mirror · wagon axle · fungus patch · heat vent · salvage crate · torn tarp · cooling valve · dust lantern · ether battery · broken shell · mud ladder · crumbling balcony · tower wire · aether sludge · merchant bones · hook chain · rail fragment · echo horn

## 3. The Great Tartary Plains
*Flood-scarred wasteland filled with buried ruins and storms.*

petrified mud · bone marker · dust whirlwind · buried wagon · storm crystal · sinkhole · rusted spear · survey tripod · broken compass · mud fissure · fossil rib · rope coil · flood trench · lantern shard · weather beacon · ash drift · salvage sack · cracked obelisk · rail spike · shimmering rift · dead tree · sludge pool · bone tool · broken flare · buried statue

## 4. The Mud Seas
*An endless drowned wasteland concealing submerged Tartarian structures.*

barnacle chain · drowned mast · silt current · ship hull · anchor · coral shard · siren nest · flooded bell · rope bundle · mud reef · driftwood · broken harpoon · fog bank · leviathan scale · tide crack · slime coating · rusted hook · flood lantern · waterlogged chest · wreck debris · mud vent · sea fungus · shattered pike · echoing bell · deep whirlpool

## 5. The Gate (Tartarian Outskirts)
*The final fortified checkpoint before the wilds.*

mud · silt · wagon · rubble · trap · pillar · arch · footprint · rusted blade · broken chain · defense light · barricade · stone crack · scrap pile · watchtower · dust trail · warning slate · vent fissure · sludge smear · portcullis · lantern · defense lever · skeleton · bent spike · pulse emitter

## 6. The Subterranean Catacombs
*Massive underground tunnel systems inhabited by the True Tartarians.*

bone pile · fungus bloom · water cistern · tunnel root · prayer tablet · dweller torch · sludge pool · rope bridge · burial shelf · dust tunnel · echo chamber · stone mask · chisel · mud brick · skull fragment · cracked idol · rusted chain · moss patch · hollow shaft · vent grate · burial urn · root cluster · broken lantern · cave crack · sound stone

## 7. The Obsidian Vault
*High-security Tartarian bunker beneath the magnetic pillars.*

obsidian shard · magnetic sphere · lockbox · circuit panel · pulse rifle · ether battery · pressure plate · security lens · rusted chain · vault door · sentinel core · shock conduit · drone rack · broken monitor · cracked terminal · gear motor · cooling vent · scrap drone · relay pipe · armor rack · ether gauntlet · pulse scanner · rune engraving · core housing · data slate

## 8. The Forgotten Aetherforge
*Ancient experimental forge trapped in spatial instability.*

molten sludge · forge hammer · cooling vat · steam pipe · burnt anvil · rune glass · spatial crack · power conduit · heat vent · broken mold · reactor coil · dust residue · forge chain · crystal shard · melted rail · tool bench · pressure valve · gear wheel · scrap frame · welding torch · capacitor tube · experiment log · furnace door · battery shell · ether spark

## 9. Ural Mountains (The Giant Vault)
*Frozen sanctuary of the surviving Tartarian Giants.*

ice wall · giant chain · bone hammer · frost pillar · snow drift · stone throne · echo horn · frozen gate · avalanche debris · titan skull · rune carving · giant armor · rusted sled · ice fissure · vault seal · ancient torch · battle standard · frost lantern · mountain bridge · stone stair · bone spear · cracked crown · frozen skeleton · wind tunnel · cliff edge

## 10. Istanbul Archives
*The hidden archive where Tartarian history was erased.*

burnt tome · ash pile · secret report · rusted key · archive shelf · cipher wheel · black cloak · dust ledger · broken seal · confiscated relic · ink bottle · candle stub · hidden lever · scholar bones · locked drawer · torn parchment · stone vault · rusted cage · drain tunnel · blood stain · broken tablet · archive map · burn furnace · face mask · whispering vent

## 11. St. Petersburg Ruins
*Frozen battlefield scarred by the 1915 Etheric Siege.*

mud trench · rusted rifle · pike fragment · frozen corpse · gas mask · railgun shell · battery pack · flare tube · signal wire · rubble pile · ice wall · crater · burnt banner · military crate · broken watch · shell casing · scrap armor · frozen sludge · storm lantern · barricade · frost rail · siege report · collapsed tower · ash cloud · sentinel wreckage

## 12. The Mud Flood Nexus
*Ancient subterranean control center tied to the catastrophe.*

gravity valve · pressure gauge · flood conduit · silt pump · relay terminal · ether core · cooling pipe · maintenance rail · sludge vent · broken glass · rusted lever · emergency mask · resonance coil · control panel · flood map · gear assembly · broken conduit · data slate · core stabilizer · battery housing · reactor hum · drain hatch · pump motor · flood residue · warning siren

## 13. The Cradle of Dusk
*A legendary drowned zone beneath the Mud Seas.*

flooded altar · bell tower · siren egg · tide debris · coral growth · chain bridge · sea lantern · barnacle pillar · deep silt · water crack · leviathan bone · flood current · rusted anchor · drowned statue · slime trail · broken mast · driftwood · tide vault · fog cloud · flood gate · mud vent · coral shard · wreck beam · flooded chest · echo chamber

## 14. The Rift Fields
*Aether-distorted territory where reality fractures unpredictably.*

spatial crack · shimmering fog · distorted pillar · time echo · floating debris · fractured rail · static field · ghost silhouette · ether spark · pulse crystal · gravity fissure · ash drift · rift shard · broken compass · mirage pool · crackling wire · bent arch · distortion wave · mud fracture · dead signal · flickering lantern · echo residue · crumbling wall · shadow stain · void vent

## 15. Zalmar's Reach
*Remote region of hidden laboratories and Etheric experiments.*

experiment table · ether battery · steam valve · reactor shell · cracked blueprint · broken injector · cooling tank · rusted saw · tool cabinet · laboratory glass · pressure conduit · scrap automaton · aether residue · burn scar · dust terminal · relay coil · wire bundle · storage crate · power conduit · rusted cage · flood stain · generator hum · broken syringe · chemical barrel · observation window

## 16. Grand Spire District
*Central district surrounding the Grand Spire.*

hover platform · ether conduit · dust stair · hanging banner · cracked rail · sentinel debris · flood crack · burn mark · relay crystal · lantern hook · broken skylight · stone balcony · gear housing · signal flare · ash drift · power vent · broken ladder · observation lens · flood residue · noble remains · rubble mound · dust cloud · cracked arch · cooling vent · echo chamber

## 17. Sovereign Plaza
*Ceremonial district honoring Tartarian rulers.*

marble pillar · broken throne · royal seal · flood basin · dust banner · ether lantern · cracked statue · skeleton guard · ceremonial blade · burnt tapestry · stone stair · relay conduit · mud fissure · rubble pile · echo horn · crystal shard · broken arch · flood debris · noble mask · hanging chain · crumbling balcony · dust trail · ruined fountain · energy vent · ash cloud

## 18. The Hanging Gardens
*Collapsed vertical gardens suspended over flood chasms.*

hanging vine · root cluster · cracked planter · broken walkway · garden statue · moss patch · ether blossom · drain grate · mud drip · lantern hook · stone bench · crystal bloom · broken irrigation pipe · pollen cloud · hanging chain · fallen branch · flood root · overgrowth · dust trellis · bird skeleton · seed cache · rusted shears · water basin · ruined bridge · aether moss

## 19. Red Tower Sector
*The still-powered district beneath the Red Tower.*

steam vent · red glass · tower relay · cooling valve · mud ladder · generator hum · heat pipe · broken scaffold · tower cable · dust terminal · pressure gauge · relay crystal · burn mark · sludge leak · observation hatch · signal beacon · power conduit · hanging wire · cracked panel · tower ash · coil housing · broken monitor · flood debris · rusted rail · emergency siren

## 20. Silt Bazaar
*A scavenger market buried waist-deep in mud.*

mud cart · torn tarp · rusted lockbox · coin pouch · salvage crate · lantern pole · hook chain · bone knife · barrel lid · broken scale · merchant sign · rope bundle · cracked chest · silt mound · mud footprint · steam vent · scrap pile · dust bottle · bone charm · hidden pouch · broken lantern · market debris · smuggler sack · mud puddle · rusted bowl

## 21. The Flooded Armory
*Ancient military vault swallowed by the flood.*

rusted rifle · pike fragment · armor rack · flood sludge · broken shield · weapon crate · ether battery · mud stain · chain hook · barricade plank · burnt locker · broken railgun · cracked visor · signal flare · rusted ammo tin · waterlogged chest · pulse grenade · skeleton soldier · broken gauntlet · weapon seal · relay wire · ice residue · supply shelf · dust shell · flood crack

## 22. The Bone Vaults
*Ancient burial chambers beneath the Catacombs.*

bone pile · skull fragment · burial urn · dust mound · stone coffin · ritual candle · prayer carving · rusted chain · cracked idol · bone spear · burial cloth · fungus bloom · mud brick · echo stone · root cluster · cave crack · broken lantern · skeleton remains · grave seal · moss patch · ancient mask · dust trail · bone tool · hollow shaft · burial tablet

## 23. Echo Shrine
*Resonance chamber once used for Etheric rituals.*

resonance crystal · prayer bowl · echo pillar · dust altar · hanging bell · burnt incense · stone mask · ether residue · ritual circle · broken lantern · cracked tablet · bone charm · root growth · cave water · faded mural · rusted chain · sludge pool · dusty stair · broken horn · sound conduit · moss patch · ritual dagger · hollow wall · signal drum · echo chamber

## 24. The Fungus Farms
*Bioluminescent underground food caverns.*

fungus stalk · glowing spores · water basin · mud trench · harvest basket · root cluster · dust lantern · broken shovel · cave moss · rotten crate · bioluminescent patch · sludge puddle · stone trough · rusted knife · tunnel vent · mushroom cap · wet stone · drain channel · mold bloom · cave fungus · hanging root · bone fertilizer · clay pot · rotten sack · echo drip

---

# Macros not yet expanded (still at base interactables)

These are the 5 of 21 macros that v2 didn't touch. Authoring opportunities for v3:
- `samarran` — research city, lab/scholarship feel
- `voronov` — half-buried disaster zone
- `endless_stair` — vertical descent
- `zharaks_teeth` — siren-spire shoreline (got 12 from initial pass)
- `sinking_cathedral` — drowned chapel (got 14 from initial pass)
