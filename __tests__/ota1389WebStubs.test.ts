/**
 * OTA-1389 — the web bundle can be built at all.
 *
 * The first web build ever run in CI (OTA-1386 added the workflow; this is what
 * it found) died here:
 *
 *   Unable to resolve module ../../package.json from
 *   node_modules/react-native-executorch/lib/module/constants/resourceFetcher.js
 *
 * `react-native-executorch`, `llama.rn`, `onnxruntime-react-native` and
 * `expo-speech-recognition` are native-ONLY. They have no browser build, and
 * Metro's web resolver walks straight into them. `metro.config.js` on html_dev
 * and steam_Dev carried a web-only swap to a no-op stub; the trunk inherited
 * golem's copy, which never needed one because a phone bundle never resolves for
 * web.
 *
 * ⚠⚠ THIS IS THE THIRD FILE OF THE SAME KIND. `scripts/divergence.py` measured
 * `app/` only, so package.json (OTA-1384), `.github/workflows/` + `desktop/`
 * (OTA-1387) and now metro.config.js were all outside the census. Every one of
 * them was found by trying to build something, not by reading a report.
 *
 * ⚠⚠ THE PLATFORM GUARD IS THE WHOLE SAFETY ARGUMENT. `platform === 'web'` is
 * never true on an Android or iOS bundle, so the swap cannot reach the phone
 * products — which is what makes it safe to carry on a shared trunk. Drop the
 * guard and the phone builds lose their AI and voice engines and still compile.
 * The behavioural assertions below exist for that sentence.
 *
 * ⚠ WHY THIS SPAWNS NODE. `metro.config.js` requires `expo/metro-config`, whose
 * transitive requires reach deep metro internals that jest's resolver cannot
 * follow. The choice was between testing a copy of the logic and testing THE
 * FILE THE BUNDLER ACTUALLY LOADS; a copy would have passed happily while the
 * real config was broken, which is exactly the failure being fixed here.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

/** The four packages with no browser build. */
const NATIVE_ONLY = [
  'llama.rn',
  'onnxruntime-react-native',
  'react-native-executorch',
  'expo-speech-recognition',
];

type Probe = { name: string; platform: string | null; filePath: string; delegated: boolean };

/**
 * Load the REAL metro.config.js in a node process and ask its resolver what it
 * does with each (module, platform) pair.
 */
function probeResolver(): Probe[] {
  const script = `
    const cfg = require(${JSON.stringify(path('metro.config.js'))});
    const names = ${JSON.stringify([...NATIVE_ONLY, 'react'])};
    const out = [];
    for (const platform of ['web', 'android', 'ios', null]) {
      for (const name of names) {
        let delegated = false;
        const ctx = { resolveRequest: (_c, n) => { delegated = true; return { type: 'sourceFile', filePath: 'REAL:' + n }; } };
        const r = cfg.resolver.resolveRequest(ctx, name, platform);
        out.push({ name, platform, filePath: r && r.filePath, delegated });
      }
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const raw = execFileSync(process.execPath, ['-e', script], {
    cwd: path(),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(raw) as Probe[];
}

let probes: Probe[];
beforeAll(() => { probes = probeResolver(); }, 60_000);

const find = (name: string, platform: string | null) =>
  probes.find((p) => p.name === name && p.platform === platform)!;

describe('OTA-1389 — the stub exists and is wired', () => {
  it('⚠⚠ web-stubs/native-noop.js is on the trunk', () => {
    expect(existsSync(path('web-stubs', 'native-noop.js'))).toBe(true);
  });

  it('⚠ metro.config.js names all four native-only packages', () => {
    const m = src('metro.config.js');
    for (const n of NATIVE_ONLY) expect(m).toContain(`'${n}'`);
    expect(m).toContain("platform === 'web' && WEB_NATIVE_STUBS.has(moduleName)");
  });

  it('⚠ …and records that this file was outside the census', () => {
    // The comment is the only thing that stops the next reader assuming the
    // trunk's config was always complete.
    expect(src('metro.config.js')).toContain('ANOTHER CASUALTY OF THE COLLAPSE');
  });
});

describe('OTA-1389 — the swap happens for web', () => {
  it.each(NATIVE_ONLY)('%s resolves to the stub on web', (name) => {
    const p = find(name, 'web');
    expect(p.filePath.endsWith(join('web-stubs', 'native-noop.js'))).toBe(true);
    // and the real resolver was never consulted
    expect(p.delegated).toBe(false);
  });

  it('an ordinary module still resolves normally on web', () => {
    const p = find('react', 'web');
    expect(p.filePath).toBe('REAL:react');
    expect(p.delegated).toBe(true);
  });
});

describe('OTA-1389 — ⚠⚠ and NEVER for a phone', () => {
  it.each(['android', 'ios', null] as Array<string | null>)(
    'the native-only packages resolve for real on platform %s',
    (platform) => {
      // This is the assertion that matters. If it ever fails, the phone products
      // are shipping a no-op where their AI and voice engines should be, and the
      // build is green.
      for (const name of NATIVE_ONLY) {
        const p = find(name, platform);
        expect(p.filePath).toBe(`REAL:${name}`);
        expect(p.delegated).toBe(true);
      }
    },
  );

  it('⚠ the guard is on the PLATFORM, not on a build flag or an env var', () => {
    // A flag can be forgotten or set wrong. `platform` is supplied by Metro for
    // every resolution and cannot be absent when bundling.
    const m = src('metro.config.js');
    expect(m).toContain("if (platform === 'web'");
    expect(m).not.toContain('process.env.TARTARIA_LINE');
  });
});

describe('OTA-1389 — the stub itself absorbs every access shape', () => {
  // A stub that throws on an unexpected access is a crash moved, not removed —
  // and these modules are reached through default imports, namespace imports,
  // named imports, constructors and chained calls.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const stub = require('../web-stubs/native-noop.js') as any;

  it('default and namespace import shapes', () => {
    expect(stub.__esModule).toBe(true);
    expect(stub.default).toBeDefined();
  });

  it('named import, call, chained call and construction', () => {
    expect(() => stub.anything).not.toThrow();
    expect(() => stub()).not.toThrow();
    expect(() => stub.a.b.c()).not.toThrow();
    expect(() => new stub()).not.toThrow();
  });

  it('⚠ and string / iteration coercion, which is where a Proxy usually blows up', () => {
    expect(() => `${stub}`).not.toThrow();
    expect(() => [...(stub as Iterable<unknown>)]).not.toThrow();
  });
});
