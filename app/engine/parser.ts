import type { Intent, ParsedInput } from './types';

const intentDictionary: Record<Intent, string[]> = {
  stealth: ['hide', 'sneak', 'crawl', 'silently', 'creep', 'shadow', 'crouch', 'lurk'],
  attack: ['attack', 'strike', 'slash', 'stab', 'shoot', 'hit', 'kill', 'fight', 'charge', 'fire'],
  diplomacy: ['convince', 'persuade', 'negotiate', 'talk', 'parley', 'bargain', 'ask', 'speak', 'plead'],
  escape: ['run', 'flee', 'retreat', 'escape', 'leave', 'withdraw', 'bolt'],
  investigate: ['look', 'examine', 'inspect', 'search', 'study', 'check', 'investigate', 'read', 'open'],
  rest: ['rest', 'sleep', 'wait', 'recover', 'camp', 'heal'],
  inventory: ['inventory', 'pack', 'bag', 'gear', 'items', 'check pack'],
  travel: ['go', 'travel', 'walk', 'head', 'move', 'journey', 'enter', 'descend', 'climb'],
  use_relic: ['use', 'activate', 'invoke', 'apply', 'wield'],
  cast: ['cast', 'channel', 'mold', 'shape', 'aether', 'rune'],
  wait: ['stay', 'hold', 'pause', 'still'],
  unknown: [],
};

function emptyScores(): Record<Intent, number> {
  return {
    stealth: 0, attack: 0, diplomacy: 0, escape: 0, investigate: 0,
    rest: 0, inventory: 0, travel: 0, use_relic: 0, cast: 0, wait: 0,
    unknown: 0,
  };
}

export function parseInput(input: string): ParsedInput {
  const lower = input.toLowerCase();
  const scores = emptyScores();

  (Object.keys(intentDictionary) as Intent[]).forEach((intent) => {
    intentDictionary[intent].forEach((word) => {
      if (lower.includes(word)) scores[intent] += 1;
    });
  });

  let bestIntent: Intent = 'unknown';
  let bestScore = 0;
  (Object.keys(scores) as Intent[]).forEach((intent) => {
    if (scores[intent] > bestScore) {
      bestScore = scores[intent];
      bestIntent = intent;
    }
  });

  // crude target extraction: take the longest noun-ish token after a verb
  let target: string | undefined;
  const tokens = lower.split(/\s+/);
  const verbIdx = tokens.findIndex((t) => Object.values(intentDictionary).flat().includes(t));
  if (verbIdx >= 0 && verbIdx + 1 < tokens.length) {
    target = tokens.slice(verbIdx + 1).join(' ');
  }

  return { intent: bestIntent, scores, raw: input, target };
}
