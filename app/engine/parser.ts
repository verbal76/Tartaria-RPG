import type { Intent, ParsedInput, InventoryItem, ArgRole, ParsedArg } from './types';
import { levenshtein } from './editDistance';
import { FILLER_DESCRIPTORS } from './fillerWords';
import { frameFor } from './verbFrames';
import { validateParse, shouldRejectParse, META_TALK_REGEX } from './parseValidator';
import { normalizeForCompare, matchAmbientNoun } from './ambientNouns';

// Verb pools. Goal of 10 synonyms per intent for natural-language
// robustness — the player can phrase the same intent ten ways and the
// parser still routes it correctly. Verbs marked NEW in comments were
// added from the action-card reference (dash, disengage, help, ready,
// mount, climb, swim, jump).
const VERB_SYNONYMS: Record<Exclude<Intent, 'unknown'>, string[]> = {
  stealth: ['hide', 'sneak', 'crawl', 'creep', 'lurk', 'crouch', 'silently', 'shadow', 'conceal', 'slink'],
  attack: [
    'attack', 'strike', 'slash', 'stab', 'shoot', 'kill', 'fight', 'charge', 'fire',
    'swing', 'pierce', 'blast', 'smash', 'punch', 'kick', 'cleave', 'loose', 'engage',
    'shatter', 'break', 'destroy', 'crush', 'bash',
    // From the overwhelm action card — semantically a flavour of attack.
    'overwhelm', 'press the attack',
    // OTA-750 — rousing a dormant guardian ("wake the knight") IS a hostile act:
    // route it to attack so an animate scene noun stands up and fights.
    'wake', 'rouse', 'awaken', 'stir', 'provoke', 'disturb',
  ],
  diplomacy: [
    'convince', 'persuade', 'negotiate', 'parley', 'bargain', 'plead', 'speak', 'talk',
    'greet', 'address', 'hail', 'beseech', 'entreat',
    // OTA-241 — moved 'ask' from diplomacy to the `ask` intent below.
    // Playtester: "the ask arbiter is broken." Parser was matching
    // 'ask the arbiter about X' on the diplomacy verb 'ask' and
    // looking for an NPC named "the arbiter" to negotiate with (no
    // such NPC exists → "No one is here to negotiate with."). 'ask'
    // is informational, not negotiation; the case 'ask' handler in
    // gameStore already routes through self-introspection +
    // findConcept + MiniLM lore lookup. Removed 'call' too — it
    // collides with the 'call dog' parser intercept.
    // Social + performance card verbs.
    'intimidate', 'perform', 'sing', 'play',
    // OTA-808 — parley verbs. Threat + gentle approaches route through diplomacy so
    // the two-button parley opens (soothe an animal / persuade a person, or
    // intimidate either). 'calm'/'settle' are deliberately NOT here — they collide
    // with the self-directed "calm down" / "settle down" (which are ready/rest); the
    // unambiguous gentle verbs below cover the animal read, and the two-button modal
    // (opened by a generic "talk to / approach") always offers "Calm it" by tap.
    'threaten', 'menace', 'coerce', 'coax',
    'soothe', 'pacify', 'tame',
    // OTA-854 — a wider net of LEADING verbs so natural talk-down phrasings route to
    // diplomacy ("shout at them to go away", "browbeat the patrol"). The phrasal
    // target-commands ("back off", "go away") are NOT here — they collide with retreat
    // as bare input; detectParleyChoice reads them once a parley is underway.
    'shout', 'yell', 'holler', 'bellow', 'roar', 'snarl', 'growl', 'scare', 'frighten',
    'bully', 'terrify', 'browbeat', 'scowl', 'spook', 'daunt',
    // PERSUASION reads (reason): defuse the standoff with words.
    'reason', 'appeal', 'defuse', 'deescalate', 'de-escalate', 'reconcile', 'placate',
  ],
  escape: [
    'run', 'flee', 'retreat', 'escape', 'withdraw', 'bolt', 'scram',
    'abscond', 'fall back',
  ],
  investigate: [
    'look', 'examine', 'inspect', 'search', 'study', 'check', 'investigate', 'scan',
    'observe', 'view', 'read', 'probe', 'survey', 'find', 'scavenge', 'hunt',
    'peruse', 'scrutinise', 'scrutinize', 'comb',
    // OTA-698 — 'listen'/'hear' are sensory investigation. A whispering-crystal
    // hook invites "listen to the whispers"; without this it demoted to unknown and
    // dead-ended. Investigate is hook-eligible, so it now advances the hook.
    'listen', 'hear',
    // 'salvage' / 'strip' / 'pry' — playtest caught "salvage the
    // construct" failing to advance the wreck_construct hook because
    // there was no salvage verb. Investigate is hook-eligible, so
    // mapping salvage here advances the hook with the right noun.
    // ⚠ OTA-1243 — 'scrap' accepted as a synonym: the UI now says SALVAGE
    // everywhere, but a player who thinks in the old word must not be refused.
    'salvage', 'scrap', 'strip', 'pry',
    // From the track / translate / learn / gather cards.
    'track', 'translate', 'learn', 'gather',
    // 'open' belongs to the dedicated open intent — it persists
    // container state across re-entry. Including it here too would
    // make "open the chest" silently route to a generic area search.
  ],
  rest: [
    // OTA-125 — 'drink' removed from rest synonyms; it has its own
    // intent now so "drink water" no longer routes to an 8-hour
    // sleep. 'eat'/'consume'/'devour' stay here for "eat the ration"
    // → consumable HP flow handled inside the rest case.
    'rest', 'sleep', 'recover', 'camp', 'heal', 'eat', 'consume', 'devour',
    'nap', 'doze',
  ],
  drink: [
    'drink', 'sip', 'gulp', 'quaff', 'slurp', 'guzzle',
  ],
  // OTA-129 — hook-puzzle verbs. The puzzle resolver in
  // engine/hookPuzzles.ts owns the per-puzzle validation. The
  // parser just needs to route the intent + (for rotate/turn/twist)
  // the direction word. Synonyms cover obvious natural phrasings
  // so the player doesn't have to guess the exact verb.
  rotate: ['rotate', 'spin', 'revolve'],
  knock: ['knock', 'rap', 'tap', 'pound', 'thump'],
  turn: ['turn', 'crank', 'wind'],
  twist: ['twist', 'wrench', 'torque'],
  press: ['press', 'depress', 'mash'],
  push: ['push', 'shove', 'nudge'],
  pull: ['pull', 'tug', 'yank'],
  // OTA-710 — call-to-action gestures. Evocative verbs the scene prose
  // invites but which aren't mechanical puzzle inputs. Kept OUT of this
  // list: 'greet'/'hail'/'sing'/'play' (already claimed by diplomacy),
  // 'call' (deliberately removed earlier — too greedy). When one of these
  // lands on an active hook the resolver runs; otherwise the store emits a
  // backstory-fill flavor line so the action always DOES something.
  gesture: [
    'ring', 'pray', 'touch', 'tilt', 'whistle', 'shout', 'chant', 'kneel',
    'hum', 'stroke', 'caress', 'salute', 'beckon', 'sound', 'signal',
    'answer', 'respond', 'feel', 'bang', 'strike a note', 'clap',
    // ⚠ OTA-1155 — SITTING DOWN, because the game kept ASKING FOR IT and then
    // refusing. Halem's gift line ends *"there's a bowl of something hot for you
    // if you'll sit"* — and `sit` was in no synonym list at all, so the owner typed
    // "sit", then "I'll sit", then "sit with halem", and got the generic
    // "Try: look around · search · rest" three times running. That is the
    // OTA-710 lesson exactly ("if there's a call to action, it has to actually DO
    // something"), and it landed on a line THIS project wrote one OTA earlier.
    // Home is `gesture` and not `wait`/`rest`: sitting is a posture you take
    // toward something, so it should reach a hook if one wants it and otherwise
    // draw a flavour beat — not silently burn eight hours of sleep.
    // 'sit down' / 'take a seat' are multi-word so they collapse to one token and
    // leave the target EMPTY, which is what selects the bare (no-noun) lines.
    'sit', 'sit down', 'take a seat',
  ],
  inventory: [
    // 'bag' removed — too greedy: "bag the goblin" / "tea bag" / "sandbag"
    // all routed here. 'pack' kept; players who type just "pack" are
    // asking for inventory in practice.
    'inventory', 'pack', 'gear', 'items', 'supplies', 'stuff', 'kit', 'satchel',
    'pockets', 'backpack',
  ],
  travel: [
    'go', 'travel', 'walk', 'head', 'move', 'journey', 'enter', 'descend', 'wander',
    'follow', 'march', 'trek', 'cross', 'proceed', 'depart', 'leave', 'exit',
  ],
  use_relic: [
    'use', 'activate', 'invoke', 'apply', 'shine', 'light', 'channel through',
    'trigger', 'employ',
  ],
  cast: [
    'cast', 'channel', 'mold', 'shape', 'unleash', 'incant', 'summon', 'evoke',
    'conjure', 'mend', 'manipulate',
  ],
  wait: ['wait', 'stay', 'hold', 'pause', 'still', 'linger', 'tarry', 'idle', 'bide', 'remain'],
  // OTA-241 — 'ask' moved here from diplomacy. The verb is
  // informational ("ask about X", "ask the arbiter") not negotiation.
  // ⚠⚠ OTA-1264 — 'where' and 'when' were MISSING from this list while
  // their four siblings were present, so a question that named an action
  // performed it: "where can I sleep" slept 8 hours, "when does the shop
  // open" opened the chest. The wh-word sits at index 0 and the verb scan
  // takes the FIRST minimum-distance hit, so restoring them is enough to
  // let the question win the race — no new mechanism required.
  ask: ['ask', 'what', 'explain', 'define', 'who', 'how', 'why', 'where', 'when', 'tell', 'describe', 'clarify', 'mean'],
  craft: [
    // 'construct' removed — playtest caught "salvage the construct"
    // routing to craft because 'construct' matched as a verb here,
    // swallowing the salvage target noun. 'build' / 'assemble' /
    // 'fashion' / 'fabricate' / 'forge' / 'weld' / 'make' cover the
    // crafting intent without claiming the noun "construct" used
    // for Aetheric automaton wrecks.
    'craft', 'make', 'forge', 'fashion', 'build', 'assemble', 'fabricate', 'weld', 'sculpt',
    // "set a trap" — multi-word so 'set' alone doesn't fire (too
    // ambiguous with set-up / set-stance verbs).
    'set a trap', 'set the trap', 'set trap',
  ],
  equip: ['equip', 'wear', 'wield', 'don', 'unequip', 'remove', 'sheathe', 'strap', 'fit', 'fasten'],
  // OTA-239 — Tool Pouch verbs. `stow <item>` puts an item in the
  // pouch; `unpouch <item>` / `unstow <item>` takes it out.
  stow_pouch: ['stow', 'pouch', 'belt'],
  unpouch: ['unpouch', 'unstow', 'unbelt'],
  // OTA-803 removed the `gift` intent: "Faction standing is earned through
  // mission completions + sigil/pendant turn-ins, not by handing vendors loot;
  // the gift-for-rep side door undercut that."
  // ⚠ OTA-1060 RESTORES IT, and that note is the reason the restoration looks
  // the way it does. Faction standing from gifts is now metered against a
  // LIFETIME per-faction budget (GIFT_STANDING_FACTION_CAP, ~one mission's
  // worth, across every member of that faction) so the side door cannot reopen.
  // What gifts actually buy is the PERSONAL relationship — one ledger row, that
  // person's discount, and the fact that they remember the object — which
  // cannot cascade to anybody else.
  // 'give' and 'offer' only; 'hand' and 'donate' stay out because "hand" collides
  // with the body-part noun and the off-hand slot.
  gift: ['gift', 'give', 'offer', 'present'],
  // 'pocket' removed — clashes with the noun "pockets" / "in his pocket"
  // and the inventory channel. 'grab' kept (genuine steal verb).
  steal: ['steal', 'pilfer', 'lift', 'pinch', 'swipe', 'snatch', 'filch', 'nick', 'grab'],
  join: ['join', 'pledge', 'swear', 'sign', 'ally', 'bond', 'commit', 'enroll', 'side'],
  // 'block' verbs (block / parry / deflect / shield / brace / guard /
  // fend / absorb / ward) all route through 'dodge' as of 2026-05-21.
  // The block intent itself stays in the type signature for any save
  // data that has it cached, but the parser maps every block-flavored
  // verb to dodge so they all reach the new active-parry mechanic.
  // OTA-159 — `defend` moved here from `help`. Stress sweep found
  // a player typing `defend` in combat got routed to the help/
  // call-for-backup intent (which does nothing visible to the
  // active fight). Defensive stance is the obvious player
  // intent for `defend` in a combat scene; the help intent still
  // covers backup-call via help / aid / assist / support /
  // cover / bolster / reinforce.
  dodge: [
    'dodge', 'evade', 'sidestep', 'duck', 'juke', 'tumble', 'slip', 'twist', 'roll',
    'parry', 'deflect', 'brace', 'guard', 'fend', 'absorb', 'ward',
    'defend',
  ],
  // ⚠⚠ OTA-1510 — BLOCK IS A REAL INTENT AGAIN, the shield's defense (owner:
  // "the shield has a block function"). 'block' and 'shield' reclaim it; the
  // rest of the old block-flavored verbs (parry / deflect / brace / guard /
  // fend / absorb / ward / defend) STAY on dodge so an empty-handed player's
  // muscle memory keeps reaching the parry mechanic. A shieldless 'block' is
  // refused with DODGE named — see the gameStore case.
  block: ['block', 'shield'],
  advance: [
    // sprint and rush moved to dash — they semantically describe fast
    // movement, not the "close one combat range band" beat that
    // advance is. Keeps "advance / approach / lunge" focused on its
    // own meaning.
    // 'press' removed — clashes with "press the button" / "press on the
    // wound" / "press my luck". Players who want the combat beat say
    // advance/approach/lunge/forward.
    'advance', 'approach', 'closein', 'lunge', 'forward',
    'charge in', 'near',
  ],
  retreat: [
    // Pre-collapsed entries split back into multi-word so
    // MULTI_WORD_COLLAPSES picks up player input "step back" / "back
    // off" / "back away" / "pull back" / "edge back". Previously the
    // already-collapsed forms only fired when the player typed
    // "stepback" as one token, which nobody does.
    'back off', 'back away', 'pull back', 'step back', 'reposition', 'recoil', 'edge back',
    'pace back', 'fall away', 'inch back',
  ],
  repair: ['repair', 'mend', 'restore', 'refurbish', 'patch', 'fix', 'rebuild', 'renew', 'overhaul', 'tune'],
  // 'take' was here originally — playtest log surfaced the failure mode:
  // "take the trap apart and keep the materials" matched accept on
  // 'take' and the Arbiter replied about wandering faction vendors.
  // Players who want to accept a contract always say "accept" (the
  // Arbiter's prompts spell it out: "say 'accept road'"). The other
  // verbs here cover the rare "yes/agree/sure" path.
  // 'okay' removed — almost always a conversational filler ("okay, I
  // look around" / "okay sure"); accept fires when contract context is
  // active anyway, but the synonym kept dragging unrelated lines into
  // the accept path.
  accept: ['accept', 'undertake', 'agree', 'yes', 'consent', 'embrace', 'assent', 'aye'],
  turn_in: ['turn in', 'complete', 'finish', 'deliver', 'report', 'redeem', 'claim', 'present', 'submit', 'hand in', 'send word', 'courier', 'send a runner'],
  dig: ['dig', 'excavate', 'unearth', 'scrape', 'shovel', 'burrow', 'tunnel', 'mine', 'spade', 'pry'],
  // OTA 004 — Phase 3 water bottles. Most fills are typed as
  // "fill bottle" / "fill the bottle from puddle" etc.; the handler
  // doesn't require a target since it auto-resolves the empty
  // bottle from inventory + the water source from scene ambient.
  fill: ['fill', 'refill', 'top up', 'top off', 'scoop', 'draw'],
  // OTA-120 — Dog Companion combat verbs. Bite: direct attack via the
  // dog. Distract: dog applies 'distracted' status to one enemy.
  dog_bite: [
    'bite', 'sic',
    'attack with dog', 'tell dog to attack', 'dog attack', 'dog bite',
    'sic dog', 'sic the dog',
  ],
  dog_distract: [
    'distract', 'dog distract', 'distract enemy', 'tell dog to distract',
  ],
  throw: ['throw', 'toss', 'hurl', 'lob', 'chuck', 'fling', 'pitch', 'cast at', 'launch', 'whip'],
  // NEW from action card.
  climb: ['climb', 'scale', 'ascend', 'clamber', 'shimmy', 'scramble', 'vault up', 'hoist', 'ladder', 'rope up'],
  swim: ['swim', 'wade', 'paddle', 'splash', 'dive', 'ford', 'submerge', 'surface', 'tread', 'drift'],
  jump: ['jump', 'leap', 'hop', 'vault', 'bound', 'spring', 'hurdle', 'pounce', 'skip', 'launch over'],
  dash: [
    'dash', 'dash forward', 'sprint', 'sprint to', 'sprint forward',
    'double time', 'hustle', 'bolt forward', 'race', 'dart', 'scamper',
    // 'rush' moved here from advance — "rush to the wall" should be
    // dashing, not a combat range-band shift.
    'rush', 'rush forward',
  ],
  disengage: ['disengage', 'peel off', 'break off', 'slip away', 'pull away', 'extract', 'fade back', 'detach', 'unstick', 'shake off'],
  // OTA-159 — `defend` removed; now in dodge (defensive stance) so
  // a player typing `defend` in combat gets the parry mechanic
  // instead of a no-visible-effect backup call. Other help
  // synonyms (assist / aid / support / cover / bolster / reinforce)
  // still cover the request-for-backup intent.
  help: ['help', 'assist', 'aid', 'support', 'back up', 'cover', 'bolster', 'reinforce', 'abet'],
  ready: [
    'ready', 'prepare', 'set up', 'focus', 'watch', 'await', 'prep', 'steady', 'anticipate', 'cock',
    // Preparation + planning + psychological cards.
    'plan', 'plan ahead', 'calm down', 'calm',
  ],
  mount: ['mount', 'saddle', 'ride', 'bridle', 'horse up', 'climb on', 'astride', 'dismount', 'unsaddle', 'get off'],
  // NEW from firearms / evasive cards. Sprint stays as a dash alias
  // (already covered in dash synonyms); flee stays as escape; brawl is
  // bare-hand attack (already covered via punch/kick). Genuinely new:
  // "take cover" needs to be a multi-word entry so MULTI_WORD_COLLAPSES
  // picks it up. The previous "takecover" (no space) was already-collapsed
  // and never matched player input "take cover" — the parser saw verb
  // 'take' first and routed to the pickup intent. Fix: declare with the
  // space, let the collapse pass do the work.
  take_cover: [
    'take cover', 'cover up', 'hunker', 'crouch behind', 'duck behind',
    'shelter', 'tuck', 'dive for cover', 'dive behind', 'go prone', 'flatten',
    // Multi-word phrasings the cards advertise as examples.
    'duck for cover', 'hide behind',
  ],
  aim: ['aim', 'sight', 'target', 'line up', 'draw bead', 'level', 'lock on', 'sight in', 'track sight', 'zero'],
  // OTA 013 — 'refill' and 'top up' removed; they belonged to the
  // water-bottle 'fill' intent and were colliding with reload's
  // verb match. 'recharge' / 'load up' / 'feed' still cover the
  // ammo / battery semantic.
  reload: ['reload', 'reloading', 'reset', 'rearm', 'rerack', 'recharge', 'load up', 'feed'],
  // 'disarm' lived in both maneuver AND open — and because maneuver
  // comes first in the iteration order, "disarm the trap" routed to
  // grappling ("Maneuver against whom? Empty ground does not grapple
  // back."). It belongs in the disable/open pool instead, never here.
  maneuver: ['maneuver', 'grapple', 'trip', 'shove', 'sweep', 'pin', 'hook', 'wrench', 'manoeuvre'],
  quick_fire: ['quick fire', 'snap shot', 'snap fire', 'fast fire', 'rush shot', 'panic shot', 'quick shot', 'quick draw', 'fast draw', 'first shot'],
  multi_fire: ['burst fire', 'double tap', 'triple tap', 'multi shot', 'multiple shots', 'spray', 'fire twice', 'fire three', 'rapid fire', 'volley', 'full auto'],
  fight_back: ['fight back', 'counter', 'counter strike', 'opposed strike', 'meet the blade', 'trade blows', 'parry and strike', 'return fire', 'riposte', 'hit back'],
  recruit: ['recruit', 'hire', 'follow me', 'come with', 'join me', 'bring along', 'travel together', 'companion', 'walk with me'],
  drop: ['drop', 'discard', 'put down', 'leave behind', 'release', 'jettison'],
  pickup: ['pickup', 'pick up', 'retrieve', 'collect', 'scoop up', 'take'],
  open: [
    'open', 'unlock', 'crack', 'pry open', 'lift the lid', 'breach', 'disarm', 'disable', 'dismantle', 'deactivate', 'take apart',
    // OTA-741 — "empty"/"dump out"/"clean out" a container routes to the open
    // (loot) intent. Playtest: "empty the trunk" fell to the LLM as unknown even
    // though "open the trunk" worked, so a natural phrasing hit a dead-end.
    // ("rummage" is intentionally NOT here — "rummage in the rubble" reads as
    // investigate/search, not open a container.)
    'empty', 'empty out', 'dump out', 'clean out',
    // Lockpicking — multi-word so 'pick' alone doesn't conflict with
    // pickup intent.
    'pick the lock', 'pick a lock', 'lockpick', 'pick lock',
  ],
};

