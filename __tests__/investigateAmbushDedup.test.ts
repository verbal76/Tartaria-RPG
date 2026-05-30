// OTA-228 — investigate on an already-cleared noun must short-
// circuit to "already checked" instead of rolling the OTA-219
// sporadic combat ambush.
//
// Repro from the 2026-05-30 playtest log:
//   Run 1: investigate titan's bone marker → lead surfaces, noun
//          marked in flavorExhaustedNouns
//   Run 2: investigate titan's bone marker → AMBUSH spawned a Mud
//          Wasp (no "already checked" line, OTA-219 ambush fired
//          BEFORE the OTA-096 dedup check)
//   Run 3: investigate titan's bone marker → "already checked"
//          (post-skill-check dedup catches it)
//
// The fix mirrors the OTA-096 dedup at the top of the action
// handler, before the OTA-219 ambush roll. This is a pure-logic
// assertion that mirrors the engine condition in isolation — the
// real path lives in gameStore.ts case 'investigate'.

type Room = { flavorExhaustedNouns?: string[] };

function shouldAmbushOrRollSkillCheck(
  target: string,
  room: Room | undefined,
): { skip: true; reason: 'already_cleared' } | { skip: false } {
  const lowered = target.trim().toLowerCase();
  if (!lowered) return { skip: false };
  const prior = room?.flavorExhaustedNouns ?? [];
  const cleared = prior.some(
    (n) => n === lowered || lowered.includes(n) || n.includes(lowered),
  );
  if (cleared) return { skip: true, reason: 'already_cleared' };
  return { skip: false };
}

describe('OTA-228 — investigate ambush gated behind already-cleared dedup', () => {
  it('first investigate (room empty) does NOT short-circuit', () => {
    const result = shouldAmbushOrRollSkillCheck("titan's bone marker", undefined);
    expect(result.skip).toBe(false);
  });

  it('investigate a noun in flavorExhaustedNouns DOES short-circuit', () => {
    const room: Room = { flavorExhaustedNouns: ["titan's bone marker"] };
    const result = shouldAmbushOrRollSkillCheck("titan's bone marker", room);
    expect(result.skip).toBe(true);
    if (result.skip) expect(result.reason).toBe('already_cleared');
  });

  it('apostrophe + stripped variants both stored (OTA-098 pattern) match either query form', () => {
    // OTA-098 writes BOTH variants to flavorExhaustedNouns on first
    // examination specifically so apostrophe-bearing and stripped
    // queries both find a match. That's what the dedup relies on —
    // not cross-variant substring magic.
    const bothStored: Room = {
      flavorExhaustedNouns: ["titan's bone marker", 'titans bone marker'],
    };
    expect(shouldAmbushOrRollSkillCheck("titan's bone marker", bothStored).skip).toBe(true);
    expect(shouldAmbushOrRollSkillCheck('titans bone marker', bothStored).skip).toBe(true);
  });

  it('a different noun in the same room does NOT short-circuit', () => {
    const room: Room = { flavorExhaustedNouns: ["titan's bone marker"] };
    expect(shouldAmbushOrRollSkillCheck('mud cairn', room).skip).toBe(false);
  });

  it('empty target does NOT short-circuit (no noun to dedup)', () => {
    const room: Room = { flavorExhaustedNouns: ["titan's bone marker"] };
    expect(shouldAmbushOrRollSkillCheck('', room).skip).toBe(false);
    expect(shouldAmbushOrRollSkillCheck('   ', room).skip).toBe(false);
  });

  it('case-insensitive match', () => {
    const room: Room = { flavorExhaustedNouns: ["titan's bone marker"] };
    expect(shouldAmbushOrRollSkillCheck("TITAN'S BONE MARKER", room).skip).toBe(true);
    expect(shouldAmbushOrRollSkillCheck("Titan's Bone Marker", room).skip).toBe(true);
  });
});
