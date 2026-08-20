/**
 * OTA-1370 — Step 3: the intentional differences become ONE config file.
 *
 * Steps 1 and 2 established that the four product lines are ~98% identical and
 * closed the three real drifts. What was left was a small set of differences
 * somebody genuinely chose — and they were still stored as BRANCH differences,
 * i.e. in the same medium as drift, which is what made drift invisible.
 *
 * Step 3 moves them out of git and into the code:
 *   • one PRODUCT flag  — `FEATURES.fallenSharing` ('open' | 'gated')
 *   • platform capability — `Platform.OS` and Metro's `.web` resolution
 *   • one migration      — universalised rather than flagged, because it
 *                          self-gates and a flag would be a second path only
 *                          one product ever runs
 *
 * ⚠⚠ THIS SUITE IS IDENTICAL ON ALL FOUR LINES EXCEPT ONE ASSERTION — the
 * expected value of `fallenSharing`, which is read from the config rather than
 * hard-coded, so the file really is the same everywhere. That is the point: if
 * a fifth difference is ever smuggled in as a branch difference instead of a
 * flag, the census (scripts/divergence.py) sees it and this suite explains why
 * that is not allowed.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { FEATURES, type ProductFeatures } from '../app/config/features';
import { sharingUnlockedFor } from '../app/engine/fallenLedger';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');
const codex = src('app', 'components', 'LoreCodexBody.tsx');
const splash = src('app', 'components', 'SplashOverlay.tsx');
const tts = src('app', 'voice', 'TTSManager.ts');
const app = src('App.tsx');
const store = src('app', 'state', 'gameStore.ts');

describe('OTA-1370 — the product flag', () => {
  it('⚠⚠ the flag set is SMALL — one product difference, not a bag of them', () => {
    // The whole value is that the four lines differ by one readable file. A flag
    // per disagreement rebuilds the problem with extra steps, and each one
    // doubles the behaviour matrix the tests have to cover.
    expect(Object.keys(FEATURES as ProductFeatures).sort()).toEqual(['fallenSharing']);
  });

  it('carries a valid mode', () => {
    expect(['open', 'gated']).toContain(FEATURES.fallenSharing);
  });

  it('⚠⚠ the exchange gate is ONE expression, shared by all four lines', () => {
    // Before this, HAL carried a hand-ported gate and the other three carried
    // none — the same decision expressed as a branch difference, which is
    // exactly what made it indistinguishable from drift.
    expect(codex).toContain(
      "FEATURES.fallenSharing === 'open' || sharingUnlockedFor(player?.name)");
    expect(codex).toContain('{exchangeUnlocked && (');
  });

  it('⚠ the name check only runs on a gated build (short-circuit), and reads the CHARACTER name', () => {
    // `'open' ||` short-circuits, so an open product never calls it. And the
    // house name is typed INTO the gated panel, so gating on that would be a
    // lock whose key is behind itself.
    expect(codex).toContain("=== 'open' ||");
    expect(codex).not.toContain('sharingUnlockedFor(house');
  });

  it('⚠ the matcher itself ships everywhere, so the shared code compiles everywhere', () => {
    expect(typeof sharingUnlockedFor).toBe('function');
    expect(sharingUnlockedFor('Verbal')).toBe(true);
    expect(sharingUnlockedFor('')).toBe(false);
  });

  it('⚠⚠ the ENGINE is still ungated on every product', () => {
    // Visibility only. A locked character never pairs, so never imports, so
    // their ledger is empty and every consumer already handles empty. Gating the
    // engine would be a second divergent path only two names ever execute.
    expect(store).toContain('rev.revenantPool()');
    expect(store).not.toContain('FEATURES.fallenSharing');
  });
});

describe('OTA-1370 — platform capability is NOT a flag', () => {
  it('⚠⚠ the gamepad stub pair exists, so App.tsx is identical on all four', () => {
    expect(existsSync(path('app', 'components', 'GamepadNav.tsx'))).toBe(true);
    expect(existsSync(path('app', 'components', 'GamepadNav.web.tsx'))).toBe(true);
    // the native half renders nothing — mounting it on a phone costs nothing
    expect(src('app', 'components', 'GamepadNav.tsx')).toContain('return null;');
    expect(app).toContain('<GamepadNav />');
  });

  it('⚠ the web-speech stub pair exists, so TTSManager is identical too', () => {
    expect(existsSync(path('app', 'voice', 'kokoroWeb.ts'))).toBe(true);
    expect(existsSync(path('app', 'voice', 'kokoroWeb.web.ts'))).toBe(true);
    expect(src('app', 'voice', 'kokoroWeb.ts')).toContain('no-op on native');
    expect(tts).toContain("if (Platform.OS === 'web') {");
    expect(tts).toContain('kokoroSpeakWeb(trimmed, voiceId);');
  });

  it('⚠⚠ the splash art is a MODULE PAIR, not a Platform.OS ternary — and that is load-bearing', () => {
    // Metro resolves `require()` STATICALLY, so both branches of
    // `isWeb ? require(pc) : require(phone)` enter the bundle graph. With
    // Expo's assetBundlePatterns set to "assets/**/*", that would ship the
    // 2.4MB PC key art to the phone build — art it can never display, on the
    // device whose signature crash was an out-of-memory kill.
    expect(splash).toContain("import { SPLASH_SOURCE, splashImageStyle } from '../ui/splashArt';");
    expect(splash).toContain('source={SPLASH_SOURCE}');
    expect(splash).toContain('style={splashImageStyle(imgW, imgH)}');
    // no require of either asset survives in the component
    expect(splash).not.toContain("require('../../assets/splash-art");
    expect(splash).not.toContain("Platform.OS === 'web'");
  });

  it('⚠⚠ the PC asset and its module travel together — never one without the other', () => {
    // splashArt.web.ts requires splash-art-pc.png. A line carrying the module
    // without the asset would break its web bundle; a line carrying the asset
    // without the module would ship 2.4MB for nothing. Both or neither.
    const hasModule = existsSync(path('app', 'ui', 'splashArt.web.ts'));
    const hasAsset = existsSync(path('assets', 'splash-art-pc.png'));
    expect(hasModule).toBe(hasAsset);
    // the phone half is unconditional
    expect(existsSync(path('app', 'ui', 'splashArt.ts'))).toBe(true);
  });
});

