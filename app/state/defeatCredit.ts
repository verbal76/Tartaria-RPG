// defeatCredit — OTA-1612. WHAT THE OBJECTIVES HEAR WHEN A TARGET GOES DOWN.
//
// ⚠⚠⚠ THIS FILE EXISTS BECAUSE A FIGHT HAS TWO WIN CONDITIONS AND ONLY ONE OF
// THEM WAS TALKING. Owner, typed into the game mid-session: *"I killed the
// runner. I was supposed to get the folio as the loot I did not and when I kill
// him and I get the folio it is supposed to auto route me back to garrin."*
//
// He had not killed the Chart Runner. He had cracked him for 25 on a 26 HP body
// and knocked him cold — which the game narrated as a win ("Nobody left
// standing — the fight is yours"), let him strip, and paid in gear and coin.
// But all of this lived inside `resolveEnemyDefeat`, and `lootKnockedOutEnemy`
// is a SEPARATE path: it stripped the body, spliced it out of the scene, and
// never told the whisper chain, the hunt, or the lead anything at all. The
// folio stayed on a man who no longer existed; the chain sat at `fetch_active`
// with its mark gone from the world.
//
// ⚠⚠ THE RULE THIS SETTLES: a subdued mark is a defeated mark. Mercy is a
// choice about HOW you win, never a way to lose the objective. The knockout
// keeps its own economy — the mercy premium, the better-preserved kit — and now
// credits exactly what a kill credits.
//
// ⚠ WHAT DELIBERATELY STAYS IN THE KILL PATH: the loot roll, the corpse and its
// revenant handling, and the lifetime-kill milestone. Those are bookkeeping
// about a DEATH, and a knockout is not one. Moving them here would have been
// the same over-reach in the other direction.
//
// ⚠ It moved OUT of gameStore rather than being copied INTO the knockout path
// for the reason OTA-1583 states in that file: the cheapest way past a line
// ceiling is to put code where it belongs, and two copies of a credit rule is
// exactly how one of them comes to be forgotten again.
//
// `makeRoomKey` and `resolveLeadCompletion` are handed in rather than imported:
// both live in gameStore, and a top-level import back into it would close a
// cycle. Same shape as the escort clear's own extraction.
import type { GameStore } from './gameStore';
import type { PlayerCharacter, Enemy, Quest } from '../engine/types';
import { findChain, makeStolenGoods, whisperTargetGrid } from '../engine/whispers';
import { findHuntById } from '../engine/hunts';
import { resolveStageEscortClear, readOutTrailingHuntBeats } from './slices/questSlice';

type Get = () => GameStore;
/** ⚠ The WIDE set signature (object OR updater), matching the slices': the
 *  escort clear this calls declares its own `SetState` that way, and a narrow
 *  local alias would refuse the very `set` gameStore hands us. */
