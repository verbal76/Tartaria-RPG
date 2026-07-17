// v2.4.1 (OTA 033) — Mud Flood Nexus main quest arc.
//
// Universal end-game spine every character pursues:
//
//   hook       (character creation)
//     → Arbiter mentions the Mud Flood Nexus once; no active
//       objective yet. The mention is the seed.
//
//   revelation (first arrival at a Lost Capital)
//     → Arbiter or a faction-keyed NPC reveals: there are 5 Aetheric
//       Cores buried inside the 5 Lost Capitals. Reaching the Mud
//       Flood Nexus requires all 9.
//
//   cores      (active recovery)
//     → Player visits each Lost Capital and recovers its Core. Order
//       is free. UI surfaces progress (3/9, etc.).
//
//   descent    (all 9 Cores recovered)
//     → Endless Stair becomes passable. Player can descend to the
//       Aetherstone Deep.
//
//   nexus      (player arrives at Mud Flood Nexus with all 9 Cores)
//     → Terminal scene. The Choice is presented.
//
//   choice     (UI prompt — Seal / Unleash / Preserve)
//
//   ended      (Choice made — credits)
//
// Faction colors HOW each Core is recovered (the route flavor) —
// Reclaimers salvage, Forgotten Order study, Mud Monarchs claim,
// etc. Phase 1 ships the universal spine + a reference route for
// the Reclaimers; the other 8 factions get a generic placeholder
// route until later OTAs fill them in.

import type {
  MainQuestState,
  MainQuestPhase,
  MainQuestEnding,
  PlayerCharacter,
  Intent,
} from './types';

/** The 5 Lost Capitals canonically house one Aetheric Core each. */
export const LOST_CAPITAL_LOCATIONS: readonly string[] = [
  'asgardar',
  'samarran',
  'nimari',
  'drakova',
  'voronov',
  // v2.4.1 (OTA 052) — expanded from 5 to 9 Capitals so the count
  // matches the 9 playable factions. Each new Capital still uses
  // the existing FACTION_CORE_GATES (the gate verb is keyed to
  // your faction, not to the Capital), so the 4 new sites work
  // for any player. Coordinates + Guardian + gear in
  // engine/coreGuardians.ts + engine/atlasCoords.ts.
  'karok_sa',
  'yuldra_tul',
  'ostragar',
  'iskan_veil',
] as const;

/** Mud Flood Nexus is the terminal destination — gated on all 9
 *  Cores being in the player's possession. */
export const NEXUS_LOCATION_ID = 'mud_flood_nexus';

/** Initial state for a fresh character. */
export function initMainQuest(): MainQuestState {
  return { phase: 'hook', coresRecovered: [] };
}

/** Backfill helper for legacy saves. */
export function ensureMainQuest(mq: MainQuestState | undefined): MainQuestState {
  if (mq && typeof mq.phase === 'string') return mq;
  return initMainQuest();
}

// v2.4.1 (OTA 041 — Phase 4a) — variant pools per (faction, phase).
//
// Replay variety. Each (faction, phase) pool holds 3 variant lines;
// the picker uses a deterministic hash of player.name + phase so the
// SAME character always sees the SAME variant for a given phase
// (consistent across save/load), but two characters of the same
// faction see different variants. Authored for hook + revelation +
// descent phases; the core_recovered opener still uses the single
// faction-keyed line from CORE_RECOVERED_LINE.

/** Deterministic 0..n-1 picker based on a string seed. */
function variantIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % length;
}

const HOOK_VARIANTS_BY_FACTION: Record<string, string[]> = {
  reclaimers_guild: [
    'The Arbiter watches you across the firelight. "There is a place under all the others — the Mud Flood Nexus. The Reclaimers have looked for it a long time. None has reached it. The 5 Lost Capitals know the way."',
    'The Arbiter sets the lantern between you. "Every guild veteran retires before they finish the same conversation: the Mud Flood Nexus. Nine Lost Capitals stand between it and any tomb-thief alive. Including you, if you want it."',
    'The Arbiter passes you a worn dig-map. "This was carried by a Reclaimer who never came back. The mark at the bottom is the Mud Flood Nexus. The 9 Capitals are how you get there. Decide whether you want to be the one who finishes the map."',
  ],
  forgotten_order: [
    'The Arbiter sets down a hand-copied page. "Every text the Order has restored points the same direction — the Mud Flood Nexus. The cataclysm did not happen everywhere. It happened HERE. And the 5 Lost Capitals each hold a key."',
    'The Arbiter turns the lectern toward you. "Read it yourself. Every binding text on the shelf agrees — the Nexus exists, the cataclysm passed through it, the 9 Cores in the 9 Capitals are the regulators. The Order has translated this question. Someone still has to answer it."',
    'The Arbiter taps a dynastic crest on a margin. "Tartarian scholarship is unanimous on the Mud Flood Nexus. It is in the earth. The 9 Cores open it. The Order has written the question for six generations. You are the only Order brother currently positioned to live the answer."',
  ],
  mud_monarchs: [
    'The Arbiter speaks low. "Your family has known about the Nexus for three centuries. The 9 Lost Capitals each hold a piece of what bound it. The crown that gathers all nine reopens it."',
    'The Arbiter pours a small Aetheric brandy. "The dynasty has had this conversation many times. The Mud Flood Nexus. The 9 Cores. The choice that comes after. Most of your ancestors chose not to know. You are choosing to know, which is already an act."',
    'The Arbiter studies your face. "If you are reading the family ledger correctly, the Mud Flood Nexus is where the line was lost. The 9 Cores are where it can be reclaimed. The Monarchs have been preparing you to fail at this. You may succeed."',
  ],
  true_tartarians: [
    'The Arbiter inclines their head. "The Entombed speak of the Mud Flood Nexus — the wound that made the buried country. The 5 Lost Capitals each guard a piece of its old binding."',
    'The Arbiter lays a clay seal between you. "The Catacomb keepers have whispered the same name across centuries — Mud Flood Nexus. The 9 Cores in the 9 Capitals are not OURS to take; we ask. The Cores either say yes or they do not."',
    'The Arbiter sets their hand on the bone-shelf. "The True Tartarian tradition has waited for someone to ask the Mud Flood Nexus the right question. The 9 Cores are how you frame it. The Entombed will guide you to each Capital in turn. They are patient."',
  ],
  eternal_dynasty: [
    'The Arbiter folds a yellowed parchment. "The Mud Flood Nexus is where the empire ended. To raise the Dynasty again, the 9 Cores from the 5 Lost Capitals must be returned to it."',
    'The Arbiter shows you the genealogical seal stitched into the parchment. "The Dynasty\'s restoration project has waited for an heir who could carry the 9 Cores from 9 Capitals to the Mud Flood Nexus. You are that heir, or you are not. We will know by your seventh travel."',
    'The Arbiter sets the coronation page in your hands. "The empire ended at the Mud Flood Nexus. The empire can begin again at the same place, with the same 9 Cores in the same hands. The Dynasty has been waiting for hands. Yours are presented."',
  ],
  conspiracy_architects: [
    'The Arbiter slides a redacted file across the desk. "There is a site we have buried our own warnings about — the Mud Flood Nexus. Whoever reaches it with all 9 Cores writes the next chapter. We would prefer no one did."',
    'The Arbiter taps a paragraph that has been blacked out. "The Architects suppress what cannot be allowed to surface. The Mud Flood Nexus and its 9 Cores are at the top of the never-list. You are about to be the first Architect in this office to handle them. The institutions will need to be told something afterwards."',
    'The Arbiter checks the office door is locked. "Three centuries of cover-up rest on the Mud Flood Nexus staying buried. The 9 Cores in the 9 Capitals are the on-switch. The Architects have decided you will be the one to find out whether we are right or wrong to keep the switch off."',
  ],
  servants_of_giants: [
    'The Arbiter touches the lantern. "The Giants speak in their sleep of the Nexus — the wound that drowned them. To wake them properly, the 9 Cores must be returned, each in turn."',
    'The Arbiter kneels by the tomb-lantern. "Every Servant has dreamed of the Mud Flood Nexus. The 5 Giants — one per Capital — each guard one Core. Bring all 9 to the Nexus and the Giants are properly waked, or properly let go. The vigil chooses you, not the other way around."',
    'The Arbiter folds their hands in the old Servant posture. "The Mud Flood Nexus is where the Giants fell silent. The 9 Cores are how their silence is broken — gently, or all at once. You will choose which, when the time comes. Until then, you watch."',
  ],
  stone_builders: [
    'The Arbiter unrolls a draft. "The Mud Flood Nexus is the original Aethercraft engine — the one that failed. The 9 Cores in the 5 Lost Capitals are its old regulators. Recover them, and the engine can be made to work again."',
    'The Arbiter taps the schematic at the bottom-right corner. "Every Builder learns the Mud Flood Nexus failure case as their first lesson. The 9 Cores are the regulators that were not where they were supposed to be when the cycle ran. Bring them back to the Nexus and the failure becomes a successful test."',
    'The Arbiter sets a slide-rule across the plan-table. "The Builders\' founding question: can the Engine that failed at the Mud Flood Nexus be made to succeed? The 9 Cores answer it. You are the apprentice we have been waiting on for two generations."',
  ],
  tartarian_revivalists: [
    'The Arbiter looks up from a stack of unpublished photographs. "When the public sees the Mud Flood Nexus, the surface world ends. We need the 9 Cores from the 5 Lost Capitals to open it. Then everyone will know."',
    'The Arbiter shows you the press kit that has been on hold for forty years. "Every Revivalist generation has tried to publish proof. The 9 Cores are the proof — recoverable, undeniable, photographable. The Mud Flood Nexus is the printing press. The surface world is the readership."',
    'The Arbiter pulls a manuscript from the locked drawer. "The Revival is not a movement. It is a delivery date. The 9 Cores from the 9 Capitals are the delivery; the Mud Flood Nexus is the address. You are the courier the founder has been waiting on."',
  ],
};

