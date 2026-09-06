// ⚠⚠⚠ STEP 3c — THE FACTION-QUEST PROBES, AND WHY THEY ARE NOT THE FOUR ROADS.
//
// The contrary walker asks a NARRATIVE question: the player deviates — arrives
// early, refuses, wanders off mid-hunt — and the four roads grade whether the
// game noticed. That works because a hunt, a mystery and a storyline are all the
// same object underneath: an ordered list of beats that a player action closes.
//
// A faction quest is not that object. Measured across the 65 authored contracts:
//
//     escort 29 (45%) · fetch 18 (28%) · staged 17 (26%) · staged+tc 1
//
// Only the 17 staged ones have beats at all. The other 48 keep a LEDGER — a
// count of items in the pack, a party of bodies that has to arrive alive, a
// purse that has to hold a number — and a ledger cannot be walked. It can only
// be audited: put it in a state the author did not picture, then ask whether the
// books still balance and whether the game SAID SO.
//
// ⚠⚠ SO THE GRADES ARE DIFFERENT TOO. The roads grade handled / acknowledged /
// prior-knowledge. A ledger probe grades:
//
//   · KEPT — did the rule actually hold? (the count was really re-read; the
//     items were really consumed; the second contract really paused the first)
//   · SAID — did the refusal explain ITSELF, in the player's terms, with the
//     number in it? A silent refusal is this codebase's own recurring defect
//     (OTA-1349: a hold-back nobody explains reads as the button being broken),
//     and on a counter it is worse, because the player cannot see the counter.
//
// ⚠ A probe with no ground is SKIPPED BY NAME, never silently passed — same
// rule the roads follow. A fetch probe has nothing to say about an escort.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { FACTION_QUESTS, type FactionQuestDef } from '../app/engine/factionQuests';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

export type Yes = 'yes' | 'no' | 'partial' | 'n/a';
export type FactionShape = 'fetch' | 'escort' | 'staged' | 'tc';

export interface FactionProbe {
  quest: string;
  shape: FactionShape;
  /** What the thumb did, in the player's terms. */
  did: string;
  /** What a game that keeps its books would do. */
  expected: string;
  /** The non-debug lines the feed carried while the probe ran. */
  saw: string[];
  kept: Yes;
  said: Yes;
  verdict: string;
}

export interface FactionProbeReport {
  probes: FactionProbe[];
  /** Probes this contract has no ground for, named so a skip is not read as a pass. */
  skipped: string[];
}

/** ⚠ The shape a contract actually is, by the same reading the engine uses:
 *  `fetch` and `escort` are explicit, `_escort` is an id-suffix opt-in
 *  (OTA-962), and everything left with stages is staged. tcThreshold rides on
 *  top of staged rather than replacing it, so it is reported as its own shape
 *  only when asked about specifically. */
export function shapeOf(def: FactionQuestDef): FactionShape {
  if (def.fetch) return 'fetch';
  if (def.escort || def.id.endsWith('_escort')) return 'escort';
  if (def.tcThreshold) return 'tc';
  return 'staged';
}

export function questsOfShape(shape: FactionShape): FactionQuestDef[] {
  return FACTION_QUESTS.filter((q) => shapeOf(q) === shape);
}

const store = useGameStore;

/** The feed as a player would read it — debug lines are ours, not theirs.
 *  ⚠ The store's feed is `gameLog` with a `channel` field. An earlier draft of
 *  this helper read `log`/`type`, got `undefined ?? []` for every probe, and
 *  reported EVERY refusal as silent — I was one step from filing a defect
 *  against the game for a bug in the instrument. A probe that cannot see is
 *  worse than no probe, so `feedSees` below is asserted before any probe runs. */
export function feedSince(mark: number): string[] {
  const log = store.getState().gameLog ?? [];
  return log
    .slice(mark)
    .filter((l) => l.channel !== 'debug')
    .map((l) => String(l.text ?? ''))
    .filter(Boolean);
}

