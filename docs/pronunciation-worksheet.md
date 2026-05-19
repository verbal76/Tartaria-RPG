# Tartaria Realms — pronunciation worksheet

Generated from the full lore corpus (`docs/lore-source.txt` + every
JSON file under `app/data/`). ~87,000 tokens scanned, filtered
against a 60k-word American English dictionary plus a fantasy-
vocabulary allowlist (dragon, sword, gauntlet, etc.) — what remains
is the set of words the bundled Kokoro TTS is **most likely** to
mangle.

---

## How to use this worksheet

1. Skim the tables. For any row you want fixed, fill in the **YOUR
   FIX** column with the respelling you want the engine to use.
2. Spelling rules for Kokoro (espeak-ng phonemizer):
   - Use **spaces between syllables**, never hyphens. Hyphens are
     compound-word joiners and the syllable break is ignored.
   - Plain English orthography that an audiobook narrator would
     write: `tare` = `hare`, `koh` = `go`, `eether` = `ether`,
     `zh` ≈ the `s` in `treasure`.
   - Case is irrelevant.
3. Send the file back (or paste the rows you filled in). I will
   commit the entries into `app/voice/loreLexicon.ts` and lock
   them in with regression tests, then bump the OTA build.

---

## Already in the lexicon — re-tune any that STILL sound wrong

You called out that **Tartaria** is still landing wrong on your device.
The current respelling is `tar tare ee uh`. If a different cadence sounds
right to you, write it in the **YOUR RETUNE** column below and I'll swap
it in. Same for any other word in the list — these all have entries
already, so they should be coming out as written. If they aren't, that
means the device's espeak voice is reading the respelling differently
than expected; a fresh respelling below will override it.

| Word | Current respelling | YOUR RETUNE |
|------|--------------------|-------------|
| Tartaria | `tar tare ee uh` |  |
| Tartarian | `tar tare ee an` |  |
| Tartary | `tar ter ee` |  |
| Aether | `eether` |  |
| Aetheric | `eetheric` |  |
| Aetherstone | `eether stone` |  |
| Aetherborn | `eether born` |  |
| Aetherbat | `eether bat` |  |
| Reclaimer | `ree clay mer` |  |
| Drakova | `druh koh vah` |  |
| Varakush | `var ah koosh` |  |
| Asgardar | `ahz gar dar` |  |
| Voronov | `vor uh nov` |  |
| Samarran | `sam ah ran` |  |
| Thametan | `thuh meh tahn` |  |
| Nimari | `nih mar ee` |  |
| Zharak | `zhuh rak` |  |
| Mud Monarch | `mud mon ark` |  |
| Runecaster | `rune caster` |  |

## Invented Tartaria terms (Ae-, -kh, -zh, -ova, -ush, etc.)

The highest-priority list. These letter combinations are the ones espeak gets wrong most often. Pre-suggested respellings are filled in for the Ae- prefix; override if wrong.

_13 candidates._

| Word | Seen | Suggested | YOUR FIX |
|------|-----:|-----------|----------|
| Aethercraft | 45 | `eethercraft` |  |
| Aetherkin | 39 | `eetherkin` |  |
| Aetheria | 20 | `eetheria` |  |
| aethereal | 6 | `eethereal` |  |
| Aetherstorm | 5 | `eetherstorm` |  |
| Aetherlight | 5 | `eetherlight` |  |
| Aetherons | 5 | `eetherons` |  |
| Aetherbound | 4 | `eetherbound` |  |
| Aethercrafters | 3 | `eethercrafters` |  |
| Aetherium | 2 | `eetherium` |  |
| Aetherforge | 2 | `eetherforge` |  |
| Aetherforgers | 2 | `eetherforgers` |  |
| Aetherwing | 2 | `eetherwing` |  |

## Names — proper nouns the dictionary does not know

Character names, place names, item lines. Most of these are pronounced by espeak as best-effort letter-to-sound — usually OK, but check anything that matters to you.

_109 candidates._

