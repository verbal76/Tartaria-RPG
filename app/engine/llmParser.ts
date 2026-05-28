// llmParser — Qwen-backed fallback when the dictionary parser can't
// resolve player input.
//
// The dictionary parser in parser.ts is fast (~5ms) and covers the
// common case: a verb in the recognised pool plus a target in the
// scene. It fails on novel phrasings ("take the trap apart", "use the
// rusted blade to whittle a stick", "I'd like to head over to the
// vendor") because every verb is in a hand-curated synonym list and
// every noun has to come from the extracted ambient pool.
//
// Rather than chase the long tail forever by appending more synonyms
// and more nouns (the treadmill the playtest has been documenting),
// we hand low-confidence input to the on-device Qwen 2.5 0.5B model
// with a structured prompt: "here is what the player said, here are
// the available intents, here are the scene's nouns — pick one of
// each, return JSON." We then re-phrase the player's input in a
// canonical verb-noun form and feed it BACK through the dictionary
// parser. The intent handlers in gameStore.ts never see the LLM —
// they only see clean parser output, exactly as if the player had
// typed "open the trap" in the first place.
//
// Cost on Pixel-class hardware: ~200-400ms for a 60-token completion
// at temperature 0.1. This only fires on the fallback path so the
// fast majority of actions stay sub-10ms.

import type { Intent } from './types';
import type { QwenGenerativeEngine } from '../ai/generation/QwenGenerativeEngine';

// Enumerated for the prompt + validation. Mirrors the Intent union in
// types.ts. 'unknown' is intentionally absent — the LLM should never
// return it; if it can't pick one we map to null and the caller falls
// back to the soft refusal flow.
const INTENT_LIST: Intent[] = [
  'stealth', 'attack', 'diplomacy', 'escape', 'investigate', 'rest',
  'inventory', 'travel', 'use_relic', 'cast', 'wait', 'ask', 'craft',
  'equip', 'gift', 'steal', 'join', 'dodge', 'block', 'advance',
  'retreat', 'repair', 'accept', 'turn_in', 'dig', 'throw', 'climb',
  'swim', 'jump', 'dash', 'disengage', 'help', 'ready', 'mount',
  'take_cover', 'aim', 'reload', 'maneuver', 'quick_fire', 'multi_fire',
  'fight_back', 'recruit', 'drop', 'pickup', 'open', 'fill',
  'dog_bite', 'dog_distract',
];

// Canonical verb to rephrase a resolved intent back into. The dictionary
// parser is guaranteed to match these as exact verbs (they all appear at
// position 0 in their respective VERB_SYNONYMS array). The rephrased
// string flows back through parseInput so all intent dispatch stays in
// one place.
const CANONICAL_VERB: Record<Intent, string> = {
  stealth: 'sneak',
  attack: 'attack',
  diplomacy: 'talk',
  escape: 'flee',
  investigate: 'search',
  rest: 'rest',
  inventory: 'inventory',
  travel: 'go',
  use_relic: 'use',
  cast: 'cast',
  wait: 'wait',
  ask: 'what',
  craft: 'craft',
  equip: 'equip',
  gift: 'give',
  steal: 'steal',
  join: 'join',
  dodge: 'dodge',
  block: 'block',
  advance: 'advance',
  retreat: 'retreat',
  repair: 'repair',
  accept: 'accept',
  turn_in: 'complete',
  dig: 'dig',
  throw: 'throw',
  climb: 'climb',
  swim: 'swim',
  jump: 'jump',
  dash: 'dash',
  disengage: 'disengage',
  help: 'help',
  ready: 'ready',
  mount: 'mount',
  take_cover: 'take cover',
  aim: 'aim',
  reload: 'reload',
  maneuver: 'maneuver',
  quick_fire: 'quick fire',
  multi_fire: 'burst fire',
  fight_back: 'counter',
  recruit: 'recruit',
  drop: 'drop',
  pickup: 'pick up',
  open: 'open',
  fill: 'fill',
  dog_bite: 'bite',
  dog_distract: 'distract',
  unknown: 'look',
};

export interface LLMParseContext {
  /** Hook nouns + extracted ambient nouns the scene has surfaced. */
  recentNouns: readonly string[];
  /** Names of enemies in the scene, if any. */
  enemyNames: readonly string[];
  /** Vendor name in the scene, if any. */
  vendorName?: string;
  /** Inventory item names the player carries. Helps the LLM resolve
   *  targets like "the blade" to the actual item. */
  inventoryNames: readonly string[];
  /** Macro location name — gives the LLM enough context to disambiguate
   *  "the hall" vs "the wagon" etc. */
  locationName?: string;
}

