import type { Intent, ParsedInput, InventoryItem } from './types';
import { levenshtein } from './editDistance';

const VERB_SYNONYMS: Record<Exclude<Intent, 'unknown'>, string[]> = {
  stealth: ['hide', 'sneak', 'crawl', 'creep', 'lurk', 'crouch', 'silently', 'shadow', 'conceal', 'slink'],
  attack: [
    'attack', 'strike', 'slash', 'stab', 'shoot', 'hit', 'kill', 'fight', 'charge', 'fire',
    'swing', 'pierce', 'blast', 'smash', 'punch', 'kick', 'cleave', 'loose', 'engage',
  ],
  diplomacy: ['convince', 'persuade', 'negotiate', 'parley', 'bargain', 'plead', 'speak', 'talk', 'ask', 'greet'],
  escape: ['run', 'flee', 'retreat', 'escape', 'withdraw', 'bolt', 'dash', 'fall back'],
  investigate: [
    'look', 'examine', 'inspect', 'search', 'study', 'check', 'investigate', 'scan',
    'observe', 'view', 'read', 'open', 'probe', 'survey', 'find', 'scavenge', 'hunt',
  ],
  rest: ['rest', 'sleep', 'recover', 'camp', 'heal', 'eat', 'consume', 'devour', 'drink'],
  inventory: ['inventory', 'pack', 'bag', 'gear', 'items', 'supplies', 'stuff'],
  travel: ['go', 'travel', 'walk', 'head', 'move', 'journey', 'enter', 'descend', 'climb', 'wander', 'follow'],
  use_relic: ['use', 'activate', 'invoke', 'apply', 'wield', 'shine', 'light', 'channel through'],
  cast: ['cast', 'channel', 'mold', 'shape', 'unleash', 'weave'],
  wait: ['wait', 'stay', 'hold', 'pause', 'still', 'linger'],
  ask: ['what', 'explain', 'define', 'who', 'how', 'why', 'tell'],
  craft: ['craft', 'make', 'forge', 'fashion', 'build', 'assemble'],
  equip: ['equip', 'wear', 'wield', 'don', 'unequip', 'remove', 'sheathe'],
  gift: ['gift', 'give', 'offer', 'present', 'hand'],
  steal: ['steal', 'pocket', 'pilfer', 'lift', 'pinch', 'swipe'],
  join: ['join', 'enlist', 'pledge', 'swear', 'sign'],
  dodge: ['dodge', 'evade', 'sidestep', 'duck'],
  block: ['block', 'parry', 'deflect', 'shield', 'brace', 'guard'],
  advance: ['advance', 'approach', 'rush', 'sprint', 'closein'],
  retreat: ['backoff', 'backaway', 'pullback', 'stepback', 'reposition'],
  repair: ['repair', 'mend', 'restore', 'refurbish', 'patch'],
  accept: ['accept', 'take', 'undertake', 'agree'],
  turn_in: ['turnin', 'complete', 'finish', 'deliver', 'report', 'redeem', 'claim'],
  dig: ['dig', 'excavate', 'unearth', 'scrape', 'shovel', 'burrow'],
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
    .replace(/[^a-z0-9\s']/g, ' ')
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

function extractTargetTokens(tokens: string[], verbIdx: number): string[] {
  const after = tokens.slice(verbIdx + 1);
  return after.filter((t) => !STOPWORDS.has(t) && !QUESTION_WORDS.has(t));
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
    if (noun && !nounIsLocation) {
      suggestions.push(`inspect ${noun.toLowerCase()}`, `use torch on ${noun.toLowerCase()}`);
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
