// Ambient noun extractor — pulls notable content tokens out of a scene
// description so the player can ask about / investigate / search them.
//
// Location.description writes like prose ("Littered with traps, dormant
// defenses, and clues") so we run a small heuristic that drops stopwords
// + adjectives-only-without-noun + verbs-only. What's left is roughly the
// set of things a player might point at and say "look at the X."
//
// This isn't NLP — it's a hand-tuned filter that's good enough for the
// existing 21 hand-written location descriptions in the data file.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'so', 'as', 'then',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto', 'over', 'under',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did',
  'it', 'its', 'they', 'them', 'their', 'we', 'us', 'you', 'your', 'i', 'me', 'my', 'our',
  'around', 'where', 'when', 'how', 'why', 'who', 'what', 'which',
  // common scene-narration filler that isn't worth surfacing as an interactable
  'place', 'places', 'thing', 'things', 'something', 'nothing', 'anything', 'everything',
  'one', 'two', 'many', 'few', 'some', 'any', 'no', 'all', 'most', 'more', 'less', 'much',
  'die', 'lived', 'live', 'living', 'died', 'dead',
  'new', 'old', 'still', 'never', 'always', 'often', 'sometimes',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'just', 'only', 'even', 'also', 'too',
  'reasonable', 'unreasonable',
]);

// Single-word phrases (after stopword filter) that ARE useful even though
// they look adjective-y — they get matched as standalone search targets.
const ALLOW_SHORT = new Set(['mud', 'ash', 'aether', 'cold', 'air', 'dust', 'stone', 'silt']);

// Pure-adjective blocklist. HANDOFF §5 #6 complaint: ambient noun extractor
// was offering "buried", "vast", "ancient" as searchable targets in scenes
// where those words were descriptors of the room, not things the player
// could interact with. These never carry an interaction in our data files
// and should not pollute the noun pool. Keep this list small — when in
// doubt, leave a word out and let the longer-token / -ed/-ing filter catch
// it.
const ADJECTIVE_BLOCKLIST = new Set([
  'vast', 'ancient', 'great', 'small', 'old', 'new', 'dark', 'bright',
  'cold', 'hot', 'wet', 'dry', 'soft', 'hard', 'sharp', 'dull',
  'fast', 'slow', 'long', 'short', 'tall', 'deep', 'wide', 'narrow',
  'thick', 'thin', 'big', 'little', 'grand', 'lost',
  // Tartaria-specific adjectives that show up constantly in flavor text but
  // are never targets of player action. Note 'aether' itself stays in
  // ALLOW_SHORT — it IS a valid concept query.
  'aetheric', 'etheric',
]);

// Verb / non-noun blocklist — sim Cartographer/Scavenger run surfaced
// "look", "inspect", "after", "left" as ambient nouns the engine
// extracted from prose like "Two Monarch overseers look on" or
// "left behind in the ash". The extractor was missing a verb pass —
// these tokens are never targets the player can interact with as
// objects. Keep this list focused on tokens that have shown up as
// false positives; add more only when a new false positive appears.
const VERB_BLOCKLIST = new Set([
  // sight / investigation verbs
  'look', 'looks', 'looking', 'looked',
  'see', 'sees', 'seen', 'saw',
  'watch', 'watches', 'watching', 'watched',
  'glance', 'glances', 'glanced',
  'inspect', 'inspects', 'inspected',
  'examine', 'examines', 'examined',
  'search', 'searches', 'searched',
  'investigate', 'investigates', 'investigated',
  // manipulation verbs that look like nouns at a glance
  'open', 'opens', 'opened',
  'close', 'closes', 'closed',
  'take', 'takes', 'took', 'taken',
  'drop', 'drops', 'dropped',
  'use', 'uses', 'used',
  // movement verbs (the past tense of "leave" is "left" which the
  // extractor can't distinguish from the noun/direction "left")
  'leave', 'leaves', 'leaving', 'left',
  'go', 'goes', 'went', 'gone',
  'come', 'comes', 'came', 'coming',
  'run', 'runs', 'ran', 'running',
  // positional / temporal — not nouns
  'after', 'before', 'during', 'while', 'until',
  'right', // direction word; if "right" is a noun in lore we revisit
  'here', 'there', 'now', 'soon', 'later',
  // stative
  'remains', 'remain', 'remained', 'remaining',
  'stays', 'stayed', 'staying',
  // social / dialogue verbs and intangibles — playtest screenshot
  // surfaced "negotiate / wind / words / voice / carries" as chip
  // suggestions, pulled out of Arbiter refusal prose ("No one to
  // negotiate with. The wind takes the words. Your voice carries
  // across empty ground"). None are physical objects the player can
  // approach or search.
  'negotiate', 'negotiates', 'negotiated', 'negotiating',
  'speak', 'speaks', 'spoke', 'spoken', 'speaking',
  'talk', 'talks', 'talked', 'talking',
  'ask', 'asks', 'asked', 'asking',
  'say', 'says', 'said', 'saying',
  'carry', 'carries', 'carried', 'carrying',
  'words', 'voice', 'voices', 'wind', 'winds',
  'sound', 'sounds', 'echo', 'echoes',
  // Abstract state / measurement words — playtest report: search /
  // approach chips were surfacing things like "states", "repair",
  // "back", "various", "amount" pulled from hub-room descriptions
  // ("bolt-casters in various states of repair", "anvil rings from
  // the back"). None of these are physical interactables.
  'state', 'states', 'condition', 'conditions',
  'repair', 'repairs', 'amount', 'amounts',
  'number', 'numbers', 'rate', 'rates',
  'top', 'bottom', 'middle', 'edge', 'edges',
  'front', 'back', 'sides',
  'time', 'times', 'while', 'awhile',
  'rest', 'all', 'half', 'most', 'least',
  'such', 'kind', 'kinds', 'sort', 'sorts', 'type', 'types',
  'work', 'works', 'job', 'jobs',
  'note', 'notes', 'thing', 'things',
  'space', 'spaces', 'room', 'rooms',
  // Generic body-language verbs that look noun-y after participle pass
  'rings',     // "anvil rings from the back" — verb not noun
  'turns',     // "turns blue", "turns to ash"
  'leans',     // "leans in"
  'closes', 'opens',
]);

