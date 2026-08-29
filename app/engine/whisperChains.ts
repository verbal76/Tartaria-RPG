// ⚠⚠⚠ OTA-1548 — TWENTY MORE FIRES IN THE DARK.
//
// Owner: *"we need at least 20 more whispers that follow the yulka chain but
// have different quests different people giving them out different rewards and
// different themes."*
//
// ⚠⚠ THE MACHINE WAS ONE PERSON DEEP. Every stage of the whisper loop —
// meet, accept, buy, leave, fetch, recover, return, ambush, the panel copy,
// the route labels, the typed commands, the talk sheet — was hardcoded to
// Yulka by name in gameStore and whispers.ts. Twenty chains hardcoded twenty
// times over would be the OTA-1541 disease as an authoring practice, so the
// content moved HERE: every line the chain speaks and every number it pays is
// data on its ChainDef, and the engine runs any entry in this table. Yulka is
// row one, her strings byte-identical to what shipped.
//
// ⚠⚠ COPY AND GEOMETRY ARE PINNED TOGETHER. The audit that opened this OTA
// found Yulka's own plant lines saying "south" while her targetOffset walked
// NORTH (dyRange [-3,-2]; north is y−1 everywhere else in the engine) — SET
// COURSE masked it by routing to the stored tile regardless of the prose.
// Fixed here (dyRange [2,3]) and locked by suite: every chain's plant lines
// must name the direction its offset actually walks.
//
// ⚠ AUTHORING RULES, learned the hard way elsewhere in this codebase:
//   - fetchEnemy / ambush.enemy must name a real enemies.json entry (the
//     spawn THROWS otherwise), and a Human one — humans are pooled into
//     FACTION_BODIES by a locked test, so the roster additions ride along.
//   - reward items reuse established item names (loot tables / disc), so
//     sell floors and vendor recognition keep working.
//   - plantLocations are static-hub room ids; every outpost has them all.

import type { InventoryItem, Rarity } from './types';

/** An item a chain pays out (or sells, on the buy branch). */
export interface ChainReward {
  name: string;
  qty: number;
  rarity: Rarity;
  tags: string[];
}

/** Everything a chain SAYS and PAYS. The engine templates the connective
 *  tissue (combat lines, panel copy, pointers) off these fields; the voice
 *  lines are authored per chain so twenty fires don't sound like one. */
export interface ChainContent {
  /** The person at the rendezvous. Lowercased first word drives the typed
   *  commands ("accept yulka"). Must be unique across chains. */
  npcName: string;
  /** she/he/they — drives her/him/them and She/He/They in templated copy. */
  pronoun: 'she' | 'he' | 'they';
  /** Sheet kicker, e.g. 'AT THE FIRE'. */
  kicker: string;
  /** World line: what you see arriving on their tile. */
  sighting: string;
  /** Their voice: the offer, spoken at the meet. */
  pitch: string;
  /** Their voice when you take the job. */
  acceptLine: string;
  /** The task brief — the 'note' turn the sheet keeps re-readable. */
  brief: string;
  /** 'the thief' — noun for the mark in pointers and panel copy. */
  markNoun: string;
  /** enemies.json name of the mark holding the goods. */
  fetchEnemy: string;
  /** Mark's tile, offset from the MEET tile (absolute-grid deltas). */
  fetchOffset: { dxRange: [number, number]; dyRange: [number, number] };
  /** World line when the mark rises out of the ground. */
  fetchSpawnLine: string;
  /** SET COURSE label for the mark's tile. */
  fetchRouteLabel: string;
  /** SET COURSE label for the meet tile. */
  meetRouteLabel: string;
  /** SET COURSE label for the return leg. */
  returnRouteLabel: string;
  /** The stolen goods the mark drops. */
  stolen: { name: string; qty: number; tags: string[] };
  /** World line when the goods hit your pack. */
  recoverLine: string;
  /** 'Discs' / 'the Aetheric Discs' — short and long goods nouns. */
  goodsShort: string;
  goodsLong: string;
  /** Optional buy-out: skip the fetch, pay TC, take the grant. Chains
   *  without one refuse to sell (buyRefusalLine or a generic line). */
  buy?: { costTc: number; grant: ChainReward; line: string; shortLine: string };
  buyRefusalLine?: string;
  /** Turn-in payout. */
  reward: { item?: ChainReward; tc: number };
  /** Their voice on turn-in. */
  returnLine: string;
  /** Their voice when you come back without the goods. */
  emptyHandsLine: string;
  /** Completion card body. */
  completeLines: string[];
  /** Post-payout hijacker. Omit for chains that end clean. */
  ambush?: { enemy: string; chance: number; line: string };
  /** World line when you walk away from the offer. */
  leaveLine: string;
  /** Sheet button labels. */
  acceptBtnLabel: string;
  buyBtnLabel?: string;
}

/** A chain definition: plant rules + the content block above. */
export interface ChainDef {
  id: string;
  /** Player-facing title for the ContractsScreen Whispers section. */
  title: string;
  /** Hub-room id where this whisper plants (e.g. 'outpost_messhall'). */
  plantLocations: string[];
  /** Per-visit roll. 0.15 = 15%. */
  plantChance: number;
  /** Authored lines spoken when the whisper plants; one is picked. */
  plantLines: string[];
  /** Meet tile offset from the player's plant-time position.
   *  ⚠ Directions: north = y−1, south = y+1, east = x+1, west = x−1 —
   *  the suite pins each chain's plant-line direction word to this. */
  targetOffset: { dxRange: [number, number]; dyRange: [number, number] };
  /** Hour window for the meet ([from, to] inclusive, wraps midnight).
   *  Omitted = any hour. */
  activeHours?: [number, number];
  content: ChainContent;
}

const DISC_REWARD: ChainReward = {
  name: 'Aetheric Disc', qty: 5, rarity: 'Uncommon', tags: ['aether', 'currency'],
};

