// Narrative hook engine — turns the random "feature sightings" and "casual
// look" plants into stateful, multi-stage chains the player can pursue.
// Hooks are drawn from canonical Tartaria Prima lore — half-buried spires,
// Etheric storms, Aether Golem stirrings, Black Cloak shadows, etc.

export type HookKind =
  // Tier-1: atmospheric finds (the originals)
  | 'smoke'
  | 'footprints'
  | 'obelisk'
  | 'wagon'
  | 'arch'
  | 'glint'
  | 'handprint'
  | 'thread'
  | 'resonance'
  // Tier-2: canonical Tartarian features
  | 'half_buried_spire'
  | 'etheric_storm'
  | 'pulsing_mud'
  | 'frozen_statue'
  | 'sentinel_patrol'
  | 'mud_golem_stir'
  | 'temporal_eddy'
  | 'spatial_warp'
  | 'whisper_crystal'
  | 'black_cloak'
  | 'giant_silhouette'
  | 'bioluminescent_path'
  | 'wreck_construct'
  | 'submerged_steeple'
  | 'black_market_lantern'
  | 'aether_grid_hum'
  | 'sealed_vault_door'
  | 'preserved_corpse';

export interface Hook {
  id: string;
  kind: HookKind;
  /** Nouns the parser should match against to route an action to this hook. */
  nouns: string[];
  /** Human-readable line shown when the hook is first planted. */
  plantedLine: string;
  /** How many resolution steps the player has taken so far. */
  stage: number;
  /** Whether the chain is fully complete (no more payoffs). */
  resolved: boolean;
  /** Cross-scene chain id, set when the hook is part of a multi-scene story. */
  chainId?: string;
}

