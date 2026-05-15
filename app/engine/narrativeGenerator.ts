import type { WeatherEntry, Hazard, Enemy, Location, Quest, InventoryItem, ParsedInput } from './types';
import { pick, chance } from './rng';
import openings from '../data/events/openings.json';

const openingsList = openings as string[];

export function buildOpening(): string {
  return pick(openingsList);
}

export interface SceneInput {
  weather: WeatherEntry;
  location: Location;
  hazard?: Hazard | null;
  enemy?: Enemy | null;
  quest?: Quest | null;
}

export function buildScene(input: SceneInput): string {
  const parts: string[] = [];

  parts.push(`${input.weather.description}`);
  parts.push(`You are at ${input.location.name}. ${input.location.description}`);

  if (input.hazard) {
    parts.push(`Hazard: ${input.hazard.name}. ${input.hazard.description}`);
  }

  if (input.enemy) {
    parts.push(`A ${input.enemy.name} (${input.enemy.type}, ${input.enemy.rarity}) emerges. Its ${input.enemy.attack} can deal ${input.enemy.damage}.`);
  }

  if (input.quest) {
    parts.push(`Objective: ${input.quest.objective.verb} ${input.quest.objective.target} ${input.quest.complication.text}.`);
  }

  return parts.join('\n\n');
}

export function buildArbiterRemark(context: { location: Location; hazard?: Hazard | null }): string {
  const remarks: string[] = [
    `The Arbiter inclines their head. "${context.location.name}... a place of whispers. Tread softly."`,
    `"Not many return from these ruins unscathed," the Arbiter murmurs. "Be wise with your steps."`,
    `"The Aether has a way of showing you things, if you listen," the Arbiter says, almost to themselves.`,
    `"Once, this was a place of life and power... now, only whispers remain."`,
    `The Arbiter watches you a moment too long. "If only I'd understood things sooner... but that was long ago."`,
  ];
  if (context.hazard) {
    remarks.push(`The Arbiter eyes the ${context.hazard.name.toLowerCase()}. "I'd place that at a Hard, if I had to guess."`);
  }
  return pick(remarks);
}

export function shouldArbiterSpeak(): boolean {
  return chance(35);
}

export interface SoftArbiterContext {
  parsed: ParsedInput;
  inventory: InventoryItem[];
  enemy?: Enemy | null;
  location: Location;
  hazard?: Hazard | null;
}

export function buildSoftArbiterFallback(ctx: SoftArbiterContext): string {
  const { parsed, inventory, enemy, location } = ctx;

  if (parsed.resolvedNoun) {
    return `The Arbiter follows your gaze toward the ${parsed.resolvedNoun.toLowerCase()}. "Tell me what you would do with it."`;
  }

  if (enemy) {
    return pick([
      `The Arbiter does not look away from the ${enemy.name.toLowerCase()}. "Decide quickly. It will not wait."`,
      `"You can fight, hide, or speak," the Arbiter says low. "${enemy.name} is already deciding for itself."`,
    ]);
  }

  if (inventory.length > 0) {
    const item = pick(inventory);
    return `The Arbiter glances at your pack. "Your ${item.name.toLowerCase()} is still there, if it suits the moment."`;
  }

  return pick([
    `The Arbiter waits, expression unreadable. "Say it plainer — the stones are listening."`,
    `"Search, rest, or move on," the Arbiter offers. "Even small choices echo in ${location.name}."`,
    `The Arbiter studies you. "Phrase it as the deed you mean to do. Look. Search. Strike. Flee."`,
  ]);
}
