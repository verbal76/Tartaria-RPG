// ⚠⚠⚠ OTA-1588 — THE VERB THAT PAYS THE STAGE, AND THE THIRTY BEATS THAT WERE
// TOLD TO FINISH A FIGHT THAT ISN'T THERE.
//
// Owner: *"reaudit and repair all missions for similar issues."* — after
// OTA-1584/1585/1586, whose shared shape is A PROMISE THE MACHINE CANNOT PAY.
//
// ⚠⚠ WHAT THE RE-AUDIT FOUND. `checkKind: 'boss'` does not mean the same thing in
// every family, and never has:
//
//     a HUNT's boss is paid by ATTACK         — the apex is a fight
//     a MYSTERY's boss is paid by INVESTIGATE — the "confirm what you have" beat
//     a STORYLINE's boss is paid by DIPLOMACY — the same beat, talked through
//
// The engine knew this FOUR TIMES — `stageAwaitsIntentHere` plus one matcher per
// family — under a comment instructing the next person to keep the copies in step
// by hand. OTA-1585 had already named that shape: two implementations of one
// question is one implementation plus a time bomb.
//
// ⚠⚠⚠ AND IT WENT OFF INSIDE MY OWN FIX FOR IT, THE SAME DAY. OTA-1586 added the
// arrival line so a player standing on a mission tile would never again be told
// nothing, and its private ask table mapped `boss → "finish it"` for all three
// families. There are THIRTY spawn-less `boss` stages across mysteries and
// storylines and — measured, and pinned below — every one is the LAST ACTIONABLE
// BEAT of its chain. So all 15 mysteries and all 15 storylines in the game ended
// by telling the player to finish a fight that does not exist, on a beat paid by
// searching or by talking. The reported bug, rebuilt one layer up, by the fix.
//
// ⚠ THE SECOND FINDING, same re-audit, same shape: the Contracts card has printed
// "→ Advance by …" for HUNTS since OTA-053 and printed NOTHING for the other two
// families. 165 mystery and storyline stages where the game knew the verb and
// never said it — the OTA-1586 silence, still standing on the screen he taps.

import {
  payingIntent, stageVerbLabel, stageVerbAsk, type MissionFamily,
} from '../app/engine/questStage';
import { checkKindLabel } from '../app/engine/hunts';
import { missionArrivalLines, missionTraceLines } from '../app/engine/missionTrace';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { HUNTS } from '../app/engine/hunts';
import type { PlayerCharacter } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const at = (loc: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ ...placedAt(loc), inventory: [], ...extra } as unknown as PlayerCharacter);

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1588 — one answer to what pays a stage', () => {
  it('⚠⚠⚠ `boss` RESOLVES DIFFERENTLY IN EACH FAMILY, and that is the whole defect', () => {
    expect(payingIntent('hunt', { checkKind: 'boss' })).toBe('attack');
    expect(payingIntent('mystery', { checkKind: 'boss' })).toBe('investigate');
    expect(payingIntent('storyline', { checkKind: 'boss' })).toBe('diplomacy');
  });

  it('⚠⚠ everything else is family-invariant, and `attack_provoke` folds to attack', () => {
    const families: MissionFamily[] = ['hunt', 'mystery', 'storyline'];
    for (const f of families) {
      expect(payingIntent(f, { checkKind: 'investigate' })).toBe('investigate');
      expect(payingIntent(f, { checkKind: 'stealth' })).toBe('stealth');
      expect(payingIntent(f, { checkKind: 'attack_provoke' })).toBe('attack');
      // ⚠ A verbless beat advances on its own. Advertising it as an action is
      // the lie OTA-1584 closed, so it must resolve to nothing at all.
      expect(payingIntent(f, { checkKind: null })).toBeNull();
      expect(payingIntent(f, undefined)).toBeNull();
    }
  });

  it('⚠ the hunt labels match the one table the card renders from', () => {
    // checkKindLabel now delegates. This originally pinned the labels
    // byte-identical to the switch they replaced; OTA-1596 then reworded the
    // attack label on the owner's note — "Advance by defeat in combat" read as
    // being told to LOSE ("it should say advance by winning in combat not
    // defeat"). The pin moves with the ruling.
    expect(checkKindLabel('investigate')).toBe('investigate the area');
    // ⚠ OTA-1621 superseded two more: 'use stealth' and 'use Aethercraft' both
    // parsed as USE_RELIC when typed back. The table is now held to the parser
    // (ota1621TheAskIsACommand); these pins only follow the ruling.
    expect(checkKindLabel('stealth')).toBe('sneaking');
    expect(checkKindLabel('diplomacy')).toBe('talk it out');
    expect(checkKindLabel('escape')).toBe('escape / disengage');
    expect(checkKindLabel('cast')).toBe('casting aether');
    expect(checkKindLabel('attack_provoke')).toBe('attack to provoke');
    expect(checkKindLabel('boss')).toBe('winning the fight');
    expect(checkKindLabel(null)).toBeNull();
  });

  it('⚠⚠ and the other two families finally get labels of their own', () => {
    expect(stageVerbLabel('mystery', { checkKind: 'boss' })).toBe('investigate the area');
    expect(stageVerbLabel('storyline', { checkKind: 'boss' })).toBe('talk it out');
    // `attack_provoke` keeps its own wording rather than folding into the boss
    // label — the writing makes that distinction on purpose.
    expect(stageVerbLabel('storyline', { checkKind: 'attack_provoke' })).toBe('attack to provoke');
  });
});