const ALL_INTENTS = Object.keys(VERB_SYNONYMS) as Exclude<Intent, 'unknown'>[];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'this', 'that', 'these', 'those',
  'to', 'at', 'in', 'on', 'off', 'with', 'for', 'into', 'onto', 'from', 'of', 'by',
  // Directional / spatial prepositions added after playtest log caught
  // "break the wagon down for parts" parsing as target "wagon down
  // parts". Stripping these lets resolveContextNoun + resolveItem
  // see just the meaningful noun.
  'down', 'up', 'over', 'under', 'across', 'through', 'behind', 'beside', 'between',
  'and', 'or', 'but', 'then', 'now', 'so', 'as', 'it', 'them',
  'i', 'me', 'you', 'we', 'us', 'they',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',
]);

// ---------------------------------------------------------------------------
// OTA 205 — Multi-clause input splitter
// ---------------------------------------------------------------------------
// Splits raw player input into separate command clauses for sequential
// execution. References:
//   - Jurafsky & Martin §12.3.7 (Coordination) — coordinated clauses
//     joined by 'and', 'then', 'or', ';'
//   - Sleator & Temperley §6 (Coordination phenomena) — clause-level
//     'and' coordination handled by structural splitting before parsing
//
// Conservative split rules (V1):
//   - Only split on clause-level connectives that introduce a new
//     verb phrase: 'then', 'and then', ';' (and rare: '. ').
//   - DO NOT split on bare 'and' — that's usually object-coordination
//     ("search the trap and the bench"), Sleator §6 territory we're
//     deferring to V2. Bare 'and' between two verbs is ambiguous
//     enough that V1 picks the safer "parse as single clause" path.
//   - DO NOT split inside a verb's argument list (the splitter runs
//     before parseInput so it has no awareness of argument structure;
//     we just trust that 'then' isn't an argument).
//
// Each returned clause is passed independently to parseInput; the
// engine (gameStore.submitPlayerAction) iterates them sequentially,
// stopping the chain when a clause parses as 'unknown' or when the
// player's state changes incompatibly (HP 0, scene transition).
// Semicolons separate clauses without needing whitespace on both sides
// ("look around; rest"). Period requires a trailing space so floats
// and abbreviations don't trigger ("5.5 hours" stays one clause).
const CLAUSE_SPLITTER = /\s+(?:and\s+then|then)\s+|\s*;\s*|\.\s+/i;