export const CHAINS: ChainDef[] = [
  {
    id: 'yulka_discs',
    title: 'Yulka and the Aetheric Discs',
    plantLocations: ['outpost_messhall'],
    plantChance: 0.15,
    plantLines: [
      `A pilgrim at the corner table cups her hands around a steaming mug and looks over at you. "South of here, past the gate. After the moon's up. Mud Dweller name of Yulka camps out there some nights — sells Aetheric Discs cheap. Don't ask where she gets them."`,
      `A Reclaimer one table over leans back: "If you need Aetheric Discs and don't want to pay Irma's mark-up, walk south after dark. Yulka. She's there some nights, gone others. Two tiles, three. You'll see her fire."`,
      `An off-duty Reclaimer presses a thumb into the salt of her plate. "Yulka. South. Night work. Aetheric Discs at half the going rate. If she's there." She doesn't say what to do if she's not.`,
    ],
    // OTA-1548 — was [-3,-2], which walks NORTH while every authored line says
    // south. SET COURSE hid it; a player following the prose on foot could not
    // have found her. The fiction was always "south"; the data now agrees.
    targetOffset: { dxRange: [-1, 1], dyRange: [2, 3] },
    activeHours: [20, 4],
    content: {
      npcName: 'Yulka',
      pronoun: 'she',
      kicker: 'AT THE FIRE',
      sighting: `A hooded figure crouches over a small Aether-fire ahead. She watches you approach without standing. The fire's blue glow plays across a flat tin tray covered in palm-sized Aetheric Discs.`,
      pitch: `"Yulka," she says without asking your name. "If you came for Discs, sit. Five for fifty TC. If you came for trouble, keep walking." She watches your hands more than your face. "There's a third option. Some pendejo took half my stock — three tiles east, that direction." She nods at the dark. "Get them back, you keep five. I keep the rest. Either way, decide now. I've got somewhere to be by sunrise."`,
      acceptLine: `"Three tiles east." Yulka jerks her chin at the dark. "If you don't come back, I never knew your face." She turns to her tray and doesn't look up again.`,
      brief: `The thief is three tiles east of her fire. Your Contracts panel tracks the job — SET COURSE walks you there. Recover the Discs and bring them back to Yulka; five are yours on return.`,
      markNoun: 'the thief',
      fetchEnemy: 'Silt Thief',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `A figure rises out of the silt ahead, hands inside a slick mud-cloak. The cloak's lining glints — Aetheric Discs, more than they should be carrying. The Silt Thief sees you, and decides you saw too much.`,
      fetchRouteLabel: 'the Silt Thief',
      meetRouteLabel: `Yulka's fire`,
      returnRouteLabel: `Yulka (return the Discs)`,
      stolen: { name: 'Stolen Aetheric Discs', qty: 12, tags: ['whisper', 'aether', 'quest'] },
      recoverLine: `The Silt Thief drops. Under their cloak, wrapped in oilcloth, half-stamped Aetheric Discs spill across the silt. You scoop them into your own pack. Yulka's stock, recovered.`,
      goodsShort: 'Discs',
      goodsLong: 'the Aetheric Discs',
      buy: {
        costTc: 50,
        grant: DISC_REWARD,
        line: `You count out fifty TC into Yulka's palm. She drops five Discs into yours and tips her cup to you. "Cleanest sale I've made in a week."`,
        shortLine: `Yulka glances at your hands. "Fifty TC for five. You're short." She doesn't bargain.`,
      },
      reward: { item: DISC_REWARD, tc: 30 },
      returnLine: `Yulka takes the bundle and counts without looking up. "Faster than I thought." She pulls five clean Discs from her own tray and stacks them in your palm, then drops thirty TC on top. "Don't come back. We're done."`,
      emptyHandsLine: `You return to Yulka's fire. She looks past you, looking for the bundle that isn't there. "Empty hands. Then this conversation's empty too." She turns back to her tray.`,
      completeLines: ['You returned Yulka her stolen stock. The debt is square — she told you not to come back.'],
      ambush: {
        enemy: 'Disc Hijacker',
        chance: 0.3,
        line: `You turn from the fire with the Discs in your pack — and a figure is already there, boots planted across the path home. "Heard you came up on Aetheric Discs. Hand them over and you walk away with your teeth."`,
      },
      leaveLine: `You step back from Yulka's fire. She watches you go without comment. By morning she'll be three tiles over, telling someone else the same story.`,
      acceptBtnLabel: 'TAKE THE JOB — FIVE DISCS ON RETURN',
      buyBtnLabel: 'BUY — 50 TC FOR 5 DISCS',
    },
  },
  {
    id: 'brasko_lenses',
    title: `Brasko's Buried Lenses`,
    plantLocations: ['outpost_workshop'],
    plantChance: 0.12,
    plantLines: [
      `A grinder at the workshop bench doesn't look up from his wheel. "Brasko's out east after dark, if you deal in glass. Relic lenses, dug not bought. Two, three tiles past the wall. Follow the tapping."`,
      `Two apprentices argue over a cracked lens until one gives up: "Just buy off Brasko. East, night hours, tin lean-to. His glass is dug fresh and he's cheaper than any counter in here."`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    activeHours: [21, 5],
    content: {
      npcName: 'Brasko',
      pronoun: 'he',
      kicker: 'AT THE LEAN-TO',
      sighting: `A tin lean-to hunches against a mound of turned earth, a shuttered lamp hung low inside. A broad man sits sorting lenses by lamplight, each one wiped, breathed on, wiped again.`,
      pitch: `"Brasko." He holds a lens up to the lamp and squints through it at you. "Ground glass, relic grade, dug by my own hands. Sixty TC buys you a seeker's lens." He sets it down with exaggerated care. "Or earn one. A prier worked my dig while I slept — west of here, dragging my best glass. Bring the crate back and the lens is yours, plus coin for the walk. Choose while the lamp's lit."`,
      acceptLine: `"West. You'll hear him before you see him — glass doesn't travel quiet." Brasko turns his lamp down to a slit. "I'll be here. I'm always here."`,
      brief: `The prier is 2-3 tiles west of Brasko's lean-to. SET COURSE in the Contracts panel walks you there. Recover the lens crate and bring it back; a Relic Seeker's Lens and forty TC on return.`,
      markNoun: 'the prier',
      fetchEnemy: 'Lens Prier',
      fetchOffset: { dxRange: [-3, -2], dyRange: [0, 0] },
      fetchSpawnLine: `A stooped figure freezes over a padded crate, one hand still inside it. Wrapped glass clinks as he straightens. The Lens Prier weighs the crate against you, and keeps the crate.`,
      fetchRouteLabel: 'the Lens Prier',
      meetRouteLabel: `Brasko's lean-to`,
      returnRouteLabel: `Brasko (return the lenses)`,
      stolen: { name: 'Stolen Lens Crate', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Lens Prier goes down and the crate hits the silt with a sound like money breaking. You check the padding — the glass held. Brasko's dig, boxed and owed.`,
      goodsShort: 'lenses',
      goodsLong: 'the lens crate',
      buy: {
        costTc: 60,
        grant: { name: `Relic Seeker's Lens`, qty: 1, rarity: 'Uncommon', tags: [] },
        line: `Brasko counts your sixty twice, then hands the lens over wrapped in oiled cloth. "Ground true. If it shows you something ugly, that's the world's fault, not the glass."`,
        shortLine: `Brasko doesn't even reach for the lens. "Sixty. You're carrying less than sixty." He goes back to his sorting.`,
      },
      reward: { item: { name: `Relic Seeker's Lens`, qty: 1, rarity: 'Uncommon', tags: [] }, tc: 40 },
      returnLine: `Brasko opens the crate on his knees and touches every lens once, like counting children. "All here." He wraps one and pushes it into your hands with forty TC. "Dug that one the day the rain stopped. It's yours."`,
      emptyHandsLine: `Brasko looks at your empty hands, then back at his lamp. "The crate, or nothing. Glass doesn't take promises." He turns the lamp away from you.`,
      completeLines: [`You brought Brasko's dig back from the prier who worked it. He paid in glass and coin and something like respect.`],
      ambush: {
        enemy: 'Road Skimmer',
        chance: 0.25,
        line: `Three steps from the lean-to a shape peels off the dark, palm out. "Heavy pack for a light night. The glass, friend. Slow."`,
      },
      leaveLine: `You leave Brasko to his lamp and his lenses. He doesn't watch you go; the glass is better company.`,
      acceptBtnLabel: 'TAKE THE JOB — A LENS AND 40 TC',
      buyBtnLabel: 'BUY — 60 TC FOR A LENS',
    },
  },
  {
    id: 'mirelle_tinctures',
    title: `Mirelle's Tincture Satchel`,
    plantLocations: ['outpost_chapel'],
    plantChance: 0.12,
    plantLines: [
      `An old woman lighting chapel tapers speaks without turning. "The herb-boiler, Mirelle. West of the walls in daylight, under the bent marker-stone. She mends what the vats can't. Worth the walk if you're hurting."`,
      `A kneeling pilgrim finishes his prayer and stands with a wince. "Mirelle boils west of here, days. Good tinctures, fair prices. Somebody lifted her satchel this week — she could use a friend with fast hands."`,
    ],
    targetOffset: { dxRange: [-3, -2], dyRange: [-1, 1] },
    activeHours: [6, 18],
    content: {
      npcName: 'Mirelle',
      pronoun: 'she',
      kicker: 'AT THE BOILING STONE',
      sighting: `A low fire burns clean and smokeless beside a bent marker-stone. A wiry woman crouches over a copper pot, stirring with a wooden spoon worn to the grain, jars ranked around her by color.`,
      pitch: `"Mirelle. Don't touch the jars." She doesn't stop stirring. "A poacher went through my camp two nights back and walked off with my satchel — every tincture I'd put up this season. He's holed up south of here, close." She taps the spoon twice on the pot rim. "Bring it back whole and I'll set you up with vials and coin. I don't sell what I don't have, so there's no other offer."`,
      acceptLine: `"South. Two tiles, maybe three." Mirelle finally looks at you, once, all the way through. "The jars are wax-sealed. If he's opened them, bring the satchel anyway. I want the satchel."`,
      brief: `The poacher is 2-3 tiles south of Mirelle's boiling stone. SET COURSE walks you there. Recover the tincture satchel and bring it back; two Etheric Potion Vials and twenty-five TC on return.`,
      markNoun: 'the poacher',
      fetchEnemy: 'Marsh Poacher',
      fetchOffset: { dxRange: [0, 0], dyRange: [2, 3] },
      fetchSpawnLine: `A tarp shifts where no wind is. A rangy man rises from under it with a leather satchel slung crosswise, jars clinking. The Marsh Poacher pulls a knife with his free hand.`,
      fetchRouteLabel: 'the Marsh Poacher',
      meetRouteLabel: `Mirelle's boiling stone`,
      returnRouteLabel: `Mirelle (return the satchel)`,
      stolen: { name: 'Stolen Tincture Satchel', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Marsh Poacher folds and the satchel slides free. You check the jars — wax seals unbroken, every one. Mirelle's season, saved.`,
      goodsShort: 'satchel',
      goodsLong: 'the tincture satchel',
      buyRefusalLine: `Mirelle shakes her head once. "I don't sell what I don't have. The satchel first. Everything's in the satchel."`,
      reward: { item: { name: 'Etheric Potion Vial', qty: 2, rarity: 'Uncommon', tags: [] }, tc: 25 },
      returnLine: `Mirelle takes the satchel and counts jars by touch, eyes closed. "Whole." She presses two vials and a fold of coin into your hand. "Drink the pale one for wounds. The dark one, only if you mean it."`,
      emptyHandsLine: `Mirelle reads your hands before your face. "No satchel, no talk. I'm boiling." She goes back to the pot.`,
      completeLines: [`You brought Mirelle's tincture satchel home with every seal unbroken. She paid in vials and told you which one to trust.`],
      leaveLine: `You leave Mirelle to her pot. The clean smoke follows you a tile before the mud smell takes over again.`,
      acceptBtnLabel: 'TAKE THE JOB — 2 VIALS AND 25 TC',
    },
  },
  {
    id: 'saffi_thread',
    title: `Saffi and the Singing Wire`,
    plantLocations: ['outpost_lab'],
    plantChance: 0.12,
    plantLines: [
      `A lab tech re-coiling a dead spool mutters to nobody: "Saffi strings wire north of the walls, night work. Etheric thread, real gauge. Cheaper than requisition and twice as honest."`,
      `Someone has chalked on the lab's slate: WIRE — SAFFI — N. AFTER DARK. Under it, smaller: "stripper hit their camp, approach polite."`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
    activeHours: [19, 3],
    content: {
      npcName: 'Saffi',
      pronoun: 'they',
      kicker: 'UNDER THE WIRE',
      sighting: `Thin wire runs tent-shaped from a pole to the ground, humming faint in the dark. A slight figure sits cross-legged beneath it, eyes shut, one finger resting on the lowest strand like reading a pulse.`,
      pitch: `"Saffi," they say, eyes still shut. "You're standing on my ground wire. Step left." They open their eyes. "Etheric thread, forty-five TC the bundle — or a trade. A stripper's been shaving my lines a little more each night. He dens east of here with three spools of mine. Fetch them back, keep a bundle, and I'll add coin. The wire told me you fight better than you sneak, so go loud."`,
      acceptLine: `"East. Follow the dead lines — he leaves them limp behind him." Saffi closes their eyes again. "The wire will tell me how it went before you do."`,
      brief: `The stripper is 2-3 tiles east of Saffi's wire camp. SET COURSE walks you there. Recover the thread spools; three bundles of Etheric Thread and thirty TC on return.`,
      markNoun: 'the stripper',
      fetchEnemy: 'Copper Stripper',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `Coils of stripped wire hang off a squatting figure like cheap jewelry. The Copper Stripper stands slow, a pair of cutters swinging from his fist, and steps between you and his hoard.`,
      fetchRouteLabel: 'the Copper Stripper',
      meetRouteLabel: `Saffi's wire camp`,
      returnRouteLabel: `Saffi (return the spools)`,
      stolen: { name: 'Stolen Thread Spools', qty: 3, tags: ['whisper', 'quest'] },
      recoverLine: `The Copper Stripper drops among his own coils. Three spools of true Etheric thread sit apart from the junk, still wound tight. Saffi's lines, coming home.`,
      goodsShort: 'spools',
      goodsLong: 'the thread spools',
      buy: {
        costTc: 45,
        grant: { name: 'Etheric Thread', qty: 3, rarity: 'Uncommon', tags: [] },
        line: `Saffi takes your coin without counting it and pulls three bundles off the live line, still warm. "Fresh off the sing. Mind the ends — they remember being lightning."`,
        shortLine: `Saffi doesn't move. "Forty-five. The wire says your purse is lighter than that, and the wire doesn't lie."`,
      },
      reward: { item: { name: 'Etheric Thread', qty: 3, rarity: 'Uncommon', tags: [] }, tc: 30 },
      returnLine: `Saffi takes the spools and holds each to their ear in turn. "Still singing." They hand you three bundles and press coin after it. "The wire liked you. That's rarer than the thread."`,
      emptyHandsLine: `Saffi's finger stays on the strand. "The wire says your pack is empty of my spools. Come back when it sings otherwise."`,
      completeLines: [`You brought Saffi's spools back still singing. They paid in thread and coin and the wire's good opinion.`],
      leaveLine: `You step back off Saffi's ground. Behind you the wire hums one low note, like a door closing politely.`,
      acceptBtnLabel: 'TAKE THE JOB — 3 THREAD AND 30 TC',
      buyBtnLabel: 'BUY — 45 TC FOR 3 THREAD',
    },
  },
  {
    id: 'garrin_charts',
    title: `Garrin's Missing Miles`,
    // ⚠ OTA-1548 — NOT the gate. Every player crosses outpost_gate on every
    // arrival and departure — a fresh character is standing in it before they
    // have done anything — so a plant roll hung there fires many times more
    // often than one in a room you visit on purpose, and lands rumours on
    // character creation. Chains live in destination rooms.
    plantLocations: ['outpost_central'],
    plantChance: 0.12,
    plantLines: [
      `A courier resting her load in the square nods past the walls. "That cartographer, Garrin — camps west of here now, any hour. Lost half his charts to a runner last week. Man drew half the safe roads in this region. Somebody should care."`,
      `Chalked small on a crate in the square, in a draftsman's hand: "GARRIN — W — 2-3 mi. Charts bought, charts drawn. One runner's debt outstanding."`,
    ],
    targetOffset: { dxRange: [-3, -2], dyRange: [-1, 1] },
    content: {
      npcName: 'Garrin',
      pronoun: 'he',
      kicker: 'AT THE DRAFTING BOARD',
      sighting: `A drafting board stands on legs of scavenged pipe, weighted at each corner against the wind. A gaunt man draws a coastline from memory, slow and certain, like the land owes him the shape.`,
      pitch: `"Garrin." He doesn't lift the pen. "I map what's left. A runner took a folio of my field charts — the north fords, the sink lines, two years of miles — and went to ground north of here." The pen stops. "I can't redraw what I can't re-walk, and my knees are done walking. Bring the folio back and I'll pay you in the one thing better than a map: the compass I drew them with, and coin. I don't sell the originals. Ever."`,
      acceptLine: `"North. He camps low — look for ground with no birds over it." Garrin dips the pen. "Miles come back or they don't. Bring my miles back."`,
      brief: `The runner is 2-3 tiles north of Garrin's drafting board. SET COURSE walks you there. Recover the chart folio; a Tartarian Navigator's Compass and twenty TC on return.`,
      markNoun: 'the runner',
      fetchEnemy: 'Chart Runner',
      fetchOffset: { dxRange: [0, 0], dyRange: [-3, -2] },
      fetchSpawnLine: `A lean figure bolts up from a dry wash, an oilskin folio strapped across his back like a shield. The Chart Runner looks for a road out, finds you on it, and draws steel instead.`,
      fetchRouteLabel: 'the Chart Runner',
      meetRouteLabel: `Garrin's drafting board`,
      returnRouteLabel: `Garrin (return the folio)`,
      stolen: { name: 'Stolen Chart Folio', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Chart Runner falls and the folio comes free of him. Inside, the north fords in a steady hand, two years of miles, dry and whole. Garrin's memory, on paper.`,
      goodsShort: 'folio',
      goodsLong: 'the chart folio',
      buyRefusalLine: `Garrin's pen doesn't pause. "The originals aren't for sale. The folio first. Then we talk about what I'll part with."`,
      reward: { item: { name: `Tartarian Navigator's Compass`, qty: 1, rarity: 'Uncommon', tags: [] }, tc: 20 },
      returnLine: `Garrin unties the folio with shaking hands and turns every leaf. "All of it." He pushes a brass compass across the board. "Drew every chart in that folio by this needle. It pulls truer than I do now. Take it, and this." Coin follows.`,
      emptyHandsLine: `Garrin looks up just long enough to see your hands. "Those aren't my miles." The pen goes back to the coastline.`,
      completeLines: [`You brought Garrin back his two years of miles. He paid with the compass that drew them.`],
      leaveLine: `You leave Garrin to his coastline. The pen scratches on behind you, steady as a clock that only tells distance.`,
      acceptBtnLabel: 'TAKE THE JOB — COMPASS AND 20 TC',
    },
  },
  {
    id: 'petra_dice',
    title: `Petra's Loaded Luck`,
    plantLocations: ['outpost_messhall'],
    plantChance: 0.1,
    plantLines: [
      `A dishwasher stacks bowls loud enough to talk under. "Petra's running her game east of the walls again, nights. Bone dice, old ones. Somebody palmed them mid-game last week and she's been sharpening a grudge ever since."`,
      `Two off-shift guards trade a look over their stew. "You want work? Petra. East, after dark. Her lucky dice walked off in someone's sleeve and she pays real coin for grudges."`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    activeHours: [20, 2],
    content: {
      npcName: 'Petra',
      pronoun: 'she',
      kicker: 'AT THE GAME BLANKET',
      sighting: `A square of oilcloth is staked flat against the wind, a shuttered lantern at each corner. A sharp-eyed woman shuffles a cup of pebbles one-handed, over and over, like a habit with nowhere to go.`,
      pitch: `"Petra. Sit or don't." The pebbles stop. "I run a clean game with crooked dice — my grandmother's bones, carved before the mud came. A palmer lifted them out of my own cup, mid-throw, and had the stones to smile doing it. He's flopped west of here." Her jaw sets. "No dice, no game; no game, no living. Bring them back and fifty-five TC is yours. I don't want new dice. I want THOSE dice."`,
      acceptLine: `"West. He'll be throwing them for strangers' coin — my grandmother's bones, for STRANGERS." Petra spits neat past the lantern. "Break whatever's holding them."`,
      brief: `The palmer is 2-3 tiles west of Petra's game blanket. SET COURSE walks you there. Recover the carved bone dice; fifty-five TC on return.`,
      markNoun: 'the palmer',
      fetchEnemy: 'Dice Palmer',
      fetchOffset: { dxRange: [-3, -2], dyRange: [0, 0] },
      fetchSpawnLine: `A crouched figure rattles dice in a cup and throws against a rock — then sees you and closes his fist over the bones mid-bounce. The Dice Palmer stands up smiling, which is worse than a knife.`,
      fetchRouteLabel: 'the Dice Palmer',
      meetRouteLabel: `Petra's game blanket`,
      returnRouteLabel: `Petra (return the dice)`,
      stolen: { name: 'Stolen Bone Dice', qty: 2, tags: ['whisper', 'quest'] },
      recoverLine: `The Dice Palmer drops and his fist opens. Two bone dice, carved fine and yellowed with three generations of throws, roll free — snake eyes at nobody. Petra's luck, boxed.`,
      goodsShort: 'dice',
      goodsLong: 'the bone dice',
      buyRefusalLine: `Petra laughs with no humor in it. "Buy? They're not mine to sell and not yours to buy. They're my grandmother's. Bring them home."`,
      reward: { tc: 55 },
      returnLine: `Petra takes the dice and rolls them once across the oilcloth. Whatever they show, her shoulders come down an inch. "Grandmother says thanks." She counts fifty-five TC into your palm without looking at it.`,
      emptyHandsLine: `Petra reads your hands the way she reads a table. "No bones, no business." The pebble cup starts up again.`,
      completeLines: [`You brought Petra's grandmother's dice home. She rolled them once, paid you in full, and looked ten years younger.`],
      ambush: {
        enemy: 'Silt Footpad',
        chance: 0.3,
        line: `A soft step behind you, then a voice pitched friendly: "Heard you did Petra a favor and got paid for it. Generous mood going around tonight?"`,
      },
      leaveLine: `You leave Petra to her pebbles. The cup rattles on behind you, patient as a debt.`,
      acceptBtnLabel: 'TAKE THE JOB — 55 TC ON RETURN',
    },
  },
  {
    id: 'hollis_salt',
    title: `Hollis and the Salt Road`,
    plantLocations: ['outpost_central'],
    plantChance: 0.12,
    plantLines: [
      `A porter sets down two crates in the square and stretches his back. "Salt's short again. Hollis carts it up from the pans, south of here, daylight man. Runner cracked his last load and he's paying for the recovery."`,
      `A woman haggling over a thumb of salt gives up in disgust. "Go to the source. Hollis, south, while the sun's up. Half the price and he doesn't weigh his thumb with it."`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [2, 3] },
    activeHours: [5, 17],
    content: {
      npcName: 'Hollis',
      pronoun: 'he',
      kicker: 'AT THE SALT CART',
      sighting: `A hand-cart stands axle-deep in silt, white blocks lashed under wet burlap. A thick-set man scrapes crust from a pan lid and doesn't waste the scrapings, tapping them into a horn at his belt.`,
      pitch: `"Hollis. Salt's the trade." He thumps the cart rail. "Thirty-five TC the pouch, clean pan salt — or a job, if your arms work. A runner smashed my morning load and dragged the best bricks east into the flats." He shows you hands cracked white at every knuckle. "Salt's slow money. I can't chase and sell both. Fetch my bricks back and I'll pay you better than the pouch is worth."`,
      acceptLine: `"East, into the flats. Follow the white crumbs — he's leaking brick the whole way." Hollis goes back to his scraping. "Salt keeps. So do I."`,
      brief: `The runner is 2-3 tiles east of Hollis's cart. SET COURSE walks you there. Recover the salt bricks; forty-five TC and scrap metal on return.`,
      markNoun: 'the runner',
      fetchEnemy: 'Brine Runner',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `White dust marks a trail to a hunched figure prying at a salt brick with a flat iron. The Brine Runner stands, licks a crystal off his thumb, and hefts the iron your way.`,
      fetchRouteLabel: 'the Brine Runner',
      meetRouteLabel: `Hollis's salt cart`,
      returnRouteLabel: `Hollis (return the bricks)`,
      stolen: { name: 'Stolen Salt Bricks', qty: 4, tags: ['whisper', 'quest'] },
      recoverLine: `The Brine Runner goes down in his own white trail. Four salt bricks sit stacked under his tarp, barely chipped. Hollis's morning, salvaged.`,
      goodsShort: 'bricks',
      goodsLong: 'the salt bricks',
      buy: {
        costTc: 35,
        grant: { name: 'Worn Tartarian Coin', qty: 3, rarity: 'Common', tags: [] },
        line: `Hollis weighs out a pouch and drops three old coins on top for luck. "Pan salt and honest change. Tell them where you got it."`,
        shortLine: `Hollis squints at your purse like a bad pan. "Thirty-five. Come back when you're carrying it."`,
      },
      reward: { item: { name: 'Scrap Metal', qty: 2, rarity: 'Common', tags: [] }, tc: 45 },
      returnLine: `Hollis stacks the bricks back on the cart and lashes them like they might run again. "Good arms." He counts forty-five TC slow and adds two solid lengths of scrap. "For the cart you'll own someday."`,
      emptyHandsLine: `Hollis looks at your empty hands and shrugs the shrug of a man who's lost loads before. "Bricks or nothing. Salt doesn't take credit."`,
      completeLines: [`You hauled Hollis's salt bricks back out of the flats. He paid in coin and scrap and cart-owner's advice.`],
      leaveLine: `You leave Hollis scraping his pans. Behind you the horn at his belt clicks, salt going nowhere slowly.`,
      acceptBtnLabel: 'TAKE THE JOB — 45 TC AND SCRAP',
      buyBtnLabel: 'BUY — 35 TC FOR SALT AND COIN',
    },
  },
  {
    id: 'wren_songbook',
    title: `Wren and the Hymn Plates`,
    plantLocations: ['outpost_chapel'],
    plantChance: 0.1,
    plantLines: [
      `The taper-lighter pauses at the last wick. "You hear singing north of the walls some nights? That's Wren. Her hymn plates were lifted out of the chapel porch a week back and the nights have been quiet since. Quiet's worse."`,
      `A note pinned under a chapel candle, in a careful hand: "The singer camps north, after dark. Her plates were taken. The verses are older than the outpost. — a friend of the songs"`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
    activeHours: [18, 2],
    content: {
      npcName: 'Wren',
      pronoun: 'she',
      kicker: 'AT THE COLD ALTAR',
      sighting: `A flat stone stands upright in the silt, wind-worn smooth — an altar older than any wall. A small woman sits at its base wrapped in a gray blanket, humming something with the words missing.`,
      pitch: `"Wren," she says, and the hum stops like a held breath. "The verses live on tin plates, stamped letter by letter — the only copy left this side of the mud. A peddler took them off the chapel porch to sell as scrap script." Her voice stays level; her hands don't. "He hawks them north of here. Bring my plates home and I'll give you the pendant that used to light my reading, and coin. The songs go quiet otherwise. All the way quiet."`,
      acceptLine: `"North. You'll know him by the sales pitch — he reads the verses out like prices." Wren pulls the blanket tighter. "They're not prices."`,
      brief: `The peddler is 2-3 tiles north of Wren's altar stone. SET COURSE walks you there. Recover the hymn plates; a Glowstone Pendant and thirty TC on return.`,
      markNoun: 'the peddler',
      fetchEnemy: 'Verse Peddler',
      fetchOffset: { dxRange: [0, 0], dyRange: [-3, -2] },
      fetchSpawnLine: `A reedy man stands on a crate declaiming to nobody, tin plates fanned in one hand like a winning deal. The Verse Peddler sees your face and knows a customer from a collector.`,
      fetchRouteLabel: 'the Verse Peddler',
      meetRouteLabel: `Wren's altar stone`,
      returnRouteLabel: `Wren (return the plates)`,
      stolen: { name: 'Stolen Hymn Plates', qty: 6, tags: ['whisper', 'quest'] },
      recoverLine: `The Verse Peddler drops mid-verse. Six tin plates fan across the silt, stamped letters catching what light there is. The songs, in hand.`,
      goodsShort: 'plates',
      goodsLong: 'the hymn plates',
      buyRefusalLine: `Wren almost smiles. "You can't buy a song back into a mouth. The plates. Then we'll see what I can give."`,
      reward: { item: { name: 'Glowstone Pendant', qty: 1, rarity: 'Common', tags: [] }, tc: 30 },
      returnLine: `Wren takes the plates one at a time, reading each with her thumb before the next. Then she sings a single line, clear across the flats, and unclasps the pendant from her own neck. "I know them by heart now. You keep the light."`,
      emptyHandsLine: `Wren looks at your hands and the hum starts again, lower. "Not yet, then." She turns back to the stone.`,
      completeLines: [`You brought the hymn plates back to Wren's altar. She sang one line and paid you with her own reading light.`],
      leaveLine: `You leave Wren at the cold altar. A tile out, the humming starts again behind you — patient, and missing its words.`,
      acceptBtnLabel: 'TAKE THE JOB — PENDANT AND 30 TC',
    },
  },
  {
    id: 'dazak_solder',
    title: `Dazak's True Solder`,
    plantLocations: ['outpost_workshop'],
    plantChance: 0.12,
    plantLines: [
      `A tinker bites a joint apart and swears. "Cold solder again. Dazak pours true ingots east of the walls, daylight. A grubber's been at his molds — man could use a spare pair of fists."`,
      `Scratched into the workshop bench, fresh: "TRUE SOLDER = DAZAK. E of gate, sunup to sundown. Ask about the grubber, get paid."`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    activeHours: [7, 19],
    content: {
      npcName: 'Dazak',
      pronoun: 'he',
      kicker: 'AT THE POUR STONE',
      sighting: `Heat shimmer stands over a flat stone rigged with clay molds. A soot-black man tips a crucible with tongs, pouring a silver line thin as script, not spilling a drop.`,
      pitch: `"Dazak. Mind the pour." He sets the crucible down before he looks at you. "True solder, forty TC the batch — flows at a whisper, holds like an oath. Or work: a grubber's been raiding my cooling molds at night, snapped off half a season's ingots. He dens south." He shows you a broken mold like a wound. "Bring my ingots back and I'll pay in tools worth more than the metal."`,
      acceptLine: `"South. He'll be trying to melt them down with a fire that couldn't soften butter." Dazak almost smiles. "The ingots will keep. He won't."`,
      brief: `The grubber is 2-3 tiles south of Dazak's pour stone. SET COURSE walks you there. Recover the solder ingots; Ancient Tools and thirty-five TC on return.`,
      markNoun: 'the grubber',
      fetchEnemy: 'Tin Grubber',
      fetchOffset: { dxRange: [0, 0], dyRange: [2, 3] },
      fetchSpawnLine: `A smoky, useless fire gutters beside a crouched figure sawing at an ingot with a file. The Tin Grubber stands with the file forward, silver dust on his sleeves like guilt.`,
      fetchRouteLabel: 'the Tin Grubber',
      meetRouteLabel: `Dazak's pour stone`,
      returnRouteLabel: `Dazak (return the ingots)`,
      stolen: { name: 'Stolen Solder Ingots', qty: 5, tags: ['whisper', 'quest'] },
      recoverLine: `The Tin Grubber drops his file and then himself. Five true ingots sit by his pathetic fire, barely scratched. Dazak's season, recovered.`,
      goodsShort: 'ingots',
      goodsLong: 'the solder ingots',
      buy: {
        costTc: 40,
        grant: { name: 'Scrap Metal', qty: 3, rarity: 'Common', tags: [] },
        line: `Dazak wraps a batch in waxed paper and thumps in three lengths of good scrap unasked. "The solder's the buy. The scrap is because you didn't haggle."`,
        shortLine: `Dazak taps the crucible with his tongs. "Forty. Metal doesn't pour on promises."`,
      },
      reward: { item: { name: 'Ancient Tools', qty: 1, rarity: 'Common', tags: [] }, tc: 35 },
      returnLine: `Dazak checks each ingot against his thumbnail, then nods once, which from him is a speech. He lays a roll of old tools in your arms and counts coin on top. "These outlived their maker. Now they'll outlive me. Use them straight."`,
      emptyHandsLine: `Dazak reads your empty hands and turns back to the heat. "Ingots first. The pour won't wait and neither will I."`,
      completeLines: [`You brought Dazak's true solder home from the grubber's cold fire. He paid in tools that outlived their maker.`],
      leaveLine: `You leave Dazak to the shimmer. Behind you the crucible tips again — a thin silver line, not a drop spilled.`,
      acceptBtnLabel: 'TAKE THE JOB — TOOLS AND 35 TC',
      buyBtnLabel: 'BUY — 40 TC FOR SOLDER',
    },
  },
  {
    id: 'imogen_keys',
    title: `Imogen's Ring of Keys`,
    plantLocations: ['outpost_quarters'],
    plantChance: 0.1,
    plantLines: [
      `A bunkmate turns over and mutters at the ceiling: "Locksmith Imogen's camped west of the walls, late nights. Somebody picked HER pocket — took the whole ring of keys. There's a joke in there and she's not laughing."`,
      `Pinned to the quarters door with a bent nail: "LOST: ring of keys, brass, twenty-two teeth of my life. Reward. Find Imogen, west, after the late bell."`,
    ],
    targetOffset: { dxRange: [-3, -2], dyRange: [-1, 1] },
    activeHours: [22, 4],
    content: {
      npcName: 'Imogen',
      pronoun: 'she',
      kicker: 'AT THE WORK BLANKET',
      sighting: `A blanket spread with lock guts — springs, wards, half-cut blanks — glints under a hooded lamp. A gray-haired woman files a key blank by feel, watching the dark instead of her hands.`,
      pitch: `"Imogen. Locks and keys, thirty years." The file doesn't stop. "Some latch-picker lifted my whole ring — twenty-two keys, half of them to doors that don't exist anymore. To me that ring is thirty years of shut things trusting me back." She sets the file down. "He's east of here, trying my keys in rocks for all I know. Bring the ring home and I'll cut you something rare, and pay coin besides."`,
      acceptLine: `"East. Listen for jingling — the fool wears them like a bell." Imogen picks the file back up. "Twenty-two keys. Count them before you leave him."`,
      brief: `The latch-picker is 2-3 tiles east of Imogen's work blanket. SET COURSE walks you there. Recover the ring of keys; an Old Relic Key and forty-five TC on return.`,
      markNoun: 'the picker',
      fetchEnemy: 'Latch Picker',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `A jingling gives him away before the dark does. The Latch Picker rises from behind a rock with the ring at his hip singing every step, and a pry-bar coming up in both hands.`,
      fetchRouteLabel: 'the Latch Picker',
      meetRouteLabel: `Imogen's work blanket`,
      returnRouteLabel: `Imogen (return the keys)`,
      stolen: { name: 'Stolen Key Ring', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Latch Picker goes quiet and the ring comes free of his belt. You count by lamplight: twenty-two keys, brass worn to gold at the shoulders. Thirty years, on one ring.`,
      goodsShort: 'keys',
      goodsLong: 'the ring of keys',
      buyRefusalLine: `Imogen laughs once, dry as the file. "Buy my own keys? Bring them home and I'll cut you something better than money."`,
      reward: { item: { name: 'Old Relic Key', qty: 1, rarity: 'Common', tags: [] }, tc: 45 },
      returnLine: `Imogen counts the ring twice, lips moving. "Twenty-two." She pulls one dark old key off a cord around her neck. "Relic work. Never found its door. Maybe you will." Coin follows, uncounted, which for a locksmith is trust.`,
      emptyHandsLine: `Imogen glances up, counts your hands, and goes back to filing. "Twenty-two keys. You're carrying none of them."`,
      completeLines: [`You returned Imogen's thirty years of keys. She paid with a relic key that never found its door.`],
      ambush: {
        enemy: 'Road Skimmer',
        chance: 0.25,
        line: `A shape drifts out of the dark, hands loose. "Locksmith paid you, did she? Keys open purses too, friend. Let's see yours."`,
      },
      leaveLine: `You leave Imogen filing in the dark. The lamp hood clicks down another notch behind you, guarding its inch of light.`,
      acceptBtnLabel: 'TAKE THE JOB — RELIC KEY AND 45 TC',
    },
  },
  {
    id: 'tolvek_bolts',
    title: `Tolvek Counts His Bolts`,
    plantLocations: ['outpost_armory'],
    plantChance: 0.12,
    plantLines: [
      `The armory quartermaster slams a near-empty bolt crate. "Short again. Tolvek fletches south of the walls, any hour — honest bolts, fair price. Some quiver rat's been bleeding his stock and OUR supply with it."`,
      `A fletching knife pins a note to the armory board: "Bolts by the sheaf. Tolvek, south, look for the feather pole. Rat problem — inquire within."`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [2, 3] },
    content: {
      npcName: 'Tolvek',
      pronoun: 'he',
      kicker: 'AT THE FEATHER POLE',
      sighting: `A pole strung with fletching feathers turns slow in the wind, a trade sign readable a tile off. Beneath it a squat man sits on an ammo crate, sighting down a bolt shaft with one closed eye.`,
      pitch: `"Tolvek. Bolts." He rolls the shaft between his palms, listening to it. "Thirty TC the half-sheaf, straight as judgment — or earn a stack. A quiver rat's been nipping my bundles, one sheaf a night, and he's not even SELLING them, he's HOARDING them, west of here, like a magpie with thumbs." The bolt stops rolling. "Fetch my sheaves back. I'll pay coin and count you out bolts besides."`,
      acceptLine: `"West. His camp looks like a porcupine died on it." Tolvek goes back to listening to the shaft. "Mind the sharp ends. All of mine are sharp."`,
      brief: `The quiver rat is 2-3 tiles west of Tolvek's feather pole. SET COURSE walks you there. Recover the bolt sheaves; six Bone Bolts and twenty-five TC on return.`,
      markNoun: 'the rat',
      fetchEnemy: 'Quiver Rat',
      fetchOffset: { dxRange: [-3, -2], dyRange: [0, 0] },
      fetchSpawnLine: `Bolts bristle from a low den like quills — dozens, unstrung, unsold, hoarded. The Quiver Rat scrambles out with one in each fist, holding them like knives he's only half sure about.`,
      fetchRouteLabel: 'the Quiver Rat',
      meetRouteLabel: `Tolvek's feather pole`,
      returnRouteLabel: `Tolvek (return the sheaves)`,
      stolen: { name: 'Stolen Bolt Sheaves', qty: 3, tags: ['whisper', 'quest'] },
      recoverLine: `The Quiver Rat drops among his hoard. Three full sheaves stand bundled and untouched at the back of the den — too precious to use, too hoarded to sell. Tolvek's count, restored.`,
      goodsShort: 'sheaves',
      goodsLong: 'the bolt sheaves',
      buy: {
        costTc: 30,
        grant: { name: 'Bone Bolt', qty: 6, rarity: 'Common', tags: [] },
        line: `Tolvek counts you six bolts, checking each spine against his thumb. "Straight as judgment. Aim like you mean it and they'll land like you did."`,
        shortLine: `Tolvek doesn't stop rolling the shaft. "Thirty. Bolts fly one way and so does credit."`,
      },
      reward: { item: { name: 'Bone Bolt', qty: 6, rarity: 'Common', tags: [] }, tc: 25 },
      returnLine: `Tolvek unbundles a sheaf and counts under his breath, then again out loud for the pleasure of it. "All there." He counts six bolts into your hand one at a time, then the coin the same way. "Counting's free. Everything else costs."`,
      emptyHandsLine: `Tolvek looks at your hands, then holds up a bolt and sights down it at you, one eye closed. "Sheaves. Then we talk."`,
      completeLines: [`You emptied the quiver rat's hoard back into Tolvek's count. He paid in bolts and coin, both counted twice.`],
      leaveLine: `You leave Tolvek under his turning feathers. Behind you a bolt shaft rolls and rolls between his palms, never quite satisfied.`,
      acceptBtnLabel: 'TAKE THE JOB — 6 BOLTS AND 25 TC',
      buyBtnLabel: 'BUY — 30 TC FOR 6 BOLTS',
    },
  },
  {
    id: 'nessa_fungus',
    title: `Nessa's Cold Light`,
    plantLocations: ['outpost_lab'],
    plantChance: 0.1,
    plantLines: [
      `A lab tech taps a dead glow-jar. "Cultures came from Nessa. She grows them south of the walls, nights — cold light, no fuel, no flame. A skimmer cleaned out her best jars this week. The lab's next unless someone helps her."`,
      `The lab slate, in glowing chalk that shouldn't glow: "NESSA — S — after dark. The light is grown, not burned. Skimmer took the mothers. Reward for return."`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [2, 3] },
    activeHours: [20, 4],
    content: {
      npcName: 'Nessa',
      pronoun: 'she',
      kicker: 'IN THE GLOW GARDEN',
      sighting: `Soft blue-green light leaks from under a lattice of stretched tarps — rows of jars glowing steady with no flame anywhere. A round-faced woman moves among them turning each jar a quarter, like tending sleeping birds.`,
      pitch: `"Nessa. Keep your shadow off the rows, they sulk." She holds up a jar gone dark. "A spore skimmer took my mother-cultures — the jars every other jar is born from. Without them this whole garden dies out in a season, and every cold lamp in the outpost with it." She sets the dead jar down gently anyway. "He's gone to ground north. The cultures keep three days in a sealed jar. Bring my mothers home."`,
      acceptLine: `"North. You'll see the glow through his tent if he hasn't smothered them yet." Nessa turns another jar. "Three days. Walk like it."`,
      brief: `The skimmer is 2-3 tiles north of Nessa's glow garden. SET COURSE walks you there. Recover the mother-culture jars; three Bioluminescent Fungus and thirty TC on return.`,
      markNoun: 'the skimmer',
      fetchEnemy: 'Spore Skimmer',
      fetchOffset: { dxRange: [0, 0], dyRange: [-3, -2] },
      fetchSpawnLine: `A tent glows faintly from the inside, blue-green through worn canvas. The Spore Skimmer backs out of it holding a crate of light in both arms, sees you, and sets it down slow like a man putting down a baby to fight.`,
      fetchRouteLabel: 'the Spore Skimmer',
      meetRouteLabel: `Nessa's glow garden`,
      returnRouteLabel: `Nessa (return the cultures)`,
      stolen: { name: 'Stolen Mother-Cultures', qty: 3, tags: ['whisper', 'quest'] },
      recoverLine: `The Spore Skimmer drops beside his tent. Inside the crate three jars glow strong and steady, sealed tight, patient as moss. The garden's mothers, alive.`,
      goodsShort: 'cultures',
      goodsLong: 'the mother-cultures',
      buyRefusalLine: `Nessa shakes her head at the rows. "Everything I could sell you is BORN from what he took. The mothers first. Then the garden can afford to be generous."`,
      reward: { item: { name: 'Bioluminescent Fungus', qty: 3, rarity: 'Common', tags: [] }, tc: 30 },
      returnLine: `Nessa takes each jar to her ear like a shell, then beams. "Alive, alive, alive." She splits a fresh culture three ways into travel jars and pushes them at you with coin. "Grown from these very mothers. Feed them dark and they'll light your whole life."`,
      emptyHandsLine: `Nessa reads your hands, then the horizon north. "Two days left, maybe." She goes back to turning jars, faster now.`,
      completeLines: [`You brought Nessa's mother-cultures home alive. She paid in daughters of the very jars you carried.`],
      leaveLine: `You step out of the glow garden's light. It holds on your hands a moment longer than it should, then lets go.`,
      acceptBtnLabel: 'TAKE THE JOB — 3 FUNGUS AND 30 TC',
    },
  },
  {
    id: 'calder_censer',
    title: `Brother Calder's Cold Censer`,
    plantLocations: ['outpost_chapel'],
    plantChance: 0.1,
    plantLines: [
      `The chapel warden trims a wick short. "Brother Calder walks the east flats at night, swinging that old censer — or did, till an ash robber took it off him at knife-point. He still walks. Empty-handed, like a bell with no clapper."`,
      `Scratched into the chapel doorframe, low, as if by someone kneeling: "the censer is gone. calder walks east without it. someone make this right."`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    activeHours: [19, 3],
    content: {
      npcName: 'Calder',
      pronoun: 'he',
      kicker: 'ON THE NIGHT WALK',
      sighting: `A tall figure in a patched cassock walks a slow circuit in the dark, right arm swinging a censer that isn't there — the habit outliving the object. He stops when he sees you, arm still.`,
      pitch: `"Brother Calder." He looks at his own empty hand and puts it away. "For eleven years I've walked the flats at night with a censer of chapel ash — for the ones who died out here with no walls around them. An ash robber took it. The brass is worth ten TC. What's in it is worth eleven years." He nods south. "He camps that way. I have sixty TC — the chapel's, given freely. Bring the censer back. The dead notice the quiet, or I do, and I've stopped being sure of the difference."`,
      acceptLine: `"South. The censer swings a green flame when it's carried — he won't be able to resist swinging it." Calder resumes his circuit, empty-handed. "I'll be walking."`,
      brief: `The robber is 2-3 tiles south of Calder's night walk. SET COURSE walks you there. Recover the chapel censer; sixty TC on return.`,
      markNoun: 'the robber',
      fetchEnemy: 'Ash Robber',
      fetchOffset: { dxRange: [0, 0], dyRange: [2, 3] },
      fetchSpawnLine: `A point of green flame swings arcs in the dark ahead — someone playing with what they don't understand. The Ash Robber lets the censer clatter down and pulls a blade still gray with stolen ash.`,
      fetchRouteLabel: 'the Ash Robber',
      meetRouteLabel: `Calder's night walk`,
      returnRouteLabel: `Calder (return the censer)`,
      stolen: { name: 'Stolen Chapel Censer', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Ash Robber falls and the censer rolls free, still warm, the green ember inside refusing to die. Eleven years of walking, back in hand.`,
      goodsShort: 'censer',
      goodsLong: 'the chapel censer',
      buyRefusalLine: `Calder shakes his head slowly. "It was never for sale, and I won't start it down that road by buying it back twice. Bring it, if you can."`,
      reward: { tc: 60 },
      returnLine: `Calder takes the censer in both hands and stands very still. Then his arm remembers, and the green flame swings its first slow arc. "Eleven years, and one bad week." He gives you the sixty without ceremony. "The dead thank you. I checked."`,
      emptyHandsLine: `Calder's arm swings its empty arc. "Still quiet, then." He walks on, and you have never heard anything quite so loud as that nothing.`,
      completeLines: [`You put the censer back in Brother Calder's hand. The green flame swings the flats again, and the dead are no longer waiting.`],
      ambush: {
        enemy: 'Silt Footpad',
        chance: 0.3,
        line: `A voice from the dark, too casual: "Chapel coin, is it? Holy money spends the same. Empty the pouch, pilgrim."`,
      },
      leaveLine: `You leave Brother Calder to his circuit. His arm keeps swinging its nothing, patient as faith and twice as stubborn.`,
      acceptBtnLabel: 'TAKE THE JOB — 60 TC ON RETURN',
    },
  },
  {
    id: 'ottiline_ledger',
    title: `Ottiline's Book of Debts`,
    plantLocations: ['outpost_central'],
    plantChance: 0.1,
    plantLines: [
      `A stall-keeper in the square lowers her voice. "Ottiline runs the lending blanket north of the walls, daylight. Her ledger walked off — every debt in the district in one book. Half this square owes her. The wrong hands on that book and we ALL have a bad year."`,
      `Two porters, passing: "— tore a page out and TOOK THE REST. Ottiline's offering seventy for the book. North, day hours. I'd go myself if I didn't owe her eleven."`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
    activeHours: [6, 18],
    content: {
      npcName: 'Ottiline',
      pronoun: 'she',
      kicker: 'AT THE LENDING BLANKET',
      sighting: `A woman sits behind a blanket bare of goods — her trade was never goods. An inkwell, a pen, and a book-shaped absence in front of her, which she stares into like a well.`,
      pitch: `"Ottiline. Sit." It is not a request. "I lend. Small sums, fair terms, thirty years of yes when the counters said no. Every debt lives in one ledger and a page-tearer took it — east of here, and he's not clever enough to collect on it, which means he'll SELL it to someone who is." She folds her hands. "Seventy TC for the book, whole. I am precise about money and I will be precise about gratitude."`,
      acceptLine: `"East. He'll be sounding out the entries — moving lips, no wit." Ottiline dips her pen over nothing, from habit. "The book, whole. Every page is somebody's roof."`,
      brief: `The page-tearer is 2-3 tiles east of Ottiline's lending blanket. SET COURSE walks you there. Recover the debt ledger; seventy TC on return.`,
      markNoun: 'the tearer',
      fetchEnemy: 'Page Tearer',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `A man sits cross-legged with a thick ledger open on his knees, lips moving over the entries. The Page Tearer slaps it shut when he sees you, and stands with it clutched like a shield he intends to swing.`,
      fetchRouteLabel: 'the Page Tearer',
      meetRouteLabel: `Ottiline's lending blanket`,
      returnRouteLabel: `Ottiline (return the ledger)`,
      stolen: { name: 'Stolen Debt Ledger', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Page Tearer goes down still holding the book. You work it free — thirty years of small sums and fair terms, one corner torn, everything legible. The district's roofs, in hand.`,
      goodsShort: 'ledger',
      goodsLong: 'the debt ledger',
      buyRefusalLine: `Ottiline's look could notarize a stone. "It is not for sale. It is for RETURNING. These are different transactions and only one of them is on offer."`,
      reward: { tc: 70 },
      returnLine: `Ottiline turns every page at reading speed, which for her is fast. "One corner torn. Acceptable losses." She counts seventy TC in stacks of ten, squared to the blanket's edge. "Your credit here is spotless. That is worth more than the seventy. But take the seventy."`,
      emptyHandsLine: `Ottiline looks at your hands the way she looks at a late payment. "The ledger. I don't do partial deliveries and neither should you."`,
      completeLines: [`You put the district's debts back in Ottiline's precise hands. She paid seventy, squared to the blanket's edge, and opened you an account.`],
      leaveLine: `You leave Ottiline staring into the book-shaped absence. Behind you the pen scratches a note into her palm, the only surface she has left.`,
      acceptBtnLabel: 'TAKE THE JOB — 70 TC ON RETURN',
    },
  },
  {
    id: 'ferro_magnets',
    title: `Ferro and the Pulling Stones`,
    plantLocations: ['outpost_workshop'],
    plantChance: 0.1,
    plantLines: [
      `A mechanic pries a bolt off the underside of the bench without touching it, grinning, then sobers. "Ferro's sphere, borrowed. He calibrates north of the walls at night. A lifter cleaned out his case this week — pulling stones in the wrong pockets, imagine."`,
      `Note on the workshop wall, held up by nothing visible: "FERRO — N — night. Ether spheres, charged true. (If you can read this, the demo works.) Ask about the lifter."`,
    ],
    targetOffset: { dxRange: [-1, 1], dyRange: [-3, -2] },
    activeHours: [21, 5],
    content: {
      npcName: 'Ferro',
      pronoun: 'he',
      kicker: 'IN THE PULL FIELD',
      sighting: `Small iron filings stand up from the silt in combed rows, pointing at a crate like grass growing sideways. A precise little man kneels among them with a brass sphere in a sling scale, weighing its pull against a known nail.`,
      pitch: `"Ferro. Stand behind the line, your buckles are ruining my rows." He rebalances the scale. "Magnetic ether spheres, charged and certified — fifty-five TC. Or a recovery: a loadstone lifter took my case of charged stock west of here, and the idiot is carrying six spheres LOOSE. IN A METAL CART." He pinches the bridge of his nose. "Retrieve the case before he learns why we use wooden boxes. Sphere and coin on return."`,
      acceptLine: `"West. If you hear a cart screaming, that's the bearings seizing. Follow the screaming." Ferro re-combs a row of filings with one finger, soothing them.`,
      brief: `The lifter is 2-3 tiles west of Ferro's pull field. SET COURSE walks you there. Recover the sphere case; a Magnetic Ether Sphere and thirty TC on return.`,
      markNoun: 'the lifter',
      fetchEnemy: 'Loadstone Lifter',
      fetchOffset: { dxRange: [-3, -2], dyRange: [0, 0] },
      fetchSpawnLine: `A hand-cart stands welded to itself by its own cargo, wheels cocked at angles wheels shouldn't hold. The Loadstone Lifter heaves at it, gives up, and turns on you with a pry-bar that bends visibly toward the cart.`,
      fetchRouteLabel: 'the Loadstone Lifter',
      meetRouteLabel: `Ferro's pull field`,
      returnRouteLabel: `Ferro (return the case)`,
      stolen: { name: 'Stolen Sphere Case', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Loadstone Lifter drops beside his ruined cart. The sphere case pries loose from the cart bed with a groan of parting metal — six spheres inside, sulking but whole. Ferro's stock, contained.`,
      goodsShort: 'case',
      goodsLong: 'the sphere case',
      buy: {
        costTc: 55,
        grant: { name: 'Magnetic Ether Sphere', qty: 1, rarity: 'Uncommon', tags: [] },
        line: `Ferro hands the sphere over in a wooden box packed with straw. "Charged true. Keep it a hand-width from anything you'd miss."`,
        shortLine: `Ferro doesn't look up from the scale. "Fifty-five. The sphere can wait. It's patient. It's a rock."`,
      },
      reward: { item: { name: 'Magnetic Ether Sphere', qty: 1, rarity: 'Uncommon', tags: [] }, tc: 30 },
      returnLine: `Ferro opens the case and checks each sphere against his known nail, muttering numbers. "Within tolerance. ALL of them. Astonishing." He boxes one for you with thirty TC. "You carried it in a WOODEN crate. You're my favorite person this season."`,
      emptyHandsLine: `Ferro glances at your pack, and two of your buckles twitch toward him. "No case. I can feel it from here. Come back heavier."`,
      completeLines: [`You pried Ferro's sphere case off the lifter's ruined cart. He paid in charged stone and rare approval.`],
      leaveLine: `You step over the combed rows and away. Behind you the filings sigh back into their pattern, pointing at the crate like they never doubted.`,
      acceptBtnLabel: 'TAKE THE JOB — SPHERE AND 30 TC',
      buyBtnLabel: 'BUY — 55 TC FOR A SPHERE',
    },
  },
  {
    id: 'quill_inks',
    title: `Quill's Iron Ink`,
    plantLocations: ['outpost_quarters'],
    plantChance: 0.1,
    plantLines: [
      `A bunkmate blows on a letter to dry it. "Good ink, this. From Quill — they boil it east of the walls, day hours. Iron-gall black that outlasts the paper. A dipper's been thieving the flasks; Quill's offering real pay."`,
      `On the quarters message board, in ink so black it looks wet: "I MAKE THE INK THIS IS WRITTEN IN. East, daylight. A dipper took my flasks. Reward stands. — Q"`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    activeHours: [8, 20],
    content: {
      npcName: 'Quill',
      pronoun: 'they',
      kicker: 'AT THE INK FIRE',
      sighting: `A small fire heats an iron pot that smells of oak and rust and something older. A stained-fingered figure decants black liquid through cloth, one careful thread at a time, into rows of stoppered flasks.`,
      pitch: `"Quill." They hold up their black hands by way of a card. "Iron-gall ink — outlasts the page, outlasts the writer. The chapel's records, Ottiline's ledger, half the letters home this outpost ever sent: my pot. An ink dipper lifted a crate of finished flasks and hauled it south." They strain another thread of black. "Words are how the dead keep talking. Bring my flasks back and I'll pay coin and something worth writing on."`,
      acceptLine: `"South. He'll have black fingerprints on everything he owns by now — the flasks weep if you carry them rough." Quill turns back to the pot. "Ink keeps. Go careful anyway."`,
      brief: `The dipper is 2-3 tiles south of Quill's ink fire. SET COURSE walks you there. Recover the ink flasks; a Tartarian Writing Tablet and forty TC on return.`,
      markNoun: 'the dipper',
      fetchEnemy: 'Ink Dipper',
      fetchOffset: { dxRange: [0, 0], dyRange: [2, 3] },
      fetchSpawnLine: `Black fingerprints mark a trail up a rise to a man uncorking a flask to sniff it, face already smudged like bad theater. The Ink Dipper corks it fast and picks up a stained club.`,
      fetchRouteLabel: 'the Ink Dipper',
      meetRouteLabel: `Quill's ink fire`,
      returnRouteLabel: `Quill (return the flasks)`,
      stolen: { name: 'Stolen Ink Flasks', qty: 8, tags: ['whisper', 'quest'] },
      recoverLine: `The Ink Dipper drops, printing one last black hand on the silt. The crate holds eight flasks, seven stoppered tight, one weeping a thin dark thread. Quill's words, mostly saved.`,
      goodsShort: 'flasks',
      goodsLong: 'the ink flasks',
      buyRefusalLine: `Quill shows you their stained palms. "Every flask I could sell you is in that crate. Bring it back and then I'll happily take your money some other day."`,
      reward: { item: { name: 'Tartarian Writing Tablet', qty: 1, rarity: 'Common', tags: [] }, tc: 40 },
      returnLine: `Quill counts flasks with their eyes and losses with their mouth. "Seven whole. He'll wear the eighth for a month." They wrap an old writing tablet with coin inside. "Something worth writing, on something worth keeping."`,
      emptyHandsLine: `Quill looks at your clean hands almost sadly. "No flasks. You'd be stained if you had them. Ink tells on everyone."`,
      completeLines: [`You followed the fingerprints and brought Quill's ink home. They paid in coin and a tablet worth keeping.`],
      leaveLine: `You leave Quill decanting the dark. The smell of oak and rust follows you a tile, patient as a signature.`,
      acceptBtnLabel: 'TAKE THE JOB — TABLET AND 40 TC',
    },
  },
  {
    id: 'maren_charms',
    title: `Maren's Warding Bones`,
    // ⚠ OTA-1548 — see garrin_charts: the gate is a corridor, not a room. The
    // armoury is where the guards who WEAR her work draw their kit anyway.
    plantLocations: ['outpost_armory'],
    plantChance: 0.1,
    plantLines: [
      `A guard drawing her night kit touches something small at her collar. "From Maren, this. She cuts warding charms west of the walls, after dark. A cutter jumped her camp and took the finished lot. We won't say how much we mind. We mind."`,
      `Tied to the weapon rack with red thread, a bone chip scratched with: "M — W — night. The wards are taken. The dark noticed. Fetch them back before it gets ideas."`,
    ],
    targetOffset: { dxRange: [-3, -2], dyRange: [-1, 1] },
    activeHours: [20, 4],
    content: {
      npcName: 'Maren',
      pronoun: 'she',
      kicker: 'AT THE WARD LINE',
      sighting: `A ring of bone chips hangs on red thread between stakes, turning slow though the wind has stopped. Inside it a scar-knuckled woman carves at a knuckle of bone, and the dark outside the ring feels a degree darker than it should.`,
      pitch: `"Maren. Step inside the thread, don't touch it." She doesn't stop carving. "I cut wards. Bone remembers being alive and I remind it — the guards wear my work, the chapel buries with it. A charm cutter hit my camp and took the season's finished lot east." Her knife pauses. "He thinks he'll sell them. Wards cut for one neck lie to every other. Bring them back before someone trusts a lie in the dark, and I'll cut you a true one, and pay besides."`,
      acceptLine: `"East. He'll feel watched the whole way — that's the wards, disagreeing with him." Maren blows bone dust off her knife. "They'll be glad to see you. You'll feel it."`,
      brief: `The cutter is 2-3 tiles east of Maren's ward line. SET COURSE walks you there. Recover the warding charms; a Warden's Etheric Charm and fifty TC on return.`,
      markNoun: 'the cutter',
      fetchEnemy: 'Charm Cutter',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `A man sits wrapped in stolen wards like a king in borrowed rings, and none of them are working for him — you can see the sweat from here. The Charm Cutter rises with a skinning knife and the look of someone who hasn't slept since the theft.`,
      fetchRouteLabel: 'the Charm Cutter',
      meetRouteLabel: `Maren's ward line`,
      returnRouteLabel: `Maren (return the wards)`,
      stolen: { name: 'Stolen Warding Charms', qty: 9, tags: ['whisper', 'quest'] },
      recoverLine: `The Charm Cutter drops, and you'd swear the bone chips on him sigh. Nine finished wards come loose in a bundle, warm to the touch in the cold air. The season's work, homing.`,
      goodsShort: 'wards',
      goodsLong: 'the warding charms',
      buyRefusalLine: `Maren taps the bone she's cutting. "A ward is cut TO a neck. Selling you one of those would be selling you a lie. Bring them back; I'll cut yours true."`,
      reward: { item: { name: `Warden's Etheric Charm`, qty: 1, rarity: 'Uncommon', tags: [] }, tc: 50 },
      returnLine: `Maren touches each returned ward to her own wrist, listening. "Home. All nine." Then she measures your neck with a knotted string, cuts for an hour by feel, and hangs the result on you with fifty TC. "Cut true, to you alone. The dark will have to introduce itself now."`,
      emptyHandsLine: `Maren looks past you at the dark outside the thread. "It's still out there wearing my work. Come back with the wards."`,
      completeLines: [`You brought Maren's season of wards home before a lie got trusted in the dark. She cut yours true and paid besides.`],
      ambush: {
        enemy: 'Dusk Prowler',
        chance: 0.3,
        line: `Something has been pacing you for a tile, patient as fog, and finally steps into your path — a lean shape with covered eyes. "The bone-cutter's coin. Give it, and keep the breathing part."`,
      },
      leaveLine: `You step back out through the thread. Behind you the bone chips turn a little faster, then settle, unimpressed.`,
      acceptBtnLabel: 'TAKE THE JOB — TRUE WARD AND 50 TC',
    },
  },
  {
    id: 'stellan_starglass',
    title: `Stellan Reads the Sky`,
    plantLocations: ['outpost_lab'],
    plantChance: 0.1,
    plantLines: [
      `An old scholar wipes dust from an empty telescope mount. "Stellan took the good glass west of the walls, late nights — says the sky reads cleaner away from our smoke. A creeper stole his eyepiece crystal. The man's up there every night, staring at a blur."`,
      `Lab slate, in a shaking hand: "STELLAN — W — late. The star-glass is taken. The sky proceeds unrecorded. This is not acceptable."`,
    ],
    targetOffset: { dxRange: [-3, -2], dyRange: [-1, 1] },
    activeHours: [22, 5],
    content: {
      npcName: 'Stellan',
      pronoun: 'he',
      kicker: 'AT THE SKY MOUNT',
      sighting: `A brass tube on a tripod aims at the overcast where a star should be, ledgers of sky-readings weighted open beneath it. An old man squints through the empty eyepiece socket anyway, out of loyalty.`,
      pitch: `"Stellan. Mind the ledgers, that's forty years of sky." He straightens with effort. "The mist parts out here, some nights, and I write down what the old world hung up there. My reading crystal — a whispering aether lens, irreplaceable — was crept off this very mount while I dozed." He points north, disgusted. "By a GLASS CREEPER. Eighty TC buys my spare, if you need glass that listens. But bring my crystal home and I'll give you the spare, and coin, and name a star for you. I keep the register. I can do that."`,
      acceptLine: `"North. On clear nights he holds it up and giggles at the sky — I've watched him through the finder. GIGGLES." Stellan pats the brass tube like a horse. "Soon," he tells it.`,
      brief: `The creeper is 2-3 tiles north of Stellan's sky mount. SET COURSE walks you there. Recover the reading crystal; a Whispering Aether Crystal and forty TC on return.`,
      markNoun: 'the creeper',
      fetchEnemy: 'Glass Creeper',
      fetchOffset: { dxRange: [0, 0], dyRange: [-3, -2] },
      fetchSpawnLine: `A thin figure stands with a crystal raised to the clouds, head cocked, listening to something the sky is whispering that was never meant for him. The Glass Creeper pockets it and draws two knives with unsettling grace.`,
      fetchRouteLabel: 'the Glass Creeper',
      meetRouteLabel: `Stellan's sky mount`,
      returnRouteLabel: `Stellan (return the crystal)`,
      stolen: { name: 'Stolen Reading Crystal', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Glass Creeper folds, and the crystal rolls out of his pocket whispering faintly — star-talk, or the memory of it. Forty years of sky, waiting to resume.`,
      goodsShort: 'crystal',
      goodsLong: 'the reading crystal',
      buy: {
        costTc: 80,
        grant: { name: 'Whispering Aether Crystal', qty: 1, rarity: 'Uncommon', tags: [] },
        line: `Stellan wraps his spare in a sock that has clearly served this purpose before. "It listens more than it should. Don't tell it secrets."`,
        shortLine: `Stellan sniffs. "Eighty. The sky is free; the glass that reads it is not."`,
      },
      reward: { item: { name: 'Whispering Aether Crystal', qty: 1, rarity: 'Uncommon', tags: [] }, tc: 40 },
      returnLine: `Stellan seats the crystal in its socket with surgeon's hands, looks through, and makes a sound you'd swear was younger than he is. "The sky RESUMES." He gives you his spare, the coin, and opens the register. "Choose any star in the third quadrant. Spell your name slowly."`,
      emptyHandsLine: `Stellan looks through the empty socket at you, which is somehow worse than a glare. "The sky proceeds unrecorded. Hurry."`,
      completeLines: [`You brought Stellan's listening crystal back to its socket. The sky resumes — and a star in the third quadrant now bears your name.`],
      leaveLine: `You leave Stellan squinting at the blur. Behind you he tells the telescope something reassuring, and the overcast doesn't argue.`,
      acceptBtnLabel: 'TAKE THE JOB — CRYSTAL AND 40 TC',
      buyBtnLabel: 'BUY — 80 TC FOR THE SPARE',
    },
  },
  {
    id: 'galia_horn',
    title: `Galia's Grandfather Horn`,
    plantLocations: ['outpost_armory'],
    plantChance: 0.1,
    plantLines: [
      `The armory quartermaster nods at an empty bracket on the wall. "Battle horn hung there since before my time — Galia's line blew it at the mud's first rising. She keeps camp east now, any hour. A filcher took it clean off her belt. She's not loud about it, which means it's bad."`,
      `A cord and empty horn-sling hang on the armory door with a note: "It was my grandfather's, and his. East of the walls. I pay well and ask no questions after. — Galia"`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    content: {
      npcName: 'Galia',
      pronoun: 'she',
      kicker: 'AT THE STANDING STONE',
      sighting: `A broad-shouldered woman stands sharpening a spear against a leaning stone, each stroke slow and even. An empty horn-sling hangs at her hip, and her free hand keeps drifting to it and finding nothing.`,
      pitch: `"Galia." One more stroke of the spear. "My line has blown the same battle horn since the mud first rose — my grandfather sounded the retreat that saved this outpost's founders. A filcher cut it off my belt in a crowd, west of here, and is doubtless learning it doesn't blow for cowards." She tests the edge with her thumb. "Bring it home and I'll pay forty-five TC and give you the horn's little brother — a true Tartarian call. My family owes a debt then. We're careful about debts."`,
      acceptLine: `"West. If you hear a horn making a sound like a sick goose, that's him trying. It answers blood, not breath." Galia grounds the spear. "I'll hear it when YOU blow it. Then I'll know."`,
      brief: `The filcher is 2-3 tiles west of Galia's standing stone. SET COURSE walks you there. Recover the grandfather horn; a Tartarian Battle Horn and forty-five TC on return.`,
      markNoun: 'the filcher',
      fetchEnemy: 'Horn Filcher',
      fetchOffset: { dxRange: [-3, -2], dyRange: [0, 0] },
      fetchSpawnLine: `A strangled honk echoes off the rocks — once, twice, furious. The Horn Filcher lowers the great horn, red-faced, and reaches for a hatchet instead. Some instruments choose their players.`,
      fetchRouteLabel: 'the Horn Filcher',
      meetRouteLabel: `Galia's standing stone`,
      returnRouteLabel: `Galia (return the horn)`,
      stolen: { name: 'Stolen Grandfather Horn', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Horn Filcher drops his hatchet and then the argument. The great horn is unmarked — it has survived worse owners. On an impulse you'll never explain, you blow it once: the note rolls out low and enormous, and somewhere east a spear-butt strikes stone in answer.`,
      goodsShort: 'horn',
      goodsLong: 'the grandfather horn',
      buyRefusalLine: `Galia doesn't even slow her sharpening. "You don't buy another family's thunder. Bring it home and earn your own."`,
      reward: { item: { name: 'Tartarian Battle Horn', qty: 1, rarity: 'Uncommon', tags: [] }, tc: 45 },
      returnLine: `Galia takes the horn and checks the mouthpiece for the filcher's spit with open contempt. Then she slings it home and the drifting hand finally rests. "I heard you blow it. It answered." She gives you the smaller horn and the coin. "Little brother's yours. When you sound it, my line sharpens spears. Remember that."`,
      emptyHandsLine: `Galia's hand drifts to the empty sling and away. "Still west, then." The whetstone starts again, a little faster.`,
      completeLines: [`You brought the grandfather horn home, and it answered your breath on the way. Galia's line owes you a debt — and they're careful about debts.`],
      ambush: {
        enemy: 'Dusk Prowler',
        chance: 0.25,
        line: `A lean shape rises from the rocks with unhurried confidence. "Heard a horn. Horns mean payment made. Hand the coin over quiet — no need to wake the family."`,
      },
      leaveLine: `You leave Galia to her whetstone. The empty sling swings at her hip, and the sound of the sharpening follows you out of sight.`,
      acceptBtnLabel: 'TAKE THE JOB — WAR HORN AND 45 TC',
    },
  },
  {
    id: 'brann_coal',
    title: `Brann's Black Harvest`,
    plantLocations: ['outpost_messhall'],
    plantChance: 0.1,
    plantLines: [
      `The mess cook bangs a cold stove. "Forge-coal's short because Brann's shipment got creeped. He mounds his burn west of the walls, day hours. Good coal, black as a debt. He's paying for the recovery in coin and coal both."`,
      `A charcoal thumbprint signs a note by the mess hatch: "Coal by the sack. Brann, west, daylight. My harvest walked off — reward for walking it back."`,
    ],
    targetOffset: { dxRange: [-3, -2], dyRange: [-1, 1] },
    activeHours: [5, 16],
    content: {
      npcName: 'Brann',
      pronoun: 'he',
      kicker: 'AT THE CHARCOAL MOUND',
      sighting: `A turf-capped mound smokes thin and even from four vents — a charcoal burn in its patient middle days. A soot-gray man circles it, reading the smoke like a book, tamping a vent here, opening one there.`,
      pitch: `"Brann. Don't stand upwind unless you like the look." He wipes his hands on his hips, achieving nothing. "Forge-coal. Twenty-five the sack — every smith in the walls burns my black. A creeper dragged off last week's whole harvest, five sacks, east. My burn can't be left or she collapses and three weeks of wood die with her." He tamps a vent without looking. "Fetch my sacks. Coin and scrap on return, and the smiths owe you too, whether they know it or not."`,
      acceptLine: `"East. Follow the black spill — five sacks leak like gossip." Brann circles back to his smoke. "The burn and I will be here. She doesn't travel and neither do I."`,
      brief: `The creeper is 2-3 tiles east of Brann's charcoal mound. SET COURSE walks you there. Recover the coal sacks; thirty-five TC and scrap metal on return.`,
      markNoun: 'the creeper',
      fetchEnemy: 'Coal Creeper',
      fetchOffset: { dxRange: [2, 3], dyRange: [0, 0] },
      fetchSpawnLine: `A black-dusted trail ends at a man trying to light a cookfire with forge-coal and no draft, failing with commitment. The Coal Creeper stands, black to the elbows, and picks up a mattock like a grudge.`,
      fetchRouteLabel: 'the Coal Creeper',
      meetRouteLabel: `Brann's charcoal mound`,
      returnRouteLabel: `Brann (return the sacks)`,
      stolen: { name: 'Stolen Coal Sacks', qty: 5, tags: ['whisper', 'quest'] },
      recoverLine: `The Coal Creeper drops beside his dead cookfire. Five sacks of good forge-black sit stacked where he dragged them, lighter by one amateur evening. Brann's harvest, shouldered.`,
      goodsShort: 'sacks',
      goodsLong: 'the coal sacks',
      buy: {
        costTc: 25,
        grant: { name: 'Scrap Metal', qty: 2, rarity: 'Common', tags: [] },
        line: `Brann fills a sack and heels it shut, then adds two lengths of scrap from his own pile. "Coal for your fire, iron for your trouble. Tell the smiths who burned for them."`,
        shortLine: `Brann shakes his head at your purse, gently, like it's a wet fire. "Twenty-five. The mound doesn't extend credit and she's the boss."`,
      },
      reward: { item: { name: 'Scrap Metal', qty: 3, rarity: 'Common', tags: [] }, tc: 35 },
      returnLine: `Brann checks each sack's weight with one hand, still watching his smoke with the other eye. "All five, minus his bad evening." He pays coin black with thumbprints and stacks three lengths of scrap on top. "From the smiths, though they don't know it. I'll tell them. They'll pretend to remember."`,
      emptyHandsLine: `Brann reads your hands like slow smoke. "No sacks. The burn says come back heavier, and she's the boss."`,
      completeLines: [`You walked Brann's black harvest home while his burn held. The smiths owe you now — he promised to tell them.`],
      leaveLine: `You leave Brann circling his smoking mound. He tells the burn something low and encouraging, the way you'd talk to a horse or a fire that owns you.`,
      acceptBtnLabel: 'TAKE THE JOB — 35 TC AND SCRAP',
      buyBtnLabel: 'BUY — 25 TC FOR COAL AND SCRAP',
    },
  },
  {
    id: 'veska_rings',
    title: `Veska and the Obedient Iron`,
    plantLocations: ['outpost_central'],
    plantChance: 0.08,
    plantLines: [
      `A crane-tender in the square flexes a bandaged hand. "Golem work's stopped. Veska's controller rings got slipped off her table — she trades them east of the walls, nights. Ninety a ring and worth every chip. Whoever took them can't USE them, which is the frightening part."`,
      `Word passes low across the square: "Veska's rings walked. East, after dark, if you've got the spine to fetch iron that listens. She pays like a guild."`,
    ],
    targetOffset: { dxRange: [2, 3], dyRange: [-1, 1] },
    activeHours: [21, 3],
    content: {
      npcName: 'Veska',
      pronoun: 'she',
      kicker: 'AT THE IRON TABLE',
      sighting: `A sheet-iron table stands alone on the flats, ringed by fist-sized stones laid in a pattern too regular to be decoration. A silver-haired woman sits behind it, turning a brass ring on one finger, and the stones turn with it, slow, in place.`,
      pitch: `"Veska." The stones stop turning. "Controller rings — the old craft, iron that listens. Ninety TC each and cheap at thrice that. A slipper took my working stock off this very table while I slept in reach of it, which I respect and will not forgive." She folds her hands. "He's gone to ground south. He can't attune them — but he can SELL them to someone who can, and obedient iron in the wrong hands stops being a tool and starts being a reign. Bring the case back. Ring and coin on return, and my regard, which opens doors."`,
      acceptLine: `"South. The rings will be warm when you get close — they miss the table." Veska sets one stone spinning with a flick of her ring finger, for emphasis or comfort. "Go get my quiet ones."`,
      brief: `The slipper is 2-3 tiles south of Veska's iron table. SET COURSE walks you there. Recover the ring case; a Golem Controller Ring and fifty TC on return.`,
      markNoun: 'the slipper',
      fetchEnemy: 'Ring Slipper',
      fetchOffset: { dxRange: [0, 0], dyRange: [2, 3] },
      fetchSpawnLine: `A man crouches over an open case, trying ring after ring and hissing when each one bites him — obedient iron, disobeying. The Ring Slipper snaps the case shut with bleeding fingers and pulls a long knife he can hold.`,
      fetchRouteLabel: 'the Ring Slipper',
      meetRouteLabel: `Veska's iron table`,
      returnRouteLabel: `Veska (return the rings)`,
      stolen: { name: 'Stolen Ring Case', qty: 1, tags: ['whisper', 'quest'] },
      recoverLine: `The Ring Slipper drops, still bleeding from eight small ring-bites. The case hums faint in your hands, warm as promised — the rings, homing. Veska's quiet ones, coming back.`,
      goodsShort: 'rings',
      goodsLong: 'the ring case',
      buy: {
        costTc: 90,
        grant: { name: 'Golem Controller Ring', qty: 1, rarity: 'Uncommon', tags: [] },
        line: `Veska attunes the ring to you with three passes over the iron table, and the stones bow — actually bow. "It listens to you now. Speak to it kindly; it remembers tone."`,
        shortLine: `Veska smiles without warmth. "Ninety. The iron listens, but it doesn't listen to promises."`,
      },
      reward: { item: { name: 'Golem Controller Ring', qty: 1, rarity: 'Uncommon', tags: [] }, tc: 50 },
      returnLine: `Veska opens the case and the rings settle audibly, like a kicked hive going calm. "Home. All of them." She attunes one to your hand with three slow passes, then counts fifty on top. "Iron that listens, and my regard. Spend the coin anywhere. Spend the regard carefully."`,
      emptyHandsLine: `Veska turns her ring; a stone by your foot turns with it. "They're still south. I'd feel them closer. Go on."`,
      completeLines: [`You carried the obedient iron home warm and humming. Veska paid in a listening ring — and her regard, which opens doors.`],
      ambush: {
        enemy: 'Dusk Prowler',
        chance: 0.25,
        line: `A shape detaches from the dark with a professional's calm. "The ring-witch pays well. Share the weight, friend, or wear the ground."`,
      },
      leaveLine: `You leave Veska at her iron table. As you go, every stone in the ring turns once to face you — noted, filed, dismissed.`,
      acceptBtnLabel: 'TAKE THE JOB — RING AND 50 TC',
      buyBtnLabel: 'BUY — 90 TC FOR A RING',
    },
  },
];