| Word | Seen | Suggested | YOUR FIX |
|------|-----:|-----------|----------|
| Etheric | 705 |  |  |
| Legplates | 42 |  |  |
| Prima | 34 |  |  |
| Aaetheric | 20 |  |  |
| Warplate | 19 |  |  |
| Salvager's | 18 |  |  |
| Mudstone | 18 |  |  |
| Halem | 11 |  |  |
| Ambusher | 10 |  |  |
| Bioluminescent | 9 |  |  |
| Footwraps | 9 |  |  |
| Strider | 8 |  |  |
| Longbow | 8 |  |  |
| Shortsword | 8 |  |  |
| Greatsword | 7 |  |  |
| Jorah | 7 |  |  |
| Tarek | 7 |  |  |
| Conflux | 7 |  |  |
| Headpiece | 6 |  |  |
| Stoneborn | 6 |  |  |
| Battlecoat | 6 |  |  |
| Legguards | 6 |  |  |
| Glowstone | 6 |  |  |
| Zalmar's | 6 |  |  |
| Vesryn | 6 |  |  |
| Etherstone | 5 |  |  |
| Thalan | 5 |  |  |
| Ironhand | 5 |  |  |
| Velar | 5 |  |  |
| Elara | 5 |  |  |
| Tinkerer | 5 |  |  |
| Felra | 5 |  |  |
| Korash | 5 |  |  |
| Outerwear | 4 |  |  |
| Golemstone | 4 |  |  |
| Faceguard | 4 |  |  |
| Faceshroud | 4 |  |  |
| Chainmail | 4 |  |  |
| Shiv | 4 |  |  |
| Warblade | 4 |  |  |
| Graviton | 4 |  |  |
| Thornblade | 4 |  |  |
| Shadowblade | 4 |  |  |
| Korr | 4 |  |  |
| Stonefoot | 4 |  |  |
| Nightwind | 4 |  |  |
| Lightfinger | 4 |  |  |
| Odar | 4 |  |  |
| Flameforge | 4 |  |  |
| Beastmaster | 4 |  |  |
| Stoneskin | 4 |  |  |
| Yara | 4 |  |  |
| Windcaller | 4 |  |  |
| Zorin | 4 |  |  |
| Nightblade | 4 |  |  |
| Kirin | 4 |  |  |
| Spellweaver | 4 |  |  |
| Drakos | 4 |  |  |
| Swiftfoot | 4 |  |  |
| Nalren | 4 |  |  |
| Frostgrip | 4 |  |  |
| Basilisk | 4 |  |  |
| Leatherbound | 4 |  |  |
| Etherium | 4 |  |  |
| Whisperer's | 4 |  |  |
| Swiftstep | 4 |  |  |
| Salvager | 3 |  |  |
| Faceplate | 3 |  |  |
| Chestpiece | 3 |  |  |
| Swiftstride | 3 |  |  |
| Outercoat | 3 |  |  |
| Mudwalker | 3 |  |  |
| Lightstone | 3 |  |  |
| Vaultbreaker | 3 |  |  |
| Etherblade | 3 |  |  |
| Arcana | 3 |  |  |
| Stoneband | 3 |  |  |
| Taryn | 2 |  |  |
| Whisperer | 2 |  |  |
| Stonebreaker | 2 |  |  |
| Mauler | 2 |  |  |
| Splitter | 2 |  |  |
| Bonebreaker | 2 |  |  |
| Claymore | 2 |  |  |
| Kukri | 2 |  |  |
| Deathblade | 2 |  |  |
| Lightfoot | 2 |  |  |
| Teleports | 2 |  |  |
| Arcanists | 2 |  |  |
| Mech | 2 |  |  |
| Grappler | 2 |  |  |
| Locator | 2 |  |  |
| Forcefield | 2 |  |  |
| Nightvision | 2 |  |  |
| Lockbox | 2 |  |  |
| Cipherstone | 2 |  |  |
| Sparkstrike | 2 |  |  |
| Earthshaker | 2 |  |  |
| Emberstone | 2 |  |  |
| Stormcaller | 2 |  |  |
| Dragonheart | 2 |  |  |
| GermanyOutcome | 2 |  |  |
| Pyric | 2 |  |  |
| Throwable | 2 |  |  |
| Stonebreaker's | 2 |  |  |
| Stonebound | 2 |  |  |
| Sleight | 2 |  |  |
| Drakovan | 2 |  |  |
| Naha | 2 |  |  |