export function splitClauses(raw: string): string[] {
  const trimmed = raw.trim();
  // Short inputs are never multi-clause — guards against accidental
  // splits on conversational tail like "ok then" / "well then".
  if (trimmed.length < 12) return [trimmed];
  const parts = trimmed
    .split(CLAUSE_SPLITTER)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Single clause → return raw unchanged so downstream sees the
  // exact same string it would have before V2.
  if (parts.length <= 1) return [trimmed];
  return parts;
}

export function normalizeInput(raw: string): string {
  let s = raw
    .toLowerCase()
    .trim()
    // Strip possessive 's BEFORE the punctuation pass so "my rifle's"
    // collapses to "my rifle" instead of leaving an orphan "s" token.
    // Also dissolve standalone apostrophes (curly + straight).
    .replace(/['‘’]s\b/g, '')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/'+/g, '')
    .replace(/\s+/g, ' ');
  // Collapse multi-word verb synonyms into single tokens so the
  // verb matcher (which splits input on whitespace) can fire on them.
  // The full list is derived once at module load from VERB_SYNONYMS
  // so adding "snap shot" to the quick_fire list automatically makes
  // user-typed "snap shot" route correctly — no second registration
  // step. See MULTI_WORD_COLLAPSES below.
  for (const [phrase, collapsed] of MULTI_WORD_COLLAPSES) {
    s = s.replace(phrase, collapsed);
  }
  // OTA-157 — split no-space travel compounds. Stress sweep
  // (drunkSpelling) flagged `gowest`, `gonorth`, `goeast`,
  // `gosouth`, etc. all routing to intent=unknown because the
  // tokenizer splits on whitespace and the glued form isn't a
  // verb synonym. Surgical fix: insert a space between known
  // travel verbs and cardinal/vertical direction words. Conservative
  // — only the most common stamped pattern (travel verb + direction),
  // not a general compound-splitter, so we don't risk breaking words
  // that legitimately start with these prefixes (`goth`, `runic`,
  // `walking`, `heads`).
  s = s.replace(/\b(go|walk|run|head|travel)(north|south|east|west|up|down|nw|ne|sw|se)\b/g, '$1 $2');
  // Collapse repeated articles — "search the the hum" → "search the hum",
  // "a a torch" → "a torch". Works whether or not stopword filtering catches
  // them downstream. Runs in a loop so triple-the survives ("the the the" →
  // "the the" → "the"). Idempotent for clean inputs.
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\b(a|an|the)\s+\1\b/g, '$1');
  } while (s !== prev);
  return s;
}

// Build a single regex pass over the verb synonyms — every entry that
// contains an internal space gets a /\bphrase\b/g pattern paired with
// the same string sans spaces. normalizeInput applies the pass before
// tokenizing; VERB_SYNONYMS_LOOKUP holds the collapsed form so the
// match is exact-token. This keeps adding a new multi-word synonym
// (e.g. another "snap fire" alias) a single-line change to the
// synonym table.
const MULTI_WORD_COLLAPSES: Array<[RegExp, string]> = (() => {
  const seen = new Set<string>();
  const out: Array<[RegExp, string]> = [];
  for (const intent of ALL_INTENTS) {
    for (const verb of VERB_SYNONYMS[intent]) {
      if (!verb.includes(' ')) continue;
      if (seen.has(verb)) continue;
      seen.add(verb);
      const collapsed = verb.replace(/\s+/g, '');
      // Escape regex-special characters in the phrase. None of our
      // verbs use them today but the safety is free.
      const escaped = verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out.push([new RegExp(`\\b${escaped}\\b`, 'g'), collapsed]);
    }
  }
  // Sort longest phrase first so "double tap" doesn't get partially
  // collapsed by a hypothetical shorter pattern.
  out.sort((a, b) => b[0].source.length - a[0].source.length);
  return out;
})();

