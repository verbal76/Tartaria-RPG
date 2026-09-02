// ⚠⚠⚠ OTA-1621 — THE ASK IS A COMMAND.
//
// Owner, on the Temporal Watch stage: *"this mission is not making sense. it's
// taking me across a couple of different tiles and they all still say I'm
// standing on it and I'm doing what it says to do and it's not giving me
// anything."* His log, 01:27:16:
//
//   [player] go quietly
//   [debug]  parser: intent=travel conf=1.00 verb=go target=quietly
//   [world]  You walk. Tartaria walks beside you.
//
// He typed the game's own words back at it — "go quietly" is the ask the card
// and the arrival line print for a stealth stage — and the parser read "go" as
// walking and moved him an hour down the road. The stage is paid by the
// STEALTH intent, which the parser only reaches through hide / sneak / crawl /
// creep / lurk / crouch / silently / shadow / conceal / slink. Five of the seven
// ask phrases had this defect, measured with the real parser before touching
// them: "go quietly" → travel, "work the aether" → unknown, "break away" →
// ATTACK, "force the issue" → unknown, "finish it" → turn_in. Only "search
// this ground" and "talk it through" said what they meant.
//
// ⚠⚠ THE RULE THIS SUITE HOLDS: an ask phrase is a sentence the player will
// type, so its first verb must parse to the intent that pays the stage. It is
// measured here with `parseInput`, never pinned as a string — a string pin
// would be a second opinion about the parser.
//
// ⚠ (His other half — "they all still say I'm standing on it" — was true: the
// mystery matcher pays on `currentLocationId === ground`, the whole location,
// not one cell. Recorded in HANDOFF; nothing to fix.)

import { parseInput } from '../app/engine/parser';
import {
  stageVerbAsk, stageVerbLabel, stageObjectiveAsk, nextStageDirection, payingIntent, type MissionFamily,
} from '../app/engine/questStage';
import { missionArrivalLines } from '../app/engine/missionTrace';
import { placedAt } from '../test-utils/placePlayer';

const KINDS = ['investigate', 'stealth', 'diplomacy', 'cast', 'escape', 'attack_provoke', 'attack'] as const;
const FAMILIES: MissionFamily[] = ['hunt', 'mystery', 'storyline'];

describe('OTA-1621 — every ask phrase parses to the intent that pays it', () => {
  it('⚠⚠⚠ HIS LINE, MEASURED: the old stealth ask walked him; the new one sneaks', () => {
    expect(parseInput('go quietly', {}).intent).toBe('travel'); // the defect, kept as evidence
    const ask = stageVerbAsk('mystery', { checkKind: 'stealth' })!;
    expect(parseInput(ask, {}).intent).toBe('stealth');
    expect(payingIntent('mystery', { checkKind: 'stealth' })).toBe('stealth');
  });

  it('⚠⚠⚠ ALL SEVEN KINDS, ALL THREE FAMILIES — the phrase is a command for the paying intent', () => {
    for (const family of FAMILIES) {
      for (const checkKind of KINDS) {
        const ask = stageVerbAsk(family, { checkKind });
        const pays = payingIntent(family, { checkKind });
        expect(ask).toBeTruthy();
        expect(pays).toBeTruthy();
        const parsed = parseInput(ask!, {});
        expect({ family, checkKind, ask, parsed: parsed.intent }).toEqual({ family, checkKind, ask, parsed: pays });
      }
    }
  });

  it('⚠⚠ the boss beat reads through the family — and each family\'s word still parses', () => {
    // OTA-1588: a hunt's boss is paid by attack, a mystery's by investigate, a
    // storyline's by diplomacy. Each resolves to a phrase, and each phrase parses.
    for (const family of FAMILIES) {
      const ask = stageVerbAsk(family, { checkKind: 'boss' })!;
      expect(parseInput(ask, {}).intent).toBe(payingIntent(family, { checkKind: 'boss' }));
    }
  });

  it('⚠⚠ the object still composes onto the command (OTA-1617 kept)', () => {
    expect(stageObjectiveAsk('hunt', { checkKind: 'stealth', grants: { item: 'Brass Key' } } as never))
      .toBe('sneak — come away with the Brass Key');
    expect(stageObjectiveAsk('hunt', { checkKind: 'attack_provoke', spawn: { enemyName: 'Reaver', count: 3 } } as never))
      .toBe('provoke it — 3 × Reaver');
    // And a phrase with an object still parses to the paying intent — the
    // object is a noun the parser tolerates, not a verb it trips on.
    expect(parseInput('sneak — come away with the Brass Key', {}).intent).toBe('stealth');
  });

  it('⚠⚠ the arrival line on his tile now says the word that pays', () => {
    const p = {
      ...placedAt('buried_cities'),
      inventory: [{ id: 'r', name: 'Eddy-Zone Reading', quantity: 1 }],
      activeHunts: [], activeStorylines: [], activeFactionQuests: [], activeQuests: [],
      activeMysteries: [{ id: 'mystery_temporal_watch', stage: 2, tracked: true }],
    } as never;
    const line = missionArrivalLines(p).find((l) => l.includes('Temporal Distortion Watch'))!;
    expect(line).toBeTruthy();
    expect(line).toContain('— sneak');
    expect(line).not.toContain('go quietly');
  });

  it('⚠ the two phrases that were already right are untouched', () => {
    expect(stageVerbAsk('hunt', { checkKind: 'investigate' })).toBe('search this ground');
    expect(stageVerbAsk('hunt', { checkKind: 'diplomacy' })).toBe('talk it through');
  });
});