const REVELATION_VARIANTS_BY_FACTION: Record<string, string[]> = {
  reclaimers_guild: [
    'A Reclaimer veteran walks you through the standing arches. "Each Capital — Asgardar, Samarran, Nimari, Drakova, Voronov — buries one Aetheric Core. The salvage of a lifetime, if you can pry them loose."',
    'A Reclaimer field-hand crouches beside you with a chalkboard. "9 Cores. 9 Capitals. Take it slow. Each one comes loose if you know the bedding."',
    'A Reclaimer foreman taps the open shaft. "Down there is one of nine. Asgardar, Samarran, Nimari, Drakova, Voronov — the original five. Karok-Sa, Yuldra-Tul, Ostragar, Iskan-Veil — the four we have only re-confirmed in the last decade. Tools first; we\'ll teach you the trick at each site."',
  ],
  forgotten_order: [
    'An Order librarian uncovers a sealed map. "The 9 Cores. One per Capital. Each was placed before the flood and sealed by Aetheric protocols the Order has half-translated. The other half waits inside."',
    'An Order brother whispers across the lectern. "Nine binding texts. Nine Capitals. Each Core is its own argument. You read them in the order Tartaria meant. You finish at the Nexus."',
    'An Order elder shows you the older catalog. "Every Capital was a school. The Cores were their final exams. You take the test in nine rooms, you graduate at the Mud Flood Nexus. Bring a clean pen."',
  ],
  mud_monarchs: [
    'A Monarch agent presents the family ledger. "The 9 Cores by family right belong to you. Drakova, Nimari, Asgardar, Samarran, Voronov. Travel under our standard; the Capitals will recognize your claim — or refuse it, and pay the price."',
    'A Monarch retainer salutes. "The dynastic right has been recorded in our books since the Flood. 9 Cores. Each Capital owes the family one. We have not collected for three centuries. You may. The keepers will know your standard."',
    'A Monarch elder lifts the seal-ring to your hand. "Wear this. The Capital keepers will recognize the family. Each one yields one Core. If a Capital refuses, you have authority to take the Core by other means. The family has not lost a Core yet to a refusing keeper."',
  ],
  true_tartarians: [
    'A True Tartarian elder sketches the old map in clay. "Each Capital is a sleeping mouth. You must enter, ask permission of the Core, and carry it out. Asgardar speaks first. Samarran answers. Nimari listens. Drakova waits. Voronov tests."',
    'A True Tartarian keeper bows you toward the Catacomb mouth. "The 9 Cores are not objects. They are ancestor-aspects, asleep in 9 Capitals. We carry them, we don\'t take them. Ask each one. Listen for the yes."',
    'A True Tartarian elder washes the clay from their hands. "The Cores rest in the 9 Capitals as the Entombed rest in the Catacombs — present, patient, conditional. You ask. They consent. You carry. They guide. The Mud Flood Nexus is where their work resumes."',
  ],
  eternal_dynasty: [
    'A dynastic herald confirms the lineage seal on your hand. "Nine Capitals. Nine Cores. Nine proofs of blood. Asgardar your throne, Samarran your school, Nimari your guard, Drakova your reserve, Voronov your treasury. Each will name you."',
    'A dynastic chancellor presents your line-record. "The Capital keepers are required to recognize the heir. Nine recognitions. Nine Cores returned to the line. Then the Nexus. Then the empire — or whatever you make of it."',
    'A dynastic herald shows you the nine seals stamped in the parchment of your hand. "The Capitals were sworn to the line. The oaths are still in force. Each Core is the keeper\'s proof that they remembered the oath. Nine oaths kept. Then the Nexus. Then the throne, if you want it."',
  ],
  conspiracy_architects: [
    'An Architect senior partner spreads nine dossiers across the table. "The 9 Capitals each contain a Core. We have spent generations preventing anyone from connecting the dots. You are the dot-connector now. We have no further plausible deniability."',
    'An Architect operative pushes a folder of redacted aerial shots toward you. "9 Cores. 9 Capitals. Our standing operation has been to keep them apart. You are the agent who will move them together. The brief is: do not get photographed."',
    'An Architect partner closes the dossier and meets your eye. "We have stopped pretending we can suppress this. Nine Cores. Nine Capitals. You retrieve them under a clean cover story; we manage the press. The Architects step aside at the Nexus and let you decide."',
  ],
  servants_of_giants: [
    'A Servant of the Giants pours libation. "Nine Capitals. Nine Giants. Each Capital is the resting-place of one Giant; each Giant guards one Core. The Giants must consent. They will, if you keep the vigil correctly."',
    'A Servant elder bows toward the eastern wall. "9 Cores rest with 9 Giants in 9 Capitals. We do not take. We sit until the Giant offers. Then we carry. Then we sit again at the next Capital. Nine vigils. Then the Nexus."',
    'A Servant lights the second tomb-lantern. "Each Capital is a chapel to one of the 5 Giants. Each Giant has slept long enough to be approachable. The Cores will come with you if you ask the Giant\'s permission first and not rush the answer."',
  ],
  stone_builders: [
    'A Stone Builder foreman lays out nine blueprints. "Asgardar Core: power. Samarran Core: timing. Nimari Core: shielding. Drakova Core: reserve. Voronov Core: regulator. Assemble them all and the Nexus engine cycles. Miss one, it floods again."',
    'A Stone Builder draftsman points at the schematic. "9 Cores, 5 different roles. The Nexus Engine doesn\'t care about your loyalty; it cares about the Cores being IN it. We give you the tools to extract each one cleanly. The order is up to you."',
    'A Stone Builder master mason draws the assembly diagram in chalk. "Power feeds timing. Timing feeds shielding. Shielding feeds reserve. Reserve feeds regulator. Bring the 9 Cores in any order; the Engine accepts them. Build correctly and the Nexus runs."',
  ],
  tartarian_revivalists: [
    'A Revivalist cell organizer hands you a press kit. "Nine Capitals. Nine recoveries. Nine publishable artifacts. Each Core you bring out goes on the front page. By the time you have all nine, the surface world is asking us for an interview."',
    'A Revivalist photographer hands you a calibrated lens. "9 Cores. 9 Capitals. Each recovery is one published story. We escalate as you accumulate. By the fifth, the surface world is locked in. By the Nexus, the cell is the world\'s new authority."',
    'A Revivalist field organizer gives you the schedule. "Capital one in two weeks. Capital two in a month. The press releases are pre-written; we fill in the Core name as you bring it out. By Capital five, the Revival is the headline. The Nexus is the closer."',
  ],
};

