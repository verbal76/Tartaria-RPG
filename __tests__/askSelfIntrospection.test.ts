// OTA-240 — Ask-the-Arbiter self-introspection patterns.
//
// The Ask Arbiter button surfaces three answer paths:
//   1. Self-introspection ("who am I", "how am I", "why am I here") —
//      this test pins the regex shape so the patterns don't drift.
//   2. Inventory questions (covered in askInventory.test).
//   3. Lore lookup via MiniLM (covered in askArbiter.test).
//
// The patterns live inline in gameStore's case 'ask'; this file
// extracts the same regexes so the contract is testable without
// spinning up the store.

const WHO_AM_I = /\bwho\s+(am\s+i|is\s+(this\s+character|i)|i)\b/;
const WHATS_MY_NAME = /\bwhat(?:'s|\s+is)\s+my\s+name\b/;
const TELL_ME_ABOUT_ME = /\btell\s+me\s+about\s+(me|myself|my\s+character)\b/;
const DESCRIBE_ME = /\bdescribe\s+(me|myself|my\s+character)\b/;

const HOW_AM_I = /\bhow\s+(am\s+i|are\s+you|am\s+i\s+doing)\b/;
const AM_I_STATE = /\bam\s+i\s+(ok|okay|healthy|hurt|alive|dying)\b/;
const WHATS_MY_HEALTH = /\bwhat(?:'s|\s+is)\s+my\s+(hp|health|stamina|condition|state)\b/;

const WHY_AM_I_HERE = /\bwhy\s+am\s+i\s+here\b/;
const WHAT_AM_I_DOING = /\bwhat\s+am\s+i\s+(doing|here\s+for|supposed\s+to\s+do)\b/;
const WHATS_MY_PURPOSE = /\bwhat(?:'s|\s+is)\s+my\s+(purpose|mission|goal|task)\b/;

const WHATS_MY_RACE = /\bwhat(?:'s|\s+is)\s+my\s+race\b/;
const WHAT_AM_I = /\bwhat\s+(am\s+i|race\s+am\s+i)\b/;

const WHATS_MY_FACTION = /\bwhat(?:'s|\s+is)\s+my\s+faction\b/;
const WHO_DO_I_SERVE = /\bwho\s+do\s+i\s+(serve|work\s+for)\b/;
const WHICH_FACTION = /\bwhich\s+faction\b/;

function category(q: string): string | null {
  const t = q.toLowerCase();
  if (WHO_AM_I.test(t) || WHATS_MY_NAME.test(t) || TELL_ME_ABOUT_ME.test(t) || DESCRIBE_ME.test(t)) return 'identity';
  if (HOW_AM_I.test(t) || AM_I_STATE.test(t) || WHATS_MY_HEALTH.test(t)) return 'health';
  if (WHY_AM_I_HERE.test(t) || WHAT_AM_I_DOING.test(t) || WHATS_MY_PURPOSE.test(t)) return 'purpose';
  if (WHATS_MY_RACE.test(t) || WHAT_AM_I.test(t)) return 'race';
  if (WHATS_MY_FACTION.test(t) || WHO_DO_I_SERVE.test(t) || WHICH_FACTION.test(t)) return 'faction';
  return null;
}

describe('OTA-240 — self-introspection question patterns', () => {
  it.each([
    ['who am I', 'identity'],
    ['who am i', 'identity'],
    ['what is my name', 'identity'],
    ["what's my name", 'identity'],
    ['tell me about myself', 'identity'],
    ['describe me', 'identity'],
    ['how am I doing', 'health'],
    ['how am i', 'health'],
    ['am I hurt', 'health'],
    ['am i ok', 'health'],
    ["what's my hp", 'health'],
    ['what is my health', 'health'],
    ['why am I here', 'purpose'],
    ['what am I doing', 'purpose'],
    ["what's my purpose", 'purpose'],
    ['what is my mission', 'purpose'],
    ["what's my race", 'race'],
    ['what am I', 'race'],
    ['what race am I', 'race'],
    ["what's my faction", 'faction'],
    ['who do I serve', 'faction'],
    ['which faction', 'faction'],
  ])('"%s" → %s', (input, expected) => {
    expect(category(input)).toBe(expected);
  });

  it('lore questions do not match introspection', () => {
    expect(category('what is the aether')).toBeNull();
    expect(category('who are the reclaimers')).toBeNull();
    expect(category('tell me about the berlin betrayal')).toBeNull();
  });

  it('inventory questions do not match introspection', () => {
    expect(category('do I have a locket')).toBeNull();
    expect(category('is the torch in my pack')).toBeNull();
  });
});