## Hyphenated compounds with at least one invented part

Espeak processes each side of the hyphen independently. If the LEFT side (e.g. `Aether`) is already in the lexicon, the compound is handled. Listed here so you can see what compounds exist; respelling the whole compound rarely helps — fix the root word instead.

_60 candidates._

| Word | Seen | Suggested | YOUR FIX |
|------|-----:|-----------|----------|
| Etheric-charged | 18 |  |  |
| Aether-powered | 14 | `eether-powered` |  |
| Aether-Runner | 10 | `eether-runner` |  |
| Aetheric-powered | 9 | `eetheric-powered` |  |
| Aether-infused | 9 | `eether-infused` |  |
| Aether-Woven | 9 | `eether-woven` |  |
| Aether-charged | 9 | `eether-charged` |  |
| Aether-Warden's | 8 | `eether-warden's` |  |
| Aether-Reinforced | 6 | `eether-reinforced` |  |
| Stone-Warden's | 6 |  |  |
| Aether-Walker's | 6 | `eether-walker's` |  |
| Aether-Seeker's | 5 | `eether-seeker's` |  |
| Aether-cored | 5 | `eether-cored` |  |
| Aetheric-infused | 4 | `eetheric-infused` |  |
| non-Aetheric | 4 |  |  |
| Aether-Weaver's | 4 | `eether-weaver's` |  |
| Stone-Strider | 4 |  |  |
| dual-wielders | 3 |  |  |
| Aether-Binder | 3 | `eether-binder` |  |
| Aether-Breath | 3 | `eether-breath` |  |
| Aetherstone-powered | 3 | `eetherstone-powered` |  |
| Golem-Wielder's | 3 |  |  |
| Aether-Fused | 3 | `eether-fused` |  |
| Aether-Wrapped | 3 | `eether-wrapped` |  |
| Golem-Warden's | 3 |  |  |
| Aether-Walker | 3 | `eether-walker` |  |
| Aether-Grip | 3 | `eether-grip` |  |
| Etheric-infused | 3 |  |  |
| Aether-tempered | 3 | `eether-tempered` |  |
| Aether-veined | 3 | `eether-veined` |  |
| Bone-bladed | 3 |  |  |
| Mud-Seer's | 3 |  |  |
| Aether-heavy | 2 | `eether-heavy` |  |
| Aetheric-lock | 2 | `eetheric-lock` |  |
| Magna-Cannon | 2 |  |  |
| Mag-Climb | 2 |  |  |
| Aether-Taether | 2 | `eether-taether` |  |
| Aether-Stone | 2 | `eether-stone` |  |
| Aether-Spark | 2 | `eether-spark` |  |
| Aether-Salve | 2 | `eether-salve` |  |
| Nano-Med | 2 |  |  |
| Nav-Core | 2 |  |  |
| Aether-Sight | 2 | `eether-sight` |  |
| Anti-Aetheric | 2 |  |  |
| Aether-shielded | 2 | `eether-shielded` |  |
| Etheric-powered | 2 |  |  |
| Aether-drawn | 2 | `eether-drawn` |  |
| Aether-Shard | 2 | `eether-shard` |  |
| Aether-magnetized | 2 | `eether-magnetized` |  |
| Aether-strung | 2 | `eether-strung` |  |
| Aether-thread | 2 | `eether-thread` |  |
| Spirit-Caller's | 2 |  |  |
| Thought-Crafter's | 2 |  |  |
| Aether-Warrior's | 2 | `eether-warrior's` |  |
| Mud-Warden's | 2 |  |  |
| Mud-Treader's | 2 |  |  |
| Golem-Sentry's | 2 |  |  |
| Mud-Stalker's | 2 |  |  |
| Golem-Guardian's | 2 |  |  |
| CHA-driven | 2 |  |  |
