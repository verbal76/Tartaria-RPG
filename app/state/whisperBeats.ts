// ⚠⚠⚠ OTA-1628 — THE WHISPER BEATS POP UP TOO.
//
// The two arrival beats of a whisper chain — the giver at the camp, and the
// giver waiting when you come back with the goods — used to live in
// gameStore (fireWhisperMeet, armWhisperHandback) and print to the feed only.
// The player-shaped walker's first clean pass over all twenty-one chains
// showed the shape: five stages, one card, on the very last hand-over. The
// owner's rule (OTA-1622, verbatim in questSlice.raiseMissionClose) is that
// a beat you reached must pop up in your face, not sit in the feed under an
// ambush. Both beats raise the card now, and they live here so gameStore —
// pinned under 37,000 lines — loses eighty lines instead of gaining two.
//
// The recovery beat (the mark down, the goods in your pack) is the third; it
// is raised from defeatCredit, where the goods are granted.

import type { GameStore } from './gameStore';
import type { WhisperRecord } from '../engine/types';
import { pronounForms, withTalkTurn, whisperTargetGrid, type ChainDef } from '../engine/whispers';
import { raiseMissionClose } from './slices/questSlice';

type Set = (fn: (s: GameStore) => Partial<GameStore>) => void;

/** The giver at the camp. Sighting and voice stay in the feed (the record of
 *  truth) and seed the whisper's own transcript for the SPEAK TO sheet
 *  (OTA-1547); the mark's tile is rolled off the chain's offset and stamped
 *  absolutely (OTA-1542); and the beat is a card (OTA-1628). */
export function fireWhisperMeet(get: () => GameStore, set: Set, whisper: WhisperRecord, chain: ChainDef): void {
  const c = chain.content;
  const [fxLo, fxHi] = c.fetchOffset.dxRange;
  const [fyLo, fyHi] = c.fetchOffset.dyRange;
  const thiefDx = fxLo + Math.floor(Math.random() * (fxHi - fxLo + 1));
  const thiefDy = fyLo + Math.floor(Math.random() * (fyHi - fyLo + 1));
  const thiefMapX = whisper.targetMapX + thiefDx;
  const thiefMapY = whisper.targetMapY + thiefDy;
  // (The ctx field names keep their historical thief* spelling — every save
  // and reader uses them.)
  const thiefG = whisperTargetGrid(whisper);
  const thiefGridX = thiefG.x + thiefDx;
  const thiefGridY = thiefG.y + thiefDy;
  const sighting = c.sighting;
  const pitch = c.pitch;
  const name = c.npcName.toLowerCase();
  const buyPhrase = c.buy ? `, "buy from ${name}",` : '';
  const bar = `SPEAK TO ${c.npcName.toUpperCase()}`;
  get().appendLog('world', sighting);
  get().appendLog('arbiter', pitch);
  get().appendLog(
    'system',
    `Answer ${pronounForms(c.pronoun).obj} from the ${bar} bar below — or type "accept ${name}"${buyPhrase} or "leave ${name}".`,
  );
  set((s) => (s.player ? {
    player: {
      ...s.player,
      activeWhispers: (s.player.activeWhispers ?? []).map((w) =>
        w.id === whisper.id
          ? {
              ...w,
              stage: 'met_yulka',
              ctx: { ...(w.ctx ?? {}), thiefMapX, thiefMapY, thiefGridX, thiefGridY },
              talk: [...(w.talk ?? []), { who: 'them' as const, text: sighting }, { who: 'them' as const, text: pitch }],
            }
          : w,
      ),
    },
  } : s));
  raiseMissionClose(get, set, { title: chain.title, line: sighting, next: `Answer ${pronounForms(c.pronoun).obj} from the ${bar} bar.`, granted: [] });
}

/** ⚠⚠⚠ OTA-1613 — THE GIVER HANDS IT OVER, AND YOU HAND IT BACK. Owner, on
 *  finishing Garrin's folio: *"it was anticlimactic, it just gave me the
 *  generic mission complete … I should have talked to him again, and then
 *  given my award in the chat window from him."* Arrival used to CALL the
 *  payout. Now it ARMS the hand-over: the record moves to `handback`, the
 *  giver's greeting seeds the transcript, the bar says he is waiting, and
 *  nothing is paid until `handBackWhisperGoods` (the sheet's button or the
 *  typed phrase). OTA-1628: the arming is a card, pointing at the bar. */
export function armWhisperHandback(get: () => GameStore, set: Set, whisper: WhisperRecord, chain: ChainDef): boolean {
  const live = get().player;
  if (!live) return false;
  const c = chain.content;
  // ⚠ Empty hands are still refused HERE rather than at the button: arming a
  // hand-over the player cannot complete would put a dead button in front of
  // them. The stage does not advance, so coming back with the goods arms it.
  const carried = live.inventory.find((i) => i.name === c.stolen.name && i.quantity > 0);
  if (!carried) {
    get().appendLog('world', c.emptyHandsLine);
    return true;
  }
  const pf = pronounForms(c.pronoun);
  const greeting = `${c.npcName} sees ${c.goodsLong} in your hands before ${pf.subj} sees you.`;
  const bar = `SPEAK TO ${c.npcName.toUpperCase()}`;
  get().appendLog('world', greeting);
  get().appendLog(
    'system',
    `Hand it over from the ${bar} bar below — or type "give ${c.npcName.toLowerCase()} the ${c.goodsShort}".`,
  );
  set((s) => (s.player ? {
    player: {
      ...s.player,
      activeWhispers: withTalkTurn(
        (s.player.activeWhispers ?? []).map((w) =>
          w.id === whisper.id ? { ...w, stage: 'handback' } : w,
        ),
        whisper.id, 'them', greeting,
      ),
    },
  } : s));
  raiseMissionClose(get, set, { title: chain.title, line: greeting, next: `Hand it over from the ${bar} bar.`, granted: [] });
  return true;
}
