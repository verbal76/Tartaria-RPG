/**
 * OTA-1455 — THE INPUT SAYS WHAT IT ACCEPTS, USING THIS ROOM.
 *
 * The parser is a first-class way to play — several verbs are typed-only by
 * design — and the bar advertised that with a static "What do you do?", which
 * reads as a search field. An outside review put it exactly: a generic bar says
 * "Google fallback", not "this engine takes prose". So it now offers a concrete
 * example drawn from what is actually in front of the player, behind a `❯`
 * prompt that marks it as a terminal rather than a search box.
 *
 * ⚠⚠⚠ THE ONE PROPERTY THAT MATTERS, AND IT IS NOT "A HINT EXISTS". A suggestion
 * the parser then refuses is worse than no suggestion at all: the player's FIRST
 * typed sentence — the one that decides whether they ever type again — comes back
 * rejected, and the lesson they learn is "typing does not work here."
 *
 * So the hint is not drawn from the raw scene noun list, and not from a table of
 * good-sounding examples. It comes from `gatherChips`: THE EXACT ARRAY THE PICKER
 * RENDERS, with consumed rows already flagged by the same pass that greys them.
 * If the picker would refuse it, the bar cannot offer it — not by discipline, but
 * because they read the same array.
 */
import { blockAt, between } from '../test-utils/srcBlock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const EXPL = read('app', 'screens', 'ExplorationScreen.tsx');
const IB = read('app', 'components', 'InputBox.tsx');

describe('OTA-1455 — the hint cannot suggest what the parser would refuse', () => {
  const HINT = blockAt(EXPL, '  const parserHint = useMemo(() => {', { mode: 'opener' });

  it('⚠⚠⚠ IT READS `gatherChips` — the picker\'s own array, not the raw scene list', () => {
    // The whole guarantee. `displayedAmbientNouns` would include nouns already
    // worked over; gatherChips has been through the consumed/exhausted/scanner/
    // elevation filters the picker itself uses.
    expect(HINT).toContain('gatherChips.find(');
    expect(HINT).not.toContain('displayedAmbientNouns');
    expect(HINT).not.toContain('ambientNouns');
  });

  it('⚠⚠⚠ …and it SKIPS CONSUMED ROWS — the flag the picker greys on', () => {
    expect(HINT).toContain('!c.consumed');
  });

  it('⚠⚠ it is DETERMINISTIC — first live row, so it cannot flicker between renders', () => {
    // A hint that changed on every render would read as broken, and would be
    // unreadable at the exact moment somebody is trying to copy it.
    expect(HINT).toContain('.find(');
    expect(HINT).not.toContain('Math.random');
    expect(HINT).not.toContain('sort(');
  });

  it('⚠⚠ it is MEMOISED on its real inputs — the noun, the vendor, the wanderer', () => {
    const deps = EXPL.slice(EXPL.indexOf('  const parserHint = useMemo(() => {'));
    const list = deps.slice(deps.indexOf('}, ['), deps.indexOf(']);') + 3);
    expect(list).toContain('gatherChips');
    expect(list).toContain('currentScene?.vendor?.name');
    expect(list).toContain('currentScene?.wanderer?.name');
  });

  it('⚠⚠ NULL when the room has nothing live — it never invents an example', () => {
    // The failure mode this forbids: a scene with everything worked over still
    // offering "take the rubble", which refuses. Silence beats a broken promise.
    expect(HINT).toContain('return null;');
    const tail = HINT.slice(HINT.lastIndexOf('if ('));
    expect(tail).toContain('return null;');
  });

  it('⚠ every branch names a REAL entity, never a literal noun', () => {
    // No hard-coded "the slab" / "the basin" examples: each suggestion
    // interpolates something the scene actually carries.
    for (const branch of ['`take the ${live.noun}`', '`talk to ${currentScene.vendor.name}`', '`talk to ${currentScene.wanderer.name}`']) {
      expect(HINT).toContain(branch);
    }
  });
});

describe('OTA-1455 — the bar wears it', () => {
  it('⚠⚠ the hint is passed down, and the prop is typed nullable', () => {
    expect(EXPL).toContain('parserHint={parserHint}');
    expect(IB).toContain('parserHint?: string | null;');
  });

  it('⚠⚠ the placeholder USES it, behind a prompt glyph rather than a question', () => {
    const ph = between(IB, 'placeholder={', 'placeholderTextColor');
    expect(ph).toContain('❯ try: ${parserHint}');
    expect(ph).toContain('❯ what do you do?');
  });

  it('⚠⚠⚠ THE NAME BEAT AND COMBAT KEEP THEIR OWN WORDING — order is load-bearing', () => {
    // During the tutorial name beat there is exactly ONE right answer, and a
    // suggestion would compete with the only instruction that matters. In combat
    // the quick buttons are what the player should be looking at. Both branches
    // must be tested BEFORE the hint, or the hint silently overrides them.
    const ph = between(IB, 'placeholder={', 'placeholderTextColor');
    const name = ph.indexOf('awaitingTutorialName');
    const combat = ph.indexOf('inCombat');
    const hint = ph.indexOf('parserHint');
    expect(name).toBeGreaterThan(-1);
    expect(combat).toBeGreaterThan(name);
    expect(hint).toBeGreaterThan(combat);
    expect(ph).toContain("'Speak your name…'");
  });

  it('⚠ the prompt glyph is on BOTH branches — hint or no hint, it reads as a terminal', () => {
    // The `❯` is the half that says "this takes sentences" even in a room with
    // nothing to point at. Dropping it from the fallback would make the signal
    // come and go for no reason the player could detect.
    const ph = between(IB, 'placeholder={', 'placeholderTextColor');
    expect((ph.match(/❯/g) ?? []).length).toBe(2);
  });
});