const DESCENT_VARIANTS_BY_FACTION: Record<string, string[]> = {
  reclaimers_guild: [
    'You stand at the head of the Endless Stair with all 9 Cores. The Reclaimers have never reached the bottom. You will be the first.',
    'The Stair has had Reclaimers walk down it before. None walked back up. With the 9 Cores in your pack, the Stair recognizes the cargo and lights the next flight. You may be the first to descend AND return.',
    'You set boot to the first tread of the Endless Stair carrying the salvage of every Reclaimer who failed to. The guild owes you something it will never be able to pay. The Stair settles under your weight, then welcomes you down.',
  ],
  forgotten_order: [
    'The 9 Cores hum together for the first time in a thousand years. The Stair recognizes the harmony and shows its lower turns.',
    'The Stair tests you with a syllabus. Each tread is a passage of pre-flood text; the 9 Cores in your pack translate as you descend. The Order taught you to read; the Stair is the final exam.',
    'You descend with a research library against your back. The 9 Cores cross-reference every footnote the Order has ever filed. The Stair turns under perfect scholarship and shows the next flight.',
  ],
  mud_monarchs: [
    'You hold the 9 Cores as your ancestors meant to. The Stair opens — the family right finally executed.',
    'The dynastic seal recognizes the dynastic descent. The Stair, by ancient protocol, opens its full length to a Monarch carrying all 9. You walk down under the family standard, into the foundation the family was supposed to control.',
    'The Stair has been waiting for a Monarch heir with the will to use the family right. You arrive. The 9 Cores key the descent; the family banner unfurls on every landing as you pass. The empire descends with you in echo.',
  ],
  true_tartarians: [
    'The 9 Cores ride your pack like sleeping children. The Stair, sensing them, draws breath. The Entombed walk down with you in silence.',
    'You carry the 9 Cores as gently as the elders carry the urns. The Stair lights its lower flights only as you approach — the True Tartarian way: never see the bottom until you are there.',
    'The 9 Cores quiet your pack. The Stair quiets the air. The Entombed quiet the procession. You descend in the only manner the tradition recognizes — at the pace of those who have always been carried by it.',
  ],
  eternal_dynasty: [
    'With the 9 Cores returned to your blood, the empire descends with you. The Stair turns under a once-proper authority.',
    'The Stair has not been walked by an heir of the unbroken line since the Flood. Tonight it is. The 9 Cores key the imperial descent; every landing remembers the protocols and dims the lights at your approach.',
    'You descend in the old coronation style — slow, unattended, with the regalia of the line in your pack. The Stair shows you each lower flight as a herald would: with restraint, with dignity, with knowledge of what comes next.',
  ],
  conspiracy_architects: [
    'The 9 Cores together represent an evidentiary crisis. You carry them into the Stair anyway. The Architects will have to manage the press later.',
    'The descent is technically unauthorized. The 9 Cores in your pack are technically state evidence. You make no calls; you take no photographs; you walk down the Stair while the Architects rehearse their morning briefing without you.',
    'You descend as an off-record operative. The 9 Cores are the most secured items the Architects have ever (knowingly) lost custody of. The Stair lights for you anyway. Institutions are not the only authorities that recognize a holder of the full set.',
  ],
  servants_of_giants: [
    'The 9 Cores wake the 5 Giants in their sleep. The Stair shakes once with their stirring, then steadies. The vigil descends with you in silence.',
    'You feel the 5 Giants stir, one to one Core, each in their distant tomb. The Stair takes their weight and yours and steadies. You descend with the long vigil pressing on the back of your neck.',
    'Each step of the Stair is also a step of the vigil. The 9 Cores warm in your pack as the Giants register the procession. You descend with the patience the tradition trained into you. The Giants are watching down the Stair with you.',
  ],
  stone_builders: [
    'The 9 Cores in series. The Stair powers up like a long-disused engine — old Aethercraft warming. Each tread firms under your foot as the system cycles.',
    'You descend by Aethercraft, not by gravity. The 9 Cores in series provide the lift, the Stair provides the geometry, and you are the operator. Every tread is a sub-system bringing itself online. The Engine is the Stair.',
    'The 9 Cores in your pack are the regulators the Stair has been missing. As you descend, each Core cycles into provisional series. The Stair, properly regulated, finally feels like the engine the Builders always argued it was.',
  ],
  tartarian_revivalists: [
    'You have all 9 Cores and a documentary crew waiting at the surface. The Stair opens. The world is about to learn what was buried.',
    'You descend with the cell\'s cameras tucked safely above. The 9 Cores are the closing footage. The Stair takes you down toward the headline the Revival has been waiting four generations to print.',
    'The 9 Cores in your pack are the evidence the surface world cannot ignore. The Stair, knowing what you carry, opens the lower flights without delay. The Revival\'s last and longest dispatch begins now.',
  ],
};

/** Arbiter narration per phase entry. Each phase logs ONE line on
 *  entry (the player just transitioned into this phase). The line
 *  varies by player faction AND — Phase 4a — by character seed so
 *  two characters of the same faction get different variants. */
const HOOK_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'The Arbiter watches you across the firelight. "There is a place under all the others — the Mud Flood Nexus. The Reclaimers have looked for it a long time. None has reached it. The 5 Lost Capitals know the way."',
  forgotten_order:
    'The Arbiter sets down a hand-copied page. "Every text the Order has restored points the same direction — the Mud Flood Nexus. The cataclysm did not happen everywhere. It happened HERE. And the 5 Lost Capitals each hold a key."',
  mud_monarchs:
    'The Arbiter speaks low. "Your family has known about the Nexus for three centuries. The 9 Lost Capitals each hold a piece of what bound it. The crown that gathers all nine reopens it."',
  true_tartarians:
    'The Arbiter inclines their head. "The Entombed speak of the Mud Flood Nexus — the wound that made the buried country. The 5 Lost Capitals each guard a piece of its old binding."',
  eternal_dynasty:
    'The Arbiter folds a yellowed parchment. "The Mud Flood Nexus is where the empire ended. To raise the Dynasty again, the 9 Cores from the 5 Lost Capitals must be returned to it."',
  conspiracy_architects:
    'The Arbiter slides a redacted file across the desk. "There is a site we have buried our own warnings about — the Mud Flood Nexus. Whoever reaches it with all 9 Cores writes the next chapter. We would prefer no one did."',
  servants_of_giants:
    'The Arbiter touches the lantern. "The Giants speak in their sleep of the Nexus — the wound that drowned them. To wake them properly, the 9 Cores must be returned, each in turn."',
  stone_builders:
    'The Arbiter unrolls a draft. "The Mud Flood Nexus is the original Aethercraft engine — the one that failed. The 9 Cores in the 5 Lost Capitals are its old regulators. Recover them, and the engine can be made to work again."',
  tartarian_revivalists:
    'The Arbiter looks up from a stack of unpublished photographs. "When the public sees the Mud Flood Nexus, the surface world ends. We need the 9 Cores from the 5 Lost Capitals to open it. Then everyone will know."',
};

const REVELATION_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'A Reclaimer veteran walks you through the standing arches. "Each Capital — Asgardar, Samarran, Nimari, Drakova, Voronov — buries one Aetheric Core. The salvage of a lifetime, if you can pry them loose."',
  forgotten_order:
    'An Order librarian uncovers a sealed map. "The 9 Cores. One per Capital. Each was placed before the flood and sealed by Aetheric protocols the Order has half-translated. The other half waits inside."',
  mud_monarchs:
    'A Monarch agent presents the family ledger. "The 9 Cores by family right belong to you. Drakova, Nimari, Asgardar, Samarran, Voronov. Travel under our standard; the Capitals will recognize your claim — or refuse it, and pay the price."',
  true_tartarians:
    'A True Tartarian elder sketches the old map in clay. "Each Capital is a sleeping mouth. You must enter, ask permission of the Core, and carry it out. Asgardar speaks first. Samarran answers. Nimari listens. Drakova waits. Voronov tests."',
  eternal_dynasty:
    'A dynastic herald confirms the lineage seal on your hand. "Nine Capitals. Nine Cores. Nine proofs of blood. Asgardar your throne, Samarran your school, Nimari your guard, Drakova your reserve, Voronov your treasury. Each will name you."',
  conspiracy_architects:
    'An Architect senior partner spreads nine dossiers across the table. "The 9 Capitals each contain a Core. We have spent generations preventing anyone from connecting the dots. You are the dot-connector now. We have no further plausible deniability."',
  servants_of_giants:
    'A Servant of the Giants pours libation. "Nine Capitals. Nine Giants. Each Capital is the resting-place of one Giant; each Giant guards one Core. The Giants must consent. They will, if you keep the vigil correctly."',
  stone_builders:
    'A Stone Builder foreman lays out nine blueprints. "Asgardar Core: power. Samarran Core: timing. Nimari Core: shielding. Drakova Core: reserve. Voronov Core: regulator. Assemble them all and the Nexus engine cycles. Miss one, it floods again."',
  tartarian_revivalists:
    'A Revivalist cell organizer hands you a press kit. "Nine Capitals. Nine recoveries. Nine publishable artifacts. Each Core you bring out goes on the front page. By the time you have all nine, the surface world is asking us for an interview."',
};

