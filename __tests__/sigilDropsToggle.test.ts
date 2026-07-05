// OTA-984 — engine_Dev pack option to turn OFF faction sigil (pendant) drops.
// Mirrors the dogEnabled/weatherEnabled toggle pattern: a top-level
// "sigilDropsEnabled": false in the game JSON disables the drops. The turn-in
// mechanic itself is unaffected (works whenever a sigil exists).

import { isSigilDropsEnabled, setSigilDropsEnabled } from '../app/engine/contentPack';

describe('sigilDrops pack toggle (OTA-984)', () => {
  afterEach(() => setSigilDropsEnabled(true)); // restore default

  it('defaults ON', () => {
    expect(isSigilDropsEnabled()).toBe(true);
  });

  it('false disables the drops', () => {
    setSigilDropsEnabled(false);
    expect(isSigilDropsEnabled()).toBe(false);
  });

  it('any non-false value keeps it ON (absent → on semantics)', () => {
    setSigilDropsEnabled(undefined as unknown as boolean);
    expect(isSigilDropsEnabled()).toBe(true);
    setSigilDropsEnabled(true);
    expect(isSigilDropsEnabled()).toBe(true);
  });
});
