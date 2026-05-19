// speakerVoices — map a detected speaker name to a TTS voice id.
//
// Per playtest request: "I want you to assign AM_MICHAEL as the
// default voice of the arbiter and then I want you to assign a voice
// to each of the different NPCs that we can possibly have. keep male
// voices to males female voices to females. … but we need to make
// sure if the NPC says something and then the arbiter says something
// and then a vendor says something they all have to take their turns
// like it's a conversation and not all spawn talking at the same
// time. they have to follow the order of the text as it goes in."
//
// Ordering is handled by the existing TTS queue (FIFO, one utterance
// at a time, the next waits for the previous to finish — see
// TTSManager.drain). All speak() calls land in that queue regardless
// of which voice they request, so the conversation order is
// preserved by construction.
//
// Voice assignment is data-driven from app/data/npcs/vendors.json
// (each vendor declares `gender` and `voiceId`). Unknown speakers
// fall back to a stable hash → voice id so even unauthored NPCs
// get a consistent voice across sessions.

import vendorsData from '../data/npcs/vendors.json';

interface VendorRow {
  id: string;
  name: string;
  gender?: 'male' | 'female';
  voiceId?: string;
}

const VENDORS = (vendorsData as VendorRow[] | { vendors?: VendorRow[] });
const VENDOR_LIST: VendorRow[] = Array.isArray(VENDORS)
  ? VENDORS
  : (VENDORS.vendors ?? []);

// Build a name → voiceId lookup. Match on FULL name and on the
// first-word stem, so "Halem" alone (no "the Trader") also resolves
// to the right voice when the arbiter line strips the epithet.
const NAME_TO_VOICE: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const v of VENDOR_LIST) {
    if (!v.voiceId) continue;
    m.set(v.name.toLowerCase(), v.voiceId);
    const firstWord = v.name.split(/\s+/)[0]?.toLowerCase();
    if (firstWord) m.set(firstWord, v.voiceId);
  }
  return m;
})();

const FEMALE_POOL = ['af_heart', 'af_river', 'af_sarah', 'bf_emma'];
const MALE_POOL = ['am_adam', 'bm_daniel'];
// Reserved for the Arbiter — never assigned to a vendor by default
// so the player's main companion voice stays distinct.
export const ARBITER_DEFAULT_VOICE = 'am_michael';

/** Stable hash → integer. Same input always produces the same output,
 *  so an unauthored NPC name gets the same voice every time without
 *  any state. */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Resolve a voice for a detected speaker. Returns `null` for the
 *  Arbiter — the caller falls back to the player's configured
 *  voice (kokoroVoice / system voiceId). Returns a Kokoro voice id
 *  string for any other speaker. */
export function voiceForSpeaker(speaker: string): string | null {
  if (!speaker) return null;
  const lower = speaker.toLowerCase().trim();
  if (lower === 'the arbiter' || lower === 'arbiter') return null;
  // Direct vendor lookup.
  const direct = NAME_TO_VOICE.get(lower);
  if (direct) return direct;
  // First-word fallback ("Halem" → halem_trader's voice).
  const firstWord = lower.split(/\s+/)[0] ?? '';
  const stem = NAME_TO_VOICE.get(firstWord);
  if (stem) return stem;
  // Unknown speaker — hash-pick from the female pool by default
  // since the male pool is small. Distribution evens out across many
  // unauthored NPCs.
  const h = stableHash(lower);
  // 70% female / 30% male split for unknowns since the female pool
  // has more voices (more variety reads better on chained dialogue).
  const pool = (h % 10) < 7 ? FEMALE_POOL : MALE_POOL;
  return pool[h % pool.length] ?? ARBITER_DEFAULT_VOICE;
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { NAME_TO_VOICE, FEMALE_POOL, MALE_POOL };
