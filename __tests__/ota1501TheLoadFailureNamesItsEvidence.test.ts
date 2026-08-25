// OTA-1501 — THE LOAD FAILURE NAMES ITS EVIDENCE.
//
// ⚠⚠⚠ THE STANDING DEFECT (task #77): since 2026-08-23 the owner's iPhone
// fails every Qwen load with `Load failed: Failed to load the model` — five
// Sentry events and climbing, not one successful load in any retained log.
// That string is llama.rn's ONE message for two different diseases
// (RNLlama.mm: `if (![context isModelLoaded]) reject(...)`):
//   · a GGUF llama.cpp cannot parse  → poisoned download cache, and no code
//     path today would ever heal it (isQwenCached would bless it forever);
//   · an allocation llama.cpp cannot make → memory, the device wall.
//
// ⚠⚠ WHAT THE RECEIPTS ALREADY RULE: a dying-breath crumb at `ctx-open-done`
// (crash_2026-08-24T00-28-05) proves the model parsed and installed WHOLE at
// least once — a truncated file cannot reach that stamp — while `ctx-open`
// deaths and the memory-warning storms around load windows point at memory.
// Suspicion, not proof: nothing measures the failing load itself.
//
// ⚠⚠ THE RCA RULE (iteration 7): no guessing. This OTA changes NO behavior;
// it makes the failure line carry the deciding facts — elapsed ms (a header
// rejection is instant, an allocation death takes seconds), exact bytes on
// disk vs ~398MB nominal, the OTA-294 sentinel, free disk — so the owner's
// next SEND LOG closes the case on device evidence.

import {
  QwenGenerativeEngine,
  describeQwenLoadEvidence,
} from '../app/ai/generation/QwenGenerativeEngine';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const MB = 1024 * 1024;
const statFull = async () => ({ sizeBytes: 398 * MB, sentinel: true, freeDiskBytes: 3 * 1024 * MB });
const statShort = async () => ({ sizeBytes: 250 * MB, sentinel: true, freeDiskBytes: null });

const fakeRuntime = (msg: string) =>
  ({
    isReady: () => false,
    async initialize() { throw new Error(msg); },
    async dispose() { /* noop */ },
  } as never);

const fakeDownloader = (opts: { stat?: () => Promise<{ sizeBytes: number | null; sentinel: boolean; freeDiskBytes: number | null }>; throwOnDownload?: Error } = {}) => ({
  async ensureQwenGguf() {
    if (opts.throwOnDownload) throw opts.throwOnDownload;
    return '/fake/model.gguf';
  },
  ...(opts.stat ? { statQwenGguf: opts.stat } : {}),
});

describe('OTA-1501 — the evidence suffix itself', () => {
  it('⚠⚠⚠ FULL FILE + SENTINEL + TIMING — the memory-vs-file discriminator in one clause', async () => {
    const s = await describeQwenLoadEvidence({ statQwenGguf: statFull }, 5321);
    expect(s).toBe(' (after 5321ms; gguf 398.0MB on disk (~398MB nominal); sentinel ok; disk free 3.0GB)');
  });

  it('⚠⚠⚠ A SHORT FILE READS AS SHORT — the poisoned-cache signature', async () => {
    const s = await describeQwenLoadEvidence({ statQwenGguf: statShort }, 180);
    expect(s).toContain('gguf 250.0MB on disk (~398MB nominal)');
    expect(s).toContain('after 180ms');
    expect(s).not.toContain('disk free'); // unknown facts stay out, they do not read as zero
  });

  it('⚠⚠ a missing file and a missing sentinel say so in capitals', async () => {
    const s = await describeQwenLoadEvidence(
      { statQwenGguf: async () => ({ sizeBytes: null, sentinel: false, freeDiskBytes: null }) },
      null,
    );
    expect(s).toContain('gguf MISSING on disk');
    expect(s).toContain('NO SENTINEL');
    expect(s).not.toContain('after'); // download-stage failures have no load duration
  });

  it('⚠⚠ no downloader (injected modelPath) → timing only; nothing at all → empty string', async () => {
    expect(await describeQwenLoadEvidence(null, 42)).toBe(' (after 42ms)');
    expect(await describeQwenLoadEvidence(null, null)).toBe('');
  });

  it('⚠⚠⚠ A FAILING PROBE NEVER EATS THE FAILURE — evidence is best effort', async () => {
    const s = await describeQwenLoadEvidence(
      { statQwenGguf: async () => { throw new Error('fs is gone'); } },
      99,
    );
    expect(s).toBe(' (after 99ms)');
  });
});