type Set = (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void;

export interface DefeatCreditDeps {
  makeRoomKey: (
    locationId: string, microMicroId: string | null | undefined,
    mapX: number | null | undefined, mapY: number | null | undefined,
    hubRoomId?: string | null | undefined,
  ) => string;
  resolveLeadCompletion: (get: Get, set: Set, lead: Quest) => void;
}

export function creditDefeatedTarget(
  get: Get,
  set: Set,
  player: PlayerCharacter,
  enemy: Enemy,
  activeIdx: number,
  deps: DefeatCreditDeps,
): void {
  const { makeRoomKey, resolveLeadCompletion } = deps;
  const currentScene = get().currentScene;
  const worldMemory = get().worldMemory;
  if (!currentScene) return;
  // Whisper-chain hook — a chain mark's defeat grants that chain's stolen
  // goods and advances its whisper to the return stage.
  // OTA-1548 — keyed by the chain table: any active fetch whose chain names
  // this enemy as its mark pays out, so all twenty-one chains ride the one
  // hook Yulka proved out.
  {
    const live = (player.activeWhispers ?? []).find((w) => {
      const ch = findChain(w.id);
      return ch && ch.content.fetchEnemy === enemy.name && w.stage === 'fetch_active';
    });
    const liveChain = live ? findChain(live.id) : undefined;
    if (live && liveChain) {
      const c = liveChain.content;
      const stolen = makeStolenGoods(liveChain);
      set((s) => (s.player ? {
        player: {
          ...s.player,
          inventory: [...s.player.inventory, stolen],
          activeWhispers: (s.player.activeWhispers ?? []).map((w) =>
            w.id === live.id ? { ...w, stage: 'fetch_returned' } : w,
          ),
        },
      } : s));
      get().appendLog('world', c.recoverLine);
      get().appendLog('reward', `✦ ${c.stolen.name} (${c.stolen.qty}).`);
      // ⚠⚠⚠ OTA-1628 — THE RECOVERY IS A CLOSE, so it is a card: the goods on
      // it as they landed in the pack, and the way back named. It used to be
      // two feed lines under the loot of whatever fight this was.
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { raiseMissionClose } = require('./slices/questSlice') as typeof import('./slices/questSlice');
        raiseMissionClose(get, set, {
          title: liveChain.title,
          line: c.recoverLine,
          next: `✦ Return to ${c.npcName} with ${c.goodsLong} — SET COURSE on the WHISPERS row walks you back.`,
          granted: [`${c.stolen.name} × ${c.stolen.qty}`],
        });
      }
      // arb120 — the fetch is DONE the instant the goods are in hand (even
      // off a random enemy of the mark's name, not just the planted one).
      // Re-point an active auto-route off the now-pointless mark tile onto
      // the giver's return tile, so the travel readout names the CURRENT
      // objective instead of a stale "… N steps to the <mark>".
      {
        // OTA-1542 — absolute cell, so the return course survives any named
        // arrival made while chasing the mark.
        const yg = whisperTargetGrid(live);
        set((s) => (s.player?.whisperCourse ? {
          player: {
            ...s.player,
            whisperCourse: { gridX: yg.x, gridY: yg.y, label: c.returnRouteLabel },
          },
        } : s));
        get().appendLog('world', `${c.goodsShort.charAt(0).toUpperCase()}${c.goodsShort.slice(1)} in hand. The thread pulls you back the way you came — ${c.npcName}'s owed.`);
      }
    }
  }
  // HANDOFF #15 — record the clear against the current room so re-entry
  // narration can reference it. Pure bookkeeping; doesn't suppress respawns.
  {
    const roomKey = makeRoomKey(player.currentLocationId, currentScene.microMicroId, player.mapX, player.mapY, player.hubRoomId);
    const rooms = worldMemory.visitedRooms ?? {};
    const room = rooms[roomKey];
    if (room) {
      const cleared = Array.from(new Set([...(room.enemiesCleared ?? []), enemy.name]));
      set((s) => ({
        worldMemory: {
          ...s.worldMemory,
          visitedRooms: { ...(s.worldMemory.visitedRooms ?? {}), [roomKey]: { ...room, enemiesCleared: cleared } },
        },
      }));
    }
  }
  // ⚠⚠ OTA-1583 — THE ESCORT CLEAR LIVES IN questSlice. Same behaviour, one call.
  resolveStageEscortClear(get, set, player, enemy, activeIdx);

  // Hunt-boss defeat: if the downed enemy's name matches a target of an
  // active hunt currently at its boss stage, advance the hunt one more
  // beat (past the boss stage) so the player can turn it in.
  const matchingHunt = (player.activeHunts ?? [])
    .map((rec) => ({ rec, def: findHuntById(rec.id) }))
    .find(({ rec, def }) => {
      if (!def) return false;
      // Boss enemy names are tagged " (hunted)" by scaleHuntBoss.
      // OTA-426 — [audit fix #8] only the FINAL boss stage's kill completes the
      // hunt. Several hunts carry a MID-hunt `boss` stage that also spawns the
      // (final) scaled target via scaleHuntBoss; killing it there used to stamp
      // the hunt complete (the old `stage >= 0`) and skip the back half.
      // OTA-796 — >= not >: the final boss stage FREEZES at lastBoss, so the
      // kill AT lastBoss completes it; mid-hunt boss stages already advanced
      // past their index, so this still won't fire early for them.
      let lastBoss = -1;
      for (let i = 0; i < def.stages.length; i++) {
        if (def.stages[i]?.checkKind === 'boss') lastBoss = i;
      }
      // ⚠⚠⚠ OTA-1877 — AT THE BOUNDARY, OR ONE STEP INTO IT — BUT NOT BEYOND.
      // `>=` was harmless while the credit only rewrote `stages.length` over
      // itself: a second kill of a respawned target re-fired and re-logged the
      // close line, and nothing else happened. It stops being harmless the moment
      // the credit also READS a trailing beat, because the re-fire would read it
      // again.
      //
      // ⚠⚠ BUT `=== lastBoss` IS TOO NARROW, and OTA-426's own suite says why in
      // as many words: `advanceHunt(6) lands the record at stage 7`. The final
      // boss does not always freeze — a record can legitimately sit at
      // `lastBoss + 1` when the kill lands, and that kill must still complete the
      // hunt. Both are the SAME uncredited boundary, approached two ways.
      //
      // So the guard is a WINDOW, and each edge is load-bearing:
      //   `>= lastBoss`     OTA-426's rule, kept exactly. Several hunts carry a
      //     MID-hunt `boss` stage that spawns the same scaled target; killing it
      //     there must NOT complete the hunt and skip the back half. Dropping this
      //     edge let a stage-4 kill finish a 7-stage hunt — caught by OTA-426's own
      //     suite, which is why it is spelled out here rather than trusted.
      //   `<= lastBoss + 1` the new edge, and it reasons from progression rather
      //     than from whether an epilogue exists:
      //   no trailing beat  — `lastBoss + 1 === stages.length`, so a re-kill after
      //     the credit still matches and still only re-logs a line. Exactly
      //     today's behaviour, deliberately unchanged.
      //   trailing beat(s)  — consuming them puts the record PAST `lastBoss + 1`,
      //     so a re-kill no longer matches and the beat cannot be read twice.
      // The invariant that matters — a trailing beat is read exactly once — is
      // carried by the consumption itself, not by a flag.
      return enemy.name === `${def.targetEnemyName} (hunted)`
        && rec.stage >= lastBoss && rec.stage <= lastBoss + 1;
    });
  if (matchingHunt && matchingHunt.def) {
    // ⚠⚠⚠ OTA-1877 — THE KILL WALKS THE REST OF THE CHAIN INSTEAD OF JUMPING IT.
    // This wrote `stage: stages.length` outright, which is the same number for all
    // 18 shipped hunts (every one ends ON its final boss) but steps over any
    // authored trailing beat unread — and the skip persists, so nothing later can
    // recover it. `readOutTrailingHuntBeats` is the semantic `advanceHunt` has used
    // since OTA-1219: walk the `checkKind: null` beats, reading each one out, and
    // stop at the next actionable stage or the end.
    // ⚠ THE WALK STARTS AFTER THE BOSS, NOT AFTER THE RECORD. The record may sit at
    // `lastBoss` (frozen) or already at `lastBoss + 1`, and both are the same
    // uncredited boundary — so `rec.stage + 1` would overshoot the end of a hunt in
    // the second case. `lastBossOf` re-derives the index the matcher just used.
    const lastBossIdx = (() => {
      let i = -1;
      for (let k = 0; k < matchingHunt.def!.stages.length; k++) {
        if (matchingHunt.def!.stages[k]?.checkKind === 'boss') i = k;
      }
      return i;
    })();
    const walked = readOutTrailingHuntBeats(
      get,
      matchingHunt.def.stages,
      lastBossIdx + 1,
    );
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: (s.player.activeHunts ?? []).map((h) =>
                h.id === matchingHunt.rec.id ? { ...h, stage: walked } : h,
              ),
            },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `✦ ${matchingHunt.def.targetEnemyName} slain. Return to a posting agent to turn in "${matchingHunt.def.title}" for the bounty.`,
    );
    // ⚠⚠⚠ OTA-1622 — THE APEX KILL IS A CLOSE, so it is a card — not a reward
    // line under the loot lines.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { raiseMissionClose } = require('./slices/questSlice') as typeof import('./slices/questSlice');
    raiseMissionClose(get, set, {
      title: matchingHunt.def.title,
      line: `${matchingHunt.def.targetEnemyName} slain.`,
      next: `✦ Return to a posting agent to turn in "${matchingHunt.def.title}" for the bounty.`,
      granted: [],
    });
  }
  // OTA 011 — LEADS completion. When the downed enemy's name matches an active
  // lead's objective target AND the verb is kill-shaped, auto-complete the
  // lead, grant the reward, and drop it from activeQuests.
  const killVerbs = new Set(['kill', 'slay', 'defeat', 'hunt', 'retrieve']);
  const matchingLeads = (player.activeQuests ?? []).filter(
    (q) =>
      (q.state === 'open' || q.state === 'in_progress') &&
      q.tracked !== false && // DEACTIVATED (paused) leads don't auto-complete
      killVerbs.has(q.objective.verb.toLowerCase()) &&
      q.objective.target.toLowerCase().includes(enemy.name.toLowerCase().replace(/ \(hunted\)$/i, '')),
  );
  // OTA-1214 — kill-shaped verbs ALSO complete on any enemy defeated at the
  // lead's own site: 'Silence a witness' settles when the fight at the marked
  // place ends, whatever the combatant was called.
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LEAD_VERB_TRIGGERS: LVT } = require('../engine/questGenerator') as typeof import('../engine/questGenerator');
    for (const q of player.activeQuests ?? []) {
      if (q.state !== 'open' && q.state !== 'in_progress') continue;
      if (q.tracked === false) continue;
      if (q.location?.id !== player.currentLocationId) continue;
      if (!LVT[q.objective.verb.toLowerCase()]?.onKillAtSite) continue;
      if (matchingLeads.some((m) => m.id === q.id)) continue; // name path already has it
      matchingLeads.push(q);
    }
  }
  for (const lead of matchingLeads) {
    resolveLeadCompletion(get, set, lead);
  }
}
