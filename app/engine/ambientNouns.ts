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
  // Prefer longest match so "buried cities" beats "cities".
  const sorted = [...ambient].sort((a, b) => b.length - a.length);
  for (const noun of sorted) {
    if (t.includes(noun) || noun.includes(t)) return noun;
  }
  return null;
}
