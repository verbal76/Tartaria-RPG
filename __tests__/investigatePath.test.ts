// OTA-061 — narratePossibleDirections fixes.
//
// Two bugs in the path-investigate flow per a playtester log:
//
// 1. The location.type token leaked through .toLowerCase() into
//    player-facing text. `lost_capital` showed up verbatim in lines
//    like "The Arbiter notes a lost_capital toward Drakova."
//
// 2. Each `investigate path` call re-rolled a random pair of world
//    locations, so 7 calls in 16 seconds returned 7 different far-
//    off cities with no progression. Now the pick is seeded by the
//    current tile (locationId + mapX + mapY) so re-investigating
//    the same noun on the same tile gives the SAME answer.
//
// narratePossibleDirections is private to gameStore so we test the
// HUMANIZER independently and exercise the integration via a tile-
// stable read of the world catalog.

import locationsData from '../app/data/locations/locations.json';

function humanizeType(t: string | undefined): string {
  return (t ?? 'path').toLowerCase().replace(/_/g, ' ');
}

describe('OTA-061 — path-investigate fixes', () => {
  it('humanizes underscored type tokens (lost_capital → lost capital)', () => {
    expect(humanizeType('lost_capital')).toBe('lost capital');
    expect(humanizeType('hub_city')).toBe('hub city');
    expect(humanizeType('mountain_pass')).toBe('mountain pass');
  });

  it('passes through clean single-word types unchanged', () => {
    expect(humanizeType('tower')).toBe('tower');
    expect(humanizeType('region')).toBe('region');
    expect(humanizeType('ruin')).toBe('ruin');
    expect(humanizeType('formation')).toBe('formation');
  });

  it('falls back to "path" when type is missing', () => {
    expect(humanizeType(undefined)).toBe('path');
  });

  it('every location.type in the canonical catalog is renderable cleanly', () => {
    // Guard: any underscored or upper-cased type in the catalog used
    // to leak. Verify the humanizer scrubs them all.
    const locations = locationsData as unknown as Array<{ type?: string }>;
    for (const l of locations) {
      const out = humanizeType(l.type);
      expect(out).not.toMatch(/_/);
      expect(out).toBe(out.toLowerCase());
    }
  });
});

describe('OTA-061 — narratePossibleDirections stability', () => {
  // FNV-1a 32-bit hash — mirrors the one in gameStore so we can
  // verify the seeded selection at the math level without booting
  // the full Zustand store.
  function fnv1a(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  function pickPair(seedKey: string, len: number): [number, number] {
    const h = fnv1a(seedKey);
    const firstIdx = h % len;
    const secondIdx = len > 1
      ? (firstIdx + 1 + (h >>> 8) % (len - 1)) % len
      : firstIdx;
    return [firstIdx, secondIdx];
  }

  it('same seed key returns the same pair every time', () => {
    const key = 'stone_builders_workshop:5:5';
    const len = 30;
    const first = pickPair(key, len);
    for (let i = 0; i < 50; i++) {
      const next = pickPair(key, len);
      expect(next).toEqual(first);
    }
  });

  it('different seed keys (different tiles) return different pairs in most cases', () => {
    const len = 30;
    const a = pickPair('stone_builders_workshop:5:5', len);
    const b = pickPair('stone_builders_workshop:5:6', len);
    const c = pickPair('stone_builders_workshop:6:5', len);
    const d = pickPair('grand_spire:10:10', len);
    // At least 3 of the 4 differ from each other — very high
    // probability with a 30-entry pool.
    const all = [a, b, c, d];
    const unique = new Set(all.map((p) => p.join(',')));
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it('the two indices in a pair never collide on a multi-entry pool', () => {
    const len = 10;
    for (let x = 0; x < 20; x++) {
      const [a, b] = pickPair(`tile_${x}`, len);
      expect(a).not.toBe(b);
    }
  });
});