describe('OTA-1588 — the measurement that made this urgent', () => {
  const bossNoSpawn = [
    ...MYSTERIES.map((d) => ({ fam: 'mystery' as const, d })),
    ...STORYLINES.map((d) => ({ fam: 'storyline' as const, d })),
  ].flatMap(({ fam, d }) =>
    d.stages
      .map((s, i) => ({ fam, id: d.id, s, i, stages: d.stages }))
      .filter((x) => x.s.checkKind === 'boss' && !x.s.spawn));

  it('⚠⚠⚠ THIRTY STAGES, AND EVERY ONE IS THE LAST ACTIONABLE BEAT OF ITS CHAIN', () => {
    // Which is why this mattered enough to ship on its own: it is not thirty
    // stages scattered through the catalogue, it is the ENDING of every mystery
    // and every storyline in the game.
    expect(bossNoSpawn.length).toBe(30);
    const notLast = bossNoSpawn.filter((x) =>
      x.stages.slice(x.i + 1).some((later) => later.checkKind !== null));
    expect(notLast.map((x) => `${x.id}#${x.i}`)).toEqual([]);
    expect(new Set(bossNoSpawn.map((x) => x.id)).size).toBe(30);
  });

  it('⚠⚠ a hunt boss is the opposite case and must keep saying so', () => {
    // The exemption is real: a hunt's apex IS a fight, spawned by scaleHuntBoss.
    // A fix that made every boss quiet would be the same error mirrored.
    const huntBoss = HUNTS.flatMap((d) => d.stages).filter((s) => s.checkKind === 'boss');
    expect(huntBoss.length).toBeGreaterThan(0);
    // ⚠ OTA-1621 superseded the word: "finish it" parsed as TURN_IN when typed
    // back at the game. The claim here is that a hunt's boss asks for the
    // ATTACK word — whatever the parser-held table says that word is.
    expect(stageVerbAsk('hunt', { checkKind: 'boss' })).toBe(stageVerbAsk('hunt', { checkKind: 'attack' }));
    expect(stageVerbAsk('hunt', { checkKind: 'boss' })).toBe('strike');
  });
});

/** The hunt's own boss word — the one a mystery or storyline must never say. */
const HUNT_BOSS_WORD = stageVerbAsk('hunt', { checkKind: 'boss' })!;

describe('OTA-1588 — the arrival line stops lying', () => {
  it('⚠⚠⚠ A MYSTERY\'S LAST BEAT ASKS THE PLAYER TO SEARCH, NOT TO FIGHT', () => {
    const d = MYSTERIES.find((m) => m.id === 'mystery_red_tower')!;
    const idx = d.stages.findIndex((s) => s.checkKind === 'boss');
    // ⚠ Stand on the ground the STAGE names, resolved by the engine's own
    // resolver. The first draft guessed two capitals by hand and got an empty
    // list — which is the routing question OTA-1586 already answered, not this
    // one, and a fixture that has to guess is testing the fixture.
    const line = missionArrivalLines(at(stageGround(d.stages[idx]!, d), {
      activeMysteries: [{ id: d.id, stage: idx }],
    } as Partial<PlayerCharacter>)).join('\n');
    expect(line).toContain('search this ground');
    expect(line).not.toContain(HUNT_BOSS_WORD);
  });

  it('⚠⚠⚠ AND A STORYLINE\'S ASKS THEM TO TALK', () => {
    const d = STORYLINES.find((s) => s.id === 'story_order_red_tower')!;
    const idx = d.stages.findIndex((s) => s.checkKind === 'boss');
    // Stand on whatever ground the stage itself names, so the assertion is about
    // the ASK and not about the routing OTA-1586 already pinned.
    const line = missionArrivalLines(at(stageGround(d.stages[idx]!, d), {
      activeStorylines: [{ id: d.id, stage: idx }],
    } as Partial<PlayerCharacter>)).join('\n');
    expect(line).toContain('talk it through');
    expect(line).not.toContain(HUNT_BOSS_WORD);
  });

  it('⚠⚠ every mystery and storyline boss beat, swept — none of them says the hunt\'s word', () => {
    // The single-case tests above name the bug; this one proves it is gone
    // everywhere, which is what "reaudit ALL missions" asks for.
    const said: string[] = [];
    for (const d of MYSTERIES) {
      d.stages.forEach((s, i) => {
        if (s.checkKind !== 'boss') return;
        const ask = stageVerbAsk('mystery', s);
        if (ask === HUNT_BOSS_WORD) said.push(`${d.id}#${i}`);
      });
    }
    for (const d of STORYLINES) {
      d.stages.forEach((s, i) => {
        if (s.checkKind !== 'boss') return;
        const ask = stageVerbAsk('storyline', s);
        if (ask === HUNT_BOSS_WORD) said.push(`${d.id}#${i}`);
      });
    }
    expect(said).toEqual([]);
  });
});

