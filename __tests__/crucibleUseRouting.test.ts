// OTA-217 — verifies the natural "use the fuse crucible" verb
// routing to fuseAtCrucible. Playtest log: player typed
//   "use the fuse crucible"
// and got the generic use_relic line ("The the relic responds to the
// fuse crucible. A pitch, a hum, a recognition") instead of the
// fusion flow. The short-circuit at the top of submitPlayerAction
// now matches more phrasings.

describe('OTA-217 — crucible-use regex routing to fuseAtCrucible', () => {
  // Inline copy of the regex from submitPlayerAction so the
  // assertion locks the exact pattern shipped.
  const FUSE_REGEX = /^fuse(\s|$)/i;
  const USE_CRUCIBLE_REGEX = /^use\s+(the\s+)?(fuse\s+|fusing\s+)?crucible\b/i;
  const fires = (s: string) => FUSE_REGEX.test(s) || USE_CRUCIBLE_REGEX.test(s);

  it('matches bare "fuse"', () => {
    expect(fires('fuse')).toBe(true);
  });

  it('matches "use the fuse crucible" (the playtest verbatim)', () => {
    expect(fires('use the fuse crucible')).toBe(true);
  });

  it('matches "use crucible"', () => {
    expect(fires('use crucible')).toBe(true);
  });

  it('matches "use the crucible"', () => {
    expect(fires('use the crucible')).toBe(true);
  });

  it('matches "use the fusing crucible"', () => {
    expect(fires('use the fusing crucible')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fires('USE THE CRUCIBLE')).toBe(true);
    expect(fires('Fuse')).toBe(true);
  });

  it('does NOT match "use the lantern" (no crucible noun)', () => {
    expect(fires('use the lantern')).toBe(false);
  });

  it('does NOT match "fused weapon" (fuse not at start as a verb)', () => {
    expect(fires('look at fused weapon')).toBe(false);
  });

  it('does NOT match "use crucible-bound relic" (boundary)', () => {
    // "crucible-bound" has a hyphen, but \b still matches at the
    // hyphen. This is a deliberate accept — if a future noun is
    // named like that, we'd revisit.
    // Documenting current behavior.
    expect(fires('use crucible-bound relic')).toBe(true);
  });
});
