# Mission gap report — shipped data vs the acceptance spec

Stages scanned: **281** (Hunt 116 · Mystery 72 · Storyline 93)

> Faction quests (65) have no stages and whisper chains (21) run on their own
> machinery; both are scanned separately. This report covers the 197 staged beats.

## 1. NPC PRESENT — the largest gap, and it is total

**VERIFIED FACT:** `npcName` is read in exactly one place in the codebase —
`questStage.ts:112`, which builds the hint string `find <name>`. Nothing
places the person on the tile, gives them dialogue, or lets them hand anything
over. Every stage below names somebody who is not there.

**Stages naming an NPC: 114 — all of them fail this requirement.**

- Hunt · The Bog Dragon of Old Drakova · stage 1 (inciting_hook) — "the Drakovan reeve"
- Hunt · The Bog Dragon of Old Drakova · stage 3 (toll) — "Old Mira"
- Hunt · The Bog Dragon of Old Drakova · stage 5 (revelation) — "Old Mira"
- Hunt · The Mud Titan of the Endless Stair · stage 1 (inciting_hook) — "the True Tartarian agent"
- Hunt · The Mud Titan of the Endless Stair · stage 3 (toll) — "Master Karin"
- Hunt · The Mud Titan of the Endless Stair · stage 5 (revelation) — "Master Karin"
- Hunt · The Sludge Behemoth at the Cradle of Dusk · stage 1 (inciting_hook) — "the Reclaimers Guild Speaker"
- Hunt · The Sludge Behemoth at the Cradle of Dusk · stage 3 (toll) — "Jarn the dive-master"
- Hunt · The Sludge Behemoth at the Cradle of Dusk · stage 5 (revelation) — "Jarn the dive-master"
- Hunt · The Iron Titan in the Sentinel Ward · stage 1 (inciting_hook) — "the Order envoy"
- Hunt · The Iron Titan in the Sentinel Ward · stage 3 (toll) — "Brother Ammon"
- Hunt · The Iron Titan in the Sentinel Ward · stage 5 (revelation) — "Brother Ammon"
- Hunt · The Siren Queen of Zharak's Teeth · stage 1 (urgent_dispatch) — "the wandering drifter"
- Hunt · Silence the Doubter · stage 1 (urgent_dispatch) — "the Servants priest"
- Hunt · The Boiler of Zharak's Teeth · stage 1 (inciting_hook) — "the caravan-master"
- Hunt · The Boiler of Zharak's Teeth · stage 3 (toll) — "Ost the wheelwright"
- Hunt · The Boiler of Zharak's Teeth · stage 5 (revelation) — "Ost the wheelwright"
- Hunt · The Serpent Under the Sinking Cathedral · stage 1 (inciting_hook) — "the dive-boss"
- Hunt · The Serpent Under the Sinking Cathedral · stage 3 (toll) — "Wren's sister"
- Hunt · The Serpent Under the Sinking Cathedral · stage 5 (revelation) — "Wren's sister"
- Hunt · The Shade of the Endless Stair · stage 1 (inciting_hook) — "the stair-warden"
- Hunt · The Shade of the Endless Stair · stage 3 (toll) — "Bael the old climber"
- Hunt · The Shade of the Endless Stair · stage 5 (revelation) — "Bael the old climber"
- Hunt · The Siren of Drowned Drakova · stage 1 (inciting_hook) — "the head ferryman"
- Hunt · The Siren of Drowned Drakova · stage 3 (toll) — "Halla the netter"
- Hunt · The Siren of Drowned Drakova · stage 5 (revelation) — "Halla the netter"
- Hunt · The Weaver of the Obsidian Pillars · stage 1 (inciting_hook) — "the salvage-boss"
- Hunt · The Weaver of the Obsidian Pillars · stage 3 (toll) — "Pike the scavenger"
- Hunt · The Weaver of the Obsidian Pillars · stage 5 (revelation) — "Pike the scavenger"
- Hunt · The Apparition in the Red Tower · stage 1 (inciting_hook) — "the Order archivist"
- Hunt · The Apparition in the Red Tower · stage 3 (toll) — "Vesryn the tutor"
- Hunt · The Apparition in the Red Tower · stage 5 (revelation) — "Vesryn the tutor"
- Hunt · The Harpy of the Cradle of Dusk · stage 1 (inciting_hook) — "the road-warden"
- Hunt · The Harpy of the Cradle of Dusk · stage 3 (toll) — "Ferel the trapper"
- Hunt · The Harpy of the Cradle of Dusk · stage 5 (revelation) — "Ferel the trapper"
- Hunt · The Fiend in the Tartary Dust · stage 1 (inciting_hook) — "the caravan-mother"
- Hunt · The Fiend in the Tartary Dust · stage 3 (toll) — "Yenna the storm-reader"
- Hunt · The Fiend in the Tartary Dust · stage 5 (revelation) — "Yenna the storm-reader"
- Hunt · The Warden of Thametan's Tower · stage 1 (inciting_hook) — "the lodge-surveyor"
- Hunt · The Warden of Thametan's Tower · stage 3 (toll) — "Del the apprentice"
- Hunt · The Warden of Thametan's Tower · stage 5 (revelation) — "Del the apprentice"
- Hunt · The Plague Moth of the Sunken Enclave · stage 1 (urgent_dispatch) — "the physician"
- Hunt · The Alpha of Yuldra-Tul · stage 1 (urgent_dispatch) — "the Yuldra-Tul reeve"
- Hunt · The Salamander Under Voronov · stage 1 (urgent_dispatch) — "the Voronov engineer"
- Mystery · Fragment of the Red Tower · stage 1 (?) — "the Order scholar"
- Mystery · Cradle of Dusk Compass · stage 1 (?) — "Halem the Trader"
- Mystery · The Leviathan's Eye · stage 1 (?) — "the True Tartarian agent"
- Mystery · The Leviathan's Eye · stage 4 (?) — "the True Tartarian agent"
- Mystery · Temporal Distortion Watch · stage 1 (?) — "the Reclaimers Guild Speaker"
- Mystery · Temporal Distortion Watch · stage 4 (?) — "the Reclaimers Guild Speaker"
- Mystery · Shifting Obsidian Orb · stage 1 (?) — "the Mud Monarch courier"
- Mystery · The Hum Beneath Ural · stage 1 (?) — "Vael"
- Mystery · The Hum Beneath Ural · stage 5 (?) — "Vael"
- Mystery · The Weeping Core · stage 1 (?) — "the Order savant"
- Mystery · The Weeping Core · stage 4 (?) — "the Order savant"
- Mystery · The Aetherborn Foundling · stage 1 (?) — "the Dynasty agent"
- Mystery · The Aetherborn Foundling · stage 3 (?) — "the Reclaimer broker"
- Mystery · The Aetherborn Foundling · stage 4 (?) — "the Dynasty agent"
- Mystery · The Drowned Bell of Samarran · stage 1 (?) — "the bell-founder"
- Mystery · The Drowned Bell of Samarran · stage 4 (?) — "the bell-founder"
- Mystery · The Singing Stone of Ostragar · stage 1 (?) — "the lodge-scribe"
- Mystery · The Singing Stone of Ostragar · stage 4 (?) — "the lodge-scribe"
- Mystery · The Monarch's Redaction · stage 1 (?) — "the Architect handler"
- Mystery · The Monarch's Redaction · stage 4 (?) — "the Architect handler"
- Mystery · The Second Flood Cipher · stage 1 (?) — "the Revivalist cell-leader"
- Mystery · The Second Flood Cipher · stage 4 (?) — "the Revivalist cell-leader"
- Mystery · The Cartographer's Last Map · stage 1 (?) — "the Reclaimer broker"
- Mystery · The Cartographer's Last Map · stage 4 (?) — "the Reclaimer broker"
- Mystery · The Giant's Tooth · stage 1 (?) — "the pilgrim-elder"
- Mystery · The Giant's Tooth · stage 4 (?) — "the pilgrim-elder"
- Mystery · The Hollow Crown · stage 1 (?) — "the Monarch factor"
- Mystery · The Hollow Crown · stage 4 (?) — "the Monarch factor"
- Mystery · The Ashen Codex · stage 1 (?) — "the Order archivist"
- Mystery · The Ashen Codex · stage 4 (?) — "the Order archivist"
- Mystery · The Tuning Fork of Asgardar · stage 1 (?) — "the lodge-master"
- Mystery · The Tuning Fork of Asgardar · stage 4 (?) — "the lodge-master"
- Mystery · The Pale Signal · stage 1 (?) — "the hooded buyer"
- Mystery · The Pale Signal · stage 4 (?) — "the hooded buyer"
- Storyline · The Red Tower's Mouth · stage 1 (?) — "Vesryn"
- Storyline · The Red Tower's Mouth · stage 3 (?) — "the caravan survivor"
- Storyline · The Red Tower's Mouth · stage 9 (?) — "Vesryn"
- Storyline · The Path of the True Tartarian · stage 1 (?) — "Korash of the Deep"
- Storyline · The Path of the True Tartarian · stage 8 (?) — "Korash of the Deep"
- Storyline · The Reclaimer Relic Run · stage 1 (?) — "the Reclaimers Guild Speaker"
- Storyline · The Reclaimer Relic Run · stage 7 (?) — "the Reclaimers Guild Speaker"
- Storyline · Silence Across the Border · stage 1 (?) — "Dr. Lucius Kincaid"
- Storyline · Silence Across the Border · stage 2 (?) — "the talkative Reclaimer"
- Storyline · Silence Across the Border · stage 8 (?) — "Dr. Lucius Kincaid"
- Storyline · The Ledger of Silence · stage 1 (?) — "the Monarch factor"
- Storyline · The Ledger of Silence · stage 5 (?) — "the Order surveyor"
- Storyline · The Ledger of Silence · stage 6 (?) — "the Monarch factor"
- Storyline · The Descent to Karok-Sa · stage 1 (?) — "the enclave-mother"
- Storyline · The Descent to Karok-Sa · stage 5 (?) — "the eldest pilgrim"
- Storyline · The Descent to Karok-Sa · stage 7 (?) — "the enclave-mother"
- Storyline · Blood of the Aetherborn · stage 1 (?) — "the Dynasty proctor"
- Storyline · Blood of the Aetherborn · stage 4 (?) — "the claimant"
- Storyline · Blood of the Aetherborn · stage 6 (?) — "the Dynasty proctor"
- Storyline · The Giant-Watch Vigil · stage 1 (?) — "the vigil-keeper"
- Storyline · The Giant-Watch Vigil · stage 3 (?) — "the vigil-keeper"
- Storyline · The Giant-Watch Vigil · stage 6 (?) — "the vigil-keeper"
- Storyline · Scripture in Stone · stage 1 (?) — "the lodge-master"
- Storyline · Scripture in Stone · stage 6 (?) — "the lodge-master"
- Storyline · Sasha's Gambit · stage 1 (?) — "Sasha Ironheart"
- Storyline · Sasha's Gambit · stage 6 (?) — "Sasha Ironheart"
- Storyline · The Highest Bidder · stage 1 (?) — "the Reclaimer broker"
- Storyline · The Highest Bidder · stage 6 (?) — "the Reclaimer broker"
- Storyline · The Silence Protocol · stage 1 (?) — "the Architect handler"
- Storyline · The Silence Protocol · stage 3 (?) — "the schoolmaster"
- Storyline · The Silence Protocol · stage 6 (?) — "the Architect handler"
- Storyline · The Drowned Library · stage 1 (?) — "Vesryn"
- Storyline · The Drowned Library · stage 6 (?) — "Vesryn"
- Storyline · The Purge at Asgardar · stage 1 (?) — "the Dynasty enforcer"
- Storyline · The Purge at Asgardar · stage 3 (?) — "the cadet matriarch"
- Storyline · The Purge at Asgardar · stage 6 (?) — "the Dynasty enforcer"