// Precomputed lookup that the verb matcher uses — same shape as
// VERB_SYNONYMS but with multi-word entries collapsed to single
// tokens so input tokenization can find them.
const VERB_SYNONYMS_LOOKUP: Record<Exclude<Intent, 'unknown'>, string[]> =
  (() => {
    const out = {} as Record<Exclude<Intent, 'unknown'>, string[]>;
    for (const intent of ALL_INTENTS) {
      out[intent] = VERB_SYNONYMS[intent].map((v) =>
        v.includes(' ') ? v.replace(/\s+/g, '') : v,
      );
    }
    return out;
  })();

/** OTA-1155 — "did the player actually ask to hold still?", answered by the ONE
 *  verb table that defines the wait intent.
 *
 *  ⚠ WHY THIS IS EXPORTED. `qwenRephraseRejection` in gameStore guards the LLM
 *  parse-repair against inventing a do-nothing wait, and it did that against a
 *  hand-typed `/wait|hold|stay|linger|pause|bide/` — a six-word copy of a
 *  ten-word list. `still`, `tarry`, `idle` and `remain` were invisible to it, so a
 *  player who typed one of them and got an honest `wait` repair back had it
 *  rejected as an invention. Same shape as OTA-1152's three ready-predicates: a
 *  second definition of somebody else's list, drifting quietly. Now there is one.
 *
 *  Matches whole words only, and (via VERB_SYNONYMS_LOOKUP) the collapsed form of
 *  any multi-word wait synonym a future OTA adds. */
