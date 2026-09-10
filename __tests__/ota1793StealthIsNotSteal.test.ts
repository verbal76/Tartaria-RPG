// ⚠⚠ OTA-1793 — STEALTH IS NOT STEAL.
//
// OTA-1738 reported it and left it open: the primer teaches a button called
// STEALTH, the player typed the word, and the game said "Nothing to steal
// here". The deterministic verb table had ten synonyms for the stealth intent
// and not the intent's own name, so `stealth` missed exact match and fell to
// the prefix rule — `steal` shares five letters and sits two apart — and won.
// The word joins its own table. Exact match returns at distance 0 before any
// fuzzy pass, so `steal` keeps its meaning.

import { parseInput } from '../app/engine/parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const parse = (s: string) => parseInput(s);

describe('OTA-1793 — the typed word stealth is the stealth intent', () => {
  it('⚠⚠⚠ `stealth` IS STEALTH, exactly, at full confidence', () => {
    const p = parse('stealth');
    expect(p.intent).toBe('stealth');
    expect(p.matchedVerb).toBe('stealth');
    expect(p.confidence).toBe(1);
  });

  it('⚠⚠ and its adjective and adverb — the primer says "stealthily", so the parser hears it', () => {
    expect(parse('stealthy').intent).toBe('stealth');
    expect(parse('stealthily').intent).toBe('stealth');
  });

  it('⚠⚠ THE DEFECT, NEGATED: no stealth-family word routes to steal', () => {
    for (const s of ['stealth', 'stealthy', 'stealthily', 'stealth past the guard', 'stealth up on them']) {
      expect(parse(s).intent).not.toBe('steal');
      expect(parse(s).intent).toBe('stealth');
    }
  });

  it('⚠⚠⚠ THE NEGATIVE CONTROL: `steal` is still steal, and so is a sentence built on it', () => {
    expect(parse('steal')).toMatchObject({ intent: 'steal', matchedVerb: 'steal', confidence: 1 });
    expect(parse('steal the purse')).toMatchObject({ intent: 'steal', target: 'purse' });
    expect(parse('pilfer the purse').intent).toBe('steal');
  });

  it('the older stealth words are exactly where they were', () => {
    for (const s of ['sneak', 'hide', 'creep', 'lurk']) {
      expect(parse(s)).toMatchObject({ intent: 'stealth', matchedVerb: s, confidence: 1 });
    }
  });

  it('a drunk `stelth` now lands on stealth instead of nowhere', () => {
    // Before: no stealth entry within fuzzy reach → unknown. After: distance 1.
    const p = parse('stelth');
    expect(p.intent).toBe('stealth');
    expect(p.matchedVerb).toBe('stealth');
  });

  it('the STEALTH button and the word it submits agree with the primer', () => {
    // The button submits `sneak` (InputBox), which was always the stealth intent;
    // the primer names the control STEALTH. Both words now reach the same handler.
    const inputBox = readFileSync(join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8');
    expect(inputBox).toContain(`<QuickBtn label="stealth" defensive onPress={() => onSubmit('sneak')} />`);
    const primer = readFileSync(join(__dirname, '..', 'app', 'components', 'CombatPrimerModal.tsx'), 'utf8');
    expect(primer).toContain('STEALTH — ');
    expect(parse('sneak').intent).toBe('stealth');
  });
});
