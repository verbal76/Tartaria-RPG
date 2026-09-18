/* ⚠⚠⚠ OTA-1844 — THE LAST WALK.
 *
 * Owner ruling, in full: a Dog Fallen exists, is NEVER hostile, gives no loot,
 * no XP, no TC, no gear and no keepsake item, travels only between two devices,
 * may visit many houses, may be rested by any one of them exactly once, and is
 * NOT auto-rested by walking away.
 *
 * ⚠⚠ THIS FILE IS THE ONLY PLACE THE LAST WALK IS DECIDED OR SPOKEN. Which
 * lines print, on which channel, in what order, what an act does and what
 * closure says — all of it lives here beside the sentences, for the reason
 * OTA-1843 established: the store is at its ceiling and presentation was never
 * its job anyway. `gameStore` calls in and gets lines back.
 *
 * ⚠ AND IT KNOWS NOTHING ABOUT COMBAT. There is no enemy row, no HP, no attack
 * table, no loot roll — deliberately, not incidentally. A Hollowed is a fight
 * you win; this is a dog you stay with, and the two share no code path at all.
 */
import type { FallenDog, ForeignDog, RestRecord } from './fallenLedger';
import { dogFallenKey } from './fallenLedger';
import { applyDogPronouns } from './dogCompanion';
import type { DogCompanion } from './types';

/** The same ordered-beat shape OTA-1843 gave the Hollowed, for the same reason:
 *  one authority decides the channel, so three call sites cannot drift. */
export type FallenLogChannel = 'world' | 'arbiter' | 'combat' | 'system' | 'reward';
export interface FallenLogLine { channel: FallenLogChannel; text: string }

const say = (d: FallenDog, t: string) => applyDogPronouns(t, d.pronoun);

/** The house that sent them, or null for a companion of your own dead. */
export function dogHouse(d: FallenDog): string | null {
  const h = d.origin?.player;
  return h && h.trim() ? h.trim() : null;
}

/** ⚠ THE ONE NAMING, used by the preview, the arrival, the encounter and the
 *  roll — so a dog is never introduced two different ways. It names the HANDLER
 *  first and the house second, because the thing that matters about this dog is
 *  whose it was, not which install it crossed from. */
export function dogTitle(d: FallenDog): string {
  const house = dogHouse(d);
  return house
    ? `${d.name}, who walked with ${d.handler} of House ${house}`
    : `${d.name}, who walked with ${d.handler}`;
}

/** The COMPANIONS roll's one-liner: who, and how long they had. */
export function dogRollLine(d: FallenDog): string {
  const h = d.hours > 0 ? ` · ${d.hours}h together` : '';
  return `${dogTitle(d)}${h}`;
}

// ---------------------------------------------------------------------------
// death side
// ---------------------------------------------------------------------------
/** ⚠⚠ THE ENTRY GATE, and it is `with_player` ONLY.
 *
 *  `waiting_at_base` is NOT here, and the exclusion is a source finding rather
 *  than caution. That status covers TWO different dogs — ExplorationScreen says
 *  so in its own comment — and neither belongs:
 *
 *    · a CLIMB-BENCHED dog is healthy and deliberately left at the bottom of a
 *      wall while its handler goes up. Recording "they died together" for a dog
 *      standing unhurt fifty feet below would make the record a lie, and every
 *      OTA in this lineage exists to stop records lying.
 *    · a COMBAT-DOWNED dog is at 0 HP inside the 24-hour bleed-out window, which
 *      a 300 TC vendor visit undoes. The owner excluded revivable deaths by
 *      name, and this is one.
 *
 *  Telling the two apart at the death beat would mean reading combat-scene state
 *  (`elevatedOn`) from inside the death path — exactly the cross-authority read
 *  that produced OTA-1796's class of defect. One status, one meaning, no guess. */
export function dogIsEligibleForLastWalk(dog: DogCompanion | null | undefined): boolean {
  return !!dog && dog.status === 'with_player';
}

/** Build the durable record from the living dog, at the moment its handler
 *  falls. Nothing mechanical is carried: not stats, not loyalty, not hp, and
 *  the vest only as the WORD on it. */
