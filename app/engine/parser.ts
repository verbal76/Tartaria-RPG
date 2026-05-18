import type { Intent, ParsedInput, InventoryItem } from './types';
import { levenshtein } from './editDistance';

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
  ],
  diplomacy: [
    'convince', 'persuade', 'negotiate', 'parley', 'bargain', 'plead', 'speak', 'talk',
    'ask', 'greet', 'address', 'hail', 'call', 'beseech', 'entreat',
  ],
  escape: [
    'run', 'flee', 'retreat', 'escape', 'withdraw', 'bolt', 'scram',
    'abscond', 'fall back',
  ],
  investigate: [
    'look', 'examine', 'inspect', 'search', 'study', 'check', 'investigate', 'scan',
    'observe', 'view', 'read', 'open', 'probe', 'survey', 'find', 'scavenge', 'hunt',
    'peruse', 'scrutinise', 'scrutinize', 'comb',
  ],
  rest: [
    'rest', 'sleep', 'recover', 'camp', 'heal', 'eat', 'consume', 'devour', 'drink',
    'nap', 'doze',
  ],
  inventory: [
    'inventory', 'pack', 'bag', 'gear', 'items', 'supplies', 'stuff', 'kit', 'satchel',
    'pockets', 'backpack',
  ],
  travel: [
    'go', 'travel', 'walk', 'head', 'move', 'journey', 'enter', 'descend', 'wander',
    'follow', 'march', 'trek', 'cross', 'proceed', 'depart',
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
  craft: ['craft', 'make', 'forge', 'fashion', 'build', 'assemble', 'construct', 'fabricate', 'weld', 'sculpt'],
  equip: ['equip', 'wear', 'wield', 'don', 'unequip', 'remove', 'sheathe', 'strap', 'fit', 'fasten'],
  gift: ['gift', 'give', 'offer', 'hand', 'bestow', 'donate', 'tender', 'grant', 'pass'],
  steal: ['steal', 'pocket', 'pilfer', 'lift', 'pinch', 'swipe', 'snatch', 'filch', 'nick', 'grab'],
  join: ['join', 'pledge', 'swear', 'sign', 'ally', 'bond', 'commit', 'enroll', 'side'],
  dodge: ['dodge', 'evade', 'sidestep', 'duck', 'juke', 'tumble', 'slip', 'twist', 'roll'],
  block: ['block', 'parry', 'deflect', 'shield', 'brace', 'guard', 'fend', 'absorb', 'ward'],
  advance: [
    'advance', 'approach', 'rush', 'sprint', 'closein', 'press', 'lunge', 'forward',
    'charge in', 'near',
  ],
  retreat: [
    'backoff', 'backaway', 'pullback', 'stepback', 'reposition', 'recoil', 'edgeback',
    'pace back', 'fall away', 'inch back',
  ],
  repair: ['repair', 'mend', 'restore', 'refurbish', 'patch', 'fix', 'rebuild', 'renew', 'overhaul', 'tune'],
  accept: ['accept', 'take', 'undertake', 'agree', 'yes', 'consent', 'embrace', 'assent', 'okay', 'aye'],
  turn_in: ['turnin', 'complete', 'finish', 'deliver', 'report', 'redeem', 'claim', 'present', 'submit', 'hand in'],
  dig: ['dig', 'excavate', 'unearth', 'scrape', 'shovel', 'burrow', 'tunnel', 'mine', 'spade', 'pry'],
  throw: ['throw', 'toss', 'hurl', 'lob', 'chuck', 'fling', 'pitch', 'cast at', 'launch', 'whip'],
  // NEW from action card.
  climb: ['climb', 'scale', 'ascend', 'clamber', 'shimmy', 'scramble', 'vault up', 'hoist', 'ladder', 'rope up'],
  swim: ['swim', 'wade', 'paddle', 'splash', 'dive', 'ford', 'submerge', 'surface', 'tread', 'drift'],
  jump: ['jump', 'leap', 'hop', 'vault', 'bound', 'spring', 'hurdle', 'pounce', 'skip', 'launch over'],
  dash: ['dash', 'dash forward', 'sprintto', 'doubletime', 'gogo', 'sprint forward', 'hustle', 'bolt forward', 'race', 'dart', 'scamper'],
  disengage: ['disengage', 'peel off', 'break off', 'slip away', 'pull away', 'extract', 'fade back', 'detach', 'unstick', 'shake off'],
  help: ['help', 'assist', 'aid', 'support', 'back up', 'cover', 'bolster', 'defend', 'reinforce', 'abet'],
  ready: ['ready', 'prepare', 'set up', 'focus', 'watch', 'await', 'prep', 'steady', 'anticipate', 'cock'],
  mount: ['mount', 'saddle', 'ride', 'bridle', 'horse up', 'climb on', 'astride', 'dismount', 'unsaddle', 'get off'],
  // NEW from firearms / evasive cards. Sprint stays as a dash alias
  // (already covered in dash synonyms); flee stays as escape; brawl is
  // bare-hand attack (already covered via punch/kick). Genuinely new:
  take_cover: ['takecover', 'cover up', 'hunker', 'crouch behind', 'duck behind', 'shelter', 'tuck', 'dive for cover', 'go prone', 'flatten'],
  aim: ['aim', 'sight', 'target', 'line up', 'draw bead', 'level', 'lock on', 'sightin', 'tracksight', 'zero'],
  reload: ['reload', 'reloading', 'reset', 'rearm', 'rerack', 'refill', 'recharge', 'top up', 'load up', 'feed'],
  maneuver: ['maneuver', 'disarm', 'grapple', 'trip', 'shove', 'sweep', 'pin', 'hook', 'wrench', 'manoeuvre'],
  quick_fire: ['quickfire', 'snap shot', 'snap fire', 'fast fire', 'rush shot', 'panic shot', 'quick shot', 'quick draw', 'fast draw', 'first shot'],
  multi_fire: ['burst fire', 'double tap', 'triple tap', 'multi shot', 'multiple shots', 'spray', 'fire twice', 'fire three', 'rapid fire', 'volley'],
  fight_back: ['fight back', 'counter', 'counter strike', 'opposed strike', 'meet the blade', 'trade blows', 'parry and strike', 'return fire', 'riposte', 'hit back'],
  recruit: ['recruit', 'hire', 'follow me', 'come with', 'join me', 'bring along', 'travel together', 'companion', 'walk with me'],
};

