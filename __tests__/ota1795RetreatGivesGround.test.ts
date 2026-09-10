// ⚠⚠⚠ OTA-1795 — RETREAT GIVES GROUND.
//
// Owner ruling, 2026-09-10: "retreat: Give ground. Reserve flee for actually
// attempting to leave combat." This reverses the audit-brief canon OTA-1724
// pinned ("RETREAT = attempt to leave combat") and resolves the collision
// OTA-1713 recorded and refused to flip on its own judgement. The word moves
// from the escape table to the retreat intent — which, like stealth before
// OTA-1793, had ten phrases for the thing and not the thing's own name.

import { parseInput } from '../app/engine/parser';
import concepts from '../app/data/lore/concepts.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const parse = (s: string) => parseInput(s);
const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1795 — the word and its intent', () => {
  it('⚠⚠⚠ `retreat` GIVES GROUND — exactly, at full confidence', () => {
    expect(parse('retreat')).toMatchObject({ intent: 'retreat', matchedVerb: 'retreat', confidence: 1 });
  });

  it('⚠⚠ naming an enemy still rides along as the target — "retreat from the raider"', () => {
    const p = parse('retreat from the raider');
    expect(p.intent).toBe('retreat');
    expect(p.target).toContain('raider');
  });

  it('⚠⚠⚠ THE NEGATIVE CONTROL: every leaving word still leaves', () => {
    for (const s of ['flee', 'run', 'escape', 'bolt', 'scram', 'withdraw', 'fall back', 'run away']) {
      expect({ s, intent: parse(s).intent }).toEqual({ s, intent: 'escape' });
    }
  });

  it('and the older giving-ground phrases are exactly where they were', () => {
    for (const s of ['give ground', 'back off', 'back away', 'pull back', 'step back', 'reposition']) {
      expect({ s, intent: parse(s).intent }).toEqual({ s, intent: 'retreat' });
    }
  });

  it('the typed path and the LLM path now name the same intent for the word', () => {
    const llm = src('app', 'engine', 'llmParser.ts');
    expect(llm).toMatch(/retreat: 'retreat'/);
    expect(parse('retreat').intent).toBe('retreat');
  });
});

describe('OTA-1795 — what the game teaches agrees with what it runs', () => {
  const card = concepts.concepts.find((c) => c.id === 'retreat_action')!;
  const flee = concepts.concepts.find((c) => c.id === 'flee_action')!;

  it('⚠⚠ the Give Ground card claims the word, first, and its trap sentence is gone', () => {
    expect(card.keywords?.[0]).toBe('retreat');
    expect(card.answer).not.toContain('read as FLEEING');
    expect(card.answer).toContain('"Retreat" means exactly this');
    expect(card.answer).toContain('say "flee"');
    // Every keyword on the card routes to the card's intent (OTA-1713's rule).
    for (const kw of card.keywords ?? []) expect({ kw, intent: parse(kw).intent }).toEqual({ kw, intent: 'retreat' });
  });

  it('the Flee card does not teach `retreat`, and every phrase it teaches leaves', () => {
    for (const kw of flee.keywords ?? []) expect(kw).not.toContain('retreat');
    const screen = src('app', 'screens', 'ActionReferenceScreen.tsx');
    expect(screen).toContain("flee_action: ['flee', 'run away', 'bolt'],");
    expect(screen).toContain("retreat_action: ['retreat', 'back off', 'step back'],");
    for (const s of ['flee', 'run away', 'bolt']) expect(parse(s).intent).toBe('escape');
  });

  it('the FLEE button still submits the leaving word, and the stranded-escape hint names it', () => {
    expect(src('app', 'components', 'InputBox.tsx')).toContain("onPress={() => onSubmit('flee')}");
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain("or 'flee' again to break contact.");
    expect(store).not.toContain("another 'retreat' to break contact");
  });
});