describe('OTA-1370 — the migration that was universalised rather than flagged', () => {
  it('⚠⚠ the enemy-intel backfill now runs on every line', () => {
    // Was HAL-only. The recorded reason was sound at the time — HAL is the line
    // with pre-OTA-838 tester saves — but IMPORT SAVE accepts an export "from
    // this or another install", so such a save can walk onto any line, and on
    // the lines without the backfill it stays blank forever.
    expect(store).toContain('export function backfillEnemyIntelFromDefeats(');
    expect(store).toContain('enemyIntel: wm.enemyIntel ?? backfillEnemyIntelFromDefeats(wm.defeatedEnemies),');
  });

  it('⚠ it self-gates, which is WHY it needed no flag', () => {
    // `??` means it fires only when a save carries no intel at all, and the
    // function returns early before requiring anything when there are no
    // defeats. On a line with no legacy saves it costs one nullish check.
    expect(store).toContain('enemyIntel: wm.enemyIntel ??');
    const i = store.indexOf('export function backfillEnemyIntelFromDefeats(');
    const head = store.slice(i, i + 400);
    expect(head).toContain('if (!defeatedNames || defeatedNames.length === 0) return out;');
    // the early return precedes the requires, so a fresh save loads nothing
    expect(head.indexOf('return out;')).toBeLessThan(head.indexOf('require('));
  });
});

describe('OTA-1370 — the rule for future differences', () => {
  it('⚠ features.ts states when a flag is and is not the answer', () => {
    // The failure mode this guards against is a flag added casually for
    // something that is really a platform capability or an unfinished port.
    const f = src('app', 'config', 'features.ts');
    expect(f).toContain('HOW TO ADD ONE');
    expect(f).toContain('AND KEEP THE SET SMALL');
    expect(f).toContain('it is a port that has not happened');
  });

  it('⚠ and the census can still see anything that dodges it', () => {
    expect(existsSync(path('scripts', 'divergence.py'))).toBe(true);
    expect(existsSync(path('DIVERGENCE.md'))).toBe(true);
  });
});
