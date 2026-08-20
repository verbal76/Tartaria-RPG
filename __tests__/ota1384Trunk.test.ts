/**
 * OTA-1384 — one trunk, four products.
 *
 * Owner, on why this has to be provable rather than plausible: *"make sure
 * everything is thoroughly tested so we don't break anything cuz in my head
 * collapsing all the branches means we won't break one. we break all of them."*
 *
 * That is exactly the trade. Four branches meant a mistake reached one product
 * and the other three kept working; one trunk means a mistake reaches all four
 * at once. The compensation has to be that "which product am I" is checkable
 * from outside the code, and that the identities cannot collide.
 *
 * `scripts/verify-lines.mjs` does the live half — it renders all four configs
 * through Expo's own resolver, checks every identity is distinct, and checks an
 * unknown line name FAILS the build. This suite locks the structure that makes
 * that possible, and the two decisions most likely to be "tidied" later:
 * the fallback DIRECTION, and the asset that must stay outside the embed glob.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { FEATURES, productLine } from '../app/config/features';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');
const cfg = src('app.config.js');
const app = src('App.tsx');
const pkg = JSON.parse(src('package.json')) as {
  dependencies: Record<string, string>; scripts: Record<string, string>;
};

describe('OTA-1384 — the four products live in one config', () => {
  it('⚠⚠ all four lines are declared, with the four fields that differ', () => {
    for (const line of ['golem', 'hal', 'steam', 'html']) {
      expect(cfg).toContain(`  ${line}: {`);
    }
    for (const f of ['name:', 'channel:', 'id:', 'fallenSharing:']) {
      expect(cfg.match(new RegExp(f, 'g'))?.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('⚠⚠ an UNKNOWN line throws instead of falling back', () => {
    // The failure mode of guessing is publishing one product's binary to
    // another product's channel. `TARTARIA_LINE=hal2001` is a plausible typo for
    // `hal`; it must stop the build, not pick something.
    expect(cfg).toContain('is not a product line');
    expect(cfg).toContain('Refusing to guess');
    expect(cfg).toContain('throw new Error(');
  });

  it('⚠ an UNSET line builds golem — the dev line, never someone else\'s product', () => {
    expect(cfg).toContain("process.env.TARTARIA_LINE || 'golem'");
  });

  it('⚠ the shared keys are inherited, not duplicated', () => {
    // app.json stays the single home for the ~60 keys that are the same on all
    // four. If this file ever starts restating them, they can drift from it.
    expect(cfg).toContain("const base = require('./app.json');");
    expect(cfg).toContain('...base.expo');
  });
});

describe('OTA-1384 — the flag reaches the running app', () => {
  it('⚠⚠ features.ts reads the mode the BUILD injected', () => {
    const f = src('app', 'config', 'features.ts');
    expect(f).toContain("Constants?.expoConfig?.extra?.fallenSharing");
    expect(cfg).toContain('fallenSharing: line.fallenSharing');
    expect(cfg).toContain('tartariaLine: requested');
  });

  it('⚠⚠ …and falls back to OPEN, which is the safe direction', () => {
    // If the config fails to load, the app degrades to the ORDINARY product —
    // the one three of four lines ship — not to a mystery state where a panel is
    // missing and nobody can say why. The gated build is the exception, and an
    // exception must be asserted, never assumed.
    const f = src('app', 'config', 'features.ts');
    expect(f).toContain("return v === 'gated' ? 'gated' : 'open';");
    expect(f).toContain("return 'open';"); // the catch branch
  });

  it('under jest there is no expo config, so the fallback is what we observe', () => {
    expect(['open', 'gated']).toContain(FEATURES.fallenSharing);
    expect(FEATURES.fallenSharing).toBe('open');
    expect(typeof productLine()).toBe('string');
  });
});

describe('OTA-1384 — the trunk carries every product\'s needs', () => {
  it('⚠ the web deps ride along, so the PC lines can build from this tree', () => {
    // They were on steam/html only, which is a divergence the SOURCE census
    // could never see — it only read app/. Nothing in the native require graph
    // imports them, so a phone build does not bundle them; the cost is install
    // size and CI time, not app size.
    for (const d of ['react-dom', 'react-native-web', '@expo/metro-runtime']) {
      expect(pkg.dependencies[d]).toBeTruthy();
    }
    expect(pkg.scripts['export:web']).toBe('expo export --platform web');
  });

  it('⚠⚠ the 2.4MB PC splash lives OUTSIDE assets/, and that is load-bearing', () => {
    // app.json sets assetBundlePatterns: ["assets/**/*"], which EMBEDS every
    // file under assets/ into the native binary whether or not code requires it.
    // Under one trunk the phone products carry this repo too, so a PC asset in
    // assets/ would add 2.4MB to their download for art they can never display —
    // on the device whose signature crash was an out-of-memory kill.
    expect(existsSync(path('assets-pc', 'splash-art-pc.png'))).toBe(true);
    expect(existsSync(path('assets', 'splash-art-pc.png'))).toBe(false);
    expect(src('app', 'ui', 'splashArt.web.ts')).toContain("require('../../assets-pc/splash-art-pc.png')");
    // and the glob still only covers assets/
    expect(JSON.parse(src('app.json')).expo.assetBundlePatterns).toEqual(['assets/**/*']);
  });

  it('⚠ the phone half never references the PC asset', () => {
    expect(src('app', 'ui', 'splashArt.ts')).not.toContain('assets-pc');
    expect(src('app', 'ui', 'splashArt.ts')).toContain("require('../../assets/splash-art.jpg')");
  });
});

describe('OTA-1384 — App.tsx is now the same file on every product', () => {
  it('⚠⚠ the parchment + vignette are behind a platform check, not a branch', () => {
    expect(app).toContain("{Platform.OS !== 'web' && (");
    expect(app).toContain("require('./assets/textures/parchment.png')");
    expect(app).toContain("require('./assets/textures/vignette.png')");
  });

  it('⚠ …and it is behaviour-neutral on a phone, which is why it can be shared', () => {
    // `Platform.OS !== 'web'` is always true on iOS/Android, so wrapping the
    // phone lines' art changed nothing they render. The wrapper exists so the
    // file stops differing, not to change what anyone sees.
    const i = app.indexOf("{Platform.OS !== 'web' && (");
    expect(app.slice(Math.max(0, i - 700), i)).toContain('behaviour-neutral');
  });
});

describe('OTA-1384 — the proof is a script, not a claim', () => {
  it('⚠⚠ verify-lines checks identities are DISTINCT, not merely present', () => {
    // The worst outcome here is two products sharing a channel — an OTA meant
    // for one reaching another's players. Presence checks would not catch it.
    const v = src('scripts', 'verify-lines.mjs');
    expect(v).toContain('COLLISION');
    expect(v).toContain("for (const k of ['name', 'channel', 'id'])");
    expect(v).toContain('process.exit(1)');
  });

  it('⚠ it renders through EXPO\'S resolver, not by re-reading the file', () => {
    // Re-reading app.config.js would only prove the file parses. Going through
    // `expo config` proves the thing the build will actually see.
    const v = src('scripts', 'verify-lines.mjs');
    expect(v).toContain("'expo', 'config', '--type', 'public', '--json'");
    expect(v).toContain('TARTARIA_LINE: line');
  });

  it('⚠⚠ and it states plainly what it does NOT prove', () => {
    // A green config check is not a shipped build. Saying so in the output is
    // the difference between a useful gate and a false all-clear.
    const v = src('scripts', 'verify-lines.mjs');
    expect(v).toContain('does not run EAS');
  });
});
