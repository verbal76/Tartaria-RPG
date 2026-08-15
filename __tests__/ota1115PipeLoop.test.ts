// OTA-1115 — THE PIPES WERE THE BUG.
//
// Three OTAs have now been spent on item synthesis. OTA-1108 made the silent
// failure visible. OTA-1109 shrank the prompt, raised the cap 180 → 240, and —
// the part that actually mattered — put the RAW TEXT in the discard reason. The
// very next device log paid that off:
//
//   item_synthesis ok 10374ms read 2314ms/write 7980ms in 219t→out 239t HIT-CAP (604ch)
//   ✂ DISCARDED item_synthesis after 10374ms — item_synth:unparseable (604ch)
//     raw="{"kind":"misc|invented|lorem|quest|tool|misc|misc|misc|misc|misc|…"
//
// The model was not elaborating and was not short of room. It opened
// `"kind":"` and then COPIED THE ALTERNATION IT HAD JUST BEEN SHOWN, pipe by
// pipe, until the cap stopped it. `weapon|armor|accessory|…` is schema notation
// to a human; to a 0.5B model it is a literal string sitting in the value
// position of an object it was told to imitate.
//
// Neither earlier fix could have helped. A model looping on `|` loops on `|` at
// any token budget and any prompt length — which is worth stating plainly,
// because both earlier reads were reasonable on the evidence then available and
// only the raw-text instrumentation could distinguish them from this.
//
// What these tests hold: NO ALTERNATION EVER APPEARS INSIDE THE JSON.

import fs from 'fs';
import path from 'path';
import { looksLikeAlternationLoop } from '../app/engine/itemSynthesisQwen';

const mod: string = fs.readFileSync(
  path.join(__dirname, '../app/engine/itemSynthesisQwen.ts'), 'utf8');

/** The prompt lines, isolated from the surrounding commentary — the commentary
 *  QUOTES the bad pattern on purpose, and must not be mistaken for it. */
function promptLines(): string[] {
  const from = mod.indexOf('const systemPrompt = [');
  const to = mod.indexOf("].join('\\n');", from);
  return mod.slice(from, to)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith("'") || l.startsWith('"'));
}

describe('OTA-1115 — no alternation survives inside the JSON', () => {
  it('⚠ not one prompt line carries a pipe — the loop had nothing to copy', () => {
    for (const line of promptLines()) {
      expect(line).not.toContain('|');
    }
  });

  it('⚠ the exact string the model looped on is gone', () => {
    for (const line of promptLines()) {
      expect(line).not.toContain('weapon|armor');
      expect(line).not.toContain('strength|dexterity');
      expect(line).not.toContain('organic|metal');
    }
  });

  it('the example is a CONCRETE object — copying it verbatim is a correct answer', () => {
    const example = promptLines().find((l) => l.includes('"kind":"') && l.includes('"description":'));
    expect(example).toBeTruthy();
    const json = example!.slice(example!.indexOf('{'), example!.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json);
    expect(typeof parsed.kind).toBe('string');
    expect(parsed.kind).not.toContain('|');
    expect(typeof parsed.description).toBe('string');
    expect(Array.isArray(parsed.extraTags)).toBe(true);
    for (const t of parsed.extraTags) expect(t).not.toContain('|');
  });

  it('every effect example in the brief is itself valid JSON with literal values', () => {
    // ⚠ RETARGETED BY OTA-1134, and the reason is the point of that OTA. The
    // effect examples used to sit in the brief as BARE top-level objects —
    // `{"kind":"passive","stat":"wisdom","bonus":1}` — which is exactly what
    // taught the model to emit `passive` as a TOP-LEVEL kind and fail the
    // validator four times out of four. They are nested under `"effect":` now,
    // so the pattern matches the inner object where it actually lives.
    const shapes = mod.match(/"effect":(\{"kind":"(?:consumable|passive)"[^}]*\})/g) ?? [];
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    for (const raw of shapes) {
      const s = raw.slice('"effect":'.length);
      const parsed = JSON.parse(s);
      for (const v of Object.values(parsed)) {
        if (typeof v === 'string') expect(v).not.toContain('|');
      }
    }
  });
});

describe('OTA-1115 — the vocabulary the validator needs is still fully specified', () => {
  const brief = promptLines().join('\n');

  it('all six kinds are named', () => {
    for (const k of ['weapon', 'armor', 'accessory', 'consumable', 'misc', 'relic']) {
      expect(brief).toContain(k);
    }
  });

  it('all five extraTags are named', () => {
    for (const t of ['organic', 'metal', 'fiber', 'stone', 'glass']) {
      expect(brief).toContain(t);
    }
  });

  it('all five passive stats are named', () => {
    for (const s of ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma']) {
      expect(brief).toContain(s);
    }
  });

  it('the clamp ranges the validator enforces are still stated', () => {
    expect(brief).toContain('healHP 1 to 10');
    expect(brief).toContain('restoreStamina 1 to 8');
    expect(brief).toContain('bonus is 1 or 2');
  });

  it('the one-line instruction survives — the parser tolerates noise, it should not need to', () => {
    expect(brief).toMatch(/Reply with ONE line/);
  });
});

describe('OTA-1115 — the loop now has a name in the telemetry', () => {
  it('recognises the shape from the device log', () => {
    expect(looksLikeAlternationLoop(
      '{"kind":"misc|invented|lorem|quest|tool|misc|misc|misc|misc|misc|misc',
    )).toBe(true);
  });

  it('⚠ cannot fire on a good reply — a valid object has no pipes at all', () => {
    expect(looksLikeAlternationLoop(
      '{"kind":"misc","description":"A coil of tarred rope, stiff with age.","extraTags":["fiber"]}',
    )).toBe(false);
  });

  it('needs a REPEAT, not merely pipes — a one-off list is not a loop', () => {
    expect(looksLikeAlternationLoop('a|b|c|d')).toBe(false);
    expect(looksLikeAlternationLoop('a|b|c|a')).toBe(true);
  });

  it('a couple of stray pipes are not enough to call it', () => {
    expect(looksLikeAlternationLoop('x|x')).toBe(false);
  });

  it('empty and pipe-free input are both quietly false', () => {
    expect(looksLikeAlternationLoop('')).toBe(false);
    expect(looksLikeAlternationLoop('no json here at all')).toBe(false);
  });

  it('the discard site picks between the two names rather than filing both as one', () => {
    expect(mod).toContain("looksLikeAlternationLoop(raw) ? 'item_synth:alternation-loop' : 'item_synth:unparseable'");
    expect(mod).toContain('noteQwenDiscarded(`${reason}');
  });

  it('the raw sample OTA-1109 added is still carried — that is what caught this', () => {
    expect(mod).toContain('raw.trim().replace(/\\s+/g, \' \').slice(0, 160)');
    expect(mod).toContain('(${raw.length}ch)');
  });
});

describe('OTA-1115 — the file records why the two earlier fixes could not have worked', () => {
  it('names the failure as a copied alternation, not a length or budget problem', () => {
    expect(mod).toContain('THE PIPES WERE THE BUG');
    expect(mod).toContain('COPIED THE ALTERNATION IT HAD JUST BEEN SHOWN');
  });

  it('states the invariant a future editor has to keep', () => {
    expect(mod).toContain('NO ALTERNATION EVER APPEARS INSIDE THE JSON');
  });

  it('the cap OTA-1109 raised is left alone — it was never the constraint', () => {
    expect(mod).toContain('maxNewTokens: 240');
  });
});
