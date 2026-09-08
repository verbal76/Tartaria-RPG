/* HARNESS ONLY — never bundled unless TARTARIA_WEB_HARNESS=1.
 *
 * Substitutes app/state/gameStore so the REAL App shell and the REAL
 * TitleScreen can be rendered in a browser and photographed. The web line
 * currently cannot boot the real store (a module-init cycle throws
 * "Cannot access 'FRESH_ENEMY_ARRAYS' before initialization"); that is a
 * separate defect, deliberately not fixed inside a geometry pass.
 *
 * The store has NO bearing on card geometry — the cards are sized by the real
 * stylesheet and the real layout engine. This only supplies the roster rows
 * and keeps the shell out of its boot states.
 */
/* ⚠⚠ A REAL PLAYER, FROM THE GAME'S OWN FACTORY. The screens beyond the roster
 * read deeply into `player` — ContractsScreen wants `memorableEvents`, the sheet
 * wants a full stat breakdown — and a hand-rolled fixture would be a second
 * source of truth about what a character IS. `engine/character.createCharacter`
 * is a pure module with no store dependency, so the harness uses it and gets
 * whatever the game currently considers a fresh character.
 * ⚠ It is only built when a non-title screen is being photographed; the roster
 * needs no player and paying for one would slow every run. */
// eslint-disable-next-line no-undef, @typescript-eslint/no-require-imports
const { createCharacter } = require('../app/engine/character');

const now = Date.now();

// The owner's calibration fixtures. Factions chosen to span BOTH extremes of
// the measured focus table and of the source aspect ratios:
//   tartarian_revivalists focusY 0.397, aspect 1.200  (highest-sitting, tallest)
//   mud_monarchs          focusY 0.446, aspect 1.000  (squarest)
//   stone_builders        focusY 0.494, aspect 1.200  (most centred, tallest)
const SLOTS = [
  {
    slotId: 'fixture_johnny', playerName: 'Johnny Blaze',
    factionId: 'tartarian_revivalists', raceId: 'tartarian_giant',
    locationId: 'great_tartary_plains', hp: 78, hpMax: 96,
    mainQuestPhase: 'cores', mainQuestCoresRecovered: 2,
  },
  {
    slotId: 'fixture_cheddar', playerName: 'Cheddar Bob',
    factionId: 'mud_monarchs', raceId: 'mud_dweller',
    locationId: 'asgardar', hp: 41, hpMax: 62,
    mainQuestPhase: 'revelation',
  },
  {
    slotId: 'fixture_scott', playerName: 'Great Scott',
    factionId: 'stone_builders', raceId: 'architectural_sentinel',
    locationId: 'grand_spire_of_etheria', hp: 120, hpMax: 120,
    mainQuestPhase: 'descent',
  },
  // Worst case for vertical cover: the TALLEST expanded card the screen can
  // make (dead + dog + golem + crash warning + the dead-row buttons) at the
  // NARROWEST width, where the emblem is smallest.
  {
    slotId: 'fixture_tall', playerName: 'Tall Case',
    factionId: 'forgotten_order', raceId: 'mud_dweller',
    locationId: 'asgardar', hp: 0, hpMax: 70, dead: true,
    mainQuestPhase: 'nexus', dogName: 'Rat', dogBreed: 'mud hound',
    golemName: 'Clay', golemKind: 'stone golem',
  },
].map((s, i) => ({
  ...s,
  characterSeed: `${s.playerName}|${s.raceId}|${s.factionId}|${now - i * 864e5}`,
  savedAt: now - i * 25e5,
  createdAt: now - i * 864e5 * 9,
}));

/* ⚠ WHICH SCREEN TO PHOTOGRAPH. The harness could only ever see the title
 * screen, which made it useless for the rest of the rollout. `harness.screen` in
 * localStorage is seeded by scripts/render-roster.mjs before the app boots, so
 * any screen can be opened without touching shipped code. */
const START = (() => {
  try { return globalThis.localStorage?.getItem('harness.screen') || 'title'; }
  catch { return 'title'; }
})();

const DATA = {
  currentScreen: START,
  hydrated: true,
  otaBootResolved: true,
  slots: SLOTS,
  crashedSlotIds: ['fixture_tall'],
  gameLog: [],
  resurrectionGems: 0,
  slotLoadError: null,
  justUpdatedFromBuild: false,
  pendingOTAUpdate: false,
  summonRefusal: null,
  qwenStatus: 'ready',
  qwenFraction: 1,
  cognitiveStatus: 'ready',
  /* ⚠ Noun-shaped store slices the screens read INTO. The Proxy below returns
   * `undefined` for unknown nouns, which is right for "absent" but wrong for a
   * container the screen immediately indexes — `s.worldMemory.memorableEvents`
   * throws on undefined rather than degrading. Empty containers, not fixtures. */
  worldMemory: { memorableEvents: [] },
  arbiterMemory: {},
  vendorState: {},
  player: START === 'title' ? null : createCharacter({
    name: 'Cheddar Bob', raceId: 'mud_dweller', factionId: 'mud_monarchs',
  }),
  currentScene: null,
};

// Actions are awaited all over the shell, so an unknown one must be thenable.
const noop = () => Promise.resolve();

/* ⚠ An unknown key cannot default to `noop`: a function is TRUTHY, so every
 * noun-shaped field (pendingLacing, storyFork, deathReport ...) read as
 * "present" and the shell opened every modal it owns on top of the roster.
 * Verb-shaped names get the no-op; everything else is absent, which is what an
 * unset piece of state actually looks like. */
const ACTIONish = /^(set|clear|dismiss|refresh|load|delete|resurrect|boot|shut|resume|hydrate|apply|start|stop|cancel|submit|toggle|mark|flush|open|close|begin|end|advance|choose|select|reset|save|add|remove|update|handle|request|accept|decline|confirm|retry|abort|on[A-Z])/;
const state = new Proxy(DATA, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    return ACTIONish.test(String(k)) ? noop : undefined;
  },
  has: () => true,
});

function useGameStore(selector) {
  return selector ? selector(state) : state;
}
useGameStore.getState = () => state;
useGameStore.setState = noop;
useGameStore.subscribe = () => noop;
useGameStore.destroy = noop;

// eslint-disable-next-line no-undef
module.exports = new Proxy(
  { useGameStore, default: useGameStore },
  { get: (t, k) => (k in t ? t[k] : noop), has: () => true },
);
