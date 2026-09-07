// ⚠ OTA-1738 — THE STAMINA TABLE, OUT OF THE STORE. It has lived in gameStore
// since the first stamina pass and every consumer imported it from there; the
// tutorial's door beat now quotes the per-step cost (owner: "one concise
// movement-cost sentence"), and tutorialSteps cannot import gameStore without
// closing a cycle (gameStore imports tutorialSteps). One table, re-exported by
// the store so every existing reader keeps its import.
export const STAMINA_COSTS = {
  travel: 2,
  wander: 1,
  attack: 1,
  skillCheck: 1,
} as const;
