import type { Intent, ParsedInput, InventoryItem } from './types';
import { levenshtein } from './editDistance';
import { FILLER_DESCRIPTORS } from './fillerWords';

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
  ],
  diplomacy: [
    'convince', 'persuade', 'negotiate', 'parley', 'bargain', 'plead', 'speak', 'talk',
    'ask', 'greet', 'address', 'hail', 'call', 'beseech', 'entreat',
    // Social + performance card verbs.
    'intimidate', 'perform', 'sing', 'play',
  ],
  escape: [
    'run', 'flee', 'retreat', 'escape', 'withdraw', 'bolt', 'scram',
    'abscond', 'fall back',
  ],
  investigate: [
    'look', 'examine', 'inspect', 'search', 'study', 'check', 'investigate', 'scan',
    'observe', 'view', 'read', 'probe', 'survey', 'find', 'scavenge', 'hunt',
    'peruse', 'scrutinise', 'scrutinize', 'comb',
    // 'salvage' / 'strip' / 'pry' — playtest caught "salvage the
    // construct" failing to advance the wreck_construct hook because
    // there was no salvage verb. Investigate is hook-eligible, so
    // mapping salvage here advances the hook with the right noun.
    'salvage', 'strip', 'pry',
    // From the track / translate / learn / gather cards.
    'track', 'translate', 'learn', 'gather',
    // 'open' belongs to the dedicated open intent — it persists
    // container state across re-entry. Including it here too would
    // make "open the chest" silently route to a generic area search.
  ],
  rest: [
    'rest', 'sleep', 'recover', 'camp', 'heal', 'eat', 'consume', 'devour', 'drink',
    'nap', 'doze',
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
    'conjure',
  ],
  wait: ['wait', 'stay', 'hold', 'pause', 'still', 'linger', 'tarry', 'idle', 'bide', 'remain'],
  ask: ['what', 'explain', 'define', 'who', 'how', 'why', 'tell', 'describe', 'clarify', 'mean'],
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
  gift: ['gift', 'give', 'offer', 'hand', 'bestow', 'donate', 'tender', 'grant', 'pass'],
  // 'pocket' removed — clashes with the noun "pockets" / "in his pocket"
  // and the inventory channel. 'grab' kept (genuine steal verb).
  steal: ['steal', 'pilfer', 'lift', 'pinch', 'swipe', 'snatch', 'filch', 'nick', 'grab'],
  join: ['join', 'pledge', 'swear', 'sign', 'ally', 'bond', 'commit', 'enroll', 'side'],
  dodge: ['dodge', 'evade', 'sidestep', 'duck', 'juke', 'tumble', 'slip', 'twist', 'roll'],
  block: ['block', 'parry', 'deflect', 'shield', 'brace', 'guard', 'fend', 'absorb', 'ward'],
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
  turn_in: ['turn in', 'complete', 'finish', 'deliver', 'report', 'redeem', 'claim', 'present', 'submit', 'hand in'],
  dig: ['dig', 'excavate', 'unearth', 'scrape', 'shovel', 'burrow', 'tunnel', 'mine', 'spade', 'pry'],
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
  help: ['help', 'assist', 'aid', 'support', 'back up', 'cover', 'bolster', 'defend', 'reinforce', 'abet'],
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
  reload: ['reload', 'reloading', 'reset', 'rearm', 'rerack', 'refill', 'recharge', 'top up', 'load up', 'feed'],
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
    // Lockpicking — multi-word so 'pick' alone doesn't conflict with
    // pickup intent.
    'pick the lock', 'pick a lock', 'lockpick', 'pick lock',
  ],
};

const ALL_INTENTS = Object.keys(VERB_SYNONYMS) as Exclude<Intent, 'unknown'>[];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'this', 'that', 'these', 'those',
  'to', 'at', 'in', 'on', 'off', 'with', 'for', 'into', 'onto', 'from', 'of', 'by',
  'and', 'or', 'but', 'then', 'now', 'so', 'as', 'it', 'them',
  'i', 'me', 'you', 'we', 'us', 'they',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had',
]);

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

function extractTargetTokens(tokens: string[], verbIdx: number): string[] {
  const after = tokens.slice(verbIdx + 1);
  return after.filter(
    (t) =>
      !STOPWORDS.has(t) &&
      !QUESTION_WORDS.has(t) &&
      !JUNK_NOUNS.has(t) &&
      !FILLER_DESCRIPTORS.has(t),
  );
}

function resolveItem(targetTokens: string[], inventory: InventoryItem[]): InventoryItem | undefined {
  if (!targetTokens.length || !inventory.length) return undefined;
  // Exact substring match first
  for (const item of inventory) {
    const itemLower = item.name.toLowerCase();
    if (targetTokens.some((t) => itemLower.includes(t))) return item;
  }
  // Fuzzy match against each word in item name
  for (const item of inventory) {
    const words = item.name.toLowerCase().split(/\s+/);
    for (const t of targetTokens) {
      if (words.some((w) => fuzzyEqual(t, w))) return item;
    }
  }
  return undefined;
}

function resolveContextNoun(targetTokens: string[], recentNouns: string[]): string | undefined {
  if (!targetTokens.length || !recentNouns.length) return undefined;
  for (const noun of recentNouns) {
    const nounLower = noun.toLowerCase();
    if (targetTokens.some((t) => nounLower.includes(t))) return noun;
  }
  for (const noun of recentNouns) {
    const words = noun.toLowerCase().split(/\s+/);
    for (const t of targetTokens) {
      if (words.some((w) => fuzzyEqual(t, w))) return noun;
    }
  }
  return undefined;
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
  /** Name of the vendor currently in the scene, if any. Lets the
   *  suggester offer 'trade with X' / 'buy from X' style verbs. */
  vendorName?: string;
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
    const item = resolveItem(cleanTokens, inventory);
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
    if (item) suggestions.push(`use ${item.name.toLowerCase()}`);
    if (context.enemyPresent) suggestions.push('attack', 'block', 'advance', 'retreat', 'hide', 'parley');
    if (!suggestions.length) suggestions.push('look around', 'search', 'rest');
    return { intent: 'unknown', raw, normalized, confidence: 0.1, suggestions, resolvedNoun: noun };
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
    // Exact substring first.
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
  const item = enemyHit ? undefined : resolveItem(targetTokens, inventory);
  const noun = enemyHit ?? (item ? undefined : resolveContextNoun(targetTokens, recentNouns));

  // Confidence: 1.0 exact verb, falls off with distance; small boost from resolved target.
  const verbConfidence = Math.max(0.4, 1 - bestMatch.distance * 0.18);
  const targetBoost = item ? 0.1 : noun ? 0.06 : targetTokens.length > 0 ? 0.02 : 0;
  const confidence = Math.min(1, verbConfidence + targetBoost);

  return {
    intent: bestMatch.intent,
    raw,
    normalized,
    matchedVerb: bestMatch.verb,
    target: targetTokens.length ? targetTokens.join(' ') : undefined,
    resolvedItemId: item?.id,
    resolvedNoun: item?.name ?? noun,
    confidence,
    suggestions: [],
  };
}
