/**
 * OTA-1547 — THE CONVERSATION HOLDS THE FLOOR.
 *
 * Owner, after OTA-1542 put Yulka's camp back on real dirt and the meet fired
 * on his very next walk: *"yulka spoke, but then it was buried by instruction
 * text … would a box on the screen that says speak to yulka pops up and when
 * you hit it a talk box like the vendors pops up and the conversation is in
 * there, that way it's your focus and you can accept or decline her fetch
 * quest there and then you see the instructions. and the memory of that
 * instance is persistent, but only for that instance."*
 *
 * ⚠⚠⚠ SHE WAS BURIED TWICE, BY TWO DIFFERENT WRITERS. First by fireYulkaMeet
 * itself: a three-command [system] burst printed in the same breath as her
 * pitch. Second by the step machinery: his log shows "You walk west… lost
 * track of distance" printing AFTER her entire introduction, because
 * stepDirection runs the whisper resolver EARLY and prints the open-ground
 * filler LATE — the mundane narration of the step talked over the encounter
 * the step landed on. OTA-1530 cured exactly this disease for wanderers; this
 * is the whisper organ.
 *
 * ⚠⚠⚠ THE FIX IS A PLACE FOR THE WORDS, NOT MORE WORDS. A SPEAK TO YULKA bar
 * above the input slot (no self-opening popup — 1530's dwell lesson), raising
 * a TalkSheet-style sheet where the decision is three buttons routed through
 * the SAME handlers the typed commands use. The instructions land in the
 * sheet as a task brief after accepting; the feed keeps her voice and gets
 * ONE compact pointer instead of the burst.
 *
 * ⚠⚠ MEMORY OF THE INSTANCE, ON THE INSTANCE. The transcript is
 * WhisperRecord.talk — persisted with the record, so it survives restarts for
 * as long as the encounter lives and leaves with it when the chain resolves.
 */
import { withTalkTurn } from '../app/engine/whispers';
import type { WhisperRecord } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const STORE = src('app', 'state', 'gameStore.ts');
const SHEET = src('app', 'components', 'WhisperTalkSheet.tsx');

const rec = (over: Partial<WhisperRecord> = {}): WhisperRecord => ({
  id: 'yulka_discs',
  stage: 'met_yulka',
  plantedAtHour: 0,
  targetMapX: 0,
  targetMapY: 0,
  targetLocationId: 'reclaimer_stake',
  ...over,
});

describe('OTA-1547 — the transcript lives on the record', () => {
  it('⚠⚠⚠ withTalkTurn appends immutably and in order', () => {
    const before = [rec()];
    const after = withTalkTurn(withTalkTurn(before, 'yulka_discs', 'them', 'Sit.'), 'yulka_discs', 'you', 'You sit.');
    expect(after[0]!.talk).toEqual([
      { who: 'them', text: 'Sit.' },
      { who: 'you', text: 'You sit.' },
    ]);
    // The input records were not mutated — the store maps over these.
    expect(before[0]!.talk).toBeUndefined();
  });

  it('⚠⚠ an unknown id hands the array back unchanged — a resolved record loses its turn, correctly', () => {
    const before = [rec()];
    const after = withTalkTurn(before, 'not_a_chain', 'them', 'Who?');
    expect(after).toEqual(before);
  });

  it('⚠⚠ the field is typed on WhisperRecord, so it persists with the record and dies with it', () => {
    const types = src('app', 'engine', 'types.ts');
    expect(codeOnly(types)).toContain('talk?: WhisperTalkTurn[];');
    expect(types).toContain("who: 'them' | 'you' | 'note';");
  });
});