const CORE_RECOVERED_LINE = (factionId: string, capitalId: string, recoveredCount: number): string => {
  const capitalName = LOST_CAPITAL_NAMES[capitalId] ?? capitalId;
  const remaining = 9 - recoveredCount;
  const tail = remaining === 0
    ? 'All nine Cores rest in your pack. The Endless Stair will open to a carrier of the full set.'
    : `${remaining} Core${remaining === 1 ? '' : 's'} still to recover.`;
  // Faction-flavored opener — kept terse so the cadence doesn't drag
  // when the player is mid-action.
  const opener: Record<string, string> = {
    reclaimers_guild:    `The ${capitalName} Core comes loose under your trowel — pried clean from its Tartarian seat.`,
    forgotten_order:     `The ${capitalName} Core releases on the third reading of its binding text. The Order's scholarship holds.`,
    mud_monarchs:        `The ${capitalName} Core acknowledges your blood and lets itself be lifted. Family right, family due.`,
    true_tartarians:     `The ${capitalName} Core consents to be carried. The Entombed approve.`,
    eternal_dynasty:     `The ${capitalName} Core knows you. The lineage is unbroken. It lifts to your hand.`,
    conspiracy_architects: `The ${capitalName} Core was already half-loose from a prior, unrecorded recovery. You complete the job.`,
    servants_of_giants:  `The ${capitalName} Core is released by the watching Giant. The vigil holds.`,
    stone_builders:      `The ${capitalName} Core is decoupled with the right tools and three calm hours of work. Aethercraft is method.`,
    tartarian_revivalists: `The ${capitalName} Core is yours. The cell will have the footage by morning.`,
  };
  const line = opener[factionId] ?? `The ${capitalName} Core is yours.`;
  return `${line} ${tail}`;
};

export const LOST_CAPITAL_NAMES: Record<string, string> = {
  asgardar: 'Asgardar',
  samarran: 'Samarran',
  nimari: 'Nimari',
  drakova: 'Drakova',
  voronov: 'Voronov',
  // OTA 459 — the four Capitals added in OTA 052 were never wired
  // into LOST_CAPITAL_NAMES; recoveries fell back to the raw id
  // ("the karok_sa Core") instead of the display name.
  karok_sa: 'Karok-Sa',
  yuldra_tul: 'Yuldra-Tul',
  ostragar: 'Ostragar',
  iskan_veil: 'Iskan-Veil',
};

// OTA-442 — [audit #22] one-time ARRIVAL SIGNATURE per Lost Capital. The nine
// Capitals share generic exploration scene-composition, so they read the same
// once you're walking them. A distinct sensory beat on FIRST entry — keyed off
// each Capital's authored identity (its Spire / Tower / frost / river / sigils)
// — stamps the place in the player's memory so the set never feels samey. Fires
// once per Capital per character (gated by worldMemory.capitalArrivalSeen).
const CAPITAL_ARRIVAL_SIGNATURES: Record<string, string> = {
  asgardar:
    'Asgardar announces itself before you crest the rise: the Grand Spire of Etheria, snapped a third of the way up, still hums a single sub-audible note that you feel in your teeth more than hear. Aether-light crawls the old channel-grooves like slow lightning that forgot how to strike.',
  samarran:
    'Samarran is all broken glass and cold arithmetic. Thametan\'s Tower leans over a plaza of shattered lenses, and the dead Etheric Engine at its heart still ticks — one wrong, patient click every few seconds, like a clock counting down to something that already happened.',
  nimari:
    'Half of Nimari is under the silt; the half that isn\'t is red. The Red Tower throws a long rust-coloured shadow across drowned streets, and somewhere inside it a working Aetheric core pulses warm enough that the mud around your boots steams faintly.',
  drakova:
    'Drakova you reach by going down — a throat of hardened Aetherstone mud sealed over a city that never saw the sky again. Your lantern light dies three feet out. The dark here is old, and it is full, and it does not like being looked at.',
  voronov:
    'Voronov took the Mud Flood across the jaw. Whole districts lie tipped on their sides, rooftops for floors, and the wind through the canted streets makes a low mourning sound. Intact things glint in the wreckage — the city kept its treasures by burying its people on top of them.',
  karok_sa:
    'Karok-Sa is silent the way a held breath is silent. Every wall of the Forgotten Order\'s ritual seat is carved floor-to-vault with binding-sigils, and as you pass they seem to turn — not the stone, but the meaning — to keep facing you. The air tastes of chalk and old intent.',
  yuldra_tul:
    'Yuldra-Tul bites. Frost sheaths the gate-city to the Giants\' tombs in blue-white rime, and your breath freezes on your collar before it leaves your mouth. The mountain holds the cold like a grudge, and far up the pass, shapes too large to be men lie under the snow, waiting out the centuries.',
  ostragar:
    'Ostragar moves. The Eternal Dynasty\'s river city sits half-drowned in a slow brown current that runs the wrong way past your shins, threading between sunken colonnades. Something in the water keeps pace with you just under the surface, and the reeds bow as you pass, then straighten behind you.',
  iskan_veil:
    'Iskan-Veil refuses to hold still in your head. The Conspiracy Architects built a maze of false doors and lying corridors, and the far-northern light comes in flat and grey through windows that open onto walls. Twice you are sure you\'ve been here already. Twice you are wrong. Or right.',
};

/** OTA-442 — the one-time arrival signature for a Lost Capital, or null. */
export function capitalArrivalSignature(capitalId: string): string | null {
  return CAPITAL_ARRIVAL_SIGNATURES[capitalId] ?? null;
}

const DESCENT_LINE_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'You stand at the head of the Endless Stair with all 9 Cores. The Reclaimers have never reached the bottom. You will be the first.',
  forgotten_order:
    'The 9 Cores hum together for the first time in a thousand years. The Stair recognizes the harmony and shows its lower turns.',
  mud_monarchs:
    'You hold the 9 Cores as your ancestors meant to. The Stair opens — the family right finally executed.',
  true_tartarians:
    'The 9 Cores ride your pack like sleeping children. The Stair, sensing them, draws breath. The Entombed walk down with you in silence.',
  eternal_dynasty:
    'With the 9 Cores returned to your blood, the empire descends with you. The Stair turns under a once-proper authority.',
  conspiracy_architects:
    'The 9 Cores together represent an evidentiary crisis. You carry them into the Stair anyway. The Architects will have to manage the press later.',
  servants_of_giants:
    'The 9 Cores wake the 5 Giants in their sleep. The Stair shakes once with their stirring, then steadies. The vigil descends with you.',
  stone_builders:
    'The 9 Cores in series. The Stair powers up like a long-disused engine — old Aethercraft warming. Each tread firms under your foot as the system cycles.',
  tartarian_revivalists:
    'You have all 9 Cores and a documentary crew waiting at the surface. The Stair opens. The world is about to learn what was buried.',
};

const NEXUS_ARRIVAL_LINE =
  'You arrive at the Mud Flood Nexus. The chamber is older than every kingdom drawn on every honest map. The 9 Cores in your pack pulse in concord. The control mantle waits — three actions are possible. None is reversible.';

// v2.4.1 (OTA 038) — Phase 5: Mud Flood Nexus interior scene.
//
// When the player arrives with all 9 Cores, the engine plays a
// multi-paragraph cinematic that walks them up to the control mantle
// and slots each Core into its named receptacle, in canonical order
// (Asgardar first, Mud Flood Nexus last). Each slot is a beat of
// authored narration; collectively they pace the terminal moment so
// the Choice doesn't land flat.
//
// Called from gameStore when the player enters mud_flood_nexus AND
// mainQuest.phase advances to 'choice' (i.e. all 9 Cores present).
// Returns the array of narration lines; the caller appends each as
// its own log entry so AdventureFeed renders them as paragraphs.
export interface NexusSlotBeat {
  capitalId: string;
  capitalName: string;
  line: string;
}

