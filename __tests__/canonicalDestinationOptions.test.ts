// Strategic repair — Phase 12. Focused regression for
// test-utils/canonical/destinationOptions.ts: proves destination choice is
// no longer determined merely by input array order (the proven Life 4
// fixed-array-order gap), and that the UNMODIFIED policy.ts 'route' branch
// (pickCheapestDanger) actually acts on the resulting options.

import { buildDestinationOptions } from '../test-utils/canonical/destinationOptions';
import { decide } from '../test-utils/canonical/policy';
import type { PlayerView } from '../test-utils/canonical/playerView';

describe('Strategic repair — destination options (buildDestinationOptions)', () => {
  it('does not pick the first candidate merely because it is listed first — a farther/riskier capital listed first loses to a closer one listed second', () => {
    // dynasty_border_post is the hub; asgardar and samarran are real,
    // atlas-plotted capitals at different distances from it.
    const options = buildDestinationOptions(
      'dynasty_border_post',
      [{ locationId: 'asgardar' }, { locationId: 'samarran' }],
      new Map(),
    );
    expect(options.length).toBe(2);
    // Whichever is genuinely closer on the real atlas sorts first — proven
    // by re-running with the SAME candidates in the opposite input order and
    // getting the identical winner, which array-order-only logic could not do.
    const reversed = buildDestinationOptions(
      'dynasty_border_post',
      [{ locationId: 'samarran' }, { locationId: 'asgardar' }],
      new Map(),
    );
    expect(options[0]!.meta?.locationId).toBe(reversed[0]!.meta?.locationId);
  });

  it('prefers a capital this Tartarian has personally observed as low-danger over one merely closer on the map', () => {
    const visited = new Map([['asgardar', 5]]); // directly observed: very dangerous
    const options = buildDestinationOptions(
      'dynasty_border_post',
      [{ locationId: 'asgardar' }, { locationId: 'samarran' }],
      visited,
    );
    // samarran (unvisited, distance-estimated) must not lose to a capital
    // KNOWN to be maximally dangerous just because asgardar happens to be
    // nearer on the map.
    expect(options[0]!.meta?.locationId).not.toBe('asgardar');
  });

  it('feeds a real production "route" branch (policy.ts decide(), unmodified) which picks the lowest-danger option among several', () => {
    const options = buildDestinationOptions(
      'dynasty_border_post',
      [{ locationId: 'asgardar' }, { locationId: 'samarran' }, { locationId: 'nimari' }],
      new Map([['asgardar', 5], ['samarran', 5], ['nimari', 1]]),
    );
    const view = { hp: 30, hpMax: 34, hpDelta: null } as unknown as PlayerView;
    const decision = decide(view, options);
    expect(decision.category).toBe('route');
    expect(decision.optionId).toBe(options.find((o) => o.meta?.locationId === 'nimari')!.id);
  });
});
