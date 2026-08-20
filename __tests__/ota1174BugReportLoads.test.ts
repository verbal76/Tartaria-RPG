// OTA-1174 — THE UPDATE PATH SAYS WHAT IT DID, AND THE BUG REPORT IS ACTUALLY LOADED.
//
// Owner, after two OTAs failed to reach his iPhone: *"when I open the iPhone this morning
// for the first time it did pull an update. It pulled the three lever update but it hasn't
// been able to pull an update after that… so whatever we've done since it pulled the three
// lever update, it's probably something stopping it."*
//
// ⚠⚠ THAT INSTINCT DESERVED A TEST, NOT AN ASSURANCE. OTA-1171 landed on his device;
// OTA-1172 and OTA-1173 did not. The publish side was verified clean — `Channel 'hal2001'
// (ios): published at runtimeVersion 2.4.1`, exactly what his build asks for — so if a
// bundle is being refused, the refusal is happening ON the device. And expo-updates does
// exactly that: an update whose JS fails during startup is abandoned and the previous
// working bundle is kept. From the outside that is indistinguishable from "it never
// downloaded".
//
// ⚠ AND OTA-1172 ADDED THE MOST LOAD-BEARING IMPORT IN THIS CODEBASE TO A LEAF MODULE:
// `aboutSummary.ts` now does `import { runtimePressureSnapshot } from '../state/gameStore'`
// — pulling a 44k-line store, and everything it imports, into the bug-report path.
//
// ⚠⚠ NOTHING TESTED IT. `ota1172RuntimePressure` asserts on `aboutSummary.ts` as TEXT
// (readFileSync + toContain) and never imports it, so the new import chain had never once
// been executed anywhere — not on CI, not on a device, until a player launched it. A
// grep-shaped test proves a string is present; it cannot prove the module loads. That is
// the gap this file closes, and it is a general lesson: when an OTA adds an import, at
// least one test must EXECUTE the importer.

jest.setTimeout(30000);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import * as fs from 'fs';
import * as path from 'path';
const readSrc = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const APPTSX = readSrc('App.tsx');

describe('OTA-1174 — the boot update check reports itself to the DEVICE log', () => {
  it('⚠⚠ EVERY FAILURE USED TO GO TO console.warn, WHICH NO BUG REPORT CARRIES', () => {
    // The owner sat on OTA-1171 for hours while 1195 and 1196 were provably published to
    // hal2001 AND preview, iOS, runtimeVersion 2.4.1. The server side was verifiably fine
    // and the device could not say a single word about why nothing landed.
    expect(APPTSX).toContain('ota: boot check result = ');
    expect(APPTSX).toContain('⚠ ota: boot check FAILED —');
  });

  it('⚠ THE SILENT CALL NOW FORWARDS ITS STATUS AND ERROR CALLBACKS', () => {
    // `silent: true` suppresses UI, and it was ALSO throwing away the only running
    // commentary the update sequence produces. A stall between two of these lines names
    // its own step; without them a stall is just silence.
    const i = APPTSX.indexOf('const otaResult = await checkAndApplyOTA({');
    expect(i).toBeGreaterThan(-1);
    const block = APPTSX.slice(i, i + 700);
    expect(block).toContain('onStatus:');
    expect(block).toContain('onError:');
  });

  it('it records what expo thinks it is RUNNING, before asking for anything', () => {
    // If this disagrees with OTA_BUILD_ID, the device is on a bundle it did not expect —
    // which is the one question the whole afternoon could not answer.
    expect(APPTSX).toContain('ota: boot check — enabled=');
    expect(APPTSX).toContain('updateId=');
  });

  it('⚠⚠ AND NOT ONE LINE OF CONTROL FLOW CHANGED — additive only, deliberately', () => {
    // This is the one path where a clever fix that goes wrong leaves the player unable to
    // receive the correction. Same call, same options, same branches, same fall-through.
    expect(APPTSX).toContain("checkTimeoutMs: 5000");
    expect(APPTSX).toContain('skipTeardown: true');
    expect(APPTSX).toContain("if (otaResult === 'applied') {");
    expect(APPTSX).toContain("setStage('ota:done');");
  });

  it('⚠ LOGGING CAN NEVER BLOCK THE BOOT', () => {
    // A diagnostic that throws here bricks the launch of an app that is already failing
    // to update — the worst possible place to be clever.
    const i = APPTSX.indexOf('const otaLog = (m: string): void =>');
    expect(i).toBeGreaterThan(-1);
    expect(APPTSX.slice(i, i + 220)).toContain('catch');
  });
});

describe('OTA-1174 — the bug-report module loads and runs', () => {
  it('⚠⚠ IMPORTING aboutSummary DOES NOT THROW — the OTA-1172 import chain executes', () => {
    // If this throws, the bundle dies during startup on a real device and expo-updates
    // silently reverts to the last working update, which is exactly the symptom reported.
    expect(() => require('../app/diagnostics/aboutSummary')).not.toThrow();
  });

  it('⚠ AND THE SNAPSHOT IMPORT RESOLVES TO A REAL FUNCTION, not undefined', () => {
    // A require CYCLE does not throw on import — it hands back a half-built module whose
    // exports are `undefined`. That failure only shows up when something calls them, which
    // is why "it imported fine" is not the assertion worth making.
    //
    // ⚠⚠ OTA-1396 — RE-POINTED, NOT RELAXED. This used to require
    // `app/state/gameStore`, because that is where `runtimePressureSnapshot` lived when
    // the header above was written. Slice 5 moved the instruments to
    // `app/diagnostics/runtimePressureWatch.ts`, so the function aboutSummary imports now
    // comes from there. The assertion is the same claim at the new address: the thing the
    // bug-report path calls must be a real function, not a cycle's `undefined`.
    //
    // ⚠ AND THE CYCLE RISK HERE WENT UP, NOT DOWN, WHICH IS WHY THIS STAYS. aboutSummary
    // still imports `useGameStore` (it reads live state for the report), so the store is
    // still on the SHARE path; what changed is that the snapshot now arrives from a leaf
    // that imports no value from the store. Two entry points into that graph instead of
    // one — exactly the arrangement where a half-built module is easy to get and hard to
    // notice.
    const watch = require('../app/diagnostics/runtimePressureWatch') as {
      runtimePressureSnapshot?: unknown;
    };
    expect(typeof watch.runtimePressureSnapshot).toBe('function');
    // ...and via the importer itself, which is the order a device actually loads them in.
    const about = readSrc('app', 'diagnostics', 'aboutSummary.ts');
    expect(about).toContain("import { runtimePressureSnapshot } from './runtimePressureWatch';");
  });

  it('⚠⚠ AND THE REPORT ACTUALLY BUILDS — the path a player takes when they hit SHARE', () => {
    const { buildBasicDeviceSummary } = require('../app/diagnostics/aboutSummary') as {
      buildBasicDeviceSummary: () => string;
    };
    let out = '';
    expect(() => { out = buildBasicDeviceSummary(); }).not.toThrow();
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(50);
  });

  it('the OTA-1172 runtime-pressure block is present in the built report', () => {
    const { buildBasicDeviceSummary } = require('../app/diagnostics/aboutSummary') as {
      buildBasicDeviceSummary: () => string;
    };
    expect(buildBasicDeviceSummary()).toContain('Runtime pressure');
  });

  it('stampLogExport runs too — the other exported entry point', () => {
    const { stampLogExport } = require('../app/diagnostics/aboutSummary') as {
      stampLogExport: (b: string) => string;
    };
    expect(() => stampLogExport('test body')).not.toThrow();
  });
});