export const NEXUS_SLOT_BEATS: readonly NexusSlotBeat[] = [
  {
    capitalId: 'asgardar',
    capitalName: 'Asgardar',
    line: 'You lift the Asgardar Core from your pack and set it in the first receptacle — the crowned seat at the mantle\'s peak. The Aether in the chamber answers, low and certain. The lights on the wall, dead for a thousand years, take their first breath.',
  },
  {
    capitalId: 'samarran',
    capitalName: 'Samarran',
    line: 'The Samarran Core slots into the timing-seat next. The Engine begins keeping time again. A long-stilled metronome in the chamber\'s wall ticks once, twice, holds — a heartbeat returning.',
  },
  {
    capitalId: 'nimari',
    capitalName: 'Nimari',
    line: 'The Nimari Core takes the shielding-seat. A field of soft red Aether haloes you and the mantle alike — the chamber is no longer porous to the world above. Whatever you do here is sealed inside these walls.',
  },
  {
    capitalId: 'drakova',
    capitalName: 'Drakova',
    line: 'The Drakova Core finds the reserve-seat. The mantle\'s power gauge — a column of mud-glass shot through with Aether — fills from its empty bottom to the second mark. The Engine can run for a long time now.',
  },
  {
    capitalId: 'voronov',
    capitalName: 'Voronov',
    line: 'The Voronov Core lands in the regulator-seat. The chamber\'s lights firm to a clean amber for the first time, the metronome steadies into a real beat, and the control mantle begins to wake.',
  },
  // v2.4.1 (OTA 052) — four additional slot beats for the four
  // Capitals added when the Core count expanded from 5 to 9.
  {
    capitalId: 'karok_sa',
    capitalName: 'Karok-Sa',
    line: 'The Karok-Sa Core slides into the binding-seat. The sigils Tobiel carved into his own chamber answer here, a thousand miles away — the seal-chain on the mantle\'s flank flares once and locks the Engine\'s frame closed. The Order\'s last work, undone in your favour.',
  },
  {
    capitalId: 'yuldra_tul',
    capitalName: 'Yuldra-Tul',
    line: 'The Yuldra-Tul Core takes the vigil-seat. A wash of cold runs once through the chamber and is gone. The Giant beneath the mountain shifts in its sleep, finds nothing to wake for, settles back down. The Engine\'s coolant loop runs for the first time since the Flood.',
  },
  {
    capitalId: 'ostragar',
    capitalName: 'Ostragar',
    line: 'The Ostragar Core finds the cadence-seat. Slow water-sound moves through the chamber for one long beat — Ostros\' river answering its bound rune from the other side of the world. The Engine\'s rhythm doubles, then folds in on itself, true.',
  },
  {
    capitalId: 'iskan_veil',
    capitalName: 'Iskan-Veil',
    line: 'The Iskan-Veil Core slips into the masking-seat — the last one, the one Inarra hid behind a door no scout-priest ever wrote down. The mantle goes quiet. Every false door in Iskan-Veil, a thousand miles back, opens at once and stays open. The Engine is whole, since 1530.',
  },
];

/** The pre-Choice walk-up narration. Called by gameStore when the
 *  player has all 9 Cores and steps into mud_flood_nexus. Returns
 *  an ordered list of lines: arrival + 5 slot beats + the prompt to
 *  decide. AdventureFeed appends each as a paragraph. */
export function nexusArrivalCinematic(): string[] {
  const lines: string[] = [NEXUS_ARRIVAL_LINE];
  for (const beat of NEXUS_SLOT_BEATS) lines.push(beat.line);
  lines.push(
    'Three actions remain. SEAL — collapse the Aether back into stillness, lock Tartaria where it was buried, and walk out under a quiet sky. UNLEASH — open the chamber\'s old throat and let the Aether climb back up into the world; what comes next is not yours to manage. PRESERVE — leave the mantle live but unsigned, walk out with the 9 Cores still in your pack, and carry the keys to a cataclysm only you can choose to use. Decide from the Contracts screen.',
  );
  return lines;
}

// v2.4.1 (OTA 039-041 — Phase 3) — faction-reactive endings.
//
// Each of seal / unleash / preserve plays a faction-specific line
// when the player makes The Choice. The same act has nine different
// meanings depending on whose colors you wear at the moment of
// decision. Fallback to the universal line if a faction isn't mapped
// (legacy / unknown faction).
const SEAL_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'You SEAL the Nexus. The Cores fuse into the mantle and the Aetheric pressure under Tartaria drops to ambient. The Reclaimers will dig forever in a quiet world — every wreck, every relic, every silt-stratum still there, just no longer screaming when you pry it. You walk out and the Outpost lanterns burn a half-shade softer than they did this morning.',
  forgotten_order:
    'You SEAL the Nexus. Every Tartarian text the Order has ever restored, and every text it will ever restore, becomes purely historical — the words still speak, but they no longer reach back to a live Aetheric source. Scholarship is now its own end, not a path to power. Jorah will be relieved. The youngest novices will, in a generation, not understand what was lost. That is the price.',
  mud_monarchs:
    'You SEAL the Nexus. The family business — three centuries of suppression, indices, redactions, and the occasional discreet killing — concludes with no buried Tartaria left to suppress. The Monarchs will become curators of an emptied secret, then irrelevant, then forgotten. Your bloodline ends quietly in archives, which is the closest thing to mercy your line has ever been offered.',
  true_tartarians:
    'You SEAL the Nexus. The Entombed exhale once and then settle — for the first time since the Flood, the old country is at rest instead of waiting. The Catacombs will go on, the rites will continue, but the urgency has left them. You return to a True Tartarian Hall lit only by tomb-lanterns; the elders bow without speaking. The vigil is complete.',
  eternal_dynasty:
    'You SEAL the Nexus. The empire will not be raised. The dynasty\'s long restoration project is, at the final hour, set aside — not abandoned in shame but concluded in mercy. The Throne Promenade darkens behind you as you leave. The line ends here, with you, sealing rather than ruling. There are dignities higher than power.',
  conspiracy_architects:
    'You SEAL the Nexus. The Architects\' three-hundred-year suppression project ends in vindication — there is now nothing left to hide because there is nothing left to find. The institutions stay institutions. The surface world keeps its innocence. Your career, ironically, never happened officially. There is no commendation. There is no headline. There is only the desk you go back to.',
  servants_of_giants:
    'You SEAL the Nexus. The Giants in their nine Capital-tombs sleep more deeply than they have since the Flood — no Aether-strain, no half-stirring, no centuries of being almost-awake. The vigil you have kept your whole life finally has a purpose: not to wake them, but to let them rest. The lanterns in every Vigil cell across the world dim to a single warm point and stay there.',
  stone_builders:
    'You SEAL the Nexus. The Engine you have studied your entire career powers down cleanly for the first time. Aethercraft becomes a craft, not a power tap — what you build now must stand on its own structural merit, no Aetheric shortcut, no live Nexus to draw from. The workshop will be smaller. The work will be better.',
  tartarian_revivalists:
    'You SEAL the Nexus. The story the cell was going to publish is now a different story — not "Tartaria is real and live" but "Tartaria existed and we found it and we put it back to sleep responsibly." It will not headline. It will not win. The movement will fade. But every member of the cell, including you, will know that the Revival\'s final act was the right one. That is enough.',
};