export function mentionsWaitVerb(text: string): boolean {
  const t = ` ${(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return VERB_SYNONYMS.wait.some((v) => t.includes(` ${v.toLowerCase()} `));
}

function fuzzyEqual(word: string, candidate: string): boolean {
  if (word === candidate) return true;
  if (word.length < 3 || candidate.length < 3) return false;
  // Prefix match handles "ration" → "rations" and similar — but only
  // when the SHORTER side is ≥4 chars. 3-char prefixes are too loose:
  // playtest log caught "off" → "offer" (gift intent) firing on "rop
  // boards OFF the wagon", routing the whole sentence to a gift the
  // player never meant. Floor the prefix length at 4 to kill that
  // class of over-match. Tests still pass on "ration → rations",
  // "snap → snapshot", etc. because their shorter side is ≥4.
  if (candidate.startsWith(word) || word.startsWith(candidate)) {
    const shorterLen = Math.min(word.length, candidate.length);
    if (shorterLen < 4) return false;
    return Math.abs(word.length - candidate.length) <= 3;
  }
  // Reject "prepended-letter" false positives — pairs where one word
  // is exactly the other with a single leading character added (or
  // removed) are usually distinct meanings: leave/cleave, ward/sward,
  // word/sword, care/scare, hide/chide, lade/blade. Levenshtein gives
  // these a distance of 1, but they don't share a stem so semantic
  // overlap is near zero. QA flagged the previous threshold still let
  // "leave" route to "cleave" (attack intent) despite the comment.
  const [shorter, longer] = word.length <= candidate.length
    ? [word, candidate]
    : [candidate, word];
  if (longer.length === shorter.length + 1 && longer.slice(1) === shorter) {
    return false;
  }
  const maxLen = Math.max(word.length, candidate.length);
  // 4–5 chars exact, 6–7 allow 1 edit (gated by the rule above), 8+
  // allow 2.
  const allowed = maxLen <= 5 ? 0 : maxLen <= 7 ? 1 : 2;
  return levenshtein(word, candidate) <= allowed;
}

// OTA-156 — collapse drunk-typing runs of identical characters.
// Stress sweep found `eatt`, `useee`, `scrappp`, `drinkkk` all
// routing to `intent=unknown` because fuzzyEqual's 1-edit budget
// can't cross a 2-char insertion. The fix is upstream of fuzzy
// matching: collapse runs of 3+ identical chars to 1
// (`useee` → `use`, `scrappp` → `scrap`), AND collapse a trailing
// 2-char doubled consonant to 1 (`eatt` → `eat`, `drinkk` → `drink`).
// Conservative on purpose: it doesn't touch middle-of-word doubles
// (`look`, `feed`, `book`) and never lengthens, only shortens.
function collapseDrunkRuns(token: string): string {
  if (token.length < 3) return token;
  // First pass: any run of 3+ identical chars collapses to 1.
  // `scrappp` → `scrap`, `useee` → `use`, `drinkkk` → `drink`.
  let collapsed = token.replace(/(.)\1{2,}/g, '$1');
  // Second pass: trailing 2-char doubled consonant (NOT vowel)
  // collapses to 1. Catches `eatt` → `eat`, `drinkk` → `drink`,
  // `scrapp` → `scrap`. Skips vowel-doubled endings like `see`,
  // `too`, `goo` so legitimate English words survive. Also skips
  // when collapsing would leave fewer than 2 chars.
  const m = collapsed.match(/^(.+)([bcdfghjklmnpqrstvwxyz])\2$/);
  if (m && m[1]!.length >= 1) {
    collapsed = m[1]! + m[2]!;
  }
  return collapsed;
}

function bestVerbMatch(token: string): { intent: Exclude<Intent, 'unknown'>; verb: string; distance: number } | null {
  let best: { intent: Exclude<Intent, 'unknown'>; verb: string; distance: number } | null = null;
  for (const intent of ALL_INTENTS) {
    for (const verb of VERB_SYNONYMS_LOOKUP[intent]) {
      if (token === verb) return { intent, verb, distance: 0 };
      if (fuzzyEqual(token, verb)) {
        const d = levenshtein(token, verb);
        if (!best || d < best.distance) best = { intent, verb, distance: d };
      }
    }
  }
  // OTA-156 — if the raw token didn't match anything, retry with the
  // drunk-run-collapsed form. Catches `eatt` / `useee` / `scrappp` /
  // `drinkkk` without loosening the fuzzy cutoff (which would risk
  // OTA-094-style false positives).
  if (!best) {
    const collapsed = collapseDrunkRuns(token);
    if (collapsed !== token && collapsed.length >= 2) {
      for (const intent of ALL_INTENTS) {
        for (const verb of VERB_SYNONYMS_LOOKUP[intent]) {
          if (collapsed === verb) return { intent, verb, distance: 0 };
          if (fuzzyEqual(collapsed, verb)) {
            const d = levenshtein(collapsed, verb);
            if (!best || d < best.distance) best = { intent, verb, distance: d };
          }
        }
      }
    }
  }
  return best;
}

function tokenize(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length > 0);
}

// Question/interrogative words that often slip into the tail of inputs like
// "examine the compass where" or "look at the door how". They're verb
// synonyms for the `ask` intent so they can't live in the global STOPWORDS,
// but once another intent has already won the verb slot we don't want them
// echoed back as target text ("You examine compass where").
const QUESTION_WORDS = new Set(['where', 'when', 'what', 'who', 'why', 'how', 'which']);

// Indefinite reference words that read as nouns but aren't interactable.
// Playtest log: "is there anything else near me" → parser took "else" as
// the target and the handler asked the player what they want to do with
// "else". Suggestion bar then offered "inspect else · use torch on else".
// These tokens should never make it through as target nouns.
const JUNK_NOUNS = new Set([
  'else', 'anything', 'something', 'everything', 'nothing',
  'stuff', 'things', 'thing', 'one', 'some', 'all',
  'here', 'there', 'around', 'near', 'nearby',
  // Indefinite / vague placeholders the player sometimes types but
  // never wants the parser to resolve to a target. ("Is there another
  // way out" → 'another' / 'way' shouldn't become the search target.)
  'other', 'another', 'anyone', 'someone', 'anybody', 'somebody',
  'way', 'place', 'side',
]);

// OTA-737 — an instrument preposition ends the DIRECT OBJECT: everything after
// "with" / "using" / "by" is the TOOL, not the target. Without this, "with the"
// was merely stopword-filtered, so "shatter the rune glass with the prybar"
// dropped "with"/"the" but KEPT "prybar" — the target resolved to the mangled
// "rune glass prybar" instead of "rune glass". (The richer OTA-204 arg system
// already segments these into instrument roles; this is the legacy target/
// resolvedNoun path that handlers still read.)
const INSTRUMENT_BOUNDARY_PREPS = new Set(['with', 'using', 'by']);

function extractTargetTokens(tokens: string[], verbIdx: number): string[] {
  const after = tokens.slice(verbIdx + 1);
  const out: string[] = [];
  for (const t of after) {
    // Stop collecting the direct object at "with/using/by" — but ONLY once we
    // already have a target noun, so a tool-only command with no direct object
    // ("attack with the off-hand blade") keeps its existing behavior (the prep
    // is just skipped as a stopword and the weapon noun is collected).
    if (INSTRUMENT_BOUNDARY_PREPS.has(t) && out.length > 0) break;
    if (
      STOPWORDS.has(t) ||
      QUESTION_WORDS.has(t) ||
      JUNK_NOUNS.has(t) ||
      FILLER_DESCRIPTORS.has(t)
    ) {
      continue;
    }
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// OTA 204 — Argument segmentation
// ---------------------------------------------------------------------------
// Walks the post-verb token stream and splits it on preposition
// boundaries into role-tagged segments. References:
//   - Jurafsky & Martin §12.3.5 (subcategorization frames) — the
//     verb frame in verbFrames.ts says which roles to accept;
//     unaccepted prepositional segments collapse back into direct.
//   - Sleator & Temperley §3.7 (Prepositions, adverbs) — same
//     preposition-introduces-PP pattern.
//   - Universal Dependencies role labels (obl:instr, obl:to,
//     obl:from, advmod) — documented in types.ts ArgRole comments.
//
// Algorithm (greedy, left-to-right, no backtracking):
//   tokens = [drone, with, the, bolt-caster]
//   segments = [{prep:null, tokens:[drone]}, {prep:'with', tokens:[bolt-caster]}]
//   First no-prep segment → role: 'direct'
//   Subsequent prepped segment → role from PREPOSITION_TO_ROLE
//   Verb's frame.withRole overrides 'with' (instrument vs companion)
//   Adverbs (-ly suffix) peel off as their own {role:'manner'} entry

/** Default mapping from preposition → argument role. Per-verb
 *  overrides live in VERB_FRAMES[verb].withRole. */
const PREPOSITION_TO_ROLE: Record<string, ArgRole> = {
  with: 'instrument',
  using: 'instrument',
  by: 'instrument',
  to: 'recipient',
  toward: 'destination',
  towards: 'destination',
  into: 'destination',
  onto: 'destination',
  // 'at' is overloaded — "throw rock AT the goblin" (destination),
  // "look AT the wall" (direct). Default to destination since the
  // throw frame uses it; for verbs without destination in their
  // frame, buildArgs() folds it back into direct (look's frame has
  // only {direct, manner}, so "look at the wall" still works).
  at: 'destination',
  from: 'source',
  on: 'direct', // "use torch on wall" — direct, not destination
};

/** -ly suffix adverbs become a separate manner argument so they
 *  don't pollute the direct-object text. */
const ADVERB_SUFFIX = /ly$/i;

interface RawSegment {
  prep: string | null;
  tokens: string[];
}

/** Split the post-verb tail into preposition-bounded segments.
 *  Filler tokens (stopwords, junk nouns, question words) are skipped.
 *  Adverbs (-ly suffix) are collected separately. */
function segmentPostVerb(
  tokens: string[],
  verbIdx: number,
): { segments: RawSegment[]; adverbs: string[] } {
  const tail = tokens.slice(verbIdx + 1);
  const segments: RawSegment[] = [{ prep: null, tokens: [] }];
  const adverbs: string[] = [];

  for (const t of tail) {
    if (!t) continue;
    // Preposition? Start a new segment IF the current one already
    // has content. (Leading prepositions get folded into the next
    // segment.)
    if (PREPOSITION_TO_ROLE[t]) {
      const last = segments[segments.length - 1]!;
      if (last.tokens.length > 0) {
        segments.push({ prep: t, tokens: [] });
      } else {
        last.prep = t;
      }
      continue;
    }
    // Adverbs peel off as manner.
    if (ADVERB_SUFFIX.test(t) && t.length > 3 && !STOPWORDS.has(t)) {
      adverbs.push(t);
      continue;
    }
    // Filler? Skip silently.
    if (
      STOPWORDS.has(t) ||
      QUESTION_WORDS.has(t) ||
      JUNK_NOUNS.has(t) ||
      FILLER_DESCRIPTORS.has(t)
    ) {
      continue;
    }
    // Real content token — accumulate into current segment.
    segments[segments.length - 1]!.tokens.push(t);
  }

  // Drop empty segments (e.g. a trailing preposition with no NP).
  return {
    segments: segments.filter((s) => s.tokens.length > 0),
    adverbs,
  };
}

/** Resolve each segment to inventory / enemy / scene noun and tag
 *  it with the right ArgRole based on the verb's frame.
 *
 *  Returns an ordered list of ParsedArg. The first arg (if any) is
 *  always the direct object — its resolution mirrors into the
 *  legacy ParsedInput.target / resolvedItemId / resolvedNoun fields
 *  for back-compat with existing handlers. */
function buildArgs(
  segments: RawSegment[],
  adverbs: string[],
  intent: Exclude<Intent, 'unknown'>,
  inventory: InventoryItem[],
  recentNouns: string[],
  enemyNames: string[],
  equippedOffHand?: string | null,
): ParsedArg[] {
  const frame = frameFor(intent);
  const args: ParsedArg[] = [];

  let directAssigned = false;
  for (const seg of segments) {
    let role: ArgRole;
    if (!seg.prep) {
      // No preposition → direct object (first one) or fold into
      // existing direct.
      if (!directAssigned) {
        role = 'direct';
        directAssigned = true;
      } else {
        // Second NP with no preposition — DITRANS pattern ("give
        // Yulka the locket"). For our V1 command set we treat the
        // second as recipient when the frame accepts it, else fold
        // back into direct.text.
        if (frame.acceptRoles.includes('recipient')) {
          role = 'recipient';
        } else {
          const existingDirect = args.find((a) => a.role === 'direct');
          if (existingDirect) {
            existingDirect.text = `${existingDirect.text} ${seg.tokens.join(' ')}`.trim();
          }
          continue;
        }
      }
    } else {
      // Preposition-introduced segment → role from the table, with
      // verb-specific overrides for 'with'.
      const base = PREPOSITION_TO_ROLE[seg.prep] ?? 'direct';
      if (seg.prep === 'with' && frame.withRole === 'companion') {
        // V1: companion collapses into direct since we don't have
        // a separate companion role. Fold the tokens back.
        const existingDirect = args.find((a) => a.role === 'direct');
        if (existingDirect) {
          existingDirect.text = `${existingDirect.text} with ${seg.tokens.join(' ')}`.trim();
          continue;
        }
        role = 'direct';
        directAssigned = true;
      } else {
        role = base;
      }
      // If the frame doesn't accept this role, fold into direct.
      if (!frame.acceptRoles.includes(role)) {
        const existingDirect = args.find((a) => a.role === 'direct');
        if (existingDirect) {
          existingDirect.text = `${existingDirect.text} ${seg.tokens.join(' ')}`.trim();
          continue;
        }
        role = 'direct';
        directAssigned = true;
      }
    }

    const text = seg.tokens.join(' ');
    // Resolve against enemies → inventory → scene nouns, mirroring
    // the original single-target resolver in parseInput. We do not
    // re-implement enemy fuzzy logic here; for V1 the per-segment
    // resolver is simpler (substring item match + recent-noun
    // fallback). The legacy enemy-first logic in parseInput still
    // populates the direct slot via resolvedNoun.
    const item = resolveItem(seg.tokens, inventory, equippedOffHand);
    const noun = item ? undefined : resolveContextNoun(seg.tokens, recentNouns);
    // Enemy hit on segment tokens — only relevant for direct.
    let enemyHit: string | undefined;
    if (!item && !noun && role === 'direct' && enemyNames.length > 0) {
      const lower = text.toLowerCase();
      for (const e of enemyNames) {
        const el = e.toLowerCase();
        if (seg.tokens.some((t) => el.includes(t) || t.includes(el)) || lower === el) {
          enemyHit = e;
          break;
        }
      }
    }

    args.push({
      role,
      text,
      resolvedItemId: item?.id,
      resolvedNoun: enemyHit ?? noun,
      preposition: seg.prep ?? undefined,
    });
  }

  // Adverbs → one combined manner arg.
  if (adverbs.length > 0 && frame.acceptRoles.includes('manner')) {
    args.push({ role: 'manner', text: adverbs.join(' ') });
  }

  return args;
}

function resolveItem(
  targetTokens: string[],
  inventory: InventoryItem[],
  equippedOffHand?: string | null,
): InventoryItem | undefined {
  if (!targetTokens.length || !inventory.length) return undefined;
  // OTA 027 — off-hand prefer-equipped path. If the player typed
  // "off-hand X" / "offhand X" / "off hand X", the engine should
  // resolve to whatever is in the off-hand slot, not fuzzy-match
  // the residual tokens against main-hand candidates. Without
  // this, "attack with the off-hand mud-rend blade" mis-resolved
  // to Rusted Blade in main when both items end in "blade".
  // After consumed, the off-hand tokens are stripped from
  // targetTokens so the rest of the function only sees the
  // weapon-noun phrase (used as a sanity check below).
  const wantsOffHand = targetTokens.some(
    (t) => t === 'off-hand' || t === 'offhand' || t === 'off',
  ) || (
    // "off hand" as adjacent tokens
    (() => {
      for (let i = 0; i < targetTokens.length - 1; i++) {
        if (targetTokens[i] === 'off' && targetTokens[i + 1] === 'hand') return true;
      }
      return false;
    })()
  );
  if (wantsOffHand && equippedOffHand) {
    const offItem = inventory.find((i) => i.name.toLowerCase() === equippedOffHand.toLowerCase());
    if (offItem) return offItem;
  }
  // Filter out the off-hand qualifier tokens before fuzzy matching
  // so they don't pollute the candidate scoring.
  const filtered = targetTokens.filter(
    (t) => t !== 'off-hand' && t !== 'offhand' && t !== 'off' && t !== 'hand',
  );
  const tokens = filtered.length ? filtered : targetTokens;
  // 2026-05-27 OTA-093 — tightened matching. Pre-OTA-093 the
  // first loop checked `tokens.some(t => itemLower.includes(t))`
  // — ANY token as a substring of ANY item name won. Result:
  // `climb titan's bone marker` (a scene noun) resolved to
  // `Bone Fragment` (inventory item) because 'bone fragment'
  // includes 'bone'. Engine then refused with "not something
  // hands take to" (you can't climb a fragment).
  //
  // New rules, ordered most-confident to least:
  //   (1) input contains the FULL item name (multi-word
  //       item names need ALL their words present in the
  //       input — fixes the false-match scenario).
  //   (2) input contains the item's HEAD NOUN (last word) as
  //       a standalone token. "use the locket" → "locket"
  //       in tokens → matches "Aetheric Locket". "use the
  //       blade" → matches "Rusted Blade".
  //   (3) fuzzy match on the head noun specifically (typo
  //       tolerance — "use lockett" matches Locket).
  //
  // Adjective-only matches ("titan" / "bone" / "aetheric"
  // alone) no longer win. The player needs to name the head
  // noun, or use the full item name.
  //
  // Hyphen normalization: items like 'Bolt-Caster' tokenize to
  // ['bolt', 'caster'] in the parser (the tokenizer splits on
  // hyphens). For comparison we normalize hyphens to spaces in
  // both sides so 'bolt-caster' and 'bolt caster' are
  // equivalent. The head-noun pass also flattens any
  // multi-segment tokens before lookup so 'caster' (head of
  // 'bolt-caster') matches a flat-token 'caster' from
  // 'bolt-caster' or 'bolt caster' input.
  const normalizeName = (s: string): string =>
    s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const inputNorm = normalizeName(tokens.join(' '));
  // Flatten tokens: split each token on hyphens AND whitespace
  // so 'bolt-caster' contributes ['bolt', 'caster'] to the
  // pool. Pre-OTA-093 substring matching tolerated this
  // implicitly; head-noun matching needs explicit handling.
  const flatTokens = tokens.flatMap((t) => t.toLowerCase().split(/[-\s]+/).filter(Boolean));

  // Pass 1: input contains the full item name.
  for (const item of inventory) {
    const itemNorm = normalizeName(item.name);
    if (inputNorm === itemNorm) return item;
    if (inputNorm.includes(itemNorm)) return item;
  }
  // ⚠ OTA-1149 — THE MODIFIER IS EVIDENCE, NOT DECORATION.
  //
  // Passes 2 and 3 match on the HEAD NOUN. OTA-093 wrote them that way to stop
  // adjective-only matches ("bone" → Bone Fragment) from winning, and that half
  // still holds. What it never handled is the INVERSE: when the input carries
  // an adjective of its OWN, the head-noun passes threw it away and returned
  // whichever same-noun row sat first in the pack.
  //
  // Device log, OTA-1143: `craft Frost Paste` resolved to **Searing Paste** —
  // a Paste the player owned, matched on the shared word "paste" while "frost"
  // was discarded. Craft itself was unharmed (it matches recipes, not
  // inventory), but ~25 gameStore handlers read parsed.resolvedNoun FIRST, so
  // `use frost paste` would have spent the wrong consumable. The same shape
  // hits Iron/Brass Key, Poison/Acid Vial, Rusted/Rail Blade — any pair that
  // shares a last word.
  //
  // The rule below, in order:
  //   (a) a candidate whose OTHER name words all appear in the input wins
  //       outright — that is the player naming the thing precisely, and it also
  //       settles "mud-rend blade" vs "Rusted Blade" without the off-hand hint.
  //   (b) nothing agrees, and the input carried NO extra descriptive token —
  //       "use the blade" with one blade in the pack. Nothing contradicts, so
  //       keep the historical first-match behaviour.
  //   (c) nothing agrees and the input DID carry an extra token no candidate
  //       can account for — the player named something they do not have.
  //       Return undefined. A miss is recoverable ("you have no Frost Paste");
  //       a confident wrong answer spends the wrong item.
  //
  // ⚠ The guard has to cover pass 3 too. Pass 3 fuzzy-matches tokens against
  // head nouns, so fixing pass 2 alone would be undone one loop later:
  // fuzzyEqual('paste', 'paste') is true, and Searing Paste comes right back.
  const headOf = (item: InventoryItem): string => {
    const words = normalizeName(item.name).split(/\s+/);
    return words[words.length - 1] ?? '';
  };
  // Every non-head word of the item's own name appears in what was typed.
  const modifiersAgree = (item: InventoryItem): boolean => {
    const words = normalizeName(item.name).split(/\s+/);
    return words.slice(0, -1).every((w) => flatTokens.includes(w));
  };
  // Words the player typed that are NOT the noun that matched — the tokens a
  // wrong candidate would be silently ignoring.
  const extraBeyond = (matched: string): string[] =>
    flatTokens.filter((t) => t !== matched);
  const pickAmong = (
    candidates: InventoryItem[],
    matched: string,
  ): InventoryItem | undefined => {
    if (!candidates.length) return undefined;
    const agreeing = candidates.find(modifiersAgree);
    if (agreeing) return agreeing;
    return extraBeyond(matched).length === 0 ? candidates[0] : undefined;
  };

  // Pass 2: item's head noun (last word of normalized name)
  // appears as a flat token in the input.
  for (const token of flatTokens) {
    const picked = pickAmong(inventory.filter((i) => headOf(i) === token), token);
    if (picked) return picked;
  }
  // Pass 3: fuzzy match against the head noun (typo
  // tolerance). Pre-OTA-093 this loop fuzzy-matched against
  // EVERY word in the item name, which was too loose. Head-
  // noun-only keeps typo tolerance ("lockett" → "locket")
  // without re-introducing adjective ambiguity.
  for (const token of flatTokens) {
    const picked = pickAmong(
      inventory.filter((i) => {
        const head = headOf(i);
        return !!head && fuzzyEqual(token, head);
      }),
      token,
    );
    if (picked) return picked;
  }
  return undefined;
}

