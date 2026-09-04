// loreLexicon — respelling overrides for Tartaria-specific words so
// the bundled Kokoro TTS pronounces them naturally instead of
// stumbling on unusual letter combinations (Ae-, -ush, -ova, etc.).
//
// Approach: instead of feeding Kokoro IPA phonemes directly (which
// would require us to phonemize the surrounding sentence too),
// we respell the offending words using regular English letters that
// the built-in phonemizer reads correctly. This is the same trick
// audiobook narrators write into their scripts.
//
// Rules:
//   - Match whole words only (\b boundaries), case-insensitive.
//   - Replace with the lowercase respelling. Case doesn't affect
//     speech output — the audio is the same regardless.
//   - Add new entries below as players surface mispronunciations.
//
// Why spaces instead of hyphens between syllables:
//   Kokoro's phonemizer (espeak-ng) treats hyphens as compound-word
//   joiners, not syllable separators — so "tar-tair-ee-uh" gets
//   mashed into one phonemized blob and the syllable boundaries we
//   wrote are ignored. With spaces, espeak sees each chunk as a
//   separate word and applies its letter-to-sound rules per word,
//   which produces clean, distinct syllables.
//
//   Use unambiguous English-orthography spellings: "tare" rhymes
//   with "hare", "ter" with "her", "koh" with "go", "eether" with
//   "ether", etc.
//
// If a respelling still sounds wrong, try alternate spellings — the
// right answer depends on the canonical Tartaria pronunciation and
// how espeak's letter-to-sound rules treat specific letter combos.

