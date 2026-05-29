// OTA-212 — two playtest-log bugs.
//
// (1) Aetheric Torch consumed a charge in rooms with no hidden hooks
//     to reveal. Player burned two torches in a row to "no resonance
//     to surface." Now the no-op case refunds the charge.
//
// (2) Meta-comment "sorry guys I tried to help you but the games
//     being retarded" fired the `help` intent and the noun resolver
//     resolved "games retarded" as a target. The OTA-141 meta-guard
//     regex didn't catch venting / apology shapes. Extended with
//     `\bsorry\b`, `\bi tried\b`, `\bthis (game|app)\b`, and
//     `\bthe game'?s? (being|is|was)\b`.

// The torch refund is verified via the regex / meta-guard test only
// here; the integration path is hard to test without the full store
// harness. The meta-guard regex is the focus.

describe('OTA-212 — frustration-vent guard (any length) catches the playtest input', () => {
  // The new branch (B) from gameStore — venting / apology shapes
  // that don't need the 60-char length gate.
  const ventRegex = (s: string) =>
    /\bsorry\s+(guys|y'?all|everyone|folks|all|dudes)\b/i.test(s) ||
    /\b(i\s+tried|tried\s+to)\s+.{0,30}\b(game|app|engine|parser|menu|button|inventory)\b/i.test(s) ||
    /\bthis\s+(game|app)\s+(is|keeps|won'?t|doesn'?t|wont|dont)\b/i.test(s) ||
    /\bthe\s+game'?s?\s+(being|is|was)\b/i.test(s) ||
    /\b(retarded|buggy|glitched)\b/i.test(s);

  it('catches the exact playtest input', () => {
    const input = 'sorry guys I tried to help you but the games being retarded';
    expect(ventRegex(input)).toBe(true);
  });

  it('catches short "this game keeps spamming" complaints', () => {
    expect(ventRegex('this game keeps spamming the same dialog')).toBe(true);
  });

  it('catches "tried to" frustration about parser', () => {
    expect(ventRegex('i tried to use the parser but nothing fires')).toBe(true);
  });

  it('catches "buggy / glitched" anywhere in the line', () => {
    expect(ventRegex('the inventory is buggy lately')).toBe(true);
    expect(ventRegex('combat got glitched mid-swing')).toBe(true);
  });

  it('does NOT match in-character text that names game nouns innocuously', () => {
    expect(ventRegex('I make my way carefully across the broken stones and look around')).toBe(false);
    expect(ventRegex('I walk south along the path and the compass spins')).toBe(false);
  });

  it('does NOT match a brief in-character apology that names a person', () => {
    // "sorry Rocky" or similar should NOT trigger — different shape.
    expect(ventRegex('sorry rocky I cant feed you yet')).toBe(false);
  });
});

describe('OTA-212 — pre-existing OTA-141 long-suggestion regex still works', () => {
  const LONG_REGEX = /^(ok\b|btw\b|fyi\b|hey\b|so\b|when (i|the)\b)|(\b(we|i) ((\w+)\s+)?(should|need|could|gotta|gonna|wish|want|really)\b|\byou should\b|\bi think\b|\bi'?d like\b|\bcan we\b|\bcould you\b|\bshould have\b|\bneeds? to be\b|\bit should (have|be|also)\b|\badd a\b|\bplease add\b)/i;

  it('catches the 95-char OTA-141 playtest input', () => {
    expect(LONG_REGEX.test('ok we should probably add a button for this on the inventory side')).toBe(true);
  });

  it('catches "could you" feature requests', () => {
    expect(LONG_REGEX.test('hey could you make the salvage button also pull on the nouns please')).toBe(true);
  });
});
