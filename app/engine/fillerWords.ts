// Common English descriptors that show up in player input but don't
// help noun/item resolution. The parser combines these with STOPWORDS
// when tokenising a target phrase so "use the small torch" /
// "carefully open the dirty lockbox" / "approach the friendly figure"
// all resolve the actual noun without the descriptor throwing off the
// match.
//
// IMPORTANT: words that could collide with game-meaningful state are
// deliberately NOT in these sets — they stay live in `parsed.target`
// for the action handler to interpret. Excluded on purpose:
//   - old / new / modern / ancient   (lore-relevant: "ancient relic")
//   - hot / cold / warm / cool       (weather + hazard refs)
//   - dark / bright                  (light state)
//   - heavy / light                  (weight tag — "heavy armor")
//   - strong / weak                  (durability / signal)
//   - large / small / tall / short   (size matters in some checks)
//   - fast / slow                    (speed traits)
//   - loud / quiet                   (stealth + ambient)
//   - safe / dangerous               (hazard state)
//   - clean / dirty                  (state-relevant)
//   - full / empty                   (container state)
//   - expensive / cheap              (vendor pricing)
//
// Everything below is mood/quality/temporal flavour that the resolver
// can safely ignore.

export const DESCRIPTOR_ADJECTIVES = new Set([
  // mood + quality + behavior — pure flavour
  'beautiful', 'ugly', 'happy', 'sad', 'angry', 'calm', 'brave',
  'careful', 'smart', 'clever', 'kind', 'rude', 'friendly', 'helpful',
  'honest', 'polite', 'professional', 'messy', 'organized', 'busy',
]);

export const DESCRIPTOR_ADVERBS = new Set([
  // frequency
  'really', 'always', 'never', 'often', 'usually', 'sometimes',
  'rarely', 'frequently', 'occasionally',
  // cadence
  'daily', 'weekly', 'monthly', 'yearly',
  // temporal
  'now', 'soon', 'later', 'early', 'late', 'already', 'yet', 'still',
  'again', 'finally', 'immediately',
  // manner
  'quickly', 'slowly', 'carefully', 'easily',
  // degree
  'hardly', 'barely', 'nearly', 'almost', 'exactly', 'completely',
  'partially', 'fully', 'mostly', 'generally', 'normally', 'typically',
  // certainty
  'certainly', 'definitely', 'probably', 'maybe', 'perhaps', 'truly',
  'honestly', 'seriously', 'luckily', 'unfortunately',
]);

/** Combined set for parser filtering. Cached at module load. */
export const FILLER_DESCRIPTORS: ReadonlySet<string> = new Set([
  ...DESCRIPTOR_ADJECTIVES,
  ...DESCRIPTOR_ADVERBS,
]);