// ⚠ OTA-1147 — an entry may now supply a FUNCTION instead of a fixed string.
// Only the Aether catch-all needs it, and only to keep the file's own
// convention: every other entry replaces the whole word with a lowercase
// respelling, but a prefix rule leaves the tail exactly as authored — so
// "AETHERSTORM" would come out "aytherSTORM", and espeak spells all-caps runs
// out letter by letter. Lowercasing the tail keeps one word one word.
type LexiconReplacement = string | ((match: string, ...groups: string[]) => string);
const LEXICON: Array<[RegExp, LexiconReplacement]> = [
  // Aether family — playtester spec OTA-107 (final, after a
  // round of IPA-driven detours in OTAs 103/105/106). User's
  // canonical pattern is UNIFORM across the family: long-A "ay"
  // + "thur" + suffix. Caps cue: AY-thur. The IPA respellings
  // shipped in OTAs 103/105 over-interpreted character-level
  // detail (rhotic schwa "ther" vs "thur"; /ɛθ/ short-E start
  // for born/bat) and produced TTS output that didn't match
  // the user's intended pronunciation. Reverted here.
  //   Aether       → "ay thur"
  //   Aetheric     → "ay thur ik"
  //   Aetherstone  → "ay thur stone"
  //   Aetherborn   → "ay thur born"
  //   Aetherbat    → "ay thur bat"
  // ⚠ OTA-1147 — "ay thur" → "ayther", AND IT IS A PREFIX RULE NOW.
  // Owner: *"aether should be āther … anything starting with aether should
  // have it start with āther for pronunciation not spelling."*
  //
  // TWO CHANGES, and the second is the bigger one.
  //
  // 1. ONE WORD, NOT TWO. OTA-107 wrote the head as "ay thur" — two
  //    space-separated tokens, which is precisely what the file's own header
  //    says espeak treats as two separate words. So it was read as two
  //    stressed beats, AY · THUR, when the canon is a single smooth trochee:
  //    ā-ther. Closing the space makes espeak stress it once and glide the
  //    schwa, which is what the macron in the owner's "āther" is asking for.
  //
  // 2. ⚠ IT NOW COVERS THE WHOLE FAMILY, BECAUSE THE OLD LIST DID NOT. Five
  //    entries were enumerated (Aether / Aetheric / Aetherstone / Aetherborn
  //    / Aetherbat) and the content carries TWENTY: Aetherkin, Aethercraft,
  //    Aethercrafted, Aethercrafters, Aetherium, Aetherforge, Aetherforged,
  //    Aetherstorm, Aetherstorms, Aetherwing, Aetherwave, Aetherflame,
  //    Aetherlight, Aetherbound, Aethereal, Aetherons… Every one of those fell
  //    straight through to espeak's own letter-to-sound rules, which is the
  //    mispronunciation this family was respelled to prevent in the first
  //    place. A prefix rule cannot miss the next one someone authors — which
  //    is exactly what the owner asked for with "anything starting with".
  //
  // The named compounds keep their space before a SEPARATE ENGLISH WORD
  // (stone / born / bat / kin), because espeak gives a real word its own clean
  // letter-to-sound pass; bare suffixes like -ic and -ium stay attached so the
  // stress lands ay-THER-ik rather than AY-ther · ICK.
  [/\bAetherstone\b/gi, 'ayther stone'],
  [/\bAetherborn\b/gi, 'ayther born'],
  [/\bAetherbat\b/gi, 'ayther bat'],
  [/\bAetherkin\b/gi, 'ayther kin'],
  [/\bAetheric\b/gi, 'aytheric'],
  [/\bAether\b/gi, 'ayther'],
  // ⚠ THE CATCH-ALL, and it must sort LAST of the family. Any remaining
  // Aether-prefixed word keeps its own tail and just gains the right head:
  // Aetherstorm → aytherstorm, Aethercraft → aythercraft. No \b on the right,
  // because the whole point is that the word CONTINUES.
  [/\bAether([a-z]+)/gi, (_m: string, tail: string) => `ayther${tail.toLowerCase()}`],

  // Place names — long-vowel + multi-syllable mishaps.
  // Tartar* family is two beats: "tar" + the rest as one rapid stress
  // group. Earlier 4-chunk respelling ("tar tair ee uh") read as four
  // slow emphasized syllables; collapsing the trailing chunks into one
  // unbroken token lets espeak-ng pronounce tair+ee+uh as a single
  // beat per the playtester's "tar then everything-else-together" spec.
  //   Tartaria   = "tar taireea"
  //   Tartarian  = "tar taireean"
  //   Tartarians = "tar taireeans"
  //   Tartary    = "tar tar ee" (unchanged — different word)
  // ⚠ OTA-1659 — THE TAIL WAS EATING A SYLLABLE OUT OF THE GAME'S OWN NAME.
  // The respelling shipped as "taireeuh"/"taireeun"/"taireeunz", and measured
  // (`espeak-ng -v en-us -q --ipa`) espeak reads `eeu` as the GLIDE /juː/, not
  // as two vowels — so the trailing "-ee-uh" collapsed into "-yoo":
  //     tar taireeuh   → tˈɑːɹ tˈɛɹjuː     ("tar TERR-yoo")
  //     tar taireeunz  → tˈɑːɹ tˈɛɹjuːnts  (and a parasitic t on the plural)
  // Spelling the tail `-ea` / `-ean` / `-eans` — ordinary English orthography,
  // which is this file's whole convention — lands the intended three beats:
  //     tar taireea    → tˈɑːɹ tˈɛɹiə      tar taireean  → tˈɑːɹ tˈɛɹiən
  //     tar taireeans  → tˈɑːɹ tˈɛɹiənz
  [/\bTartaria\b/gi, 'tar taireea'],
  [/\bTartarian\b/gi, 'tar taireean'],
  [/\bTartarians\b/gi, 'tar taireeans'],
  [/\bTartary\b/gi, 'tar tar ee'],
  // Playtester spec OTA 219; place-name IPA refresh OTA-104 for Asgardar per
  // fresh playtester IPA: /ɛz gɑdɔɹ/ → "ez gah dor" (was "az gar dar"). Asgardar
  // genuinely OPENS on a vowel, so its leading "ez" is the word, not an addition.
  //
  // ⚠⚠⚠ OTA-1664 — SAMARRAN AND NIMARI ARE GONE FROM THIS LIST, because OTA-104
  // gave them a syllable they do not have. Owner: *"there should be no a sound
  // in front of either of those. the s and the n are the starting sound of each
  // word… it reads like you're mispronouncing the word, not a tone or
  // inflection, but adding a syllable."*
  //
  // He is exactly right, and the cause is a misread of the playtester's IPA.
  // OTA-104 took /ɛsɛmɔːɾɛn/ and /ɛnɛmɑɹi/, saw a leading ɛ, and wrote it out as
  // its own token — then said so in this comment: "all three open with a leading
  // /ɛ/ schwa that the prior respellings dropped. Samarran and Nimari are
  // 4-syllable words, not 3." Both sentences were wrong. Samarran is three
  // syllables and starts with S; Nimari is three and starts with N.
  //
  // Measured (`espeak-ng -v en-us -q --ipa`), the respellings were not a shade
  // off — they were a different word with an extra beat welded to the front:
  //
  //   eh sem or en    → ˈeɪ sˈɛm ɔːɹ ˈɛn   "AY-SEM-OR-EN"   (4 beats, 4 stresses)
  //   Samarran        → sˈæmæɹən           "SAM-a-run"      ✓
  //   eh neh mah ree  → ˈeɪ nˈeɪ mˈɑː ɹˈiː "AY-NAY-MAH-REE" (and "neh" says NAY)
  //   Nimari          → nˈɪmɚɹi            "NIM-uh-ree"     ✓
  //
  // The engine had both right on its own. This is the OTA-1659 finding again —
  // an entry added to "correct" a word the phonemizer was already reading
  // properly — and the removal is the fix, not a re-tune. If the canon wants a
  // different stress (suh-MAR-an rather than SAM-a-run) that is one entry, but
  // it must be measured first, and it must keep three syllables.
  [/\bDrakova\b/gi, 'dra koh vah'],
  [/\bVarakush\b/gi, 'vara koosh'],
  [/\bAsgardar\b/gi, 'ez gah dor'],
  [/\bVoronov\b/gi, 'voro nov'],
  [/\bThametan\b/gi, 'thuh meh tahn'],
  // ⚠ OTA-1659 — THIS RESPELLING WAS DESTROYING THE SOUND IT EXISTED TO PROTECT.
  // The worksheet's own key says `zh` ≈ the s in "treasure", and espeak agrees —
  // but the entry shipped as "zah rak", which drops the h and therefore the
  // sound. Measured: the RAW word was closer than the respelling.
  //     Zharak    → ʒˈæɹæk    (raw: right consonant, wrong vowel)
  //     zah rak   → zˈɑː ɹˈæk (shipped: right vowel, plain Z — the zh is gone)
  //     zhah rak  → ʒˈɑː ɹˈæk (both)
  [/\bZharak\b/gi, 'zhah rak'],

  // Faction / role nouns sometimes mangled by stress placement.
  // Monarch — playtester spell-it-out spec OTA-109: "mon-nark"
  // (first syllable "mon" rhymes with "on", second syllable
  // "nark" rhymes with "park"). User initially gave IPA
  // /ˈmɑnɑrk/ in OTA-108 which I parsed as MAH-nark; when
  // refining to /ˈmɑːnɑːrk/ they clarified the ear they hear
  // is "mon-nark" — the standard English pronunciation with
  // the syllable-boundary N audible. The spell-it-out cue wins
  // over the IPA parse per the OTA-107 rule.
  [/\bReclaimer\b/gi, 'ree clay mer'],
  [/\bReclaimers\b/gi, 'ree clay merz'],
  [/\bMud Monarchs\b/gi, 'mud mon narks'],
  [/\bMud Monarch\b/gi, 'mud mon nark'],
  [/\bMonarchs\b/gi, 'mon narks'],
  [/\bMonarch\b/gi, 'mon nark'],

  // Lore objects.
  [/\bRunecaster\b/gi, 'rune caster'],
  [/\bRunecasters\b/gi, 'rune casters'],

  // ⚠ OTA-1659 — THE "doesn't" ENTRY IS GONE, BECAUSE IT NEVER DID ANYTHING.
  // It claimed espeak reads the contraction as "DOSE-ent" (like "rose") and
  // respelled it "duzzent" to force the /ʌ/. Measured, the two are the same
  // string of phonemes — espeak has "doesn't" in its dictionary and always had
  // it right:
  //     doesn't  → dˈʌzənt        duzzent → dˈʌzənt
  // Same class of mistake as the article: an entry added to correct a word the
  // phonemizer already knew. This one was merely inert; "the" was not.
];