// Plant lines, paired with the nouns that should resolve to that hook kind.
export const HOOK_PLANTS: Record<HookKind, { line: string; nouns: string[] }[]> = {
  smoke: [
    { line: 'A column of smoke or steam rises in the distance, thin and straight.', nouns: ['smoke', 'steam', 'column', 'plume'] },
    { line: 'A faint smell of burning Aetherstone drifts from somewhere north.', nouns: ['smoke', 'fire', 'burning', 'smell'] },
  ],
  footprints: [
    { line: 'A thread of footprints, not yours, crosses your path and trails off.', nouns: ['footprints', 'tracks', 'prints', 'trail'] },
    { line: 'Boot impressions press deep into the silt, heading toward the rise.', nouns: ['footprints', 'boots', 'tracks', 'prints'] },
  ],
  obelisk: [
    { line: 'A toppled obelisk lies on its side, runes faded but not yet silent.', nouns: ['obelisk', 'pillar', 'runes', 'stone'] },
    { line: 'A standing stone juts from the mud, its face cut with old Tartarian glyphs.', nouns: ['stone', 'glyphs', 'pillar', 'obelisk'] },
  ],
  wagon: [
    { line: 'A wagon, abandoned and broken-axled, leans into the mud ahead.', nouns: ['wagon', 'cart', 'wreck', 'caravan'] },
  ],
  arch: [
    {
      line: 'You spot what looks like a stone arch, half-swallowed by old mud.',
      // The arch chain always leads to a Tartarian work-room; pre-seed the
      // vocabulary so "search workroom" / "search the work room" resolves
      // against the same planted hook the player followed in.
      nouns: ['arch', 'gate', 'archway', 'doorway', 'ruin', 'workroom', 'work-room', 'work room', 'hollow', 'passage'],
    },
  ],
  glint: [
    { line: 'A glint of metal — too small to name yet — lies in the rubble.', nouns: ['glint', 'metal', 'shine', 'rubble'] },
  ],
  handprint: [
    { line: 'A handprint pressed into Aetherstone dust, recent enough to still hold shape.', nouns: ['handprint', 'print', 'mark', 'dust'] },
  ],
  thread: [
    { line: 'A thread of cold air leaks from somewhere behind the rubble.', nouns: ['cold', 'air', 'draft', 'breeze'] },
  ],
  resonance: [
    { line: 'A faint resonance pulses from the south. Something there is awake.', nouns: ['resonance', 'pulse', 'hum', 'vibration'] },
    { line: 'The Aetheric haze thickens around one specific spot. You cannot tell why.', nouns: ['haze', 'thickening', 'spot', 'aether'] },
  ],
  half_buried_spire: [
    { line: 'Half a Tartarian spire juts from the mud like the bone of a long-dead beast, the top three storeys still defiant.', nouns: ['spire', 'tower', 'top', 'building'] },
    { line: "A buried dome's apex breaks the surface ahead, Aetherstone-glazed and humming faintly.", nouns: ['dome', 'apex', 'roof', 'building'] },
  ],
  etheric_storm: [
    { line: 'The horizon cracks — blue and purple lightning, an Etheric storm walking on long legs across the plain.', nouns: ['storm', 'lightning', 'sky', 'horizon'] },
    { line: 'Static gathers in your hair. The Aether is about to break weather on this ridge.', nouns: ['storm', 'static', 'sky', 'aether'] },
  ],
  pulsing_mud: [
    { line: 'A patch of mud just off the path pulses with a faint blue glow, in time with nothing you can hear.', nouns: ['mud', 'glow', 'patch', 'aetherstone'] },
  ],
  frozen_statue: [
    { line: 'A figure stands ahead, perfectly still — until you realise the mud-glass froze them mid-step, generations ago.', nouns: ['statue', 'figure', 'frozen', 'body'] },
  ],
  sentinel_patrol: [
    { line: 'Far to the east, an Architectural Sentinel paces a ruined wall — patrol pattern, by the book, never deviating.', nouns: ['sentinel', 'machine', 'patrol', 'automaton'] },
  ],
  mud_golem_stir: [
    { line: 'The mud over there is bulging in a way mud does not bulge unaided. Something is reforming itself.', nouns: ['mud', 'bulge', 'golem', 'mound'] },
  ],
  temporal_eddy: [
    { line: 'For a half-second the light shifts — sunset, then dawn, then now. A temporal eddy, the kind Reclaimers warn about.', nouns: ['eddy', 'time', 'light', 'distortion'] },
  ],
  spatial_warp: [
    { line: 'The way you came is not where it should be. The landscape has folded slightly while your back was turned.', nouns: ['warp', 'fold', 'landscape', 'distance', 'path'] },
  ],
  whisper_crystal: [
    { line: "A crystal embedded in a half-broken pillar whispers — actual words, almost — when you pass within arm's reach.", nouns: ['crystal', 'whisper', 'whispers', 'pillar', 'voice'] },
  ],
  black_cloak: [
    { line: 'Someone in a long black coat is two ridges back, matching your pace. They have been there for a while.', nouns: ['cloak', 'coat', 'figure', 'follower', 'agent'] },
  ],
  giant_silhouette: [
    { line: "On the far ridge — for the space of a held breath — a figure too tall to be human watches you. Then it isn't there.", nouns: ['giant', 'silhouette', 'figure', 'ridge', 'shadow'] },
  ],
  bioluminescent_path: [
    { line: 'A line of pale-blue fungus blooms across the ground ahead — the True Tartarians grow this where they walk often.', nouns: ['fungus', 'mushroom', 'glow', 'path', 'fungi'] },
  ],
  wreck_construct: [
    { line: 'An Aetheric construct lies half-toppled in the mud, one arm still flexing weakly, its core dim but unbroken.', nouns: ['construct', 'automaton', 'machine', 'wreck', 'arm'] },
  ],
  submerged_steeple: [
    { line: 'The top of a flooded Tartarian cathedral pierces the standing water ahead — steeple intact, the rest drowned.', nouns: ['steeple', 'cathedral', 'spire', 'water', 'church'] },
  ],
  black_market_lantern: [
    { line: 'A green lantern hangs at the mouth of a culvert — the Mud Dwellers mark their hidden markets with that exact green.', nouns: ['lantern', 'culvert', 'market', 'green', 'sign'] },
  ],
  aether_grid_hum: [
    { line: "Under your boots the ground hums steadily — an old Aetheric grid line, still alive, running east.", nouns: ['grid', 'hum', 'line', 'ley', 'ground'] },
  ],
  sealed_vault_door: [
    { line: 'A circular Tartarian vault door, mud-pasted but intact, lies recessed into the slope. The locking glyphs are dim — but not gone.', nouns: ['vault', 'door', 'gate', 'seal', 'glyphs'] },
  ],
  preserved_corpse: [
    { line: 'A Tartarian body lies in the silt, the mud-glass having frozen them at the moment they fell — robes still pristine, satchel still buckled.', nouns: ['body', 'corpse', 'robes', 'satchel', 'tartarian'] },
  ],
};

