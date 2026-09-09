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

/* ⚠ OTA-1766 — 'combat' is a harness STATE, not a `ScreenName`. The app must be
 * told 'exploration'; the fixture below is what makes that exploration a fight. */
const SCREEN = START === 'combat' ? 'exploration' : START;

/* ⚠ OTA-1759 — A FRESH CHARACTER HAS NOTHING TO MEND, so Crafting's REPAIR tab
 * (where the list rows this pass is about live) renders its empty state and
 * photographs nothing. Knocking the durability off the first two damageable
 * pieces is the smallest fixture that makes the rows exist. It edits the
 * character the game's OWN factory produced rather than hand-rolling one, so
 * the rows are shaped by real items. */
function damageSomeGear(p) {
  let hit = 0;
  for (const it of p.inventory ?? []) {
    if (hit >= 2) break;
    if (typeof it.durability !== 'object' || it.durability === null) continue;
    if (!(it.durability.max > 1)) continue;
    it.durability.current = Math.max(1, Math.floor(it.durability.max * (hit === 0 ? 0.3 : 0.7)));
    hit += 1;
  }
  return p;
}


/* ⚠⚠⚠ OTA-1766 — A FIGHT, SO THE WEAPON BUTTONS CAN BE PHOTOGRAPHED.
 *
 * Owner asked to see "a weapon with damage icons, a weapon with a coat, a weapon
 * with the discovery star". None of those exist on a fresh character standing in
 * an empty room: `inCombat` is `enemyViews.length > 0`, the glyph row only draws
 * when a weapon is equipped, and the star only draws when the player has
 * DISCOVERED a weakness the weapon delivers.
 *
 * ⚠ SO THE FIXTURE FEEDS THE REAL DERIVATIONS RATHER THAN FAKING THEIR OUTPUT.
 * It sets one scene enemy, equips two catalog weapons by NAME (so
 * `resolveDisplayWeaponByName` finds their real `damageType`), and coats them.
 * ExplorationScreen then computes `inCombat`, the label parts and the star
 * through exactly the code the phone runs — the same discipline as
 * `damageSomeGear` above, which knocks durability off items the real factory
 * produced rather than hand-rolling a repair row.
 *
 * ⚠⚠ THE STAR IS EARNED, NOT SET. The enemy is a BOSS, and `knownEnemyWeaknesses`
 * says a boss is always readable — its defenses are its character, not a secret.
 * Its `vulnerable:` traits name types the equipped weapons actually deliver, so
 * `weaponHitsKnownWeakness` returns true through its own arithmetic. Nothing
 * here writes `star: true`; if the discovery rules changed, this fixture would
 * stop showing a star, which is the point of feeding the real path.
 *
 * MAIN  Cudgel     bludgeoning, coated burn + cold  -> two coat marks, base mark, star
 * OFF   Stone Spear piercing, uncoated              -> base mark only
 */
function pickFight(p) {
  if (!p) return p;
  const weapon = (name, coats) => ({
    id: `harness_${name.replace(/\s+/g, '_').toLowerCase()}`,
    name, kind: 'weapon', rarity: 'Common', quantity: 1,
    ...(coats[0] ? { coating: { kind: coats[0], charges: 3 } } : {}),
    ...(coats[1] ? { coating2: { kind: coats[1], charges: 3 } } : {}),
  });
  const main = weapon('Cudgel', ['burn', 'cold']);
  const off = weapon('Stone Spear', []);
  p.inventory = [...(p.inventory ?? []), main, off];
  p.equipped = { ...(p.equipped ?? {}), main: main.name, mainId: main.id, off: off.name, offId: off.id };
  // Wisdom is irrelevant against a boss, but set it so the read is unambiguous.
  if (p.stats) p.stats.wisdom = 14;
  return p;
}

/** The scene the fight happens in. `enemies.length > 0` is what `inCombat` reads. */
const FIGHT_SCENE = {
  id: 'harness_fight',
  /* ⚠ EVERY REQUIRED FIELD OF `Enemy`, not just the ones the buttons read. The
   * first draft carried five and the screen threw "Cannot read properties of
   * undefined (reading '0')" — `loot` is a required ARRAY and something indexed
   * it. A fixture that satisfies the type is the cheap way not to re-learn that
   * per field. */
  enemies: [{
    id: 'harness_foe',
    name: 'Bog Dragon',
    type: 'beast',
    boss: true,
    hp: 40,
    maxHp: 60,
    rarity: 'Rare',
    attack: '1d20+4',
    damage: '2d8+3',
    abilityPoint: 'strength',
    loot: [],
    pos: { bearing: 0, distance: 2 },
    // ⚠ Named so the star is EARNED: the cudgel delivers bludgeoning, burn and
    // cold, and this foe is soft to two of them.
    traits: ['vulnerable:bludgeoning', 'vulnerable:burn', 'resist:piercing'],
  }],
};

const DATA = {
  currentScreen: SCREEN,
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
  player: START === 'title' ? null : (() => {
    const p = damageSomeGear(createCharacter({
      name: 'Cheddar Bob', raceId: 'mud_dweller', factionId: 'mud_monarchs',
    }));
    return START === 'combat' ? pickFight(p) : p;
  })(),
  /* ⚠ OTA-1766 — `--screen=combat` opens exploration WITH a fight on. The screen
   * name itself is not a `ScreenName`, so it is mapped to 'exploration' below;
   * the harness needed a way to ask for a STATE, not just a screen. */
  currentScene: START === 'combat' ? FIGHT_SCENE : null,
};

// Actions are awaited all over the shell, so an unknown one must be thenable.
const noop = () => Promise.resolve();

/* ⚠ An unknown key cannot default to `noop`: a function is TRUTHY, so every
 * noun-shaped field (pendingLacing, storyFork, deathReport ...) read as
 * "present" and the shell opened every modal it owns on top of the roster.
 * Verb-shaped names get the no-op; everything else is absent, which is what an
 * unset piece of state actually looks like.
 *
 * ⚠⚠ AND "ABSENT" IS `null`, NOT `undefined` — OTA-1759. The screens spell the
 * absent test BOTH ways, and `undefined !== null` is TRUE, so an unknown noun
 * still opened every modal guarded by `visible={x !== null}`. Crafting's
 * "Strip these for parts?" sat over the whole screen and made the list rows
 * unphotographable. `null` satisfies both spellings: falsy AND equal to null. */
const ACTIONish = /^(set|clear|dismiss|refresh|load|delete|resurrect|boot|shut|resume|hydrate|apply|start|stop|cancel|submit|toggle|mark|flush|open|close|begin|end|advance|choose|select|reset|save|add|remove|update|handle|request|accept|decline|confirm|retry|abort|on[A-Z])/;
const state = new Proxy(DATA, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    return ACTIONish.test(String(k)) ? noop : null;
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