// OTA 013 — sort lexicon entries by pattern length descending so
// longer phrases always try first. "Aetherstone" should never be
// pre-empted by "Aether" matching the first 6 chars (\b boundaries
// usually prevent this, but the safety belt protects against future
// authors adding overlapping entries out of order).
// ⚠ OTA-1147 — and a SECOND key, ahead of length: catch-alls run LAST.
// Length alone got this exactly backwards for the Aether family. The prefix
// rule's source (`\bAether(?=[a-z])`, 17 chars) is LONGER than the named
// compound it must never pre-empt (`\bAetherstone\b`, 15), so sorting by
// length alone would have fired the catch-all first and turned every
// "ayther stone" into "aytherstone" — silently, since both still sound
// roughly right and no test would have been looking. A pattern that ends in a
// lookahead is by definition the fallback for whatever the named entries
// missed, so it sorts after all of them regardless of how long it is.
const isCatchAll = (re: RegExp): boolean => !re.source.endsWith('\\b');
const SORTED_LEXICON: Array<[RegExp, LexiconReplacement]> = [...LEXICON]
  .sort((a, b) => {
    const catchAllDelta = (isCatchAll(a[0]) ? 1 : 0) - (isCatchAll(b[0]) ? 1 : 0);
    if (catchAllDelta !== 0) return catchAllDelta;
    return b[0].source.length - a[0].source.length;
  });