export interface HookOutcome {
  line: string;
  arbiterLine?: string;
  effects: HookEffect[];
  done: boolean;
  /** Nouns the stage's narration introduced that should NOW match this hook
   *  going forward. Lets a multi-stage chain stay reachable after the
   *  scene reveals new objects/people — "approach the smoke" reveals "a
   *  figure crouched over the coals", so subsequent "talk to the figure"
   *  / "approach the figure" should advance the chain, not bail. */
  addNouns?: string[];
  /** Optional next hook to plant for the player's next wander (cross-scene chain). */
  nextChain?: { kind: HookKind; chainId: string };
}

export type HookEffect =
  | { type: 'grant_tc'; amount: number }
  | { type: 'grant_item'; name: string }
  | { type: 'spawn_enemy_tag'; tag: string }
  | { type: 'heal'; amount: number }
  | { type: 'damage'; amount: number; cause: string }
  | { type: 'unlock_location'; locationId: string }
  | { type: 'rep_change'; factionId: string; amount: number }
  | { type: 'advance_time'; hours: number }
  | { type: 'memo'; text: string };

const CHAINS: Record<HookKind, HookOutcome[]> = {
  smoke: [
    {
      line: 'You creep toward the smoke. A small camp resolves out of the mist — a single firepit, a tarpaulin lean-to, a figure crouched over the coals.',
      arbiterLine: '"Approach openly or not at all," the Arbiter says quietly. "This one is watching the road."',
      effects: [],
      done: false,
      addNouns: ['figure', 'camp', 'firepit', 'fire', 'coals', 'person', 'stranger', 'lean-to'],
    },
    {
      line: 'The figure looks up. A Reclaimer, mud to the knees, pack half-emptied. They wave you in. "Sit. Trade if you want. I have heard of a hollow two ridges over — old Tartarian work, no Sentinels."',
      effects: [{ type: 'memo', text: 'A Reclaimer at a roadside fire spoke of an unmapped hollow two ridges over.' }],
      done: false,
      addNouns: ['reclaimer', 'figure', 'stranger', 'them', 'they'],
      nextChain: { kind: 'arch', chainId: 'reclaimer_hollow' },
    },
    {
      line: 'You and the Reclaimer part ways. They press a few coins into your palm "for the directions, when you find what is left of the place."',
      effects: [{ type: 'grant_tc', amount: 25 }],
      done: true,
    },
  ],
  footprints: [
    {
      line: 'You follow the boot prints. They keep a steady stride, then bunch — someone stopped here. The trail veers behind a fallen column.',
      effects: [],
      done: false,
    },
    {
      line: 'Behind the column, a body. Reclaimer kit, cold for days. Their pack is mostly intact.',
      arbiterLine: '"Tartaria takes them like this," the Arbiter says. "No drama. Just the next set of tracks that stop."',
      effects: [
        { type: 'grant_item', name: 'Trail Rations' },
        { type: 'grant_item', name: 'Aetheric Compass' },
        { type: 'grant_tc', amount: 18 },
        { type: 'memo', text: 'You found a dead Reclaimer at the end of a track. Their compass now points for you.' },
      ],
      done: true,
    },
  ],
  obelisk: [
    {
      line: 'You crouch beside the stone. The runes are old Tartarian — half-faded, but readable if you trace them. A coiled glyph in the centre still throws a faint glow when your hand passes over it.',
      effects: [],
      done: false,
    },
    {
      line: 'You press your palm to the glyph. A shock runs up your arm — not painful, just decisive. The stone has marked you.',
      arbiterLine: '"That is older than the Mud Monarchs," the Arbiter murmurs. "It will know you again."',
      effects: [
        { type: 'damage', amount: 2, cause: 'the rune\'s recognition' },
        { type: 'rep_change', factionId: 'true_tartarians', amount: 2 },
        { type: 'memo', text: 'A Tartarian rune marked you. The True Tartarians will know.' },
      ],
      done: true,
    },
  ],
  wagon: [
    {
      line: 'You climb onto the broken axle. The wagon bed is half-emptied but the lockbox under the driver\'s bench is still sealed.',
      effects: [],
      done: false,
    },
    {
      line: 'The lockbox cracks open. Inside — a smaller pouch of coin, a wrapped bundle of cloth, and a faintly humming shard.',
      effects: [
        { type: 'grant_tc', amount: 35 },
        { type: 'grant_item', name: 'Patched Cloth' },
        { type: 'grant_item', name: 'Aetheric Shard' },
      ],
      done: true,
    },
  ],
  arch: [
    {
      line: 'You duck under the half-buried arch. The passage opens into a hollow — a Tartarian work-room, equipment long since hauled away, but the walls still hum.',
      effects: [],
      done: false,
    },
    {
      line: 'Set into the back wall, behind a curtain of dried mud, you find a small cache. Whoever told you of this place was telling the truth.',
      arbiterLine: '"This is what they sell information for," the Arbiter says.',
      effects: [
        { type: 'grant_item', name: 'Aetheric Shard' },
        { type: 'grant_item', name: 'Aether Crystal' },
        { type: 'grant_tc', amount: 40 },
        { type: 'memo', text: 'You found the hollow the Reclaimer described. The information was good.' },
      ],
      done: true,
    },
  ],
  glint: [
    {
      line: 'You pick the metal out of the rubble. A pendant — Tartarian make, hammered thin, etched with a sigil you do not recognise.',
      effects: [{ type: 'grant_item', name: 'Aetheric Locket' }],
      done: false,
    },
    {
      line: 'You turn the pendant over. Whoever wore it last bled out clutching it — a faint rust-brown line still runs along the inside of the chain.',
      arbiterLine: '"That sigil belongs to someone," the Arbiter says. "Someone who is going to want it back."',
      effects: [{ type: 'memo', text: 'A bloodstained pendant marks an old debt you have not yet collected.' }],
      done: true,
    },
  ],
  handprint: [
    {
      line: 'You crouch beside the print. Pressed deep — someone heavier than you, and recent. The dust around it has not yet settled.',
      effects: [],
      done: false,
    },
    {
      line: 'You follow the prints to a low ridge. A True Tartarian scout, hooded and watching, dips their head once when you crest the hill — acknowledgement, not greeting — and is gone before you reach the ground.',
      effects: [
        { type: 'rep_change', factionId: 'true_tartarians', amount: 1 },
        { type: 'memo', text: 'A True Tartarian scout marked you and let you pass. They are aware of you now.' },
      ],
      done: true,
    },
  ],
  thread: [
    {
      line: 'You pull the rubble aside. A draft of cold, old air, and a tight passage angling down into the dark.',
      effects: [],
      done: false,
    },
    {
      line: 'You wedge yourself into the gap. At the bottom — a small antechamber, half-flooded, with three sealed jars on a shelf. You take what you can carry.',
      effects: [
        { type: 'grant_item', name: 'Trail Rations' },
        { type: 'grant_item', name: 'Aether Residue' },
        { type: 'grant_tc', amount: 12 },
      ],
      done: true,
    },
  ],
  resonance: [
    {
      line: 'You step toward the pulse. The air thickens. The hum syncs with your heartbeat for a half-second, then drops away.',
      effects: [],
      done: false,
    },
    {
      line: 'A shape unfolds itself out of the haze — something the size of a person, made of nothing the eye can hold. It moves toward you.',
      arbiterLine: '"This is what comes of pulling at threads," the Arbiter says. "Do not pull lightly."',
      effects: [{ type: 'spawn_enemy_tag', tag: 'Aetheric Mutation' }],
      done: true,
    },
  ],

  half_buried_spire: [
    {
      line: 'You cross the broken ground toward the spire. The bottom storeys are mud-glassed shut, but a window two heights up gapes open. A coil of old rope tells you someone else has tried.',
      effects: [],
      done: false,
    },
    {
      line: 'You haul yourself through the window. Inside: a hall once-rich, now stripped, the Aetheric grid in the walls still warm to the touch.',
      arbiterLine: '"This was a noble house," the Arbiter says. "Mud Monarch stock. Take what is here before its owners remember to come back."',
      effects: [],
      done: false,
      nextChain: { kind: 'sealed_vault_door', chainId: 'monarch_spire_vault' },
    },
    {
      line: 'On the upper floor — a cabinet wedged behind a fallen beam. Coin and an unfamiliar ring.',
      effects: [
        { type: 'grant_tc', amount: 55 },
        { type: 'grant_item', name: 'Rusted Band of Knowledge' },
      ],
      done: true,
    },
  ],
  etheric_storm: [
    {
      line: 'You shelter against a tilted column as the storm rolls over. Blue and purple lightning sheets the plain. The Aetheric pressure climbs.',
      effects: [],
      done: false,
    },
    {
      line: 'A bolt strikes a few paces from you — the Aetherstone in the soil holds the charge, and a hand-sized shard of stormglass crystallises around the impact.',
      arbiterLine: '"That does not happen for everyone," the Arbiter says.',
      effects: [
        { type: 'damage', amount: 3, cause: 'an Etheric backlash' },
        { type: 'grant_item', name: 'Energy Fragment' },
        { type: 'memo', text: 'An Etheric storm gave you a fragment instead of killing you. That counts for something here.' },
      ],
      done: true,
    },
  ],
  pulsing_mud: [
    {
      line: 'You step toward the glow. The mud is warm against your boot — an Aetherstone deposit, surface-thin but real.',
      effects: [],
      done: false,
    },
    {
      line: 'You pry the deposit out of the silt. A few good shards, dense and humming, plus a thumb-sized core.',
      effects: [
        { type: 'grant_item', name: 'Aetheric Shard' },
        { type: 'grant_item', name: 'Aetheric Shard' },
        { type: 'grant_item', name: 'Aether Crystal' },
        { type: 'advance_time', hours: 0.5 },
      ],
      done: true,
    },
  ],
  frozen_statue: [
    {
      line: 'You circle the figure. A Tartarian functionary by the cut of their robes, perfectly preserved inside a casing of Aetheric mud-glass — even their satchel still hangs from the shoulder.',
      effects: [],
      done: false,
    },
    {
      line: 'You chip the satchel free without disturbing the body. Inside: a sealed scroll case and a small purse of pre-flood coin.',
      arbiterLine: '"Treat them like the dead," the Arbiter says. "Not the museum piece."',
      effects: [
        { type: 'grant_tc', amount: 30 },
        { type: 'grant_item', name: 'Aether Residue' },
        { type: 'memo', text: 'You took a satchel off a body the mud preserved at the moment of the flood.' },
      ],
      done: true,
    },
  ],
  sentinel_patrol: [
    {
      line: 'You lay flat and watch. The Sentinel runs a perfect loop — twelve paces east, pause, twelve paces back. Old programming, never updated.',
      effects: [],
      done: false,
    },
    {
      line: 'You time the loop and slip across its blind arc. Whatever it was guarding is past the wall — and unguarded for as long as you are quiet.',
      effects: [
        { type: 'grant_item', name: 'Scrap Metal' },
        { type: 'grant_item', name: 'Drone Core' },
        { type: 'memo', text: 'You crossed a Sentinel patrol unseen. You know its blind arc now.' },
      ],
      done: true,
    },
  ],
  mud_golem_stir: [
    {
      line: 'You back off to the treeline and watch. The mud reforms itself — slow, deliberate — into a hulking shape of stone and silt. It does not see you yet.',
      effects: [],
      done: false,
    },
    {
      line: 'The Golem turns toward your scent. It has decided.',
      arbiterLine: '"Aether Golems do not negotiate," the Arbiter says.',
      effects: [{ type: 'spawn_enemy_tag', tag: 'Construct' }],
      done: true,
    },
  ],
  temporal_eddy: [
    {
      line: 'You step into the shimmer. Your shadow falls in three directions at once, then snaps back.',
      effects: [],
      done: false,
    },
    {
      line: 'Hours pass in what felt like a step — and a single clear thought lands in your head that wasn\'t there before. A name. A direction. Something you didn\'t know you needed to know.',
      arbiterLine: '"The Aetheric eddies sometimes pay in knowledge instead of coin," the Arbiter says.',
      effects: [
        { type: 'advance_time', hours: 6 },
        { type: 'memo', text: 'A temporal eddy gave you knowledge of a place you have never been.' },
      ],
      done: true,
    },
  ],
  spatial_warp: [
    {
      line: 'You step forward. Twenty paces become three. The world is being economical with you.',
      effects: [],
      done: false,
    },
    {
      line: 'You come out of the fold a long way from where you started — but on higher ground, with a view of a structure you weren\'t aware was here.',
      effects: [
        { type: 'advance_time', hours: 1 },
        { type: 'memo', text: 'A spatial warp shortcut you to ground you would not have found on foot.' },
      ],
      done: false,
      nextChain: { kind: 'half_buried_spire', chainId: 'warped_spire' },
    },
    {
      line: 'The new vantage clears your head. You knew Tartaria bent space — now you know what it feels like.',
      effects: [],
      done: true,
    },
  ],
  whisper_crystal: [
    {
      line: "You lean toward the crystal. The whispering shapes itself — Tartarian, you think, though no language you can name. It is saying a location.",
      effects: [],
      done: false,
    },
    {
      line: 'You pry the crystal loose. The whispering stops — but the direction it gave you stays.',
      effects: [
        { type: 'grant_item', name: 'Aether Crystal' },
        { type: 'memo', text: 'A whisper-crystal told you where a sealed vault is. You haven\'t found it yet.' },
      ],
      done: false,
      nextChain: { kind: 'sealed_vault_door', chainId: 'whisper_vault' },
    },
    {
      line: 'You stand at the place the crystal indicated. The whispering crystal in your pack warms once and goes still.',
      effects: [],
      done: true,
    },
  ],
  black_cloak: [
    {
      line: 'You double back through a fold in the ground. The Black Cloak passes you, scanning the path you should have been on, and does not see you.',
      arbiterLine: '"Mud Monarch enforcement," the Arbiter says quietly. "Do not let them see what you carry."',
      effects: [],
      done: false,
    },
    {
      line: 'When the Cloak is past, you check what they dropped — a sealed dispatch slip, smudged with Aetheric ink. Worth something, to the right buyer.',
      effects: [
        { type: 'grant_item', name: 'Aether Residue' },
        { type: 'rep_change', factionId: 'mud_monarchs', amount: -2 },
        { type: 'rep_change', factionId: 'forgotten_order', amount: 2 },
        { type: 'memo', text: 'You lifted a Mud Monarch dispatch off a Black Cloak. The Order will pay for it.' },
      ],
      done: true,
    },
  ],
  giant_silhouette: [
    {
      line: 'You make your way to where the figure stood. The ground is pressed — a foot print, far larger than any human boot, and the air still smells faintly of ozone.',
      effects: [],
      done: false,
    },
    {
      line: 'A single object sits where the print is deepest — a carved stone token, mark of a watching elder. Lore says a Giant leaves these for the few they decide to remember.',
      arbiterLine: '"Sasquatch, Yeti, Bigfoot — every age gives them a different name," the Arbiter says. "They are watching you. Try to be worth it."',
      effects: [
        { type: 'grant_item', name: 'Tartarian Stoneband' },
        { type: 'memo', text: 'A Tartarian Giant left you a token. You are being watched.' },
      ],
      done: true,
    },
  ],
  bioluminescent_path: [
    {
      line: 'You follow the fungi. The trail leads down through a slumped wall into a low chamber — a True Tartarian way-station, currently unstaffed, but lived-in.',
      effects: [],
      done: false,
    },
    {
      line: 'A bowl of mud-stew, still warm. A folded cot. A sigil scratched into the doorway — passage granted. You take only what is offered, and leave.',
      arbiterLine: '"You showed restraint," the Arbiter says. "They will know."',
      effects: [
        { type: 'grant_item', name: 'Trail Rations' },
        { type: 'grant_item', name: 'Mud Essence' },
        { type: 'rep_change', factionId: 'true_tartarians', amount: 3 },
      ],
      done: true,
    },
  ],
  wreck_construct: [
    {
      line: 'You crouch over the construct. Its arm still moves, but the core flickers — a few more hours, then nothing. Salvage now or never.',
      effects: [],
      done: false,
    },
    {
      line: 'You pry the core free and strip the workable plating. A Reclaimer would weep at this haul.',
      effects: [
        { type: 'grant_item', name: 'Drone Core' },
        { type: 'grant_item', name: 'Scrap Metal' },
        { type: 'grant_item', name: 'Scrap Metal' },
        { type: 'rep_change', factionId: 'reclaimers_guild', amount: 1 },
      ],
      done: true,
    },
  ],
  submerged_steeple: [
    {
      line: 'You wade out to the steeple. The window-slits at the top open onto a flooded nave — Aetherstone shimmer in the water below.',
      arbiterLine: '"Explorers have gone in," the Arbiter says, "and the water keeps them."',
      effects: [],
      done: false,
    },
    {
      line: 'You dive. The Aetherstone gives you a half-minute of breathable air. You grab what you can — a heavy reliquary off the altar — and break back to the surface, lungs burning.',
      effects: [
        { type: 'damage', amount: 4, cause: 'the flooded nave' },
        { type: 'grant_item', name: 'Golem Core' },
        { type: 'grant_tc', amount: 60 },
        { type: 'memo', text: 'You dove the Sinking Cathedral and came back up. Most don\'t.' },
      ],
      done: true,
    },
  ],
  black_market_lantern: [
    {
      line: 'You duck through the culvert. A small market — three stalls, no chatter, eyes on you immediately. They will trade. They will not trust you.',
      effects: [],
      done: false,
    },
    {
      line: 'You haggle into a fair price for a single item — Mud Dweller stock you do not usually see above ground.',
      effects: [
        { type: 'grant_item', name: 'Echoing Steps Boots' },
        { type: 'grant_tc', amount: -40 },
        { type: 'memo', text: 'A hidden Mud Dweller market sold you a piece of Tartarian stealth kit.' },
      ],
      done: true,
    },
  ],
  aether_grid_hum: [
    {
      line: "You follow the grid line east. The hum strengthens. You crest a low rise and look down at a Tartarian node — half-buried, partially active.",
      effects: [],
      done: false,
    },
    {
      line: 'You touch the node. It accepts you — or doesn\'t see you as a threat, which here is close enough. A small charge runs through your pack: every Aetheric thing you carry is faintly steadier now.',
      arbiterLine: '"That is older than every faction," the Arbiter says. "It does not have politics."',
      effects: [
        { type: 'grant_item', name: 'Aetheric Dust' },
        { type: 'heal', amount: 5 },
        { type: 'memo', text: 'You found a still-warm Aetheric grid node. It did not reject you.' },
      ],
      done: true,
    },
  ],
  sealed_vault_door: [
    {
      line: 'You scrape the mud off the locking ring. The glyphs are a Tartarian tumbler — three rotations, in the right order. The faint markings tell you which.',
      effects: [],
      done: false,
    },
    {
      line: 'The door grinds inward. Inside: a small storeroom, every shelf still loaded. Whoever sealed this expected to come back.',
      effects: [
        { type: 'grant_tc', amount: 90 },
        { type: 'grant_item', name: 'Aetheric Shard' },
        { type: 'grant_item', name: 'Aetheric Cloth' },
        { type: 'grant_item', name: 'Aetheric Compass' },
        { type: 'memo', text: 'You opened a sealed Tartarian vault. Whoever sealed it is centuries late.' },
      ],
      done: true,
    },
  ],
  preserved_corpse: [
    {
      line: 'You kneel beside the body. The mud-glass froze them mid-fall — robes intact, satchel intact. The seal on the satchel is Forgotten Order.',
      effects: [],
      done: false,
    },
    {
      line: 'You take the satchel — they would have wanted a scholar to have it. Inside: a research scroll, a small purse, and a runecaster casing.',
      arbiterLine: '"The Order will know you took it from one of theirs," the Arbiter says. "They will count that in your favour."',
      effects: [
        { type: 'grant_tc', amount: 40 },
        { type: 'grant_item', name: 'Aetheric Shard' },
        { type: 'rep_change', factionId: 'forgotten_order', amount: 3 },
        { type: 'memo', text: 'You recovered a Forgotten Order satchel from a preserved corpse.' },
      ],
      done: true,
    },
  ],
};

