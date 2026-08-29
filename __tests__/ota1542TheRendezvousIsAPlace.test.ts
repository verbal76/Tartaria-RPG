/**
 * OTA-1542 — THE RENDEZVOUS IS A PLACE, NOT A PAIR OF FRAME COORDINATES.
 *
 * Owner: *"not only was this broken because yulka wasn't there, I'm still
 * trying to figure out if this was the whisper promised by Nix"* — two defects
 * in one sentence, and the first is OTA-1541's disease in a second organ.
 *
 * ⚠⚠⚠ YULKA'S CAMP WAS STORED IN THE FRAME IT WAS PROMISED IN. Whisper targets
 * lived in `targetMapX/targetMapY` — coordinates on a map travelToLocation
 * RECENTERS at every named arrival — and were matched against the player's
 * CURRENT frame coords. His whisper was granted by Nix ON THE ROAD, so the
 * plant frame died at his very next arrival; by the hunt, the stored pair
 * denoted different dirt and no tile he could stand on was Yulka's. The pin
 * even said "south of the outpost" — the chain's Mess-overheard copy — when the
 * camp was offset from where NIX stood. He searched the right words in the
 * wrong world.
 *
 * ⚠⚠⚠ NO MIGRATION IS NEEDED, BECAUSE EVERY OLD RECORD NAMES ITS OWN FRAME.
 * `targetLocationId` is the location the map was centered on at plant time, so
 * `canonCell(targetLocationId) + (targetMap − CENTER)` recovers the absolute
 * cell EXACTLY — the same playerGridCell fallback formula OTA-1541 leaned on.
 * New plants stamp `targetGridX/Y` outright; every reader prefers them and
 * falls back losslessly. The thief sub-tile, the course target, the Contracts
 * SET COURSE button, the travel-row distance badge (whose own comment records
 * this class's symptom: "the badge jumped 23 → 2 → 26") — all converted to the
 * absolute grid.
 *
 * ⚠⚠ AND THE RECORD NOW SAYS WHO SENT YOU. `source` is stamped at the persuade
 * plant ("Nix") and the panel copy names it — the owner should never have to
 * reverse-engineer his own contract list to know which promise he is walking
 * down.
 */
import {
  findReadyMeetWhisper,
  findReadyFetchWhisper,
  findReadyReturnWhisper,
  whisperTargetGrid,
  whisperThiefGrid,
  whisperRouteTarget,
  describeWhisperStage,
} from '../app/engine/whispers';
import { canonicalCellOf, WORLD_MAP_CENTER_X as CX, WORLD_MAP_CENTER_Y as CY } from '../app/engine/worldMap';
import type { WhisperRecord } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

/** A legacy record, exactly as every pre-1542 save stores one: frame coords
 *  plus the location the frame was centered on. */
const legacy = (over: Partial<WhisperRecord> = {}): WhisperRecord => ({
  id: 'yulka_discs',
  stage: 'planted',
  plantedAtHour: 0,
  targetMapX: CX + 1,
  targetMapY: CY - 2,
  targetLocationId: 'reclaimer_stake',
  activeFromHour: 20,
  activeToHour: 4,
  ...over,
});

