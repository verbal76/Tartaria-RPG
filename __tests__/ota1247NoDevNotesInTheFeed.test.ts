// ⚠⚠ OTA-1247 — NO DEV NOTES IN THE PLAYER'S FEED, AND A PROOF INSTEAD OF A
// BELIEF. Owner, after the arc read turned one up: *"kill it."*
//
// The thing killed: `narrationForPhase('cores', …)`'s fallback used to return a
// note-to-self from the week the main quest was first built — *"the Reclaimers'
// salvage route for the Cores is being authored in a coming OTA… other factions
// will get their authored variants soon"* — written in the Arbiter's own voice,
// sitting in a live switch, inside the main story. By the time it was found it
// was BOTH unreachable AND factually false: all nine factions have carried real
// authored Core routes in FACTION_CORE_GATES for a long time. It promised work
// that was already finished, in the voice the player trusts most.
//
// Two locks, because "unreachable" was a property of the state machine and not a
// law — a future save-repair or debug jump that lands `phase: 'cores'` without a
// Core recovery would have armed it silently:
//
//   1. THE EXHAUSTION PROOF. Every phase × every cores-held count × every
//      trigger, driven through the REAL advanceMainQuest and mirroring the
//      store's two early-returns and its context construction verbatim. If any
//      combination ever reaches the fallback, this fails and names it — which is
//      the day somebody has to look at the line rather than the day a tester
//      screenshots it.
//   2. THE CONTENT LOCK. No player-facing string anywhere in the story engines
//      may talk about OTAs, authoring, placeholders or "coming soon". A dev note
//      cannot be re-introduced into the feed without failing the build.
import {
  advanceMainQuest, narrationForPhase, LOST_CAPITAL_LOCATIONS, FACTION_CORE_GATES,
} from '../app/engine/mainQuest';
import type { MainQuestPhase, MainQuestState } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const PHASES: MainQuestPhase[] = ['hook', 'revelation', 'cores', 'descent', 'nexus', 'choice', 'ended'];
const CAPS = LOST_CAPITAL_LOCATIONS;

/** The shapes a dev note takes. Matched case-insensitively against strings the
 *  player can actually be shown. */
const DEV_NOTE_RE = /\b(in a coming ota|a future ota|being authored|not yet authored|placeholder|coming soon|to be authored|tbd|todo)\b/i;

