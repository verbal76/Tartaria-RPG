// OTA-916 — a possessive scene noun ("scribe's quill") must match the parser's
// apostrophe-stripped tokens ("scribe quill"), so `salvage scribe's quill` hits the SCENE
// object instead of falling through to a fuzzy inventory match (the owner's Phoenix Feather
// Quill) and dead-ending on "already worked over".
import { matchAmbientNoun, normalizeForCompare } from '../app/engine/ambientNouns';

describe('OTA-916 — possessive scene nouns resolve', () => {
  it('normalizeForCompare strips the possessive apostrophe-s', () => {
    expect(normalizeForCompare("scribe's quill")).toBe('scribe quill');
    expect(normalizeForCompare("scribe's quill")).toBe(normalizeForCompare('scribe quill'));
  });

  it('matches typed "scribe quill" to the possessive scene noun (the reported case)', () => {
    expect(matchAmbientNoun('scribe quill', ["scribe's quill", 'ink ledger', 'mercury vial'])).toBe("scribe's quill");
  });

  it('handles other possessive props', () => {
    expect(matchAmbientNoun('zalmar tower', ["zalmar's tower"])).toBe("zalmar's tower");
    expect(matchAmbientNoun('reclaimer cache', ["reclaimer's cache", 'stone wall'])).toBe("reclaimer's cache");
  });

  it('still resolves exact non-possessive nouns (regression)', () => {
    expect(matchAmbientNoun('wall', ['wall', 'stone wall'])).toBe('wall');
    expect(matchAmbientNoun('the ink ledger', ['ink ledger'])).toBe('ink ledger');
  });

  it('a genuine non-match still returns null', () => {
    expect(matchAmbientNoun('anvil', ["scribe's quill", 'mercury vial'])).toBeNull();
  });
});
