# Tartaria — Mission Text & Progression Audit Sheet

Generated from the shipped data. Every stage below is one block you can mark up.

The engine carries four structured bindings per stage. **Those are what the game
enforces; the prose is what the player is told.** Where they disagree, the player
is lied to — that is the whole class of bug this sheet exists to find.

| field | meaning |
|---|---|
| **Where** | `locationName` — the tile this stage is bound to. `—` means it falls back to the contract anchor. |
| **Who** | `npcName` — the person standing there for this stage. `—` means nobody is authored. |
| **Needs** | `requires` — must already be in the pack or the stage refuses to advance. |
| **Gives** | `grants` — handed over when the stage advances. Created at grant time, so it need not exist in any catalog. |
| **Verb** | `checkKind` — the action that resolves the stage. `auto` = pure narration, advances on its own. |
| **Spawns** | `spawn` — a stage-authored enemy pack. `—` means no bodies, or (on an apex) the hunt boss. |

## How to mark this up

Write bullets under each stage's **Checklist**. Suggested shorthand:

- `MUST:` something that has to be true for the text to be honest
- `MISSING:` the text promises it and the game does not have it
- `MOVE:` wrong tile or wrong person
- `REWORD:` the game is right and the text is wrong
- `POPUP:` the interaction exists but is buried in prose and needs a visible button — the SPEAK TO YULKA treatment

---

## Contents

- **Hunts** — 18
- **Mysteries** — 18
- **Faction storylines** — 14
- **Faction quests (single objective, no stages)** — 65
- **Whisper chains** — 21
- **Total staged beats** — 281

---

# Hunts

## The Bog Dragon of Old Drakova

- **id:** `hunt_bog_dragon`
- **poster sends you to:** the Mud Seas (cathedral steeple roost)
- **target:** Bog Dragon
- **difficulty:** Veteran (tier 3, rec HP 50, rec weapon Rare)
- **reward:** 780 TC, Aetheric Cloth, trophy: Bog Dragon Scale
- **min rep:** 0

> **POSTER —** Drakovan reeve seeks proof of death — a long-shadow has been seen over the Mud Seas at dawn. Wing-mark longer than a barn. 780 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Drakova | the Drakovan reeve | — | Reeve's Brass Token | diplomacy | — |

**Text:**

> The Drakovan reeve closes the bounty book and pushes a stamped brass token across it. "I don't know where it roosts. Old Mira does — she keeps a holding out at the Monarch's Waystation, and she lost half her cattle to it. Show her this token and she'll talk. Go by way of the Cradle of Dusk; that's where the last wing-shadow was called in."

> **Arbiter —** "Posters in this country mean someone is desperate or someone has died," the Arbiter says. "Read the room before you sign."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | — | Obsidian-Edged Scale | investigate | — |

**Text:**

> Out in the Cradle of Dusk a wing-shadow crosses you, and over the next rise you find what it left: a goat torn open, three obsidian-edged scales steaming in the silt. You work one free. It is heavier than it looks and still warm. The Dragon knows there are eyes here now.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | Old Mira | Reeve's Brass Token | Mira's Shrine-Map | diplomacy | — |

**Text:**

> Old Mira turns the reeve's token over twice before she waves you to sit. "I'll mark his roost," she says. "But my boy went into the flooded shrine at the Mud Flood Nexus after the first attack, and he's still in there. Bring me back his locket. Then we talk." She draws you the way down on a scrap of hide and presses it into your hand.

> **Arbiter —** "She has been carrying that wait for a season," the Arbiter says quietly. "Make it count."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Flood Nexus | — | Mira's Shrine-Map | The Boy's Locket | boss | Mud Wraith ×1 |

**Text:**

> Mira's map takes you down through the Nexus to where the flood-works pool. The shrine is silt-glass and old prayer. You find the boy where he fell — and the Mud Wraith that has been feeding on what is left of him comes off the body fast, before your hand is anywhere near the locket.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | Old Mira | The Boy's Locket | Eshren's Name-Token | diplomacy | — |

**Text:**

> Mira reads the locket without crying. On the inside lid, scratched in a child's hand, is a name: ESHREN. "He named it," she says. "He thought naming it would make it leave us alone." She scratches the name onto a slip of tin and folds your fingers around it. "Cathedral steeple. Out in the Mud Seas. Go now."

> **Arbiter —** "A true name binds a thing for one breath," the Arbiter says. "One word, one moment. Don't waste either."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Eshren's Name-Token | — | attack_provoke | Mud Harpy ×3 |

**Text:**

> You push out into the Mud Seas with the name in your fist. Before the steeple is even in sight a flight of Mud Harpies drops off the reeds — the Dragon's brood, sent to thin you before you arrive. The steeple is not going anywhere. They are.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Eshren's Name-Token | — | boss | — |

**Text:**

> The cathedral steeple stands out of the Mud Seas like a broken tooth, and the Dragon uncoils from it. You read the tin — ESHREN — and it stalls, for one long breath, eyes wide. Now or never.

> **Arbiter —** "Whatever you do, do not let it get airborne again," the Arbiter says.

**Checklist:**

- 

---

## The Mud Titan of the Endless Stair

- **id:** `hunt_mud_titan`
- **faction:** `true_tartarians`
- **poster sends you to:** the Endless Stair (Asgardar descent, level 6)
- **target:** Mud Titan
- **difficulty:** Apex (tier 4, rec HP 70, rec weapon Rare)
- **reward:** 1040 TC, 8 rep, Tartarian Stoneband, trophy: Titan Knuckle
- **min rep:** 3

> **POSTER —** True Tartarian agent in the Outskirts wants a Mud Titan put down. It is collapsing the descent to a buried capital. 1040 TC and reputation with the enclave.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | the True Tartarian agent | — | Enclave Writ | diplomacy | — |

**Text:**

> The True Tartarian agent doesn't sit. "We can't go down there ourselves — every shake brings the Stair down on whoever's mid-descent." She seals a writ and hands it over. "Master Karin holds the upper concourse at Asgardar. She was lead engineer when the Stair was still a stair. Cut through the Buried Cities on your way — one of our gantries went down there this morning and nobody has reported back."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | — | Collapsed Gantry Log | investigate | — |

**Text:**

> In the Buried Cities the ground hammers under you. Two Reclaimers and a True Tartarian engineer are pinned beneath a collapsed gantry, calling out. You dig them free. The engineer presses her survey log on you before she can stand — every reading in it runs off the page in the same direction, straight down.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | Master Karin | Enclave Writ | Karin's Archive Seal | diplomacy | — |

**Text:**

> Karin reads the writ, then the gantry log, then folds her arms. "I'll mark its patrol — I designed those landings, I know where it'll plant itself. But my old blueprints are sealed in the Giant Vault and the lock is me-and-only-me." She thumbs a seal-plate warm and gives it to you. "Bring them up. Then we plan."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Karin's Archive Seal | Karin's Blueprint Tube | boss | Mud Wraith ×3 |

**Text:**

> The Vault's seals open to Karin's plate at the touch. As you pull the blueprint tube from its cradle a clutch of Mud Wraiths peels off the wall behind you — the Titan's vibration woke them weeks ago and nothing has come down here since to put them back to sleep.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | Master Karin | Karin's Blueprint Tube | Sixth-Landing Mark | diplomacy | — |

**Text:**

> Karin spreads the blueprints flat and circles a niche on the sixth landing of the Endless Stair. "There. It rests where the old core-conduit pools heat." She copies the landing and the approach onto a card and hands it over. "Go now. Every hour you wait, more Stair falls."

> **Arbiter —** "She has given you the one thing nobody else has," the Arbiter says. "A floor plan of the thing's house."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | Sixth-Landing Mark | Rigged Sentinel Core | cast | — |

**Text:**

> Karin's card walks you down to the fifth landing, where a Sentinel power core sits in its cradle, still hot after two thousand years. The blueprints show a chokepoint one flight below: a rigged core dropped from the rail will bring a wall down on the Titan's head. Wire it. Set it. Don't drop it.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | Rigged Sentinel Core | — | boss | — |

**Text:**

> You bait the Titan onto the chokepoint and let the rigged core go from the rail. Half the wall comes down with it. The Titan lives — mostly — and turns to you through the dust. Now finish it.

**Checklist:**

- 

---

## The Sludge Behemoth at the Cradle of Dusk

- **id:** `hunt_sludge_behemoth`
- **faction:** `reclaimers_guild`
- **poster sends you to:** the Cradle of Dusk (Behemoth's feeding pool)
- **target:** Sludge Behemoth
- **difficulty:** Veteran (tier 3, rec HP 55, rec weapon Rare)
- **reward:** 700 TC, 6 rep, Aetheric Pelt, trophy: Behemoth Plate
- **min rep:** 0

> **POSTER —** Reclaimers Guild Speaker offers 700 TC for the head of a Behemoth that has begun crushing dive-camps near the Cradle. No fewer than four crews missing in a fortnight.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimers Guild Speaker | — | Sealed Coordinate Tube | diplomacy | — |

**Text:**

> The Reclaimers Guild Speaker pushes a sealed tube across the table. "Coordinates. Jarn, old dive-master, keeps his rope at the Builders' Survey Camp — he survived the last attack and he's the only mouth open on this. The road runs through the Mud Seas and it is not a quiet road. Take the tube. He won't say a word without it."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Sealed Coordinate Tube | Dive-Camp Tally | boss | Swamp Crab ×1 |

**Text:**

> Out on the Mud Seas you cross a half-drowned dive-camp. Three tubes torn open. One man still breathing, ribs broken, calling for water. A Swamp Crab the size of a pony hesitates at the edge of the camp, deciding between you and him. You decide first.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | Jarn the dive-master | Dive-Camp Tally | Jarn's Wreck-Bearing | diplomacy | — |

**Text:**

> Jarn won't look up from the rope he's mending until he sees the tally. Then he does. "I lost my harpoon-rig with the crew — down in the wreck of the Marlin, out under Zharak's Teeth." He scratches the bearing on the back of the tally-board. "Bring it up and I'll mark your map. Otherwise we have nothing to talk about."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Zharak's Teeth | — | Jarn's Wreck-Bearing | Jarn's Harpoon-Rig | boss | Drowned Aetherkin ×3 |

**Text:**

> Jarn's bearing puts you over the Marlin's half-sunk hull. The harpoon-rig is wedged under the ship's rib, where his crew went down with it. They did not all stay dead — three Drowned Aetherkin turn at the sound of your tank and come off the wreck together.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | Jarn the dive-master | Jarn's Harpoon-Rig | Slack-Tide Chart | diplomacy | — |

**Text:**

> Jarn takes the rig back, checks it the way a man checks a returned child, and hands it straight to you again. Then he marks a pool on the chart with a black thumb. "Cradle of Dusk. It comes up to feed at the slack tide, and slack tide is the only hour it's slow."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Slack-Tide Chart | Charged Harpoon-Rig | cast | — |

**Text:**

> At the feeding pool you do what Jarn showed you: seat an Aether Crystal in the rig's throat and let it draw. "This is the only thing that punches silt-hide," he said. "You get one shot before the rig burns out." The crystal takes. The rig hums in your hands.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Charged Harpoon-Rig | — | boss | — |

**Text:**

> You wait out the slack tide. The Behemoth breaches. You fire, and the crystal punches through silt-hide — the Behemoth screams, rooted in place and furious. Get in the water and finish it.

**Checklist:**

- 

---

## The Iron Titan in the Sentinel Ward

- **id:** `hunt_iron_titan`
- **faction:** `forgotten_order`
- **poster sends you to:** the Sentinel Ward (inner archive)
- **target:** Iron Titan
- **difficulty:** Apex (tier 4, rec HP 75, rec weapon Legendary)
- **reward:** 1020 TC, 10 rep, Runic Mantle, trophy: Iron Titan Core
- **min rep:** 3

> **POSTER —** Forgotten Order requests the deactivation of an Iron Titan still patrolling a Sentinel Ward. Order scholars cannot enter their target archive. 1020 TC. Order standing.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order envoy | — | Sealed Reliquary Box | diplomacy | — |

**Text:**

> The Order envoy taps a sealed reliquary box twice and slides it across. "Brother Ammon keeps the old Ward maps at the cloister in Karok-Sa. He'll give them to you when he sees this. Do not open the box." A pause. "Take the Obsidian Pillars road. The Sentinels there still walk their loop, and I would rather you learned that from the road than from the archive."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Sealed Reliquary Box | Sentinel Patrol Sigil | stealth | — |

**Text:**

> Three lesser Sentinels hold the road between the Pillars, still running a loyalty loop a thousand years past anyone who could cancel it. The truce between the Order and the Sentinels is paper. You go quiet, take the long way around their arc, and lift a patrol sigil off a cold unit as you pass. They never break step.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | Brother Ammon | Sentinel Patrol Sigil | Ammon's Relay Warrant | diplomacy | — |

**Text:**

> Brother Ammon opens the reliquary. Whatever is in it changes his face. He turns the patrol sigil over once and sets it down. "I'll give you the bypass codes. But the Ward's patrol log sits in the relay at the Grand Spire of Etheria, and the codes are no use to you if the Titan has gone dormant." He writes you a warrant for the relay room.

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Grand Spire of Etheria | — | Ammon's Relay Warrant | The Ward Patrol Log | boss | Lens Prier ×1 |

**Text:**

> The Spire's relay room is half-buried and leaning hard. A Lens Prier is standing in the doorway — Order-trained once, left his faith and stayed for the relics. He reads the warrant, laughs at it, and puts a bar across your chest before you have finished the sentence.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | Brother Ammon | The Ward Patrol Log | Ammon's Signet Ring | diplomacy | — |

**Text:**

> Ammon reads the log and his hand goes flat on the table. "It is still walking. Inner archive, third gallery." He works his signet ring off and presses it into your palm. "The door is keyed to Order blood. It knows me; let it know you through this. Go now."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Ammon's Signet Ring | Ward Bypass Codes | attack_provoke | Aetheric Drone ×3 |

**Text:**

> You lift the ring to the seal and the Ward opens for you. It also wakes: Aetheric Drones rise from concealed cradles across the approach, two thousand years patient and done waiting. Ammon's codes come out of the ring only once the approach is clear.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Ward Bypass Codes | — | boss | — |

**Text:**

> The inner archive is colder than the Ward outside. The Iron Titan stands at the far wall, head bowed in some ancient liturgy. It hears you enter. It rises. It is taller than the chamber was meant for.

**Checklist:**

- 

---

## The Siren Queen of Zharak's Teeth

- **id:** `hunt_mud_siren_queen`
- **poster sends you to:** Zharak's Teeth (the Queen's central pillar)
- **target:** Mud Siren Queen
- **difficulty:** Veteran (tier 3, rec HP 45, rec weapon Uncommon)
- **reward:** 700 TC, Aetheric Song, trophy: Siren Crystal
- **min rep:** 0

> **POSTER —** Drifters and Reclaimers alike have lost crews to the spires of Zharak's Teeth — a Mud Siren Queen leads the song. Anyone who silences her can keep what they salvage. 700 TC posted by a wandering drifter.

### Stage 1 — urgent_dispatch

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | the wandering drifter | — | Drifter's South-Spire Poster | diplomacy | — |

**Text:**

> The drifter presses the poster into your hand and points out past the stalls. "Her chorus took another crew this morning — pinned them in the south spires, out in the Mud Seas. She'll move at dusk. Go now or there's no point going at all."

**Checklist:**

- 

### Stage 2 — false_summit

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Drifter's South-Spire Poster | — | boss | Mud Siren ×3 |

**Text:**

> The south spires stand out of the Mud Seas exactly where the poster said. You wade in expecting the Queen. What comes up out of the silt instead are three of her daughters, mouths already open — she left her song in them and went deeper. They will not let you pass to look for her. Silence them first.

> **Arbiter —** "She is listening through them," the Arbiter says. "So mind what you say with your hands."

**Checklist:**

- 

### Stage 3 — investigation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | — | Reclaimer's Survey-Pen | investigate | — |

**Text:**

> You sift the wreckage after the Sirens go quiet. A Reclaimer's survey-pen, snapped but readable — the Queen's true spire is marked on it, out at Zharak's Teeth, three pillars north of open water. She moved the moment she heard your skiff.

**Checklist:**

- 

### Stage 4 — gauntlet

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Zharak's Teeth | — | Reclaimer's Survey-Pen | North-Pillar Bearing | attack_provoke | Mud Siren ×3 |

**Text:**

> You wade the Teeth spire by spire on the pen's line. Every pillar carries another Mud Siren in waiting, and the chorus rises around you — half song, half scream — before you have the line half walked. Whatever is still standing when the water goes quiet will be pointing north.

**Checklist:**

- 

### Stage 5 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Zharak's Teeth | — | North-Pillar Bearing | — | boss | — |

**Text:**

> You break into the central pillar's clearing. The Queen sits her mud-glass throne, calm and almost amused. "You should not have come," she says, low and warm. "But since you have — sing, or die quiet." The standing Sirens turn now, all of them, all toward you.

**Checklist:**

- 

---

## Silence the Doubter

