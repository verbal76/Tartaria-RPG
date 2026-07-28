// OTA-839 — lore-accuracy pass. The game drifted from its lore docs; this batch
// corrected the codex text (races.json traits + concepts.json combat/stat entries)
// so what the player reads matches what the engine does. These are DATA guards that
// lock the corrections in: the stale phrases must stay gone, and the corrected facts
// must stay present. (When lore and game disagree, the game wins.)

import racesData from '../app/data/races/races.json';
import conceptsData from '../app/data/lore/concepts.json';

const racesText = JSON.stringify(racesData);
const concepts = (conceptsData as { concepts: Array<{ id: string; title: string; answer: string }> }).concepts;
const conceptById = (id: string) => concepts.find((c) => c.id === id);
const conceptsText = JSON.stringify(conceptsData);

describe('OTA-839 races.json — trait text matches current mechanics', () => {
  it('no trait references the REMOVED hunger/forage survival system', () => {
    // "hunger", "forage", "famine-struck" survival language is gone (hunger was removed game-wide).
    expect(racesText).not.toMatch(/hunger|forage|famine-struck/i);
  });
  it('the Mud Golem trait states its aetheric VULNERABILITY (no longer "half from non-Aetheric")', () => {
    expect(racesText).not.toContain('half damage from non-Aetheric attacks');
    // The corrected text names the +50% aetheric weakness + the quarter reduction.
    expect(racesText).toMatch(/Aether is your undoing|half again as much/);
  });
  it('the Mud Dweller trait no longer claims a non-existent "Mud-power" damage type', () => {
    expect(racesText).not.toContain('Mud-power');
  });
  it('Elemental Control reads as the two once-per-day abilities (strike + ward)', () => {
    expect(racesText).not.toContain('one of each per encounter');
    expect(racesText).toMatch(/soaks the next 1d6/);
  });
});

describe('OTA-839 concepts.json — combat/stat entries match the engine', () => {
  it('skill_check + stealth-based actions use STEALTH, not DEX', () => {
    expect(conceptById('skill_check')!.answer).toContain('Stealth uses STEALTH');
    expect(conceptById('hide_action')!.answer).toContain('Roll STEALTH');
    expect(conceptById('stealing')!.answer).toContain('d20 + STEALTH');
  });
  it('stealing no longer claims a fixed DC 12', () => {
    expect(conceptById('stealing')!.answer).not.toContain('DC 12');
  });
  it('dodge entries describe the AC-bypass gamble, not the retired advantage/opposed-check model', () => {
    const da = conceptById('dodge_action')!.answer;
    const dm = conceptById('dodge_melee')!.answer;
    expect(da).not.toMatch(/Advantage on DEX saving throws/);
    expect(dm).not.toMatch(/opposed dodge skill check|skill check draw/);
    // both now describe the contested d20 + DEX gamble
    expect(da).toMatch(/contested|d20 \+ DEX/);
    expect(dm).toMatch(/contested|d20 \+ DEX/);
  });
  it('cold is now a documented damage type (it was live but missing from the codex)', () => {
    const cold = conceptById('cold');
    expect(cold).toBeDefined();
    expect(cold!.answer).toMatch(/chill/i);
  });
  it('no concept describes the removed hunger survival mechanic', () => {
    // Guard the player-facing bank against re-introducing a hunger meter / starvation.
    expect(conceptsText).not.toMatch(/hunger meter|starv(e|ation)|well[- ]fed/i);
  });
});