export function getHookOutcome(kind: HookKind, stage: number): HookOutcome | null {
  const chain = CHAINS[kind];
  if (!chain || stage >= chain.length) return null;
  return chain[stage] ?? null;
}

export const ALL_HOOK_NOUNS: ReadonlySet<string> = new Set(
  Object.values(HOOK_PLANTS).flatMap((arr) => arr.flatMap((p) => p.nouns.map((n) => n.toLowerCase()))),
);

// Match a player target string (or resolved noun) against an active hook's
// noun list. Used to route "sneak up to the smoke" → the smoke hook.
export function matchHookNoun(target: string | undefined, hooks: readonly Hook[]): Hook | null {
  if (!target) return null;
  const t = target.toLowerCase();
  for (const hook of hooks) {
    if (hook.resolved) continue;
    if (hook.nouns.some((n) => t.includes(n) || n.includes(t))) return hook;
  }
  return null;
}

/** Same as matchHookNoun but does NOT skip resolved hooks. Used by
 *  the investigate handler to detect a player re-targeting a hook
 *  they've already exhausted, so we can hard-print "already
 *  searched" instead of falling through to MiniLM / area-search and
 *  giving them noisy guess-text. */
export function matchAnyHookNoun(target: string | undefined, hooks: readonly Hook[]): Hook | null {
  if (!target) return null;
  const t = target.toLowerCase();
  for (const hook of hooks) {
    if (hook.nouns.some((n) => t.includes(n) || n.includes(t))) return hook;
  }
  return null;
}

