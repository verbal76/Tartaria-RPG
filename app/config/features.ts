// ⚠⚠ OTA-1382 — THE PRODUCT FLAGS. Step 3 of collapsing the four lines.
//
// THIS FILE IS THE ONLY PLACE THE FOUR PRODUCTS ARE ALLOWED TO DISAGREE ABOUT
// BEHAVIOUR. Everything else in `app/` is meant to be byte-identical across
// golem, HAL, steam and html; platform capability differences are handled by
// Metro's `.web` resolution and `Platform.OS`, not here.
//
// WHY IT EXISTS. Until now a product difference was expressed as a BRANCH
// difference, which meant git stored two completely different kinds of thing in
// the same medium: differences somebody chose, and drift nobody chose. Nothing
// could tell them apart — so every port had to re-derive by hand which was
// which, and drift accumulated silently because "the branches differ" is the
// normal state of affairs. The DIVERGENCE.md census measured the result: 1,053
// differing paths between golem and HAL, of which 14 were real code and THREE
// were unintended (a save migration missing on two lines, a duplicated line, a
// missing clipboard fallback). OTA-1381 closed those three.
//
// With the intentional differences named here instead, a diff between two
// product lines contains ONLY drift — so drift stops being invisible and starts
// being a bug you can see.
//
// ⚠ HOW TO ADD ONE. A flag earns its place only when the SAME code must behave
// differently for a PRODUCT reason. If the difference is "this platform cannot
// do that", it is not a flag — use `Platform.OS` or a `.web` file, both of which
// this codebase already uses (GamepadNav, kokoroWeb, splashArt). If the
// difference is "this line has not been ported yet", it is not a flag either;
// it is a port that has not happened.
//
// ⚠ AND KEEP THE SET SMALL. The whole value is that the four lines differ by one
// readable file. A flag per disagreement, added casually, rebuilds the problem
// with extra steps — each one doubles the behaviour matrix the tests must cover.

/** How the fallen exchange (cross-house sharing of dead characters) is offered.
 *
 *  `'open'`   — the EXCHANGE panel is visible to every character.
 *  `'gated'`  — visible only to characters whose name is on
 *               `SHARING_UNLOCK_NAMES` (see `engine/fallenLedger`).
 *
 *  ⚠ VISIBILITY ONLY, on every line. The engine underneath — the revenant pool
 *  join, the rest records, the gear faucet, the scaling spawn rate — runs the
 *  same code for every character on every product, because a locked character
 *  can never pair, so never imports, so their ledger is empty and every consumer
 *  of it already handles empty. Gating the engine as well would create a second
 *  divergent path that only two names ever execute. One switch, one thing
 *  switched. */
export type FallenSharingMode = 'open' | 'gated';

export interface ProductFeatures {
  fallenSharing: FallenSharingMode;
}

/** ⚠⚠ THE ONE LINE THAT DIFFERS PER PRODUCT.
 *
 *  golem / steam / html — `'open'`
 *  HAL                  — `'gated'`
 *
 *  HAL is the live channel: the build other people are actually playing, and the
 *  shared roll has never been tested with two real houses. Owner: *"port the
 *  feature to Hal, but make it only visible if the characters name is Verbal or
 *  Sasmooch."* Promoting it later is this constant, not a port. */
/** ⚠⚠ OTA-1384 — THE FLAG NOW COMES FROM THE BUILD, NOT FROM THE BRANCH.
 *
 *  `app.config.js` puts the product's mode into `expo.extra.fallenSharing`,
 *  selected by the `TARTARIA_LINE` env var. That is the only channel a
 *  build-time value has into a running React Native app, and `crashReportDsn`
 *  already uses it, so the pattern is proven in-tree.
 *
 *  ⚠ IT FALLS BACK TO `'open'`, DELIBERATELY, and the direction matters. If the
 *  config fails to load, the app degrades to the ORDINARY product — the one
 *  three of the four lines ship — rather than to a mystery state where a panel
 *  is missing and nobody can say why. The gated build is the exception, and an
 *  exception should have to be asserted, never assumed.
 *
 *  ⚠ Read ONCE at module load. `expoConfig` is populated before any React tree
 *  renders, and a flag that could change mid-session is not a product flag. */
function readMode(): FallenSharingMode {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as { expoConfig?: { extra?: Record<string, unknown> } };
    const v = Constants?.expoConfig?.extra?.fallenSharing;
    return v === 'gated' ? 'gated' : 'open';
  } catch {
    return 'open';
  }
}

export const FEATURES: ProductFeatures = {
  fallenSharing: readMode(),
};

/** Which product this build is, for diagnostics. `'unknown'` on a config that
 *  did not load — never a guess at a real line's name. */
export function productLine(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as { expoConfig?: { extra?: Record<string, unknown> } };
    const v = Constants?.expoConfig?.extra?.tartariaLine;
    return typeof v === 'string' && v ? v : 'unknown';
  } catch {
    return 'unknown';
  }
}