function resolveContextNoun(
  targetTokens: string[],
  recentNouns: string[],
  preferred?: string | null,
): string | undefined {
  if (!targetTokens.length || !recentNouns.length) return undefined;
  const preferLower = (preferred ?? '').toLowerCase().trim();
  // OTA-699 — recency tiebreak. When several scene nouns match the same ambiguous
  // target (a room with a "drain hatch" AND an "observation hatch", target "hatch"),
  // the old code returned the FIRST in array order — so "look inside the hatch" hit
  // the wrong one. Prefer the noun the player MOST RECENTLY interacted with; fall
  // back to array-order first-match (unchanged behavior when there's no preference).
  const preferFrom = (matches: string[]): string | undefined => {
    if (!matches.length) return undefined;
    if (preferLower) {
      const recent = matches.find((n) => {
        const nl = n.toLowerCase();
        return nl === preferLower || nl.includes(preferLower) || preferLower.includes(nl);
      });
      if (recent) return recent;
    }
    return matches[0];
  };
  // ⚠⚠⚠ OTA-1576 — ONE TOKEN OUT OF TWO USED TO BE ENOUGH, and it cost the owner
  // a mission stage. From his 4.32.11 log, on a tile where he had been told to
  // find three Tartarian Raiders:
  //
  //   [player] find the tartarian raider
  //   parser: intent=investigate verb=find target=tartarian raider
  //           resolved=Tartarian Trap
  //
  // `targetTokens.some(...)` accepted a noun that matched ANY single token, so
  // "Tartarian Trap" — which shares only the ADJECTIVE and does not contain the
  // word "raider" at all — was a first-class hit. He then typed the problem into
  // the game in plain English, which is how far a wrong noun can push a player.
  //
  // ⚠⚠ THE FIX IS RANKING, NOT NARROWING. Refusing partial matches outright would
  // break every legitimate shorthand ("the cloth" for "blood-spotted cloth"), so
  // coverage is SCORED and the best-covered noun wins: a noun matching both
  // tokens beats one matching either. Ties keep the old recency preference and
  // array order, so nothing that resolved unambiguously before moves.
  //
  // ⚠⚠ AND WHEN NOTHING COVERS THE WHOLE TARGET, THE HEAD NOUN DECIDES. English
  // puts the head last — "tartarian RAIDER" is a raider, not a tartarian — so a
  // partial match that misses the head is matching the adjective and nothing
  // else. That is the exact shape of his bug, and it is the one partial worth
  // refusing: better to resolve nothing and let the refusal speak than to send
  // him to a trap when he asked for a person.
  const head = targetTokens[targetTokens.length - 1]!;
  const rank = (noun: string): number => {
    const nounLower = noun.toLowerCase();
    const hits = targetTokens.filter((t) => nounLower.includes(t)).length;
    if (hits === 0) return 0;
    if (hits < targetTokens.length && !nounLower.includes(head)) return 0;
    return hits;
  };
  const scored = recentNouns
    .map((noun) => ({ noun, score: rank(noun) }))
    .filter((r) => r.score > 0);
  if (scored.length > 0) {
    const best = Math.max(...scored.map((r) => r.score));
    const substrHit = preferFrom(scored.filter((r) => r.score === best).map((r) => r.noun));
    if (substrHit) return substrHit;
  }
  // Fuzzy pass, ranked the same way — a near-spelling of the head still has to
  // be the head.
  const fuzzyRank = (noun: string): number => {
    const words = noun.toLowerCase().split(/\s+/);
    const hits = targetTokens.filter((t) => words.some((w) => fuzzyEqual(t, w))).length;
    if (hits === 0) return 0;
    if (hits < targetTokens.length && !words.some((w) => fuzzyEqual(head, w))) return 0;
    return hits;
  };
  const fuzzyScored = recentNouns
    .map((noun) => ({ noun, score: fuzzyRank(noun) }))
    .filter((r) => r.score > 0);
  if (fuzzyScored.length === 0) return undefined;
  const bestFuzzy = Math.max(...fuzzyScored.map((r) => r.score));
  return preferFrom(fuzzyScored.filter((r) => r.score === bestFuzzy).map((r) => r.noun));
}