// 2026-05-25 [TTS-1] — inline-phoneme override channel. The user asked "we
// should see if kokoro can read ipa text" with /tɑːrˈtɑːriə/ as
// the example case for "Tartaria." Kokoro's phonemizer is
// espeak-ng-derived, and espeak-ng accepts inline phonemes wrapped
// in double brackets. Whether the bracket syntax survives the
// Kokoro tokenizer is verified on-device only — this map is OFF by
// default. To enable: flip the IPA_OVERRIDES_ENABLED flag at the
// top of applyLoreLexicon.
//
// ⚠⚠⚠ OTA-1659 — THIS MAP WAS A LOADED GUN AND THE ENCODING WAS THE TRIGGER.
// It shipped holding Unicode IPA, and Unicode IPA is NOT what espeak-ng reads
// between double brackets — it reads its OWN ASCII phoneme mnemonics. Measured
// on espeak-ng 1.51 (`espeak-ng -v en-us -q --ipa`):
//
//     [[ðə]] blade     →  "blˈeɪd"        ⚠ THE WORD IS GONE. Silently.
//     [[D@]] blade     →  "ðə blˈeɪd"     ✓
//
// So the failure mode of flipping that flag was never "Kokoro reads the
// brackets out loud" — the comment's own stated worst case — it was that every
// Tartaria, Tartarian, Drakova and Aether in the game would go SILENT, leaving
// a hole in the sentence with no error anywhere. Rewritten below in the
// mnemonics, each one measured through the same command:
//
//     [[tA:t'A:ri@]]   →  tɑːtˈɑːɹiə        [[tA:t'A:ri@n]]  → tɑːtˈɑːɹiən
//     [[tA:t'A:ri@nz]] →  tɑːtˈɑːɹiənz      [[dr@k'oUv@]]    → dɹəkˈoʊvə
//     [['eIT@]]        →  ˈeɪθə
//
// The flag stays OFF — device verification is still the only thing that can
// turn it on — but it is now safe to flip, which it demonstrably was not.
const IPA_OVERRIDES: Record<string, string> = {
  Tartaria:   "tA:t'A:ri@",
  Tartarian:  "tA:t'A:ri@n",
  Tartarians: "tA:t'A:ri@nz",
  Drakova:    "dr@k'oUv@",
  Aether:     "'eIT@",
};
function applyIPAOverrides(text: string): string {
  let out = text;
  for (const [word, ipa] of Object.entries(IPA_OVERRIDES)) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'gi'), `[[${ipa}]]`);
  }
  return out;
}

/**
 * Apply the lore lexicon to a chunk of text before it goes to the
 * Kokoro TTS engine. Pure function; safe to call on every speak().
 *
 * 2026-05-25 [TTS-1] — IPA experiment is OFF by default. Flip to
 * true to ship IPA-wrapped proper-noun output to Kokoro. If on-
 * device verification shows clean pronunciation, leave on and
 * remove the respelling regexes that the IPA entries cover.
 */
const IPA_OVERRIDES_ENABLED = false;
export function applyLoreLexicon(text: string): string {
  let out = IPA_OVERRIDES_ENABLED ? applyIPAOverrides(text) : text;
  for (const [pattern, replacement] of SORTED_LEXICON) {
    out = typeof replacement === 'string'
      ? out.replace(pattern, replacement)
      : out.replace(pattern, replacement);
  }
  // ⚠⚠⚠ OTA-1659 — AND NOTHING TOUCHES "the". See the block below; the article
  // is the one word in this file the engine already had exactly right, and the
  // respelling OTA-1146 added here is what the owner has been hearing.
  return out;
}

