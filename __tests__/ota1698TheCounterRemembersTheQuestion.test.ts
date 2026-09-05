/**
 * OTA-1698 — THE COUNTER REMEMBERS THE QUESTION. Narrative-agency audit, hole
 * 7: `worldMemory.npcTranscripts` (OTA-1151) was stored durably and read only
 * by the talk sheet's EARLIER column; nothing ever quoted what was said. One
 * reader on both greeting doors: on a return visit, after the greeting and the
 * absence beat, the person names the last thing you asked — deterministic off
 * the meeting count, never for a stranger or a wronged counter, and only when
 * the last exchange is thirty real minutes old.
 */
import fs from 'node:fs';
import path from 'node:path';
import { lastAskedLine, LAST_ASKED_MIN_GAP_MS, emptyRelation } from '../app/engine/npcMemory';
import type { NpcRelation, TalkTurn } from '../app/engine/types';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const NOW = 10_000_000;
const OLD = NOW - LAST_ASKED_MIN_GAP_MS - 1;
const turns: TalkTurn[] = [
  { q: 'The old road', a: 'Closed since the flood.', ts: OLD - 5_000 },
  { q: 'The Sixth Landing', a: 'Nobody goes there twice.', ts: OLD },
];

function rel(meetings: number, extra: Partial<NpcRelation> = {}): NpcRelation {
  const base = emptyRelation({ id: 'v:irma', name: 'Irma', role: 'vendor', firstMetAt: 1 } as never, 1, 0);
  // Enough dealings to read as 'known' or better at these meeting counts.
  return { ...base, meetings, tcTraded: 400, ...extra } as NpcRelation;
}

describe('OTA-1698 — the line', () => {
  it('names the LAST question, quoted, in a variant chosen by the meeting count', () => {
    expect(lastAskedLine(turns, rel(3), 'Irma', NOW)).toBe(
      'Irma picks up where you left off. "You were asking about ‘The Sixth Landing’. I\'ve had time to think on it."',
    );
    expect(lastAskedLine(turns, rel(4), 'Irma', NOW)).toBe(
      '"Last time it was ‘The Sixth Landing’ you wanted to know about," Irma says. "Ask, if there\'s more."',
    );
    expect(lastAskedLine(turns, rel(5), 'Irma', NOW)).toBe(
      'Irma nods you closer. "Still chewing on ‘The Sixth Landing’, or is it something new today?"',
    );
    // Same save, same visit: the same words.
    expect(lastAskedLine(turns, rel(5), 'Irma', NOW)).toBe(lastAskedLine(turns, rel(5), 'Irma', NOW));
  });

  it('is silent with no transcript, for a stranger, for a wronged counter, and inside the thirty-minute gap', () => {
    expect(LAST_ASKED_MIN_GAP_MS).toBe(30 * 60_000);
    expect(lastAskedLine(undefined, rel(3), 'Irma', NOW)).toBeNull();
    expect(lastAskedLine([], rel(3), 'Irma', NOW)).toBeNull();
    expect(lastAskedLine([{ q: '   ', a: 'x', ts: OLD }], rel(3), 'Irma', NOW)).toBeNull();
    expect(lastAskedLine(turns, null, 'Irma', NOW)).toBeNull(); // no relation = a stranger
    expect(lastAskedLine(turns, rel(0), 'Irma', NOW)).toBeNull();
    expect(lastAskedLine(turns, rel(3, { wrongs: 2 }), 'Irma', NOW)).toBeNull();
    // The last exchange happened a minute ago (two stalls in one sitting): quiet.
    expect(lastAskedLine([{ q: 'The Sixth Landing', a: 'x', ts: NOW - 60_000 }], rel(3), 'Irma', NOW)).toBeNull();
    expect(lastAskedLine([{ q: 'The Sixth Landing', a: 'x', ts: NOW - LAST_ASKED_MIN_GAP_MS }], rel(3), 'Irma', NOW)).not.toBeNull();
  });
});

describe('OTA-1698 — both greeting doors', () => {
  const store = src('app', 'state', 'gameStore.ts');

  it('read the transcript for THIS person after the absence beat, on the arrival door and the emitVendorGreeting door', () => {
    const call = "{ const la = lastAskedLine(get().worldMemory.npcTranscripts?.[vendorNpcId(vendor)], rel, vendor.name); if (la) get().appendLog('world', la); }";
    expect(store.split(call).length - 1).toBe(2);
    // Order on each door: greeting → menace beat → absence → last question.
    let from = 0;
    for (let i = 0; i < 2; i++) {
      const greet = store.indexOf("get().appendLog('world', npcGreeting(rel, vendor.name, player.name, player.sex));", from);
      const away = store.indexOf('if (awayLine) get().appendLog(\'world\', awayLine);', greet);
      const asked = store.indexOf(call, away);
      expect(greet).toBeGreaterThan(-1);
      expect(away).toBeGreaterThan(greet);
      expect(asked).toBeGreaterThan(away);
      from = asked + 1;
    }
    expect(store.split('\n').length).toBeLessThan(37000);
  });
});
