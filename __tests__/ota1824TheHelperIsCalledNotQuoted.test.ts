/**
 * OTA-1824 — THE HELPER IS CALLED, NOT QUOTED.
 *
 * ⚠⚠⚠ WHAT HAPPENED. OTA-1823 shipped the native memory flight recorder to both
 * lines, the owner dispatched the production HAL build, and EAS build 197
 * (54f56b3e-02a0-46fd-a085-878b76be5cca, Xcode 26.2 / iPhoneOS26.2.sdk) died at
 * `** ARCHIVE FAILED **` with five copies of one diagnostic:
 *
 *     generic parameter 'T' could not be inferred
 *
 * at MemoryFlightRecorder.swift:381, :403, :462, :706 and :740 — every one of
 * them the same line:
 *
 *     let N = MemoryFlightRecorder.n
 *
 * ⚠⚠ THE MECHANISM, because the fix only makes sense once it is named. `n` was
 * declared `static func n<T: BinaryInteger>(_ v: T) -> Int`. Binding it to a
 * `let` WITHOUT APPLYING IT asks Swift to construct a function VALUE, and a
 * function value must have a concrete type. With no argument and no contextual
 * type there is nothing from which to fix `T`, so the type checker refuses. The
 * five aliases were a readability convenience — `N(x)` reads better than
 * `MemoryFlightRecorder.n(x)` inside a long dictionary literal — and they cost a
 * 25-minute round trip on an EAS macOS worker to discover.
 *
 * The repair applies the helper directly at all 63 call sites, where `T` is
 * inferred from the argument exactly as generics normally resolve. NO
 * MEASUREMENT CHANGED: every value still passes through `Int(clamping:)`.
 *
 * ⚠⚠⚠ WHY THIS SUITE EXISTS RATHER THAN A SILENT RE-PUBLISH UNDER 1823.
 * The Swift is native-only and the JS bundle is byte-identical to OTA-1823's, so
 * the honest first instinct is "no new OTA is owed". That instinct is WRONG, and
 * the reason is OTA-1482's own finding. `modules/**` is not in ci.yml's
 * publish-ignore list, so this push DOES dispatch the publisher and a new update
 * group DOES reach both channels. OTA_BUILD_ID is the value the device DISPLAYS
 * and the one the just-updated toast keys on — so republishing under a stamp the
 * device already carries would land a new bundle that looks exactly like no
 * update arriving. That is precisely the failure OTA-1482 was written to stop,
 * and reproducing it deliberately, to save a number, would be indefensible.
 *
 * So the corrected application authority gets its own number. The stamp names
 * the PUBLISHED AUTHORITY, not the diff's file extensions.
 *
 * ⚠ THE LOCKED ARCHITECTURE IS UNTOUCHED. Capacities, cadences, burst rules,
 * signals, the checkpoint, MetricKit, the exclusion list and the llama
 * prohibition are all exactly as OTA-1823 shipped them — §2 below proves it by
 * re-asserting them here rather than trusting that nobody moved them.
 */

import fs from 'fs';
import path from 'path';

const IOS_DIR = path.join(__dirname, '..', 'modules', 'tartaria-memory', 'ios');
const swiftFiles = () => fs.readdirSync(IOS_DIR).filter((f) => f.endsWith('.swift'));
const read = (f: string) => fs.readFileSync(path.join(IOS_DIR, f), 'utf8');

