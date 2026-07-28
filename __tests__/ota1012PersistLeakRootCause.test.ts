jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// OTA-1012 — THE LEAK THAT ATE THE SIMS, ROOT-CAUSED. Two stacked causes:
// (1) TEST-SIDE: the official AsyncStorage jest mock wraps every method in
//     jest.fn(), which RETAINS every call's arguments forever. The disk
//     game-log rewrites a capped ~400 KB buffer per append, so long sims
//     retained every buffer version until V8's 8 GB heap wall — the entire
//     "world/persist super-linear tail growth" open item. package.json now
//     maps the mock path to a PLAIN mock (test-utils/asyncStorageMock.js).
// (2) APP-SIDE: appendLogToDisk did that full read-modify-write PER LINE —
//     several lines per player action = megabytes of storage-bridge traffic
//     per action on device. It now batches pending lines into ONE
//     read-modify-write per flush.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as fs from 'fs';
import * as path from 'path';
import {
  appendLogToDisk,
  flushLogWrites,
  readFullLog,
  setActiveSlot,
} from '../app/engine/saveSystem';

describe('OTA-1012 — the AsyncStorage test mock no longer records (and retains) calls', () => {
  it('the mapped mock is PLAIN — no jest.fn call recording anywhere on it', () => {
    expect(jest.isMockFunction(AsyncStorage.setItem)).toBe(false);
    expect(jest.isMockFunction(AsyncStorage.getItem)).toBe(false);
    expect(jest.isMockFunction(AsyncStorage.multiSet)).toBe(false);
    expect((AsyncStorage.setItem as any).mock).toBeUndefined();
  });

  it('and it still stores faithfully (round-trip, remove, getAllKeys)', async () => {
    await AsyncStorage.setItem('probe_k', 'probe_v');
    expect(await AsyncStorage.getItem('probe_k')).toBe('probe_v');
    expect(await AsyncStorage.getAllKeys()).toContain('probe_k');
    await AsyncStorage.removeItem('probe_k');
    expect(await AsyncStorage.getItem('probe_k')).toBeNull();
  });

  it('CATEGORY LOCK: package.json pins the mapping so every suite gets the plain mock', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    expect(pkg.jest.moduleNameMapper['^@react-native-async-storage/async-storage/jest/async-storage-mock$'])
      .toBe('<rootDir>/test-utils/asyncStorageMock.js');
  });
});

describe('OTA-1012 — disk-log appends are batched (one read-modify-write per burst)', () => {
  it('a synchronous burst of appends coalesces into few writes, keeps order, loses nothing', async () => {
    await setActiveSlot('leaktest_slot');
    const spy = jest.spyOn(AsyncStorage, 'setItem');
    const N = 60;
    for (let i = 0; i < N; i++) {
      void appendLogToDisk(`line-${i}`);
    }
    await flushLogWrites();
    // Old shape: one setItem PER LINE (60 calls). New shape: the burst drains
    // in a handful of chain flushes. Allow generous slack for chain timing.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
    const log = await readFullLog();
    for (let i = 0; i < N; i++) {
      expect(log).toContain(`line-${i}`);
    }
    // FIFO order preserved.
    expect(log.indexOf('line-0')).toBeLessThan(log.indexOf(`line-${N - 1}`));
    spy.mockRestore();
    await setActiveSlot(null);
  });

  it('SOURCE LOCK: the per-line read-modify-write shape is gone from saveSystem', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'saveSystem.ts'), 'utf8');
    expect(src).toMatch(/pendingLogLines/);                              // new shape present
    expect(src).toMatch(/capDiskLog\(existing \+ lines\.join\('\\n'\) \+ '\\n'\)/); // batched write
    expect(src).not.toMatch(/capDiskLog\(existing \+ line \+ '\\n'\)/);  // old per-line shape gone
  });
});