## 2. GO TO — tiles that do not resolve

**None.** Every authored `locationName` resolves.

## 3. Prose promises a fight, nothing spawns it

Apex stages are exempt — the hunt boss is spawned by `scaleHuntBoss`, verified
end-to-end by the hunt walker.

**9 stages.**
- Hunt · The Bog Dragon of Old Drakova · stage 3 (toll) — verb diplomacy
- Hunt · The Bog Dragon of Old Drakova · stage 6 (catalyst) — verb attack_provoke
- Hunt · The Sludge Behemoth at the Cradle of Dusk · stage 1 (inciting_hook) — verb auto
- Hunt · The Iron Titan in the Sentinel Ward · stage 6 (catalyst) — verb attack_provoke
- Hunt · The Siren Queen of Zharak's Teeth · stage 4 (gauntlet) — verb attack_provoke
- Hunt · The Weaver of the Obsidian Pillars · stage 6 (catalyst) — verb cast
- Hunt · The Warden of Thametan's Tower · stage 5 (revelation) — verb diplomacy
- Storyline · The Path of the True Tartarian · stage 4 (?) — verb investigate
- Storyline · The Drowned Library · stage 4 (?) — verb escape

## 4. No early completion — auto stages whose prose describes an action

`checkKind: null` advances on its own. Where the prose has a person speaking to
you or the player taking something, arrival alone completes a beat the text says
you performed.

