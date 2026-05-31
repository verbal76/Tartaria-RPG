// OTA-145 — theft-channel guard regression lock.
//
// Pre-OTA-145, the guard regex matched the substring "thief" anywhere.
// Playtest log showed every "Silt Thief" combat line and every
// location-entry beat pulling lore mentioning "thief" silently blocked
// → player watched their Aether Golem die over 6 invisible combat
// rounds while typing `use golem` repeatedly. Six combat rounds of
// nothing visible.
//
// Fix: tighten the regex to require the alarm punctuation (`thief!`)
// which is the canonical signature of the authored theft-alarm line
// "Thief! — steel comes out." Enemy names like "Silt Thief", arbiter
// quotes like "A good thief leaves only a question behind", lore
// concepts, and NPC dialogue all use "thief" WITHOUT the bang and
// must remain visible.

jest.setTimeout(15000);

// Re-extract the regex from the gameStore source so the test stays
// in sync with the actual guard. If a future edit weakens the regex
// (e.g. drops the !) the matching cases below will surface it.
import * as fs from 'fs';
import * as path from 'path';

function extractTheftRegex(): RegExp {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../app/state/gameStore.ts'),
    'utf-8',
  );
  // Pattern: `const THEFT_NARRATION_RE = /...../i;`
  const m = src.match(/THEFT_NARRATION_RE\s*=\s*\/(.+?)\/i;/);
  if (!m) throw new Error('THEFT_NARRATION_RE not found in gameStore.ts');
  return new RegExp(m[1]!, 'i');
}

describe('OTA-145 theft-channel guard — only matches the alarm line', () => {
  const re = extractTheftRegex();

  describe('MUST block (true positives)', () => {
    it.each([
      'Thief! — steel comes out.',
      'thief! — steel comes out.',
      '"Thief!" — the vendor draws on you.',
      'caught mid-lift',
      'caught mid lift',
      'You\'re caught mid-lift.',
      'steel comes out',
      'answer for your actions',
      'answer for my deeds',
    ])('blocks: %j', (line) => {
      expect(re.test(line)).toBe(true);
    });
  });

  describe('MUST NOT block (false positives that hit pre-OTA-145)', () => {
    it.each([
      // Enemy name in combat narration (the actual production bug)
      'Aether Golem attacks Silt Thief — d20 3 = 3 vs AC 10 — ✗ MISS',
      'Aether Golem lands 4 aetheric damage on Silt Thief. (24 HP left)',
      'Silt Thief retaliates — d20 7 + 5 hits Aether Golem for 2. (12/14)',
      'Silt Thief swings at Aether Golem and misses.',
      // Enemy name in scene description
      'A Silt Thief crouches in the rubble, weighing your pack with their eyes.',
      // Arbiter quote (authored)
      'A good thief leaves only a question behind. Leave less than that.',
      // Lore concept beat
      'The Reclaimers code: salvage like a thief, return like a hero.',
      // NPC dialogue
      '"My brother was a thief," she says. "He got better."',
      // Item description (relic)
      'A stone used to protect vaults, confuses Etheric thieves.',
      // Plural usage
      'Thieves work the silt corridors here after dark.',
      // Voronov-entry lore (the playtester repro)
      'You\'ve left Cradle of Dusk and entered Voronov. Voronov was struck deepest.',
    ])('passes: %j', (line) => {
      expect(re.test(line)).toBe(false);
    });
  });
});