// ⚠⚠⚠ OTA-1659 — "the" IS NOT IN THIS LEXICON, AND IT NEVER SHOULD HAVE BEEN.
//
// Owner, twice: *"kokoro pronounces the as thee it should be pronounce thuh or
// tha"* (→ OTA-1146) and then again, still wrong: *"the needs to be pronounced
// thuh in kokoro."*
//
// OTA-1146 answered the first report by adding a rule right here that rewrote
// every consonant-position "the" to the literal string "thuh" before handing
// the line to the engine. That rule is what he has been hearing ever since, and
// this is the measurement that says so — espeak-ng 1.51, the phonemizer this
// app bundles per voice under `<voice>/espeak-ng-data/`, run as
// `espeak-ng -v en-us -q --ipa`:
//
//     "The raider swings the rusted blade at the dog."
//        plain     →  ðə ɹˈeɪdɚ swˈɪŋz ðə ɹˈʌstᵻd blˈeɪd æt ðə dˈɑːɡ
//        OTA-1146  →  θˈʌ ɹˈeɪdɚ swˈɪŋz θˈʌ ɹˈʌstᵻd blˈeɪd æt θˈʌ dˈɑːɡ
//
// ⚠ THE ENGINE ALREADY SAID "thuh". `ðə` IS "thuh" — that is the exact sound he
// asked for, and the untouched text was already producing it three times in
// that sentence. What the respelling did was replace it with `θˈʌ`: wrong
// consonant (the voiceless th of THUMB, not the voiced th of THIS), wrong vowel
// (the STRUT vowel of "duh", not a schwa) and — worst of all — STRESSED, since
// espeak stresses an unknown monosyllable it has to sound out. An unstressed
// article turned into a hard stressed beat before every noun in the game.
//
// ⚠⚠ THE ESCAPE HATCH OTA-1146 WROTE COULD NEVER HAVE WORKED EITHER. It said
// that if the voicing came back wrong the alternates to try, in order, were
// "thuh" → "thu" → "tha". Measured, all three are voiceless and all three are
// stressed — the ladder only ever changed the vowel, and the vowel was not the
// defect:
//
//     thuh → θˈʌ        thu → θˈɜː        tha → θˈɑː
//
// ⚠⚠⚠ AND NO RESPELLING COULD HAVE WORKED, WHICH IS THE REAL FINDING. espeak-ng
// gives word-initial `th` its VOICELESS reading for every word not in its
// dictionary — voiced /ð/ at the head of a word survives only in the closed set
// of function words it already knows (the, this, that, them, than, thus). And
// the narrator's "dh" convention is worse than useless here, because espeak
// reads it as an initialism:
//
//     dhuh → dˈiːhˈʌ ("dee-huh")      dha → dˌiːˌeɪtʃˈeɪ ("dee-aitch-ay")
//
// So there is exactly one string that phonemizes to /ðə/ on this engine, and it
// is "the". The dictionary entry is `Found: 'the' [D@2]` — schwa, stress level
// 2, i.e. unstressed — and espeak applies the vowel/consonant switch itself,
// measured identical on en-us, en-gb and en-gb-x-rp:
//
//     the blade → ðə      the guardian → ðə      the dog → ðə
//     the hour  → ðɪ      the ayther   → ðɪ
//
// That last line matters: the lexicon above respells "Aether" to "ayther", and
// the engine STILL gets the article right, because it judges the text actually
// handed to it. The context rule OTA-1146 reimplemented in JavaScript — with
// two hand-maintained exception lists for hour/honest/heir and use/unit/one —
// was already there, in C, in the dictionary, and correct.
//
// ⚠ THE RULE THIS LEAVES: this file respells words the phonemizer does NOT
// know. "the" is the single most common word in English and the first entry in
// its dictionary. Respelling into the engine's own vocabulary does not correct
// it, it overrides it — with letters the engine has no entry for, which is
// precisely the condition that produces a mispronunciation. Before adding an
// entry here, check that espeak actually gets the word wrong; the command above
// is the whole test.

