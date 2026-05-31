// OTA-157 — regression lock for the no-space travel-verb splitter.
// Stress sweep (drunkSpelling) flagged `gowest`, `gonorth`, etc.
// all routing to intent=unknown because the tokenizer splits on
// whitespace. Fix: insert a space between known travel verbs and
// cardinal/vertical directions in normalizeInput, before tokenize.
//
// Locks the catches AND the no-regression cases (words that
// LEGITIMATELY start with these prefixes like `goth`, `runic`,
// `walking`, `heads` must not get split).

jest.setTimeout(15000);

import { parseInput, normalizeInput } from '../app/engine/parser';

describe('OTA-157 — no-space travel-verb compounds split correctly', () => {
  describe('MUST split (route to travel intent)', () => {
    it.each([
      'gowest', 'goeast', 'gonorth', 'gosouth', 'goup', 'godown',
      'walknorth', 'walkwest',
      'headwest', 'headsouth',
      'travelnorth', 'traveleast',
    ])('parses %j as travel intent', (input) => {
      const r = parseInput(input, { ambientNouns: [] });
      expect(r.intent).toBe('travel');
    });
  });

  describe('MUST split (route to escape intent for `run<dir>` — `run` is a flee synonym)', () => {
    it.each(['runnorth', 'runeast', 'runwest', 'runsouth'])(
      'parses %j as escape intent (still an improvement over unknown)',
      (input) => {
        const r = parseInput(input, { ambientNouns: [] });
        expect(r.intent).toBe('escape');
      },
    );
  });

  describe('MUST NOT split (legit words with these prefixes survive)', () => {
    it.each([
      // "goth" — starts with `go` but `th` isn't a direction
      ['goth'],
      // "runic" — starts with `run` but `ic` isn't a direction
      ['runic'],
      // "walking" — starts with `walk` but `ing` isn't a direction
      ['walking'],
      // "heads" — starts with `head` but `s` isn't a direction
      ['heads'],
    ])('does not split %j', (input) => {
      const norm = normalizeInput(input);
      // The token should remain intact (no space inserted).
      expect(norm).toBe(input);
    });
  });

  describe('with-space forms still work (no regression)', () => {
    it.each([
      'go west', 'go north', 'go east', 'go south',
      'walk north', 'travel east',
    ])('parses %j as travel intent', (input) => {
      const r = parseInput(input, { ambientNouns: [] });
      expect(r.intent).toBe('travel');
    });
  });
});
