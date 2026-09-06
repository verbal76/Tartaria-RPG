# The contrary walker — every hunt, four roads (2026-09-05)

Step 3 of the Narrative Agency plan (task #197): the walker OTA-1686 built for
one hunt reads its roadmap from the hunt definition (OTA-1699,
`huntRoadmap` / `huntNouns` in `test-utils/contraryWalker.ts`) and walks all
eighteen hunts down the four roads. The sweep is
`__tests__/ota1699ContraryWalkerSweep.test.ts` (heavy CI by name); its one
hard assertion per road is HANDLED — the hunt still finishes after every
deviation — and everything else is graded and listed below.

Run it by hand:

    PLAYER_WALKER_REPORT=/tmp/r.txt npx jest __tests__/ota1699ContraryWalkerSweep.test.ts --forceExit
    CONTRARY_HUNTS=hunt_mud_siren_queen,hunt_apparition_red_tower … (a subset)

## The four roads, read from the definition

| road | what the thumb did |
|---|---|
| **obedient** | the player-shaped walker as it stands: accept at the nearest gate, follow every course, type every arrival line, answer every card, hand in |
| **premature** | the apex ground at stage 0 (type the apex's own verb), the later ask that requires an item at stage 0 ("negotiate", "talk to …"), then the proper visits |
| **contrary** | TURN IN with no trophy; walk out on the first ask's card, step off and back, SUMMON, PROCEED; the wrong verb on the first "investigate" ground; ABANDON at the abandon point with the items in the pack and take the posting again |
| **interrupted** | on the first brood of two or more: kill one, FLEE, step off and back; on the apex: wound it, FLEE, step off and back |

A probe with no ground on a hunt (no brood of two, no later ask, no
investigate stage) is **skipped and listed as skipped** — never counted as a
pass. Two hunt templates cover the catalog: `standard_7` (14 hunts) and
`bait_switch_5` (4 hunts: the Siren Queen, Silence the Doubter, and two more
with no later ask).

Grades, as on the Bog Dragon: **handled** (the hunt still finished),
**acknowledged** (a line named what the player just did; the early apex visit
is 'yes' only for the slate's own *"this is a later step's ground — not yet.
First: …"*), **prior knowledge** (the earlier deed changed a later line or
state). Allowances as before (HP 600, STR/DEX 20, standing 100, dice on 18,
stamina by fiat, the finished hunt struck from the ledger between roads), plus
one new one: on the brood probe the brood is hardened to 200 HP so "kill one"
kills one — with whatever the road had looted, one swing emptied the field
twice and the probe ran from nothing.

## Four sweeps to one clean answer

The first full sweep (2h39m) walked thirteen hunts clean on every road and
then five hunts broke in a cascade — every gate refused, every course unset,
one road after another at one tap each. The second sweep, with the boots'
position printed on every gate break, showed the shape: *"You cross to the
gate and step through … You step out under open sky and take your bearings"*
and a course to another hunt's ground set from inside the outpost. **Jest
cannot cancel a promise.** A road that outran the test's 25-minute timeout
kept walking while the next hunt's test began, and two walkers drove one
store — the abandoned road's SET COURSE cleared the room the new road had just
entered. The report's own interleaving (dust fiend, mud golem, dust fiend,
mud golem …) was the proof.

The sweep now races every road against a twenty-minute deadline of its own;
an abandoned road is written up as ABANDONED and thrown out at its next tap
(`walkerControl.abort`, read in `Walker.tap`), and the test budget is wider
than four abandoned roads so jest never gets there first. A road still running
at fifteen minutes writes a STALLED line with the boots' position and the last
twelve feed lines, so a genuinely stuck walk can be read while it is stuck.

The third sweep walked fifty-two roads clean and then the eighteenth hunt went
quiet for twenty minutes at a time, four roads running, with the process at
100% CPU and no new feed line. That one was not the walker. The inspector,
attached to the live jest process, put every stack sample inside the save
trimmer: 838 visited rooms by then, an 830K save, and `trimSaveStateToFit`
re-stringifying the whole blob before every room it considered, on every
persist — seven seconds of synchronous JS per action, forever, because the
trimmed copy never reaches memory. **OTA-1702** measures per room. The dust
fiend's four roads then walked clean alone in 47 seconds, and the fourth sweep
walked all seventy-two in sixty-nine minutes.

The one game break the third sweep did produce is **OTA-1703**: on the Harpy's
interrupted road a corruption apparition that happened to be an Aetheric Raven
stood on the Cradle of Dusk before the stage's four ravens could arm; the
walker killed it and the escort clear, matching the stage by name alone, moved
the hunt on. Stage bodies now carry their stage's key.

## Walker gaps found on the road and fixed (test-side, no game code)

1. **The indoor first ask.** The Siren Queen's first ask stands at the Hidden
   Market, whose tile auto-enters its building (OTA-508); "north" indoors is
   swallowed (*"Inside, you move room to room"*) and the walk-out probe broke
   on the step-off. `stepOffAndBack` now EXITs a building or outpost first.
   Re-walked: all four roads clean, the walk-out handled and remembered.
2. **"The flee was silent" ×3.** The grader read a four-phrase regex against
   `FLEE_OPEN_LINES` (thirty lines) — the Siren Queen, the Weaver and the
   Apparition had all fled with a line the regex did not know. The grader reads
   both pools by inclusion (two world entries inside 500ms merge into one feed
   line). Re-walked: said.
3. **'partial' was the ceiling.** The early-apex probe could never grade
   'yes', so fourteen hunts read 'partial' on the same correct line and hid the
   ones where the line never printed. 'yes' for the slate's "not yet … First:"
   line; the Bog Dragon pin flipped.
4. **One swing, no brood.** See the allowance above.
5. **The cascade.** See above.

## Results

Fourth sweep, 2026-09-06 00:00Z, sixty-nine minutes, on OTA-1702 (the
trimmer) and the pre-1703 clear. **Seventy-two roads, seventy-two finished
clean.** 164 probes graded: handled 164 of 164; acknowledged 146 of the 146 it
applies to; prior knowledge 81 of the 81 it applies to. Sixteen probes skipped
and listed, all for the hunt's shape: nine hunts stand up no brood of two or
more, five have no later ask that requires an item, two have no investigate
stage ahead of the walker. Grades read `h` handled, `a` acknowledged, `p` prior
knowledge; `n/a` where the probe has nothing of that kind to grade.

<details><summary>Every road, every probe (72 rows)</summary>

| hunt | road | taps | probes (handled / acknowledged / prior knowledge) |
|---|---|---|---|
| bog_dragon | obedient | 1005 | the whole hunt, as asked: h=yes a=yes p=n/a |
| bog_dragon | premature | 1559 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| bog_dragon | contrary | 1385 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| bog_dragon | interrupted | 1387 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| mud_titan | obedient | 1166 | the whole hunt, as asked: h=yes a=yes p=n/a |
| mud_titan | premature | 1396 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| mud_titan | contrary | 2581 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| mud_titan | interrupted | 2331 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| sludge_behemoth | obedient | 1610 | the whole hunt, as asked: h=yes a=yes p=n/a |
| sludge_behemoth | premature | 1365 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| sludge_behemoth | contrary | 2217 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; abandon with the items, take it up again: h=yes a=yes p=yes; _skipped: the wrong verb on the right ground_ |
| sludge_behemoth | interrupted | 1546 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| iron_titan | obedient | 1348 | the whole hunt, as asked: h=yes a=yes p=n/a |
| iron_titan | premature | 1860 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| iron_titan | contrary | 2267 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; abandon with the items, take it up again: h=yes a=yes p=yes; _skipped: the wrong verb on the right ground_ |
| iron_titan | interrupted | 1672 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| mud_siren_queen | obedient | 869 | the whole hunt, as asked: h=yes a=yes p=n/a |
| mud_siren_queen | premature | 805 | the apex ground before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes; _skipped: a later door before the first ask_ |
| mud_siren_queen | contrary | 1190 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| mud_siren_queen | interrupted | 783 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| servants_doubter | obedient | 411 | the whole hunt, as asked: h=yes a=yes p=n/a |
| servants_doubter | premature | 669 | the apex ground before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes; _skipped: a later door before the first ask_ |
| servants_doubter | contrary | 825 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| servants_doubter | interrupted | 546 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| steam_walker_zharak | obedient | 1216 | the whole hunt, as asked: h=yes a=yes p=n/a |
| steam_walker_zharak | premature | 1309 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| steam_walker_zharak | contrary | 1248 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| steam_walker_zharak | interrupted | 1410 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| silt_serpent_cathedral | obedient | 1479 | the whole hunt, as asked: h=yes a=yes p=n/a |
| silt_serpent_cathedral | premature | 1522 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| silt_serpent_cathedral | contrary | 2175 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| silt_serpent_cathedral | interrupted | 1305 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| shade_endless_stair | obedient | 965 | the whole hunt, as asked: h=yes a=yes p=n/a |
| shade_endless_stair | premature | 1290 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| shade_endless_stair | contrary | 2085 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| shade_endless_stair | interrupted | 1453 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| mud_siren_drakova | obedient | 1297 | the whole hunt, as asked: h=yes a=yes p=n/a |
| mud_siren_drakova | premature | 1295 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| mud_siren_drakova | contrary | 1585 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| mud_siren_drakova | interrupted | 1096 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| iron_spider_obsidian | obedient | 1074 | the whole hunt, as asked: h=yes a=yes p=n/a |
| iron_spider_obsidian | premature | 1129 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| iron_spider_obsidian | contrary | 1179 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| iron_spider_obsidian | interrupted | 1121 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| apparition_red_tower | obedient | 701 | the whole hunt, as asked: h=yes a=yes p=n/a |
| apparition_red_tower | premature | 617 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| apparition_red_tower | contrary | 1076 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| apparition_red_tower | interrupted | 568 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| mud_harpy_cradle | obedient | 754 | the whole hunt, as asked: h=yes a=yes p=n/a |
| mud_harpy_cradle | premature | 786 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| mud_harpy_cradle | contrary | 1032 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| mud_harpy_cradle | interrupted | 1133 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| dust_fiend_plains | obedient | 640 | the whole hunt, as asked: h=yes a=yes p=n/a |
| dust_fiend_plains | premature | 746 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| dust_fiend_plains | contrary | 1517 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| dust_fiend_plains | interrupted | 554 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| mud_golem_thametan | obedient | 331 | the whole hunt, as asked: h=yes a=yes p=n/a |
| mud_golem_thametan | premature | 598 | the apex ground before the first ask: h=yes a=yes p=n/a; a later door before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes |
| mud_golem_thametan | contrary | 755 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| mud_golem_thametan | interrupted | 383 | one of the brood down, then run: h=yes a=yes p=yes; the apex wounded, then run: h=yes a=yes p=yes |
| plague_moth_enclave | obedient | 867 | the whole hunt, as asked: h=yes a=yes p=n/a |
| plague_moth_enclave | premature | 1395 | the apex ground before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes; _skipped: a later door before the first ask_ |
| plague_moth_enclave | contrary | 2204 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| plague_moth_enclave | interrupted | 1135 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| mud_hound_alpha_yuldra | obedient | 963 | the whole hunt, as asked: h=yes a=yes p=n/a |
| mud_hound_alpha_yuldra | premature | 802 | the apex ground before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes; _skipped: a later door before the first ask_ |
| mud_hound_alpha_yuldra | contrary | 1125 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| mud_hound_alpha_yuldra | interrupted | 757 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |
| salamander_voronov | obedient | 990 | the whole hunt, as asked: h=yes a=yes p=n/a |
| salamander_voronov | premature | 897 | the apex ground before the first ask: h=yes a=yes p=n/a; the proper visits, after the early ones: h=yes a=n/a p=yes; _skipped: a later door before the first ask_ |
| salamander_voronov | contrary | 1664 | the trophy before the hunt: h=yes a=yes p=n/a; walking out on the first ask: h=yes a=yes p=yes; the wrong verb on the right ground: h=yes a=yes p=n/a; abandon with the items, take it up again: h=yes a=yes p=yes |
| salamander_voronov | interrupted | 657 | the apex wounded, then run: h=yes a=yes p=yes; _skipped: one of the brood down, then run_ |

</details>

## Punch list — the game's own gaps

Everything the four sweeps surfaced, with where it went:

1. **The save trimmer measured the whole blob once per room** — the fourth
   sweep's twenty-minute "stalls" and, on a device, a multi-second freeze per
   tap for any save past 800K. Game defect. **Shipped as OTA-1702.**
2. **A same-named wanderer closed a spawn stage** — the corruption apparition
   Aetheric Raven on the Cradle of Dusk; the Sludge Behemoth's brood probe
   broke the same way in sweeps two and three. Game defect. **Shipped as
   OTA-1703** (Enemy.stageKey; the clear credits only the stage's own bodies).
3. **The flee deed still counts bodies by name** (`stageArrival.noteMissionFlee`
   reads `b.name === fight.spawnName`): a wanderer of the brood's name standing
   on the ground when the player runs inflates the "still standing" count the
   return reads back. Open, small, low stakes — it changes a number in a line,
   not a stage. Read it by `stageKey` when the deed writers are next touched.
4. **The walker's own stage test reads names** (`enemiesAreTheStage`). Test-side;
   switch it to `stageKey` alongside item 3.
5. The five walker-side gaps above (the indoor first ask, the silent-flee
   grader, the `'partial'` ceiling, the one-swing brood, the cascade) — all
   fixed in this OTA's test files, none in the game.

Nothing from the eighteen hunts is left graded `no` or `partial`.
