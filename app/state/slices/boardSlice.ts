/**
 * OTA-1400 — SLICE 9b: the mission board.
 *
 * Five actions, 209 lines: read the board, freeze it, accept or decline the
 * offer it posted, and take a kill-bounty.
 *
 * ⚠⚠ THE ONLY CLEAN ISLAND IN THE QUEST SYSTEM, AND THE MEASUREMENT IS BLUNT:
 * ZERO shared module symbols with faction quests, hunts, mysteries, storylines,
 * or the contract admin. Not "few" — none.
 *
 * That is worth stating plainly, because the board READS like part of the quest
 * system and is not. It is where work is posted and offered; what happens after
 * a player says yes belongs to `questSlice.ts`. The dependency scan found a seam
 * the file layout hid — the same thing it did for `hydrate` in slice 3 and for
 * inventory-versus-crafting in slice 8.
 *
 * ⚠ Two deps, and one constant of its own: `MAX_ACTIVE_BOUNTIES`, the cap on how
 * many kill-bounties a player may carry at once.
 *
 * ⚠ NO MUTABLE STATE. ⚠ WHAT DID NOT CHANGE: five bodies, verbatim.
 */
import { playerGridCell } from '../playerGrid';
import { getLocationById } from '../../engine/encounter';
import { FACTIONS, getStanding } from '../../engine/factions';
import { availableFactionQuests, neutralBoardPostings } from '../../engine/factionQuests';
import { refusalLine } from '../../engine/portability';
import { canonicalDistanceFromGrid, canonicalCellOf, canonicalCellFor } from '../../engine/worldMap';

/**
 * ⚠ `import type * as` is fully erased at compile time, so this is NOT a runtime
 * cycle. It lets every dep below be typed `typeof Store.fn`, which means their
 * signatures cannot drift from the real functions: change one in gameStore and
 * this file stops compiling rather than silently accepting the wrong shape.
 */
import type * as Store from '../gameStore';

type GameStore = Store.GameStore;
type SetState = (
  partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
) => void;


export interface BoardSlice {
  readMissionBoard: () => void;
  toggleBoardFreeze: () => void;
  acceptMissionOffer: () => void;
  declineMissionOffer: () => void;
  acceptBounty: (bounty: import('../../engine/factionBounty').FactionBounty) => void;
}

export interface BoardSliceDeps {
  activeBountiesOf: typeof Store.activeBountiesOf;
  buzzBlocked: typeof Store.buzzBlocked;
}

