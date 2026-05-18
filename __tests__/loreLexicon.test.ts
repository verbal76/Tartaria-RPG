// Lore-respelling lexicon regression. The actual quality of the
// produced audio depends on Kokoro's phonemizer on the device,
// which we can't run in Jest — but we can lock the text-level
// substitutions so a future regex change doesn't silently regress
// the lore words we've already manually tuned.

import { applyLoreLexicon, getLexiconSize } from '../app/voice/loreLexicon';

describe('applyLoreLexicon', () => {
  it('respells Aetheric (case-insensitive)', () => {
    expect(applyLoreLexicon('Aetheric Spear')).toBe('eetheric Spear');
    expect(applyLoreLexicon('aetheric')).toBe('eetheric');
    expect(applyLoreLexicon('AETHERIC')).toBe('eetheric');
  });

  it('respells Aetherstone / Aether / Aetherborn distinctly', () => {
    expect(applyLoreLexicon('the Aetherstone Flood')).toBe('the eether stone Flood');
    // Verify Aetherstone matches before plain Aether (longest first).
    expect(applyLoreLexicon('Aether vs Aetherstone')).toBe('eether vs eether stone');
    expect(applyLoreLexicon('an Aetherborn warrior')).toBe('an eether born warrior');
  });

  it('respells Tartaria / Tartarian / Tartarians', () => {
    expect(applyLoreLexicon('walk into Tartaria')).toBe('walk into tar tare ee uh');
    expect(applyLoreLexicon('a Tartarian Giant')).toBe('a tar tare ee an Giant');
    expect(applyLoreLexicon('Tartarians remember')).toBe('tar tare ee anz remember');
  });

  it('respells Reclaimer / Reclaimers (apostrophe stays attached)', () => {
    expect(applyLoreLexicon('a Reclaimer guard')).toBe('a ree clay mer guard');
    // The trailing apostrophe in "Reclaimers'" stays in place after
    // substitution — TTS reads "ree clay merz Outpost" naturally
    // because the apostrophe isn't pronounced.
    expect(applyLoreLexicon("the Reclaimers' Outpost")).toBe("the ree clay merz' Outpost");
  });

  it('respells place names (Drakova, Varakush, Asgardar, etc.)', () => {
    expect(applyLoreLexicon('north to Drakova')).toBe('north to druh koh vah');
    expect(applyLoreLexicon('Varakush sends scholars')).toBe('var ah koosh sends scholars');
    expect(applyLoreLexicon('the Asgardar capital')).toBe('the ahz gar dar capital');
  });

  it('leaves non-matching text untouched', () => {
    expect(applyLoreLexicon('Bert steps into the gate.')).toBe('Bert steps into the gate.');
    expect(applyLoreLexicon('')).toBe('');
  });

  it('matches only whole words', () => {
    // "Aetheric" inside another word shouldn't be replaced if it'd
    // break boundaries — but since "Aetheric" naturally only appears
    // as its own word, we just check no false positives.
    expect(applyLoreLexicon('preAethericalism')).toBe('preAethericalism');
  });

  it('lexicon is non-empty', () => {
    expect(getLexiconSize()).toBeGreaterThan(10);
  });
});
