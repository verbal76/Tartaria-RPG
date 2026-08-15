// OTA-1106 — ⚠ THE STALL WAS THE PROMPT, NOT THE MODEL.
//
// OTA-1105's telemetry shipped and the first device log answered the question
// the 29-second mystery had been sitting on for two OTAs — and the answer
// contradicts the assumption behind it:
//
//   qwen⏱ ambient          ok 16822ms wait 2255ms (139ch)   ← 14.5s GENERATING
//   qwen⏱ investigate_lore ok  1131ms            (132ch)   ← 1.1s, same size
//   qwen⏱ item_synthesis   ok  5156ms            (216ch)
//   flourish (OTA-1063 timer)  2087ms
//
// Same model, same device, near-identical OUTPUT length — 13× the time. The
// variable is not how much the model writes, it is how much it has to READ
// first. Prefill dominates: ambient was reading a ~1,145-token scene dossier
// to write an 18-word aside, while investigate_lore and flourish send a
// couple of hundred tokens and answer in a second.
//
// ⚠ THE CORRECTION THAT MATTERS: this was assumed to need the native rebuild
// (n_predict 120→40, more threads, warm context — Phase 6, build-bound and
// parked). It does not. Cutting the OUTPUT cap would have done almost
// nothing here, because the output was never the cost. The prompt is pure
// JavaScript and ships in an OTA.
//
// Two changes, both measured:
//   1. AMBIENT GETS A LEAN PROMPT. ~1,145 → ~542 tokens. AMBIENT_INSTRUCTION
//      is explicit that the beat must NOT react to the last action, so exits,
//      entity lists, the environment paragraph, canon lore and the pack
//      manifest were all scene-reaction material the instruction forbids
//      using. The location anchor STAYS verbatim — it is the only thing
//      stopping the model naming places out of training data.
//   2. THE PACK MANIFEST IS CAPPED. A salvage-heavy run carries 70+ rows;
//      the device log's pack was ~1,440 characters of item names in EVERY
//      narration prompt — a third of the whole thing. Worn kit is still
//      named in full (the narrator swings it); the stowed list caps at 14
//      with an honest "…and N more".

jest.setTimeout(20000);

import {
  buildSystemPrompt,
  stringifyInventory,
  INVENTORY_PROMPT_CAP,
} from '../app/engine/contextInjector';
import type { InventoryItem, PlayerEquipped } from '../app/engine/types';

const promptChars = (ctx: Parameters<typeof buildSystemPrompt>[0]): number =>
  buildSystemPrompt(ctx).reduce((n, m) => n + m.content.length, 0);

const ctxOf = (fullInventory: string, ambient: boolean): Parameters<typeof buildSystemPrompt>[0] => ({
  current_biome: 'Buried Capital',
  room_name: "The Architect's Blind",
  environmental_description:
    'A Conspiracy of Architects observation-blind disguised as a collapsed waystation. Behind the false rubble: a map-wall of routes the public must never connect, and a quiet door onto the road. Weather: Aetheric Storm — blue lightning across the horizon, electronics fail, the air tastes like copper.',
  available_exits: "north: Tartarian Outskirts · east: Dynasty Border Post · south: Iskan-Veil · west: Reclaimer's Stake",
  active_entities: 'Ember (dog), Tarek the Tinkerer (vendor)',
  player_stats: 'STR5 DEX12 INT3 WIS8 CHA9 STE1 HP 23/23',
  full_inventory: fullInventory,
  recent_history: 'investigate rubble',
  in_combat: false,
  ambient,
}) as Parameters<typeof buildSystemPrompt>[0];

const bigPack: InventoryItem[] = Array.from({ length: 70 }, (_, i) => ({
  id: `probe_${i}`,
  name: `${['Aether Crystal', 'Aether Dust', 'Worn Tartarian Coin', 'Scrap Metal', 'Cloth Scrap', 'Bone Sliver', 'Automaton Circuit'][i % 7]} ${i}`,
  kind: 'misc',
  quantity: 1,
  tags: ['loot'],
} as unknown as InventoryItem));
const worn = { main: 'Cudgel', off: 'Bolt-Caster', head: "Reclaimer's Salvage Cap" } as PlayerEquipped;

