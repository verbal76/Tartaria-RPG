// ⚠⚠⚠ OTA-1867 — WHAT THE TOPIC GATES NEED, GATHERED IN ONE PLACE.
//
// This is OTA-1058's `talkContextFor`, lifted out of gameStore.ts unchanged in
// behaviour. It was always a PURE READING of a player and a world memory — no
// `set`, no logging, no store surgery — so the only thing it ever needed from
// the store was the two values it reads. Taking `get: () => GameStore` was what
// tied it to the file.
//
// It moved because OTA-1867 gave the gates a sixth dimension and gameStore.ts
// is at its line ceiling by design. The ceiling's own instruction is the one
// followed here: *"New store code must displace old store code, or the
// responsibility belongs in a module outside the file."* Building a talk
// context is a responsibility, and this is the module.
//
// ⚠ engine/dialogue.ts still knows nothing about the store or the save shape.
// That was the point of OTA-1058's split and it is unchanged: this module is
// the one place that reads a save and hands the engine a plain context.

import type { PlayerCharacter, WorldMemory, FactionStanding } from '../engine/types';
import { getRelation, npcRegard, raidNewsFor, vendorLedgerId } from '../engine/npcMemory';
import { choiceKeys } from '../engine/storyForks';
import { conversationMemory, type TalkContext } from '../engine/dialogue';

/** OTA-1058 — everything the topic gates need, gathered here so engine/dialogue
 *  stays free of store and save-shape knowledge. This is the first feature that
 *  reads the Phase 1 ledger for something the PLAYER chooses rather than
 *  something that happens at them. */
export function talkContextFor(
  player: PlayerCharacter | null,
  worldMemory: WorldMemory,
  vendor: { id?: string; name: string; faction?: string | null },
): TalkContext {
  const npcId = vendorLedgerId(vendor);
  const rel = getRelation(worldMemory, npcId);
  const faction = vendor.faction ?? rel?.factionId ?? null;
  return {
    regard: npcRegard(rel),
    contractsTurnedIn: rel?.contractsTurnedIn ?? 0,
    standing: faction
      ? (player?.factionStanding.find((r: FactionStanding) => r.factionId === faction)?.standing ?? 0)
      : 0,
    titles: player?.earnedTitles ?? [],
    hasRecentRaidNews: !!raidNewsFor(worldMemory, rel, player?.hoursElapsed ?? 0),
    // OTA-1059 — the fifth gate dimension. Defaults to the opening phase for a
    // character who has not touched the main quest, so a missing mainQuest
    // block reads as "the very beginning" rather than unlocking everything.
    chapter: player?.mainQuest?.phase ?? 'hook',
    cores: player?.mainQuest?.coresRecovered?.length ?? 0,
    // OTA-1065 — the third place a Phase 3 decision lands: the cast can gate a
    // topic on what you chose, so the world knows and says so.
    choices: player ? choiceKeys(player) : [],
    // OTA-1090 — the two new gate roads: gifts they LOVED (honoring who they
    // are) and pocket-loss mumbles delivered (the thief's-only door).
    lovedGifts: rel?.lovedGifts ?? 0,
    pocketsMumbled: rel?.pocketsMumbled ?? 0,
    // ⚠ OTA-1867 — the sixth road, and the ONLY one that asks about the
    // CONVERSATION rather than the world: has this person already answered that
    // question. Built for THIS npcId off the same `talkedTopics` ledger the
    // already-said guard reads, so the gate and the guard cannot drift.
    topicConsumed: conversationMemory(npcId, worldMemory.talkedTopics),
  };
}
