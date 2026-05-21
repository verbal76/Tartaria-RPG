// Lore-respelling lexicon regression. The actual quality of the
// produced audio depends on Kokoro's phonemizer on the device,
// which we can't run in Jest — but we can lock the text-level
// substitutions so a future regex change doesn't silently regress
// the lore words we've already manually tuned.

import { applyLoreLexicon, cleanForSpeech, getLexiconSize } from '../app/voice/loreLexicon';

describe('applyLoreLexicon', () => {
  it('respells Aetheric (case-insensitive)', () => {
    expect(applyLoreLexicon('Aetheric Spear')).toBe('ay thur ik Spear');
    expect(applyLoreLexicon('aetheric')).toBe('ay thur ik');
    expect(applyLoreLexicon('AETHERIC')).toBe('ay thur ik');
  });

  it('respells Aetherstone / Aether / Aetherborn distinctly', () => {
    expect(applyLoreLexicon('the Aetherstone Flood')).toBe('the ay thur stone Flood');
    // Verify Aetherstone matches before plain Aether (longest first).
    expect(applyLoreLexicon('Aether vs Aetherstone')).toBe('ay thur vs ay thur stone');
    expect(applyLoreLexicon('an Aetherborn warrior')).toBe('an ay thur born warrior');
  });

  it('respells Tartaria / Tartarian / Tartarians', () => {
    expect(applyLoreLexicon('walk into Tartaria')).toBe('walk into tar tair ee uh');
    expect(applyLoreLexicon('a Tartarian Giant')).toBe('a tar tair ee un Giant');
    expect(applyLoreLexicon('Tartarians remember')).toBe('tar tair ee unz remember');
  });

  it('respells Reclaimer / Reclaimers (apostrophe stays attached)', () => {
    expect(applyLoreLexicon('a Reclaimer guard')).toBe('a ree clay mer guard');
    // The trailing apostrophe in "Reclaimers'" stays in place after
    // substitution — TTS reads "ree clay merz Outpost" naturally
    // because the apostrophe isn't pronounced.
    expect(applyLoreLexicon("the Reclaimers' Outpost")).toBe("the ree clay merz' Outpost");
  });

  it('respells place names (Drakova, Varakush, Asgardar, etc.)', () => {
    expect(applyLoreLexicon('north to Drakova')).toBe('north to dra koh vah');
    expect(applyLoreLexicon('Varakush sends scholars')).toBe('vara koosh sends scholars');
    expect(applyLoreLexicon('the Asgardar capital')).toBe('the az gar dar capital');
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

describe('cleanForSpeech', () => {
  it('rewrites travel arrows as "to"', () => {
    expect(cleanForSpeech('north → Armory')).toBe('north to Armory');
    expect(cleanForSpeech('east ← gate')).toBe('east to gate');
    expect(cleanForSpeech('north -> Armory')).toBe('north to Armory');
  });

  it('rewrites "-N" as "negative N" at word boundaries', () => {
    expect(cleanForSpeech('-2 AC')).toBe('negative 2 AC');
    expect(cleanForSpeech('grants -1 to attack')).toBe('grants negative 1 to attack');
    expect(cleanForSpeech('(-3 stamina)')).toBe('(negative 3 stamina)');
  });

  it('rewrites Unicode minus (U+2212) the same way', () => {
    // Combat / dice formatters emit U+2212, not ASCII -, so the
    // negative-number rule needs to catch both.
    expect(cleanForSpeech('−2 AC')).toBe('negative 2 AC');
    expect(cleanForSpeech('roll −1 to attack')).toBe('roll negative 1 to attack');
  });

  it('leaves word-internal hyphens alone', () => {
    expect(cleanForSpeech('well-known scholar')).toBe('well-known scholar');
    expect(cleanForSpeech('Mud-fist Wraps')).toBe('Mud-fist Wraps');
    expect(cleanForSpeech('e-mail')).toBe('e-mail');
  });

  it('rewrites middle-dot separator as comma', () => {
    expect(cleanForSpeech('north: Asgardar · east: Voronov')).toBe('north: Asgardar, east: Voronov');
  });

  it('strips wrapping single quotes around quoted words', () => {
    // Playtester report: Kokoro skipped the word entirely when wrapped in quotes.
    expect(cleanForSpeech("I do not see a 'wreck' here.")).toBe('I do not see a wreck here.');
    expect(cleanForSpeech("try: 'rest' or 'look'")).toBe('try: rest or look');
    // Smart-quote variant.
    expect(cleanForSpeech('She said ‘run’ and ran.')).toBe('She said run and ran.');
  });

  it('leaves contractions and possessives alone', () => {
    expect(cleanForSpeech("don't stop now")).toBe("don't stop now");
    expect(cleanForSpeech("Mark's blade")).toBe("Mark's blade");
    expect(cleanForSpeech("Reclaimers' Outpost")).toBe("Reclaimers' Outpost");
  });

  it('is idempotent (safe to apply twice)', () => {
    const once = cleanForSpeech('north → Armory · -2 AC');
    expect(cleanForSpeech(once)).toBe(once);
  });
});
