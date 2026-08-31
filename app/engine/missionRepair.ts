// ⚠⚠⚠ OTA-1589 — THE RECORDS OLD BUILDS LEFT STANDING WHERE NOTHING CAN PAY THEM.
//
// The owner asked for the root cause of "mission is still broken", and the audit
// found it is not one bug — it is a STRUCTURAL property of everything built since
// P19: the stage INDEX is a raw persisted integer into stage arrays that have
// been rewritten at least four times (P19-B, OTA-1576, OTA-1582, OTA-1583),
// while every fix shipped so far repaired a DOOR — the accept door (1582), the
// kill path (1583), the arrival announcement (1586). A door fix helps records
// that pass through the door AFTER the fix. His save carries records placed by
// every previous broken era, and no code anywhere re-examined them.
//
// That is also why 10,900 green tests kept disagreeing with his device: the
// walkers all create FRESH records, so they exercise the machine the current
// build builds — never the save the previous builds left behind.
//
// THE WEDGE CLASSES a live record can be stranded in, and what this pass does:
//
//   • stage on a VERBLESS beat (`checkKind: null`) — no verb pays it, the
//     matchers skip it (`payingIntent` → null), and since OTA-871 the advance
//     loops consume such beats in passing, so only an OLD record can be
//     STANDING on one. Moved through `nextActionableStage`, the same rule the
//     kill path uses — for today's data that lands past the end, i.e. READY,
//     which is the owner's own ruling on epilogue beats ("a cue for a remote
//     turn in with prose").
//   • stage NEGATIVE or NOT A NUMBER — clamped to the first actionable stage,
//     the same beat the accept door would have opened on.
//   • stage ABSURDLY past the end (shrunken def) — clamped to `stages.length`,
//     which is plain READY.
//
// ⚠ WHAT IT DOES *NOT* TOUCH: a record on a healthy actionable stage — even one
// whose ground or verb changed under it; the stage machinery handles those
// (grant-healing included) — and completed records, which OTA-1589's pin fix
// routes to the pay window. Repair is for records the machine cannot SEE, not
// records it merely sees differently than it used to.
//
// ⚠ A READER-WRITER SEAM, RUN ONCE PER LOAD, AND IT SAYS WHAT IT DID. Every
// repair emits a note for the debug log, because a silent save mutation is how
// the next forensics session loses a day ("measure the cause, or ship an
// instrument" — and this is both: the note is the instrument on the repair).

import type { PlayerCharacter } from './types';
import { findHuntById } from './hunts';
import { findMysteryById } from './mysteries';
import { findStorylineById } from './factionStorylines';
import { firstActionableStage, nextActionableStage } from './questStage';

interface Rec { id: string; stage: number; tracked?: boolean }

interface StageShape { checkKind?: string | null }

function repairOne(
  family: 'hunt' | 'mystery' | 'storyline',
  rec: Rec,
  def: { stages?: ReadonlyArray<StageShape> } | null,
  notes: string[],
): Rec {
  if (!def) return rec; // an unknown id is dropped elsewhere; not this pass's call
  const stages = (def.stages ?? []) as StageShape[];
  const raw = rec.stage;
  // Not a usable index at all → the beat the accept door would have opened on.
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    const fixed = firstActionableStage(stages as never);
    notes.push(`missions: repaired ${family}:${rec.id} stage ${String(raw)}→${fixed} (index was not usable)`);
    return { ...rec, stage: fixed };
  }
  // Past the end is READY — normalise a wild overshoot but keep the meaning.
  if (raw >= stages.length) {
    if (raw > stages.length) {
      notes.push(`missions: repaired ${family}:${rec.id} stage ${raw}→${stages.length} (past a shrunken chain — READY)`);
      return { ...rec, stage: stages.length };
    }
    return rec;
  }
  // ⚠⚠ THE CLASS FROM HIS SAVE: standing on a verbless beat. No verb pays it, no
  // matcher sees it, the card cannot open it — the mission is wedged forever and
  // the screen shows a stage counter that nothing in the game can move.
  if (stages[raw]!.checkKind === null) {
    const fixed = nextActionableStage(stages as never, raw);
    notes.push(
      `missions: repaired ${family}:${rec.id} stage ${raw}→${fixed} `
      + `(an older build parked it on a verbless beat no verb can pay)`,
    );
    return { ...rec, stage: fixed };
  }
  return rec;
}

/**
 * Repair every staged mission record a loaded save carries. Pure: returns the
 * (possibly) new player object and the notes describing each repair; returns
 * the SAME player reference when nothing needed repair, so callers can cheaply
 * tell "clean load" from "repaired load".
 */
export function repairMissionRecords(
  player: PlayerCharacter,
): { player: PlayerCharacter; notes: string[] } {
  const notes: string[] = [];
  const hunts = (player.activeHunts ?? []).map((r) => repairOne('hunt', r, findHuntById(r.id), notes));
  const mysteries = (player.activeMysteries ?? []).map((r) => repairOne('mystery', r, findMysteryById(r.id), notes));
  const stories = (player.activeStorylines ?? []).map((r) => repairOne('storyline', r, findStorylineById(r.id), notes));
  if (notes.length === 0) return { player, notes };
  return {
    player: {
      ...player,
      activeHunts: hunts as never,
      activeMysteries: mysteries as never,
      activeStorylines: stories as never,
    },
    notes,
  };
}
