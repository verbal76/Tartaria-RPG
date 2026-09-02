// ⚠⚠⚠ OTA-1623 — THE GERUND IS THE VERB.
//
// Found by the player-shaped walker on its second catalogue pass, on the
// owner's own mission (Temporal Distortion Watch, the stealth beat). It typed
// the Contracts card's label — "sneaking", what the card prints after
// "Advance by" — on the right ground with the pack in order, and got an
// Arbiter tagline about an item in its pack. The stage did not move.
//
// MEASURED (ota1621 had measured only the INTENT, never the confidence):
// `sneaking` → stealth by levenshtein distance 3 → confidence 0.46 → under the
// 0.5 gate in submitPlayerAction → Qwen fallback / soft refusal → the stage
// matcher never saw it. "sneak" at 1.00 paid the same stage in the same
// breath. OTA-1621's rule — every printed word must parse to the intent that
// pays — was true of the intent and false of the confidence, and the suite
// that held it did not ask.
//
// THE RULE NOW: an inflected form of a known verb is that verb at full
// confidence (-ing / -ed / -s and their spelling undoings, exact-entry only —
// nothing fuzzy is loosened). And every ask AND label is held to
// confidence ≥ 0.5 — the gate's own number — not just to the intent.

import { parseInput } from '../app/engine/parser';
import { stageVerbAsk, stageVerbLabel, payingIntent, type MissionFamily } from '../app/engine/questStage';

const KINDS = ['investigate', 'stealth', 'diplomacy', 'cast', 'escape', 'attack_provoke', 'attack', 'boss'] as const;
const FAMILIES: MissionFamily[] = ['hunt', 'mystery', 'storyline'];

describe('OTA-1623 — the gerund is the verb', () => {
  it('⚠⚠⚠ HIS CASE, MEASURED: "sneaking" is stealth at full confidence, not a 0.46 guess', () => {
    const p = parseInput('sneaking', {});
    expect(p.intent).toBe('stealth');
    expect(p.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('⚠⚠ the common inflections of the table\'s verbs all land exact', () => {
    for (const [word, intent] of [
      ['searching', 'investigate'], ['searched', 'investigate'],
      ['casting', 'cast'], ['talking', 'diplomacy'], ['fleeing', 'escape'],
      ['digging', 'dig'], ['attacking', 'attack'], ['sneaks', 'stealth'],
    ] as const) {
      const p = parseInput(word, {});
      expect({ word, intent: p.intent, full: p.confidence >= 0.9 }).toEqual({ word, intent, full: true });
    }
  });

  it('⚠⚠⚠ EVERY ask and EVERY label clears the confidence gate — the half ota1621 did not measure', () => {
    for (const family of FAMILIES) {
      for (const checkKind of KINDS) {
        const pays = payingIntent(family, { checkKind })!;
        for (const phrase of [stageVerbAsk(family, { checkKind })!, stageVerbLabel(family, { checkKind })!]) {
          const p = parseInput(phrase, {});
          expect({ family, checkKind, phrase, intent: p.intent, clearsGate: p.confidence >= 0.5 })
            .toEqual({ family, checkKind, phrase, intent: pays, clearsGate: true });
        }
      }
    }
  });

  it('⚠ nothing fuzzy was loosened — an inflection of a non-verb is still nothing', () => {
    expect(parseInput('xyzzying', {}).intent).toBe('unknown');
    expect(parseInput('mudflooded', {}).intent).toBe('unknown');
  });
});