const ALL_INTENTS = Object.keys(VERB_SYNONYMS) as Exclude<Intent, 'unknown'>[];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'this', 'that', 'these', 'those',
  'to', 'at', 'in', 'on', 'with', 'for', 'into', 'onto', 'from', 'of', 'by',
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
  // Collapse a few movement phrases into single tokens so the verb matcher
  // can fire on them (tokenize splits on whitespace).
  s = s
    .replace(/\bclose in\b/g, 'closein')
    .replace(/\bstep back\b/g, 'stepback')
    .replace(/\bback off\b/g, 'backoff')
    .replace(/\bback away\b/g, 'backaway')
    .replace(/\bpull back\b/g, 'pullback')
    .replace(/\bturn in\b/g, 'turnin');
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

function fuzzyEqual(word: string, candidate: string): boolean {
  if (word === candidate) return true;
  if (word.length < 3 || candidate.length < 3) return false;
  // Prefix match handles "ration" → "rations" and similar
  if (candidate.startsWith(word) || word.startsWith(candidate)) {
    return Math.abs(word.length - candidate.length) <= 3;
  }
  const maxLen = Math.max(word.length, candidate.length);
  // Tightened for short words: 4-char words now require exact match. This
  // stops noise like "dead" → "read" (distance 1) silently routing "am i
  // dead?" to investigate intent. 5–7 chars still allow 1 edit, 8+ allow 2.
  const allowed = maxLen <= 4 ? 0 : maxLen <= 7 ? 1 : 2;
  return levenshtein(word, candidate) <= allowed;
}

function bestVerbMatch(token: string): { intent: Exclude<Intent, 'unknown'>; verb: string; distance: number } | null {
  let best: { intent: Exclude<Intent, 'unknown'>; verb: string; distance: number } | null = null;
  for (const intent of ALL_INTENTS) {
    for (const verb of VERB_SYNONYMS[intent]) {
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
  'here', 'there', 'around', 'near', 'nearby', 'else',
]);

function extractTargetTokens(tokens: string[], verbIdx: number): string[] {
  const after = tokens.slice(verbIdx + 1);
  return after.filter(
    (t) => !STOPWORDS.has(t) && !QUESTION_WORDS.has(t) && !JUNK_NOUNS.has(t),
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
}

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
    // Try treating the entire input as a possible noun reference and suggest verbs
    const noun = resolveContextNoun(tokens.filter((t) => !STOPWORDS.has(t)), recentNouns);
    const item = resolveItem(tokens.filter((t) => !STOPWORDS.has(t)), inventory);
    const suggestions: string[] = [];
    // A noun that matches the player's current Location name (or any
    // substring of it) is a container, not a target — "use torch on
    // tartarian outskirts" reads as nonsense, and so does "use torch on
    // buried cities" when the location is "The Buried Cities" and the
    // ambient noun extractor picked up the bare phrase. Suppress
    // suggestions for any noun that is a substring of OR contains the
    // location name. Player can still TYPE the action and the handler
    // will respond; we just stop offering it as a default.
    const lowerLocation = (context.currentLocationName ?? '').toLowerCase();
    const lowerNoun = noun?.toLowerCase() ?? '';
    const nounIsLocation = !!(
      lowerNoun && lowerLocation && (
        lowerNoun === lowerLocation ||
        lowerLocation.includes(lowerNoun) ||
        lowerNoun.includes(lowerLocation)
      )
    );
    // 'use torch on X' only makes sense when the player actually has a
    // torch AND the noun isn't an enemy (you don't "use torch on a
    // goblin" — you attack it). Inspect is always safe.
    const hasTorch = (context.inventory ?? []).some(
      (i) => /torch/i.test(i.name) && i.quantity > 0,
    );
    const enemyNamesLower = (context.enemyNames ?? []).map((n) => n.toLowerCase());
    const nounIsEnemy = !!lowerNoun && enemyNamesLower.some(
      (n) => n.includes(lowerNoun) || lowerNoun.includes(n),
    );
    if (noun && !nounIsLocation) {
      suggestions.push(`inspect ${noun.toLowerCase()}`);
      if (hasTorch && !nounIsEnemy) {
        suggestions.push(`use torch on ${noun.toLowerCase()}`);
      }
    }
    if (item) suggestions.push(`use ${item.name.toLowerCase()}`);
    if (context.enemyPresent) suggestions.push('attack', 'block', 'advance', 'retreat', 'hide', 'parley');
    if (!suggestions.length) suggestions.push('look around', 'search', 'rest');
    return { intent: 'unknown', raw, normalized, confidence: 0.1, suggestions, resolvedNoun: noun };
  }

  const targetTokens = extractTargetTokens(tokens, bestMatch.index);
  const item = resolveItem(targetTokens, inventory);
  const noun = item ? undefined : resolveContextNoun(targetTokens, recentNouns);

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