const UNLEASH_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'You UNLEASH the Nexus. Aether climbs back up through every silt stratum the Reclaimers have ever dug. The relics you sold last season wake on the buyer\'s shelves. Every wreck in every Outskirts mud-pool starts moving again. The guild is suddenly the most important institution on the surface — every salvage haul is now a live wire. The Outpost lanterns burn three shades brighter and will not stop.',
  forgotten_order:
    'You UNLEASH the Nexus. Every Tartarian text the Order has ever restored becomes a live conduit — the words speak themselves aloud in the reading rooms. Jorah faints. The Cloister becomes the most consequential building in the empire overnight. The Order has been preparing to LISTEN to dead languages; it must now decide what to do when those languages issue commands.',
  mud_monarchs:
    'You UNLEASH the Nexus. The family\'s ancestral right is reactivated — every dynastic blade hums, every Monarch standard glows faintly Aetheric, the line\'s old machines wake in the cabinet vaults. The Mud Monarchs are an imperial power again, three centuries after they thought that game was lost. The world will react badly. You will rule the reaction.',
  true_tartarians:
    'You UNLEASH the Nexus. The Entombed wake. Not all of them — the lucky ones, the recent ones, the ones whose clay seals were still good. They walk out into a Catacomb that has not held living Tartarians since before the Flood. The True Tartarian Hall, long the home of memory, is now the home of return. The elders are weeping. So are you.',
  eternal_dynasty:
    'You UNLEASH the Nexus. The empire stirs at every Lost Capital simultaneously. Asgardar\'s Grand Spire lights for the first time in a millennium. Samarran\'s engines rouse. Drakova\'s walls remember they were walls. The Throne Promenade behind you fills with the echo of feet that haven\'t walked it in a thousand years. The Dynasty is restored. You are its emperor. The crown is heavier than you expected.',
  conspiracy_architects:
    'You UNLEASH the Nexus. The Architects\' suppression project ends in the most public possible defeat — Tartaria is on every front page within forty-eight hours, and the institutions you spent your career propping up issue contradictory press releases for two weeks. You will be fired. Your superiors will retire. The cover-up is over because the thing being covered is now visible to everyone. There is a strange relief in that.',
  servants_of_giants:
    'You UNLEASH the Nexus. The Giants WAKE. Nine of them. Each one rises from its Capital-tomb at the same minute, blinks once at a world it does not recognize, and looks for someone to talk to. The Servants have prepared for this moment for centuries; nobody is actually ready for it. The Giants are ten times your size and not in the mood to be lectured. You are the most senior Servant on the field. Speak well.',
  stone_builders:
    'You UNLEASH the Nexus. The Engine reaches full output. Every Aethercraft work the Builders have ever raised — every stone, every conduit, every workshop tool — sings on the live Aether for the first time since the Flood. Tarek calls in tears: the prototype cores in the Materials Vault have woken on their own and are asking for direction. The Builders are now custodians of an empire-grade power grid. The work just got real.',
  tartarian_revivalists:
    'You UNLEASH the Nexus. The cell\'s long-prepared press kit goes out at sunrise — every photograph, every recovered text, every interview with you about your role in The Recovery. Tartaria is real. Tartaria is live. The surface world has 24 hours to decide what to do with this information. The Revivalists have what they always wanted: a public, undeniable Tartaria. Now they have to lead the world through what comes next, which is harder than the Revival ever was.',
};

const PRESERVE_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'You PRESERVE. The 9 Cores stay in your pack; the Nexus mantle stays mute. The Reclaimers carry on as they always have — quiet, careful, salvaging what the buried world surrenders without ever forcing the lock. You are now the only Reclaimer alive who has held all 9 Cores and could end Tartaria with a single decision. You will not. That restraint becomes the guild\'s new motto, even though only you know why.',
  forgotten_order:
    'You PRESERVE. The Order\'s research continues without a live Nexus to reference; the scholarship now has a purpose it never had — to KEEP Tartaria readable across the centuries you will spend not deciding. You leave the Cloister with the 9 Cores in your pack. The Master Scholar will know what they are by the weight of your bag, and will say nothing.',
  mud_monarchs:
    'You PRESERVE. The family wins the way the family always wins — by not playing the hand. The 9 Cores in your pack become the dynasty\'s ultimate reserve, a power that exists in potentia and is never burned. You are now the most important Mud Monarch alive. Your descendants will inherit the choice; you trust them to keep deferring it. That trust is the dynasty.',
  true_tartarians:
    'You PRESERVE. The Entombed are not woken; the country is not raised; the Catacombs continue. You become the Carrier — a True Tartarian tradition the elders have whispered about since the first generation, prepared for and never until now used. The 9 Cores stay in your pack for the rest of your life. The vigil now includes you. There is no shame in this. There is only the work.',
  eternal_dynasty:
    'You PRESERVE. The empire stays in potentia. The crown stays uncrowned. You walk out of the Nexus carrying the 9 Cores like a sword in its scabbard, drawn only if drawn at all. The dynasty\'s long restoration project continues in private rather than public — every heir to the line will inherit what you have, and the option to act on it. None of them will, you suspect. The dynasty\'s real power was always restraint.',
  conspiracy_architects:
    'You PRESERVE. The Architects\' suppression project continues, but now its strongest evidence — the 9 Cores — is in YOUR pack, not in any of the institutional vaults. You leave the Nexus and report to no one. The institutions you work for will never know how close they came to losing control. You will spend the rest of your career managing a secret only one person on Earth holds. The promotion is unspoken.',
  servants_of_giants:
    'You PRESERVE. The Giants sleep on. You sit a longer vigil now — one that goes on for the rest of your life, with the 9 Cores in your pack as the relic of your office. The Servants of every Capital begin treating you as the senior Servant, though no one says so. The lanterns in every Vigil cell across the world burn one shade warmer in your honor, also unspoken. The watch is complete because you keep it.',
  stone_builders:
    'You PRESERVE. The Engine stays unbooted. The 9 Cores in your pack become the most valuable Aethercraft components ever assembled — and you build nothing from them. The Builders\' real masterwork is not what they raise but what they could raise and choose not to. Your workshop becomes a pilgrimage site within the order. Apprentices learn restraint from your example. The craft sharpens.',
  tartarian_revivalists:
    'You PRESERVE. The story the cell was going to publish is rewritten one more time — not "Tartaria is real and live" or "Tartaria has been responsibly sealed" but "Tartaria endures, the truth is held by those who can be trusted with it, and the world will be told when the world is ready." You become the cell\'s archivist-general. The 9 Cores stay with you. The Revival becomes a Reserve. The work continues, quieter, perhaps forever.',
};

const CHOICE_LINE_BY_ENDING: Record<MainQuestEnding, string> = {
  seal: 'You SEAL the Nexus. The cataclysm is locked away — Tartaria stays buried, the surface world stays innocent. The Cores fuse into the mantle as you set the last one. The chamber dims. You can walk out, or stay until the dim takes you. Either is a kind of ending.',
  unleash: 'You UNLEASH the Nexus. The cataclysm cycles back — Aetheric pressure rises, the surface tremors, every buried Tartaria stirs at once. What comes next is no longer in any one person\'s hands. Your faction will write the aftermath. You walk out under sky that has changed color.',
  preserve: 'You PRESERVE. The Cores stay in your pack; the Nexus stays mute; the world stays in equilibrium. You leave the chamber unsigned. Tartaria, the buried country, remains buried — but you carry the keys. Each Capital remembers you brought one back. They will remember.',
};

/** Return the faction-flavored ending line (Phase 3), falling back
 *  to the universal CHOICE_LINE_BY_ENDING when a faction isn't
 *  mapped or factionId is missing. */
export function endingLine(ending: MainQuestEnding, factionId: string | undefined): string {
  const map = ending === 'seal' ? SEAL_BY_FACTION
    : ending === 'unleash' ? UNLEASH_BY_FACTION
    : PRESERVE_BY_FACTION;
  if (factionId && map[factionId]) return map[factionId]!;
  return CHOICE_LINE_BY_ENDING[ending];
}

const FACTION_ROUTE_PLACEHOLDER = (factionId: string): string => {
  const name: Record<string, string> = {
    reclaimers_guild: "the Reclaimers' salvage route",
    forgotten_order: "the Forgotten Order's scholarship route",
    mud_monarchs: "the Mud Monarchs' claim-by-blood route",
    true_tartarians: "the True Tartarians' reverent route",
    eternal_dynasty: "the Eternal Dynasty's lineage route",
    conspiracy_architects: "the Conspiracy Architects' infiltration route",
    servants_of_giants: "the Servants' vigil route",
    stone_builders: "the Stone Builders' Aethercraft route",
    tartarian_revivalists: "the Revivalists' public-recovery route",
  };
  const route = name[factionId] ?? 'your faction route';
  return `${route} for the Cores is being authored in a coming OTA. For now, recover each Core however the world lets you — visit each Lost Capital and the engine will register the Core when you carry one back to your hub. The reference route (Reclaimers' salvage) is fully live; other factions will get their authored variants soon.`;
};

/** Pick a variant from a per-faction pool deterministically by a
 *  seed (typically player.name). Falls back to the single-line
 *  per-faction map when the variant pool isn't authored. */
function pickFactionVariant(
  variants: Record<string, string[]>,
  legacy: Record<string, string>,
  factionId: string,
  seed: string,
  phaseTag: string,
): string {
  const pool = variants[factionId] ?? variants.reclaimers_guild ?? [];
  if (pool.length > 0) {
    const idx = variantIndex(`${seed}|${phaseTag}`, pool.length);
    return pool[idx]!;
  }
  return legacy[factionId] ?? legacy.reclaimers_guild ?? '';
}

