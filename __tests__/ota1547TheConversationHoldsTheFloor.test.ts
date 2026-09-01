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
    // OTA-1548 — the pointer is templated off the chain content now; for
    // Yulka it renders the same 'Answer her from the SPEAK TO YULKA bar
    // below — or type "accept yulka", …' it always did.
    expect(STORE).toContain('Answer ${pronounForms(c.pronoun).obj} from the SPEAK TO ${c.npcName.toUpperCase()} bar below');
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
    // OTA-1548 — chain-generic wording; the refusal turn still lands.
    expect(code).toContain("withTalkTurn(s.player.activeWhispers, whisper.id, 'you', 'You offer to buy outright.')");
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
    // ⚠ OTA-1613 — the return beat now tail-returns its arming call
    // (`return armWhisperHandback(...)`, itself boolean) instead of firing and
    // then `return true;`, so one literal moved into a returned expression.
    // The rule is unchanged and is what is measured: EVERY beat reports whether
    // it fired, and only the quiet path falls through to false.
    expect((body.match(/return true;/g) ?? []).length).toBe(3);
    expect(body).toContain('return armWhisperHandback(get, set, ret, retChain);');
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
  it('⚠⚠⚠ answerWhisper routes all three buttons through the SAME handlers the parser uses', () => {
    // OTA-1548 — renamed answerYulka → answerWhisper when the machine went
    // chain-generic; the one-road property is the thing pinned.
    const code = codeOnly(STORE);
    expect(code).toContain("if (choice === 'accept') handleWhisperAccept(get, set, w, chain);");
    expect(code).toContain("else if (choice === 'buy') handleWhisperBuy(get, set, w, chain);");
    expect(code).toContain('else handleWhisperLeave(get, set, w, chain);');
  });

  it('⚠⚠ the typed short-circuit still runs — "accept yulka" and every sibling name', () => {
    // OTA-1548 — the regexes are built from the chain's own npcName, so
    // 'accept yulka' compiles to exactly the pattern it always was.
    const code = codeOnly(STORE);
    expect(code).toContain('handleWhisperAccept(get, set, mw, chain);');
    expect(code).toContain('handleWhisperBuy(get, set, mw, chain);');
    expect(code).toContain('handleWhisperLeave(get, set, mw, chain);');
    expect(code).toContain('^accept (${name}|the (fetch|job|deal))');
  });

  it('⚠⚠⚠ the bar is loud while the giver waits and quiet afterwards — and only while the instance lives', () => {
    const code = codeOnly(SHEET);
    expect(code).toContain("const deciding = w.stage === 'met_yulka';");
    // ⚠ OTA-1549 added the ▸ every live control in the game wears, when the
    // owner reported he could not see this bar at all. The NAME is the pin.
    expect(code).toContain('SPEAK TO ${c.npcName.toUpperCase()}');
    expect(code).toContain("(x.talk?.length ?? 0) > 0 && x.stage !== 'done' && x.stage !== 'ambush_armed'");
  });

  it('⚠⚠ ACCEPT (and a refused buy) keep the sheet open; WALK AWAY closes with the record', () => {
    // If visibility keyed on met_yulka alone, accepting would vanish the sheet
    // with the instructions unread — the burial rebuilt out of its own cure.
    // A SUCCESSFUL buy removes the record and the unmount closes the sheet; a
    // refused one keeps the transcript up so the refusal is read where it landed.
    expect(codeOnly(SHEET)).toContain("if (choice === 'leave') setOpen(false);");
  });

  it('⚠⚠ combat owns the controls — the bar yields exactly like the wanderer card', () => {
    expect(codeOnly(SHEET)).toContain('if (!w || !chain || enemies > 0) return null;');
  });

  it('⚠ the sheet is mounted above the controls slot in ExplorationScreen', () => {
    const screen = codeOnly(src('app', 'screens', 'ExplorationScreen.tsx'));
    expect(screen).toContain('<WhisperTalkSheet />');
  });
});