/** The stage's own ground, resolved the way the engine resolves it. */
function stageGround(stage: { locationName?: string }, def: { targetLocationName?: string }): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CM = require('../app/engine/contractMarkers') as typeof import('../app/engine/contractMarkers');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QS = require('../app/engine/questStage') as typeof import('../app/engine/questStage');
  return QS.stageLocationId(stage as never, CM.contractAnchorId(def as never), CM.resolvePosterLocation);
}

describe('OTA-1588 — the trace shows both halves', () => {
  it('⚠⚠ `[boss→investigate]` says the label AND what actually pays it', () => {
    const d = MYSTERIES.find((m) => m.id === 'mystery_red_tower')!;
    const idx = d.stages.findIndex((s) => s.checkKind === 'boss');
    const l = missionTraceLines(at('nimari', {
      activeMysteries: [{ id: d.id, stage: idx }],
    } as Partial<PlayerCharacter>)).join('\n');
    expect(l).toContain('[boss→investigate]');
  });

  it('⚠ and where the two agree the arrow is dropped, so the common case stays short', () => {
    const d = MYSTERIES.find((m) => m.id === 'mystery_red_tower')!;
    const idx = d.stages.findIndex((s) => s.checkKind === 'investigate');
    if (idx < 0) return;
    const l = missionTraceLines(at('nimari', {
      activeMysteries: [{ id: d.id, stage: idx }],
    } as Partial<PlayerCharacter>)).join('\n');
    expect(l).toContain('[investigate]');
    expect(l).not.toContain('→');
  });
});

describe('OTA-1588 — the card labels the button with the verb that pays', () => {
  it('⚠⚠ a mystery boss beat with a person offers a LOOK, not a swing', () => {
    const d = MYSTERIES.find((m) => m.stages.some((s) => s.checkKind === 'boss' && !!s.npcName))!;
    const idx = d.stages.findIndex((s) => s.checkKind === 'boss' && !!s.npcName);
    const armed = armedEncounter(at(stageGround(d.stages[idx]!, d), {
      activeMysteries: [{ id: d.id, stage: idx }],
    } as Partial<PlayerCharacter>));
    expect(armed).not.toBeNull();
    expect(armed!.verb).toBe('investigate');
    // ⚠ And no fight: `spawn` is the only thing that puts bodies in the scene,
    // so a DRAW ON THEM button here would swing at nobody (OTA-1581's rule).
    expect(armed!.hasFight).toBe(false);
  });
});

describe('OTA-1588 — one implementation, enforced', () => {
  it('⚠⚠⚠ THE FOUR MATCHERS ASK THE ONE FUNCTION', () => {
    const STORE = src('app', 'state', 'gameStore.ts');
    expect(STORE).toContain("QSV.payingIntent('hunt', next) !== intent");
    expect(STORE).toContain("return QSV.payingIntent('mystery', next) === intent;");
    expect(STORE).toContain("return QSV.payingIntent('storyline', next) === intent;");
    expect(STORE).toContain('QS.payingIntent(family, stage) === intent');
  });

  it('⚠⚠⚠ AND THE OTA-1217 IN-COMBAT GUARD SURVIVED THE REWRITE', () => {
    // The rows that went away carried it. Losing it would re-spawn the hunt apex
    // at full HP on every swing — a fight that literally cannot be won, which is
    // a far worse bug than the one being fixed.
    const STORE = src('app', 'state', 'gameStore.ts');
    expect(STORE).toContain("return next.checkKind === 'escape' ? true : !inCombat;");
  });

  it('⚠⚠ the Contracts card prints the hint for all three families now', () => {
    const SCREEN = src('app', 'screens', 'ContractsScreen.tsx');
    expect(SCREEN).toContain("stageVerbLabel('mystery', def.stages[run.stage])");
    expect(SCREEN).toContain("stageVerbLabel('storyline', def.stages[run.stage])");
  });

  it('⚠⚠ missionTrace no longer keeps a table of its own', () => {
    const TRACE = src('app', 'engine', 'missionTrace.ts');
    expect(TRACE).toContain('stageVerbAsk(family, st)');
    // The table that shipped the bug. Pinned on the KEY, which is the part that
    // was wrong — the phrase itself is fine and still lives in questStage.
    expect(TRACE).not.toContain("boss: 'finish it'");
  });

  it('⚠⚠⚠ AND THE GATE FAILS THE BUILD IF A SECOND TABLE APPEARS', () => {
    const GATE = src('scripts', 'check-mission-claims.mjs');
    expect(GATE).toContain('EXACTLY ONE ANSWER TO "WHAT VERB PAYS A `boss`"');
    // Both shapes: the matcher form and the lookup-table form that actually
    // shipped. A gate that only knew the first would have missed OTA-1586.
    expect(GATE).toContain("line.includes(\"'boss'\") && line.includes('checkKind') && verb");
    expect(GATE).toContain("/(^|[{,\\s])boss\\s*:\\s*'/");
  });
});
