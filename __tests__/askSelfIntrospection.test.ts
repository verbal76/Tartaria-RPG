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

// OTA-242 — Arbiter introspection (second-person questions).
const WHO_ARE_YOU = /\bwho\s+are\s+you\b/;
const WHAT_ARE_YOU = /\bwhat\s+(are|is)\s+(you|the\s+arbiter)\b/;
const WHO_IS_ARBITER = /\bwho\s+is\s+the\s+arbiter\b/;
const TELL_ME_ABOUT_ARBITER = /\btell\s+me\s+about\s+(you|the\s+arbiter|yourself)\b/;
const DESCRIBE_ARBITER = /\bdescribe\s+(you|yourself|the\s+arbiter)\b/;

const WHY_ARE_YOU_HERE = /\bwhy\s+are\s+you\s+(here|with\s+me)\b/;
const WHAT_ARE_YOU_DOING = /\bwhat\s+are\s+you\s+doing\s+(here|with\s+me)\b/;
const WHATS_YOUR_PURPOSE = /\bwhat(?:'s|\s+is)\s+your\s+(purpose|mission|role|job|task)\b/;

const WHERE_ARE_YOU_FROM = /\bwhere\s+(are|were)\s+you\s+from\b/;
const WHERE_DID_YOU_COME = /\bwhere\s+did\s+you\s+come\s+from\b/;

const ARE_YOU_X = /\bare\s+you\s+(alive|dead|real|human|a\s+(ghost|spirit|god|relic|machine|person|man|woman))\b/;
const WHATS_YOUR_NAME = /\bwhat(?:'s|\s+is)\s+your\s+name\b/;
const DO_YOU_HAVE_NAME = /\bdo\s+you\s+have\s+a\s+name\b/;

function category(q: string): string | null {
  const t = q.toLowerCase();
  // Arbiter introspection. Order matters: specific patterns first
  // ("what are you doing here" → purpose) before the broader
  // "what are you" → identity match would swallow them.
  if (WHY_ARE_YOU_HERE.test(t) || WHAT_ARE_YOU_DOING.test(t) || WHATS_YOUR_PURPOSE.test(t)) return 'arbiter_purpose';
  if (WHERE_ARE_YOU_FROM.test(t) || WHERE_DID_YOU_COME.test(t)) return 'arbiter_origin';
  if (ARE_YOU_X.test(t)) return 'arbiter_nature';
  if (WHATS_YOUR_NAME.test(t) || DO_YOU_HAVE_NAME.test(t)) return 'arbiter_name';
  if (WHO_ARE_YOU.test(t) || WHAT_ARE_YOU.test(t) || WHO_IS_ARBITER.test(t)
      || TELL_ME_ABOUT_ARBITER.test(t) || DESCRIBE_ARBITER.test(t)) return 'arbiter_identity';
  // Player introspection.
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

  // OTA-242 — Arbiter introspection patterns.
  it.each([
    ['who are you', 'arbiter_identity'],
    ['what are you', 'arbiter_identity'],
    ['what is the arbiter', 'arbiter_identity'],
    ['who is the arbiter', 'arbiter_identity'],
    ['tell me about yourself', 'arbiter_identity'],
    ['describe yourself', 'arbiter_identity'],
    ['why are you here', 'arbiter_purpose'],
    ['what are you doing here', 'arbiter_purpose'],
    ["what's your purpose", 'arbiter_purpose'],
    ['what is your role', 'arbiter_purpose'],
    ['where are you from', 'arbiter_origin'],
    ['where did you come from', 'arbiter_origin'],
    ['are you alive', 'arbiter_nature'],
    ['are you a ghost', 'arbiter_nature'],
    ['are you human', 'arbiter_nature'],
    ['are you real', 'arbiter_nature'],
    ["what's your name", 'arbiter_name'],
    ['do you have a name', 'arbiter_name'],
  ])('arbiter introspection: "%s" → %s', (input, expected) => {
    expect(category(input)).toBe(expected);
  });

  it('inventory questions do not match introspection', () => {
    expect(category('do I have a locket')).toBeNull();
    expect(category('is the torch in my pack')).toBeNull();
  });
});