export interface LLMParseResult {
  /** The intent the LLM picked. Guaranteed to be a member of Intent
   *  (validated against INTENT_LIST before being returned). */
  intent: Intent;
  /** The target noun the LLM extracted. May be empty for intents like
   *  rest / wait that don't take a target. */
  target: string;
  /** A canonical verb-noun rephrasing of the player's input, ready to
   *  feed back through the dictionary parser. e.g. "open the trap" */
  rephrasing: string;
}

// Minimal Qwen interface used here so tests can pass a mock without
// dragging in the full LlamaRuntime / ModelDownloader stack.
export interface LLMParserEngine {
  isReady(): boolean;
  generate(messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    opts?: { maxNewTokens?: number; temperature?: number },
  ): Promise<string>;
}

/**
 * Hand the player's raw input to Qwen and ask it to pick an intent +
 * target from the scene's known nouns. Returns null if Qwen isn't ready,
 * the response can't be parsed, or the intent doesn't validate.
 *
 * Intentionally defensive — Qwen 0.5B is small and occasionally wraps
 * its JSON in markdown fences or adds a sentence of prose. We pull the
 * first {...} block out of the raw response and JSON.parse that.
 */
export async function parseInputViaLLM(
  text: string,
  ctx: LLMParseContext,
  qwen: LLMParserEngine,
): Promise<LLMParseResult | null> {
  if (!qwen.isReady()) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  // Build the noun pool the LLM picks targets from. Hooks + ambient
  // (passed as recentNouns) come first; enemy / vendor names join the
  // pool so the LLM can pick them as targets too.
  const nounPool = [
    ...ctx.enemyNames,
    ...(ctx.vendorName ? [ctx.vendorName] : []),
    ...ctx.recentNouns,
  ];
  const nounPoolLine = nounPool.length > 0
    ? nounPool.join(', ')
    : '(none — open ground)';

  const inventoryLine = ctx.inventoryNames.length > 0
    ? ctx.inventoryNames.slice(0, 12).join(', ')
    : '(empty)';

  const systemPrompt = [
    'You translate player input into JSON for a text RPG engine.',
    'Output ONLY a single JSON object on one line, no markdown, no prose:',
    '{"intent":"<intent>","target":"<noun or empty string>"}',
    '',
    'If the input is a comment, question about meta game design, or',
    'feedback to the developer, output {"intent":"none","target":""}.',
    '',
    'Available intents:',
    INTENT_LIST.join(', '),
    '',
    'Scene targets (pick from these or leave empty):',
    nounPoolLine,
    '',
    'Player inventory:',
    inventoryLine,
    '',
    ctx.locationName ? `Location: ${ctx.locationName}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = `Player input: "${trimmed}"`;

  let raw: string;
  try {
    raw = await qwen.generate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxNewTokens: 60, temperature: 0.1 },
    );
  } catch {
    return null;
  }

  const obj = extractJsonObject(raw);
  if (!obj) return null;

  const intentRaw = typeof obj.intent === 'string' ? obj.intent.trim() : '';
  if (!intentRaw || intentRaw === 'none' || intentRaw === 'unknown') return null;
  if (!INTENT_LIST.includes(intentRaw as Intent)) return null;
  const intent = intentRaw as Intent;

  const target = typeof obj.target === 'string' ? obj.target.trim() : '';

  const verb = CANONICAL_VERB[intent];
  const rephrasing = target
    ? `${verb} ${needsArticle(target) ? `the ${target}` : target}`
    : verb;

  return { intent, target, rephrasing };
}

/** Pull the first {...} block out of a possibly noisy LLM response and
 *  JSON.parse it. Returns null on any failure. */
function extractJsonObject(raw: string): { intent?: unknown; target?: unknown } | null {
  // Greedy capture — first { to last }. Handles markdown-fenced output
  // and trailing prose.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as { intent?: unknown; target?: unknown };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Heuristic — don't add "the" in front of pronouns / proper nouns /
 *  multi-word names that already read naturally. Keeps rephrasings
 *  like "talk Irma Ironhand" instead of "talk the Irma Ironhand". */
function needsArticle(target: string): boolean {
  const t = target.trim();
  if (!t) return false;
  // Already starts with an article / determiner.
  if (/^(the|a|an|my|your|this|that)\b/i.test(t)) return false;
  // Proper noun (first letter capitalised) — skip article.
  if (/^[A-Z]/.test(t)) return false;
  return true;
}

/** Exposed for tests + diagnostic surfaces. */
export const __TEST_ONLY__ = { INTENT_LIST, CANONICAL_VERB, extractJsonObject, needsArticle };
