// ⚠ OTA-1334 — THE ONE-TIME "THE SPIRE MOVED" NOTICE, FOR LEGACY SAVES ONLY.
//
// The map makeover gave the Grand Spire of Asgardar its own atlas tile on the
// capital's outskirts (owner: "move asgardars tower to the outskirts as
// discussed"). A save that charted that climb BEFORE the move learned the tower
// as "inside Asgardar" — at its next load, the world tells it once where the
// tower now stands. The rules this pins:
//   - a FRESH character is stamped spireMoveNoticeShown: true at creation — they
//     chart the tower where it now stands and must never see the notice;
//   - the load migration defaults a legacy save (field absent) to false — eligible;
//   - the line fires only for an eligible save that actually HOLDS the chart
//     (unlockedGreatClimbs includes asgardar_spire), and names the outskirts;
//   - once shown (flag true), it never returns again.
import { emptyMemory, spireMoveNoticeLine } from '../app/engine/worldMemory';
import type { WorldMemory } from '../app/engine/types';

describe('OTA-1334 — the Asgardar spire relocation notice', () => {
  const legacyCharted = (): WorldMemory => ({
    ...emptyMemory(),
    spireMoveNoticeShown: false,
    unlockedGreatClimbs: ['asgardar_spire'],
  });

  it('⚠ a fresh character is born with the notice already spent', () => {
    expect(emptyMemory().spireMoveNoticeShown).toBe(true);
    expect(spireMoveNoticeLine(emptyMemory())).toBeNull();
  });

  it('⚠⚠ a legacy save that charted the climb gets the line — and it says where the tower went', () => {
    const line = spireMoveNoticeLine(legacyCharted());
    expect(line).not.toBeNull();
    expect(line).toContain('Grand Spire of Asgardar');
    expect(line).toContain('outskirts');
    // It must also point at the recovery path — the chart still works.
    expect(line).toContain('TRAVEL');
  });

  it('⚠ no chart, no notice — a legacy save that never bought the map has nothing to relearn', () => {
    const wm = { ...legacyCharted(), unlockedGreatClimbs: [] };
    expect(spireMoveNoticeLine(wm)).toBeNull();
    const wmOther = { ...legacyCharted(), unlockedGreatClimbs: ['nimari_red_tower'] };
    expect(spireMoveNoticeLine(wmOther)).toBeNull();
  });

  it('⚠ once shown, never again', () => {
    const wm = { ...legacyCharted(), spireMoveNoticeShown: true };
    expect(spireMoveNoticeLine(wm)).toBeNull();
  });
});
