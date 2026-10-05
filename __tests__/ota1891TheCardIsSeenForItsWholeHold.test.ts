// OTA-1891 — the identity of this release. Behaviour is pinned in studioSplash.test.tsx
// ("the card is seen for its whole 2.5 s even when boot work blocks the JS thread" and
// "order: studio card → update check → Tartaria splash").
import { OTA_BUILD_ID } from '../app/buildInfo';

describe('OTA-1891 identity', () => {
  it('the stamp names this OTA', () => {
    expect(OTA_BUILD_ID).toBe('2026-10-05-1891-the-card-is-seen-for-its-whole-hold');
  });
});