- **id:** `hunt_servants_doubter`
- **poster sends you to:** the Tartarian Outskirts (the Reaver's ridge camp)
- **target:** Tartarian Reaver
- **difficulty:** Seasoned (tier 2, rec HP 30, rec weapon Uncommon)
- **reward:** 400 TC, 3 rep, trophy: Reaver's Mark
- **min rep:** 0

> **POSTER —** The Servants of the Giants name a Reaver who walks the Outskirts speaking against the Giants' return. The Servants do not raise their hand against him — they ask a hand that isn't theirs to. 400 TC posted at any Servants shrine.

### Stage 1 — urgent_dispatch

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Giant-Watch Shrine | the Servants priest | — | Servants' Mark of Sanction | diplomacy | — |

**Text:**

> The Servants priest bows just enough and marks a strip of bone with the shrine's sanction. "His last camp is out on the Great Tartary Plains. He moves at dawn — if you start now, you take him before he does. We do not raise our hand against him. You raise yours, and we will remember. Carry the mark so his people know who sent you."

**Checklist:**

- 

### Stage 2 — false_summit

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Servants' Mark of Sanction | — | boss | Tartarian Raider ×3 |

**Text:**

> You make the camp on the Plains by dusk. Embers still warm, bedrolls still shaped to their sleepers — and the Reaver long gone west. He did not run. He LEFT you something: three of his sworn, jaw-marked in the old sign, standing up out of positions they took hours ago. They have been waiting for exactly the kind of hunter a shrine sends. There is no way past them and no one here to talk to. Put them down, and the trail he left is yours to read.

> **Arbiter —** "He spent three men to learn what you are," the Arbiter says. "Answer the question."

**Checklist:**

- 

### Stage 3 — investigation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | — | Reaver's Spiral-Mark Stone | investigate | — |

**Text:**

> You search the camp's debris. A boot-track heading due west, fresh. A Reaver's spiral-mark scratched into a flat stone — his next staging ground, named in raider sign, out on the Tartarian Outskirts ridge. You put the stone in your pack. He wanted the right kind of hunter to follow.

**Checklist:**

- 

### Stage 4 — gauntlet

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Outskirts | — | Reaver's Spiral-Mark Stone | Raider's Ridge-Sign | attack_provoke | — |

**Text:**

> North through scrub and broken stone, reading the spiral-marks off the rocks as you go. Two more raiders strike from cover at the half-mile mark. They aren't trying to stop you, only slow you — and one of them dies holding the sign for where the meeting is set.

**Checklist:**

- 

### Stage 5 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Outskirts | — | Raider's Ridge-Sign | — | boss | — |

**Text:**

> The Reaver is on the ridge the sign named, alone, watching you climb. He doesn't draw until you crest it. "The Giants will rise," he says, almost gentle. "You are a small thing to send against that." Then his blade comes up.

**Checklist:**

- 

---

## The Boiler of Zharak's Teeth

- **id:** `hunt_steam_walker_zharak`
- **poster sends you to:** Zharak's Teeth
- **target:** Steam Walker
- **difficulty:** Veteran (tier 3, rec HP 55, rec weapon Rare)
- **reward:** 740 TC, Aetheric Cloth, trophy: Steam Walker Core-Valve
- **min rep:** 0

> **POSTER —** Zharak's Teeth caravan-masters seek proof of death — a Steam Walker gone rogue is scalding the pass shut. Wing of steam seen a mile off. 740 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the caravan-master | — | Caravan-Master's Pass-Chit | diplomacy | — |

**Text:**

> The caravan-master jabs the pass on his map and stamps you a pass-chit. "Something old woke in the rocks at Zharak's Teeth and now it boils anyone who tries them. My drovers won't go. A wheelwright named Ost saw it and came down alive — he's wintering at the Pilgrim Camp. Walk the Teeth first if you want to believe me, then go and find him."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Zharak's Teeth | — | Caravan-Master's Pass-Chit | Scalded Glass Shard | investigate | — |

**Text:**

> Half a day into the Teeth you find the pass fused — sand turned to glass in one long scalded stripe, and at the end of it a drover cooked in his boots. You break off a shard of the glass; it is still too warm to hold bare. The Walker knows the pass is watched now.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Pilgrim Camp | Ost the wheelwright | Scalded Glass Shard | Ost's Scree-Line Sketch | diplomacy | — |

**Text:**

> Ost turns the glass shard over once and stops pretending he doesn't know. He'll talk, for a price: his apprentice ran up into the Yuldra-Tul scree after the beast and hasn't come down. "Bring me the boy, or what's left," he says, sketching the scree-line on the back of a wheel-tally, "and I'll draw you the vent it roosts in."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Yuldra-Tul | — | Ost's Scree-Line Sketch | The Apprentice's Toolroll | boss | Rust Lurker ×1 |

**Text:**

> The sketch puts you on the frost side of Yuldra-Tul, where the apprentice is pinned in a scree-slip with a broken leg — alive by the luck of the Walker passing him for dead. A Rust Lurker has come to finish what the mountain started, and it reaches the boy's line before you do.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Pilgrim Camp | Ost the wheelwright | The Apprentice's Toolroll | Ost's Vent-Map | diplomacy | — |

**Text:**

> Ost takes the toolroll, opens it, closes it, and keeps his word. He marks the vent on the wheel-tally — high in the Teeth, where the rock runs hot. "It doesn't roost there because it likes it," he says. "It roosts there because it can't stop venting."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Zharak's Teeth | — | Ost's Vent-Map | Walker's Valve-Key | cast | — |

**Text:**

> At the vent you finally understand the machine: the Walker is bleeding a cracked core and venting to keep from bursting, and it cannot stop. Kill the venting and you kill the machine. You cut a valve-key to fit the vent housing — but the moment it seats, the Walker will have one last, total breath to spend.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Zharak's Teeth | — | Walker's Valve-Key | — | boss | — |

**Text:**

> You reach the roost as the Walker turns, core screaming, and vents everything it has left in one white blast. Drive the key home and end it — or be the next stripe of glass in the pass.

**Checklist:**

- 

---

## The Serpent Under the Sinking Cathedral

- **id:** `hunt_silt_serpent_cathedral`
- **poster sends you to:** the Sinking Cathedral
- **target:** Silt Serpent
- **difficulty:** Veteran (tier 3, rec HP 50, rec weapon Rare)
- **reward:** 720 TC, Aetheric Shard, trophy: Silt Serpent Fang
- **min rep:** 0

> **POSTER —** Salvagers working the Sinking Cathedral want a Silt Serpent dead before it takes another diver. Longer than a barge, they say. 720 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | the dive-boss | — | Dive-Boss's Mooring Chit | diplomacy | — |

**Text:**

> The dive-boss counts three lost this season and cuts you a chit for the Cathedral moorings. "It nests where the nave floods deepest. My last diver, Wren, mapped its runs before it took her line — and her sister keeps the logbook out at the Revivalist camp. Get down there first and see what's left of Wren's rig. You'll need something to show the sister."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Dive-Boss's Mooring Chit | Wren's Cut Line | investigate | — |

**Text:**

> The nave takes a hand of water an hour. In the shallows you find Wren's cut line and, tangled in it, a shed length of Silt Serpent skin the width of a door. You coil the line and take it. It is bigger than the boss admitted, and it knows the water is being read.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Revivalist Field Camp | Wren's sister | Wren's Cut Line | Wren's Transept Sketch | diplomacy | — |

**Text:**

> Wren's sister takes the cut line in both hands and does not let go of it while she talks. She'll trade the logbook for a promise: recover Wren's body from the flooded transept so she can be burned properly. "I can't bury a line and a boot," she says, and draws you the transept from memory. "Bring her up."

> **Arbiter —** "She has been carrying that wait for a season," the Arbiter says quietly. "Make it count."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Wren's Transept Sketch | Wren's Body | boss | Mud Wraith ×1 |

**Text:**

> The sketch takes you down through the flooded transept, and you find Wren where the Serpent left her — and a Mud Wraith risen from the drowned to guard the drowned. It comes up out of the silt between you and her.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Revivalist Field Camp | Wren's sister | Wren's Body | Wren's Logbook | diplomacy | — |

**Text:**

> The sister does the burning herself and does not ask you to stay for it. Afterward she puts the logbook in your hands without a word. Every page is a tide-chart of the Serpent's runs, in a hand that clearly expected to use it again.

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Wren's Logbook | Fouled Font-Charm | cast | — |

**Text:**

> Wren's last page holds the trick: the Serpent hunts by the pulse of Aether, and the Cathedral's old font still hums with it. You work a charm into the font's throat that will foul the pulse and leave the beast deaf and blind — for one dive's length, no more.

> **Arbiter —** "One dive," the Arbiter says. "Not one dive and a think about it."

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Fouled Font-Charm | — | boss | — |

**Text:**

> You set the charm and the deep nave goes silent. The Silt Serpent comes anyway, blind and furious, threshing the flooded dark. Now — while it cannot find you — or never.

**Checklist:**

- 

---

## The Shade of the Endless Stair

- **id:** `hunt_shade_endless_stair`
- **poster sends you to:** the Endless Stair
- **target:** Shifting Shade
- **difficulty:** Elite (tier 4, rec HP 60, rec weapon Rare)
- **reward:** 1020 TC, Runic Mantle, trophy: Shade-Ash Vial
- **min rep:** 0

> **POSTER —** Pilgrims on the Endless Stair are vanishing between one landing and the next. A Shifting Shade walks the steps. 1020 TC on proof of its end.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Pilgrim Camp | the stair-warden | — | Warden's Tally of the Missing | diplomacy | — |

**Text:**

> The stair-warden has stopped counting the missing and hands you the tally instead. "They go up whole and come down never. A Shade lives in the turns where the light can't reach. An old climber, Bael, survived it once — he keeps a vigil at Thametan's Tower now, and he won't talk to anyone who hasn't been up the Stair themselves."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | Warden's Tally of the Missing | Pilgrim's Still-Burning Lantern | investigate | — |

**Text:**

> On the ascent you find a pilgrim's lantern still burning on an empty landing, its owner gone without a mark on the stone. You take the lantern down with you. The Shade takes cleanly, and it has already noticed the light you carry.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | Bael the old climber | Pilgrim's Still-Burning Lantern | Bael's Vigil-Candle | diplomacy | — |

**Text:**

> Bael looks at the lantern a long time before he looks at you. He'll share what he learned, but the Shade left him blind in one eye and afraid of the dark. "Sit the night vigil with me here," he asks, pressing a candle into your hand. "I can't face the turning of the light alone. Do that, and I'll teach you to walk the Stair."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | — | Bael's Vigil-Candle | Bael's High-Turn Rubbing | boss | Aetheric Apparition ×1 |

**Text:**

> In the small hours a lesser dark tests the Tower — an Aetheric Apparition drawn straight to Bael's fear. It is inside the candle-ring before either of you has a word for it.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | Bael the old climber | Bael's High-Turn Rubbing | Kessa's Written Name | diplomacy | — |

**Text:**

> Bael reads his own rubbing aloud and teaches you the Shade's law: it cannot cross its own cast shadow. Then he tells you the rest — the Shade is a person the buried city swallowed and unmade into moving dark — and writes down the name he heard it whisper. KESSA.

> **Arbiter —** "A name is a handle," the Arbiter says. "It does not make the thing safe. It makes it holdable."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | Kessa's Written Name | — | attack_provoke | — |

**Text:**

> You climb to bait it with the name folded in your fist, and the Stair itself seems to lengthen — the Shade folding the light, throwing false landings and forked dark to lose you in the turns. Cut through the false dark until the real turn is the only one left.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | Kessa's Written Name | — | boss | — |

**Text:**

> On the high turn where no light reaches, the Shade unfolds. You speak — KESSA — and for one breath the dark holds a woman's shape, still and startled. That breath is the only one you get.

**Checklist:**

- 

---

## The Siren of Drowned Drakova

- **id:** `hunt_mud_siren_drakova`
- **poster sends you to:** Drakova
- **target:** Mud Siren
- **difficulty:** Veteran (tier 3, rec HP 48, rec weapon Rare)
- **reward:** 740 TC, Aetheric Cloth, trophy: Siren Throat-Reed
- **min rep:** 0

> **POSTER —** Drakova's ferrymen won't cross after dusk — a Mud Siren sings the crossing and the crossers walk into the Mud Seas. 740 TC to silence it.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Drakova | the head ferryman | — | Ferryman's Crossing-Token | diplomacy | — |

**Text:**

> The head ferryman won't meet your eye, but he cuts you a crossing-token anyway. "It sings my brother's voice some nights. My wife's, others. Whoever it takes, it learns. Go out on the water at dusk and see for yourself — then find Halla. She's a netter, works the far quay at Ostragar. She plugged her ears with wax and lived."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Ferryman's Crossing-Token | Boot-Trail Cast | investigate | — |

**Text:**

> At the dusk crossing out in the Mud Seas you find a fresh trail of boots walking straight off a quay-stone into the silt — unhurried, glad. You take a cast of the last print before the tide has it. The Siren sang someone home an hour ago, and it hears your oar now, and goes quiet, learning your sound.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | Halla the netter | Boot-Trail Cast | Halla's Shallows-Bearing | diplomacy | — |

**Text:**

> Halla looks at the cast and says the name of the man who made it without being told. She will trade the wax-trick for a burial: her brother answered the song last spring and lies out in the shallows unclaimed. "Bring him to dry ground," she says, marking the bearing on your palm. "I'll not have him be part of its choir."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Halla's Shallows-Bearing | The Netter's Brother | boss | Bog Creeper ×1 |

**Text:**

> You wade Halla's bearing out into the shallows and find her brother face-down in the reeds — and the Bog Creeper that has claimed the body for its own larder comes up under you for the trespass.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | Halla the netter | The Netter's Brother | Netter's Ear-Wax Seal | diplomacy | — |

**Text:**

> Halla buries her brother above the tideline and comes back with her hands still dirty. She seals your ears with netter's wax, working it in with her thumbs. "Now it can shout," she says, and you only know she said it because you watched her mouth.

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Drakova | — | Netter's Ear-Wax Seal | Reed-Throat Mark | attack_provoke | — |

**Text:**

> You pole into the drowned quarter of Drakova with the song gone flat and far. Unable to sing you down, the Siren sends the drowned it has already taken to pull you under by hand. You break them off the hull one at a time, and the last one goes down clutching a reed-mark cut from the roost itself.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Drakova | — | Reed-Throat Mark | — | boss | — |

**Text:**

> The reed-mark takes you to the roost. Deaf to the song, you can see the trick of it at last — the Siren has no voice of its own, it steals throats, and its own reed-throat is the one thing it cannot replace. It opens a hundred stolen mouths at once, a gaping furious quiet. Foul the reed and end the song.

**Checklist:**

- 

---

## The Weaver of the Obsidian Pillars

- **id:** `hunt_iron_spider_obsidian`
- **poster sends you to:** the Obsidian Pillars
- **target:** Iron Spider
- **difficulty:** Seasoned (tier 2, rec HP 40, rec weapon Uncommon)
- **reward:** 400 TC, Aetheric Shard, trophy: Iron Spider Spinneret
- **min rep:** 0

> **POSTER —** Reclaimer salvagers at the Obsidian Pillars keep losing crews to an Iron Spider that webs the ruins in living wire. 400 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the salvage-boss | — | Coil of Tartarian Filament | diplomacy | — |

**Text:**

> The salvage-boss cuts you a length of wire fine as hair and strong as cable. "It spins old Tartarian filament into webs and my crews walk into them in the dark. Go up to the Pillars and see what it does to a crew. Then take that coil to a scavenger called Pike, out at the Architect's Blind — he mapped the Pillars before it took his legs."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Coil of Tartarian Filament | Wire-Marked Toolkit | investigate | — |

**Text:**

> Among the Pillars you find a crew's worth of tools scattered under a canopy of iron web, their owners gone but for the wire-marks on the stone. You gather the toolkit — every handle scored by the same filament in your coil. The Spider watches from a high pillar. It has already measured you for a strand.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | Pike the scavenger | Wire-Marked Toolkit | Pike's Web-Map | diplomacy | — |

**Text:**

> Pike goes through the toolkit handle by handle, naming the dead as he goes. He'll draw the web-map for a bottle and a promise: his partner is cocooned somewhere in the Pillars and may yet live. "Cut him down," Pike says, sketching the high lines. "I can't climb to him. You can."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Pike's Web-Map | The Cocooned Salvager | boss | Aetheric Spider ×3 |

**Text:**

> Pike's lines take you up to where his partner hangs wound in iron silk — alive, half-mad, and with an Aetheric Spider brood already feeding at the cocoon's edge. The strand you are standing on tells them exactly where you are.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | Pike the scavenger | The Cocooned Salvager | Pike's Core-Web Line | diplomacy | — |

**Text:**

> Pike doesn't thank you and doesn't have to. He turns the web-map over and draws the part he was holding back: the Spider's core-web, strung between the three tallest Pillars, and the one master-strand every other line hangs off.

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Pike's Core-Web Line | Master-Strand Cutter | cast | — |

**Text:**

> At the core-web you see the flaw Pike drew: everything anchors to one master-strand humming with stolen Aether. You charge a cutter against that hum until the edge sings back at it. Cut the master-strand and the whole cathedral of wire — and the Weaver on it — comes down at once.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Master-Strand Cutter | — | boss | — |

**Text:**

> You reach the master-strand as the Iron Spider rushes down its own web toward you, fast as a dropped stone. Cut the thread and take it — or ride the collapse into the Pillars' teeth.

**Checklist:**

- 

---

## The Apparition in the Red Tower

- **id:** `hunt_apparition_red_tower`
- **poster sends you to:** the Red Tower of Nimari
- **target:** Aetheric Apparition
- **difficulty:** Elite (tier 4, rec HP 65, rec weapon Rare)
- **reward:** 1040 TC, Runic Mantle, trophy: Apparition Residue
- **min rep:** 0

> **POSTER —** The Forgotten Order will pay well to lay to rest an Aetheric Apparition haunting the Red Tower of Nimari — it wears the faces of the Order's own lost scholars. 1040 TC.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order archivist | — | Archivist's Requisition | diplomacy | — |

**Text:**

> The Order archivist is grey with grief and signs the requisition without reading it. "We sent scholars into the Red Tower to read the cursed core's casing. They did not come back — and now something up there wears their faces and calls in their voices. Go and see it. Then take what you find to Vesryn, down in Nimari. He kept their field-notes and he will not part with them for asking."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Red Tower of Nimari | — | Archivist's Requisition | Core-Casing Rubbing | investigate | — |

**Text:**

> In the Tower's lower archive you find the scholars' abandoned notes and, pressed flat in a ledger, a charcoal rubbing of the core-casing — a casing that should not still be intact. You take the rubbing. The Apparition drifts a floor above, trying on a dead woman's laugh.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Nimari | Vesryn the tutor | Core-Casing Rubbing | Vesryn's Gallery Plan | diplomacy | — |

**Text:**

> Vesryn recognises the rubbing and the hand that made it. He will surrender the field-notes on one condition: recover the body of the lead scholar, his own student, so she can be named and mourned. "I sent her in," he says, drawing the gallery plan from memory. "Let me at least bring her home."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Red Tower of Nimari | — | Vesryn's Gallery Plan | The Lead Scholar's Remains | boss | Shifting Shade ×1 |

**Text:**

> The plan takes you up to the third gallery, where the Tower's cursed Aether caught the student — and a Shifting Shade is circling what remains of her. It stops circling the moment your lamp finds it.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Nimari | Vesryn the tutor | The Lead Scholar's Remains | The Scholars' Field-Notes | diplomacy | — |

**Text:**

> Vesryn names her properly, in front of witnesses, which is all he ever wanted. Then he gives you the field-notes. They say the thing plainly: the Apparition is the cursed core's spillover, a wound in the Aether wearing whatever grief it finds nearest.

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Red Tower of Nimari | — | The Scholars' Field-Notes | Core-Shell Seal-Breaker | attack_provoke | — |

**Text:**

> You climb to the casing with the notes open in one hand, and the Tower turns hostile — the dead scholars' faces surrounding you on every landing, all speaking your failures at once. You cut through them to the casing, and pry the seal-breaker the scholars died machining out of the wall where they left it.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Red Tower of Nimari | — | Core-Shell Seal-Breaker | — | boss | — |

**Text:**

> At the core-casing the Apparition wears every lost face at once, a chorus of the Order's dead pleading in one voice. Break the seal and lay them to rest — or add your own face to its collection.

**Checklist:**

- 

---

## The Harpy of the Cradle of Dusk

- **id:** `hunt_mud_harpy_cradle`
- **poster sends you to:** the Cradle of Dusk
- **target:** Mud Harpy
- **difficulty:** Veteran (tier 3, rec HP 50, rec weapon Rare)
- **reward:** 700 TC, Aetheric Cloth, trophy: Harpy Pinion
- **min rep:** 0

> **POSTER —** Wayfarers at the Cradle of Dusk are being snatched from the road at twilight. A Mud Harpy nests in the dead spires. 700 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | the road-warden | — | Warden's Dusk-Warrant | diplomacy | — |

**Text:**

> The road-warden points at the sky and stamps you a dusk-warrant for the Cradle road. "It takes them at dusk — that hour when the eye can't tell bird from shadow. Walk the road and bring me back something off it. Then take that to a trapper named Ferel; he keeps a line out on the Great Tartary Plains past the dead spires. It took his daughter and he lived."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Warden's Dusk-Warrant | Three Grey Pinions | investigate | — |

**Text:**

> At the road's edge in the Cradle you find a snatched traveller's pack, dropped from a height, and three grey pinions the length of your arm. You bundle them. The Harpy circled back to watch you find them — it is curious now, which is worse.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | Ferel the trapper | Three Grey Pinions | Ferel's High-Spire Line | diplomacy | — |

**Text:**

> Ferel measures the pinions against his own arm and knows the bird by them. He'll guide you to the nest for one thing: his daughter's body, taken to the high spire two seasons past. "I can't make the climb," he says, drawing you the line up it. "You can. Bring her down. Then I'll take you to the roost."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Ferel's High-Spire Line | Ferel's Daughter | boss | Aetheric Raven ×4 |

**Text:**

> Ferel's line takes you up to where the Harpy caches its kills. You find his daughter among older bones with an Aetheric Raven flock already picking over the site — and the flock does not scatter. It turns.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | Ferel the trapper | Ferel's Daughter | Ferel's Dusk-Trick | diplomacy | — |

**Text:**

> Ferel buries her himself, out where he can see the spires, and then gives you the trick that saved him: the Harpy is deaf in a dive — all eyes, wholly committed to the fall. Stand where the last light throws your shadow long and it will misjudge the strike by a hand. He cuts the mark for that stance into a strip of hide for you.

> **Arbiter —** "A hand's width," the Arbiter says. "That is the whole of your advantage. Use it early."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Ferel's Dusk-Trick | Long-Shadow Mark | attack_provoke | — |

**Text:**

> Ferel walks you in as far as he can stand to and points out the roost. As you close, the dusk erupts — the Harpy's brood, half-grown and screaming, flung at you to blind and slow you before the mother folds her wings. You put them down and pace out the long-shadow ground while the light is still worth anything.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Long-Shadow Mark | — | boss | — |

**Text:**

> At full dark the Harpy climbs, then folds and drops — a stone with talons. You hold the ground you marked, let it commit, and step. Now, in the half-beat it cannot correct, end it.

**Checklist:**

- 

---

## The Fiend in the Tartary Dust

- **id:** `hunt_dust_fiend_plains`
- **poster sends you to:** the Great Tartary Plains
- **target:** Dust Fiend
- **difficulty:** Veteran (tier 3, rec HP 52, rec weapon Rare)
- **reward:** 700 TC, Aetheric Shard, trophy: Fiend-Glass Shard
- **min rep:** 0

> **POSTER —** Caravans crossing the Great Tartary Plains are found scoured to bone, no tracks but the wind's. A Dust Fiend rides the storms. 700 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Parley Ground | the caravan-mother | — | Caravan-Mother's Grit-Token | diplomacy | — |

**Text:**

> The caravan-mother spits grit and presses her house-token into your hand. "It comes in the wall of dust and leaves the wind its plate. My outriders won't cross the deep plains now. Go and look at what's left of the last crossing, then take the token to a storm-reader called Yenna — she keeps the last well down in Samarran and she does nothing for free."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Caravan-Mother's Grit-Token | Scoured Wheel-Warning | investigate | — |

**Text:**

> You find the scoured caravan half-buried on the deep plains — meat gone, metal frosted to glass where the Fiend passed. In the lee of a wheel, one survivor scratched a warning before the wind took them: IT TURNS WITH THE WIND. You lever the board free and carry it.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | Yenna the storm-reader | Scoured Wheel-Warning | Yenna's Pump-Works Key | diplomacy | — |

**Text:**

> Yenna reads the scratched board twice and the token once. She'll read the sky for you on one condition: clear the drowned pump-works below her well. Something has fouled it, and a dry well on the plains is a slow grave. "Fix my water," she says, handing down the hatch-key, "and I'll give you the sky."

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | — | Yenna's Pump-Works Key | Cistern Fouling-Plate | boss | Bog Creeper ×1 |

**Text:**

> You unlock the pump-works and go down into the cistern and find the foulness breeding in the dark: a Bog Creeper denned in the intake, awake, and between you and the fouling-plate.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | Yenna the storm-reader | Cistern Fouling-Plate | Yenna's Storm-Hour Reading | diplomacy | — |

**Text:**

> Yenna's hard face softens by exactly one degree. She takes three days of sky, folds them into one reading, and names the hour the next wall of dust will rise. Then she tells you the Fiend's law for nothing: it is only whole inside the storm. On still air it comes apart.

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Yenna's Storm-Hour Reading | Storm-Eye Bearing | attack_provoke | — |

**Text:**

> You ride out to meet the wall at Yenna's hour, and the Fiend — sensing a hunter in its own weather — throws the whole plain's grit at you at once, a scouring dark that flays and blinds. You cut through it to the one pocket of calm the storm turns around, and take its bearing while you can still see.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Storm-Eye Bearing | — | boss | — |

**Text:**

> You hold the storm's eye. The Dust Fiend rages at the edge of the calm, unable to enter without unmaking, forced to lunge through still air in a shape it can barely keep. That lunge is the whole fight. Take it.

**Checklist:**

- 

---

## The Warden of Thametan's Tower

- **id:** `hunt_mud_golem_thametan`
- **poster sends you to:** Thametan's Tower
- **target:** Mud Golem
- **difficulty:** Elite (tier 4, rec HP 62, rec weapon Rare)
- **reward:** 1000 TC, Runic Mantle, trophy: Golem Core-Heart
- **min rep:** 0

> **POSTER —** Stone Builders surveying Thametan's Tower woke something in its foundations — a Mud Golem that will let no one climb. 1000 TC on confirmed kill.

### Stage 1 — inciting_hook

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-surveyor | — | Lodge Survey Warrant | diplomacy | — |

**Text:**

> The lodge-surveyor nurses a broken arm and signs the warrant left-handed. "We only wanted to read the Tower. Something in the footing stood up — a Golem, old as the stone — and it will not let us past the second floor. My apprentice Del stayed behind, trapped above it. Get up there and find him."

**Checklist:**

- 

### Stage 2 — first_friction

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | — | Lodge Survey Warrant | Builders' Scattered Tools | investigate | — |

**Text:**

> You reach the Tower's second floor and find the Golem's work: a stair collapsed to deny the climb, and Builder tools scattered where men ran. You gather what's usable. High above, a voice — Del, alive, walled in by rubble the Golem itself placed to keep him from the top.

**Checklist:**

- 

### Stage 3 — toll

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | Del the apprentice | Builders' Scattered Tools | Del's Upper-Chamber Route | diplomacy | — |

**Text:**

> You pass the tools up through the gap and Del calls the deal down through the stone: the upper chamber holds the treatise the Builders came for, and the Golem guards it. "Bring the reading down and I'll show you the Golem's seam," he says. "I watched it move for a day. I know where it's soft." He shouts you the way around the collapsed flight.

**Checklist:**

- 

### Stage 4 — favor

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | — | Del's Upper-Chamber Route | The Builders' Treatise | boss | Iron Spider ×2 |

**Text:**

> Del's route takes you past the Golem to the upper chamber, where the treatise sits exactly where the Builders dropped it — and a pair of Iron Spiders have nested in the abandoned gear, guarding it entirely by accident. They come off the gear the moment you reach for the page.

**Checklist:**

- 

### Stage 5 — revelation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | Del the apprentice | The Builders' Treatise | Del's Seam-Reading | diplomacy | — |

**Text:**

> Del reads the treatise by lamplight with his hands shaking, and pays for it in full: the Golem's core-heart sits behind a plate that opens only when it winds up a full swing. Bait the swing and for one beat the seam is bare. He draws the timing on the flagstone in chalk and makes you say it back.

> **Arbiter —** "One beat," the Arbiter says. "Miss it and the swing that opened the seam is the last thing you feel."

**Checklist:**

- 

### Stage 6 — catalyst

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | — | Del's Seam-Reading | Core-Plate Timing | attack_provoke | — |

**Text:**

> You go down to face it and the Tower answers — the Golem tearing its own stair apart to bury you, flinging the building at you a block at a time. You wear the barrage down to open floor and count its swings until the rhythm Del chalked out is the one you can feel in your teeth.

**Checklist:**

- 

### Stage 7 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Thametan's Tower | — | Core-Plate Timing | — | boss | — |

**Text:**

> You goad the Golem into a full overhead swing and the core-plate yawns exactly on Del's count. The Tower holds its breath. Drive into the seam now — or wear the blow that opened it.

**Checklist:**

- 

---

## The Plague Moth of the Sunken Enclave

- **id:** `hunt_plague_moth_enclave`
- **poster sends you to:** the Sunken Enclave
- **target:** Plague Moth
- **difficulty:** Elite (tier 4, rec HP 58, rec weapon Rare)
- **reward:** 1080 TC, Aetheric Cloth, trophy: Moth-Dust Phial
- **min rep:** 0

> **POSTER —** A wasting sickness spreads from the Sunken Enclave's upper vaults. A Plague Moth breeds in the dark, dusting the air with rot. URGENT — 1080 TC.

### Stage 1 — urgent_dispatch

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Outskirts | the physician | — | Physician's Rot-Ward Mask | diplomacy | — |

**Text:**

> A physician grabs your sleeve and pushes a soaked rot-ward mask at you. "There's no time for the usual dance. Whole quarters are wasting — a Moth in the upper vaults, dusting the air with rot. Start at the Giant Vault, that's where the first cases walked in from. Every hour it lives, another street coughs. Wear this and go NOW."

**Checklist:**

- 

### Stage 2 — false_summit

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Physician's Rot-Ward Mask | Salvager's Dying Testimony | investigate | — |

**Text:**

> You reach the vault you were sent to and the Moth is already dead — someone got here first, a salvager who cracked it open and is dying of the dust for the trouble. You get their testimony out of them a word at a time. The vault is a hatchery. This was one of many.

**Checklist:**

- 

### Stage 3 — investigation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Salvager's Dying Testimony | Rot-Dust Trail Reading | investigate | — |

**Text:**

> The testimony holds the truth the poster didn't: the Moth you were sent for was a drone. The queen roosts in the flooded reliquary under the Sunken Enclave, and every drone she throws off doubles the sickness. You read her descent by the rot-dust settling on the water and take the line down.

**Checklist:**

- 

### Stage 4 — gauntlet

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | Rot-Dust Trail Reading | Reliquary Approach Mark | attack_provoke | — |

**Text:**

> The reliquary approach is a gauntlet of her drones, throwing themselves into your torch to blind it and dusting every breath you take with rot. You hold your air and cut through the swarm until the roost door is the only thing left standing between you.

**Checklist:**

- 

### Stage 5 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | Reliquary Approach Mark | — | boss | — |

**Text:**

> The Plague Queen fills the flooded reliquary, wings the width of the vault, the whole city's wasting breeding under her. Every second she lives is a street. End her, and end the plague at its throat.

**Checklist:**

- 

---

## The Alpha of Yuldra-Tul

- **id:** `hunt_mud_hound_alpha_yuldra`
- **poster sends you to:** Yuldra-Tul
- **target:** Mud Hound Alpha
- **difficulty:** Veteran (tier 3, rec HP 46, rec weapon Rare)
- **reward:** 700 TC, Aetheric Shard, trophy: Alpha Fang-Necklace
- **min rep:** 0

> **POSTER —** A Mud Hound pack has taken the Yuldra-Tul road and their Alpha is smart enough to bait travelers into the pack. URGENT — 700 TC on the Alpha's head.

### Stage 1 — urgent_dispatch

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Yuldra-Tul | the Yuldra-Tul reeve | — | Reeve's Road-Writ | diplomacy | — |

**Text:**

> The Yuldra-Tul reeve is out of patience and writes the road-writ standing up. "No time for tracking. The pack owns the road out on the plains and the Alpha's clever — it fakes a lone lame hound to draw folk in, then the pack takes them. Cut the head off and the rest scatter. Ride out and do it."

**Checklist:**

- 

### Stage 2 — false_summit

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Reeve's Road-Writ | Lame-Hound Bait Sign | investigate | — |

**Text:**

> You take the road and find the bait exactly as warned — a lone hound feigning a broken leg in the open. But when you close, the pack does not spring. The Alpha is testing whether you know the trick. It watches from the ridge, reconsidering you, and you mark the sign it leaves behind.

**Checklist:**

- 

### Stage 3 — investigation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Lame-Hound Bait Sign | Box-Canyon Bone-Mark | investigate | — |

**Text:**

> You read the Alpha's real game in the sign: it does not lead the pack, it HERDS — funnelling the whole road toward a box canyon on the Yuldra-Tul approach where the pack lies waiting. You find the canyon mouth by the bones and cut a mark for it.

**Checklist:**

- 

### Stage 4 — gauntlet

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Yuldra-Tul | — | Box-Canyon Bone-Mark | Thinned-Pack Tally | attack_provoke | — |

**Text:**

> You turn the trap — walk the canyon on your own terms — and the pack commits, pouring in expecting easy meat and finding a hunter. The Alpha throws everything it has at you at once to overwhelm what its cleverness could not fool. When it goes quiet, the pack is half what it was.

**Checklist:**

- 

### Stage 5 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Yuldra-Tul | — | Thinned-Pack Tally | — | boss | — |

**Text:**

> With the pack thinned the Alpha finally enters the fight itself — no more games, all teeth and grim intelligence, knowing that when it falls the rest run. Take its head and give the road back to the living.

**Checklist:**

- 

---

## The Salamander Under Voronov

- **id:** `hunt_salamander_voronov`
- **poster sends you to:** Voronov
- **target:** Aetheric Salamander
- **difficulty:** Elite (tier 4, rec HP 60, rec weapon Rare)
- **reward:** 1060 TC, Runic Mantle, trophy: Salamander Ember-Heart
- **min rep:** 0

> **POSTER —** Voronov's underworks are heating — an Aetheric Salamander has denned in a live Tartarian conduit and the whole quarter above may cook. URGENT — 1060 TC.

### Stage 1 — urgent_dispatch

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | the Voronov engineer | — | Engineer's Conduit Chit | diplomacy | — |

**Text:**

> A Voronov engineer wipes soot and sweat and shoves a conduit chit at you. "No time to be thorough — the underworks are climbing past what the stone can hold. A Salamander's denned in a live conduit out under the Buried Cities and it's feeding on the flow, getting hotter. If it doesn't stop, the quarter above bakes. Get down there."

**Checklist:**

- 

### Stage 2 — false_summit

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | Engineer's Conduit Chit | Cracked Conduit Reading | investigate | — |

**Text:**

> You reach the conduit the engineer marked and the Salamander is gone — moved deeper, chasing hotter flow, leaving the first line cracked and venting behind it. You take the reading off the crack. It is not defending a den. It is following the heat toward the main line, and so must you.

**Checklist:**

- 

### Stage 3 — investigation

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | Cracked Conduit Reading | Junction Scar-Trace | investigate | — |

**Text:**

> You trace it by the glowing conduit-scars back under Voronov's heart, to the main junction. Here it means to nest for good, wrapped around the quarter's primary Aether-line — the one that, if it bursts, takes the district with it.

**Checklist:**

- 

### Stage 4 — gauntlet

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | Junction Scar-Trace | Main-Line Bearing | attack_provoke | — |

**Text:**

> The junction is a furnace of the Salamander's making, the air itself scalding, lesser fire-things spawned out of the overheating flow lunging from every vent as you push to the main line. You burn your way through to the line and take its bearing off the housing.

**Checklist:**

- 

### Stage 5 — apex

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | Main-Line Bearing | — | boss | — |

**Text:**

> The Aetheric Salamander coils the main conduit, glowing white, the whole quarter's heat cycling through its body. Kill it here, at the line, before it nests — or read Voronov's obituary in the rising glow.

**Checklist:**

- 

---

# Mysteries

## Fragment of the Red Tower

- **id:** `mystery_red_tower`
- **faction:** `forgotten_order`
- **poster sends you to:** Red Tower of Nimari
- **reward:** 400 TC, 8 rep, Aetheric Shard, trophy: Fragment of the Red Tower
- **min rep:** 0

> **POSTER —** A Forgotten Order scholar will pay handsomely for a confirmed Fragment of the Red Tower — the cursed Aetheric core's outer casing, never recovered intact. 400 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order scholar | — | Scholar's Survey Chit | diplomacy | — |

**Text:**

> The scholar slides a sketch across the table — hexagonal Tartarian ironwork, the seal of Nimari embossed into one face — and pins a survey chit to it. "The Red Tower's outer ring shed pieces when it cooled. They roll downhill and end up wherever mud collects. Walk the Cradle of Dusk with this and read the mudstone. Then bring what you find to the Tower itself so I can match it against the ring."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Scholar's Survey Chit | Warm Hexagonal Plate | investigate | — |

**Text:**

> You work the mudstone veins along the Cradle's lip where the silt has built up. After an hour your blade catches on an edge that is not stone — a hexagonal plate, faintly warm, the Nimari seal still legible under a century of mud.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Red Tower of Nimari | — | Warm Hexagonal Plate | Fragment of the Red Tower | investigate | — |

**Text:**

> You climb to the Red Tower's outer ring and hold the plate against the gap it came out of. It seats. The scoring lines up. This is not a lookalike off a scrapper's bench — it is the casing, and the Tower is willing to say so.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Red Tower of Nimari | — | Fragment of the Red Tower | — | boss | — |

**Text:**

> You wipe the casing clean. The seal of Nimari is intact and the fit is proven. This will satisfy the scholar — and it is the first piece of that ring anyone has brought back whole.

**Checklist:**

- 

---

## Cradle of Dusk Compass

- **id:** `mystery_cradle_compass`
- **poster sends you to:** Cradle of Dusk
- **reward:** 300 TC, Aetheric Dust, trophy: Cradle of Dusk Compass
- **min rep:** 0

> **POSTER —** Halem the Trader offers 300 TC for a working Cradle of Dusk Compass — one of the few instruments that holds steady in Aetheric storms.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | Halem the Trader | — | Halem's Broken Compass | diplomacy | — |

**Text:**

> Halem unrolls a worn map of the Mud Seas and taps the Cradle of Dusk. "Old Tartarian surveying instrument. Brass face, three needles. Anyone who sails the Mud Seas wants one." He hands you his own broken one. "Take mine for the pattern. There's a surveying wreck out at the Cradle — match the bracket and you'll find the good one."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Halem's Broken Compass | Cradle of Dusk Compass | stealth | — |

**Text:**

> The wreck of the surveying vessel sits half-glassed in the Cradle's haze. You go quiet through the listing hull — the instrument console is intact, and one compass still sits in a bracket that matches Halem's exactly. You work it free without bringing the deck down.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | — | Cradle of Dusk Compass | — | boss | — |

**Text:**

> Out in the open you let the three needles settle. They snap to attention at once, aligned with currents you cannot feel, and hold steady while the haze churns. Halem will pay for this without bargaining.

**Checklist:**

- 

---

## The Leviathan's Eye

- **id:** `mystery_leviathan_eye`
- **faction:** `true_tartarians`
- **poster sends you to:** Mud Seas
- **reward:** 500 TC, 12 rep, Aetheric Shard, trophy: Preserved Leviathan Eye
- **min rep:** 1

> **POSTER —** True Tartarian agents will pay 500 TC and faith-favor for the preserved eye of a Mud Seas Leviathan — said to see through Aetheric storms.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | the True Tartarian agent | — | Jar of Aetherstone Packing | diplomacy | — |

**Text:**

> The True Tartarian agent meets you in the dark and gives you a jar of Aetherstone packing. "Leviathan, Mud Seas. Old beast, long dead, but its eye does not rot in Aetherstone. Find the carcass, take the eye, pack it in this before the air gets at it. Bring it back to the Enclave."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Jar of Aetherstone Packing | Fossilised Leviathan Scale | investigate | — |

**Text:**

> You walk the receding edge of the Mud Seas until the Leviathan's spine breaks the surface like a ridge of ribbed stone — long dead, every scale fossilised. You cut a scale free to prove the find and follow the ridge toward the skull.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Fossilised Leviathan Scale | Preserved Leviathan Eye | stealth | — |

**Text:**

> You climb the spine to where the skull lies half-submerged and pick your footing carefully — the bone shifts. The eye-socket is the size of a window. You reach in, and the eye is still there: fossilised, intact, the size of a melon. It goes into the packing jar.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | the True Tartarian agent | Preserved Leviathan Eye | — | boss | — |

**Text:**

> Back at the Enclave you open the jar under lamplight. The eye has held — no clouding, no crumble. The agent will not have to take your word for anything.

**Checklist:**

- 

---

## Temporal Distortion Watch

- **id:** `mystery_temporal_watch`
- **faction:** `reclaimers_guild`
- **poster sends you to:** The Buried Cities
- **reward:** 600 TC, 10 rep, Energy Fragment, trophy: Temporal Distortion Watch
- **min rep:** 2

> **POSTER —** Reclaimers Guild Speaker pays 600 TC and will move you up the haul board for a working Temporal Distortion Watch — Tartarian-make, useful in deep ruins.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimers Guild Speaker | — | Guild Eddy-Gauge | diplomacy | — |

**Text:**

> The Speaker spreads the contract and lends you a Guild eddy-gauge. "Watch — Tartarian make, hexagonal face, three dials. Counts the way local Aetheric time bends. They turn up on the dead: anyone caught in an eddy got theirs fossilised with them. Read the Buried Cities with the gauge and find a body worth unstrapping."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | Guild Eddy-Gauge | Eddy-Zone Reading | investigate | — |

**Text:**

> You walk the Buried Cities with the gauge and it starts to stutter — a temporal eddy, and the gauge draws you a map of its edge. You mark the reading down. Somewhere inside that line, everything that died is still dying slowly.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | Eddy-Zone Reading | Temporal Distortion Watch | stealth | — |

**Text:**

> You go into the eddy on the reading's line, moving slow because everything here does. A Reclaimer body lies perfectly preserved, the watch still on the wrist, ticking in long waves. You unstrap it and back out along your own footprints.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimers Guild Speaker | Temporal Distortion Watch | — | boss | — |

**Text:**

> Clear of the eddy, the dials settle into normal time and stay there — three hands, honest and steady. It works. The Speaker will pay without question.

**Checklist:**

- 

---

## Shifting Obsidian Orb

- **id:** `mystery_obsidian_orb`
- **faction:** `mud_monarchs`
- **poster sends you to:** Obsidian Pillars
- **reward:** 700 TC, 8 rep, Aetheric Cloth, trophy: Shifting Obsidian Orb
- **min rep:** 3

> **POSTER —** Mud Monarch courier offers 700 TC for a Shifting Obsidian Orb — an Obsidian Pillar fragment fused with Aetherstone. Reshapes itself.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | the Mud Monarch courier | — | Monarch Courier Writ | diplomacy | — |

**Text:**

> The courier is well-dressed and brief, and leaves a sealed writ on the table. "Obsidian Pillars. The Orbs only form where a pillar cracks under an Aetheric storm. Find a recently-struck pillar, recover the Orb, and bring it to the Blind — not to me, and not anywhere anyone can watch you carry it."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Monarch Courier Writ | Storm-Scored Shard | investigate | — |

**Text:**

> You quarter the Pillars until you find one with fresh damage — Aetheric scoring bright along a face that was whole a week ago. You chip a shard of the scored obsidian for the record. The Orb has rolled into the silt at the base, black, and not holding a shape.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Storm-Scored Shard | Shifting Obsidian Orb | stealth | — |

**Text:**

> You take the Orb out of the silt without straightening up. It is heavy in a way that keeps changing — a stone's weight, then a feather's — and you leave the Pillars by the long way, because the courier was clear about being watched.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | — | Shifting Obsidian Orb | — | boss | — |

**Text:**

> In the quiet of the Architect's Blind you set the Orb down and let it settle. It never quite does. The courier's coin is good. Whatever the Monarchs want it for is their concern, not yours — yet.

**Checklist:**

- 

---

## The Hum Beneath Ural

- **id:** `mystery_servants_hum`
- **faction:** `servants_of_giants`
- **poster sends you to:** Tartarian Outskirts
- **reward:** 300 TC, 10 rep, trophy: Listening Stone Cluster
- **min rep:** 0

> **POSTER —** The Servants of the Giants hear a hum from the Urals that does not match any prayer in the canon. They will pay any pilgrim willing to walk the Outskirts and listen — three places, three readings, one answer. 300 TC posted at any Servants shrine.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Giant-Watch Shrine | Vael | — | Vael's Three Listening Stones | diplomacy | — |

**Text:**

> Vael presses three small carved stones into your palm. "One at the Obsidian Pillars. One at the Endless Stair. One at the Sinking Cathedral. Press each to the rock and let it listen. They will know which note is which when you bring them back to the shrine."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Vael's Three Listening Stones | First Note — the Pillars | investigate | — |

**Text:**

> You stand at the Obsidian Pillars and press the first stone to the rock. The hum that answers is not the empty hum of weather — it has shape. The stone takes the note and holds it, warm in your hand long after you lift it away.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | First Note — the Pillars | Second Note — the Stair | investigate | — |

**Text:**

> Endless Stair. The second stone hums lower, and you hold it against the step longer than you mean to. The stair, you remember, descends past where any explorer has come back from.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Second Note — the Stair | Third Note — the Cathedral | investigate | — |

**Text:**

> Sinking Cathedral. You stand on the spit of mud above where the steeple breaks the water and press the third stone down. It hums almost not at all. The Servants will want to know that too — a silence in the right place is still a reading.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Giant-Watch Shrine | Vael | Third Note — the Cathedral | — | boss | — |

**Text:**

> Back at the shrine you lay the three stones out in the order you took them. Three readings, three notes, one chord. Vael will know what it means — and from her face, she already half does.

**Checklist:**

- 

---

## The Weeping Core

- **id:** `mystery_weeping_core`
- **faction:** `forgotten_order`
- **poster sends you to:** The Buried Cities
- **reward:** 500 TC, 8 rep, Aetheric Shard, trophy: Weeping Core
- **min rep:** 1

> **POSTER —** A Forgotten Order savant seeks a "Weeping Core" — an Aetheric core that leaks a slow tear of live Aether, thought lost in the Buried Cities. 500 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order savant | — | Sealed Catch-Vial | diplomacy | — |

**Text:**

> The savant blots a bead of blue light off her workbench and gives you a sealed catch-vial. "One core in a hundred cracks without dying — it weeps, and the tears are worth more than the core. One was seen in the Buried Cities before the seller vanished. Find it before it runs dry, and catch what it sheds on the way out."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | Sealed Catch-Vial | A Single Core-Tear | investigate | — |

**Text:**

> You trace the seller to a collapsed gallery in the Buried Cities — buried with his find when the roof took him. The Core weeps on in the dark, a slow blue drip counting out the months since anyone came. You catch a tear in the vial and it does not stop crying.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | A Single Core-Tear | Weeping Core | stealth | — |

**Text:**

> The gallery is snared with old Tartarian ward-wire, live and singing. You read the safe path through by the pattern of the Core's own dripping light, and lift it free without waking the trap.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order savant | Weeping Core | — | boss | — |

**Text:**

> You cradle the Weeping Core out into the light at Varakush and the savant weighs one tear on a scale finer than a hair. She goes pale with joy. "It is still crying," she breathes. "Do you understand what we can learn from a wound that will not close?"

**Checklist:**

- 

---

## The Aetherborn Foundling

- **id:** `mystery_aetherborn_foundling`
- **faction:** `eternal_dynasty`
- **poster sends you to:** Samarran
- **reward:** 600 TC, 10 rep, Runic Mantle, trophy: Bloodline Token
- **min rep:** 2

> **POSTER —** A Dynasty agent quietly seeks a foundling child whose blood may run Aetherborn — hidden from the bloodline by a mother who fled. 600 TC, no questions.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the Dynasty agent | — | Dynasty Seal | diplomacy | — |

**Text:**

> The agent keeps his voice low and gives you a Dynasty seal to open doors with. "A mother ran from us with an infant who might be pure-blooded. She left a token — a bloodline-marked locket — with someone she trusted in Samarran. Find the token. The Dynasty will handle the rest." He does not say what "the rest" means.

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | — | Dynasty Seal | Broker's Effects Log | investigate | — |

**Text:**

> The seal opens the right doors and the mother's trail runs cold in Samarran, at a widow who took her in. The widow is a year dead, but her effects went to a Reclaimer broker who logs everything — and the log is still on the shelf. The token is in someone's inventory now.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | the Reclaimer broker | Broker's Effects Log | Bloodline Token | diplomacy | — |

**Text:**

> The broker reads her own log, names a price, and parts with the locket for coin and a story told straight. As you leave the Hidden Market you understand the shape of it: the token is not proof the child is pure. It is proof the child exists — which for the Dynasty is the same as a sentence.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the Dynasty agent | Bloodline Token | — | boss | — |

**Text:**

> You bring the agent the bloodline token and he turns it in the light, satisfied. What you tell him about the child — where, whether, at all — is the part of this errand the poster did not price. That part was always yours to set.

**Checklist:**

- 

---

## The Drowned Bell of Samarran

- **id:** `mystery_drowned_bell_samarran`
- **poster sends you to:** Samarran
- **reward:** 450 TC, 6 rep, Aetheric Cloth, trophy: Drowned Bell
- **min rep:** 0

> **POSTER —** A Samarran bell-founder will pay for the "Drowned Bell" — a Tartarian resonance-bell that tolls underwater and stills troubled Aether. 450 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | the bell-founder | — | Founder's Tuning-Rod | diplomacy | — |

**Text:**

> The founder taps a cracked bell that will not ring true and hands you his tuning-rod. "The old empire cast bells that tuned the Aether itself. One sank with a Samarran barge in the shallows and still tolls down there when the field runs high. Take the rod — you'll find the wreck by ear before you find it by eye."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | — | Founder's Tuning-Rod | Wreck Bearing | investigate | — |

**Text:**

> You find the barge-wreck in the Samarran shallows exactly the way he said — the rod picking up a low bronze note rising through the water each time the Aether swells. The Bell is snared under a century of silt and a barge-rib the size of a mast. You mark the bearing.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | — | Wreck Bearing | Drowned Bell | boss | — |

**Text:**

> You clear the rib and work the Bell out of the silt. The tolling stops as it comes free, and the still field around it — an Aetheric Ooze bloom that had fed on that quiet for a century — sours and drifts apart without it. You carry the Bell up dripping.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | the bell-founder | — | — | auto | — |

**Text:**

> You bring the Drowned Bell to the founder and he strikes it once. The note lands in your chest and every jangled thing in the shop goes calm at once. "It is not a bell," he whispers. "It is a truce. The empire could ring the world quiet."

**Checklist:**

- 

---

## The Singing Stone of Ostragar

- **id:** `mystery_singing_stone_ostragar`
- **faction:** `stone_builders`
- **poster sends you to:** Ostragar
- **reward:** 550 TC, 9 rep, Aetheric Shard, trophy: Singing Keystone
- **min rep:** 1

> **POSTER —** The Stone Builders seek a "Singing Stone" from Ostragar — a keystone that hums the load of a whole vault, the last of its kind unbroken. 550 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-scribe | — | Lodge Brace-Kit | diplomacy | — |

**Text:**

> The lodge-scribe hums a note and a nearby wall answers faintly. She gives you a lodge brace-kit. "The Tartarians cut keystones that sing the load they carry. Ostragar's great vault still holds one, unbroken — and the vault is failing. Brace it the old way or you will be the one who brought the roof down."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | — | Lodge Brace-Kit | Vault Load-Reading | investigate | — |

**Text:**

> In Ostragar's failing vault you find the keystone by its hum — high and thin now, a note under strain, the whole vault leaning on it. You read the load off it and chalk the brace points where the kit will hold.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | — | Vault Load-Reading | Singing Keystone | cast | — |

**Text:**

> You brace the vault on your own chalk marks and match the keystone's song with a working, long enough to ease it free and slip a rough stone into the gap. The vault groans, settles, and holds — for now.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-scribe | — | — | auto | — |

**Text:**

> You lay the Singing Keystone on the lodge bench and it hums, content, off its long strain at last. The scribe presses an ear to it and weeps. "It is well again," she says. "We can finally learn what 'well' sounds like. Everything we build after this will be truer."

**Checklist:**

- 

---

## The Monarch's Redaction

- **id:** `mystery_monarch_redaction`
- **faction:** `conspiracy_architects`
- **poster sends you to:** The Hidden Market
- **reward:** 650 TC, 10 rep, Runic Mantle, trophy: Redacted Ledger
- **min rep:** 2

> **POSTER —** A Conspiracy Architect handler seeks a leaked Mud Monarch ledger before its redactions can be read — a page that names what the Monarchs buried. 650 TC, utter discretion.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | the Architect handler | — | Market Letter of Credit | diplomacy | — |

**Text:**

> The handler slides you a scrap — half a sentence, the rest inked black — and a market letter of credit. "A Monarch ledger leaked. One page names a Guardian site they mean kept secret forever, and it is loose in the Hidden Market. Recover it before anyone reads under the redaction. The silence is a kindness."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | Market Letter of Credit | Fence's Hand-Off Note | investigate | — |

**Text:**

> You trace the page through three market hands to a Reclaimer fence who has already tried to read it and failed — the redaction is Tartarian ink and it eats light. But she noticed the page runs warm where the buried thing is named, and she writes you out the hand-off.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | Fence's Hand-Off Note | Redacted Ledger | stealth | — |

**Text:**

> The fence will sell, but she wants out of the whole affair alive — the Monarchs are hunting the page too. You get her clear of the stalls ahead of a Monarch cutter and take the ledger unopened, which is the only way it is worth anything.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | the Architect handler | Redacted Ledger | — | boss | — |

**Text:**

> You hand the redacted ledger to the handler. He does not open it either — that is the point. "Now no one has read it," he says, filing it into a dark you will never see the bottom of. Whether that is mercy or a grave for the truth, he has made you part of it.

**Checklist:**

- 

---

## The Second Flood Cipher

- **id:** `mystery_second_flood_cipher`
- **faction:** `tartarian_revivalists`
- **poster sends you to:** Aetheric Chamber
- **reward:** 700 TC, 11 rep, Aetheric Cloth, trophy: Cipher-Plate
- **min rep:** 3

> **POSTER —** The Revivalists seek a recovered Tartarian cipher-plate said to hold the empire's own warning about the Flood — how it started, and how to start it again. 700 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Revivalist Field Camp | the Revivalist cell-leader | — | Glyph-Frame | diplomacy | — |

**Text:**

> The Revivalist cell-leader is hungry-eyed and hands you a glyph-frame. "The Tartarians wrote down how the Flood began — a cipher-plate, buried at the Aetheric Chamber's threshold. Sasha wants it read. It is a warning. A warning is only a set of instructions read backward."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Glyph-Frame | One Full Glyph-Cycle | investigate | — |

**Text:**

> At the Chamber threshold you find the cipher-plate half-buried, its glyphs live and shifting — the Aether still running the warning on a loop a thousand years after the last reader died of it. You set the frame over them and take a rubbing of one full cycle.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | One Full Glyph-Cycle | Cipher-Plate | boss | — |

**Text:**

> Reading the plate at all courts what it warns of. You match the working to hold the glyphs still, and the threshold field surges — an Aetheric overload rising exactly as the plate says it did the first time. It sinks back. You lift the plate out of the socket.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Revivalist Field Camp | the Revivalist cell-leader | — | — | auto | — |

**Text:**

> You carry the cipher-plate back to the cell-leader and watch her read the Flood's own account of itself. "It was not a disaster," she says, wondering. "It was a switch, thrown too far. We only have to throw it gentler." You have handed the Revivalists the world's most dangerous instruction, and called it a warning.

**Checklist:**

- 

---

## The Cartographer's Last Map

- **id:** `mystery_cartographers_last_map`
- **faction:** `reclaimers_guild`
- **poster sends you to:** The Giant Vault
- **reward:** 550 TC, 9 rep, Aetheric Shard, trophy: Cartographer's Map
- **min rep:** 1

> **POSTER —** A Reclaimer broker seeks the last map of a dead cartographer — said to chart a sealed Tartarian vault no one else has found. 550 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimer broker | — | Merik's Estate Claim-Chit | diplomacy | — |

**Text:**

> The broker unrolls a blank scrap and writes you a claim-chit against Merik's estate. "Old Merik mapped every vault worth robbing, then found one he wouldn't sell the map to — sealed, Tartarian, unopened. He died with it on him. His effects went out through the Market. Find the map before a rival does."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | Merik's Estate Claim-Chit | Merik's Field-Ledger | investigate | — |

**Text:**

> The chit walks you through three fences at the Hidden Market to a Reclaimer who bought the lot unread. Among the junk you find Merik's field-ledger, and his last note in the margin: I DID NOT SEAL IT. IT SEALED ITSELF. WITH SOMETHING INSIDE.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | Merik's Field-Ledger | Cartographer's Map | stealth | — |

**Text:**

> The fence will trade the map for the ledger, but she is spooked — a Monarch buyer has been asking after it, and asking is the Monarchs' polite step. You get the map clear of the stall before the impolite step arrives.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimer broker | Cartographer's Map | — | boss | — |

**Text:**

> You lay Merik's map on the broker's table. He traces the route to the sealed vault and grins — then reads the margin note and stops grinning. "It sealed itself," he repeats. "With something inside." He pays you and does not, you notice, ask you to open it.

**Checklist:**

- 

---

## The Giant's Tooth

- **id:** `mystery_giants_tooth`
- **faction:** `servants_of_giants`
- **poster sends you to:** Mud Seas
- **reward:** 500 TC, 8 rep, Aetheric Cloth, trophy: Giant's Tooth
- **min rep:** 1

> **POSTER —** The Servants of the Giants seek a relic tooth of a true Tartarian Giant, torn loose in the Flood and lost in the Mud Seas. A holy find. 500 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Pilgrim Camp | the pilgrim-elder | — | Listening-Cord | diplomacy | — |

**Text:**

> The pilgrim-elder speaks of it like a saint's bone, and ties a listening-cord around your wrist. "When the Flood took the Giants, one lost a tooth — a relic the length of a man, humming with the old Aether still. It sank in the Mud Seas. The cord will shiver when you are near it. To hold it is to touch the divine."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Listening-Cord | Marked Shelf-Bearing | investigate | — |

**Text:**

> The cord starts to shiver where a shelf of Mud-Sea floor drops into black. You find the tooth by its hum, snared in the ribs of a drowned barge and singing to itself in the dark, exactly as the elder said. You mark the shelf.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Marked Shelf-Bearing | Giant's Tooth | boss | — |

**Text:**

> Freeing the tooth disturbs its long guardian — a Mud Spirit coiled around the relic, grown strange on a century of that hum. You break its hold and work the tooth loose from the drowned ribs.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Pilgrim Camp | the pilgrim-elder | — | — | auto | — |

**Text:**

> You lay the Giant's Tooth before the pilgrim-elder and the whole camp kneels. She presses her brow to it and weeps at its hum. "It still sings," she breathes. "The Giant is dead a thousand years and its tooth still sings. They are not gone. They are only sleeping deeper than the Sea."

**Checklist:**

- 

---

## The Hollow Crown

- **id:** `mystery_hollow_crown`
- **faction:** `mud_monarchs`
- **reward:** 650 TC, 10 rep, Runic Mantle, trophy: Hollow Crown
- **min rep:** 2

> **POSTER —** A Mud Monarch factor seeks the Hollow Crown — a relic of the old Tartarian rule the Monarchs claim as their own inheritance, lost in a rival's hoard. 650 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | the Monarch factor | — | Hoard Manifest | diplomacy | — |

**Text:**

> The factor keeps his voice even, but his hand tightens on the hoard-manifest he gives you. "The Hollow Crown is proof the Monarchs descend from Tartaria's last true rulers. A Reclaimer hoard at the Giant Vault holds it, unknowing, filed as scrap. We want it back before someone learns to read it. Discreetly."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Hoard Manifest | Assayer's Note | investigate | — |

**Text:**

> The manifest walks you to the Crown, mislabelled among genuine scrap. It IS old — but the metal is common and the jewels are glass. You copy the assay down. Whatever the Hollow Crown proves, it does not prove a bloodline. The Monarchs' inheritance is a prop, and you wonder if they know.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Assayer's Note | Hollow Crown | stealth | — |

**Text:**

> The hoard's Reclaimer keeper won't miss one filed scrap — but a Monarch cutter is here too, to make the recovery "clean" of witnesses. You lift the Crown and steer the keeper out of the cutter's path in the same quiet minute.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | the Monarch factor | Hollow Crown | — | boss | — |

**Text:**

> You return the Hollow Crown to the factor. He handles it like a holy thing, this common circle of old tin. "The proof of our line," he murmurs. You know what it is worth and he does not — or he does, and needs the others not to. Either way, the secret leaves with your silence.

**Checklist:**

- 

---

## The Ashen Codex

- **id:** `mystery_ashen_codex`
- **faction:** `forgotten_order`
- **poster sends you to:** Nimari
- **reward:** 600 TC, 9 rep, Aetheric Shard, trophy: Ashen Codex
- **min rep:** 2

> **POSTER —** The Forgotten Order seeks the Ashen Codex — a treatise burned in a Monarch purge, its words readable still in the char if handled with care. 600 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order archivist | — | Ash-Frame | diplomacy | — |

**Text:**

> The archivist shows you a single charred page under glass and gives you an ash-frame to carry the rest in. "The Monarchs burned the Aphelion treatise a generation ago — but Tartarian ink does not truly burn, it only chars. The words are still in the ash. It was last seen at the purge-site, Nimari."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Nimari | — | Ash-Frame | Framed Char-Block | investigate | — |

**Text:**

> At the Nimari purge-site you dig out the old fire-pit and find the Codex where it fell — charred black but whole, the Monarchs' torch unable to finish what the ink would not allow. You slide the ash-frame under it before it can break its own back.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Nimari | — | Framed Char-Block | Ashen Codex | boss | — |

**Text:**

> Reading the Ashen Codex without crumbling it takes a careful working — you hold the char together with Aether while the shadow-words rise off it. Something drawn by the disturbed site tests you mid-reading. You see it off and keep the pages whole.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order archivist | — | — | auto | — |

**Text:**

> You bring the Ashen Codex to the archivist, who receives it like a rescued prisoner. She reads the shadow-words the Monarchs died to erase and looks up, shaken. "This is why they burned it," she says. "Not what it teaches. What it proves about them. Some fires are confessions."

**Checklist:**

- 

---

## The Tuning Fork of Asgardar

- **id:** `mystery_tuning_fork_asgardar`
- **faction:** `stone_builders`
- **poster sends you to:** Asgardar
- **reward:** 550 TC, 9 rep, Aetheric Shard, trophy: Resonance Fork
- **min rep:** 1

> **POSTER —** The Stone Builders seek a Tartarian resonance-tool from Asgardar — a "tuning fork" that reads the true note of any stone, key to their whole craft. 550 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-master | — | Lodge-Master's Common Fork | diplomacy | — |

**Text:**

> The lodge-master rings a common fork and frowns, then gives it to you. "Ours are guesses. The Tartarians had a true one — strike it to a wall and it sings back the stone's real health. One lies in the Asgardar ruins. Take mine to tell them apart. With the true one we stop guessing; without it we keep burying apprentices."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | — | Lodge-Master's Common Fork | Proven Fork-Reading | investigate | — |

**Text:**

> In the Asgardar ruins you find the Resonance Fork in a collapsed workshop, and prove it against the common one at once — struck to the leaning wall beside you, the true fork sings a cracked, dying note where yours says nothing at all. You step back a breath before the wall answers the note by falling.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | — | Proven Fork-Reading | Resonance Fork | boss | — |

**Text:**

> The ruin does not want to give up its tool. The collapse the Fork warned of spreads, the gallery starts coming down in slabs, and something boils out of the opening stone. You clear your way and carry the Fork out ahead of the failing roof.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-master | — | — | auto | — |

**Text:**

> You lay the Resonance Fork on the lodge bench and the lodge-master strikes it to the wall. It sings back true and clear, and every mason in the room leans in to hear a building tell the truth for the first time. "We have been deaf," he says. "You gave us ears. Nothing we raise now will be a guess."

**Checklist:**

- 

---

## The Pale Signal

- **id:** `mystery_pale_signal`
- **reward:** 700 TC, 10 rep, Aetheric Cloth, trophy: Signal-Core
- **min rep:** 0

> **POSTER —** An unaffiliated buyer will pay well for the source of the "Pale Signal" — a faint, repeating Aetheric pulse rising from the Mud Flood Nexus that no one can explain. 700 TC.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Parley Ground | the hooded buyer | — | Beat-Counter | diplomacy | — |

**Text:**

> The buyer keeps their hood up and pushes a beat-counter across the table. "Something at the Mud Flood Nexus is pulsing — faint, patient, on a beat. Not weather. Not a beast. A signal. It has repeated for months and no faction will admit to hearing it. Count it, then bring me its source. I only want to know what is calling, and to whom."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Flood Nexus | — | Beat-Counter | The Counted Sequence | investigate | — |

**Text:**

> You track the Pale Signal into the Nexus' outer galleries and it strengthens as you descend, resolving out of noise into pattern — a sequence, deliberate, old. The counter writes it down. It is not decaying like a broken machine. It is being kept up. On purpose.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Flood Nexus | — | The Counted Sequence | Signal-Core | stealth | — |

**Text:**

> The source is warded behind a live Aether-field that reads intruders. You slip through on the pulse's own rhythm, off the counted sequence — the ward keyed, you realise, to let the signal OUT and nothing in. Someone built this to be heard and never found. In the dark at the end of it, a single Tartarian core, still transmitting. You lift it.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Parley Ground | the hooded buyer | Signal-Core | — | boss | — |

**Text:**

> The buyer takes the Signal-Core, holds it to the light, and goes very quiet. "It was still calling," they say. "After everything. It never stopped calling home." They do not tell you whose home. You are not sure they know.

**Checklist:**

- 

---

# Faction Storylines

## The Red Tower's Mouth

- **id:** `story_order_red_tower`
- **faction:** `forgotten_order`
- **poster sends you to:** Red Tower of Nimari
- **reward:** 1500 TC, 25 rep, Runic Mantle
- **min rep:** 5

> **POSTER —** Vesryn of Varakush wants you to gather every Fragment of the Red Tower you can find and bring them to the Order. Multi-step contract. 1500 TC and faction standing on completion.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | Vesryn | — | Vesryn's Fragment Map | diplomacy | — |

**Text:**

> Vesryn spreads a map of the south plains and marks seven crosses on it. "We need every Fragment of the Red Tower we can put hands on — there are at least seven scattered across the silt belt. Work the map in order. Bring them here as you go or bring them all at once, but bring them."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Great Tartary Plains | — | Vesryn's Fragment Map | First Fragment | investigate | — |

**Text:**

> The first cross puts you out on the Great Tartary Plains, and the Fragment is where Vesryn promised — a hexagonal piece of cooled Tartarian iron, still warm to the hand. You pocket it and read the next cross off the map.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Cradle of Dusk | the caravan survivor | First Fragment | Second Fragment | diplomacy | — |

**Text:**

> The second sits in an old Reclaimer caravan-wreck out in the Cradle, and the wreck has a survivor who considers it hers. You haggle over the price of taking it, and settle it without anyone reaching for anything.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Second Fragment | Courier's Route-Slip | stealth | — |

**Text:**

> A Mud Monarch courier is working the same map from the other end. You go still among the Pillars and let them pass within twenty feet, and when they are gone you lift the route-slip they dropped changing horses. Now you know which crosses they have already taken.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Courier's Route-Slip | Third Fragment | stealth | — |

**Text:**

> The third Fragment lies inside a Sentinel patrol zone, and the route-slip tells you the courier turned back rather than try it. You time the loop instead — three passes to learn it, one to walk it — and come out with the piece and all your fingers.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Third Fragment | Fourth and Fifth Fragments | investigate | — |

**Text:**

> Fourth and fifth come out of a single buried vault under the Giant Vault's floor, packed together the way a smith stacks offcuts. The locking glyphs nearly take your hand off on the way in. You leave with both.

**Checklist:**

- 

### Stage 7 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Endless Stair | — | Fourth and Fifth Fragments | Sixth Fragment | stealth | — |

**Text:**

> The sixth is under an Aether Golem on the Endless Stair's lower landing. You do not fight it — you sit in the dark for two hours until it wanders off its patch, then dig where it had been standing and are gone before it comes back.

**Checklist:**

- 

### Stage 8 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Sixth Fragment | Seventh Fragment | diplomacy | — |

**Text:**

> The seventh is buried in a Mud Spirit's nesting ground out in the Seas. You do not dig first and apologise after — you talk the lesser spirits into a passage, and they open one grudgingly, and you take only the iron.

**Checklist:**

- 

### Stage 9 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | Vesryn | Seventh Fragment | — | boss | — |

**Text:**

> You lay all seven on Vesryn's table and the two of you fit them together. They join — partially, along edges that were machined to join. Vesryn was right, and worse than right: something is being rebuilt, and someone else is collecting the same pieces.

**Checklist:**

- 

---

## The Path of the True Tartarian

- **id:** `story_tartarian_ascension`
- **faction:** `true_tartarians`
- **poster sends you to:** The Sunken Enclave
- **reward:** 1200 TC, 30 rep, Tartarian Stoneband
- **min rep:** 10

> **POSTER —** Korash of the Deep offers a full True Tartarian ascension trial. Seven steps. Pass them all and the enclave will treat you as one of their own. 1200 TC and major rep.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | Korash of the Deep | — | Korash's Trial-Token | diplomacy | — |

**Text:**

> Korash motions you to sit and puts a trial-token in your hand. "You have shown enough. The trial is seven steps and they are not all here — the pilgrimage, the rune, the dive. Refuse any and walk away. Complete them all and the enclave will know you as kin."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | Korash's Trial-Token | Pilgrimage Mark | escape | — |

**Text:**

> Step one — the silent pilgrimage. You walk a buried road under the Cities without speaking and without resting, for the better part of a day, and you come up the far end with your mouth dry and the token still in your fist.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | — | Pilgrimage Mark | Chalked Name | cast | — |

**Text:**

> Step two — the rune trial, at the old ritual seat. A Tartarian glyph is set into the wall at Karok-Sa. You must read it and trace your own name beneath it in Aetheric chalk, in a hand steady enough that the wall accepts it.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Chalked Name | Elders' Sunken Charge | investigate | — |

**Text:**

> Step three — the dive. The Cathedral's flooded antechamber, one torch, and the dark. You swim down to where the elders left their charge a generation ago and bring it back up without opening it.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | Elders' Sunken Charge | Night-Watch Tally | stealth | — |

**Text:**

> Step four — the standing watch. You hold the night-shift at the enclave's mouth, alone and unlit. Twice something comes near enough to hear. You do not call for help either time, and in the morning you hand over a tally of what passed.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Tartarian Outskirts | — | Night-Watch Tally | Fast-Keeper's Token | escape | — |

**Text:**

> Step five — the fast. A full day out on the Outskirts with no rations and no shelter to sit in. The hunger sharpens you rather than emptying you, which is the whole point of it. Korash rides out once, gives you water, and says nothing.

**Checklist:**

- 

### Stage 7 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | Fast-Keeper's Token | Sparring Honours | attack_provoke | — |

**Text:**

> Step six — the duel. A young Tartarian calls you out for a non-lethal match in front of the whole enclave. You take it seriously, which is the courtesy owed, and you both walk away with honours and a great deal of bruising.

**Checklist:**

- 

### Stage 8 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | Korash of the Deep | Sparring Honours | — | boss | — |

**Text:**

> Step seven — the oath. Korash and three elders stand witness. You say the words. They repeat them back to you, which is the part nobody warns you about. It is done, and you are kin.

**Checklist:**

- 

---

## The Reclaimer Relic Run

- **id:** `story_reclaimer_relic_run`
- **faction:** `reclaimers_guild`
- **poster sends you to:** The Buried Cities
- **reward:** 1400 TC, 24 rep, Explorer's Aetheric Greaves
- **min rep:** 5

> **POSTER —** Reclaimers Guild Speaker offers a five-stop relic run — five hidden caches, five takes, no questions. 1400 TC, Guild standing, and a permanent slot on the haul board.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimers Guild Speaker | — | Sealed Five-Mark Map | diplomacy | — |

**Text:**

> The Speaker hands you a sealed map with five marks on it. "Each is a relic cache. Hit them in the order they're numbered — they're spread wide on purpose. You keep nothing of the haul beyond a finder's cut, but you walk out a name in the Guild."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Buried Cities | — | Sealed Five-Mark Map | First Haul | investigate | — |

**Text:**

> First mark — a half-buried Tartarian utility room under the Buried Cities. You crack the lock-glyph the slow way, because the fast way is how Reclaimers lose hands, and pull the haul out whole.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | First Haul | Second Haul | stealth | — |

**Text:**

> Second mark, down in Voronov — and a Guild rival has been here inside the week. You read their tracks, judge they will not be back before dark, and work quietly enough that they will not know anyone was.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Second Haul | Third Haul | stealth | — |

**Text:**

> Third mark — a Sentinel holds the approach among the Pillars, still walking a loop nobody has cancelled. You time it again, the way you did the first one, and slip the cache out between passes.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Mud Seas | — | Third Haul | Fourth Haul | diplomacy | — |

**Text:**

> Fourth mark — a Mud Spirit has nested directly on top of the cache out in the Seas. You talk it down to a small offering of rations, which costs you a day's food and no blood at all, and it lets you in.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Samarran | — | Fourth Haul | Fifth Haul | investigate | — |

**Text:**

> Fifth mark, at Samarran — and the Speaker did not mention this one is mid-collapse. You dig fast, with the ceiling talking the whole time, and you are out with the haul before it finishes the sentence.

**Checklist:**

- 

### Stage 7 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimers Guild Speaker | Fifth Haul | — | boss | — |

**Text:**

> You put all five hauls on the Speaker's table. They count them once, look at you once, and nod — which from a Guild Speaker is a paragraph.

**Checklist:**

- 

---

## Silence Across the Border

- **id:** `story_monarch_silence`
- **faction:** `mud_monarchs`
- **reward:** 1300 TC, 25 rep, Mud Monarch Seal
- **min rep:** 5

> **POSTER —** Dr. Lucius Kincaid will pay for a six-stop silencing run — six people who have been talking too loudly about Tartaria. Discretion required. 1300 TC. Monarch standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | Dr. Lucius Kincaid | — | Kincaid's List of Six | diplomacy | — |

**Text:**

> Kincaid slides a list of six names across a polished table. "All of these have been writing about Tartaria where they should not. We do not require them dead. We require them quiet. They are scattered — the list has where. Means are your business."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the talkative Reclaimer | Kincaid's List of Six | A Reasonable Man's Note | diplomacy | — |

**Text:**

> First name — a Reclaimer at the Stake who has been talking to Order scholars over drink. You make a compelling case for keeping his finds to himself, and he takes it, and writes you a note saying so because he wants it on record that he was reasonable.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | A Reasonable Man's Note | The Journalist's Draft | stealth | — |

**Text:**

> Second name — an Unknowing Masses journalist working the Market with a finished draft in her satchel. You take the draft and leave the satchel, which buys a week before she is certain rather than an hour.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | — | The Journalist's Draft | Salted Expedition Notes | investigate | — |

**Text:**

> Third name — a Forgotten Order scholar's apprentice at Varakush. You never approach him. You get at his next expedition's survey notes instead and salt them so gently that the site will simply read as barren, and he will believe it, and stop.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | Salted Expedition Notes | A Sympathiser's Confidence | diplomacy | — |

**Text:**

> Fourth name — a True Tartarian sympathiser down in the Enclave. You convince her you are one too, and she tells you things she should not, and gives you her confidence to carry, which is exactly what Kincaid wanted taken from her.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | — | A Sympathiser's Confidence | Intercepted Photographs | stealth | — |

**Text:**

> Fifth name — a Guild middleman at Ostragar selling photographs of buried sites by the dozen. You intercept his next courier on the river road and the photographs never arrive, and no one is hurt, and that is the whole trick of this work.

**Checklist:**

- 

### Stage 7 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Parley Ground | — | Intercepted Photographs | The Assistant's Effects | attack_provoke | — |

**Text:**

> Sixth and last — Kincaid's own former assistant, gone rogue and waiting for you at the Parley Ground. He expects you. He is not happy. It is the only name on the list that ends with anyone raising a hand.

**Checklist:**

- 

### Stage 8 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | Dr. Lucius Kincaid | The Assistant's Effects | — | boss | — |

**Text:**

> You return to Kincaid and lay out what you carried back from each name. He counts the items, looks at you once, and slides a heavy purse across the table. Six people are quiet. Five of them are also alive, which he does not remark on.

**Checklist:**

- 

---

## The Ledger of Silence

- **id:** `story_monarch_ledger_of_silence`
- **faction:** `mud_monarchs`
- **poster sends you to:** Ostragar
- **reward:** 1400 TC, 22 rep, Runic Mantle
- **min rep:** 5

> **POSTER —** A Mud Monarch factor at the Waystation needs a witness unmade before the Forgotten Order can copy what it saw. Discreet work. 1400 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | the Monarch factor | — | Factor's Name and Route | diplomacy | — |

**Text:**

> The factor does not look up from his ledger. "A Guardian stirred at Ostragar. A surveyor of the Order saw it wake and lived. His notes cannot reach Varakush. Nor can he." He slides you a name and a route. "Start at the relay-hut on the Ostragar road."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Ostragar | — | Factor's Name and Route | Empty Field-Book Case | investigate | — |

**Text:**

> You trace the surveyor to the relay-hut and find his field-book gone — copied already, into three fair hands riding for the Order. Only the empty case is left, and the copyist's ink still wet on the sill. The factor lied about the count, or did not know it.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Obsidian Pillars | — | Empty Field-Book Case | First Courier's Copy | stealth | — |

**Text:**

> You run the first courier down before the Obsidian Pillars and lift the copy off his saddle without waking him. One page is torn out — he kept a leaf back, insurance against his own masters. Careful man. Not careful enough.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | First Courier's Copy | Second Courier's Pages | diplomacy | — |

**Text:**

> The second courier turns out to be Guild, not Order — a Reclaimer who bought the pages to resell at the Market. Coin turns her without argument, and she throws in the thing you actually needed: the third rider is the surveyor himself, carrying the last leaf to Varakush in person.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | the Order surveyor | Second Courier's Pages | The Last Leaf | diplomacy | — |

**Text:**

> You catch the surveyor on the Varakush approach and he does not run. "I saw it open its eyes," he says. "You can take my book. You cannot take that I saw it." He offers you the last leaf himself — and a choice the factor never mentioned.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Monarch's Waystation | the Monarch factor | The Last Leaf | — | boss | — |

**Text:**

> You return to the Waystation with every copy. The factor burns them one page at a time and pays you in silence. "The world sleeps a little longer," he says. Whether that is mercy or a leash, he does not say, and you do not ask.

**Checklist:**

- 

---

## The Descent to Karok-Sa

- **id:** `story_truetart_descent_karoksa`
- **faction:** `true_tartarians`
- **poster sends you to:** Karok-Sa
- **reward:** 1600 TC, 26 rep, Aetheric Cloth
- **min rep:** 5

> **POSTER —** The True Tartarians will pay a surface-walker to escort a reconsecration party down into buried Karok-Sa and see it done. 1600 TC and deep standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | the enclave-mother | — | Enclave-Mother's Ash Mark | diplomacy | — |

**Text:**

> The enclave-mother marks a shaft on your palm in ash. "Karok-Sa held a Giant-shrine before the Flood took it. The Aether there has gone sour and the way is fouled. Walk our pilgrims down, keep them breathing, and light the shrine again."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | — | Enclave-Mother's Ash Mark | The Holding Seam | investigate | — |

**Text:**

> The upper stair of Karok-Sa is choked with silt-glass and old flood-wrack. You read the safe line the way the pilgrims read prayer — one wrong slab is a drop into black water — and you find the seam that holds and chalk it for the ones behind you.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | — | The Holding Seam | A Corridor of Clean Air | cast | — |

**Text:**

> Halfway down the air turns to poison — Aether gone rancid, a haze that stops breath. The pilgrims falter on your chalked line. You draw the bad Aether off with a working and hold open a corridor of clean air one lungful wide, and walk them through it.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | — | A Corridor of Clean Air | The Nave, Cleared | attack_provoke | Shifting Shade ×1 |

**Text:**

> Something in the drowned nave has been alone a very long time. A Shifting Shade, born of the soured field, walks out of a wall between you and the shrine, and the faithful are behind you with nowhere left to go.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | the eldest pilgrim | The Nave, Cleared | The Relighting-Word | diplomacy | — |

**Text:**

> At the shrine the eldest pilgrim breaks — this was her birth-city, drowned when she was a child. She will not leave the water's edge. You talk her back from it, and she gives you the relighting-word her mother taught her, which she has carried sixty years to say here.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Karok-Sa | — | The Relighting-Word | — | boss | — |

**Text:**

> You speak the word and the shrine takes light — and beneath it a Mud Golem the size of the nave opens one eye, a Giant-Watch construct that has waited in the dark for someone to wake it. The pilgrims kneel. You do not have that luxury.

**Checklist:**

- 

### Stage 7 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | the enclave-mother | — | — | auto | — |

**Text:**

> The construct stills, judged you not an enemy, and folds back into the dark. The shrine burns steady behind you as the pilgrims climb home singing. Back at the Enclave the enclave-mother washes the ash from your palm herself. "You are one of the deep now."

**Checklist:**

- 

---

## Blood of the Aetherborn

- **id:** `story_dynasty_blood_aetherborn`
- **faction:** `eternal_dynasty`
- **poster sends you to:** Sinking Cathedral
- **reward:** 1800 TC, 28 rep, Runic Mantle
- **min rep:** 6

> **POSTER —** A Dynasty proctor at the Border Post seeks proof of a claimant's Aetherborn bloodline — a relic only the pure may touch and live. 1800 TC and standing for a clean result.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the Dynasty proctor | — | Proctor's Fetch-Order | diplomacy | — |

**Text:**

> The proctor speaks of bloodlines the way a butcher speaks of cuts. "A claimant petitions the Dynasty. Before he is raised or discarded, his blood must be tested against the Vein-Reliquary in the Sinking Cathedral. Fetch it. The relic decides; we merely watch."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | Proctor's Fetch-Order | The Drowned Party's Seal | investigate | — |

**Text:**

> The Sinking Cathedral takes a hand-span of water an hour. You find the reliquary vault by following the Aether — the relic sings to the flooded stone. The last party sent for it is here too, drowned at the vault door with Dynasty seals still on their coats. You take one.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sinking Cathedral | — | The Drowned Party's Seal | Vein-Reliquary | escape | — |

**Text:**

> The vault seal breaks and the Cathedral answers by dropping a floor. You take the Vein-Reliquary and run the falling stair ahead of the flood, water at your heels the whole black length of it, and come out into the air with the relic dry.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Parley Ground | the claimant | Vein-Reliquary | The Claimant's Trust | diplomacy | — |

**Text:**

> The claimant finds you at the Parley Ground before the Dynasty does — a frightened young man who has read what the relic does to the impure. "It burns the false to ash," he says. "I do not know what I am. Test me here, away from them, and tell me the truth before they make it a spectacle."

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | — | The Claimant's Trust | — | boss | — |

**Text:**

> At the Border Post the proctor lays the claimant's hand to the Vein-Reliquary before the assembled court — and the relic wakes wrong, an Aetheric Apparition tearing loose from the old blood inside it, judging every soul in the room impure at once.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the Dynasty proctor | — | — | auto | — |

**Text:**

> You put the Apparition down before it can render its verdict on the court. The proctor pays you and records the claimant as "inconclusive" — a word that will follow the young man to his grave, but leaves him with one. It is the most mercy the Dynasty knows how to file.

**Checklist:**

- 

---

## The Giant-Watch Vigil

- **id:** `story_servants_giant_watch_vigil`
- **faction:** `servants_of_giants`
- **poster sends you to:** The Giant Vault
- **reward:** 1500 TC, 24 rep, Aetheric Cloth
- **min rep:** 5

> **POSTER —** The Servants of the Giants have felt the ground breathe at the Giant Vault. They will pay a steady hand to stand the vigil and read what stirs. 1500 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Giant-Watch Shrine | the vigil-keeper | — | Vigil-Keeper's Ear-Stone | diplomacy | — |

**Text:**

> The vigil-keeper presses your ear to the shrine stone. Far below, a slow tremor, like breath. "A Giant turns in its sleep beneath the Vault," she says. "The order splits over it — wake it, or let it dream. Go down and read the truth of it, and bring the reading back to me." She gives you her own ear-stone to read it with.

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Vigil-Keeper's Ear-Stone | The Tremor Reading | investigate | — |

**Text:**

> You descend to the Vault door and read the tremor at its source. It is no Giant — it is the Aetheric field feeding a dormant Guardian below, cycling toward a wake it was never meant to reach. The faithful have mistaken a machine's hunger for a god's breath. You write it down exactly as the stone gives it.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Giant-Watch Shrine | the vigil-keeper | The Tremor Reading | The Keeper's Seal | diplomacy | — |

**Text:**

> You climb back into a schism. The zealots want the Vault flung open to greet their god; the elders want it sealed forever. You read them the tremor and half of them call you a liar sent by the Order — but you talk the vigil-keeper into hearing the rest, and she gives you her seal to move inside the Vault.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | The Keeper's Seal | Hand on the Core-Cycle Valve | stealth | — |

**Text:**

> The zealots move to break the outer seal that night regardless. You go down ahead of their torches to reach the Guardian's core-cycle first — one closing valve between the faithful and a waking machine, and you have to have your hand on it before they arrive.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Giant Vault | — | Hand on the Core-Cycle Valve | — | boss | — |

**Text:**

> You reach the valve as the seal gives. The dormant Guardian — a Steam Walker grown vast on a century of stray Aether — hauls upright in the dark, and the zealots pour in singing to meet it, mistaking its rise for rapture.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Giant-Watch Shrine | the vigil-keeper | — | — | auto | — |

**Text:**

> You still the Guardian and the singing stops. The vigil-keeper seals the Vault with her own hands and names you Watch-Kin at the shrine that evening. "It was not our god," she tells the shaken faithful. "But something down there kept our god's house. That is worth a vigil still."

**Checklist:**

- 

---

## Scripture in Stone

- **id:** `story_builders_scripture_in_stone`
- **faction:** `stone_builders`
- **poster sends you to:** Grand Spire of Etheria
- **reward:** 1500 TC, 22 rep, Runic Mantle
- **min rep:** 4

> **POSTER —** A Stone Builder lodge-master at the Survey Camp needs the Architectural Sorcery of the Grand Spire read before his lodge cracks apart under it. 1500 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-master | — | The Lodge's Faulty Rubbing | diplomacy | — |

**Text:**

> The lodge-master unrolls a rubbing taken from the Grand Spire of Etheria. "The Tartarians wrote their engineering into their stone — load, Aether and prayer in one script. We copied this passage into our lodge wall and now the lodge groans at night. Take the rubbing back to the original and read it properly before it comes down on us."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Grand Spire of Etheria | — | The Lodge's Faulty Rubbing | The Miscopied Glyph | investigate | — |

**Text:**

> At the Spire you find the source passage and hold the rubbing against it. The Builders' copy is wrong by exactly one glyph — a load-line read as a prayer-line. The Spire's version routes the Aether down and out. The lodge's routes it in, and up, into a room full of people.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Grand Spire of Etheria | — | The Miscopied Glyph | The True Glyph | cast | — |

**Text:**

> The Spire will not simply hand over its reading. The passage is live — Architectural Sorcery still flowing through it after a thousand years. You match the working, hold the flow steady, and copy the true glyph while the wall hums under your palm.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Grand Spire of Etheria | — | The True Glyph | The True Reading, Carried Clear | escape | — |

**Text:**

> The correction destabilises the ancient course. A pillar that has leaned since before the Flood finally chooses to fall, and the gallery goes with it. You take the true reading and clear the collapse a half-step ahead of the stone, which is the only margin the Spire offers anyone.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | — | The True Reading, Carried Clear | — | boss | — |

**Text:**

> You reach the lodge as the miswritten wall reaches its limit — the trapped Aether tearing loose as an Aetheric Salamander, all the stored heat of a bad translation given teeth, loose among the apprentices.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Builders' Survey Camp | the lodge-master | — | — | auto | — |

**Text:**

> You cut the true glyph into the lodge wall and the groaning stops. The lodge-master carves your name small among the founders. "Tartaria's buildings were scripture," he says, humbled. "We were reciting it wrong. You taught us to read a single verse. It was almost the end of us."

**Checklist:**

- 

---

## Sasha's Gambit

- **id:** `story_revivalist_sashas_gambit`
- **faction:** `tartarian_revivalists`
- **poster sends you to:** Aetheric Chamber
- **reward:** 2000 TC, 30 rep, Aetheric Cloth
- **min rep:** 6

> **POSTER —** Sasha Ironheart of the Revivalists wants a core-line at the Aetheric Chamber brought back to life — and she needs a blade willing to risk a Second Flood to do it. 2000 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Revivalist Field Camp | Sasha Ironheart | — | Sasha's Core-Line Order | diplomacy | — |

**Text:**

> Sasha Ironheart does not soften it. "Every other faction tinkers at the edges. I mean to switch Tartaria back on — one core-line at the Aetheric Chamber, reactivated. Yes, it could flood the world again. Doing nothing floods it slower." She signs the order and holds it out. "Are you a blade or a bystander?"

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Sasha's Core-Line Order | Three Cells' Conflicting Notes | investigate | — |

**Text:**

> You survey the Chamber's dead core-line. Three of Sasha's cells got here first and left notes in the dust — one warns the line will overload, one swears it will hold, one is simply a name and a date. You gather all three. The cells share a goal and not a method, and it shows.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Three Cells' Conflicting Notes | Unshot Passage to the Housing | stealth | — |

**Text:**

> A Forgotten Order team has come to sabotage the reactivation before it starts — moderates who think Sasha will drown them all. You slip past them to the core housing without a shot fired. Whether that was loyalty or doubt, you keep to yourself.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | Unshot Passage to the Housing | A Hand on the Cutoff | cast | — |

**Text:**

> The core-line wakes under your working, Aether roaring back into a channel dry for a century. It surges past every safe mark — the optimistic cell was wrong. You wrestle the flow toward the overload cell's cutoff, the one everybody else ignored, and get a hand on it.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| the Sentinel Ward | — | A Hand on the Cutoff | — | boss | — |

**Text:**

> The overloading line births a Guardian meant to bleed off exactly this — an Aetheric Apparition of pure surplus power, loosed to protect Tartaria from its own revival by killing whoever caused it. It comes for you and Sasha both.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Revivalist Field Camp | Sasha Ironheart | — | — | auto | — |

**Text:**

> You bring the Apparition down and hold the line a hair below flood. One core-line lives — a single lit window in a drowned house. Back at the camp Sasha looks at the reading and, for once, is quiet. "Not the world," she says. "Yet. But now they know it can be done. So do you."

**Checklist:**

- 

---

## The Highest Bidder

- **id:** `story_reclaimer_highest_bidder`
- **faction:** `reclaimers_guild`
- **poster sends you to:** The Hidden Market
- **reward:** 1700 TC, 24 rep, Runic Mantle
- **min rep:** 5

> **POSTER —** A Reclaimer broker at the Hidden Market needs a neutral blade to run a relic auction that three factions all mean to win by force. 1700 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Reclaimer's Stake | the Reclaimer broker | — | Auction Floor-Warrant | diplomacy | — |

**Text:**

> The broker taps a strongbox and writes you a floor-warrant. "One relic. A Guardian control-key — points a dormant construct at whatever you like. The Order, the Dynasty and the Monarchs all bid, at the Market, tomorrow. I need someone who owes none of them to run the floor and keep me breathing when the loser draws steel."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | Auction Floor-Warrant | The Bidders' Measure | investigate | — |

**Text:**

> You case the Market floor before the bell. All three bidders came heavy — Order sappers by the east stalls, a Dynasty duelist working the shadows, a Monarch factor with coin enough to buy the building. You count exits and note who stands where. None of them plans to lose an auction.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | The Bidders' Measure | The Tripled Bid | diplomacy | — |

**Text:**

> You open the floor and hold it with your voice alone, letting the bids climb while the room decides whether to be civilised. The Dynasty duelist tests you once, quietly. You cool it without a blade. The price triples and the broker starts breathing again.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | The Tripled Bid | The Strongbox | stealth | — |

**Text:**

> The Monarch factor moves to end the auction his way — a signal to torch the strongbox rather than let a rival hold the key. You have the box out from under his fire and into the broker's hands before the flames find the lock.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | — | The Strongbox | The Floor, Broken Clear | attack_provoke | — |

**Text:**

> With coin no longer able to settle it, the losers settle it the old way — the Order sappers and the Dynasty duelist turning on each other and on you across the burning floor. The broker cowers behind the box while you make a path to the door.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Hidden Market | the Reclaimer broker | The Floor, Broken Clear | — | boss | — |

**Text:**

> You break out with the broker and the box both intact. He pays you in the quiet after, hands shaking. "The winner gets the key tomorrow," he says. "You could take it tonight." The strongbox sits between you, and for one breath the aim of a Guardian is yours to set.

**Checklist:**

- 

---

## The Silence Protocol

- **id:** `story_architect_silence_protocol`
- **faction:** `conspiracy_architects`
- **poster sends you to:** Voronov
- **reward:** 1600 TC, 24 rep, Runic Mantle
- **min rep:** 5

> **POSTER —** A Conspiracy Architect handler needs a leak at Voronov closed before the Unknowing Masses learn what sleeps under their city. Total discretion. 1600 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | the Architect handler | — | The Protocol Order | diplomacy | — |

**Text:**

> The handler speaks in the flat voice of someone who has done this before, and gives you the order in writing, which they never do. "A Voronov schoolmaster found a Tartarian relay under his town and started teaching from it. Children are drawing Aether-glyphs in their primers. The Protocol is simple: the lesson stops. How, we leave to you."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | The Protocol Order | A Child's Correct Primer | investigate | — |

**Text:**

> In Voronov you find the relay exactly as reported — and the schoolmaster is no zealot, just a curious man who found a wonder and could not keep it to himself. You lift a primer off a desk. The glyphs a nine-year-old has drawn in it are, God help you, correct.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | the schoolmaster | A Child's Correct Primer | What the Schoolmaster Knows | diplomacy | — |

**Text:**

> You could burn the relay and the man with it — the Protocol's usual reading. Instead you sit with the schoolmaster and learn what he actually knows. Less than the handler fears. Enough to matter. He is not afraid of you, and that is the hardest part of the evening.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | What the Schoolmaster Knows | The Relay Core | stealth | — |

**Text:**

> A Monarch cutter has also come for the leak — the Architects' patrons prefer their silences permanent. You reach the relay ahead of the knife and pull its core, leaving the schoolmaster a dead machine and a live pulse, which is the difference between a Protocol and a murder.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Voronov | — | The Relay Core | — | boss | — |

**Text:**

> The pulled core does not want to die quiet — it discharges its stored century of Aether as a Shifting Shade in the empty schoolhouse, and the children are still filing out. You put yourself between them and it.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Architect's Blind | the Architect handler | — | — | auto | — |

**Text:**

> You bring the handler a dead relay and a report that reads "contained." What you left in Voronov — a frightened schoolmaster, a town of children who saw a wonder and were told to forget it — is the part of the Protocol that has no line on the form. You wrote that line yourself.

**Checklist:**

- 

---

## The Drowned Library

- **id:** `story_order_drowned_library`
- **faction:** `forgotten_order`
- **poster sends you to:** The Sunken Enclave
- **reward:** 1800 TC, 26 rep, Aetheric Cloth
- **min rep:** 6

> **POSTER —** Vesryn of the Forgotten Order seeks a scholar to recover the Aetheric treatises lost in the flooding of the Sunken Enclave — the Order's deepest archive. 1800 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | Vesryn | — | Vesryn's Case-Straps | diplomacy | — |

**Text:**

> Vesryn lays a hand on an empty shelf and gives you a set of case-straps. "The Sunken Enclave held every treatise we ever recovered. When it flooded we saved the readers, not the reading. Aether-proof cases keep the pages down there yet. Bring back what you can — and choose well, because you cannot carry it all."

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | Vesryn's Case-Straps | The Intact Catalogue | investigate | — |

**Text:**

> You dive the Enclave and find the stacks by lamplight, cases glinting in the silt. The catalogue is intact — you can read what each case holds before you spend your air lifting it. Some are cures. Some are weapons. Some are only beautiful.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | The Intact Catalogue | The Founder's Case | cast | — |

**Text:**

> The deepest stack is warded — Tartarian ink that eats light and lungs both. You hold a working over your own breath and read past the ward to a case marked in the Enclave founder's own hand: the treatise on the cores themselves.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | The Founder's Case | The Chosen Salvage | escape | — |

**Text:**

> Lifting the founder's case wakes the Enclave's failsafe — the flood meant to keep exactly this from leaving. The water rises to reclaim its library. You run the drowning stacks with your chosen cases, air and archive both running out together.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| The Sunken Enclave | — | The Chosen Salvage | — | boss | Aetheric Ooze ×1 |

**Text:**

> At the Enclave mouth an Aetheric Ooze — grown fat on a century of dissolved ink and lost thought — bars the only stair. It has read, in its way, everything that dissolved into it. There is no way up that does not go through the sum of the Order's losses.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Varakush | Vesryn | — | — | auto | — |

**Text:**

> You lay your salvage on Vesryn's table — a handful of what once filled a hall. He reads the founder's treatise on the cores and goes very still. "This changes what we thought we knew about the Flood," he says. "You chose these pages. You should be here when we learn what they mean."

**Checklist:**

- 

---

## The Purge at Asgardar

- **id:** `story_dynasty_purge_asgardar`
- **faction:** `eternal_dynasty`
- **poster sends you to:** Asgardar
- **reward:** 1900 TC, 28 rep, Runic Mantle
- **min rep:** 7

> **POSTER —** A Dynasty enforcer at Asgardar needs a discreet hand to help "reconcile" a bloodline that has grown impure — quietly, before the court notices. 1900 TC and standing.

### Stage 1 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the Dynasty enforcer | — | The Enforcer's Retirement Order | diplomacy | — |

**Text:**

> The enforcer will not say the word "kill," and signs the order without reading it back. "A cadet branch at Asgardar has thinned. Their blood no longer reads pure. The court would spend them in the machines. I would rather retire them quietly, with their dignity. Help me do the merciful thing." He believes it.

**Checklist:**

- 

### Stage 2 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | — | The Enforcer's Retirement Order | The Cadet Branch's Assay | investigate | — |

**Text:**

> At Asgardar you find the cadet branch — an old woman and her grandchildren, tending a border-shrine and harming no one. You run the assay yourself. Their blood is "impure" by a fraction the machines would never notice. Someone at court wants their estate, and purity is the lever.

**Checklist:**

- 

### Stage 3 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | the cadet matriarch | The Cadet Branch's Assay | The True Bloodline Record | diplomacy | — |

**Text:**

> The matriarch knows exactly why you have come. "The Dynasty eats its own to prove it is still hungry," she says, unafraid. "You could carry back that we are already dead. Or you could carry the truth, and be spent for it." She hands you the estate's true bloodline record and lets you decide which.

**Checklist:**

- 

### Stage 4 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | — | The True Bloodline Record | Ground Between Them | stealth | — |

**Text:**

> The court's real agent — the one who wants the estate — moves to make the purge permanent before you can report otherwise. You reach the border-shrine ahead of his blades and put the cadet family behind you without a sound.

**Checklist:**

- 

### Stage 5 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Asgardar | — | Ground Between Them | — | boss | — |

**Text:**

> Cornered, the court's agent throws the shrine's own defence at you — a Vein-Reliquary Apparition roused to "test" the impure, aimed at the family it was built to protect. You stand between the Dynasty's cruelty and its excuse.

**Checklist:**

- 

### Stage 6 — (untyped)

| Where | Who | Needs | Gives | Verb | Spawns |
|---|---|---|---|---|---|
| Dynasty Border Post | the Dynasty enforcer | — | — | auto | — |

**Text:**

> You bring the enforcer the estate's true record and the court agent's severed scheme. He reads it, and for the first time his certainty cracks. "Retired quietly," he writes, and lets the cadet branch live. Whether you saved a family or just delayed a machine, you made the Dynasty blink. It is not nothing.

**Checklist:**

- 

---

# Faction Quests (single objective)

No stages — one objective, one reward. The prose still has to match the objective.

## Scrap Run

- **id:** `fq_reclaimers_starter` · **faction:** `reclaimers_guild`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Scrap Metal","quantity":3}`
- **reward:** `{"tc":35,"rep":6}`

> The board's standing bounty: the Guild always needs reforging stock. Bring in 3 Scrap Metal.

**Checklist:**

- 

## Field Samples

- **id:** `fq_order_starter` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Aether Residue","quantity":4}`
- **reward:** `{"tc":35,"rep":6}`

> A standing request pinned to the board: the Order studies raw Aether. Bring 4 Aether Residue.

**Checklist:**

- 

## Tribute of Mud

- **id:** `fq_monarchs_starter` · **faction:** `mud_monarchs`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Aether Mud","quantity":4}`
- **reward:** `{"tc":35,"rep":6}`

> The board posts the Monarchs' due: the mud is theirs by right. Bring 4 Aether Mud as tribute.

**Checklist:**

- 

## Grave Goods

- **id:** `fq_tartarians_starter` · **faction:** `true_tartarians`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Mud Fragment","quantity":5}`
- **reward:** `{"tc":30,"rep":6}`

> A quiet notice on the board: the Entombed honor their dead with offerings. Bring 5 Mud Fragment.

**Checklist:**

- 

## Kindling for the Vigil

- **id:** `fq_servants_starter` · **faction:** `servants_of_giants`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Stick","quantity":6}`
- **reward:** `{"tc":30,"rep":6}`

> The board's standing call: the vigil fires must never die. Bring 6 Stick for the watch.

**Checklist:**

- 

## The Dynasty's Banners

- **id:** `fq_dynasty_starter` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Patched Cloth","quantity":4}`
- **reward:** `{"tc":35,"rep":6}`

> A formal posting on the board: the empire is dressed in its colors. Bring 4 Patched Cloth for banners.

**Checklist:**

- 

## Dead Drops

- **id:** `fq_architects_starter` · **faction:** `conspiracy_architects`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Small Rock","quantity":5}`
- **reward:** `{"tc":30,"rep":6}`

> An unsigned note on the board: mark the safe routes. Bring 5 Small Rock for the cairns.

**Checklist:**

- 

## Quarry Quota

- **id:** `fq_builders_starter` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Big Rock","quantity":4}`
- **reward:** `{"tc":35,"rep":6}`

> The board's work-order: the Builders rebuild in stone. Bring 4 Big Rock from the field.

**Checklist:**

- 

## Shrouds for the Faithful

- **id:** `fq_revivalists_starter` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Spider Silk","quantity":4}`
- **reward:** `{"tc":35,"rep":6}`

> A pilgrim's notice on the board: the relics must be wrapped and carried. Bring 4 Spider Silk.

**Checklist:**

- 

## Salvage the buried lens

- **id:** `fq_order_relic` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":80,"rep":10}`

> Varakush has heard of a Relic Seeker's Lens half-buried in the Outskirts. Recover it.

**Checklist:**

- 

## Field a scholar

- **id:** `fq_order_field` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":60,"rep":8}`

> Travel to two new locations and bring back what you saw.

**Checklist:**

- 

## Run the haul

- **id:** `fq_reclaimers_haul` · **faction:** `reclaimers_guild`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":40,"rep":8}`

> The Guild needs 100 TC worth of relic salvage. Deliver, no questions asked.

**Checklist:**

- 

## Pinch from the Monarchs

- **id:** `fq_reclaimers_pinch` · **faction:** `reclaimers_guild`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":12}`

> Steal something from a Mud Monarchs vendor without being caught.

**Checklist:**

- 

## Walk the buried road

- **id:** `fq_tartarians_pilgrimage` · **faction:** `true_tartarians`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":60,"rep":10}`

> Make a pilgrimage to a buried capital — every True Tartarian who matters has done it.

**Checklist:**

- 

## Cut down a rare beast

- **id:** `fq_tartarians_giant` · **faction:** `true_tartarians`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":15}`

> The enclave hears you. Prove you fight like one of them.

**Checklist:**

- 

## Silence a rediscoverer

- **id:** `fq_monarchs_silence` · **faction:** `mud_monarchs`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":80,"rep":12}`

> Someone has been talking about Tartaria where they should not. End the conversation.

**Checklist:**

- 

## Tribute at the Vault

- **id:** `fq_servants_tribute` · **faction:** `servants_of_giants`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":50,"rep":8}`

> Walk the road to the Giant Vault and leave an offering at its threshold. The Giants are sleeping — the Servants ask only that we keep the path warm.

**Checklist:**

- 

## Reclaim a Dynasty seal

- **id:** `fq_dynasty_seal` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":10}`

> An oath-stone bearing the Eternal line's seal was carried off into the ruins. Bring it home.

**Checklist:**

- 

## Silence a pretender

- **id:** `fq_dynasty_pretender` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":12}`

> A rival claimant is raising a banner against the Eternal Dynasty. End it before it spreads.

**Checklist:**

- 

## Clear the unstable works

- **id:** `fq_builders_survey` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":10}`

> A dig site is crawling with reactivated constructs. The Builders can't survey it until it's quiet.

**Checklist:**

- 

## Recover a regulator core

- **id:** `fq_builders_regulator` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":12}`

> A pre-flood regulator core would let the Builders cycle a dead engine. It's guarded.

**Checklist:**

- 

## Burn an evidence trail

- **id:** `fq_architects_evidence` · **faction:** `conspiracy_architects`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":10}`

> Someone's been connecting dots the Architects buried. Erase what they found.

**Checklist:**

- 

## Sever a connected dot

- **id:** `fq_architects_informant` · **faction:** `conspiracy_architects`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":12}`

> An informant is one conversation from blowing the whole conspiracy. Cut the line.

**Checklist:**

- 

## Stage a recovery

- **id:** `fq_revivalists_dig` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":10}`

> The Revivalists need a clean, photogenic recovery. Clear the dig of anything that bites.

**Checklist:**

- 

## Bring back a front-page relic

- **id:** `fq_revivalists_headline` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":12}`

> One artifact the surface world can't ignore. Fight to it and carry it out.

**Checklist:**

- 

## Plant the Monarch standard

- **id:** `fq_monarchs_standard` · **faction:** `mud_monarchs`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":12}`

> A holdout refuses the Monarchs' writ. Make the standard fly over their ground.

**Checklist:**

- 

## Keep the vigil

- **id:** `fq_servants_vigil` · **faction:** `servants_of_giants`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":120,"rep":12}`

> Grave-robbers are disturbing a Giant's tomb. The Servants cannot allow it.

**Checklist:**

- 

## Earning the Guild's Rate

- **id:** `fq_reclaimers_guild_rapport` · **faction:** `reclaimers_guild`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> Anyone can sell the Guild scrap. A real partner brings something that matters. Lay a Golem Core on the bench and the quartermaster will cut you the members' rate — proper prices, coming and going.

**Checklist:**

- 

## The Order's Confidence

- **id:** `fq_forgotten_order_rapport` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Order deals openly only with those who prove their worth. Bring them a Golem Core — a working relic of the old machine-craft — and they'll open their real ledger to you.

**Checklist:**

- 

## A Seat at the Table

- **id:** `fq_mud_monarchs_rapport` · **faction:** `mud_monarchs`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Monarchs haggle hard with strangers. Hand their steward a Golem Core as tribute and you stop being a stranger — their stalls will deal you fair terms from then on.

**Checklist:**

- 

## Proven Worthy

- **id:** `fq_true_tartarians_rapport` · **faction:** `true_tartarians`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The True Tartarians trust few. Recover a Golem Core and lay it before them as proof you can be relied on — and their traders will price you as one of their own.

**Checklist:**

- 

## The Vigil's Favor

- **id:** `fq_servants_of_giants_rapport` · **faction:** `servants_of_giants`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Servants keep their best goods for the devoted. Offer a Golem Core to the vigil and they'll count you a friend — friends pay less, and are paid more.

**Checklist:**

- 

## The Magister's Regard

- **id:** `fq_eternal_dynasty_rapport` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Dynasty's magisters do not bargain with just anyone. Present a Golem Core and Caul Veyre will extend you the court's rate — a courtesy, for a courtesy.

**Checklist:**

- 

## Into the Circle

- **id:** `fq_conspiracy_architects_rapport` · **faction:** `conspiracy_architects`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Architects deal in secrets and rarely in favors. Bring the Cartographer a Golem Core and you buy your way into the inner circle — where the prices are the real ones.

**Checklist:**

- 

## Raised in Their Esteem

- **id:** `fq_stone_builders_rapport` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Builders respect what powers their works. Deliver a Golem Core to the foreman and they'll raise you in their books — better stock, better coin, both directions.

**Checklist:**

- 

## A Believer's Terms

- **id:** `fq_tartarian_revivalists_rapport` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **fetch:** `{"itemName":"Golem Core","quantity":1}`
- **reward:** `{"tc":60,"rep":8}`

> The Revivalists reserve their kindness for the faithful. Carry them a Golem Core, a spark of the old world reborn, and Sister Ashfall will see you dealt with generously.

**Checklist:**

- 

## The Survey Line

- **id:** `fq_stone_builders_survey_escort` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":8}`

> Three Stone Builder surveyors need to walk their chain-and-transit line home through open silt. The waste does not care about their instruments.

**Checklist:**

- 

## Pilgrims of the Buried Road

- **id:** `fq_forgotten_order_pilgrims_escort` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":80,"rep":8}`

> Two pilgrims of the Order mean to walk the buried country and arrive breathing. Faith stops mud, not blades.

**Checklist:**

- 

## The Envoy's Road

- **id:** `fq_eternal_dynasty_envoy_escort` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":90,"rep":10}`

> A Dynasty envoy travels with sealed terms and no sword arm. What the seal is worth, others have already guessed.

**Checklist:**

- 

## Scholars Into the Ruins

- **id:** `fq_tartarian_revivalists_scholars_escort` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":85,"rep":9}`

> Two Revivalist scholars want to read the old stones with their own eyes. The road between them and the stones has opinions.

**Checklist:**

- 

## Mason Crew to the Face

- **id:** `fq_stone_builders_mason_crew_escort` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":75,"rep":8}`

> Three masons with their tools and their opinions need walking to the new cut. The tools are the valuable part; they would disagree.

**Checklist:**

- 

## The Chainmen

- **id:** `fq_stone_builders_chainmen_escort` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":90,"rep":9}`

> Two chainmen carry the measure of a claim no one has filed yet. Plenty of people would like it to stay unfiled.

**Checklist:**

- 

## The Founder's Bones

- **id:** `fq_stone_builders_founders_bones_escort` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":160,"rep":12}`

> Two bearers carry a founder home to the stone that was promised. The Builders will not pay for a partial funeral.

**Checklist:**

- 

## Charter Signatories

- **id:** `fq_stone_builders_charter_signatories_escort` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":200,"rep":14}`

> Three signatories, one charter, and every rival with an interest in fewer signatures. The Builders need every hand that can hold a pen.

**Checklist:**

- 

## Novices on the Road

- **id:** `fq_forgotten_order_novices_escort` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":65,"rep":7}`

> Three novices walking their first circuit of the buried country. Their faith is new; the dangers are not.

**Checklist:**

- 

## The Almoners' Walk

- **id:** `fq_forgotten_order_almoners_escort` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":90,"rep":9}`

> Two almoners carry the Order’s giving out to the far camps. Coin draws knives; kindness draws crowds.

**Checklist:**

- 

## Relic Bearers

- **id:** `fq_forgotten_order_relic_bearers_escort` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":170,"rep":12}`

> Two bearers carry a thing the Order does not name in the open. What they carry cannot arrive at all if it does not arrive whole.

**Checklist:**

- 

## The Abbot's Confessor

- **id:** `fq_forgotten_order_confessor_escort` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":210,"rep":15}`

> One confessor, carrying every secret the Abbot could not keep. The Order would rather lose the road than lose the man.

**Checklist:**

- 

## Census Takers

- **id:** `fq_eternal_dynasty_census_takers_escort` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":80,"rep":8}`

> Three census takers with ledgers of who lives where. In the waste, being counted has enemies.

**Checklist:**

- 

## The Tax Ledgermen

- **id:** `fq_eternal_dynasty_ledgermen_escort` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":95,"rep":9}`

> Two ledgermen carrying the season’s assessments. No one loves them. The Dynasty pays for them anyway.

**Checklist:**

- 

## The Heir's Tutor

- **id:** `fq_eternal_dynasty_heirs_tutor_escort` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":180,"rep":13}`

> One tutor who knows what the heir must learn and what the heir must never learn. Both lists make him a target.

**Checklist:**

- 

## Treaty Scribes

- **id:** `fq_eternal_dynasty_treaty_scribes_escort` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":200,"rep":14}`

> Two scribes carrying a treaty that exists in exactly two copies. The Dynasty holds the other one.

**Checklist:**

- 

## Field Cataloguers

- **id:** `fq_tartarian_revivalists_cataloguers_escort` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":70,"rep":8}`

> Three cataloguers bound for a dig with empty crates and full notebooks. The road reads neither.

**Checklist:**

- 

## The Glyph Readers

- **id:** `fq_tartarian_revivalists_glyph_readers_escort` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":90,"rep":9}`

> Two readers who can hear the old stones. What they hear is worth more than what they carry.

**Checklist:**

- 

## Keepers of the First Stone

- **id:** `fq_tartarian_revivalists_first_stone_keepers_escort` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":175,"rep":12}`

> Two keepers carry a shard of the First Stone between shrines. The Revivalists count its arrival in whole shards only.

**Checklist:**

- 

## Sister Ashfall's Pilgrimage

- **id:** `fq_tartarian_revivalists_ashfall_pilgrimage_escort` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":220,"rep":15}`

> Sister Ashfall walks to the drowned shrine she has read about her whole life. The Revivalists will not accept a version of her that does not arrive.

**Checklist:**

- 

## The Stranded Courtier

- **id:** `fq_mud_monarchs_stranded_escort` · **faction:** `mud_monarchs`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A Monarch courtier separated from their retinue, silt to the knees and pride mostly intact.

**Checklist:**

- 

## The Stranded Pilgrim

- **id:** `fq_forgotten_order_stranded_escort` · **faction:** `forgotten_order`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> An Order pilgrim who walked a day past their water and two past their map.

**Checklist:**

- 

## The Stranded Reclaimer

- **id:** `fq_reclaimers_guild_stranded_escort` · **faction:** `reclaimers_guild`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A Reclaimer whose crew left with the haul and, apparently, the directions.

**Checklist:**

- 

## The Stranded Keeper

- **id:** `fq_true_tartarians_stranded_escort` · **faction:** `true_tartarians`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A True Tartarian keeper of old names, far from anyone who still speaks them.

**Checklist:**

- 

## The Stranded Clerk

- **id:** `fq_eternal_dynasty_stranded_escort` · **faction:** `eternal_dynasty`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A Dynasty clerk with a satchel of stamped papers and no idea which way the border sits.

**Checklist:**

- 

## The Stranded Watcher

- **id:** `fq_conspiracy_architects_stranded_escort` · **faction:** `conspiracy_architects`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> An Architect who watched the wrong road and got left on it.

**Checklist:**

- 

## The Stranded Servant

- **id:** `fq_servants_of_giants_stranded_escort` · **faction:** `servants_of_giants`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A Servant of the Giants, small under the sky and far from the bones they tend.

**Checklist:**

- 

## The Stranded Mason

- **id:** `fq_stone_builders_stranded_escort` · **faction:** `stone_builders`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A Stone Builders hand who lost their party in open silt and has been walking the wrong way for a day.

**Checklist:**

- 

## The Stranded Scholar

- **id:** `fq_tartarian_revivalists_stranded_escort` · **faction:** `tartarian_revivalists`
- **requires rep:** [object Object]
- **objective:** `` → —
- **reward:** `{"tc":55,"rep":5}`

> A Revivalist scholar who followed a glyph rubbing right off the edge of their own map.

**Checklist:**

- 

---

# Whisper Chains

These plant in a hub room, send you to a meet tile, and resolve there.

## Yulka and the Aetheric Discs

- **id:** `yulka_discs`
- **plants at:** `outpost_messhall` (chance 0.15)
- **hours:** [20,4]
- **meet tile offset:** dx [-1,1] · dy [2,3]
- **who you meet:** Yulka
- **fetch enemy:** Silt Thief
- **reward:** `{"item":{"name":"Aetheric Disc","qty":5,"rarity":"Uncommon","tags":["aether","currency"]},"tc":30}`
- **visible buttons:** accept: `TAKE THE JOB — FIVE DISCS ON RETURN` · buy: `BUY — 50 TC FOR 5 DISCS`

> **PLANT —** A pilgrim at the corner table cups her hands around a steaming mug and looks over at you. "South of here, past the gate. After the moon's up. Mud Dweller name of Yulka camps out there some nights — sells Aetheric Discs cheap. Don't ask where she gets them."
> **PLANT —** A Reclaimer one table over leans back: "If you need Aetheric Discs and don't want to pay Irma's mark-up, walk south after dark. Yulka. She's there some nights, gone others. Two tiles, three. You'll see her fire."
> **PLANT —** An off-duty Reclaimer presses a thumb into the salt of her plate. "Yulka. South. Night work. Aetheric Discs at half the going rate. If she's there." She doesn't say what to do if she's not.

> **pitch —** "Yulka," she says without asking your name. "If you came for Discs, sit. Five for fifty TC. If you came for trouble, keep walking." She watches your hands more than your face. "There's a third option. Some pendejo took half my stock — three tiles east, that direction." She nods at the dark. "Get them back, you keep five. I keep the rest. Either way, decide now. I've got somewhere to be by sunrise."
> **brief —** The thief is three tiles east of her fire. Your Contracts panel tracks the job — SET COURSE walks you there. Recover the Discs and bring them back to Yulka; five are yours on return.
> **acceptLine —** "Three tiles east." Yulka jerks her chin at the dark. "If you don't come back, I never knew your face." She turns to her tray and doesn't look up again.
> **sighting —** A hooded figure crouches over a small Aether-fire ahead. She watches you approach without standing. The fire's blue glow plays across a flat tin tray covered in palm-sized Aetheric Discs.
> **fetchSpawnLine —** A figure rises out of the silt ahead, hands inside a slick mud-cloak. The cloak's lining glints — Aetheric Discs, more than they should be carrying. The Silt Thief sees you, and decides you saw too much.
> **fetchRouteLabel —** the Silt Thief
> **meetRouteLabel —** Yulka's fire
> **returnRouteLabel —** Yulka (return the Discs)
> **recoverLine —** The Silt Thief drops. Under their cloak, wrapped in oilcloth, half-stamped Aetheric Discs spill across the silt. You scoop them into your own pack. Yulka's stock, recovered.
> **returnLine —** Yulka takes the bundle and counts without looking up. "Faster than I thought." She pulls five clean Discs from her own tray and stacks them in your palm, then drops thirty TC on top. "Don't come back. We're done."
> **leaveLine —** You step back from Yulka's fire. She watches you go without comment. By morning she'll be three tiles over, telling someone else the same story.
> **emptyHandsLine —** You return to Yulka's fire. She looks past you, looking for the bundle that isn't there. "Empty hands. Then this conversation's empty too." She turns back to her tray.
> **kicker —** AT THE FIRE
> **goodsShort —** Discs
> **goodsLong —** the Aetheric Discs
> **markNoun —** the thief
> **complete —** You returned Yulka her stolen stock. The debt is square — she told you not to come back.

**Checklist:**

- 

---

## Brasko's Buried Lenses

- **id:** `brasko_lenses`
- **plants at:** `outpost_workshop` (chance 0.12)
- **hours:** [21,5]
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Brasko
- **fetch enemy:** Lens Prier
- **reward:** `{"item":{"name":"Relic Seeker's Lens","qty":1,"rarity":"Uncommon","tags":[]},"tc":40}`
- **visible buttons:** accept: `TAKE THE JOB — A LENS AND 40 TC` · buy: `BUY — 60 TC FOR A LENS`

> **PLANT —** A grinder at the workshop bench doesn't look up from his wheel. "Brasko's out east after dark, if you deal in glass. Relic lenses, dug not bought. Two, three tiles past the wall. Follow the tapping."
> **PLANT —** Two apprentices argue over a cracked lens until one gives up: "Just buy off Brasko. East, night hours, tin lean-to. His glass is dug fresh and he's cheaper than any counter in here."

> **pitch —** "Brasko." He holds a lens up to the lamp and squints through it at you. "Ground glass, relic grade, dug by my own hands. Sixty TC buys you a seeker's lens." He sets it down with exaggerated care. "Or earn one. A prier worked my dig while I slept — west of here, dragging my best glass. Bring the crate back and the lens is yours, plus coin for the walk. Choose while the lamp's lit."
> **brief —** The prier is 2-3 tiles west of Brasko's lean-to. SET COURSE in the Contracts panel walks you there. Recover the lens crate and bring it back; a Relic Seeker's Lens and forty TC on return.
> **acceptLine —** "West. You'll hear him before you see him — glass doesn't travel quiet." Brasko turns his lamp down to a slit. "I'll be here. I'm always here."
> **sighting —** A tin lean-to hunches against a mound of turned earth, a shuttered lamp hung low inside. A broad man sits sorting lenses by lamplight, each one wiped, breathed on, wiped again.
> **fetchSpawnLine —** A stooped figure freezes over a padded crate, one hand still inside it. Wrapped glass clinks as he straightens. The Lens Prier weighs the crate against you, and keeps the crate.
> **fetchRouteLabel —** the Lens Prier
> **meetRouteLabel —** Brasko's lean-to
> **returnRouteLabel —** Brasko (return the lenses)
> **recoverLine —** The Lens Prier goes down and the crate hits the silt with a sound like money breaking. You check the padding — the glass held. Brasko's dig, boxed and owed.
> **returnLine —** Brasko opens the crate on his knees and touches every lens once, like counting children. "All here." He wraps one and pushes it into your hands with forty TC. "Dug that one the day the rain stopped. It's yours."
> **leaveLine —** You leave Brasko to his lamp and his lenses. He doesn't watch you go; the glass is better company.
> **emptyHandsLine —** Brasko looks at your empty hands, then back at his lamp. "The crate, or nothing. Glass doesn't take promises." He turns the lamp away from you.
> **kicker —** AT THE LEAN-TO
> **goodsShort —** lenses
> **goodsLong —** the lens crate
> **markNoun —** the prier
> **complete —** You brought Brasko's dig back from the prier who worked it. He paid in glass and coin and something like respect.

**Checklist:**

- 

---

## Mirelle's Tincture Satchel

- **id:** `mirelle_tinctures`
- **plants at:** `outpost_chapel` (chance 0.12)
- **hours:** [6,18]
- **meet tile offset:** dx [-3,-2] · dy [-1,1]
- **who you meet:** Mirelle
- **fetch enemy:** Marsh Poacher
- **reward:** `{"item":{"name":"Etheric Potion Vial","qty":2,"rarity":"Uncommon","tags":[]},"tc":25}`
- **visible buttons:** accept: `TAKE THE JOB — 2 VIALS AND 25 TC`

> **PLANT —** An old woman lighting chapel tapers speaks without turning. "The herb-boiler, Mirelle. West of the walls in daylight, under the bent marker-stone. She mends what the vats can't. Worth the walk if you're hurting."
> **PLANT —** A kneeling pilgrim finishes his prayer and stands with a wince. "Mirelle boils west of here, days. Good tinctures, fair prices. Somebody lifted her satchel this week — she could use a friend with fast hands."

> **pitch —** "Mirelle. Don't touch the jars." She doesn't stop stirring. "A poacher went through my camp two nights back and walked off with my satchel — every tincture I'd put up this season. He's holed up south of here, close." She taps the spoon twice on the pot rim. "Bring it back whole and I'll set you up with vials and coin. I don't sell what I don't have, so there's no other offer."
> **brief —** The poacher is 2-3 tiles south of Mirelle's boiling stone. SET COURSE walks you there. Recover the tincture satchel and bring it back; two Etheric Potion Vials and twenty-five TC on return.
> **acceptLine —** "South. Two tiles, maybe three." Mirelle finally looks at you, once, all the way through. "The jars are wax-sealed. If he's opened them, bring the satchel anyway. I want the satchel."
> **sighting —** A low fire burns clean and smokeless beside a bent marker-stone. A wiry woman crouches over a copper pot, stirring with a wooden spoon worn to the grain, jars ranked around her by color.
> **fetchSpawnLine —** A tarp shifts where no wind is. A rangy man rises from under it with a leather satchel slung crosswise, jars clinking. The Marsh Poacher pulls a knife with his free hand.
> **fetchRouteLabel —** the Marsh Poacher
> **meetRouteLabel —** Mirelle's boiling stone
> **returnRouteLabel —** Mirelle (return the satchel)
> **recoverLine —** The Marsh Poacher folds and the satchel slides free. You check the jars — wax seals unbroken, every one. Mirelle's season, saved.
> **returnLine —** Mirelle takes the satchel and counts jars by touch, eyes closed. "Whole." She presses two vials and a fold of coin into your hand. "Drink the pale one for wounds. The dark one, only if you mean it."
> **leaveLine —** You leave Mirelle to her pot. The clean smoke follows you a tile before the mud smell takes over again.
> **emptyHandsLine —** Mirelle reads your hands before your face. "No satchel, no talk. I'm boiling." She goes back to the pot.
> **kicker —** AT THE BOILING STONE
> **goodsShort —** satchel
> **goodsLong —** the tincture satchel
> **markNoun —** the poacher
> **complete —** You brought Mirelle's tincture satchel home with every seal unbroken. She paid in vials and told you which one to trust.

**Checklist:**

- 

---

## Saffi and the Singing Wire

- **id:** `saffi_thread`
- **plants at:** `outpost_lab` (chance 0.12)
- **hours:** [19,3]
- **meet tile offset:** dx [-1,1] · dy [-3,-2]
- **who you meet:** Saffi
- **fetch enemy:** Copper Stripper
- **reward:** `{"item":{"name":"Etheric Thread","qty":3,"rarity":"Uncommon","tags":[]},"tc":30}`
- **visible buttons:** accept: `TAKE THE JOB — 3 THREAD AND 30 TC` · buy: `BUY — 45 TC FOR 3 THREAD`

> **PLANT —** A lab tech re-coiling a dead spool mutters to nobody: "Saffi strings wire north of the walls, night work. Etheric thread, real gauge. Cheaper than requisition and twice as honest."
> **PLANT —** Someone has chalked on the lab's slate: WIRE — SAFFI — N. AFTER DARK. Under it, smaller: "stripper hit their camp, approach polite."

> **pitch —** "Saffi," they say, eyes still shut. "You're standing on my ground wire. Step left." They open their eyes. "Etheric thread, forty-five TC the bundle — or a trade. A stripper's been shaving my lines a little more each night. He dens east of here with three spools of mine. Fetch them back, keep a bundle, and I'll add coin. The wire told me you fight better than you sneak, so go loud."
> **brief —** The stripper is 2-3 tiles east of Saffi's wire camp. SET COURSE walks you there. Recover the thread spools; three bundles of Etheric Thread and thirty TC on return.
> **acceptLine —** "East. Follow the dead lines — he leaves them limp behind him." Saffi closes their eyes again. "The wire will tell me how it went before you do."
> **sighting —** Thin wire runs tent-shaped from a pole to the ground, humming faint in the dark. A slight figure sits cross-legged beneath it, eyes shut, one finger resting on the lowest strand like reading a pulse.
> **fetchSpawnLine —** Coils of stripped wire hang off a squatting figure like cheap jewelry. The Copper Stripper stands slow, a pair of cutters swinging from his fist, and steps between you and his hoard.
> **fetchRouteLabel —** the Copper Stripper
> **meetRouteLabel —** Saffi's wire camp
> **returnRouteLabel —** Saffi (return the spools)
> **recoverLine —** The Copper Stripper drops among his own coils. Three spools of true Etheric thread sit apart from the junk, still wound tight. Saffi's lines, coming home.
> **returnLine —** Saffi takes the spools and holds each to their ear in turn. "Still singing." They hand you three bundles and press coin after it. "The wire liked you. That's rarer than the thread."
> **leaveLine —** You step back off Saffi's ground. Behind you the wire hums one low note, like a door closing politely.
> **emptyHandsLine —** Saffi's finger stays on the strand. "The wire says your pack is empty of my spools. Come back when it sings otherwise."
> **kicker —** UNDER THE WIRE
> **goodsShort —** spools
> **goodsLong —** the thread spools
> **markNoun —** the stripper
> **complete —** You brought Saffi's spools back still singing. They paid in thread and coin and the wire's good opinion.

**Checklist:**

- 

---

## Garrin's Missing Miles

- **id:** `garrin_charts`
- **plants at:** `outpost_central` (chance 0.12)
- **meet tile offset:** dx [-3,-2] · dy [-1,1]
- **who you meet:** Garrin
- **fetch enemy:** Chart Runner
- **reward:** `{"item":{"name":"Tartarian Navigator's Compass","qty":1,"rarity":"Uncommon","tags":[]},"tc":20}`
- **visible buttons:** accept: `TAKE THE JOB — COMPASS AND 20 TC`

> **PLANT —** A courier resting her load in the square nods past the walls. "That cartographer, Garrin — camps west of here now, any hour. Lost half his charts to a runner last week. Man drew half the safe roads in this region. Somebody should care."
> **PLANT —** Chalked small on a crate in the square, in a draftsman's hand: "GARRIN — W — 2-3 mi. Charts bought, charts drawn. One runner's debt outstanding."

> **pitch —** "Garrin." He doesn't lift the pen. "I map what's left. A runner took a folio of my field charts — the north fords, the sink lines, two years of miles — and went to ground north of here." The pen stops. "I can't redraw what I can't re-walk, and my knees are done walking. Bring the folio back and I'll pay you in the one thing better than a map: the compass I drew them with, and coin. I don't sell the originals. Ever."
> **brief —** The runner is 2-3 tiles north of Garrin's drafting board. SET COURSE walks you there. Recover the chart folio; a Tartarian Navigator's Compass and twenty TC on return.
> **acceptLine —** "North. He camps low — look for ground with no birds over it." Garrin dips the pen. "Miles come back or they don't. Bring my miles back."
> **sighting —** A drafting board stands on legs of scavenged pipe, weighted at each corner against the wind. A gaunt man draws a coastline from memory, slow and certain, like the land owes him the shape.
> **fetchSpawnLine —** A lean figure bolts up from a dry wash, an oilskin folio strapped across his back like a shield. The Chart Runner looks for a road out, finds you on it, and draws steel instead.
> **fetchRouteLabel —** the Chart Runner
> **meetRouteLabel —** Garrin's drafting board
> **returnRouteLabel —** Garrin (return the folio)
> **recoverLine —** The Chart Runner falls and the folio comes free of him. Inside, the north fords in a steady hand, two years of miles, dry and whole. Garrin's memory, on paper.
> **returnLine —** Garrin unties the folio with shaking hands and turns every leaf. "All of it." He pushes a brass compass across the board. "Drew every chart in that folio by this needle. It pulls truer than I do now. Take it, and this." Coin follows.
> **leaveLine —** You leave Garrin to his coastline. The pen scratches on behind you, steady as a clock that only tells distance.
> **emptyHandsLine —** Garrin looks up just long enough to see your hands. "Those aren't my miles." The pen goes back to the coastline.
> **kicker —** AT THE DRAFTING BOARD
> **goodsShort —** folio
> **goodsLong —** the chart folio
> **markNoun —** the runner
> **complete —** You brought Garrin back his two years of miles. He paid with the compass that drew them.

**Checklist:**

- 

---

## Petra's Loaded Luck

- **id:** `petra_dice`
- **plants at:** `outpost_messhall` (chance 0.1)
- **hours:** [20,2]
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Petra
- **fetch enemy:** Dice Palmer
- **reward:** `{"tc":55}`
- **visible buttons:** accept: `TAKE THE JOB — 55 TC ON RETURN`

> **PLANT —** A dishwasher stacks bowls loud enough to talk under. "Petra's running her game east of the walls again, nights. Bone dice, old ones. Somebody palmed them mid-game last week and she's been sharpening a grudge ever since."
> **PLANT —** Two off-shift guards trade a look over their stew. "You want work? Petra. East, after dark. Her lucky dice walked off in someone's sleeve and she pays real coin for grudges."

> **pitch —** "Petra. Sit or don't." The pebbles stop. "I run a clean game with crooked dice — my grandmother's bones, carved before the mud came. A palmer lifted them out of my own cup, mid-throw, and had the stones to smile doing it. He's flopped west of here." Her jaw sets. "No dice, no game; no game, no living. Bring them back and fifty-five TC is yours. I don't want new dice. I want THOSE dice."
> **brief —** The palmer is 2-3 tiles west of Petra's game blanket. SET COURSE walks you there. Recover the carved bone dice; fifty-five TC on return.
> **acceptLine —** "West. He'll be throwing them for strangers' coin — my grandmother's bones, for STRANGERS." Petra spits neat past the lantern. "Break whatever's holding them."
> **sighting —** A square of oilcloth is staked flat against the wind, a shuttered lantern at each corner. A sharp-eyed woman shuffles a cup of pebbles one-handed, over and over, like a habit with nowhere to go.
> **fetchSpawnLine —** A crouched figure rattles dice in a cup and throws against a rock — then sees you and closes his fist over the bones mid-bounce. The Dice Palmer stands up smiling, which is worse than a knife.
> **fetchRouteLabel —** the Dice Palmer
> **meetRouteLabel —** Petra's game blanket
> **returnRouteLabel —** Petra (return the dice)
> **recoverLine —** The Dice Palmer drops and his fist opens. Two bone dice, carved fine and yellowed with three generations of throws, roll free — snake eyes at nobody. Petra's luck, boxed.
> **returnLine —** Petra takes the dice and rolls them once across the oilcloth. Whatever they show, her shoulders come down an inch. "Grandmother says thanks." She counts fifty-five TC into your palm without looking at it.
> **leaveLine —** You leave Petra to her pebbles. The cup rattles on behind you, patient as a debt.
> **emptyHandsLine —** Petra reads your hands the way she reads a table. "No bones, no business." The pebble cup starts up again.
> **kicker —** AT THE GAME BLANKET
> **goodsShort —** dice
> **goodsLong —** the bone dice
> **markNoun —** the palmer
> **complete —** You brought Petra's grandmother's dice home. She rolled them once, paid you in full, and looked ten years younger.

**Checklist:**

- 

---

## Hollis and the Salt Road

- **id:** `hollis_salt`
- **plants at:** `outpost_central` (chance 0.12)
- **hours:** [5,17]
- **meet tile offset:** dx [-1,1] · dy [2,3]
- **who you meet:** Hollis
- **fetch enemy:** Brine Runner
- **reward:** `{"item":{"name":"Scrap Metal","qty":2,"rarity":"Common","tags":[]},"tc":45}`
- **visible buttons:** accept: `TAKE THE JOB — 45 TC AND SCRAP` · buy: `BUY — 35 TC FOR SALT AND COIN`

> **PLANT —** A porter sets down two crates in the square and stretches his back. "Salt's short again. Hollis carts it up from the pans, south of here, daylight man. Runner cracked his last load and he's paying for the recovery."
> **PLANT —** A woman haggling over a thumb of salt gives up in disgust. "Go to the source. Hollis, south, while the sun's up. Half the price and he doesn't weigh his thumb with it."

> **pitch —** "Hollis. Salt's the trade." He thumps the cart rail. "Thirty-five TC the pouch, clean pan salt — or a job, if your arms work. A runner smashed my morning load and dragged the best bricks east into the flats." He shows you hands cracked white at every knuckle. "Salt's slow money. I can't chase and sell both. Fetch my bricks back and I'll pay you better than the pouch is worth."
> **brief —** The runner is 2-3 tiles east of Hollis's cart. SET COURSE walks you there. Recover the salt bricks; forty-five TC and scrap metal on return.
> **acceptLine —** "East, into the flats. Follow the white crumbs — he's leaking brick the whole way." Hollis goes back to his scraping. "Salt keeps. So do I."
> **sighting —** A hand-cart stands axle-deep in silt, white blocks lashed under wet burlap. A thick-set man scrapes crust from a pan lid and doesn't waste the scrapings, tapping them into a horn at his belt.
> **fetchSpawnLine —** White dust marks a trail to a hunched figure prying at a salt brick with a flat iron. The Brine Runner stands, licks a crystal off his thumb, and hefts the iron your way.
> **fetchRouteLabel —** the Brine Runner
> **meetRouteLabel —** Hollis's salt cart
> **returnRouteLabel —** Hollis (return the bricks)
> **recoverLine —** The Brine Runner goes down in his own white trail. Four salt bricks sit stacked under his tarp, barely chipped. Hollis's morning, salvaged.
> **returnLine —** Hollis stacks the bricks back on the cart and lashes them like they might run again. "Good arms." He counts forty-five TC slow and adds two solid lengths of scrap. "For the cart you'll own someday."
> **leaveLine —** You leave Hollis scraping his pans. Behind you the horn at his belt clicks, salt going nowhere slowly.
> **emptyHandsLine —** Hollis looks at your empty hands and shrugs the shrug of a man who's lost loads before. "Bricks or nothing. Salt doesn't take credit."
> **kicker —** AT THE SALT CART
> **goodsShort —** bricks
> **goodsLong —** the salt bricks
> **markNoun —** the runner
> **complete —** You hauled Hollis's salt bricks back out of the flats. He paid in coin and scrap and cart-owner's advice.

**Checklist:**

- 

---

## Wren and the Hymn Plates

- **id:** `wren_songbook`
- **plants at:** `outpost_chapel` (chance 0.1)
- **hours:** [18,2]
- **meet tile offset:** dx [-1,1] · dy [-3,-2]
- **who you meet:** Wren
- **fetch enemy:** Verse Peddler
- **reward:** `{"item":{"name":"Glowstone Pendant","qty":1,"rarity":"Common","tags":[]},"tc":30}`
- **visible buttons:** accept: `TAKE THE JOB — PENDANT AND 30 TC`

> **PLANT —** The taper-lighter pauses at the last wick. "You hear singing north of the walls some nights? That's Wren. Her hymn plates were lifted out of the chapel porch a week back and the nights have been quiet since. Quiet's worse."
> **PLANT —** A note pinned under a chapel candle, in a careful hand: "The singer camps north, after dark. Her plates were taken. The verses are older than the outpost. — a friend of the songs"

> **pitch —** "Wren," she says, and the hum stops like a held breath. "The verses live on tin plates, stamped letter by letter — the only copy left this side of the mud. A peddler took them off the chapel porch to sell as scrap script." Her voice stays level; her hands don't. "He hawks them north of here. Bring my plates home and I'll give you the pendant that used to light my reading, and coin. The songs go quiet otherwise. All the way quiet."
> **brief —** The peddler is 2-3 tiles north of Wren's altar stone. SET COURSE walks you there. Recover the hymn plates; a Glowstone Pendant and thirty TC on return.
> **acceptLine —** "North. You'll know him by the sales pitch — he reads the verses out like prices." Wren pulls the blanket tighter. "They're not prices."
> **sighting —** A flat stone stands upright in the silt, wind-worn smooth — an altar older than any wall. A small woman sits at its base wrapped in a gray blanket, humming something with the words missing.
> **fetchSpawnLine —** A reedy man stands on a crate declaiming to nobody, tin plates fanned in one hand like a winning deal. The Verse Peddler sees your face and knows a customer from a collector.
> **fetchRouteLabel —** the Verse Peddler
> **meetRouteLabel —** Wren's altar stone
> **returnRouteLabel —** Wren (return the plates)
> **recoverLine —** The Verse Peddler drops mid-verse. Six tin plates fan across the silt, stamped letters catching what light there is. The songs, in hand.
> **returnLine —** Wren takes the plates one at a time, reading each with her thumb before the next. Then she sings a single line, clear across the flats, and unclasps the pendant from her own neck. "I know them by heart now. You keep the light."
> **leaveLine —** You leave Wren at the cold altar. A tile out, the humming starts again behind you — patient, and missing its words.
> **emptyHandsLine —** Wren looks at your hands and the hum starts again, lower. "Not yet, then." She turns back to the stone.
> **kicker —** AT THE COLD ALTAR
> **goodsShort —** plates
> **goodsLong —** the hymn plates
> **markNoun —** the peddler
> **complete —** You brought the hymn plates back to Wren's altar. She sang one line and paid you with her own reading light.

**Checklist:**

- 

---

## Dazak's True Solder

- **id:** `dazak_solder`
- **plants at:** `outpost_workshop` (chance 0.12)
- **hours:** [7,19]
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Dazak
- **fetch enemy:** Tin Grubber
- **reward:** `{"item":{"name":"Ancient Tools","qty":1,"rarity":"Common","tags":[]},"tc":35}`
- **visible buttons:** accept: `TAKE THE JOB — TOOLS AND 35 TC` · buy: `BUY — 40 TC FOR SOLDER`

> **PLANT —** A tinker bites a joint apart and swears. "Cold solder again. Dazak pours true ingots east of the walls, daylight. A grubber's been at his molds — man could use a spare pair of fists."
> **PLANT —** Scratched into the workshop bench, fresh: "TRUE SOLDER = DAZAK. E of gate, sunup to sundown. Ask about the grubber, get paid."

> **pitch —** "Dazak. Mind the pour." He sets the crucible down before he looks at you. "True solder, forty TC the batch — flows at a whisper, holds like an oath. Or work: a grubber's been raiding my cooling molds at night, snapped off half a season's ingots. He dens south." He shows you a broken mold like a wound. "Bring my ingots back and I'll pay in tools worth more than the metal."
> **brief —** The grubber is 2-3 tiles south of Dazak's pour stone. SET COURSE walks you there. Recover the solder ingots; Ancient Tools and thirty-five TC on return.
> **acceptLine —** "South. He'll be trying to melt them down with a fire that couldn't soften butter." Dazak almost smiles. "The ingots will keep. He won't."
> **sighting —** Heat shimmer stands over a flat stone rigged with clay molds. A soot-black man tips a crucible with tongs, pouring a silver line thin as script, not spilling a drop.
> **fetchSpawnLine —** A smoky, useless fire gutters beside a crouched figure sawing at an ingot with a file. The Tin Grubber stands with the file forward, silver dust on his sleeves like guilt.
> **fetchRouteLabel —** the Tin Grubber
> **meetRouteLabel —** Dazak's pour stone
> **returnRouteLabel —** Dazak (return the ingots)
> **recoverLine —** The Tin Grubber drops his file and then himself. Five true ingots sit by his pathetic fire, barely scratched. Dazak's season, recovered.
> **returnLine —** Dazak checks each ingot against his thumbnail, then nods once, which from him is a speech. He lays a roll of old tools in your arms and counts coin on top. "These outlived their maker. Now they'll outlive me. Use them straight."
> **leaveLine —** You leave Dazak to the shimmer. Behind you the crucible tips again — a thin silver line, not a drop spilled.
> **emptyHandsLine —** Dazak reads your empty hands and turns back to the heat. "Ingots first. The pour won't wait and neither will I."
> **kicker —** AT THE POUR STONE
> **goodsShort —** ingots
> **goodsLong —** the solder ingots
> **markNoun —** the grubber
> **complete —** You brought Dazak's true solder home from the grubber's cold fire. He paid in tools that outlived their maker.

**Checklist:**

- 

---

## Imogen's Ring of Keys

- **id:** `imogen_keys`
- **plants at:** `outpost_quarters` (chance 0.1)
- **hours:** [22,4]
- **meet tile offset:** dx [-3,-2] · dy [-1,1]
- **who you meet:** Imogen
- **fetch enemy:** Latch Picker
- **reward:** `{"item":{"name":"Old Relic Key","qty":1,"rarity":"Common","tags":[]},"tc":45}`
- **visible buttons:** accept: `TAKE THE JOB — RELIC KEY AND 45 TC`

> **PLANT —** A bunkmate turns over and mutters at the ceiling: "Locksmith Imogen's camped west of the walls, late nights. Somebody picked HER pocket — took the whole ring of keys. There's a joke in there and she's not laughing."
> **PLANT —** Pinned to the quarters door with a bent nail: "LOST: ring of keys, brass, twenty-two teeth of my life. Reward. Find Imogen, west, after the late bell."

> **pitch —** "Imogen. Locks and keys, thirty years." The file doesn't stop. "Some latch-picker lifted my whole ring — twenty-two keys, half of them to doors that don't exist anymore. To me that ring is thirty years of shut things trusting me back." She sets the file down. "He's east of here, trying my keys in rocks for all I know. Bring the ring home and I'll cut you something rare, and pay coin besides."
> **brief —** The latch-picker is 2-3 tiles east of Imogen's work blanket. SET COURSE walks you there. Recover the ring of keys; an Old Relic Key and forty-five TC on return.
> **acceptLine —** "East. Listen for jingling — the fool wears them like a bell." Imogen picks the file back up. "Twenty-two keys. Count them before you leave him."
> **sighting —** A blanket spread with lock guts — springs, wards, half-cut blanks — glints under a hooded lamp. A gray-haired woman files a key blank by feel, watching the dark instead of her hands.
> **fetchSpawnLine —** A jingling gives him away before the dark does. The Latch Picker rises from behind a rock with the ring at his hip singing every step, and a pry-bar coming up in both hands.
> **fetchRouteLabel —** the Latch Picker
> **meetRouteLabel —** Imogen's work blanket
> **returnRouteLabel —** Imogen (return the keys)
> **recoverLine —** The Latch Picker goes quiet and the ring comes free of his belt. You count by lamplight: twenty-two keys, brass worn to gold at the shoulders. Thirty years, on one ring.
> **returnLine —** Imogen counts the ring twice, lips moving. "Twenty-two." She pulls one dark old key off a cord around her neck. "Relic work. Never found its door. Maybe you will." Coin follows, uncounted, which for a locksmith is trust.
> **leaveLine —** You leave Imogen filing in the dark. The lamp hood clicks down another notch behind you, guarding its inch of light.
> **emptyHandsLine —** Imogen glances up, counts your hands, and goes back to filing. "Twenty-two keys. You're carrying none of them."
> **kicker —** AT THE WORK BLANKET
> **goodsShort —** keys
> **goodsLong —** the ring of keys
> **markNoun —** the picker
> **complete —** You returned Imogen's thirty years of keys. She paid with a relic key that never found its door.

**Checklist:**

- 

---

## Tolvek Counts His Bolts

- **id:** `tolvek_bolts`
- **plants at:** `outpost_armory` (chance 0.12)
- **meet tile offset:** dx [-1,1] · dy [2,3]
- **who you meet:** Tolvek
- **fetch enemy:** Quiver Rat
- **reward:** `{"item":{"name":"Bone Bolt","qty":6,"rarity":"Common","tags":[]},"tc":25}`
- **visible buttons:** accept: `TAKE THE JOB — 6 BOLTS AND 25 TC` · buy: `BUY — 30 TC FOR 6 BOLTS`

> **PLANT —** The armory quartermaster slams a near-empty bolt crate. "Short again. Tolvek fletches south of the walls, any hour — honest bolts, fair price. Some quiver rat's been bleeding his stock and OUR supply with it."
> **PLANT —** A fletching knife pins a note to the armory board: "Bolts by the sheaf. Tolvek, south, look for the feather pole. Rat problem — inquire within."

> **pitch —** "Tolvek. Bolts." He rolls the shaft between his palms, listening to it. "Thirty TC the half-sheaf, straight as judgment — or earn a stack. A quiver rat's been nipping my bundles, one sheaf a night, and he's not even SELLING them, he's HOARDING them, west of here, like a magpie with thumbs." The bolt stops rolling. "Fetch my sheaves back. I'll pay coin and count you out bolts besides."
> **brief —** The quiver rat is 2-3 tiles west of Tolvek's feather pole. SET COURSE walks you there. Recover the bolt sheaves; six Bone Bolts and twenty-five TC on return.
> **acceptLine —** "West. His camp looks like a porcupine died on it." Tolvek goes back to listening to the shaft. "Mind the sharp ends. All of mine are sharp."
> **sighting —** A pole strung with fletching feathers turns slow in the wind, a trade sign readable a tile off. Beneath it a squat man sits on an ammo crate, sighting down a bolt shaft with one closed eye.
> **fetchSpawnLine —** Bolts bristle from a low den like quills — dozens, unstrung, unsold, hoarded. The Quiver Rat scrambles out with one in each fist, holding them like knives he's only half sure about.
> **fetchRouteLabel —** the Quiver Rat
> **meetRouteLabel —** Tolvek's feather pole
> **returnRouteLabel —** Tolvek (return the sheaves)
> **recoverLine —** The Quiver Rat drops among his hoard. Three full sheaves stand bundled and untouched at the back of the den — too precious to use, too hoarded to sell. Tolvek's count, restored.
> **returnLine —** Tolvek unbundles a sheaf and counts under his breath, then again out loud for the pleasure of it. "All there." He counts six bolts into your hand one at a time, then the coin the same way. "Counting's free. Everything else costs."
> **leaveLine —** You leave Tolvek under his turning feathers. Behind you a bolt shaft rolls and rolls between his palms, never quite satisfied.
> **emptyHandsLine —** Tolvek looks at your hands, then holds up a bolt and sights down it at you, one eye closed. "Sheaves. Then we talk."
> **kicker —** AT THE FEATHER POLE
> **goodsShort —** sheaves
> **goodsLong —** the bolt sheaves
> **markNoun —** the rat
> **complete —** You emptied the quiver rat's hoard back into Tolvek's count. He paid in bolts and coin, both counted twice.

**Checklist:**

- 

---

## Nessa's Cold Light

- **id:** `nessa_fungus`
- **plants at:** `outpost_lab` (chance 0.1)
- **hours:** [20,4]
- **meet tile offset:** dx [-1,1] · dy [2,3]
- **who you meet:** Nessa
- **fetch enemy:** Spore Skimmer
- **reward:** `{"item":{"name":"Bioluminescent Fungus","qty":3,"rarity":"Common","tags":[]},"tc":30}`
- **visible buttons:** accept: `TAKE THE JOB — 3 FUNGUS AND 30 TC`

> **PLANT —** A lab tech taps a dead glow-jar. "Cultures came from Nessa. She grows them south of the walls, nights — cold light, no fuel, no flame. A skimmer cleaned out her best jars this week. The lab's next unless someone helps her."
> **PLANT —** The lab slate, in glowing chalk that shouldn't glow: "NESSA — S — after dark. The light is grown, not burned. Skimmer took the mothers. Reward for return."

> **pitch —** "Nessa. Keep your shadow off the rows, they sulk." She holds up a jar gone dark. "A spore skimmer took my mother-cultures — the jars every other jar is born from. Without them this whole garden dies out in a season, and every cold lamp in the outpost with it." She sets the dead jar down gently anyway. "He's gone to ground north. The cultures keep three days in a sealed jar. Bring my mothers home."
> **brief —** The skimmer is 2-3 tiles north of Nessa's glow garden. SET COURSE walks you there. Recover the mother-culture jars; three Bioluminescent Fungus and thirty TC on return.
> **acceptLine —** "North. You'll see the glow through his tent if he hasn't smothered them yet." Nessa turns another jar. "Three days. Walk like it."
> **sighting —** Soft blue-green light leaks from under a lattice of stretched tarps — rows of jars glowing steady with no flame anywhere. A round-faced woman moves among them turning each jar a quarter, like tending sleeping birds.
> **fetchSpawnLine —** A tent glows faintly from the inside, blue-green through worn canvas. The Spore Skimmer backs out of it holding a crate of light in both arms, sees you, and sets it down slow like a man putting down a baby to fight.
> **fetchRouteLabel —** the Spore Skimmer
> **meetRouteLabel —** Nessa's glow garden
> **returnRouteLabel —** Nessa (return the cultures)
> **recoverLine —** The Spore Skimmer drops beside his tent. Inside the crate three jars glow strong and steady, sealed tight, patient as moss. The garden's mothers, alive.
> **returnLine —** Nessa takes each jar to her ear like a shell, then beams. "Alive, alive, alive." She splits a fresh culture three ways into travel jars and pushes them at you with coin. "Grown from these very mothers. Feed them dark and they'll light your whole life."
> **leaveLine —** You step out of the glow garden's light. It holds on your hands a moment longer than it should, then lets go.
> **emptyHandsLine —** Nessa reads your hands, then the horizon north. "Two days left, maybe." She goes back to turning jars, faster now.
> **kicker —** IN THE GLOW GARDEN
> **goodsShort —** cultures
> **goodsLong —** the mother-cultures
> **markNoun —** the skimmer
> **complete —** You brought Nessa's mother-cultures home alive. She paid in daughters of the very jars you carried.

**Checklist:**

- 

---

## Brother Calder's Cold Censer

- **id:** `calder_censer`
- **plants at:** `outpost_chapel` (chance 0.1)
- **hours:** [19,3]
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Calder
- **fetch enemy:** Ash Robber
- **reward:** `{"tc":60}`
- **visible buttons:** accept: `TAKE THE JOB — 60 TC ON RETURN`

> **PLANT —** The chapel warden trims a wick short. "Brother Calder walks the east flats at night, swinging that old censer — or did, till an ash robber took it off him at knife-point. He still walks. Empty-handed, like a bell with no clapper."
> **PLANT —** Scratched into the chapel doorframe, low, as if by someone kneeling: "the censer is gone. calder walks east without it. someone make this right."

> **pitch —** "Brother Calder." He looks at his own empty hand and puts it away. "For eleven years I've walked the flats at night with a censer of chapel ash — for the ones who died out here with no walls around them. An ash robber took it. The brass is worth ten TC. What's in it is worth eleven years." He nods south. "He camps that way. I have sixty TC — the chapel's, given freely. Bring the censer back. The dead notice the quiet, or I do, and I've stopped being sure of the difference."
> **brief —** The robber is 2-3 tiles south of Calder's night walk. SET COURSE walks you there. Recover the chapel censer; sixty TC on return.
> **acceptLine —** "South. The censer swings a green flame when it's carried — he won't be able to resist swinging it." Calder resumes his circuit, empty-handed. "I'll be walking."
> **sighting —** A tall figure in a patched cassock walks a slow circuit in the dark, right arm swinging a censer that isn't there — the habit outliving the object. He stops when he sees you, arm still.
> **fetchSpawnLine —** A point of green flame swings arcs in the dark ahead — someone playing with what they don't understand. The Ash Robber lets the censer clatter down and pulls a blade still gray with stolen ash.
> **fetchRouteLabel —** the Ash Robber
> **meetRouteLabel —** Calder's night walk
> **returnRouteLabel —** Calder (return the censer)
> **recoverLine —** The Ash Robber falls and the censer rolls free, still warm, the green ember inside refusing to die. Eleven years of walking, back in hand.
> **returnLine —** Calder takes the censer in both hands and stands very still. Then his arm remembers, and the green flame swings its first slow arc. "Eleven years, and one bad week." He gives you the sixty without ceremony. "The dead thank you. I checked."
> **leaveLine —** You leave Brother Calder to his circuit. His arm keeps swinging its nothing, patient as faith and twice as stubborn.
> **emptyHandsLine —** Calder's arm swings its empty arc. "Still quiet, then." He walks on, and you have never heard anything quite so loud as that nothing.
> **kicker —** ON THE NIGHT WALK
> **goodsShort —** censer
> **goodsLong —** the chapel censer
> **markNoun —** the robber
> **complete —** You put the censer back in Brother Calder's hand. The green flame swings the flats again, and the dead are no longer waiting.

**Checklist:**

- 

---

## Ottiline's Book of Debts

- **id:** `ottiline_ledger`
- **plants at:** `outpost_central` (chance 0.1)
- **hours:** [6,18]
- **meet tile offset:** dx [-1,1] · dy [-3,-2]
- **who you meet:** Ottiline
- **fetch enemy:** Page Tearer
- **reward:** `{"tc":70}`
- **visible buttons:** accept: `TAKE THE JOB — 70 TC ON RETURN`

> **PLANT —** A stall-keeper in the square lowers her voice. "Ottiline runs the lending blanket north of the walls, daylight. Her ledger walked off — every debt in the district in one book. Half this square owes her. The wrong hands on that book and we ALL have a bad year."
> **PLANT —** Two porters, passing: "— tore a page out and TOOK THE REST. Ottiline's offering seventy for the book. North, day hours. I'd go myself if I didn't owe her eleven."

> **pitch —** "Ottiline. Sit." It is not a request. "I lend. Small sums, fair terms, thirty years of yes when the counters said no. Every debt lives in one ledger and a page-tearer took it — east of here, and he's not clever enough to collect on it, which means he'll SELL it to someone who is." She folds her hands. "Seventy TC for the book, whole. I am precise about money and I will be precise about gratitude."
> **brief —** The page-tearer is 2-3 tiles east of Ottiline's lending blanket. SET COURSE walks you there. Recover the debt ledger; seventy TC on return.
> **acceptLine —** "East. He'll be sounding out the entries — moving lips, no wit." Ottiline dips her pen over nothing, from habit. "The book, whole. Every page is somebody's roof."
> **sighting —** A woman sits behind a blanket bare of goods — her trade was never goods. An inkwell, a pen, and a book-shaped absence in front of her, which she stares into like a well.
> **fetchSpawnLine —** A man sits cross-legged with a thick ledger open on his knees, lips moving over the entries. The Page Tearer slaps it shut when he sees you, and stands with it clutched like a shield he intends to swing.
> **fetchRouteLabel —** the Page Tearer
> **meetRouteLabel —** Ottiline's lending blanket
> **returnRouteLabel —** Ottiline (return the ledger)
> **recoverLine —** The Page Tearer goes down still holding the book. You work it free — thirty years of small sums and fair terms, one corner torn, everything legible. The district's roofs, in hand.
> **returnLine —** Ottiline turns every page at reading speed, which for her is fast. "One corner torn. Acceptable losses." She counts seventy TC in stacks of ten, squared to the blanket's edge. "Your credit here is spotless. That is worth more than the seventy. But take the seventy."
> **leaveLine —** You leave Ottiline staring into the book-shaped absence. Behind you the pen scratches a note into her palm, the only surface she has left.
> **emptyHandsLine —** Ottiline looks at your hands the way she looks at a late payment. "The ledger. I don't do partial deliveries and neither should you."
> **kicker —** AT THE LENDING BLANKET
> **goodsShort —** ledger
> **goodsLong —** the debt ledger
> **markNoun —** the tearer
> **complete —** You put the district's debts back in Ottiline's precise hands. She paid seventy, squared to the blanket's edge, and opened you an account.

**Checklist:**

- 

---

## Ferro and the Pulling Stones

- **id:** `ferro_magnets`
- **plants at:** `outpost_workshop` (chance 0.1)
- **hours:** [21,5]
- **meet tile offset:** dx [-1,1] · dy [-3,-2]
- **who you meet:** Ferro
- **fetch enemy:** Loadstone Lifter
- **reward:** `{"item":{"name":"Magnetic Ether Sphere","qty":1,"rarity":"Uncommon","tags":[]},"tc":30}`
- **visible buttons:** accept: `TAKE THE JOB — SPHERE AND 30 TC` · buy: `BUY — 55 TC FOR A SPHERE`

> **PLANT —** A mechanic pries a bolt off the underside of the bench without touching it, grinning, then sobers. "Ferro's sphere, borrowed. He calibrates north of the walls at night. A lifter cleaned out his case this week — pulling stones in the wrong pockets, imagine."
> **PLANT —** Note on the workshop wall, held up by nothing visible: "FERRO — N — night. Ether spheres, charged true. (If you can read this, the demo works.) Ask about the lifter."

> **pitch —** "Ferro. Stand behind the line, your buckles are ruining my rows." He rebalances the scale. "Magnetic ether spheres, charged and certified — fifty-five TC. Or a recovery: a loadstone lifter took my case of charged stock west of here, and the idiot is carrying six spheres LOOSE. IN A METAL CART." He pinches the bridge of his nose. "Retrieve the case before he learns why we use wooden boxes. Sphere and coin on return."
> **brief —** The lifter is 2-3 tiles west of Ferro's pull field. SET COURSE walks you there. Recover the sphere case; a Magnetic Ether Sphere and thirty TC on return.
> **acceptLine —** "West. If you hear a cart screaming, that's the bearings seizing. Follow the screaming." Ferro re-combs a row of filings with one finger, soothing them.
> **sighting —** Small iron filings stand up from the silt in combed rows, pointing at a crate like grass growing sideways. A precise little man kneels among them with a brass sphere in a sling scale, weighing its pull against a known nail.
> **fetchSpawnLine —** A hand-cart stands welded to itself by its own cargo, wheels cocked at angles wheels shouldn't hold. The Loadstone Lifter heaves at it, gives up, and turns on you with a pry-bar that bends visibly toward the cart.
> **fetchRouteLabel —** the Loadstone Lifter
> **meetRouteLabel —** Ferro's pull field
> **returnRouteLabel —** Ferro (return the case)
> **recoverLine —** The Loadstone Lifter drops beside his ruined cart. The sphere case pries loose from the cart bed with a groan of parting metal — six spheres inside, sulking but whole. Ferro's stock, contained.
> **returnLine —** Ferro opens the case and checks each sphere against his known nail, muttering numbers. "Within tolerance. ALL of them. Astonishing." He boxes one for you with thirty TC. "You carried it in a WOODEN crate. You're my favorite person this season."
> **leaveLine —** You step over the combed rows and away. Behind you the filings sigh back into their pattern, pointing at the crate like they never doubted.
> **emptyHandsLine —** Ferro glances at your pack, and two of your buckles twitch toward him. "No case. I can feel it from here. Come back heavier."
> **kicker —** IN THE PULL FIELD
> **goodsShort —** case
> **goodsLong —** the sphere case
> **markNoun —** the lifter
> **complete —** You pried Ferro's sphere case off the lifter's ruined cart. He paid in charged stone and rare approval.

**Checklist:**

- 

---

## Quill's Iron Ink

- **id:** `quill_inks`
- **plants at:** `outpost_quarters` (chance 0.1)
- **hours:** [8,20]
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Quill
- **fetch enemy:** Ink Dipper
- **reward:** `{"item":{"name":"Tartarian Writing Tablet","qty":1,"rarity":"Common","tags":[]},"tc":40}`
- **visible buttons:** accept: `TAKE THE JOB — TABLET AND 40 TC`

> **PLANT —** A bunkmate blows on a letter to dry it. "Good ink, this. From Quill — they boil it east of the walls, day hours. Iron-gall black that outlasts the paper. A dipper's been thieving the flasks; Quill's offering real pay."
> **PLANT —** On the quarters message board, in ink so black it looks wet: "I MAKE THE INK THIS IS WRITTEN IN. East, daylight. A dipper took my flasks. Reward stands. — Q"

> **pitch —** "Quill." They hold up their black hands by way of a card. "Iron-gall ink — outlasts the page, outlasts the writer. The chapel's records, Ottiline's ledger, half the letters home this outpost ever sent: my pot. An ink dipper lifted a crate of finished flasks and hauled it south." They strain another thread of black. "Words are how the dead keep talking. Bring my flasks back and I'll pay coin and something worth writing on."
> **brief —** The dipper is 2-3 tiles south of Quill's ink fire. SET COURSE walks you there. Recover the ink flasks; a Tartarian Writing Tablet and forty TC on return.
> **acceptLine —** "South. He'll have black fingerprints on everything he owns by now — the flasks weep if you carry them rough." Quill turns back to the pot. "Ink keeps. Go careful anyway."
> **sighting —** A small fire heats an iron pot that smells of oak and rust and something older. A stained-fingered figure decants black liquid through cloth, one careful thread at a time, into rows of stoppered flasks.
> **fetchSpawnLine —** Black fingerprints mark a trail up a rise to a man uncorking a flask to sniff it, face already smudged like bad theater. The Ink Dipper corks it fast and picks up a stained club.
> **fetchRouteLabel —** the Ink Dipper
> **meetRouteLabel —** Quill's ink fire
> **returnRouteLabel —** Quill (return the flasks)
> **recoverLine —** The Ink Dipper drops, printing one last black hand on the silt. The crate holds eight flasks, seven stoppered tight, one weeping a thin dark thread. Quill's words, mostly saved.
> **returnLine —** Quill counts flasks with their eyes and losses with their mouth. "Seven whole. He'll wear the eighth for a month." They wrap an old writing tablet with coin inside. "Something worth writing, on something worth keeping."
> **leaveLine —** You leave Quill decanting the dark. The smell of oak and rust follows you a tile, patient as a signature.
> **emptyHandsLine —** Quill looks at your clean hands almost sadly. "No flasks. You'd be stained if you had them. Ink tells on everyone."
> **kicker —** AT THE INK FIRE
> **goodsShort —** flasks
> **goodsLong —** the ink flasks
> **markNoun —** the dipper
> **complete —** You followed the fingerprints and brought Quill's ink home. They paid in coin and a tablet worth keeping.

**Checklist:**

- 

---

## Maren's Warding Bones

- **id:** `maren_charms`
- **plants at:** `outpost_armory` (chance 0.1)
- **hours:** [20,4]
- **meet tile offset:** dx [-3,-2] · dy [-1,1]
- **who you meet:** Maren
- **fetch enemy:** Charm Cutter
- **reward:** `{"item":{"name":"Warden's Etheric Charm","qty":1,"rarity":"Uncommon","tags":[]},"tc":50}`
- **visible buttons:** accept: `TAKE THE JOB — TRUE WARD AND 50 TC`

> **PLANT —** A guard drawing her night kit touches something small at her collar. "From Maren, this. She cuts warding charms west of the walls, after dark. A cutter jumped her camp and took the finished lot. We won't say how much we mind. We mind."
> **PLANT —** Tied to the weapon rack with red thread, a bone chip scratched with: "M — W — night. The wards are taken. The dark noticed. Fetch them back before it gets ideas."

> **pitch —** "Maren. Step inside the thread, don't touch it." She doesn't stop carving. "I cut wards. Bone remembers being alive and I remind it — the guards wear my work, the chapel buries with it. A charm cutter hit my camp and took the season's finished lot east." Her knife pauses. "He thinks he'll sell them. Wards cut for one neck lie to every other. Bring them back before someone trusts a lie in the dark, and I'll cut you a true one, and pay besides."
> **brief —** The cutter is 2-3 tiles east of Maren's ward line. SET COURSE walks you there. Recover the warding charms; a Warden's Etheric Charm and fifty TC on return.
> **acceptLine —** "East. He'll feel watched the whole way — that's the wards, disagreeing with him." Maren blows bone dust off her knife. "They'll be glad to see you. You'll feel it."
> **sighting —** A ring of bone chips hangs on red thread between stakes, turning slow though the wind has stopped. Inside it a scar-knuckled woman carves at a knuckle of bone, and the dark outside the ring feels a degree darker than it should.
> **fetchSpawnLine —** A man sits wrapped in stolen wards like a king in borrowed rings, and none of them are working for him — you can see the sweat from here. The Charm Cutter rises with a skinning knife and the look of someone who hasn't slept since the theft.
> **fetchRouteLabel —** the Charm Cutter
> **meetRouteLabel —** Maren's ward line
> **returnRouteLabel —** Maren (return the wards)
> **recoverLine —** The Charm Cutter drops, and you'd swear the bone chips on him sigh. Nine finished wards come loose in a bundle, warm to the touch in the cold air. The season's work, homing.
> **returnLine —** Maren touches each returned ward to her own wrist, listening. "Home. All nine." Then she measures your neck with a knotted string, cuts for an hour by feel, and hangs the result on you with fifty TC. "Cut true, to you alone. The dark will have to introduce itself now."
> **leaveLine —** You step back out through the thread. Behind you the bone chips turn a little faster, then settle, unimpressed.
> **emptyHandsLine —** Maren looks past you at the dark outside the thread. "It's still out there wearing my work. Come back with the wards."
> **kicker —** AT THE WARD LINE
> **goodsShort —** wards
> **goodsLong —** the warding charms
> **markNoun —** the cutter
> **complete —** You brought Maren's season of wards home before a lie got trusted in the dark. She cut yours true and paid besides.

**Checklist:**

- 

---

## Stellan Reads the Sky

- **id:** `stellan_starglass`
- **plants at:** `outpost_lab` (chance 0.1)
- **hours:** [22,5]
- **meet tile offset:** dx [-3,-2] · dy [-1,1]
- **who you meet:** Stellan
- **fetch enemy:** Glass Creeper
- **reward:** `{"item":{"name":"Whispering Aether Crystal","qty":1,"rarity":"Uncommon","tags":[]},"tc":40}`
- **visible buttons:** accept: `TAKE THE JOB — CRYSTAL AND 40 TC` · buy: `BUY — 80 TC FOR THE SPARE`

> **PLANT —** An old scholar wipes dust from an empty telescope mount. "Stellan took the good glass west of the walls, late nights — says the sky reads cleaner away from our smoke. A creeper stole his eyepiece crystal. The man's up there every night, staring at a blur."
> **PLANT —** Lab slate, in a shaking hand: "STELLAN — W — late. The star-glass is taken. The sky proceeds unrecorded. This is not acceptable."

> **pitch —** "Stellan. Mind the ledgers, that's forty years of sky." He straightens with effort. "The mist parts out here, some nights, and I write down what the old world hung up there. My reading crystal — a whispering aether lens, irreplaceable — was crept off this very mount while I dozed." He points north, disgusted. "By a GLASS CREEPER. Eighty TC buys my spare, if you need glass that listens. But bring my crystal home and I'll give you the spare, and coin, and name a star for you. I keep the register. I can do that."
> **brief —** The creeper is 2-3 tiles north of Stellan's sky mount. SET COURSE walks you there. Recover the reading crystal; a Whispering Aether Crystal and forty TC on return.
> **acceptLine —** "North. On clear nights he holds it up and giggles at the sky — I've watched him through the finder. GIGGLES." Stellan pats the brass tube like a horse. "Soon," he tells it.
> **sighting —** A brass tube on a tripod aims at the overcast where a star should be, ledgers of sky-readings weighted open beneath it. An old man squints through the empty eyepiece socket anyway, out of loyalty.
> **fetchSpawnLine —** A thin figure stands with a crystal raised to the clouds, head cocked, listening to something the sky is whispering that was never meant for him. The Glass Creeper pockets it and draws two knives with unsettling grace.
> **fetchRouteLabel —** the Glass Creeper
> **meetRouteLabel —** Stellan's sky mount
> **returnRouteLabel —** Stellan (return the crystal)
> **recoverLine —** The Glass Creeper folds, and the crystal rolls out of his pocket whispering faintly — star-talk, or the memory of it. Forty years of sky, waiting to resume.
> **returnLine —** Stellan seats the crystal in its socket with surgeon's hands, looks through, and makes a sound you'd swear was younger than he is. "The sky RESUMES." He gives you his spare, the coin, and opens the register. "Choose any star in the third quadrant. Spell your name slowly."
> **leaveLine —** You leave Stellan squinting at the blur. Behind you he tells the telescope something reassuring, and the overcast doesn't argue.
> **emptyHandsLine —** Stellan looks through the empty socket at you, which is somehow worse than a glare. "The sky proceeds unrecorded. Hurry."
> **kicker —** AT THE SKY MOUNT
> **goodsShort —** crystal
> **goodsLong —** the reading crystal
> **markNoun —** the creeper
> **complete —** You brought Stellan's listening crystal back to its socket. The sky resumes — and a star in the third quadrant now bears your name.

**Checklist:**

- 

---

## Galia's Grandfather Horn

- **id:** `galia_horn`
- **plants at:** `outpost_armory` (chance 0.1)
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Galia
- **fetch enemy:** Horn Filcher
- **reward:** `{"item":{"name":"Tartarian Battle Horn","qty":1,"rarity":"Uncommon","tags":[]},"tc":45}`
- **visible buttons:** accept: `TAKE THE JOB — WAR HORN AND 45 TC`

> **PLANT —** The armory quartermaster nods at an empty bracket on the wall. "Battle horn hung there since before my time — Galia's line blew it at the mud's first rising. She keeps camp east now, any hour. A filcher took it clean off her belt. She's not loud about it, which means it's bad."
> **PLANT —** A cord and empty horn-sling hang on the armory door with a note: "It was my grandfather's, and his. East of the walls. I pay well and ask no questions after. — Galia"

> **pitch —** "Galia." One more stroke of the spear. "My line has blown the same battle horn since the mud first rose — my grandfather sounded the retreat that saved this outpost's founders. A filcher cut it off my belt in a crowd, west of here, and is doubtless learning it doesn't blow for cowards." She tests the edge with her thumb. "Bring it home and I'll pay forty-five TC and give you the horn's little brother — a true Tartarian call. My family owes a debt then. We're careful about debts."
> **brief —** The filcher is 2-3 tiles west of Galia's standing stone. SET COURSE walks you there. Recover the grandfather horn; a Tartarian Battle Horn and forty-five TC on return.
> **acceptLine —** "West. If you hear a horn making a sound like a sick goose, that's him trying. It answers blood, not breath." Galia grounds the spear. "I'll hear it when YOU blow it. Then I'll know."
> **sighting —** A broad-shouldered woman stands sharpening a spear against a leaning stone, each stroke slow and even. An empty horn-sling hangs at her hip, and her free hand keeps drifting to it and finding nothing.
> **fetchSpawnLine —** A strangled honk echoes off the rocks — once, twice, furious. The Horn Filcher lowers the great horn, red-faced, and reaches for a hatchet instead. Some instruments choose their players.
> **fetchRouteLabel —** the Horn Filcher
> **meetRouteLabel —** Galia's standing stone
> **returnRouteLabel —** Galia (return the horn)
> **recoverLine —** The Horn Filcher drops his hatchet and then the argument. The great horn is unmarked — it has survived worse owners. On an impulse you'll never explain, you blow it once: the note rolls out low and enormous, and somewhere east a spear-butt strikes stone in answer.
> **returnLine —** Galia takes the horn and checks the mouthpiece for the filcher's spit with open contempt. Then she slings it home and the drifting hand finally rests. "I heard you blow it. It answered." She gives you the smaller horn and the coin. "Little brother's yours. When you sound it, my line sharpens spears. Remember that."
> **leaveLine —** You leave Galia to her whetstone. The empty sling swings at her hip, and the sound of the sharpening follows you out of sight.
> **emptyHandsLine —** Galia's hand drifts to the empty sling and away. "Still west, then." The whetstone starts again, a little faster.
> **kicker —** AT THE STANDING STONE
> **goodsShort —** horn
> **goodsLong —** the grandfather horn
> **markNoun —** the filcher
> **complete —** You brought the grandfather horn home, and it answered your breath on the way. Galia's line owes you a debt — and they're careful about debts.

**Checklist:**

- 

---

## Brann's Black Harvest

- **id:** `brann_coal`
- **plants at:** `outpost_messhall` (chance 0.1)
- **hours:** [5,16]
- **meet tile offset:** dx [-3,-2] · dy [-1,1]
- **who you meet:** Brann
- **fetch enemy:** Coal Creeper
- **reward:** `{"item":{"name":"Scrap Metal","qty":3,"rarity":"Common","tags":[]},"tc":35}`
- **visible buttons:** accept: `TAKE THE JOB — 35 TC AND SCRAP` · buy: `BUY — 25 TC FOR COAL AND SCRAP`

> **PLANT —** The mess cook bangs a cold stove. "Forge-coal's short because Brann's shipment got creeped. He mounds his burn west of the walls, day hours. Good coal, black as a debt. He's paying for the recovery in coin and coal both."
> **PLANT —** A charcoal thumbprint signs a note by the mess hatch: "Coal by the sack. Brann, west, daylight. My harvest walked off — reward for walking it back."

> **pitch —** "Brann. Don't stand upwind unless you like the look." He wipes his hands on his hips, achieving nothing. "Forge-coal. Twenty-five the sack — every smith in the walls burns my black. A creeper dragged off last week's whole harvest, five sacks, east. My burn can't be left or she collapses and three weeks of wood die with her." He tamps a vent without looking. "Fetch my sacks. Coin and scrap on return, and the smiths owe you too, whether they know it or not."
> **brief —** The creeper is 2-3 tiles east of Brann's charcoal mound. SET COURSE walks you there. Recover the coal sacks; thirty-five TC and scrap metal on return.
> **acceptLine —** "East. Follow the black spill — five sacks leak like gossip." Brann circles back to his smoke. "The burn and I will be here. She doesn't travel and neither do I."
> **sighting —** A turf-capped mound smokes thin and even from four vents — a charcoal burn in its patient middle days. A soot-gray man circles it, reading the smoke like a book, tamping a vent here, opening one there.
> **fetchSpawnLine —** A black-dusted trail ends at a man trying to light a cookfire with forge-coal and no draft, failing with commitment. The Coal Creeper stands, black to the elbows, and picks up a mattock like a grudge.
> **fetchRouteLabel —** the Coal Creeper
> **meetRouteLabel —** Brann's charcoal mound
> **returnRouteLabel —** Brann (return the sacks)
> **recoverLine —** The Coal Creeper drops beside his dead cookfire. Five sacks of good forge-black sit stacked where he dragged them, lighter by one amateur evening. Brann's harvest, shouldered.
> **returnLine —** Brann checks each sack's weight with one hand, still watching his smoke with the other eye. "All five, minus his bad evening." He pays coin black with thumbprints and stacks three lengths of scrap on top. "From the smiths, though they don't know it. I'll tell them. They'll pretend to remember."
> **leaveLine —** You leave Brann circling his smoking mound. He tells the burn something low and encouraging, the way you'd talk to a horse or a fire that owns you.
> **emptyHandsLine —** Brann reads your hands like slow smoke. "No sacks. The burn says come back heavier, and she's the boss."
> **kicker —** AT THE CHARCOAL MOUND
> **goodsShort —** sacks
> **goodsLong —** the coal sacks
> **markNoun —** the creeper
> **complete —** You walked Brann's black harvest home while his burn held. The smiths owe you now — he promised to tell them.

**Checklist:**

- 

---

## Veska and the Obedient Iron

- **id:** `veska_rings`
- **plants at:** `outpost_central` (chance 0.08)
- **hours:** [21,3]
- **meet tile offset:** dx [2,3] · dy [-1,1]
- **who you meet:** Veska
- **fetch enemy:** Ring Slipper
- **reward:** `{"item":{"name":"Golem Controller Ring","qty":1,"rarity":"Uncommon","tags":[]},"tc":50}`
- **visible buttons:** accept: `TAKE THE JOB — RING AND 50 TC` · buy: `BUY — 90 TC FOR A RING`

> **PLANT —** A crane-tender in the square flexes a bandaged hand. "Golem work's stopped. Veska's controller rings got slipped off her table — she trades them east of the walls, nights. Ninety a ring and worth every chip. Whoever took them can't USE them, which is the frightening part."
> **PLANT —** Word passes low across the square: "Veska's rings walked. East, after dark, if you've got the spine to fetch iron that listens. She pays like a guild."

> **pitch —** "Veska." The stones stop turning. "Controller rings — the old craft, iron that listens. Ninety TC each and cheap at thrice that. A slipper took my working stock off this very table while I slept in reach of it, which I respect and will not forgive." She folds her hands. "He's gone to ground south. He can't attune them — but he can SELL them to someone who can, and obedient iron in the wrong hands stops being a tool and starts being a reign. Bring the case back. Ring and coin on return, and my regard, which opens doors."
> **brief —** The slipper is 2-3 tiles south of Veska's iron table. SET COURSE walks you there. Recover the ring case; a Golem Controller Ring and fifty TC on return.
> **acceptLine —** "South. The rings will be warm when you get close — they miss the table." Veska sets one stone spinning with a flick of her ring finger, for emphasis or comfort. "Go get my quiet ones."
> **sighting —** A sheet-iron table stands alone on the flats, ringed by fist-sized stones laid in a pattern too regular to be decoration. A silver-haired woman sits behind it, turning a brass ring on one finger, and the stones turn with it, slow, in place.
> **fetchSpawnLine —** A man crouches over an open case, trying ring after ring and hissing when each one bites him — obedient iron, disobeying. The Ring Slipper snaps the case shut with bleeding fingers and pulls a long knife he can hold.
> **fetchRouteLabel —** the Ring Slipper
> **meetRouteLabel —** Veska's iron table
> **returnRouteLabel —** Veska (return the rings)
> **recoverLine —** The Ring Slipper drops, still bleeding from eight small ring-bites. The case hums faint in your hands, warm as promised — the rings, homing. Veska's quiet ones, coming back.
> **returnLine —** Veska opens the case and the rings settle audibly, like a kicked hive going calm. "Home. All of them." She attunes one to your hand with three slow passes, then counts fifty on top. "Iron that listens, and my regard. Spend the coin anywhere. Spend the regard carefully."
> **leaveLine —** You leave Veska at her iron table. As you go, every stone in the ring turns once to face you — noted, filed, dismissed.
> **emptyHandsLine —** Veska turns her ring; a stone by your foot turns with it. "They're still south. I'd feel them closer. Go on."
> **kicker —** AT THE IRON TABLE
> **goodsShort —** rings
> **goodsLong —** the ring case
> **markNoun —** the slipper
> **complete —** You carried the obedient iron home warm and humming. Veska paid in a listening ring — and her regard, which opens doors.

**Checklist:**

- 

---
