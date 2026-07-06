// OTA-698/699 — parser support for the crystal-hook fix and the ambiguous-noun
// recency tiebreak.
//   • 'listen'/'hear' now map to the investigate intent (which is hook-eligible),
//     so "listen to the whispers" advances a whispering-crystal hook instead of
//     demoting to unknown.
//   • resolveContextNoun prefers the most-recently-interacted noun when several
//     scene nouns match the same ambiguous target ("the hatch" → the one you just
//     opened, not whichever is first in array order).

import { parseInput } from '../app/engine/parser';

describe('OTA-698 — sensory verbs route to investigate', () => {
  it('"listen to the whispers" is investigate (hook-eligible)', () => {
    expect(parseInput('listen to the whispers').intent).toBe('investigate');
  });
  it('"hear the crystal" is investigate', () => {
    expect(parseInput('hear the crystal').intent).toBe('investigate');
  });
});

describe('OTA-699 — ambiguous noun resolves by recency', () => {
  const recentNouns = ['drain hatch', 'observation hatch']; // drain is first in array order

  it('prefers the noun the player most recently interacted with', () => {
    const parsed = parseInput('look inside the hatch', {
      recentNouns,
      lastInteractedNoun: 'observation hatch',
    });
    expect(parsed.resolvedNoun).toBe('observation hatch');
  });

  it('falls back to array-order first-match when there is no recent noun', () => {
    const parsed = parseInput('look inside the hatch', { recentNouns });
    expect(parsed.resolvedNoun).toBe('drain hatch');
  });

  it('recency only breaks ties among ACTUAL matches (unrelated recent noun ignored)', () => {
    const parsed = parseInput('look inside the hatch', {
      recentNouns,
      lastInteractedNoun: 'core stabilizer', // not a hatch → no effect
    });
    expect(parsed.resolvedNoun).toBe('drain hatch');
  });
});