// Strip -ed / -ing tokens — almost always participles ("buried", "humming",
// "charged"). Some real nouns end in these suffixes ("ring", "string",
// "string") but those are too short to clear the length gate on line 70.
function looksLikeParticiple(token: string): boolean {
  if (token.length < 5) return false; // "ring" / "sing" etc. are too short anyway
  return token.endsWith('ed') || token.endsWith('ing');
}

// Multi-word phrases worth treating as a unit. The extractor scans for
// these BEFORE the word-level pass so they don't get split apart.
const MULTI_WORD_PHRASES = [
  'buried cities', 'buried capital', 'buried capitals',
  'dormant defenses', 'dormant defences', 'dormant traps',
  'mud seas', 'mud flood', 'great tartary',
  'lost capitals', 'lost city', 'lost cities',
  'aether grid', 'aether grids',
  'aetheric haze', 'aetheric dust', 'aetheric storm',
  'red tower', 'grand spire',
  'obsidian pillars', 'obsidian pillar',
  'tartarian ruins', 'tartarian relic', 'tartarian relics',
  'mud-glass', 'mud glass',
];

export function extractAmbientNouns(description: string | undefined | null): string[] {
  if (!description) return [];
  const lower = description.toLowerCase();
  const out = new Set<string>();

  // First pass: multi-word phrases.
  for (const p of MULTI_WORD_PHRASES) {
    if (lower.includes(p)) out.add(p);
  }

  // Second pass: single-word tokens.
  const tokens = lower
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const raw of tokens) {
    const t = raw.replace(/^[-']+|[-']+$/g, '');
    if (!t) continue;
    if (STOPWORDS.has(t)) continue;
    // Words ending in -ly are adverbs, drop them.
    if (t.length > 3 && t.endsWith('ly')) continue;
    // Pure adjectives — never interactable, just descriptors.
    if (ADJECTIVE_BLOCKLIST.has(t)) continue;
    // Verbs / positional words that look noun-y. Sim caught "look",
    // "inspect", "after", "left" leaking into the noun pool.
    if (VERB_BLOCKLIST.has(t)) continue;
    // Participles ("buried", "humming", "charged") — descriptors, not
    // things you can investigate or search.
    if (looksLikeParticiple(t)) continue;
    // Numbers / short tokens — keep only if explicitly allowlisted.
    if (t.length < 4 && !ALLOW_SHORT.has(t)) continue;
    out.add(t);
  }

  return Array.from(out);
}

// Does the player's typed target reference one of the ambient nouns in
// the scene? Returns the canonical ambient noun on match (so the narrator
// can name it back the way the description names it), or null.
export function matchAmbientNoun(target: string, ambient: readonly string[]): string | null {
  const t = target.toLowerCase().trim();
  if (!t) return null;
  // OTA 014 — Two-pass match. The previous version was
  // bidirectional substring (t.includes(n) || n.includes(t)) which
  // was too greedy: typing "wall" in a scene with both "wall" and
  // "stone wall" would land on the LONGER first ("stone wall") via
  // `n.includes(t)` and then never let the player target plain
  // "wall" as a distinct noun. Now we prefer exact matches, then
  // target-contains-noun (typed broader than canonical), then fall
  // back to noun-contains-target (typed narrower / abbreviation) —
  // but only when the target is at least 3 chars to avoid "ow"
  // matching "shadow" etc.
  const sorted = [...ambient].sort((a, b) => b.length - a.length);
  // Pass 1: exact match.
  for (const noun of sorted) {
    if (noun.toLowerCase() === t) return noun;
  }
  // Pass 2: target contains the noun ("the wall" → "wall").
  for (const noun of sorted) {
    const n = noun.toLowerCase();
    if (t.includes(n)) return noun;
  }
  // Pass 3: noun contains the target — only when target is
  // meaningfully long (3+ chars) so common short words don't
  // accidentally match longer nouns.
  if (t.length >= 3) {
    for (const noun of sorted) {
      const n = noun.toLowerCase();
      if (n.includes(t)) return noun;
    }
  }
  return null;
}
