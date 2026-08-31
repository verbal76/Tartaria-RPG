// ⚠⚠⚠ OTA-1585 — "CORE" HIDING INSIDE "GEODE-CORED", AND IT ATE HIS ATTACKS.
//
// FROM THE 4.32.11 LOG, in Nimari — a Lost Capital, so "core" is a scene noun —
// mid-fight with the Guardian, Iron Litany Brother Konrad:
//
//   [player] attack with the reclaimers guild geode-cored cleaver
//   parser: intent=attack conf=1.00 verb=attack
//           target=reclaimers guild geode cored cleaver resolved=core
//           range=close enemies=1
//   [arbiter] The Arbiter holds out a hand. "That is the Tartarian Core. It does
//             not come out with that hand…"
//   [system] (Tap ★ SUMMON on the MAIN QUEST chip to face what guards it.)
//
// He tapped his weapon. Twice. Both taps were swallowed by a main-quest lecture
// while a boss stood in front of him. The IDENTICAL command had resolved
// correctly one tile earlier, because "core" is not a scene noun out on the
// Plains — which is what made it look like a mission bug rather than a parser
// bug.
//
// ⚠⚠ THE CAUSE: the parser's ambient pre-pass compared with a RAW SUBSTRING —
// `targetPhraseNorm.includes(nNorm)` — so "core" matched inside "geode COREd".
// Winning that pre-pass skips `resolveItem` ENTIRELY, so the weapon was never
// resolved and `resolvedNoun` came back as the Core. The main-quest guard reads
// `resolvedNoun`, correctly, and did its job on a lie.
//
// ⚠⚠⚠ AND THE FIX ALREADY EXISTED, ONE FUNCTION AWAY, FOR A YEAR. OTA-947 tore
// this exact comparison down to WORD level inside `matchAmbientNoun`, with a
// note about "arch" hiding inside "research chart" — the same bug, found once,
// fixed once, and never propagated to the parser's private copy of the same
// logic. The copy is deleted rather than patched. That is the whole lesson: two
// implementations of one question is one implementation plus a time bomb.

import { parseInput } from '../app/engine/parser';
import { matchAmbientNoun } from '../app/engine/ambientNouns';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ⚠ The CATALOGUE name, taken from his own stats line —
// `main=Reclaimers Guild Geode-Cored Cleaver`. "Smoldering" is the coating's
// display prefix (OTA-1553) and never reaches the inventory record, so a fixture
// carrying it would be testing a weapon the game does not have.
const CLEAVER = 'Reclaimers Guild Geode-Cored Cleaver';
const inv = [
  { id: 'w1', name: CLEAVER, kind: 'weapon', rarity: 'Rare', quantity: 1 },
  { id: 'c1', name: 'Golem Core', kind: 'misc', rarity: 'Rare', quantity: 1 },
] as unknown as InventoryItem[];

// The scene as Nimari actually presents it: a Lost Capital with the Core in it.
const NIMARI_NOUNS = ['core', 'shaft', 'rubble', 'red tower'];

describe('OTA-1585 — the ambient pre-pass respects word edges', () => {
  it('⚠⚠⚠ HIS EXACT COMMAND RESOLVES TO THE WEAPON, NOT THE CORE', () => {
    const p = parseInput('attack with the reclaimers guild geode-cored cleaver', {
      inventory: inv,
      recentNouns: NIMARI_NOUNS,
      ambientNouns: NIMARI_NOUNS,
      enemyPresent: true,
      enemyNames: ['Iron Litany Brother Konrad'],
    } as never);
    expect(p.intent).toBe('attack');
    // ⚠ The assertion that matters: the main-quest guard reads `resolvedNoun`,
    // and it must not see the Core when the player named a weapon.
    expect(p.resolvedNoun).not.toBe('core');
    expect(p.resolvedItemId).toBe('w1');
  });

  it('⚠⚠ and it is the AMBIENT pass that was wrong — the noun pass was already right', () => {
    // OTA-1576 fixed `resolveContextNoun`'s ranking. That fix was live and
    // correct; the ambient pre-pass runs BEFORE it and short-circuits it, which
    // is why the earlier repair did not save this one.
    expect(matchAmbientNoun('reclaimers guild geode cored cleaver', NIMARI_NOUNS)).toBeNull();
    expect(matchAmbientNoun('core', NIMARI_NOUNS)).toBe('core');
  });

  it('⚠⚠ the substring class in general — a scene noun buried in a longer word', () => {
    // Every one of these was a live hit before this OTA. Left as a family so the
    // next person sees the shape rather than the single instance.
    const cases: Array<[string, string[]]> = [
      ['reclaimers guild geode cored cleaver', ['core']],
      ['the crashed skiff', ['ash']],
      ['the warmth of the vent', ['arm']],
      ['a spitting conduit', ['pit']],
      ['research chart', ['arch']], // OTA-947's own example, still held
    ];
    for (const [target, ambient] of cases) {
      expect({ target, hit: matchAmbientNoun(target, ambient) })
        .toEqual({ target, hit: null });
    }
  });

  it('⚠ and the shorthand a player actually uses still works', () => {
    // The pre-pass exists so "the hatch" finds the "drain hatch". Tightening the
    // comparison must not cost that, or the cure is worse than the disease.
    expect(matchAmbientNoun('hatch', ['drain hatch', 'observation slit'])).toBe('drain hatch');
    expect(matchAmbientNoun('the standing water', ['standing water'])).toBe('standing water');
    expect(matchAmbientNoun('tele', ['telescope'])).toBe('telescope');
  });

  it('⚠ a player who really does mean the Core still reaches it', () => {
    const p = parseInput('take the core', {
      inventory: inv,
      recentNouns: NIMARI_NOUNS,
      ambientNouns: NIMARI_NOUNS,
    } as never);
    expect(p.resolvedNoun).toBe('core');
  });
});

describe('OTA-1585 — one implementation, not two', () => {
  const PARSER = readFileSync(join(__dirname, '..', 'app', 'engine', 'parser.ts'), 'utf8');

  it('⚠⚠⚠ THE PRIVATE COPY IS GONE, not patched', () => {
    // Patching the copy would have left two implementations of "does this scene
    // noun match what they typed" — which is how OTA-947's fix failed to reach
    // the place that needed it.
    expect(PARSER).toContain('matchAmbientNoun(targetPhraseRaw, context.ambientNouns ?? [])');
    // ⚠ Pinned on the deleted LOOP, not on the expression: the expression is
    // quoted in the comment above the fix (deliberately — the receipt belongs at
    // the site), so a text pin on it would always trip.
    expect(PARSER).not.toContain('for (const n of ambientCandidates)');
    expect(PARSER).not.toContain('const ambientCandidates');
  });

  it('⚠ the log line that found it is recorded at the site', () => {
    // A bug this cheap to reintroduce needs its receipt where the code is.
    expect(PARSER).toContain('geode COREd');
  });
});