describe('OTA-1501 — the engine appends the evidence where the log reads it', () => {
  it('⚠⚠⚠ THE OWNER\'S LINE, UPGRADED: native failure carries timing + file facts', async () => {
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      downloader: fakeDownloader({ stat: statFull }),
      runtime: fakeRuntime('Failed to load the model'),
    });
    expect(engine.getStatus()).toBe('failed');
    expect(engine.getLastError()).toMatch(
      /^Load failed: Failed to load the model \(after \d+ms; gguf 398\.0MB on disk \(~398MB nominal\); sentinel ok; disk free 3\.0GB\)$/,
    );
  });

  it('⚠⚠ an injected modelPath stats nothing — those facts would be about the wrong file', async () => {
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      modelPath: '/bundled/elsewhere.gguf',
      downloader: fakeDownloader({ stat: statFull }),
      runtime: fakeRuntime('Failed to load the model'),
    });
    expect(engine.getLastError()).toMatch(/^Load failed: Failed to load the model \(after \d+ms\)$/);
  });

  it('⚠⚠ the download path reports the disk it ran out of', async () => {
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      downloader: fakeDownloader({
        throwOnDownload: new Error('write error'),
        stat: async () => ({ sizeBytes: 250 * MB, sentinel: false, freeDiskBytes: 12 * MB }),
      }),
      runtime: fakeRuntime('unused'),
    });
    // 12MB free renders in MB — "0.0GB" must never hide a full disk.
    expect(engine.getLastError()).toMatch(/^GGUF download failed: write error \(gguf 250\.0MB on disk \(~398MB nominal\); NO SENTINEL; disk free 12MB\)$/);
  });

  it('⚠ a legacy test double without statQwenGguf still works — suffix degrades, never throws', async () => {
    const engine = new QwenGenerativeEngine();
    await engine.initialize({
      downloader: fakeDownloader(),
      runtime: fakeRuntime('boom'),
    });
    expect(engine.getLastError()).toMatch(/^Load failed: boom \(after \d+ms\)$/);
  });
});

describe('OTA-1501 — the line reaches the surfaces that ship with a SEND LOG', () => {
  it('⚠⚠⚠ the lifecycle slice prints lastError verbatim into the device log', () => {
    const SLICE = read('app', 'state', 'slices', 'aiLifecycleSlice.ts');
    expect(SLICE).toContain('qwen: LOAD FAILED — ${why}');
    expect(SLICE).toContain('qwen.getLastError()');
  });

  it('⚠⚠ the downloader probe measures the real cache file and the real disk', () => {
    const DL = read('app', 'ai', 'ota', 'ModelDownloader.ts');
    const fn = DL.slice(DL.indexOf('async statQwenGguf('));
    // slice to the next method, not to '\n  }' — the multi-line return type
    // closes with that exact sequence and would cut the body short
    const body = fn.slice(0, fn.indexOf('async ensureQwenGguf'));
    expect(body).toContain('QWEN_CACHE_SUBDIR + QWEN_GGUF_FILE_NAME');
    expect(body).toContain("'.complete'");
    expect(body).toContain('getFreeDiskStorageAsync()');
  });

  it('⚠ the load clock starts at the native step, not at the download', () => {
    const ENG = read('app', 'ai', 'generation', 'QwenGenerativeEngine.ts');
    const idx = ENG.indexOf('const loadStartedAt = Date.now();');
    expect(idx).toBeGreaterThan(ENG.indexOf('ensureQwenGguf({'));
    expect(idx).toBeLessThan(ENG.indexOf('await runtime.initialize({'));
  });
});