/** Return the narration line for entering the given phase.
 *  v2.4.1 (OTA 041 — Phase 4a) — when seed is provided (typically
 *  player.name), hook/revelation/descent draw from 3-variant pools
 *  per faction. Same character always sees the same variant; two
 *  characters of the same faction see different ones. */
export function narrationForPhase(
  phase: MainQuestPhase,
  factionId: string,
  context?: { coreRecovered?: string; coresCount?: number; ending?: MainQuestEnding; seed?: string },
): string {
  const seed = context?.seed ?? '';
  switch (phase) {
    case 'hook':
      return pickFactionVariant(HOOK_VARIANTS_BY_FACTION, HOOK_BY_FACTION, factionId, seed, 'hook');
    case 'revelation':
      return pickFactionVariant(REVELATION_VARIANTS_BY_FACTION, REVELATION_BY_FACTION, factionId, seed, 'revelation');
    case 'cores':
      if (context?.coreRecovered && context?.coresCount != null) {
        return CORE_RECOVERED_LINE(factionId, context.coreRecovered, context.coresCount);
      }
      return FACTION_ROUTE_PLACEHOLDER(factionId);
    case 'descent':
      return pickFactionVariant(DESCENT_VARIANTS_BY_FACTION, DESCENT_LINE_BY_FACTION, factionId, seed, 'descent');
    case 'nexus':
      return NEXUS_ARRIVAL_LINE;
    case 'choice':
      return 'The Nexus offers three paths: SEAL the cataclysm, UNLEASH it, or PRESERVE the balance. Each is final. Choose from the Contracts screen.';
    case 'ended':
      return context?.ending ? endingLine(context.ending, factionId) : 'The story is closed for this character.';
    default:
      return '';
  }
}

/** UI display: short label per phase for the main-quest card. */
export function phaseLabel(phase: MainQuestPhase): string {
  switch (phase) {
    case 'hook':       return 'A rumor, nothing more';
    case 'revelation': return 'Nine Cores, nine Capitals';
    case 'cores':      return 'Recovering the Cores';
    case 'descent':    return 'The Endless Stair opens';
    case 'nexus':      return 'At the Mud Flood Nexus';
    case 'choice':     return 'The Choice waits';
    case 'ended':      return 'The story is closed';
  }
}

/** Next-step hint for the main-quest card. Tells the player what
 *  to do next without spelling out the mechanic. */
export function phaseHint(phase: MainQuestPhase, coresRecovered: number): string {
  switch (phase) {
    case 'hook':
      // OTA-430 — list ALL nine Capitals, built from the canonical name map so
      // it never drifts. The old hint named only the original five (Asgardar…
      // Voronov), so a player who cleared those five thought the hunt was over
      // and never visited Karok-Sa / Yuldra-Tul / Ostragar / Iskan-Veil.
      return `Visit a Lost Capital (${LOST_CAPITAL_LOCATIONS.map((id) => LOST_CAPITAL_NAMES[id] ?? id).join(', ')}) to learn what the Cores demand.`;
    case 'revelation':
      return `Recover 1 of 9 Cores by visiting a Lost Capital. Each yields its Core to the right approach.`;
    case 'cores':
      return `${coresRecovered}/9 Cores recovered. Visit the remaining Lost Capitals.`;
    case 'descent':
      // OTA-430 — the quest advances when the player reaches the Mud Flood
      // Nexus (the `reached_nexus` trigger keys on locationId
      // 'mud_flood_nexus'), NOT the Endless Stair. The old hint sent players to
      // the Stair, where nothing happens. Name the Nexus as the destination and
      // keep the Stair as the path-flavor it is.
      return 'All 9 Cores in your pack. Travel to the Mud Flood Nexus — at the foot of the Endless Stair — and descend into it.';
    case 'nexus':
      return 'You are at the Mud Flood Nexus. Open the Contracts screen to make The Choice.';
    case 'choice':
      return 'The Choice waits. Decide on the Contracts screen.';
    case 'ended':
      return 'This run is done. Start a new character to make a different Choice.';
  }
}

/** Capital ids the player has NOT yet recovered a Core from. */
export function remainingCapitals(state: MainQuestState): string[] {
  return LOST_CAPITAL_LOCATIONS.filter((id) => !state.coresRecovered.includes(id));
}

// v2.4.1 (OTA 042 — Phase 4b) — mid-arc twist: rival faction
// pressure at the 3-Core mark. Each faction's primary rival shows
// up at the player's hub and pressures them about the impending
// Choice. One-shot per character (gated by twistsFired flag).
//
// Rival map authored from factions.json — each faction's named
// rival who'd most plausibly come knocking three-quarters of the
// way through the Core hunt.
const RIVAL_BY_FACTION: Record<string, string> = {
  reclaimers_guild:     'Mud Monarch Inquisitor',
  forgotten_order:      'Mud Monarch Cipher-Hand',
  mud_monarchs:         'Forgotten Order Reader',
  true_tartarians:      'Conspiracy Architects Operative',
  eternal_dynasty:      'Mud Monarch Spymaster',
  conspiracy_architects: 'Tartarian Revivalist organizer',
  servants_of_giants:   'Stone Builder field foreman',
  stone_builders:       'Servants of the Giants warden',
  tartarian_revivalists: 'Conspiracy Architects senior partner',
};

const RIVAL_PRESSURE_LINE_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'A {rival} corners you at the Outpost. "Three Cores already. We do not interfere with salvage — until salvage gets to four. After that we have to. Be aware that we are aware. Decide accordingly."',
  forgotten_order:
    'A {rival} sets a folded note on your reading desk. "Three Cores. The Monarchs read the same indexes you do. Two more recoveries and we are required to act. Consider the note a courtesy."',
  mud_monarchs:
    'A {rival} catches you alone in the Court. "We have been counting. Three Cores in dynastic hands. The Order will not let four happen without contesting it. The Reader who is being sent to you is good. Be ready or be diplomatic. Either is acceptable to us."',
  true_tartarians:
    'A {rival} appears in the Catacomb threshold without announcement. "Three Cores carried by a True Tartarian is the historical threshold for institutional concern. Our concern is being expressed by my arrival. Carry the next two, please, with the awareness that we are watching."',
  eternal_dynasty:
    'A {rival} delivers a sealed letter to your hand. "Three Cores reclaimed by the line. The Monarchs cannot allow four without losing the suppression argument they have ridden for three centuries. Decide whether you would rather be opposed quietly or publicly. Either path remains open."',
  conspiracy_architects:
    'A {rival} arrives at the Architect cell without a meeting on the books. "We see what you are doing. Three Cores in custody is a story we cannot let stay quiet. Make peace with the publication or make peace with the Revival being there at the finish line. Pick one."',
  servants_of_giants:
    'A {rival} interrupts your vigil with the deference appropriate to the interruption. "The Builders are tracking your Core recoveries. Three is the number at which the Engine becomes plausibly functional without us. We would like to be included. Consider it discussed."',
  stone_builders:
    'A {rival} crosses the workshop threshold barefoot, as the tradition requires. "Three Cores assembled by Builder hands. The Servants are concerned about the Giants you are working around. We would prefer the next two recoveries be made with the vigil informed. Treat this as a request, not a demand."',
  tartarian_revivalists:
    'A {rival} requests a private meeting at a coffee shop a careful distance from the cell. "Three publishable recoveries in 18 months. The Architects can no longer dismiss your movement as fringe. They are about to start acting. Consider this an offer to coordinate — or, failing that, fair warning."',
};

/** True when the 3-Core rival-pressure twist should fire for this
 *  player on the current state transition. */
export function shouldFireThreeCoreTwist(state: MainQuestState): boolean {
  if (state.coresRecovered.length !== 3) return false;
  if ((state.twistsFired ?? []).includes('three_core_pressure')) return false;
  return true;
}

/** Return the rival-pressure narration for the player's faction. */
export function threeCoreTwistLine(factionId: string): string {
  const rival = RIVAL_BY_FACTION[factionId] ?? 'rival faction agent';
  const template = RIVAL_PRESSURE_LINE_BY_FACTION[factionId]
    ?? RIVAL_PRESSURE_LINE_BY_FACTION.reclaimers_guild!;
  return template.replace('{rival}', rival);
}

/** Apply the twist-fired flag idempotently. */
export function markTwistFired(state: MainQuestState, twistId: string): MainQuestState {
  const fired = state.twistsFired ?? [];
  if (fired.includes(twistId)) return state;
  return { ...state, twistsFired: [...fired, twistId] };
}

