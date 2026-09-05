/**
 * OTA-1697 — THE NOTES REACH THE NARRATOR. Narrative-agency audit, hole 6:
 * `worldMemory.chainMemos` (whisper-chain `memo` effects) was written, read only
 * as a dedupe, and the type comment promised the Arbiter could reference it —
 * nothing did. One reader: the newest three authored notes, oldest first, on
 * the Qwen fact sheet from both narration builders. Machine memos never reach
 * a prompt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { authoredMemos, chainMemosLine, MACHINE_MEMO_RE, MEMOS_ON_SHEET } from '../app/engine/chainMemos';
import { buildLlmContext, buildSystemPrompt } from '../app/engine/contextInjector';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const A = 'A Reclaimer at a roadside fire spoke of an unmapped hollow two ridges over.';
const B = 'A Tartarian rune marked you. The True Tartarians will know.';
const C = 'You found the hollow the Reclaimer described. The information was good.';
const D = 'An Aetheric storm gave you a fragment instead of killing you. That counts for something here.';

describe('OTA-1697 — the notes', () => {
  it('a machine memo is a snake tag with a payload; prose is a note', () => {
    expect(MACHINE_MEMO_RE.test('dog_rescue_pending:river_bank')).toBe(true);
    expect(MACHINE_MEMO_RE.test('puppy_vendor_trade_id:itm_12')).toBe(true);
    expect(MACHINE_MEMO_RE.test(A)).toBe(false);
    expect(MACHINE_MEMO_RE.test('Note: the hollow is real.')).toBe(false); // capital, a space after the colon — prose
    const memos = [
      { text: A, ts: 1 }, { text: 'dog_rescue_pending:river_bank', ts: 2 }, { text: B, ts: 3 },
      { text: '   ', ts: 4 }, { text: 'puppy_vendor_trade_id:itm_12', ts: 5 },
    ];
    expect(authoredMemos(memos).map((m) => m.text)).toEqual([A, B]);
    expect(authoredMemos(undefined)).toEqual([]);
  });

  it('the line carries the newest three, oldest first, and is null with nothing to say', () => {
    expect(MEMOS_ON_SHEET).toBe(3);
    expect(chainMemosLine(undefined)).toBeNull();
    expect(chainMemosLine([{ text: 'dog_rescue_pending:x', ts: 1 }])).toBeNull();
    expect(chainMemosLine([{ text: A, ts: 1 }])).toBe(A);
    expect(chainMemosLine([{ text: A, ts: 1 }, { text: B, ts: 2 }, { text: 'dog_rescue_pending:x', ts: 3 }, { text: C, ts: 4 }, { text: D, ts: 5 }]))
      .toBe(`${B} ${C} ${D}`);
  });
});

describe('OTA-1697 — the fact sheet', () => {
  it('carries the notes when there are any and says nothing when there are none', () => {
    const ctx = buildLlmContext({ player: null, scene: null, gameLog: [], chainMemos: `${A} ${C}` });
    expect(ctx.chain_memos).toBe(`${A} ${C}`);
    const sys = buildSystemPrompt(ctx).map((m) => m.content).join('\n');
    expect(sys.includes(`The player's own notes, oldest first: ${A} ${C}`)).toBe(true);
    const bare = buildLlmContext({ player: null, scene: null, gameLog: [], chainMemos: null });
    expect(bare.chain_memos).toBeUndefined();
    expect(buildSystemPrompt(bare).map((m) => m.content).join('\n').includes("The player's own notes")).toBe(false);
    // The ambient aside keeps its lean prompt (OTA-1106 measured the prefill cost):
    // the notes ride the reactive fact sheet only, like the deeds line.
    const amb = buildLlmContext({ player: null, scene: null, gameLog: [], ambient: true, chainMemos: B });
    expect(amb.chain_memos).toBe(B);
    expect(buildSystemPrompt(amb).map((m) => m.content).join('\n').includes("The player's own notes")).toBe(false);
  });

  it('both narration builders pass the notes, and the deeds line still comes first', () => {
    const narration = src('app', 'ai', 'narration.ts');
    expect(narration.includes('chainMemos: chainMemosLine(state.worldMemory.chainMemos)')).toBe(true);
    expect(narration.includes('chainMemos: chainMemosLine(get().worldMemory.chainMemos)')).toBe(true);
    const inj = src('app', 'engine', 'contextInjector.ts');
    const deeds = inj.indexOf('if (ctx.deeds_here) parts.push(');
    const notes = inj.indexOf('if (ctx.chain_memos) parts.push(');
    expect(deeds).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(deeds);
  });
});
