// OTA-1135 — THE OUTDOOR HALF OF OTA-1055.
//
// Owner: "fix the rest ambush line dedup, or should the llm rework be giving a
// new line for that?"
//
// Neither framing was quite it. The cause is smaller than "needs new content":
// OTA-1055 re-voiced the rest ambush for INDOOR scenes and gave that path
// THREE lines for the wake beat and THREE for the arrival. It never came back
// for the outdoor path, which stayed a single hardcoded string for both — so
// the more common case, resting under open sky, was the one with no variety at
// all. The owner's log showed two consecutive rest ambushes printing the
// identical beat. The RATE measured fine (22% wild / 8% hub, ×1.3 night /
// ×0.85 day — two hits in one session is a ~5% coincidence), so the repetition
// was the entire complaint.
//
// ⚠ AND NOT THE LLM, which is what the owner actually asked. Three reasons:
//   1. It fires AS THE FIGHT STARTS. This device's telemetry: fastest job ~2s,
//      ambient averaging 11.6s, slowest 19.6s. A "you wake to something
//      standing over you" line cannot arrive after the first attack roll. The
//      headroom track's hard rule is that the model never runs in front of a
//      tap.
//   2. Two of three ambient generations in the last log were DISCARDED. A beat
//      this dramatic getting nothing two times in three is worse than a repeat.
//   3. Every generated slot needs an authored fallback anyway, so this pool has
//      to exist regardless.
// Where the model COULD help later: rest is eight in-game hours during which
// the player is provably busy — the single best bank-and-spend candidate in
// the game. Generate during the sleep, spend on waking, fall back to these.
// That needs the bank built first.

jest.setTimeout(20000);

import {
  outdoorRestWakeLine,
  outdoorRestArrivalLine,
  _OUTDOOR_POOLS,
} from '../app/engine/restWakeLines';
import { indoorRestWakeLine, indoorRestArrivalLine } from '../app/engine/indoorAmbush';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

const drawMany = (fn: () => string, n = 400): Set<string> => {
  const seen = new Set<string>();
  for (let i = 0; i < n; i += 1) seen.add(fn());
  return seen;
};

describe('OTA-1135 — the outdoor rest ambush stops repeating itself', () => {
  it('⚠ the wake beat has real variety where it had exactly one line', () => {
    expect(_OUTDOOR_POOLS.wake.length).toBeGreaterThanOrEqual(5);
    expect(drawMany(outdoorRestWakeLine).size).toBe(_OUTDOOR_POOLS.wake.length);
  });

  it('⚠ so does the arrival beat — both halves were hardcoded, not just one', () => {
    expect(_OUTDOOR_POOLS.arrival.length).toBeGreaterThanOrEqual(5);
    expect(drawMany(() => outdoorRestArrivalLine('A Mud Tortoise')).size)
      .toBe(_OUTDOOR_POOLS.arrival.length);
  });

  it('the original line survives — the fix is variety, not a rewrite', () => {
    // The owner has seen this one many times; losing it would read as a
    // different game rather than as the same game with more to say.
    expect(_OUTDOOR_POOLS.wake).toContain(
      `The Arbiter goes still. "You weren't alone. Something circled while you were out — and it stopped circling."`,
    );
    expect(_OUTDOOR_POOLS.arrival).toContain('{name} closes the distance through the dark. The rest is over.');
  });

  it('every arrival line names the enemy, and none leaks the token', () => {
    for (const raw of _OUTDOOR_POOLS.arrival) {
      expect(raw).toContain('{name}');
      const filled = raw.replace('{name}', 'A Mud Tortoise');
      expect(filled).toContain('A Mud Tortoise');
      expect(filled).not.toContain('{');
    }
    expect(outdoorRestArrivalLine('An Aetheric Drone')).not.toContain('{name}');
  });

  it('every arrival line still ends on the beat that tells you the rest is over', () => {
    for (const raw of _OUTDOOR_POOLS.arrival) {
      expect(raw.endsWith('The rest is over.')).toBe(true);
    }
  });

  it('every wake line is the Arbiter going still — one voice, five thoughts', () => {
    for (const raw of _OUTDOOR_POOLS.wake) {
      expect(raw.startsWith('The Arbiter goes still.')).toBe(true);
    }
  });

  it('⚠ the outdoor lines stay OUTDOOR — no sealed-room images', () => {
    // OTA-1055's whole point was that the two situations need different
    // imagery. Borrowing indoor language back would undo it.
    const all = [..._OUTDOOR_POOLS.wake, ..._OUTDOOR_POOLS.arrival].join(' ').toLowerCase();
    for (const indoorWord of ['in here', 'this room', 'a door', 'already inside,']) {
      expect(all).not.toContain(indoorWord);
    }
  });

  it('and the indoor pools are untouched', () => {
    expect(drawMany(indoorRestWakeLine).size).toBe(3);
    expect(drawMany(() => indoorRestArrivalLine('A Raider')).size).toBe(3);
  });
});

describe('OTA-1135 — wired at the one site that had the hardcoded string', () => {
  const store = src('app/state/gameStore.ts');

  it('⚠ the hardcoded outdoor strings are gone from the store', () => {
    expect(store).not.toContain(
      '`The Arbiter goes still. "You weren\'t alone. Something circled while you were out — and it stopped circling."`',
    );
    expect(store).not.toContain('closes the distance through the dark. The rest is over.`');
  });

  it('both outdoor beats now come from the pool', () => {
    expect(store).toContain('outdoorAmb.outdoorRestWakeLine()');
    expect(store).toContain('outdoorAmb.outdoorRestArrivalLine(withArticleCap(enemy.name))');
  });

  it('the indoor / outdoor branch is preserved exactly', () => {
    expect(store).toContain('restUnderRoof\n                  ? restAmb.indoorRestWakeLine()');
    expect(store).toContain('restUnderRoof\n                ? restAmb.indoorRestArrivalLine(withArticleCap(enemy.name))');
  });

  it('the ambush RATE is untouched — this was never a rate fix', () => {
    expect(store).toContain('const restAmbushBase = restInSafeZone ? 0.08 : 0.22;');
  });

  it('the module records WHY it is authored rather than generated', () => {
    const mod = src('app/engine/restWakeLines.ts');
    expect(mod).toContain('never runs in front of a tap');
    expect(mod).toContain('AUTHORED FALLBACK');
    expect(mod).toContain('bank');
  });
});
