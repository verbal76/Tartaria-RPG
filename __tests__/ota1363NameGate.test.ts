/**
 * OTA-1363 — the shared roll is on HAL, behind a two-name door.
 *
 * Owner: *"port the feature to Hal, but make it only visible if the characters
 * name is Verbal or Sasmooch."*
 *
 * ⚠⚠ THIS SUITE IS HAL-ONLY AND MUST STAY THAT WAY. The other three lines ship
 * the exchange open to everyone; if this file is ever ported to golem, steam or
 * html it will pass there too (the function is in the shared engine file) while
 * asserting a gate those lines deliberately do not apply to the panel. The
 * marker below is what tells a future porter to leave it behind.
 *
 * What is actually being locked down:
 *   1. the matcher's shape — prefix, case-insensitive, punctuation-blind, and
 *      REFUSING the empty name, which is the one input a real save can produce
 *      (a half-built character between the name prompt and the race prompt);
 *   2. that the EXCHANGE panel — the only import/export entry point in the app —
 *      is behind it;
 *   3. that the ENGINE is NOT behind it, which is the part most likely to be
 *      "tidied" later by someone who reads the gate as a feature flag.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { sharingUnlockedFor, SHARING_UNLOCK_NAMES } from '../app/engine/fallenLedger';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codex = src('app', 'components', 'LoreCodexBody.tsx');
const store = src('app', 'state', 'gameStore.ts');

describe('OTA-1363 — HAL ONLY: the two-name door', () => {
  it('⚠⚠ HAL-ONLY MARKER — do not port this suite to golem / steam / html', () => {
    // Those lines ship the panel to everyone. A green run of this file there
    // would mean the gate leaked, not that the gate works.
    expect(src('app', 'buildInfo.ts')).toContain('2026-08-20-1363-the-shared-roll-behind-a-name');
  });

  it('opens for the two names the owner named', () => {
    expect(sharingUnlockedFor('Verbal')).toBe(true);
    expect(sharingUnlockedFor('Sasmooch')).toBe(true);
    expect(SHARING_UNLOCK_NAMES).toEqual(['verbal', 'sasmooch']);
  });

  it('⚠ case, spacing and punctuation cannot lock a player out of their own name', () => {
    // A name is typed by hand at character creation. "verbal", "VERBAL",
    // "Verbal " and "Sas-mooch" are the same person to everyone but a strcmp.
    for (const n of ['verbal', 'VERBAL', 'VeRbAl', ' Verbal ', 'Verbal 76', 'verbal76',
                     'sasmooch', 'SASMOOCH', 'Sas-mooch', "Sasmooch'"]) {
      expect(sharingUnlockedFor(n)).toBe(true);
    }
  });

  it('⚠⚠ stays shut for everyone else — including the empty name', () => {
    // '' is not hypothetical: a character part-way through creation has no name
    // yet, and a prefix matcher that treats '' as "matches everything" would
    // have opened the panel for every single player on the line. Guarded
    // explicitly rather than left to `startsWith('')`, which returns true.
    for (const n of ['', '   ', '!!!', 'Kevin', 'Francis', 'V', 'erbal', 'moochsas', 'Hal']) {
      expect(sharingUnlockedFor(n)).toBe(false);
    }
    expect(sharingUnlockedFor(null)).toBe(false);
    expect(sharingUnlockedFor(undefined)).toBe(false);
  });

  it('⚠ a near-miss shows a panel and nothing more', () => {
    // "Verbalist" passes the prefix test. Stated rather than fixed: the cost is
    // a visible panel with no houses paired, which is exactly what a fresh
    // unlocked player sees on day one. Tightening to exact-match would cost
    // "verbal76" — the owner's actual handle — which is the worse trade.
    expect(sharingUnlockedFor('Verbalist')).toBe(true);
  });
});

describe('OTA-1363 — the door is the ONLY thing gated', () => {
  it('⚠⚠ the EXCHANGE panel is behind the gate', () => {
    expect(codex).toContain('sharingUnlockedFor');
    expect(codex).toContain('const exchangeUnlocked = sharingUnlockedFor(player?.name);');
    expect(codex).toContain('{exchangeUnlocked && (');
  });

  it('⚠⚠ …and it wraps the buttons, not merely the heading', () => {
    // The failure this catches: gating the <Text>THE EXCHANGE</Text> line alone
    // and leaving SEND MY DEAD / TAKE IN THEIRS rendered underneath it — a
    // heading is decoration, the buttons are the feature.
    const open = codex.indexOf('{exchangeUnlocked && (');
    expect(open).toBeGreaterThan(0);
    const panel = codex.slice(open, codex.indexOf('</ScrollView>', open));
    for (const btn of ['SEND REQUEST', 'ACCEPT REQUEST', 'SEND MY DEAD', 'TAKE IN THEIRS']) {
      expect(panel).toContain(btn);
    }
    // the four handlers behind them, too
    for (const fn of ['sendRequest()', 'acceptRequest()', 'shareMyDead()', 'importTheirDead()']) {
      expect(panel).toContain(fn);
    }
  });

  it('⚠⚠ the ENGINE is NOT gated — one code path for every character', () => {
    // A locked player never pairs, so never imports, so `foreign` and `rests`
    // are empty and every consumer already handles empty. Wrapping the engine
    // in the same flag would create a second path that only two names ever
    // execute — and it would change state under a player the day they were
    // unlocked. If someone "tidies" this by adding the gate here, this fails.
    expect(store).toContain('rev.revenantPool()');
    expect(store).toContain('rvLedger.revenantSpawnChance(rvForeignCount)');
    expect(store).toContain('storeMod.recordRest(');
    expect(store).not.toContain('sharingUnlockedFor');
  });

  it('the gate reads the CHARACTER name, never the house name', () => {
    // The house name is a free-text field the player types into the panel — and
    // one they cannot even reach while locked. Gating on it would be gating on
    // a value only unlocked players can set: a lock whose key is behind itself.
    expect(codex).not.toContain('sharingUnlockedFor(house');
    expect(codex).toContain('sharingUnlockedFor(player?.name)');
  });
});

describe('OTA-1363 — what a locked player still gets', () => {
  it('⚠ THE HOLLOWED and PUT TO REST are not gated, and do not need to be', () => {
    // Both render off ledger arrays that are empty for a locked player, so they
    // draw nothing. Gating them as well would add two more conditions that can
    // fall out of sync with the one that matters.
    const holl = codex.indexOf('THE HOLLOWED');
    const rest = codex.indexOf('PUT TO REST');
    const gate = codex.indexOf('{exchangeUnlocked && (');
    expect(holl).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(holl);
    expect(gate).toBeGreaterThan(rest);
    expect(codex).toContain('{hollowed.length > 0 && (');
    expect(codex).toContain('{rests.length > 0 && (');
  });

  it('⚠ the Hollowed LORE is ungated — they are a thing in the world either way', () => {
    const concepts = JSON.parse(src('app', 'data', 'lore', 'concepts.json')) as {
      concepts: { id: string; title: string; answer: string }[];
    };
    const h = concepts.concepts.find((c) => c.id === 'hollowed');
    expect(h).toBeTruthy();
    expect(h!.answer.toLowerCase()).toContain('warrior');
    // and the base Aetherkin entry points at them, so the codex reads as one world
    const base = concepts.concepts.find((c) => c.id === 'aetherkin')!;
    expect(base.answer.toLowerCase()).toContain('hollowed');
  });

  it("the memorial of this install's own dead is untouched by any of it", () => {
    // OTA-845's FALLEN list predates all of this and belongs to every player.
    expect(codex).toContain('No one has fallen yet. Tartaria is patient.');
    const empty = codex.indexOf('No one has fallen yet');
    expect(empty).toBeLessThan(codex.indexOf('{exchangeUnlocked && ('));
  });
});