describe('OTA-1621 — the "Advance by …" labels are held to the same rule', () => {
  it('⚠⚠ every label parses to the paying intent — two of seven did not ("use …" is the relic verb)', () => {
    // Measured: 'use stealth' → use_relic, 'use Aethercraft' → use_relic. The
    // Contracts card prints these after "→ Advance by", and a player who types
    // what the card says must not be handed a relic prompt.
    for (const family of FAMILIES) {
      for (const checkKind of [...KINDS, 'boss'] as const) {
        const label = stageVerbLabel(family, { checkKind })!;
        expect(label).toBeTruthy();
        const parsed = parseInput(label, {}).intent;
        expect({ family, checkKind, label, parsed })
          .toEqual({ family, checkKind, label, parsed: payingIntent(family, { checkKind }) });
      }
    }
  });
});

describe('OTA-1621 — the close line carries the next beat\'s word', () => {
  it('⚠⚠⚠ "▸ Next: …" now says what to DO there, not only where and what to bring', () => {
    // Before: "▸ Next: The Buried Cities." on a beat paid by sneaking — the
    // owner walked there and had nothing to type. With the family, the composed
    // ask rides in the same sentence.
    const next = { locationName: 'The Buried Cities', checkKind: 'stealth', grants: { item: 'Temporal Distortion Watch' } };
    expect(nextStageDirection(next as never, 'The Buried Cities', true, 'mystery'))
      .toBe('▸ Next: The Buried Cities · sneak — come away with the Temporal Distortion Watch.');
    // Same ground, a verb to pay: the line is worth printing now where it was null.
    expect(nextStageDirection({ checkKind: 'investigate' } as never, null, false, 'hunt'))
      .toBe('▸ search this ground.');
    // The word in the line is the word the parser pays.
    const said = nextStageDirection({ checkKind: 'escape' } as never, null, false, 'hunt')!;
    expect(parseInput(said.replace(/^▸ /, '').replace(/\.$/, ''), {}).intent).toBe('escape');
  });

  it('⚠⚠ the ask names the person, so "find X" yields to it; a verbless beat still says find', () => {
    expect(nextStageDirection({ checkKind: 'diplomacy', npcName: 'Garrin' } as never, null, false, 'storyline'))
      .toBe('▸ talk it through with Garrin.');
    expect(nextStageDirection({ checkKind: null, npcName: 'Garrin' } as never, null, false, 'storyline'))
      .toBe('▸ find Garrin.');
    // A required item still rides after the ask.
    expect(nextStageDirection({ checkKind: 'cast', requires: { item: 'Aether Crystal', quantity: 2 } } as never, null, false, 'hunt'))
      .toBe('▸ cast aether · bring 2× Aether Crystal.');
  });

  it('⚠ without a family the line reads exactly as OTA-1328 wrote it', () => {
    expect(nextStageDirection({ checkKind: 'stealth' } as never, 'Samarran', false)).toBeNull();
    expect(nextStageDirection({ npcName: 'the dive-boss', checkKind: 'diplomacy' } as never, null, false))
      .toBe('▸ find the dive-boss.');
  });
});