describe('OTA-1547 — the meet stops burying its own speaker', () => {
  it('⚠⚠⚠ the three-command [system] burst is GONE from the meet', () => {
    // This is the wall of instruction text that washed her off the screen.
    expect(STORE).not.toContain('Type "accept yulka" to take the fetch');
  });

  it('⚠⚠⚠ …replaced by one pointer to the bar (typed commands still named)', () => {
    expect(STORE).toContain('Answer her from the SPEAK TO YULKA bar below');
  });

  it('⚠⚠ the meet seeds the transcript with her sighting and her pitch', () => {
    const code = codeOnly(STORE);
    expect(code).toContain("{ who: 'them' as const, text: sighting }");
    expect(code).toContain("{ who: 'them' as const, text: pitch }");
  });

  it('⚠⚠ accepting writes the choice, the send-off and the task brief into the transcript', () => {
    const code = codeOnly(STORE);
    expect(code).toContain("withTalkTurn(s.player.activeWhispers, whisper.id, 'you', 'You take the job.')");
    expect(code).toContain("whisper.id, 'them', sendOff,");
    expect(code).toContain("whisper.id, 'note', brief,");
    // …and the feed gets ONE compact pointer, never the burst.
    expect(STORE).toContain('◈ Task taken — see WHISPERS in Contracts.');
  });

  it("⚠⚠ a short-TC buy keeps the record, so the refusal joins the transcript too", () => {
    const code = codeOnly(STORE);
    expect(code).toContain("withTalkTurn(s.player.activeWhispers, whisper.id, 'you', 'You offer to buy the Discs outright.')");
    expect(code).toContain("whisper.id, 'them', short,");
  });
});

describe('OTA-1547 — the step machinery yields to a fired beat', () => {
  it('⚠⚠⚠ the resolver reports whether a beat fired', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('const whisperBeatFired = resolveWhispersForTile(get, set, step.x, step.y);');
    // All five beats report; the quiet path reports false.
    const fn = code.slice(code.indexOf('function resolveWhispersForTile'));
    const body = fn.slice(0, fn.indexOf('\nfunction '));
    expect(body).toContain('): boolean {');
    expect((body.match(/return true;/g) ?? []).length).toBe(4);
    expect(body.trimEnd().endsWith('return false;\n}')).toBe(true);
  });

  it('⚠⚠⚠ the open-ground filler stands down on a beat step — both branches', () => {
    // "You walk west… lost track of distance" AFTER Yulka's introduction was
    // the owner's log, to the line. You did not lose track — you arrived.
    const code = codeOnly(STORE);
    expect(code).toContain('const hasCompass = !whisperBeatFired && player.inventory.some(');
    expect(code).toContain("if (!whisperBeatFired) get().appendLog('world', directional);");
  });

  it('⚠⚠ the 20% trader roll stands down too — no stall materialises on her fire', () => {
    expect(codeOnly(STORE)).toContain('if (!whisperBeatFired && outdoorPeaceful && !inAnyHubRoom && tileIsNovel');
  });
});

describe('OTA-1547 — the sheet and the typed commands are one road', () => {
  it('⚠⚠⚠ answerYulka routes all three buttons through the SAME handlers the parser uses', () => {
    const code = codeOnly(STORE);
    expect(code).toContain("if (choice === 'accept') handleYulkaAccept(get, set, w);");
    expect(code).toContain("else if (choice === 'buy') handleYulkaBuy(get, set, w);");
    expect(code).toContain('else handleYulkaLeave(get, set, w);');
  });

  it('⚠⚠ the typed short-circuit is untouched — "accept yulka" still works', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('handleYulkaAccept(get, set, yulkaActive);');
    expect(code).toContain('handleYulkaBuy(get, set, yulkaActive);');
    expect(code).toContain('handleYulkaLeave(get, set, yulkaActive);');
  });

  it('⚠⚠⚠ the bar is loud while she waits and quiet afterwards — and only while the instance lives', () => {
    const code = codeOnly(SHEET);
    expect(code).toContain("const deciding = w.stage === 'met_yulka';");
    expect(code).toContain("{deciding ? 'SPEAK TO YULKA' : 'YULKA — WHAT SHE SAID'}");
    expect(code).toContain("(x.talk?.length ?? 0) > 0 && x.stage !== 'done' && x.stage !== 'ambush_armed'");
  });

  it('⚠⚠ ACCEPT keeps the sheet open on the brief; BUY and WALK AWAY close with the record', () => {
    // If visibility keyed on met_yulka alone, accepting would vanish the sheet
    // with the instructions unread — the burial rebuilt out of its own cure.
    expect(codeOnly(SHEET)).toContain("if (choice !== 'accept') setOpen(false);");
  });

  it('⚠⚠ combat owns the controls — the bar yields exactly like the wanderer card', () => {
    expect(codeOnly(SHEET)).toContain('if (!w || enemies > 0) return null;');
  });

  it('⚠ the sheet is mounted above the controls slot in ExplorationScreen', () => {
    const screen = codeOnly(src('app', 'screens', 'ExplorationScreen.tsx'));
    expect(screen).toContain('<WhisperTalkSheet />');
  });
});