export interface ParseContext {
  inventory?: InventoryItem[];
  recentNouns?: string[];
  enemyPresent?: boolean;
  /** Name of the Location the player is currently in. The parser uses it
   *  to filter nonsense suggestions like "use torch on <location>" —
   *  locations are containers, not interactable targets. */
  currentLocationName?: string;
  /** Names + aliases of enemies on the field. Used to suppress "use
   *  torch on <enemy>" suggestions — that reads as nonsense; the
   *  player should attack, throw, or use a weapon-like item. */
  enemyNames?: string[];
  /** Nouns from active (unresolved) hooks in the scene. Lets the
   *  suggester surface hook-friendly verbs (search, inspect, follow,
   *  investigate) when the player names one. */
  hookNouns?: string[];
  /** Ambient nouns extracted from the scene paragraph. Used to
   *  classify the player's input as a generic-area target. */
  ambientNouns?: string[];
  /** OTA-699 — the noun the player most recently interacted with (from the
   *  store's lastInteractedNoun). Recency tiebreak so an ambiguous bare noun
   *  ("the hatch" in a room with two hatches) resolves to the one just touched. */
  lastInteractedNoun?: string | null;
  /** Name of the vendor currently in the scene, if any. Lets the
   *  suggester offer 'trade with X' / 'buy from X' style verbs. */
  vendorName?: string;
  /** OTA 027 — name of the item currently equipped in the off-hand
   *  slot, if any. resolveItem prefers this when the target text
   *  contains "off-hand" / "off hand" so "attack with the off-hand
   *  X" actually swings the off-hand weapon instead of fuzzy-matching
   *  to the main-hand by token overlap. */
  equippedOffHand?: string | null;
}

/** Classification of a parsed noun against the live scene. Drives the
 *  suggestion engine: each verb has an allowlist of NounKinds it
 *  makes sense for, so the parser stops offering "use torch on goblin"
 *  / "inspect <location>" / etc. nonsense in the no-verb fallback. */
export type NounKind = 'item' | 'enemy' | 'hook' | 'ambient' | 'location' | 'vendor';

export function classifyNoun(
  noun: string | undefined | null,
  context: ParseContext,
): NounKind | null {
  if (!noun) return null;
  const lower = noun.toLowerCase();
  // Item match — exact-ish name match against inventory.
  const item = (context.inventory ?? []).find(
    (i) => i.name.toLowerCase() === lower || i.name.toLowerCase().includes(lower),
  );
  if (item) return 'item';
  // Enemy match (canonical name or alias).
  const enemyNames = (context.enemyNames ?? []).map((n) => n.toLowerCase());
  if (enemyNames.some((n) => n === lower || n.includes(lower) || lower.includes(n))) {
    return 'enemy';
  }
  // Vendor match.
  if (context.vendorName && context.vendorName.toLowerCase().includes(lower)) {
    return 'vendor';
  }
  // Hook noun.
  if ((context.hookNouns ?? []).some((n) => n.toLowerCase() === lower)) {
    return 'hook';
  }
  // Length floor on substring fuzzy match — guards against 3-char
  // input over-matching ("war" → "ward", "ax" → "axle"). Both sides
  // must be ≥4 chars before we'll accept a substring hit. Exact-match
  // path stays open regardless of length.
  const fuzzyMatch = (candidate: string, input: string): boolean => {
    if (candidate === input) return true;
    if (candidate.length < 4 || input.length < 4) return false;
    return candidate.includes(input) || input.includes(candidate);
  };
  // Location name.
  const locName = (context.currentLocationName ?? '').toLowerCase();
  if (locName && fuzzyMatch(locName, lower)) {
    return 'location';
  }
  // Ambient noun — falls through as the catch-all when nothing else matches.
  if ((context.ambientNouns ?? []).some((n) => fuzzyMatch(n.toLowerCase(), lower))) {
    return 'ambient';
  }
  return null;
}

/** Per-suggestion verb, the NounKinds that make sense as targets.
 *  Used by the no-verb fallback so the suggestion bar only offers
 *  combinations the engine can actually resolve. */
const VERB_NOUN_KINDS: Record<string, NounKind[]> = {
  inspect: ['item', 'enemy', 'hook', 'ambient', 'vendor'],
  search: ['ambient', 'hook'],
  attack: ['enemy'],
  throw: ['enemy'],
  'use torch on': ['ambient', 'hook'],
  'talk to': ['vendor', 'enemy'],
  steal: ['ambient', 'hook', 'vendor'],
  follow: ['hook', 'enemy'],
};