describe('OTA-1542 — the target cell is absolute, however the record was written', () => {
  it('⚠⚠⚠ an old record\'s cell is recovered EXACTLY through its own plant frame', () => {
    const c = canonicalCellOf('reclaimer_stake');
    expect(whisperTargetGrid(legacy())).toEqual({ x: c.x + 1, y: c.y - 2 });
  });

  it('⚠⚠⚠ a new record\'s stamped cell wins over its frame coords outright', () => {
    const w = legacy({ targetGridX: 77, targetGridY: -3 });
    expect(whisperTargetGrid(w)).toEqual({ x: 77, y: -3 });
  });

  it('⚠⚠⚠ THE HUNT: Yulka is found from ANY frame, at 10pm, on her actual tile', () => {
    // The reported failure. The player stands on the camp's absolute cell —
    // it no longer matters which named arrivals happened since the plant,
    // because the matcher compares place against place.
    const c = canonicalCellOf('reclaimer_stake');
    const camp = { x: c.x + 1, y: c.y - 2 };
    const found = findReadyMeetWhisper([legacy()], 22, camp.x, camp.y);
    expect(found?.id).toBe('yulka_discs');
    // …and one tile off is still one tile off.
    expect(findReadyMeetWhisper([legacy()], 22, camp.x + 1, camp.y)).toBeNull();
  });

  it('⚠⚠ the after-dark window still gates the meet', () => {
    const c = canonicalCellOf('reclaimer_stake');
    const camp = { x: c.x + 1, y: c.y - 2 };
    expect(findReadyMeetWhisper([legacy()], 12, camp.x, camp.y)).toBeNull(); // noon
    expect(findReadyMeetWhisper([legacy()], 26, camp.x, camp.y)?.id).toBe('yulka_discs'); // 2am
  });

  it('⚠⚠ the thief tile converts through the same frame, exactly', () => {
    // Old ctx coords were minted as targetMapX + offset in the plant frame.
    const c = canonicalCellOf('reclaimer_stake');
    const w = legacy({ stage: 'fetch_active', ctx: { thiefMapX: CX + 4, thiefMapY: CY - 2 } });
    expect(whisperThiefGrid(w)).toEqual({ x: c.x + 4, y: c.y - 2 });
    expect(findReadyFetchWhisper([w], c.x + 4, c.y - 2)?.id).toBe('yulka_discs');
    // …and stamped grid ctx wins outright.
    const w2 = legacy({ stage: 'fetch_active', ctx: { thiefGridX: 9, thiefGridY: 9 } });
    expect(findReadyFetchWhisper([w2], 9, 9)?.id).toBe('yulka_discs');
  });

  it('⚠⚠ the return leg matches on the absolute camp cell too', () => {
    const c = canonicalCellOf('reclaimer_stake');
    const w = legacy({ stage: 'fetch_returned' });
    expect(findReadyReturnWhisper([w], c.x + 1, c.y - 2)?.id).toBe('yulka_discs');
  });

  it('⚠⚠ whisperRouteTarget hands SET COURSE an absolute cell', () => {
    // The return shape changed (gridX/gridY) so every consumer broke at
    // compile time instead of silently routing in the wrong frame — that is
    // how this suite's own sibling (whisperYulka) was caught.
    const c = canonicalCellOf('reclaimer_stake');
    expect(whisperRouteTarget(legacy())).toEqual({ gridX: c.x + 1, gridY: c.y - 2, label: "Yulka's fire" });
  });
});

describe('OTA-1542 — the record says who sent you', () => {
  it('⚠⚠⚠ a wanderer-granted whisper names its source and its true reference point', () => {
    // "I'm still trying to figure out if this was the whisper promised by Nix."
    const line = describeWhisperStage(legacy({ source: 'Nix' }));
    expect(line).toContain('Nix');
    expect(line).toContain('where you met them');
    expect(line).not.toContain('south of the outpost');
  });

  it('⚠⚠ an overheard whisper keeps the outpost copy — that one was always true', () => {
    const line = describeWhisperStage(legacy());
    expect(line).toContain('south of the outpost');
  });
});

describe('OTA-1542 — every coordinate consumer is on the grid', () => {
  it('⚠⚠⚠ all three plant sites stamp the absolute cell', () => {
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    const stamps = code.match(/targetGridX: plantG\.x \+ \(tile\.x - /g) ?? [];
    expect(stamps.length).toBe(3);
  });

  it('⚠⚠ the persuade plant stamps the source', () => {
    expect(codeOnly(src('app', 'state', 'gameStore.ts'))).toContain('source: targetName,');
  });

  it('⚠⚠ the tile funnel matches on playerGridCell, not the step\'s frame coords', () => {
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain('const meet = findReadyMeetWhisper(p.activeWhispers, hours, pg.x, pg.y);');
    expect(code).toContain('const fetch = findReadyFetchWhisper(p.activeWhispers, pg.x, pg.y);');
    expect(code).toContain('const ret = findReadyReturnWhisper(p.activeWhispers, pg.x, pg.y);');
  });

  it('⚠⚠ the course walks toward the absolute cell and a legacy course still resumes', () => {
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain('const dir = nextCardinalToward(from.x, from.y, tx, ty);');
    // A mid-course save with only mapX/mapY resolves once, in the current
    // frame — exactly what it meant before — then walks frame-proof.
    expect(code).toContain('whisperCourse: { ...s.player.whisperCourse, gridX: fx, gridY: fy }');
  });

  it('⚠ the Contracts button and the distance badge both compare absolute cells', () => {
    expect(codeOnly(src('app', 'screens', 'ContractsScreen.tsx'))).toContain('setWhisperCourse(route.gridX, route.gridY, route.label);');
    expect(codeOnly(src('app', 'screens', 'ExplorationScreen.tsx'))).toContain('return Math.abs(wc.gridX - g.x) + Math.abs(wc.gridY - g.y);');
  });

  it('⚠ the OTA-502 canon pin lands on the target\'s own cell, not a re-derived one', () => {
    // The old conversion (`player's current cell + tile offset`) was only right
    // in the plant frame; the "?" marker could land on dirt Yulka was never on.
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain('const gx = gridX;');
    expect(code).toContain('const gy = gridY;');
  });
});
