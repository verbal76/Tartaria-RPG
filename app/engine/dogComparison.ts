import type { DogCompanion } from './types';
import type { ProspectiveDog } from './dogBreeds';
import { DOG_STAT_KEYS, type DogStatName } from './dogBreeds';
import { dogStatCeiling } from './dogCompanion';

/** ⚠⚠⚠ THE NUMBERS THE COMPARISON CARD SHOWS, COMPUTED WHERE THEY CAN BE TESTED.
 *
 *  Owner rule, stated as an absolute: *"exact CURRENT / MAXIMUM is shown for
 *  both dogs — no vague 'high potential' abstraction."* And the other half of
 *  it: *"The UI must not call one dog 'better.' The player decides."*
 *
 *  Both are properties of THIS file, not of the component. The rows carry four
 *  numbers and no verdict — no winner flag, no delta, no arrow, no colour hint,
 *  nothing a renderer could turn into a recommendation without inventing it.
 *  A test can therefore prove the absence of a judgment, which it cannot do by
 *  reading a stylesheet.
 *
 *  ⚠ THE CEILING COMES FROM `dogStatCeiling`, THE TRAINER'S OWN AUTHORITY.
 *  Not from `dog.potential` directly. A legacy dog that has not been migrated
 *  yet has no `potential` at all, and the trainer answers that case with the
 *  absolute engine maximum — so the card must answer it the same way or it
 *  would promise a ceiling the trainer will not honour. */

export interface DogStatRow {
  readonly stat: DogStatName;
  /** 'STR' / 'DEX' / 'INT' — what the card prints. */
  readonly label: string;
  /** null when there is no companion: the card shows a blank left column
   *  rather than zeros, because a zero is a claim and an absence is not. */
  readonly current: { readonly now: number; readonly max: number } | null;
  readonly prospective: { readonly now: number; readonly max: number };
}

const STAT_LABEL: Record<DogStatName, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
};

/** ⚠ ONLY A LIVING COMPANION HAS A LEFT-HAND COLUMN. A dead or abandoned
 *  `player.dog` is a record the game keeps (OTA-346), not a dog standing next
 *  to you, and putting its numbers opposite a living animal would invite the
 *  player to compare against something they cannot keep. */
export function comparableDog(dog: DogCompanion | null | undefined): DogCompanion | null {
  if (!dog) return null;
  if (dog.status !== 'with_player' && dog.status !== 'waiting_at_base') return null;
  return dog;
}

export function comparisonRows(
  dog: DogCompanion | null | undefined,
  prospective: ProspectiveDog,
): DogStatRow[] {
  const mine = comparableDog(dog);
  return DOG_STAT_KEYS.map((stat) => ({
    stat,
    label: STAT_LABEL[stat],
    current: mine
      ? { now: Math.round(mine.stats[stat] ?? 0), max: dogStatCeiling(mine, stat) }
      : null,
    prospective: { now: prospective.stats[stat], max: prospective.potential[stat] },
  }));
}

/** The HP line, which the stat rows deliberately do not carry: HP is a pair of
 *  numbers with different meaning (now / max today), not a now-against-ceiling,
 *  and folding it into the same shape would make the card read as if a dog's
 *  hit points had a potential too. */
export function hpLine(
  dog: DogCompanion | null | undefined,
  prospective: ProspectiveDog,
): { current: { hp: number; hpMax: number } | null; prospective: number } {
  const mine = comparableDog(dog);
  return {
    current: mine ? { hp: mine.hp, hpMax: mine.hpMax } : null,
    prospective: prospective.hpMax,
  };
}

/** ⚠⚠ WHAT THE PLAYER LOSES, NAMED BEFORE THEY COMMIT — owner rules 17 and 20.
 *
 *  Returns null when there is nothing to lose. When there IS, every field is a
 *  fact the confirmation has to say out loud: the dog's name, that the release
 *  is permanent, and the exact piece of gear that walks away with it.
 *
 *  ⚠ THE VEST IS READ LIVE. The card recomputes this every render, so taking
 *  the vest off inside the card makes the warning change under the player's
 *  hand — which is the entire reason the UNEQUIP control is on this surface
 *  and not buried three screens away in the pack. */
export function replacementCost(
  player: {
    dog?: DogCompanion | null;
    inventory?: ReadonlyArray<{ id: string; name: string; kind?: string; quantity?: number; tags?: readonly string[]; uniqueStats?: { kind?: string } }>;
  },
): { dogName: string; vest: { id: string; name: string } | null } | null {
  const mine = comparableDog(player.dog);
  if (!mine) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DC = require('./dogCompanion') as typeof import('./dogCompanion');
  const wornId = DC.wornDogVestInstanceId(player);
  const worn = wornId ? (player.inventory ?? []).find((it) => it.id === wornId) : null;
  return { dogName: mine.name, vest: worn ? { id: worn.id, name: worn.name } : null };
}
