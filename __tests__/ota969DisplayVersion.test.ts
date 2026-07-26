// OTA-969 — the game-version tracker (DISPLAY_VERSION) is live again. Owner:
// "it's just what we consider knowledge to give somebody... let's reactivate
// it and catch it up." It froze at 4.1.0 (OTA-602); the catch-up replayed 27
// feature waves -> 4.28.3 (ledger in VERSION.md). These locks make sure the
// constant stays a real semver, never regresses to the frozen value, and that
// the About surface still reads THIS constant (not app.json's pinned native
// version, which must stay 2.4.1 for OTA delivery).
import { DISPLAY_VERSION } from '../app/buildInfo';

describe('OTA-969 — the reactivated game-version tracker', () => {
  it('DISPLAY_VERSION is a real MAJOR.MINOR.PATCH semver', () => {
    expect(DISPLAY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is no longer the frozen 4.1.0 and never goes backwards past the catch-up', () => {
    const [maj, min, pat] = DISPLAY_VERSION.split('.').map(Number) as [number, number, number];
    expect(DISPLAY_VERSION).not.toBe('4.1.0');
    // Numeric floor: >= 4.28.3 (string compare would call 4.9 > 4.28).
    const atLeast = maj > 4 || (maj === 4 && (min > 28 || (min === 28 && pat >= 3)));
    expect(atLeast).toBe(true);
  });
});