export const createBoardSlice = (
  set: SetState,
  get: () => GameStore,
  deps: BoardSliceDeps,
): BoardSlice => {
  // ⚠⚠ THE PRIVATE HELPERS LIVE INSIDE THE FACTORY, NOT AT MODULE SCOPE, and the
  // reason is worth writing down. They reference injected deps; at module scope
  // they would have no `deps` in scope, and the alternatives were both worse —
  // adding a parameter to each (a signature EDIT inside a move, which is how a
  // reviewer loses the thread) or stashing `deps` in a module-level `let` the
  // factory assigns (silently wrong the second time the factory is called). The
  // factory runs exactly once, in `create<GameStore>(...)`, so a closure costs
  // nothing and the bodies below are byte-for-byte what they were in gameStore.
  // OTA-859 [bounty board] — how many kill-bounties the player may carry at once. Small
  // enough that the slate stays meaningful, big enough to stack a grind.
  const MAX_ACTIVE_BOUNTIES = 3;

  return ({
  readMissionBoard() {
    const player = get().player;
    const scene = get().currentScene;
    if (!player) return;
    const board = scene?.missionBoard;
    if (!board) {
      get().appendLog('arbiter', `The Arbiter glances around. "No board posted here."`);
      return;
    }
    // ⚠⚠⚠ OTA-1475 — THE HIDDEN MARKET'S BOARD HAS NO FACTION OF ITS OWN.
    // `faction: null` means every faction posts here, side by side, under the
    // square's truce — owner: "all of the factions should be able to post there
    // without interaction from each other." Rows stay GROUPED by faction because
    // that phrase is the whole point: a Reclaimers posting taken off this board
    // is still Reclaimers work, costing and paying Reclaimers standing.
    if (board.faction === null) {
      const groups = neutralBoardPostings(
        FACTIONS,
        (fid) => getStanding(player.factionStanding, fid),
        player.activeFactionQuestIds ?? [],
        player.completedFactionQuestIds ?? [],
      );
      if (groups.length === 0) {
        // ⚠ OTA-1474's rule, on this door too: an empty board says WHY it is
        // empty rather than shrugging. Here the honest answer is that nine
        // pools came back with nothing, which is a different fact from one
        // faction having nothing.
        get().appendLog(
          'world',
          'The Market post is bare — every colour has cleared its work off it. '
          + 'Turn in what you are carrying, or earn standing with somebody, and it fills again.',
        );
        return;
      }
      const total = groups.reduce((n, g) => n + g.postings.length, 0);
      get().appendLog(
        'world',
        `▣ The Market Post — ${total} open ${total === 1 ? 'contract' : 'contracts'} from `
        + `${groups.length} ${groups.length === 1 ? 'faction' : 'factions'}. `
        + 'The square\'s truce holds on the paper too: nobody here minds who else is nailed up beside them.',
      );
      for (const g of groups) {
        get().appendLog('world', `— ${g.factionName} —`);
        for (const q of g.postings) {
          get().appendLog('world', `• "${q.title}" — ${q.objective} (reward: ${q.reward.tc} TC${q.reward.rep > 0 ? `, +${q.reward.rep} rep with the ${g.factionName}` : ''})`);
        }
      }
      get().appendLog(
        'arbiter',
        `The Arbiter reads down the post. "Type ACCEPT <name> to take one on — e.g. accept ${groups[0]!.postings[0]!.title.toLowerCase()}. `
        + 'Whose colour it flies decides who you answer to for it, and who pays."',
      );
      void get().persist();
      return;
    }
    const factionLabel = FACTIONS.find((f) => f.id === board.faction)?.name ?? board.faction.replace(/_/g, ' ');
    const pool = availableFactionQuests(
      board.faction,
      getStanding(player.factionStanding, board.faction),
      player.activeFactionQuestIds ?? [],
      player.completedFactionQuestIds ?? [],
    );
    if (pool.length === 0) {
      get().appendLog('world', `The ${factionLabel} mission board is clear — nothing posted for you right now. Turn in your active work, then check back.`);
      return;
    }
    get().appendLog('world', `▣ ${factionLabel} Mission Board — open postings:`);
    for (const q of pool) {
      get().appendLog('world', `• "${q.title}" — ${q.objective} (reward: ${q.reward.tc} TC${q.reward.rep > 0 ? `, +${q.reward.rep} rep` : ''})`);
    }
    get().appendLog(
      'arbiter',
      `The Arbiter taps the board. "Type ACCEPT <name> to take one on — e.g. accept ${pool[0]!.title.toLowerCase()}. Bring the work back here, or to any ${factionLabel} agent, to turn it in."`,
    );
    void get().persist();
  },

  toggleBoardFreeze() {
    const s = get();
    if (s.frozenBoard) {
      // Release. The manual escape hatch — owner: "in case you hit the pause button, then
      // decide you don't want to do a bounty… or maybe you just want to see the cool green
      // and red lights flicker."
      set({ frozenBoard: null });
      get().appendLog('system', 'The board runs again — the war picks up where it never actually stopped.');
      return;
    }
    // ⚠ CLEAR, THEN CAPTURE, EVERY TIME. There is deliberately no reuse of a previous
    // snapshot: the press that creates one is the press that unlocks accepting, and
    // accepting releases the freeze, so a snapshot cannot outlive the decision it was
    // taken for. That is the whole reason it can never go stale.
    const hour = s.player?.hoursElapsed ?? 0;
    set({ frozenBoard: { relations: { ...(s.worldMemory.factionRelations ?? {}) }, takenAtHour: hour } });
    get().appendLog(
      'system',
      'You hold the board still. Whoever stands together right now is who your standing will carry to — take the contract on this reading.',
    );
  },

  acceptMissionOffer() {
    const offer = get().pendingMissionOffer;
    const player = get().player;
    if (!offer || !player) { set({ pendingMissionOffer: null }); return; }
    if (offer.kind === 'broker') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const broker = require('../../engine/broker');
      const tileName = (id: string) => getLocationById(id)?.name ?? id;
      const mission = { factionA: offer.factionA, factionB: offer.factionB };
      set((s) => (s.player ? {
        player: { ...s.player, brokerMission: mission, brokerOfferDeclined: false },
        pendingMissionOffer: null,
      } : s));
      // OTA-506 — the parley contract becomes grid events: a yellow "?" at each
      // faction's relic location, flipped to a red "X" when the alliance is sealed.
      for (const l of (broker.missionLegs(mission) ?? [])) {
        const cell = canonicalCellFor((l as { tileId: string }).tileId);
        get().canonizeLocation({
          id: `contract_${(l as { factionId: string }).factionId}`,
          name: `${(l as { factionName: string }).factionName}: ${(l as { itemName: string }).itemName}`,
          type: 'contract', danger: 2, source: 'contract',
          gx: cell.x, gy: cell.y, marker: 'pending',
        });
      }
      const has = (name: string) => get().player!.inventory.some((i) => i.name === name);
      const line = broker.brokerMissionLine(mission, has, tileName);
      get().appendLog('world', `You sit down at the parley stone — the contract is yours.${line ? ` ${line}` : ''}`);
      void get().persist();
      return;
    }
    set({ pendingMissionOffer: null });
  },

  declineMissionOffer() {
    const offer = get().pendingMissionOffer;
    if (!offer) { set({ pendingMissionOffer: null }); return; }
    set((s) => (s.player
      ? { player: { ...s.player, brokerOfferDeclined: true }, pendingMissionOffer: null }
      : { pendingMissionOffer: null }));
    get().appendLog('world', `You give the leaders a nod and step back. They'll keep the flats warm — PARLEY if you change your mind.`);
    void get().persist();
  },

  acceptBounty(bounty) {
    const player = get().player;
    if (!player) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bountyKey } = require('../../engine/factionBounty') as typeof import('../../engine/factionBounty');
    const slate = deps.activeBountiesOf(player);
    // OTA-859 — don't stack the exact same contract twice.
    if (slate.some((b) => bountyKey(b) === bountyKey(bounty))) {
      get().appendLog('system', `You already carry the ${bounty.giverName} contract on the ${bounty.targetName}.`);
      return;
    }
    // OTA-859 — hold up to MAX_ACTIVE_BOUNTIES at once; beyond that the slate is full.
    if (slate.length >= MAX_ACTIVE_BOUNTIES) {
      get().appendLog('system', `Your bounty slate is full (${MAX_ACTIVE_BOUNTIES}). Finish or abandon one first.`);
      return;
    }
    // ⚠ OTA-1165 — THE THREE REFUSALS, AND EVERY ONE OF THEM SPEAKS. Standing on the
    // quarry's own outpost (the 0-tile contract that started this: a 24h window with no
    // travel in it, against a 6h patrol cooldown, needing 3-9 kills); camping one board
    // for repeat work; and the board still running, which means no snapshot exists to
    // lock the politics in. The last one POINTS AT THE FREEZE BUTTON rather than merely
    // saying no — the whole of OTA-1164 was a control that refused in silence.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BP = require('../../engine/bountyPolitics') as typeof import('../../engine/bountyPolitics');
    const hereCell = playerGridCell(player);
    const tgtCell0 = canonicalCellOf(bounty.targetLocationId);
    const verdict = BP.canAcceptBounty({
      atTargetCell: hereCell.x === tgtCell0.x && hereCell.y === tgtCell0.y,
      targetLocationName: bounty.targetLocationName,
      currentOutpostId: player.currentLocationId,
      currentOutpostName: (() => {
        try { return getLocationById(player.currentLocationId).name ?? player.currentLocationId; }
        catch { return player.currentLocationId; }
      })(),
      lastClearedOutpostId: get().worldMemory.lastBountyClearedOutpostId,
      boardFrozen: !!get().frozenBoard,
    });
    if (!verdict.ok) {
      const line = BP.refusalLine(verdict);
      if (line) {
        get().appendLog('arbiter', line);
        // The Contracts/World strip renders this; the feed alone scrolls away.
        set({ contractsNotice: { text: line, ts: Date.now() } });
      }
      deps.buzzBlocked();
      return;
    }
    // ⚠ OTA-1164 — A LIVE COURSE, not merely another contract on the slate. This read
    // `slate.length > 0`, which conflated "you already hold a bounty" with "you are
    // already walking somewhere" — and `travelTarget` is CLEARED the moment you arrive.
    // So the moment you reached your first contract's outpost, every later contract
    // silently refused to route, while the Arbiter told you *"your current course
    // holds"* over a course that no longer existed. The intent (see the routing call
    // below: stacking must not yank you off the first one's road) is preserved exactly
    // — there is simply nothing to protect when no road is running.
    const hadCourse = !!player.travelTarget || !!player.whisperCourse;
    // OTA-862 — stamp the accept hour so the contract can lapse after its in-game deadline.
    const acceptedAtHour = player.hoursElapsed ?? 0;
    // OTA-863 — DISTANCE-AWARE deadline. ⚠ OTA-1162 resized the travel term: it is the
    // 24h JOB budget plus 2.5h per tile (the honest all-in cost of crossing one), not the
    // old bare hour. Measured from the player's absolute cell at accept.
    const grid = playerGridCell(player);
    const tiles = canonicalDistanceFromGrid(grid.x, grid.y, bounty.targetLocationId);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bountyDeadlineFor } = require('../../engine/factionBounty') as typeof import('../../engine/factionBounty');
    // ⚠ OTA-1165 — `count` is passed now, so the window includes the WAITING. The patrol
    // cooldown puts a hard 6h floor between engagements, so a 9-kill job cannot be done in
    // a 3-kill job's time no matter how well it is played.
    const deadlineHours = bountyDeadlineFor(tiles, bounty.count);
    // ⚠ OTA-1165 — FREEZE THE POLITICS ONTO THE CONTRACT. Taken from the SNAPSHOT the
    // player froze, never from the live matrix: the board they read is the deal they get,
    // even if those two factions are at war by the time the last body drops.
    const frozen = get().frozenBoard;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const allFactions = (require('../../data/factions/factions.json') as Array<{ id: string }>).map((f) => f.id);
    const politics = BP.politicsOf(
      frozen?.relations ?? get().worldMemory.factionRelations,
      bounty.giverFactionId,
      allFactions,
      frozen?.takenAtHour ?? acceptedAtHour,
    );
    set((s) => (s.player ? { player: { ...s.player, activeBounties: [...slate, { ...bounty, progress: 0, acceptedAtHour, deadlineHours, politics }], activeBounty: undefined } } : s));
    // ⚠ AUTO-RELEASE. Owner: "once you accept the bounty it automatically unfreezes."
    // The press that froze the board is spent the moment it is used, so the next contract
    // must take its own fresh reading rather than inheriting this one.
    set({ frozenBoard: null });
    get().appendLog(
      'arbiter',
      hadCourse
        // ⚠ OTA-1163 — "around <place>" USED TO READ AS A REQUIREMENT and it never was
        // one: killCountsForBounty tests faction only, with no location term anywhere in
        // it. The place is a tip about where they gather. Both lines now say so, because
        // the owner ran a full contract believing he had to do the killing there.
        ? `"Another contract," the Arbiter says. "The ${bounty.giverName} want ${bounty.count} of the ${bounty.targetName} put down — anywhere you find them, though they're thickest around ${bounty.targetLocationName}. Added to your slate — your current course holds."`
        : `"A contract, then," the Arbiter says. "The ${bounty.giverName} want ${bounty.count} of the ${bounty.targetName} put down — anywhere you find them, though they'll be thick around ${bounty.targetLocationName}. Setting your course there now."`,
    );
    // Route the player to the quarry's outpost — but only if they weren't already on a
    // bounty course. Stacking a second contract must not yank you off the first one's road.
    if (!hadCourse) get().setTravelCourse(bounty.targetLocationId);
    // ⚠ OTA-1163 — THE FIRST CONTRACT COMES WITH SOMEONE TO EXPLAIN IT. Owner: "the first
    // time someone accepts a bounty gets a pop-up and it does it in character… since this
    // is your first bounty I'll show you the ropes." Raised LAST so it sits on top of the
    // routing, and gated on a one-shot flag rather than `slate.length === 0` — a player
    // who finished a contract has still seen the ropes, and an empty slate would show them
    // the card again every time they cleared it.
    if (!player.bountyPrimerSeen) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { bountyPrimerCard } = require('../../engine/bountyPrimer') as typeof import('../../engine/bountyPrimer');
      const card = bountyPrimerCard(bounty, deadlineHours, getStanding(player.factionStanding, bounty.giverFactionId));
      set((s) => (s.player ? { player: { ...s.player, bountyPrimerSeen: true } } : s));
      get().raiseSpotlightNotice(card.heading, card.title, card.flavor, card.rewards, {
        takeLabel: card.takeLabel,
        // Four paragraphs, shown once in a playthrough, with no way back to it.
        holdMs: 240000,
      });
    }
  },
  });
};
