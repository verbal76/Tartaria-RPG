// OTA-971 — the SALVAGE button lied from a pillar: it glowed green while the
// engine refused every ground salvage ("The shelf is down there. Climb down to
// reach it."). The button tone and the salvage picker now run the scene nouns
// through reachableWhileElevated — the engine's elevated-investigate gate rule
// as a pure, shared filter — so the UI and the engine can't disagree again.
import { reachableWhileElevated, sameClimbNoun } from '../app/engine/climbHeight';

describe('OTA-971 — reachableWhileElevated mirrors the engine elevation gate', () => {
  const NOUNS = ['shelf', 'shore', 'research chart', 'stone pillar'];

  it('up on a pillar with no overlay: only the climbed noun survives', () => {
    expect(reachableWhileElevated(NOUNS, 'pillar', false)).toEqual(['stone pillar']);
  });

  it('up on something with NO matching scene noun: nothing survives (button greys)', () => {
    expect(reachableWhileElevated(['shelf', 'shore'], 'pillar', false)).toEqual([]);
  });

  it('on the ground (no elevation): everything is reachable', () => {
    expect(reachableWhileElevated(NOUNS, null, false)).toEqual(NOUNS);
    expect(reachableWhileElevated(NOUNS, undefined, false)).toEqual(NOUNS);
  });

  it('rooftop overlay active: overlay nouns pass through untouched', () => {
    expect(reachableWhileElevated(NOUNS, 'pillar', true)).toEqual(NOUNS);
  });

  it('head-noun anchoring holds: "pillar" reaches "stone pillar" but not mid-phrase forms', () => {
    expect(sameClimbNoun('stone pillar', 'pillar')).toBe(true);
    expect(sameClimbNoun('pillar capacitor', 'pillar')).toBe(false);
    expect(reachableWhileElevated(['pillar capacitor'], 'pillar', false)).toEqual([]);
  });
});