describe('OTA-1247 — the dev note is gone, and cannot come back', () => {
  it('⚠⚠ EXHAUSTION: no phase, core count or trigger can reach the cores fallback at all', () => {
    const reached: string[] = [];
    const triggers: Array<Record<string, unknown>> = [
      ...CAPS.map((c) => ({ kind: 'first_capital_visit', locationId: c })),
      ...CAPS.map((c) => ({ kind: 'core_recovered', locationId: c })),
      { kind: 'reached_nexus' },
      ...(['seal', 'unleash', 'preserve'] as const).map((e) => ({ kind: 'chose_ending', ending: e })),
    ];
    for (const phase of PHASES) {
      for (let held = 0; held <= CAPS.length; held++) {
        const state: MainQuestState = { phase, coresRecovered: CAPS.slice(0, held) as string[] };
        for (const trig of triggers) {
          const player = {
            mainQuest: state, factionId: 'reclaimers_guild', name: 'Proof',
            currentLocationId: (trig.locationId as string) ?? 'asgardar',
          } as never;
          const next = advanceMainQuest(player, trig as never);
          // ⚠ MIRROR OF gameStore.triggerMainQuest — both early-returns, then the
          // context it builds. If that function's guards change, this mirror must
          // change with them or the proof stops proving the live path.
          if (next === state) continue;
          if (next.phase === state.phase && next.coresRecovered.length === state.coresRecovered.length) continue;
          const ctx: Record<string, unknown> = { seed: 'Proof' };
          if (trig.kind === 'core_recovered') {
            ctx.coreRecovered = trig.locationId;
            ctx.coresCount = next.coresRecovered.length;
          } else if (trig.kind === 'chose_ending') {
            ctx.ending = trig.ending;
          }
          if (next.phase === 'choice') continue; // the store suppresses this one
          const line = narrationForPhase(next.phase, 'reclaimers_guild', ctx as never);
          // The fallback is the ONLY 'cores' line that names no recovered Core.
          if (next.phase === 'cores' && !line.includes('Core comes') && !line.includes('Core releases')
            && !line.includes('Core acknowledges') && !line.includes('Core consents')
            && !line.includes('still to recover') && !line.includes('rest in your pack')) {
            reached.push(`${phase} (${held} cores) + ${String(trig.kind)} -> ${next.phase}`);
          }
        }
      }
    }
    // Names the offending path rather than just failing — the next reader needs
    // to know WHICH combination armed it.
    expect(reached).toEqual([]);
  });

  it('⚠⚠ the fallback itself is honest in-world text — harmless the day it does become reachable', () => {
    // Called directly, bypassing reachability: this is what a player would read.
    for (const factionId of Object.keys(FACTION_CORE_GATES)) {
      const line = narrationForPhase('cores', factionId, { seed: 'Proof' } as never);
      expect({ factionId, devNote: DEV_NOTE_RE.test(line) }).toEqual({ factionId, devNote: false });
      expect(line.length).toBeGreaterThan(40);
      // It has to still do the fallback's job: say what the objective IS.
      expect(line).toMatch(/Nine Cores, nine Lost Capitals/);
      expect(line).toMatch(/CONTRACTS/);
    }
    // And an unknown/legacy faction gets prose, never a broken template.
    const legacy = narrationForPhase('cores', 'architectural_sentinels', { seed: 'Proof' } as never);
    expect(DEV_NOTE_RE.test(legacy)).toBe(false);
    expect(legacy).toMatch(/your own road/);
  });

  it('⚠⚠ the promise it made is one the game already keeps: all nine factions have a real Core route', () => {
    // The dev note said other factions' routes were "coming". They arrived.
    // If this ever drops below nine, the note was telling the truth again and
    // the gap is the thing to fix — not the text.
    const gates = Object.entries(FACTION_CORE_GATES);
    expect(gates.length).toBe(9);
    for (const [factionId, gate] of gates) {
      expect({ factionId, intents: gate.intents.length > 0 }).toEqual({ factionId, intents: true });
      expect(gate.nextAction.length).toBeGreaterThan(0);
      expect(gate.hint('Asgardar').length).toBeGreaterThan(0);
    }
  });

  it('⚠ CONTENT LOCK: no player-facing story string talks about OTAs, authoring or placeholders', () => {
    const files = ['mainQuest.ts', 'story.ts', 'storyForks.ts', 'storyDrip.ts', 'chapters.ts'];
    const offenders: string[] = [];
    // ⚠ SCOPE, stated honestly: this lock reads PROSE literals. Two kinds of
    // string are deliberately exempt because a dev note is the correct content
    // for them and they never reach a player:
    //   • comments — where notes-to-self belong in the first place;
    //   • DEVELOPER DIAGNOSTICS — thrown errors, console lines, and the strings
    //     an authoring audit collects (storyForks.forkAuthoringProblems builds
    //     "unsubstituted placeholder in <field>", which is a build-time report
    //     for a test to assert on, not narration).
    // Everything else in these five engines is text a player can be shown.
    const DIAGNOSTIC_RE = /\b(throw\b|Error\(|console\.|\w*(bad|problems|offenders|errors|issues)\.push\()/;
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', 'app', 'engine', f), 'utf8');
      src.split('\n').forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        if (DIAGNOSTIC_RE.test(line)) return;
        const literals = line.match(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g) ?? [];
        for (const lit of literals) {
          if (DEV_NOTE_RE.test(lit)) offenders.push(`${f}:${i + 1} ${lit.slice(0, 80)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('⚠ the content lock actually bites — it catches the exact string that was removed', () => {
    // A lock nobody has seen fail is a lock nobody knows is wired up. This is
    // the verbatim opening of the dev note this OTA deleted.
    expect(DEV_NOTE_RE.test('route for the Cores is being authored in a coming OTA')).toBe(true);
    expect(DEV_NOTE_RE.test('other factions will get their authored variants soon')).toBe(false);
    // ...and it does not fire on ordinary story prose.
    expect(DEV_NOTE_RE.test('Nine Cores, nine Lost Capitals, and each one comes free by a trowel.')).toBe(false);
  });
});