describe('OTA-1106 — the pack manifest is capped', () => {
  it('⚠ a 70-row salvage pack no longer dumps 70 names into every prompt', () => {
    const capped = stringifyInventory(bigPack, worn, 56);
    const uncapped = stringifyInventory(bigPack, worn, 56, 0);
    expect(capped.length).toBeLessThan(uncapped.length / 3);
    // The sample is honest about what it left out — the model is told the
    // pack is deeper than the list, so it never narrates "you carry only…".
    expect(capped).toMatch(/…and \d+ more/);
    expect(capped).toContain('Aether Crystal 0');
  });

  it('the WORN kit survives the cap in full — the narrator swings it', () => {
    const capped = stringifyInventory(bigPack, worn, 56);
    expect(capped).toContain('main hand Cudgel');
    expect(capped).toContain('off hand Bolt-Caster');
  });

  it('a small pack is untouched — no cap artifacts, no behaviour change', () => {
    const few: InventoryItem[] = bigPack.slice(0, 3);
    const s = stringifyInventory(few, worn, 10);
    expect(s).not.toMatch(/…and/);
    expect(s).toContain('10 TC');
  });

  it('an empty pack still reads as empty', () => {
    expect(stringifyInventory([], undefined, 0)).toBe('Empty pack');
  });

  it('the cap is a named constant, not a magic number buried in a loop', () => {
    expect(INVENTORY_PROMPT_CAP).toBeGreaterThanOrEqual(8);
    expect(INVENTORY_PROMPT_CAP).toBeLessThanOrEqual(20);
  });
});

describe('OTA-1106 — ambient reads a lean prompt', () => {
  const bigInvString = stringifyInventory(bigPack, worn, 56, 0);

  it('⚠ ambient is less than HALF the weight of the scene-reaction prompt', () => {
    // The measured cause of a 14.5-second generation for an 18-word line.
    const ambient = promptChars(ctxOf(bigInvString, true));
    const narration = promptChars(ctxOf(bigInvString, false));
    expect(ambient).toBeLessThan(narration * 0.55);
  });

  it('ambient drops exactly the scene-reaction material its own instruction forbids', () => {
    const p = buildSystemPrompt(ctxOf(bigInvString, true))[0]!.content;
    // AMBIENT_INSTRUCTION: "DO NOT narrate or react to their last action."
    expect(p).not.toContain('Exits:');
    expect(p).not.toContain('Entities Present:');
    expect(p).not.toContain('Inventory & Equipment:');
    expect(p).not.toContain("Player's Last Action:");
    expect(p).not.toContain('Environment:');
  });

  it('⚠ ambient KEEPS the location anchor — the guard against invented places', () => {
    // The anchor exists because the model narrated "The Borderlands" while the
    // player stood in the Outskirts. Leaning the prompt must not cost that.
    const p = buildSystemPrompt(ctxOf(bigInvString, true))[0]!.content;
    expect(p).toContain('The Architect\'s Blind');
    // RETARGETED BY OTA-1128 — the sentence around this example was rewritten
    // when four duplicate copies of the no-invented-places rule collapsed into
    // one. The EXAMPLE is what this test is about (it is the actual playtest
    // failure), so it is anchored on the example alone now.
    expect(p).toContain('"Borderlands"');
    expect(p).toContain('You are the Arbiter');
    // …and it still carries the read of the player the beat reflects on.
    expect(p).toContain('STR5 DEX12');
  });

  it('ambient still ends on the ambient instruction, and still asks to continue', () => {
    const msgs = buildSystemPrompt(ctxOf(bigInvString, true));
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content).toContain('UNPROMPTED');
    expect(msgs[1]!.content).toBe('Continue.');
  });

  it('the scene-reaction prompt is UNCHANGED in shape — this OTA only trims', () => {
    const p = buildSystemPrompt(ctxOf(bigInvString, false))[0]!.content;
    expect(p).toContain('[SYSTEM FACTS - DO NOT INVENT EXITS, ENEMIES, OR PLACE NAMES]');
    expect(p).toContain('Exits:');
    expect(p).toContain('Entities Present:');
    expect(p).toContain('Inventory & Equipment:');
    expect(p).toContain("Player's Last Action:");
  });

  it('prompts stay deterministic — same context, same bytes', () => {
    const a = buildSystemPrompt(ctxOf(bigInvString, true))[0]!.content;
    const b = buildSystemPrompt(ctxOf(bigInvString, true))[0]!.content;
    expect(a).toBe(b);
  });
});
