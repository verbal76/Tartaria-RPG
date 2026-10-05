// OTA-1890 — Iteration 8. What this OTA is, pinned where the next reader will look.
//
// The behaviour of each piece is covered by its own suite (studioSplash, otaApplyingPopup, aboutIsForHumans,
// sourceShaEmbedding, i055RoadDoorHuntReach, greatClimbGateEveryRace, i010HealBatchTrueNoOp,
// ambientRotationIsReal). This one pins the IDENTITY of the release: the stamp, and that the canonical
// artwork the stamp promises is the file that ships.
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { OTA_BUILD_ID } from '../app/buildInfo';

const root = join(__dirname, '..');

describe('OTA-1890 identity', () => {
  it('the stamp is this OTA or a later one (OTA-1891 superseded it)', () => {
    expect(OTA_BUILD_ID).toMatch(/^2026-10-0[45]-189[01]-/);
  });

  it('ships the canonical studio artwork, byte for byte, at the repository root', () => {
    const f = join(root, 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
    expect(existsSync(f)).toBe(true);
    expect(createHash('sha256').update(readFileSync(f)).digest('hex'))
      .toBe('e3d9bb5653eafb783eede827606e7ac73a4e45564a1c25b1ed13ad1429f48c4e');
  });

  it('the public version is the one number a player reads, and is not the OTA stamp', () => {
    const pv = JSON.parse(readFileSync(join(root, 'release', 'public-version.json'), 'utf8')) as { version: number };
    expect(Number.isInteger(pv.version)).toBe(true);
    expect(OTA_BUILD_ID).not.toContain(String(pv.version));
  });
});
