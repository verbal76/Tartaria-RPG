// ⚠⚠⚠ OTA-1792 — THE LOG KEEPS THE FREEZE.
//
// The 2026-09-10 iPhone SE freeze report arrived as 297 of 3,048 entries: 57
// seconds of a nine-minute session. About 280 of the 297 were the mission trace
// repeated — with the test kit's 115 open contracts every arrival wrote 115
// lines — and the "Send full log" push had been cut at the 40KB cap the email
// paste uses, so the freeze itself was trimmed off the front to make room for a
// slate that had not changed. Two instrument repairs, both authorised by the
// owner: a larger full-log capacity, and compact unchanged-mission tracing.
// runtimePressureWatch is explicitly NOT in this package.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));

import {
  LOG_CHARS_CAP, FULL_LOG_CHARS_CAP, trimLogForReport,
} from '../app/diagnostics/bugReport';
import {
  missionTraceLines, missionTraceArrivalLines, _resetMissionTraceMemoForTest,
} from '../app/engine/missionTrace';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placedAt } from '../test-utils/placePlayer';

const at = (loc: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ ...placedAt(loc), inventory: [], ...extra } as unknown as PlayerCharacter);

/** A log of `n` entries each `width` chars wide, oldest first, numbered so the
 *  suite can see WHICH end was trimmed. */
const logOf = (n: number, width: number): string =>
  Array.from({ length: n }, (_, i) => `${String(i).padStart(6, '0')} ${'x'.repeat(width - 7)}`).join('\n');

describe('OTA-1792 — the full-log push has its own cap', () => {
  it('⚠⚠⚠ THE FULL-LOG CAP IS THE BUNDLE\'S, NOT THE MAILBOX\'S', () => {
    // The push goes to Sentry as packed parts; the relay has reassembled 205k
    // bundles intact. The email paste stays at its measured ~40KB.
    expect(LOG_CHARS_CAP).toBe(40_000);
    expect(FULL_LOG_CHARS_CAP).toBe(200_000);
    expect(FULL_LOG_CHARS_CAP).toBeGreaterThan(LOG_CHARS_CAP * 4);
  });

  it('⚠⚠ THE SAME NINE-MINUTE LOG: the paste modes trim it, the full-log push keeps it', () => {
    // ~100 chars × 1,500 entries ≈ 150k: over the paste cap, under the push cap.
    const raw = logOf(1500, 100);
    for (const mode of ['character', 'general'] as const) {
      const t = trimLogForReport(raw, mode);
      expect(t.truncated).toBe(true);
      expect(t.lines.length).toBeLessThan(1500);
      expect(t.lines.join('\n').length).toBeLessThanOrEqual(LOG_CHARS_CAP);
      expect(t.header).toContain(`of 1500 entries`);
      expect(t.header).toContain('older trimmed to fit a single email paste');
    }
    const full = trimLogForReport(raw, 'fulllog');
    expect(full.truncated).toBe(false);
    expect(full.lines).toHaveLength(1500);
    expect(full.header).toBe('(Newest entry at top — full log, 1500 entries)');
  });

  it('⚠⚠ THE NEWEST ENTRIES SURVIVE and the header says what was cut', () => {
    // 3,000 × 100 ≈ 300k: past even the push cap. What survives must be the
    // NEWEST end — the freeze is at the end of the log, not the start.
    const raw = logOf(3000, 100);
    const full = trimLogForReport(raw, 'fulllog');
    expect(full.truncated).toBe(true);
    expect(full.lines[0]).toMatch(/^002999 /);         // newest first
    expect(full.lines.join('\n').length).toBeLessThanOrEqual(FULL_LOG_CHARS_CAP);
    expect(full.lines.length).toBeGreaterThan(1500);   // more than the paste cap ever kept
    expect(full.header).toContain(`showing the most recent ${full.lines.length} of 3000 entries`);
    expect(full.header).toContain('older trimmed at the full-log cap of 200,000 characters');
  });

  it('the store composes the log block through the pure trimmer', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'diagnostics', 'bugReport.ts'), 'utf8');
    expect(src).toContain('const trimmed = trimLogForReport(raw, mode);');
    // The old inline cap read is gone — one rule, one place.
    expect(src.match(/accChars \+ line\.length \+ 1 > cap/g)?.length).toBe(1);
  });
});

