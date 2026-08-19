// ⚠⚠ OTA-1289 — PORT OF GOLEM OTA-1277's VISITED MARKS, owner-directed: "is
// the ✓ really only applicable to golem? all that does is mark visited rooms,
// and we did the map overhaul there as well."
//
// He is right — the mark is three lines reading worldMemory.hubVisited, a
// memory THIS line already keeps, on room chips THIS line already draws.
// ⚠ The OTHER half of golem's OTA-1277 (gear auto-pick ranking: armorScore /
// upgradeEquipSlot in gatherSort.ts) has NO landing site here — that machinery
// is picker-trial code and does not exist on this line. Checked, not assumed:
// no gatherSort.ts, no upgradeEquipSlot anywhere. If the trial merges, the
// ranking arrives with it.
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1289 (port of golem OTA-1277 part 1) — the room buttons say where you have been', () => {
  it('⚠⚠ visited rooms carry a mark, unvisited do not', () => {
    const box = src('app', 'components', 'InputBox.tsx');
    expect(box).toContain('seen.has(targetId) ? `✓ ${name}` : name');
  });

  it('⚠⚠ it reads the SAME set beginScene earns — the mark cannot lie', () => {
    // If the dot used its own bookkeeping it would drift from what the game
    // believes you have seen. worldMemory.hubVisited is the one source.
    const box = src('app', 'components', 'InputBox.tsx');
    expect(box).toContain('const hubVisited = useGameStore((st) => st.worldMemory.hubVisited);');
    expect(box).toContain('const seen = new Set(hubVisited ?? []);');
    // ...and the memo re-runs when it changes, or the mark would go stale the
    // moment you walked into a new room.
    expect(box).toContain('}, [hubRoom, skinFactionId, hubVisited]);');
  });
});