**25 stages.**
- Hunt · The Bog Dragon of Old Drakova · stage 1 (inciting_hook)
- Hunt · The Sludge Behemoth at the Cradle of Dusk · stage 1 (inciting_hook)
- Hunt · The Siren Queen of Zharak's Teeth · stage 1 (urgent_dispatch)
- Hunt · Silence the Doubter · stage 1 (urgent_dispatch)
- Hunt · The Shade of the Endless Stair · stage 1 (inciting_hook)
- Hunt · The Fiend in the Tartary Dust · stage 1 (inciting_hook)
- Mystery · Cradle of Dusk Compass · stage 1 (?)
- Mystery · The Leviathan's Eye · stage 1 (?)
- Mystery · The Hum Beneath Ural · stage 1 (?)
- Mystery · The Drowned Bell of Samarran · stage 1 (?)
- Mystery · The Singing Stone of Ostragar · stage 4 (?)
- Mystery · The Second Flood Cipher · stage 1 (?)
- Mystery · The Second Flood Cipher · stage 4 (?)
- Mystery · The Giant's Tooth · stage 1 (?)
- Mystery · The Giant's Tooth · stage 4 (?)
- Mystery · The Ashen Codex · stage 4 (?)
- Mystery · The Tuning Fork of Asgardar · stage 4 (?)
- Mystery · The Pale Signal · stage 1 (?)
- Storyline · The Reclaimer Relic Run · stage 1 (?)
- Storyline · Blood of the Aetherborn · stage 1 (?)
- Storyline · The Giant-Watch Vigil · stage 1 (?)
- Storyline · Scripture in Stone · stage 6 (?)
- Storyline · Sasha's Gambit · stage 6 (?)
- Storyline · The Silence Protocol · stage 1 (?)
- Storyline · The Drowned Library · stage 6 (?)

## 5. Prose says you take something, the stage grants nothing

**2 stages.**
- Storyline · Scripture in Stone · stage 6 (?)
- Storyline · The Drowned Library · stage 5 (?)