describe('OTA-1792 — an unchanged slate is one line, a changed one is the dump', () => {
  beforeEach(() => _resetMissionTraceMemoForTest());

  // Every fixture is PLACED (OTA-1484): a player standing somewhere real, with
  // the one contract on the slate at the given stage.
  const slate = (stage: number, loc = 'varakush', extra: Partial<PlayerCharacter> = {}): PlayerCharacter => at(loc, {
    activeMysteries: [{ id: 'mystery_red_tower', stage }],
    activeHunts: [],
    ...extra,
  } as unknown as Partial<PlayerCharacter>);

  it('⚠⚠⚠ A COLD PROCESS DUMPS IN FULL — the memo starts empty', () => {
    const lines = missionTraceArrivalLines(slate(0));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('\n')).toContain('mystery:mystery_red_tower stage 0/');
    expect(lines[lines.length - 1]).toMatch(/^missions: · at=varakush/);
  });

  it('⚠⚠⚠ THE SESSION-START DUMP PRIMES IT, and the next arrival writes ONE line that says where the dump is', () => {
    const before = Date.now();
    const primed = missionTraceLines(slate(0)); // slotSlice's session-start dump
    expect(primed.length).toBeGreaterThan(1);
    const arrival = missionTraceArrivalLines(slate(0, 'nimari'));
    expect(arrival).toHaveLength(1);
    const line = arrival[0] ?? '';
    expect(line).toMatch(/^missions: unchanged since \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z — 1 contracts \(dumped in full then\) · at=nimari here=none$/);
    // The timestamp is the DUMP's, so a reader can find it in the log.
    const stamp = Date.parse(line.replace(/^missions: unchanged since /, '').split(' ')[0] ?? '');
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(Date.now());
  });

  it('⚠⚠ THE POSITION IS NEVER COMPACTED AWAY — every tile, every route, every travel target', () => {
    missionTraceLines(slate(0));
    const moving = slate(0, 'nimari', {
      routedMission: { id: 'mystery_red_tower', phase: 'to_objective' },
      travelTarget: { locationId: 'varakush' },
    } as unknown as Partial<PlayerCharacter>);
    const line = missionTraceArrivalLines(moving).join('\n');
    expect(line).not.toContain('\n');
    expect(line).toContain('at=nimari');
    expect(line).toContain('routed=mystery_red_tower(to_objective)');
    expect(line).toContain('travelTo=varakush');
  });

  it('⚠⚠⚠ STANDING ON A CONTRACT\'S GROUND IS NOT A CHANGE OF SLATE — but the compact line says who is HERE', () => {
    // The 115-contract kit would otherwise dump in full on every tile that any
    // contract is anchored to. The full line's " HERE" mark is the position
    // seen from the contract's side; the memo keys on the slate without it,
    // and the compact line reports it by id instead.
    const dumped = missionTraceLines(slate(0, 'nimari')); // primed OFF the ground
    expect(dumped.join('\n')).not.toContain(' HERE');
    const onGround = missionTraceArrivalLines(slate(0, 'varakush'));
    expect(onGround).toHaveLength(1);
    expect(onGround[0]).toContain('at=varakush here=mystery:mystery_red_tower');
    const offAgain = missionTraceArrivalLines(slate(0, 'nimari'));
    expect(offAgain).toHaveLength(1);
    expect(offAgain[0]).toContain('at=nimari here=none');
  });

  it('⚠⚠⚠ A STAGE ADVANCE IS A CHANGE — the dump comes back in full, and the memo moves with it', () => {
    missionTraceLines(slate(0));
    expect(missionTraceArrivalLines(slate(0))).toHaveLength(1);
    const advanced = missionTraceArrivalLines(slate(1));
    expect(advanced.length).toBeGreaterThan(1);
    expect(advanced.join('\n')).toContain('mystery:mystery_red_tower stage 1/');
    // ...and the NEXT arrival compacts against the new dump, not the old one.
    const again = missionTraceArrivalLines(slate(1));
    expect(again).toHaveLength(1);
    expect(again[0]).toContain('1 contracts');
  });

  it('⚠⚠ ACCEPTING A CONTRACT IS A CHANGE — the count is part of the key', () => {
    missionTraceLines(slate(0));
    const two = at('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }],
      activeHunts: [{ id: 'hunt_bog_dragon', stage: 0, postedByFaction: null, acceptedAt: 0 }],
    } as Partial<PlayerCharacter>);
    const lines = missionTraceArrivalLines(two);
    expect(lines.length).toBeGreaterThan(1);
    expect(missionTraceArrivalLines(two)).toHaveLength(1);
  });

  it('⚠ AN EMPTY SLATE IS ALREADY ONE LINE, and it neither primes nor compacts', () => {
    missionTraceLines(slate(0));
    const empty = missionTraceArrivalLines(at('nimari'));
    expect(empty).toHaveLength(1);
    expect(empty[0]).toContain('missions: none active');
    expect(empty[0]).toContain('at=nimari');
    // The memo still holds the one-contract dump: a re-acceptance dumps in full
    // because the slate differs from the last FULL dump, not from "none".
    expect(missionTraceArrivalLines(slate(0))).toHaveLength(1);
  });

  it('a null player writes nothing, as before', () => {
    expect(missionTraceArrivalLines(null)).toEqual([]);
    expect(missionTraceArrivalLines(undefined)).toEqual([]);
  });

  it('the arrival path in the store reads the compact variant; the session seam still dumps in full', () => {
    const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const SLOT = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'slotSlice.ts'), 'utf8');
    expect(STORE).toContain("for (const l of missionTraceArrivalLines(get().player)) get().appendLog('debug', l);");
    expect(STORE).not.toMatch(/\bmissionTraceLines\(/);
    expect(SLOT).toContain('mt.missionTraceLines(get().player)');
  });
});
