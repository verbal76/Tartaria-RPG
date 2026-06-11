// arb99 — numbered "?" markers. A lone "?" stays un-numbered; two or more get
// ascending numbers in spatial reading order (top→bottom, left→right); resolved
// "X" (done) events don't count. The map overlay and the route rows both read
// this one helper, so a mark and its row always carry the same number.

import { questionMarkerNumbers, questionMarkerPlaces } from '../app/engine/questionMarkers';
import { canonicalCellOf } from '../app/engine/worldMap';
import type { WorldMemory } from '../app/engine/types';

function wm(over: Partial<WorldMemory>): WorldMemory {
  return { discoveredLocationIds: [], canonLocations: [], ...over } as WorldMemory;
}

describe('questionMarkerNumbers', () => {
  it('a lone "?" (only the unrevealed Hidden Market) gets NO number', () => {
    const numbers = questionMarkerNumbers(wm({}));
    expect(numbers).toEqual({});
    // …but it is still a "?" place.
    expect(questionMarkerPlaces(wm({})).map((p) => p.id)).toEqual(['hidden_market']);
  });

  it('the Hidden Market + a pending event get ascending numbers in spatial order', () => {
    const market = canonicalCellOf('hidden_market'); // (47,15)
    // Put the event ABOVE the market (smaller y) so it numbers first.
    const numbers = questionMarkerNumbers(wm({
      canonLocations: [
        { id: 'mention_a', name: 'A', gx: market.x, gy: market.y - 5, marker: 'pending' },
      ] as never,
    }));
    expect(numbers.mention_a).toBe(1);
    expect(numbers.hidden_market).toBe(2);
  });

  it('numbers three pending "?" places 1/2/3 top-to-bottom and excludes done events', () => {
    const numbers = questionMarkerNumbers(wm({
      // Hidden Market revealed → not a "?" anymore.
      discoveredLocationIds: ['hidden_market'],
      canonLocations: [
        { id: 'low', name: 'low', gx: 10, gy: 30, marker: 'pending' },
        { id: 'high', name: 'high', gx: 10, gy: 5, marker: 'pending' },
        { id: 'mid', name: 'mid', gx: 10, gy: 18, marker: 'pending' },
        { id: 'finished', name: 'finished', gx: 10, gy: 1, marker: 'done' },
      ] as never,
    }));
    expect(numbers).toEqual({ high: 1, mid: 2, low: 3 });
    expect(numbers.finished).toBeUndefined();
  });

  it('ties on y break by x (left first), then id', () => {
    const numbers = questionMarkerNumbers(wm({
      discoveredLocationIds: ['hidden_market'],
      canonLocations: [
        { id: 'right', name: 'right', gx: 40, gy: 12, marker: 'pending' },
        { id: 'left', name: 'left', gx: 8, gy: 12, marker: 'pending' },
      ] as never,
    }));
    expect(numbers).toEqual({ left: 1, right: 2 });
  });
});
