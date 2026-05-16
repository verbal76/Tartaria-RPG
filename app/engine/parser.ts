import type { Intent, ParsedInput, InventoryItem } from './types';

const VERB_SYNONYMS: Record<Exclude<Intent, 'unknown'>, string[]> = {
  stealth: ['hide', 'sneak', 'crawl', 'creep', 'lurk', 'crouch', 'silently', 'shadow', 'conceal', 'slink'],
  attack: [
    'attack', 'strike', 'slash', 'stab', 'shoot', 'hit', 'kill', 'fight', 'charge', 'fire',
    'swing', 'pierce', 'blast', 'smash', 'punch', 'cleave', 'loose', 'engage',
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
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
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

function extractTargetTokens(tokens: string[], verbIdx: number): string[] {
  const after = tokens.slice(verbIdx + 1);
  return after.filter((t) => !STOPWORDS.has(t));
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
    if (noun) suggestions.push(`inspect ${noun.toLowerCase()}`, `use torch on ${noun.toLowerCase()}`);
    if (item) suggestions.push(`use ${item.name.toLowerCase()}`);
    if (context.enemyPresent) suggestions.push('attack', 'hide', 'parley');
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