export function fallenDogFromCompanion(args: {
  dog: DogCompanion;
  handler: string;
  where: string;
  hours: number;
  ts: number;
}): FallenDog {
  const vest = args.dog.equipped?.vest;
  return {
    id: args.dog.id,
    name: args.dog.name,
    breed: args.dog.breed,
    pronoun: args.dog.sex?.pronoun ?? 'they',
    handler: args.handler,
    where: args.where,
    hours: Math.max(0, Math.round(args.hours)),
    ...(vest ? { vestName: vest } : {}),
    ts: args.ts,
  };
}

// ---------------------------------------------------------------------------
// arrival
// ---------------------------------------------------------------------------
/** What the player is told when companions come in with a payload. Separate
 *  from the dead, and never phrased as something to go and kill. */
export function dogArrivalLog(dogs: readonly FallenDog[]): FallenLogLine[] {
  if (dogs.length === 0) return [];
  const out: FallenLogLine[] = [];
  for (const d of dogs.slice(0, 6)) {
    out.push({ channel: 'world', text: `${dogTitle(d)} may now be found in these wastes.` });
  }
  if (dogs.length > 6) {
    out.push({ channel: 'world', text: `And ${dogs.length - 6} more besides.` });
  }
  out.push({
    channel: 'arbiter',
    text: `The Arbiter is quiet a moment. "They are not hunting anything. If you meet one, it will be waiting."`,
  });
  return out;
}

// ---------------------------------------------------------------------------
// the encounter
// ---------------------------------------------------------------------------
/** The three gentle acts. Order does not matter; doing all three does.
 *  Deliberately NOT random — a dog deciding to trust you on a die roll would
 *  make the moment a slot machine, and the one thing this encounter has to be
 *  is something the player chose. */
export const LAST_WALK_ACTS = ['speak', 'name', 'sit'] as const;
export type LastWalkAct = (typeof LAST_WALK_ACTS)[number];
/** LEAVE and the hostile path both end it; neither writes anything. */
export type LastWalkChoice = LastWalkAct | 'leave' | 'hostile';

export const LAST_WALK_ACT_LABEL: Record<LastWalkAct, string> = {
  speak: 'SPEAK SOFTLY',
  name: 'CALL BY NAME',
  sit: 'SIT AND WAIT',
};

export function lastWalkOpeningLog(d: FallenDog): FallenLogLine[] {
  const house = dogHouse(d);
  return [
    {
      channel: 'world',
      text: say(d, 'There is a dog on the rise ahead, thin and still, watching you come. {Pronoun} {isOrAre} not afraid and {pronoun} {isOrAre} not coming closer.'),
    },
    {
      channel: 'arbiter',
      text: house
        ? `The Arbiter stops walking. "That one is not from here. ${d.name} — ${d.handler}'s dog, out of House ${house}. They went down together."`
        : `The Arbiter stops walking. "That one is ${d.name}. ${d.handler}'s dog. They went down together."`,
    },
    {
      channel: 'system',
      text: `${d.name} is not an enemy. Nothing here is a fight. You can stay, or you can go.`,
    },
  ];
}

/** One act's line. `already` is true when the player repeats an act they have
 *  already given — it costs nothing and changes nothing, which is the honest
 *  answer rather than a refusal. */
export function lastWalkActLine(d: FallenDog, act: LastWalkAct, already: boolean): string {
  if (already) {
    return say(d, {
      speak: `You have already said it, and ${d.name} has already heard it.`,
      name: `${d.name} knows the sound of {possessive} own name by now.`,
      sit: `You are already down in the dirt with {object}. There is nothing to do but the waiting.`,
    }[act]);
  }
  return say(d, {
    speak: `You keep your voice low and say nothing that means anything. ${d.name}'s ears come forward.`,
    name: `"${d.name}." The head lifts. Whatever else the mud took, it did not take that.`,
    sit: `You sit down in the dirt and look at nothing in particular. After a while the tail moves, once.`,
  }[act]);
}