/**
 * TTS-only text cleanup. Strips / rewrites symbols that the engine
 * would otherwise read literally (the player would hear "right
 * arrow" for → or "minus two" for -2). The visible game log keeps
 * the original symbols — this transform applies only to the copy
 * we hand to the engine.
 *
 * Rules:
 *   - " → " / " ← " / " ⇒ " / " -> "  →  " to " (travel arrows)
 *     Bare-symbol fallback (no surrounding spaces) drops to " to "
 *     too, just in case.
 *   - "-N" preceded by start / whitespace / punctuation  →
 *     "negative N" (the visible "-2 AC" stays; the spoken line
 *     becomes "negative 2 AC"). Word-internal hyphens like
 *     "well-known" or "Mud-fist" are untouched.
 *   - "×N" / "x N" stays — engine handles "times" fine.
 *   - "·" middle-dot → ", " so the engine pauses naturally instead
 *     of reading "middle dot".
 */
export function cleanForSpeech(text: string): string {
  let out = text;
  // Arrows — single or surrounded by spaces.
  out = out.replace(/\s*[→←⇒⇐]\s*/g, ' to ');
  out = out.replace(/\s*->\s*/g, ' to ');
  // Middle-dot separator becomes a comma+space so we get a breath.
  out = out.replace(/\s*·\s*/g, ', ');
  // Em / en dashes — playtester asked for these to speak as commas.
  // Some TTS engines read an em-dash as a long dead gap that can
  // swallow the clause after it (the "skipped sentence" report); a
  // comma gives a clean, natural pause instead. The visible game log
  // keeps the typographic dash — this only touches the spoken copy.
  // Surrounding spaces are collapsed so we don't leave a double space.
  out = out.replace(/\s*[—–]\s*/g, ', ');
  // Spaced ASCII hyphen used as a dash ("a cudgel - on the floor"). Same
  // problem as the em-dash: the engine reads it as a dead gap that eats
  // the next word. Only a hyphen with whitespace on BOTH sides matches, so
  // compound words ("well-known") and "-2" negatives are left untouched.
  out = out.replace(/\s+-\s+/g, ', ');
  // Unicode "minus sign" (U+2212) shows up in combat lines emitted by
  // the dice/roll formatter and weapon-effect narration. Normalize it
  // to the ASCII "-" so the negative-number rule below catches it.
  out = out.replace(/−/g, '-');
  // Negative numbers — only when "-" is at a word boundary preceding
  // a digit, so word-internal hyphens (e.g. "well-known", "Mud-fist
  // Wraps") aren't touched.
  out = out.replace(/(^|[\s(\[{,;])-(\d)/g, '$1negative $2');
  // OTA 223 — strip single-quote wrappers around a quoted word.
  // Playtester: "the Arbiter said 'I do not see a 'wreck' here' but
  // Kokoro skipped 'wreck' because of the single quotes." The
  // visible log keeps the quotes for emphasis (they read fine on
  // screen) but the TTS-bound copy drops them so espeak / Kokoro
  // pronounces the word cleanly.
  //
  // Pattern: 'TOKEN' where TOKEN has letters/digits/space/hyphen
  // (not another apostrophe) and is bounded outside by whitespace
  // or punctuation. This leaves possessives ("Mark's") and
  // contractions ("don't") untouched because they have letters on
  // both sides of the apostrophe.
  // OTA 013 — was {0,30} which silently passed longer quoted
  // phrases through to Kokoro unstripped. Widened to {0,160} so
  // any reasonable in-game quotation gets cleaned (most lines are
  // < 80 chars; 160 covers Arbiter dialog in full).
  out = out.replace(/(^|[\s(\[{>])'([A-Za-z0-9][A-Za-z0-9 \-]{0,160}[A-Za-z0-9])'(?=$|[\s)\].,!?;:])/g, '$1$2');
  // Same rule for "smart" single quotes ' and ' (U+2018 / U+2019)
  // — emitted by some authoring sources.
  out = out.replace(/(^|[\s(\[{>])[‘’]([A-Za-z0-9][A-Za-z0-9 \-]{0,160}[A-Za-z0-9])[‘’](?=$|[\s)\].,!?;:])/g, '$1$2');
  return out;
}

/** Exposed for tests + the settings card so we can show the player
 *  the override count ("12 lore words pronounced manually"). */
export function getLexiconSize(): number {
  return LEXICON.length;
}