/**
 * ⚠ CODE ONLY. The ⚠ blocks in these files deliberately QUOTE the defective
 * line so the next author can see what went wrong; a ratchet that fired on the
 * explanation would push someone to delete the explanation to get green.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('///'))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('§1 no generic function is referenced without being applied', () => {
  it('1.1 declares its generic helpers where a call site can infer them', () => {
    // The module should own a small, countable set of generics. If this number
    // grows, §1.2 below still covers the new one — this assertion exists so the
    // suite notices the surface changing at all.
    const decls = swiftFiles().flatMap((f) =>
      Array.from(codeOnly(read(f)).matchAll(/func\s+(\w+)\s*</g)).map((m) => `${f}:${m[1]}`),
    );
    expect(decls).toEqual(['MemoryFlightRecorder.swift:tmInt']);
  });

  it('1.2 never names a generic function without immediately calling it — THE BUILD-197 RATCHET', () => {
    // ⚠⚠ THE LOAD-BEARING TEST OF THIS OTA. For every generic function the
    // module declares, every mention of it in CODE must be immediately followed
    // by `(` (applied) or `<` (explicitly specialised). A bare mention is the
    // unbound reference that cannot type-check, and it is invisible to every
    // other check we own: TypeScript does not read Swift, jest does not compile
    // it, and the gates do not parse it. Only Xcode caught it, 25 minutes and
    // one owner dispatch downstream.
    const offences: string[] = [];
    for (const f of swiftFiles()) {
      const code = codeOnly(read(f));
      const generics = Array.from(code.matchAll(/func\s+(\w+)\s*</g)).map((m) => m[1]!);
      for (const name of generics) {
        const lines = code.split('\n');
        lines.forEach((line, i) => {
          if (/func\s+\w+\s*</.test(line)) return; // the declaration itself
          const re = new RegExp(`\\b${name}\\b(?![\\s]*[(<])`, 'g');
          if (re.test(line)) offences.push(`${f}:${i + 1}  ${line.trim()}`);
        });
      }
    }
    expect(offences).toEqual([]);
  });

  it('1.3 the helper it replaced is gone from code, name and all', () => {
    for (const f of swiftFiles()) {
      const code = codeOnly(read(f));
      expect(code).not.toMatch(/let\s+N\s*=/);
      expect(code).not.toMatch(/MemoryFlightRecorder\.n\b/);
      expect(code).not.toMatch(/static func n</);
    }
  });

  it('1.4 applies the helper at every boundary that leaves Swift', () => {
    // 63 call sites — the exact count the repair rewrote. A drop here means a
    // number started crossing the bridge unclamped.
    const code = codeOnly(read('MemoryFlightRecorder.swift'));
    expect(code.match(/\btmInt\(/g)?.length).toBe(63);
  });

  it('1.5 still clamps rather than truncating or wrapping', () => {
    // ⚠ The whole point of the boundary. `truncatingIfNeeded` here would turn a
    // large reading into a small plausible one — the worst kind of wrong number.
    const code = codeOnly(read('MemoryFlightRecorder.swift'));
    const fn = /func tmInt<T: BinaryInteger>\(_ v: T\) -> Int \{\s*return ([^\n]+)\n/.exec(code);
    expect(fn?.[1]).toBe('Int(clamping: v)');
  });

  it('1.6 records the build that proved it, so the cost is not re-paid', () => {
    expect(read('MemoryFlightRecorder.swift')).toMatch(/generic parameter 'T' could not be inferred/);
  });
});

describe('§2 the OTA-1823 architecture is unchanged by this repair', () => {
  // ⚠ A compile fix is the classic place for scope to leak. These re-assert the
  // locked numbers rather than trusting that a Swift edit left them alone.
  const rec = () => read('MemoryFlightRecorder.swift');

  it('2.1 capacities are still fixed at 512 samples and 64 events', () => {
    expect(rec()).toMatch(/let TM_SAMPLE_CAPACITY = 512\b/);
    expect(rec()).toMatch(/let TM_EVENT_CAPACITY = 64\b/);
  });

  it('2.2 cadences and the single shared burst deadline are unchanged', () => {
    expect(rec()).toMatch(/let TM_CADENCE_ACTIVE_MS = 1_000/);
    expect(rec()).toMatch(/let TM_CADENCE_INACTIVE_MS = 5_000/);
    expect(rec()).toMatch(/let TM_CADENCE_BURST_MS = 100/);
    expect(rec()).toMatch(/let TM_BURST_DEFAULT_MS: UInt64 = 3_000/);
    expect(rec()).toMatch(/let TM_BURST_MAX_MS: UInt64 = 10_000/);
    expect(rec()).toMatch(/burstUntilMs = min\(max\(self\.burstUntilMs, proposed\), ceiling\)/);
  });

  it('2.3 the allocator is still on its own slower clock', () => {
    expect(rec()).toMatch(/let TM_MALLOC_MIN_INTERVAL_MS: UInt64 = 1_000/);
    expect(rec()).toMatch(/now &- lastMallocSampleMs >= TM_MALLOC_MIN_INTERVAL_MS/);
  });

  it('2.4 every signal OTA-1823 shipped is still read', () => {
    const code = codeOnly(rec());
    for (const signal of [
      'phys_footprint', 'resident_size', 'resident_size_peak',
      'os_proc_available_memory', 'malloc_zone_statistics', 'thermalState',
    ]) expect(code).toContain(signal);
  });

  it('2.5 annotate still does no Mach work on the calling thread', () => {
    const src = rec();
    const fn = src.slice(src.indexOf('func annotate(kind: UInt16'), src.indexOf('func heartbeat()'));
    expect(fn).toContain('queue.async');
    expect(fn).not.toContain('readVM()');
    expect(fn).not.toContain('task_info');
  });

  it('2.6 the excluded techniques are still excluded', () => {
    const all = swiftFiles().map((f) => codeOnly(read(f))).join('\n');
    for (const forbidden of [
      'malloc_get_all_zones', 'malloc_zone_enumerate', 'malloc_logger',
      'vm_region', 'mach_vm_region', 'MallocStackLogging', 'NSZombie',
      'objc_getClassList', 'CFGetRetainCount',
    ]) expect(all).not.toContain(forbidden);
  });

  it('2.7 the llama prohibition still holds in code and in prose', () => {
    const all = swiftFiles().map((f) => codeOnly(read(f))).join('\n').toLowerCase();
    for (const knob of [
      'n_ctx', 'n_gpu_layers', 'n_batch', 'n_ubatch', 'use_mlock', 'n_threads', 'llamacontext',
    ]) expect(all).not.toContain(knob);
    expect(swiftFiles().map((f) => read(f)).join('\n'))
      .toMatch(/BUILD 190 MUST[\s/*]*MEASURE THE EXISTING LLAMA CONFIGURATION/);
  });

  it('2.8 the two-slot checksummed checkpoint is intact', () => {
    const store = read('MemoryCheckpointStore.swift');
    expect(store).toContain('flight-a.tmcp');
    expect(store).toContain('flight-b.tmcp');
    expect(store).toMatch(/crc32\(body\) == crcExpected/);
    expect(store).toMatch(/body\.count == len/);
  });

  it('2.9 the bridge still exposes every door the facade calls', () => {
    const bridge = read('TartariaMemoryModule.swift');
    for (const door of [
      'start', 'stop', 'annotate', 'heartbeat', 'beginBurst', 'setBuildTag',
      'snapshot', 'health', 'freeze', 'drain', 'previousLife', 'metricKit',
      'startMetricKit',
    ]) expect(bridge).toContain(`"${door}"`);
  });

  it('2.10 the JS half is untouched by this repair — the facade still no-ops without native', () => {
    // ⚠ OTA-1824 changes ZERO TypeScript. The bundle it publishes is
    // byte-identical to OTA-1823's; only the stamp and this suite differ.
    const facade = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'diagnostics', 'nativeMemoryRecorder.ts'), 'utf8',
    );
    expect(facade).toContain("requireOptionalNativeModule<NativeModuleShape>('TartariaMemory')");
    expect(facade).toContain('NOT a clean bill of health');
  });
});