export const feedMark = (): number => (store.getState().gameLog ?? []).length;

/** ⚠⚠ THE INSTRUMENT'S OWN SELF-TEST. Emit a line and prove the reader sees it.
 *  Every probe below grades "did the game SAY so", and a reader wired to the
 *  wrong field answers "no" to that question perfectly, for every case, forever. */
export function feedSees(): boolean {
  const m = feedMark();
  store.getState().appendLog('system', 'probe: instrument self-test');
  return feedSince(m).some((l) => l.includes('instrument self-test'));
}

/** Did the refusal explain itself, and did it carry the NUMBER? A refusal that
 *  says only "you can't" leaves the player staring at a button. */
export function saidWithNumber(saw: string[], ...numbers: (string | number)[]): Yes {
  const text = saw.join(' \n ').toLowerCase();
  if (!text.trim()) return 'no';
  const hasNumber = numbers.some((n) => text.includes(String(n).toLowerCase()));
  return hasNumber ? 'yes' : 'partial';
}

/** Stand a character up with enough standing to be handed anything, in a scene
 *  with a same-faction agent to take it from and turn it in to. */
export async function bootWithAgent(factionId: string): Promise<void> {
  await store.getState().startNewGame({
    name: 'Auditor',
    raceId: getRaces()[0]!.id,
    factionId: getFactions()[0]!.id,
  });
  const agent = { id: 'v_probe_agent', name: 'Sallow Vek', title: 'agent', faction: factionId, description: 'an agent', offers: [] };
  store.setState((s) => ({
    player: {
      ...s.player!,
      factionStanding: [
        ...s.player!.factionStanding.filter((r) => r.factionId !== factionId),
        { factionId, standing: 90 },
      ],
    } as PlayerCharacter,
    currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: agent } as never,
  }));
}

/** Put `n` of a named item in the pack, replacing any stack already there, so a
 *  probe controls the count exactly. */
export function holdItems(name: string, n: number): void {
  store.setState((s) => {
    const inv = (s.player!.inventory ?? []).filter((i) => i.name.toLowerCase() !== name.toLowerCase());
    const next = n > 0
      ? [...inv, { id: `probe_${name}`, name, kind: 'material', quantity: n, tags: ['loot'] } as unknown as InventoryItem]
      : inv;
    return { player: { ...s.player!, inventory: next } as PlayerCharacter };
  });
}

export const countHeld = (name: string): number =>
  (store.getState().player?.inventory ?? [])
    .filter((i) => i.name.toLowerCase() === name.toLowerCase())
    .reduce((n, i) => n + (i.quantity ?? 1), 0);

export const isActive = (id: string): boolean =>
  (store.getState().player?.activeFactionQuestIds ?? []).includes(id);

export const isComplete = (id: string): boolean =>
  (store.getState().player?.completedFactionQuestIds ?? []).includes(id);

export function trackedFlag(id: string): boolean | undefined {
  return (store.getState().player?.activeFactionQuests ?? []).find((q) => q.id === id)?.tracked;
}

export function formatProbes(r: FactionProbeReport): string {
  const rows = r.probes.map((p) => {
    const head = `  [${p.kept === 'yes' ? '✓' : p.kept === 'partial' ? '~' : '✗'} kept | ${p.said === 'yes' ? '✓' : p.said === 'partial' ? '~' : '✗'} said]  ${p.quest} (${p.shape})`;
    return [head, `      did:      ${p.did}`, `      expected: ${p.expected}`, `      verdict:  ${p.verdict}`,
      ...p.saw.slice(0, 4).map((l) => `      | ${l}`)].join('\n');
  });
  const skips = r.skipped.length ? [`  skipped (no ground): ${r.skipped.join(', ')}`] : [];
  return [`faction-quest probes — ${r.probes.length} run, ${r.skipped.length} skipped`, ...rows, ...skips].join('\n');
}