/** Ordered beats for the resolution. This is the whole reward. */
export function lastWalkSettleLog(d: FallenDog, byCharacter: string): FallenLogLine[] {
  return [
    {
      channel: 'world',
      text: say(d, `${d.name} crosses the last of the ground in {possessive} own time, turns a circle, and lies down against your leg.`),
    },
    {
      channel: 'world',
      text: d.vestName
        ? say(d, `The ${d.vestName} is still on {object}, worn through at the shoulder. You leave it where it is.`)
        : say(d, `There is nothing on {object} and nothing to take. There was never going to be.`),
    },
    {
      channel: 'world',
      text: say(d, `{Pronoun} {isOrAre} still for a long while, and then {pronoun} {isOrAre} still.`),
    },
    {
      channel: 'arbiter',
      text: `The Arbiter says, "${byCharacter}. Word of this goes to ${d.handler}'s house. They will want to know ${d.name} was not alone."`,
    },
  ];
}

export function lastWalkLeaveLine(d: FallenDog): string {
  return say(d, `You stand and walk on. ${d.name} watches you go and does not follow. {Pronoun} {isOrAre} still out here.`);
}

/** ⚠ THE HOSTILE PATH IS AN EXIT, NOT A FIGHT. No damage is rolled, no enemy is
 *  built, nothing drops, and the record stays open — the dog is simply gone from
 *  this ground and still walking. Refusing to make dog-killing a mechanic is the
 *  point of the ruling, so there is nothing here for it to hook into. */
export function lastWalkFleeLine(d: FallenDog): string {
  return say(d, `${d.name} is up and gone before your hand finishes moving — a shape between the rocks, and then nothing. Whatever that was, it was not owed to {object}.`);
}

/** Has this act already been given? */
export function lastWalkSettles(given: readonly LastWalkAct[]): boolean {
  return LAST_WALK_ACTS.every((a) => given.includes(a));
}

// ---------------------------------------------------------------------------
// closure
// ---------------------------------------------------------------------------
/** ⚠⚠ DOG CLOSURE RIDES THE HUMAN REST TRANSPORT UNCHANGED. `RestRecord` was
 *  already keyed by an opaque string with a 60-char bound, already deduped on
 *  `<fallenKey>|<byInstallId>`, and already travels home inside the sender's
 *  ordinary payload. A dog key fits inside every one of those assumptions, so
 *  nothing about human closure moves — no new field, no widened type, no second
 *  transport. The `dog:` prefix is what tells the two apart on the way back. */
export function isDogRest(r: { fallenKey: string }): boolean {
  return r.fallenKey.startsWith('dog:');
}

export function buildDogRest(args: {
  dog: ForeignDog;
  byPlayer: string;
  byInstallId: string;
  byCharacter: string;
  whereRested: string;
  ts: number;
}): RestRecord {
  return {
    fallenKey: dogFallenKey(args.dog),
    fallenName: args.dog.name,
    fallenOriginPlayer: args.dog.origin.player,
    byPlayer: args.byPlayer,
    byInstallId: args.byInstallId,
    byCharacter: args.byCharacter,
    whereRested: args.whereRested,
    ts: args.ts,
    description: dogClosureSentence({
      name: args.dog.name,
      whereRested: args.whereRested,
      byCharacter: args.byCharacter,
    }),
  };
}

/** ⚠ THE SENTENCE THAT GOES HOME. It is the entire reward on both sides, so it
 *  says the three things the origin player actually wants: which dog, where it
 *  ended, and that somebody was there. No ids, no house codes, no storage
 *  words — nothing a player would have to be a programmer to read. */
export function dogClosureSentence(a: { name: string; whereRested: string; byCharacter: string }): string {
  return `${a.name} stopped at ${a.whereRested}. ${a.byCharacter} sat with them. They were not alone.`;
}

/** What the ORIGIN player is shown when the word comes back. Reads off the rest
 *  record alone — their dog left their world a long time ago. */
export function dogClosureHomeLine(r: RestRecord): string {
  return r.description && r.description.trim()
    ? r.description.trim()
    : dogClosureSentence({ name: r.fallenName, whereRested: r.whereRested, byCharacter: r.byCharacter });
}