/** OTA-495 — true exactly once, the moment the 4th Core lands: the Arbiter
 *  entrusts the pre-Flood golem-armament forging (which gates the Sledge /
 *  Greatsword / Pike / Aether-Lance recipes). One-shot per character via the
 *  shared twistsFired flag. */
export function shouldFireFourCoreForge(state: MainQuestState): boolean {
  if (state.coresRecovered.length !== 4) return false;
  if ((state.twistsFired ?? []).includes('four_core_forge')) return false;
  return true;
}

/** The narrative beat that unlocks golem-armament crafting at the 4th Core.
 *  OTA-703 — the moment the craft opens, the player is handed the CRUDE (basic)
 *  working for every armament type; the stronger Rare/Legendary schematics are
 *  left out in the world to be uncovered. */
export function fourCoreForgeLine(): string {
  return (
    'The Arbiter watches the fourth Core settle into your pack, and something in '
    + 'the buried country shifts. "Four. That’s the threshold — the old grid '
    + 'kept this forging from common hands, and now your hands know it. You’ve '
    + 'learned the shaping of a golem’s war-arms: bring the Core and the metal '
    + 'and you can hammer out a crude Sledge, Greatsword, or Pike for your '
    + 'construct. But these are the plain patterns. Somewhere out in the dark lie '
    + 'the master schematics — sharper, surer, and a few that were never meant for '
    + 'mortal forges at all. Find them, and your golem will carry something far '
    + 'worse into the fight." '
    + '(Golem armaments can now be forged — the basic patterns are yours; uncover '
    + 'stronger ones in your travels.)'
  );
}

// v2.4.1 (OTA 035) — Phase 2: per-faction Core-recovery gates.
//
// Replaces the OTA 033 auto-grant-on-arrival with intentional play.
// On arrival at a Lost Capital the engine logs a faction-specific
// hint telling the player what verb their faction uses to coax the
// Core out. When the player submits an action whose intent matches
// the gate, the Core grants and the universal "core_recovered"
// narration plays.
//
// Phase 2 keeps the gate to a simple intent-match check. Phase 3+
// can layer skill-check DCs / item requirements / multi-step
// sequences on top without rewiring the call site.
interface CoreGate {
  /** Intents that count as the faction's recovery action. */
  intents: Intent[];
  /** Hint logged when the player arrives at a Capital. */
  hint: (capitalName: string) => string;
  /** Short label for the Contracts UI "next action" prompt. */
  nextAction: string;
}

const CAPITAL_DISPLAY_NAME: Record<string, string> = {
  asgardar: 'Asgardar',
  samarran: 'Samarran',
  nimari: 'Nimari',
  drakova: 'Drakova',
  voronov: 'Voronov',
  karok_sa: 'Karok-Sa',
  yuldra_tul: 'Yuldra-Tul',
  ostragar: 'Ostragar',
  iskan_veil: 'Iskan-Veil',
};

export const FACTION_CORE_GATES: Record<string, CoreGate> = {
  reclaimers_guild: {
    intents: ['investigate'],
    hint: (cap) => `(Reclaimer route — to recover the ${cap} Core, SALVAGE something here. The Aetheric housing comes loose under the right trowel.)`,
    nextAction: 'salvage a feature here',
  },
  forgotten_order: {
    intents: ['ask', 'investigate'],
    hint: (cap) => `(Order route — to recover the ${cap} Core, READ the binding text. Ask the Capital what it remembers, or examine the scriptorium shelves.)`,
    nextAction: 'ask or read the binding text',
  },
  mud_monarchs: {
    intents: ['attack', 'diplomacy'],
    hint: (cap) => `(Monarch route — claim the ${cap} Core by force or by tongue. The keepers will yield to threat or to a Monarch's address.)`,
    nextAction: 'attack or address the keepers',
  },
  true_tartarians: {
    intents: ['ask', 'rest'],
    hint: (cap) => `(True Tartarian route — to recover the ${cap} Core, you must ASK the Core's spirit, or REST in vigil at its housing. Neither is hurried.)`,
    nextAction: 'ask or rest in vigil',
  },
  eternal_dynasty: {
    intents: ['diplomacy', 'ask'],
    hint: (cap) => `(Dynasty route — ADDRESS the ${cap} keepers in the old voice (try "address the keepers"). Prove the lineage and the Core lifts.)`,
    nextAction: 'address the keepers',
  },
  conspiracy_architects: {
    intents: ['steal', 'investigate'],
    hint: (cap) => `(Architect route — the ${cap} Core leaves with you only if it is never seen leaving. STEAL it, or investigate until you find the back-door route out.)`,
    nextAction: 'steal or scout the egress',
  },
  servants_of_giants: {
    intents: ['rest', 'cast'],
    hint: (cap) => `(Vigil route — sit the ${cap} watch. REST at the Giant's tomb-mark, or CAST a binding prayer; the Core releases on the silent hour.)`,
    nextAction: 'rest or cast a binding',
  },
  stone_builders: {
    intents: ['cast', 'investigate'],
    hint: (cap) => `(Builder route — Aethercraft the ${cap} Core out of its housing. Shape stone around the seat to break the bond, or investigate until the mounting plan is yours.)`,
    nextAction: 'shape or investigate the seat',
  },
  tartarian_revivalists: {
    intents: ['investigate', 'use_relic'],
    hint: (cap) => `(Revivalist route — document the ${cap} recovery for the cell's archive. Investigate every face of the Core's housing, or use a relic to record the moment.)`,
    nextAction: 'document the Core',
  },
};

/** True when the player's current state + this action's intent
 *  satisfies the faction-specific gate for the Capital they're at. */
export function canRecoverCore(player: PlayerCharacter, parsedIntent: Intent): boolean {
  const mq = ensureMainQuest(player.mainQuest);
  if (mq.phase !== 'revelation' && mq.phase !== 'cores') return false;
  if (!LOST_CAPITAL_LOCATIONS.includes(player.currentLocationId)) return false;
  if (mq.coresRecovered.includes(player.currentLocationId)) return false;
  const gate = FACTION_CORE_GATES[player.factionId];
  if (!gate) return true; // unknown faction — permissive fallback
  return gate.intents.includes(parsedIntent);
}

/** The on-arrival hint line for the player's faction at the given
 *  Capital. Returns null when no faction gate is mapped (legacy /
 *  unknown faction) — caller can skip the log line. */
export function coreGateHint(factionId: string, capitalId: string): string | null {
  const gate = FACTION_CORE_GATES[factionId];
  if (!gate) return null;
  const capName = CAPITAL_DISPLAY_NAME[capitalId] ?? capitalId;
  return gate.hint(capName);
}

/** Short next-action label for the Contracts UI prompt. */
export function coreGateNextAction(factionId: string): string {
  return FACTION_CORE_GATES[factionId]?.nextAction ?? 'recover the Core';
}

/** Returns the next mainQuest state after a trigger fires. Returns
 *  the input state unchanged when the trigger is a no-op (phase
 *  already past the relevant gate, etc.). Callers should compare
 *  state.phase before/after to know whether to log narration. */
export function advanceMainQuest(
  player: PlayerCharacter,
  trigger:
    | { kind: 'first_capital_visit'; locationId: string }
    | { kind: 'core_recovered'; locationId: string }
    | { kind: 'reached_nexus' }
    | { kind: 'chose_ending'; ending: MainQuestEnding },
): MainQuestState {
  const state = ensureMainQuest(player.mainQuest);
  switch (trigger.kind) {
    case 'first_capital_visit': {
      if (state.phase !== 'hook') return state;
      if (!LOST_CAPITAL_LOCATIONS.includes(trigger.locationId)) return state;
      return { ...state, phase: 'revelation' };
    }
    case 'core_recovered': {
      if (state.phase === 'ended' || state.phase === 'choice' || state.phase === 'nexus') {
        return state;
      }
      if (state.coresRecovered.includes(trigger.locationId)) return state;
      const coresRecovered = [...state.coresRecovered, trigger.locationId];
      const allCores = coresRecovered.length >= 9;
      return {
        ...state,
        phase: allCores ? 'descent' : 'cores',
        coresRecovered,
      };
    }
    case 'reached_nexus': {
      if (state.phase !== 'descent') return state;
      if (state.coresRecovered.length < 9) return state;
      return { ...state, phase: 'choice' };
    }
    case 'chose_ending': {
      if (state.phase !== 'choice') return state;
      return { ...state, phase: 'ended', ending: trigger.ending };
    }
  }
}