// Atmospheric hooks plant less often so chains feel earned. The lore-heavy
// ones (Sentinel, Giant, Black Cloak, Storm) are deliberately rarer so they
// land like events.
const HOOK_WEIGHTS: Record<HookKind, number> = {
  smoke: 12,
  footprints: 12,
  obelisk: 8,
  wagon: 8,
  arch: 4, // mostly chained from smoke
  glint: 10,
  handprint: 6,
  thread: 8,
  resonance: 5,
  half_buried_spire: 8,
  etheric_storm: 5,
  pulsing_mud: 9,
  frozen_statue: 6,
  sentinel_patrol: 4,
  mud_golem_stir: 4,
  temporal_eddy: 3,
  spatial_warp: 3,
  whisper_crystal: 5,
  black_cloak: 4,
  giant_silhouette: 2, // very rare
  bioluminescent_path: 6,
  wreck_construct: 7,
  submerged_steeple: 3,
  black_market_lantern: 4,
  aether_grid_hum: 6,
  sealed_vault_door: 3, // mostly chained
  preserved_corpse: 6,
};

export function pickRandomHookKind(): HookKind {
  const total = Object.values(HOOK_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [kind, weight] of Object.entries(HOOK_WEIGHTS) as [HookKind, number][]) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return 'glint';
}

export function plantHookByKind(kind: HookKind, chainId?: string): Hook {
  const options = HOOK_PLANTS[kind];
  const choice = options[Math.floor(Math.random() * options.length)] ?? options[0]!;
  return {
    id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    nouns: choice.nouns,
    plantedLine: choice.line,
    stage: 0,
    resolved: false,
    chainId,
  };
}
