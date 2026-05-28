// OTA-159 — regression lock for `defend` routing to dodge (defensive
// stance) instead of help (backup-call). Stress sweep flagged
// `defendd` → help as a false positive — player intent for `defend`
// in combat is clearly a parry stance, not a help-call. Other help
// synonyms (help / aid / assist / support / cover / bolster /
// reinforce) still cover the backup-call intent.

jest.setTimeout(15000);

import { parseInput } from '../app/engine/parser';

describe('OTA-159 — `defend` routes to dodge, not help', () => {
  it.each(['defend', 'defendd', 'defends'])(
    '%j parses to dodge intent',
    (input) => {
      const r = parseInput(input, { ambientNouns: [] });
      expect(r.intent).toBe('dodge');
    },
  );

  it.each([
    ['help', 'help'],
    ['assist', 'help'],
    ['aid', 'help'],
    ['support', 'help'],
    ['cover', 'help'],
    ['bolster', 'help'],
    ['reinforce', 'help'],
  ])('%j still parses to %s (help backup-call intact)', (input, intent) => {
    const r = parseInput(input, { ambientNouns: [] });
    expect(r.intent).toBe(intent);
  });

  it.each([
    ['parry', 'dodge'],
    ['block', 'dodge'],
    ['guard', 'dodge'],
    ['shield', 'dodge'],
  ])('%j still parses to %s (existing dodge synonyms intact)', (input, intent) => {
    const r = parseInput(input, { ambientNouns: [] });
    expect(r.intent).toBe(intent);
  });
});