export function parseInput(raw: string, context: ParseContext = {}): ParsedInput {
  const normalized = normalizeInput(raw);
  const tokens = tokenize(normalized);
  const inventory = context.inventory ?? [];
  const recentNouns = context.recentNouns ?? [];

  if (!tokens.length) {
    return {
      intent: 'unknown',
      raw,
      normalized,
      confidence: 0,
      suggestions: ['look around', 'check inventory', 'rest'],
    };
  }

  // 2026-05-25 — bare cardinal direction shortcuts. Player types
  // 'n' / 's' / 'e' / 'w' / 'ne' / 'nw' / 'se' / 'sw' and expects to
  // travel; without this special-case they fell through bestVerbMatch
  // as unknown and bounced to the Qwen LLM fallback. Cardinal short-
  // codes are unambiguous in normal play; only intercept when the
  // entire input is one of the codes.
  if (tokens.length === 1) {
    const tok = tokens[0]!;
    const cardinalMap: Record<string, string> = {
      n: 'north', s: 'south', e: 'east', w: 'west',
      ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
    };
    const expanded = cardinalMap[tok];
    if (expanded) {
      return {
        intent: 'travel',
        raw,
        normalized,
        confidence: 0.95,
        matchedVerb: 'go',
        target: expanded,
        suggestions: [],
      };
    }
  }

  let bestMatch: { intent: Exclude<Intent, 'unknown'>; verb: string; distance: number; index: number } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const m = bestVerbMatch(token);
    if (m && (!bestMatch || m.distance < bestMatch.distance)) {
      bestMatch = { ...m, index: i };
    }
  }

  // Combat-context override: when an enemy is present and the input contains
  // an explicit attack verb, force attack intent. Prevents "use my torch to
  // attack the moth" from routing to use_relic just because "use" comes first.
  if (bestMatch && context.enemyPresent && bestMatch.intent !== 'attack') {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t && VERB_SYNONYMS.attack.includes(t)) {
        bestMatch = { intent: 'attack', verb: t, distance: 0, index: i };
        break;
      }
    }
  }

  if (!bestMatch) {
    // No verb matched — fall back to suggestion generation driven by
    // the noun taxonomy. classifyNoun() puts the player's target into
    // one of: item / enemy / hook / ambient / location / vendor. Each
    // suggestion verb has a NounKind allowlist (VERB_NOUN_KINDS) — we
    // only offer the verb-noun pairs the engine can actually resolve.
    const cleanTokens = tokens.filter((t) => !STOPWORDS.has(t) && !FILLER_DESCRIPTORS.has(t));
    const noun = resolveContextNoun(cleanTokens, recentNouns);
    const item = resolveItem(cleanTokens, inventory, context.equippedOffHand ?? null);
    const nounKind = classifyNoun(noun, context);
    const lowerNoun = noun?.toLowerCase() ?? '';
    const hasTorch = (context.inventory ?? []).some(
      (i) => /torch/i.test(i.name) && i.quantity > 0,
    );

    const suggestions: string[] = [];
    const suggestIfAllowed = (verb: string, withNoun = true) => {
      const allowed = VERB_NOUN_KINDS[verb];
      if (!allowed) return;
      if (!nounKind) return;
      if (!allowed.includes(nounKind)) return;
      suggestions.push(withNoun ? `${verb} ${lowerNoun}` : verb);
    };

    if (noun && nounKind) {
      // Always-safe verbs that don't require any item / context.
      suggestIfAllowed('inspect');
      if (nounKind === 'ambient' || nounKind === 'hook') suggestIfAllowed('search');
      if (nounKind === 'enemy') suggestIfAllowed('attack');
      if (nounKind === 'vendor') suggestIfAllowed('talk to');
      // 'use torch on X' only if the player carries one.
      if (hasTorch) suggestIfAllowed('use torch on');
    }
    // OTA-711 — guard the "use <item>" suggestion against loose fuzzy
    // matches. resolveItem will map "aetherkin" → "Flame of Aether" on the
    // shared "aether" fragment, producing a nonsensical "Try: use flame of
    // aether" nudge (playtest log). Only offer the item when the player's
    // noun shares a WHOLE, non-trivial word with the item name.
    if (item) {
      const itemWords = new Set(
        item.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)),
      );
      const nounSharesWord = cleanTokens.some((w) => w.length > 2 && itemWords.has(w));
      if (nounSharesWord) suggestions.push(`use ${item.name.toLowerCase()}`);
    }
    // arb167 — 'sneak' (not 'hide') so the stealth tactic reads as an offensive
    // setup: mid-range it's the unseen opener, close-range the initiative gamble.
    if (context.enemyPresent) suggestions.push('attack', 'dodge', 'advance', 'retreat', 'sneak', 'parley');
    if (!suggestions.length) suggestions.push('look around', 'search', 'rest');
    // OTA 204 — even when no verb matched, run the meta-talk regex so
    // feedback-style inputs without a recognized verb still get the
    // validationIssues tag. Lets the engine surface a helpful message
    // ("use the 📝 button to leave a note") instead of the generic
    // unknown-verb prompt. Direct call to validateParse() on a
    // synthetic ParsedInput would loop on intent==='unknown'; instead
    // we re-check the regex inline (kept in sync via the
    // META_TALK_REGEX export from parseValidator).
    const metaIssues: string[] = [];
    if (META_TALK_REGEX.test(normalized)) metaIssues.push('meta_talk');
    return {
      intent: 'unknown',
      raw,
      normalized,
      confidence: 0.1,
      suggestions,
      resolvedNoun: noun,
      ...(metaIssues.length > 0 ? { validationIssues: metaIssues } : {}),
    };
  }

  const targetTokens = extractTargetTokens(tokens, bestMatch.index);
  // Enemy names win over inventory when an enemy is actually present
  // in the scene AND a token from the target matches the enemy's name
  // (substring or fuzzy). Playtest log: "sneak up on Aetheric Drone"
  // resolved to "Aetheric Torch" because resolveItem matched on
  // 'aetheric' before any enemy lookup ran. Now: check enemies first;
  // a hit returns the enemy's display name as the resolved noun and
  // skips inventory.
  const enemyNamesLower = (context.enemyNames ?? []).map((n) => n.toLowerCase());
  let enemyHit: string | undefined = undefined;
  if (enemyNamesLower.length > 0 && targetTokens.length > 0) {
    // arb-fix — respect an explicit trailing ordinal ("raider 3") BEFORE the
    // loose any-token match. Numbered enemies share every word except the
    // number ("Conspiracy Architects Raider 2/3"), so the any-token loop below
    // matched on "conspiracy" and returned the FIRST enemy regardless of the
    // typed number (so "approach raider 3" resolved to raider 2 once 1 died).
    const ordinalTok = targetTokens.find((t) => /^\d+$/.test(t));
    if (ordinalTok) {
      const numbered = (context.enemyNames ?? []).find((e) =>
        new RegExp(`\\b${ordinalTok}\\b\\s*$`).test(e.toLowerCase().trim()),
      );
      if (numbered) enemyHit = numbered;
    }
    // Exact substring first.
    if (!enemyHit)
    for (const eRaw of context.enemyNames ?? []) {
      const e = eRaw.toLowerCase();
      if (targetTokens.some((t) => e.includes(t) || t.includes(e))) {
        enemyHit = eRaw;
        break;
      }
    }
    // Fuzzy fallback against individual words in each enemy name.
    if (!enemyHit) {
      for (const eRaw of context.enemyNames ?? []) {
        const words = eRaw.toLowerCase().split(/\s+/);
        for (const t of targetTokens) {
          if (words.some((w) => fuzzyEqual(t, w))) {
            enemyHit = eRaw;
            break;
          }
        }
        if (enemyHit) break;
      }
    }
  }
  // 2026-05-24 — prefer scene ambient noun over inventory + recentNouns
  // fuzzy match when the typed target IS an ambient noun. resolveItem
  // and resolveContextNoun both use loose "any token matches any
  // candidate word" rules that clobber multi-word ambient nouns
  // (e.g. "rusted tartarian power conduit" → "Rusted Blade" via the
  // leading "rusted"; "dust-buried tartarian power conduit" → "buried
  // capital" via the leading "buried" matching the location type).
  //
  // Rule: if the full target phrase (or a strict substring of it)
  // matches a scene ambient noun, ambient wins. Otherwise fall back
  // to the existing resolveItem/resolveContextNoun logic. Sorted by
  // length DESC so the most specific ambient noun wins when several
  // could match.
  //
  // 2026-05-24 (later) — comparisons run through normalizeForCompare
  // so hyphen variants ("salt-crusted" vs "salt crusted") and
  // whitespace differences match. Without this, the parser's
  // hyphen-stripping tokenizer breaks every curated noun that
  // includes a hyphen ("dust-buried", "salt-crusted", "half-buried").
  // ⚠⚠⚠ OTA-1585 — THIS PRE-PASS WAS A RAW SUBSTRING TEST AND IT ATE THE OWNER'S
  // ATTACKS IN THE MIDDLE OF A GUARDIAN FIGHT. From his 4.32.11 log, in Nimari,
  // a Lost Capital where "core" is a scene noun:
  //
  //   [player] attack with the reclaimers guild geode-cored cleaver
  //   parser: intent=attack ... target=reclaimers guild geode cored cleaver
  //           resolved=core
  //   [arbiter] "That is the Tartarian Core. It does not come out with that hand"
  //
  // `targetPhraseNorm.includes(nNorm)` found "core" inside "geode COREd", so the
  // ambient pre-pass claimed the phrase, `resolveItem` was skipped entirely, and
  // the main-quest Core guard swallowed the swing. He tapped his weapon twice
  // mid-boss and got a lecture about the Core both times. The identical command
  // had resolved correctly one tile earlier, because "core" is not a scene noun
  // out on the Plains.
  //
  // ⚠⚠ AND THE FIX ALREADY EXISTED, ONE FUNCTION AWAY. OTA-947 rebuilt exactly
  // this comparison at the WORD level inside `matchAmbientNoun`, with a note
  // about "arch" hiding inside "research chart" — the same bug, found once,
  // fixed once, and never propagated to the parser's own private copy. So the
  // copy is deleted rather than patched: the pre-pass now calls the function
  // that solved it. Exact-match-first, whole-word containment, prefix shorthand
  // ("hatch" still finds the "drain hatch") — all of it, from one place.
  const targetPhraseRaw = targetTokens.join(' ').toLowerCase().trim();
  const targetPhraseNorm = normalizeForCompare(targetPhraseRaw);
  const ambientStrongMatch: string | undefined =
    targetPhraseNorm && !enemyHit
      ? matchAmbientNoun(targetPhraseRaw, context.ambientNouns ?? []) ?? undefined
      : undefined;
  const item = enemyHit || ambientStrongMatch
    ? undefined
    : resolveItem(targetTokens, inventory, context.equippedOffHand ?? null);
  const noun = enemyHit ?? ambientStrongMatch ?? (item ? undefined : resolveContextNoun(targetTokens, recentNouns, context.lastInteractedNoun));

  // Confidence: 1.0 exact verb, falls off with distance; small boost from resolved target.
  const verbConfidence = Math.max(0.4, 1 - bestMatch.distance * 0.18);
  const targetBoost = item ? 0.1 : noun ? 0.06 : targetTokens.length > 0 ? 0.02 : 0;
  const confidence = Math.min(1, verbConfidence + targetBoost);

  // OTA 204 — argument extraction pass + post-processing validator.
  // The segmenter walks the same post-verb token stream as
  // extractTargetTokens but splits it on preposition boundaries into
  // role-tagged segments per the verb's subcategorization frame
  // (Jurafsky & Martin §12.3.5). The validator (Sleator §7 analog)
  // then catches garbage parses (meta-talk, junk-in-required-slot)
  // and demotes them to intent:'unknown' so the engine doesn't act
  // on them. See verbFrames.ts and parseValidator.ts.
  const { segments, adverbs } = segmentPostVerb(tokens, bestMatch.index);
  const args = buildArgs(
    segments,
    adverbs,
    bestMatch.intent,
    inventory,
    recentNouns,
    context.enemyNames ?? [],
    context.equippedOffHand ?? null,
  );

  // Back-compat for the 25+ gameStore handlers that read
  // parsed.target / resolvedItemId / resolvedNoun. Prefer the LEGACY
  // single-target resolution (computed against the full post-verb
  // token stream) over the segmenter's per-segment resolution.
  // Reason: a handler like throw — "throw the rock at the goblin" —
  // historically reads parsed.target = "rock goblin" to match the
  // goblin enemy. The new segmenter splits direct=rock,
  // destination=goblin; legacy target derived from args[0] would
  // shrink to just "rock" and break enemy resolution.
  // Migrated handlers opt into args.* explicitly (Phase 2). Unmigrated
  // handlers see exactly the same legacy fields they always did.
  const directArg = args.find((a) => a.role === 'direct');
  const legacyTarget = targetTokens.length ? targetTokens.join(' ') : directArg?.text;
  const legacyItemId = item?.id ?? directArg?.resolvedItemId;
  const legacyNoun = item?.name ?? noun ?? directArg?.resolvedNoun;

  const candidate: ParsedInput = {
    intent: bestMatch.intent,
    raw,
    normalized,
    matchedVerb: bestMatch.verb,
    target: legacyTarget,
    resolvedItemId: legacyItemId,
    resolvedNoun: legacyNoun,
    confidence,
    suggestions: [],
    args: args.length > 0 ? args : undefined,
  };

  // Validator runs over the candidate. Non-empty issues → demote to
  // intent:'unknown' with the issue list attached, so callers can
  // surface a helpful message via parseValidator.describeIssues()
  // instead of acting on a junk parse. This is the layer that fixes
  // the playtest regression where "it is supposed to remove a noun
  // item from the popup..." parsed as equip and cleared both hands.
  const issues = validateParse(candidate, {
    inventory: context.inventory,
    ambientNouns: context.ambientNouns,
    vendorName: context.vendorName,
    enemyNames: context.enemyNames,
    // ⚠⚠ OTA-1264 — the negation rule needs the verb's real position.
    // `matchedVerb` cannot supply it: on a fuzzy hit ("slep" → 'sleep')
    // the canonical synonym never appears in `normalized` at all.
    verbTokenIndex: bestMatch.index,
  });
  if (shouldRejectParse(issues)) {
    return {
      intent: 'unknown',
      raw,
      normalized,
      confidence: 0,
      suggestions: ['look around', 'inventory', 'rest'],
      validationIssues: issues,
    };
  }

  return candidate;
}
