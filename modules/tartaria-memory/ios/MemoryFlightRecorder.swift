// ⚠⚠⚠ BUILD 190 — THE NATIVE MEMORY FLIGHT RECORDER.
//
// THIS IS DIAGNOSTIC INSTRUMENTATION. IT IS NOT A MEMORY REPAIR. Nothing in
// this file frees, disposes, reloads, evicts, schedules, cancels, reorders or
// throttles anything the app does. It measures the process and writes numbers
// into fixed-capacity buffers. If it were deleted tomorrow the game would
// behave identically and we would simply be blind again.
//
// ⚠⚠ WHY IT HAD TO BE NATIVE, stated once so nobody re-litigates it later.
// app/diagnostics/memoryTimeline.ts already records a timeline, and its own
// header says exactly what it cannot do:
//
//     "process RSS is not reachable from this runtime without a new native
//      dependency (checked against package.json: no device-info, no
//      expo-device, and Sentry exposes no live-memory read)"
//
// Hermes can only see the JS heap. The ~400 MB llama context, the voice model
// and every ONNX arena are NATIVE allocations Hermes cannot count, so a session
// could sit at a flat 60 MB JS heap while the process walked to 1.9 GB and the
// existing instrument would have reported nothing wrong. THAT is the blind spot
// this module closes, and it is the only reason it exists.
//
// ⚠⚠⚠ WHAT THE EVIDENCE ACTUALLY SAYS, because the labels on these numbers
// matter more than the numbers:
//   · HISTORICAL JETSAM PROCESS PRESSURE ............................ PROVEN
//     (three jetsam reports off a 3 GB iPhone XR naming us at ~1.85-1.89 GB
//      with reason: per-process-limit)
//   · LIVE CLASS-H MEMORY CAUSATION ................................ UNKNOWN
//     Nothing here is permitted to say memory caused the Apple freeze. This
//     recorder exists so the NEXT report can answer that question instead of
//     re-posing it.
//
// ⚠ THE RECORDER MUST NEVER BECOME THE PROBLEM IT MEASURES. Every buffer here
// is fixed at compile time and allocated once:
//     512 samples x 56 bytes  ~= 28 KB
//      64 events  x 32 bytes  ~=  2 KB
// That is the whole steady-state cost, forever, on every device. There is no
// growth path: no array append without an eviction, no dictionary, no string,
// no Data accumulation, no retained ObjC object per sample. A diagnostic that
// retains the thing it is measuring is a leak with a nice name on it.
//
// ⚠⚠⚠ AND THE ONE STANDING PROHIBITION THIS FILE MUST CARRY, because this is
// the file a future author would reach for if they wanted to "just have a look
// at the model while we are in here": BUILD 190 MUST
// MEASURE THE EXISTING LLAMA CONFIGURATION. Not one line of this module reads,
// writes, wraps, patches or links against llama.cpp. No n_ctx, no
// n_gpu_layers, no mlock, no batch or ubatch, no thread count, no model, no
// quantization, no context lifecycle, no load or release timing, no scheduler
// ownership, no priority, no cancellation, no teardown, no Metal setting and no
// prompt. The recorder watches the PROCESS; the llama context is simply one of
// the things resident inside it. An instrument that changed the thing it
// measures would be reporting on itself.
//
// ⚠ SCALARS ONLY. No prompt, no scene text, no player name, no React object,
// no model handle is stored in a sample or an event. Annotations carry two
// integers. The vocabulary that gives those integers meaning lives in
// TypeScript, where it can be read and tested; Swift deliberately stays dumb
// about what kind 41 means.

import Foundation
import os

#if os(iOS)
import UIKit
#endif

// MARK: - Fixed capacities

/// ⚠ FIXED AT COMPILE TIME. 512 samples is ~8.5 minutes at the 1/s active
/// cadence and ~51 seconds inside a 100 ms burst — in both cases the window
/// that actually precedes a death. A longer tail is not more evidence, it is
/// just more bytes resident in a process we are investigating FOR its bytes.
let TM_SAMPLE_CAPACITY = 512

/// ⚠ Events are rarer and more precious than samples, so they get their own
/// ring rather than competing with samples for space. 64 annotations spans a
/// whole generation cycle plus the lifecycle transitions around it.
let TM_EVENT_CAPACITY = 64

/// Cadences, in milliseconds. Adaptive, and the reason is battery and honesty
/// rather than cleverness: a 100 ms poll left running forever would itself
/// change the thermal and CPU picture we are trying to read.
let TM_CADENCE_ACTIVE_MS = 1_000
let TM_CADENCE_INACTIVE_MS = 5_000
let TM_CADENCE_BURST_MS = 100

/// Default burst length, and the hard ceiling any single burst may reach.
/// ⚠ OVERLAPPING BURSTS EXTEND ONE SHARED DEADLINE — they do not stack, they
/// do not nest, and they cannot run a 100 ms poll indefinitely by arriving
/// back to back.
let TM_BURST_DEFAULT_MS: UInt64 = 3_000
let TM_BURST_MAX_MS: UInt64 = 10_000

/// ⚠ MALLOC-ZONE STATISTICS ARE SAMPLED AT ~1/SECOND, NEVER AT 100 ms.
/// malloc_zone_statistics takes the zone's lock. At 100 ms, inside a burst,
/// against an allocator the llama context is actively hammering, that is a
/// contention source we would be adding to the system under investigation.
/// This interval is enforced independently of the sample cadence, so a burst
/// speeds up the Mach counters and leaves the allocator alone.
let TM_MALLOC_MIN_INTERVAL_MS: UInt64 = 1_000

/// ⚠ How long JS may go quiet before the recorder marks its own samples as
/// carrying a STALE Hermes figure. This is the one signal that costs nothing
/// and is worth the most in a freeze: native keeps sampling on its own queue
/// while the JS thread is wedged, so a run of samples flagged stale IS the
/// stall, observed from outside the runtime that stalled.
let TM_JS_HEARTBEAT_STALE_MS: UInt64 = 6_000

// MARK: - Flag bits

let TM_FLAG_MALLOC_SAMPLED: UInt8 = 1 << 0
let TM_FLAG_JS_STALE: UInt8 = 1 << 1
let TM_FLAG_MACH_FAILED: UInt8 = 1 << 2
let TM_FLAG_BURST: UInt8 = 1 << 3

// MARK: - Lifecycle phase codes

let TM_PHASE_UNKNOWN: UInt8 = 0
let TM_PHASE_ACTIVE: UInt8 = 1
let TM_PHASE_INACTIVE: UInt8 = 2
let TM_PHASE_BACKGROUND: UInt8 = 3
let TM_PHASE_TERMINATING: UInt8 = 4

// MARK: - Sample and event records

/// ⚠ One row of the flight. A plain value type of fixed size: no reference
/// fields, so an array of these is one flat allocation and copying one costs
/// no retain traffic.
struct TMSample {
  /// Milliseconds since the recorder started. Monotonic (uptime), NOT wall
  /// clock — a wall clock can step backwards and a memory trace that goes
  /// backwards in time is unreadable.
  var t: UInt64 = 0

  /// ⚠⚠ task_vm_info.phys_footprint. THIS IS THE NUMBER JETSAM JUDGES US ON.
  /// DO NOT LABEL IT "native heap": it is the process's phys_footprint, which
  /// includes the JS heap, every native allocation, and dirty pages this
  /// process is charged for. Calling it a heap would invite someone to go
  /// looking for a heap to shrink.
  var footprint: UInt64 = 0

  /// task_vm_info.resident_size — resident pages right now.
  var resident: UInt64 = 0

  /// task_vm_info.resident_size_peak — the high water this process has ever
  /// touched, as the kernel remembers it. Never decreases.
  var residentPeak: UInt64 = 0

  /// ⚠ os_proc_available_memory(). DO NOT CALL THIS "the exact Jetsam
  /// threshold". It is the OS's own answer to "how much more may this process
  /// take", it moves with system-wide conditions, and treating it as a fixed
  /// cliff would turn a moving advisory number into a fake constant. Zero
  /// means the API did not answer, never "no memory left".
  var available: UInt64 = 0

  /// malloc default zone, sampled at most once a second. Zero when this tick
  /// did not sample the allocator — read TM_FLAG_MALLOC_SAMPLED, do not infer
  /// from the value.
  var mallocInUse: UInt64 = 0
  var mallocAllocated: UInt64 = 0
  var mallocBlocks: UInt32 = 0

  var phase: UInt8 = TM_PHASE_UNKNOWN
  var thermal: UInt8 = 255
  var flags: UInt8 = 0
  var pad: UInt8 = 0
}

/// ⚠ An annotation. TWO INTEGERS AND A TIMESTAMP — that is the entire payload
/// a caller may contribute. `sampleSeq` ties the event to the sample stream so
/// a reader can place it on the trace without a second Mach read.
struct TMEvent {
  var t: UInt64 = 0
  var footprint: UInt64 = 0
  var sampleSeq: UInt64 = 0
  var kind: UInt16 = 0
  var code: UInt16 = 0
  var phase: UInt8 = TM_PHASE_UNKNOWN
  var pad: UInt8 = 0
  var pad2: UInt16 = 0
}

/// Sampler health. ⚠ A recorder that quietly stopped recording is the worst
/// failure this instrument can have, because a flat trace then reads as "memory
/// was fine" when it means "I stopped looking". Every one of these counters
/// exists so the report can tell those two apart.
struct TMHealth {
  var samplesTaken: UInt64 = 0
  var samplesDropped: UInt64 = 0
  var eventsRecorded: UInt64 = 0
  var eventsDropped: UInt64 = 0
  var machFailures: UInt64 = 0
  var burstsStarted: UInt64 = 0
  var burstsExtended: UInt64 = 0
  var memoryWarnings: UInt64 = 0
  var checkpointWrites: UInt64 = 0
  var checkpointFailures: UInt64 = 0
  var mallocSamples: UInt64 = 0
  var jsStaleSamples: UInt64 = 0
}

// MARK: - The one numeric boundary

/// ⚠ EVERY NUMBER LEAVES THIS MODULE AS AN `Int`. The rings hold UInt64 because
/// that is what Mach returns, but the JS bridge marshals NSNumber and an
/// unsigned 64-bit value is the one integer shape that can surprise it. Clamping
/// here — once, at the only boundary that crosses out of Swift — keeps every
/// dictionary below trivially bridgeable. Every quantity we report (bytes of a
/// process, milliseconds of a session) is orders of magnitude inside Int64, so
/// the clamp is a type conversion and never a silent truncation of a reading.
///
/// ⚠⚠ IT IS CALLED, NEVER REFERENCED UNAPPLIED, AND THAT IS WHY IT LIVES HERE
/// AS A PLAIN FUNCTION RATHER THAN BEHIND A LOCAL ALIAS.
///
/// Build 197 (EAS 54f56b3e) failed `** ARCHIVE FAILED **` with five copies of
///
///     generic parameter 'T' could not be inferred
///
/// at MemoryFlightRecorder.swift:381, :403, :462, :706 and :740 — every one of
/// them the line `let N = MemoryFlightRecorder.n`. Binding a generic function to
/// a `let` without applying it asks Swift to build a function VALUE, and a
/// function value must have a concrete type; with no argument and no contextual
/// type there is nothing from which to fix `T`, so the type checker refuses. The
/// five call-site aliases were a readability convenience and cost a 25-minute
/// round trip on an EAS macOS worker.
///
/// Applied directly — `tmInt(s.footprint)` — `T` is inferred from the argument
/// at each of the sixty call sites, which is the ordinary way generics resolve.
/// ⚠ NO MEASUREMENT CHANGED: every value still passes through `Int(clamping:)`,
/// exactly as before. This is a spelling repair, not a semantic one.
@inline(__always) private func tmInt<T: BinaryInteger>(_ v: T) -> Int {
  return Int(clamping: v)
}

// MARK: - The recorder

final class MemoryFlightRecorder {

  static let shared = MemoryFlightRecorder()

  /// ⚠⚠ THE DEDICATED SERIAL UTILITY QUEUE, AND THE LIST OF THINGS IT IS NOT.
  /// It is not the JS thread, not the main thread, not the native-ML lock's
  /// queue, not Sentry's transport queue, and not the persistence path. Every
  /// piece of mutable state below is confined to this queue, which is why none
  /// of it needs a lock and why no caller can ever block on a Mach read.
  private let queue = DispatchQueue(
    label: "com.hotatticgames.tartaria.memory-flight-recorder",
    qos: .utility
  )

  // ⚠ Preallocated once, never resized. `reserveCapacity` is not enough — these
  // are filled to capacity at construction so the steady state performs no
  // allocation at all and the cost is paid before any measurement starts.
  private var samples = [TMSample](repeating: TMSample(), count: TM_SAMPLE_CAPACITY)
  private var events = [TMEvent](repeating: TMEvent(), count: TM_EVENT_CAPACITY)

  /// Monotonically increasing write counters. The ring index is `seq % capacity`;
  /// the seq itself never wraps in any plausible session, so "which samples do I
  /// already have" is answerable by a reader holding only a number.
  private var sampleSeq: UInt64 = 0
  private var eventSeq: UInt64 = 0

  private var health = TMHealth()

  private var started = false
  private var startUptimeMs: UInt64 = 0
  private var startWallMs: UInt64 = 0

  private var timer: DispatchSourceTimer?
  private var currentCadenceMs = TM_CADENCE_ACTIVE_MS

  private var phase: UInt8 = TM_PHASE_UNKNOWN
  private var burstUntilMs: UInt64 = 0
  private var lastMallocSampleMs: UInt64 = 0
  private var lastJsHeartbeatMs: UInt64 = 0

  /// The kernel's peak is a high water for the whole process life; this one is
  /// the high water THIS RECORDER has observed, which is the one that answers
  /// "did it ratchet during the session I am looking at".
  private var observedHighWater: UInt64 = 0
  private var baselineFootprint: UInt64 = 0
  private var baselineSamples: UInt64 = 0

  /// Set from JS so a PREVIOUS LIFE checkpoint can name the OTA that produced
  /// it. Bounded and copied — never a retained JS object.
  private var buildTag = ""

  private var observersInstalled = false

  private init() {}

  // MARK: Start / stop

  func start() {
    queue.async { [weak self] in
      guard let self = self, !self.started else { return }
      self.started = true
      self.startUptimeMs = MemoryFlightRecorder.uptimeMs()
      self.startWallMs = UInt64(Date().timeIntervalSince1970 * 1000.0)
      self.lastJsHeartbeatMs = self.startUptimeMs
      self.phase = TM_PHASE_UNKNOWN
      // ⚠⚠ ORDERING, AND IT IS LOAD-BEARING RATHER THAN TIDY. Lifting the
      // PREVIOUS LIFE into memory must happen before this process can write a
      // checkpoint of its own, because the first write overwrites a slot
      // belonging to the process that died. Do this at start, once, before a
      // memory warning or a background transition can reach the writer.
      _ = MemoryCheckpointStore.shared.previousLife()
      self.installObserversOnMain()
      self.recordEventLocked(kind: TMEventKind.recorderStart, code: 0)
      self.retimeLocked()
    }
  }

  func stop() {
    queue.async { [weak self] in
      guard let self = self, self.started else { return }
      self.recordEventLocked(kind: TMEventKind.recorderStop, code: 0)
      self.timer?.cancel()
      self.timer = nil
      self.started = false
    }
  }

  var isStarted: Bool {
    return queue.sync { started }
  }

  // MARK: Annotation

  /// ⚠⚠ THE ANNOTATION DOOR, AND THE ONE RULE IT MUST NOT BREAK: IT DOES NO
  /// MACH WORK ON THE CALLER'S THREAD. The caller is usually the JS thread,
  /// mid-generation, inside a seam that exists for the game and not for us.
  /// All this does is read a monotonic clock — a cheap userspace read — and
  /// hand the work to the recorder queue. If the queue is busy, the annotation
  /// lands late; it never lands on the caller.
  func annotate(kind: UInt16, code: UInt16) {
    let t = MemoryFlightRecorder.uptimeMs()
    queue.async { [weak self] in
      guard let self = self, self.started else { return }
      self.recordEventLocked(kind: kind, code: code, atUptimeMs: t)
    }
  }

  /// JS says it is still alive. Same discipline as `annotate`: a clock read and
  /// a hand-off, nothing else.
  func heartbeat() {
    let t = MemoryFlightRecorder.uptimeMs()
    queue.async { [weak self] in
      self?.lastJsHeartbeatMs = t
    }
  }

  /// Raise the cadence to 100 ms for `ms` milliseconds.
  /// ⚠ ONE SHARED DEADLINE. A second burst arriving mid-burst pushes the same
  /// deadline out; it does not start a second burst, and it cannot push the
  /// deadline past TM_BURST_MAX_MS from now.
  func beginBurst(ms: UInt64) {
    queue.async { [weak self] in
      guard let self = self, self.started else { return }
      let now = MemoryFlightRecorder.uptimeMs()
      let requested = ms == 0 ? TM_BURST_DEFAULT_MS : ms
      let ceiling = now &+ TM_BURST_MAX_MS
      let proposed = now &+ min(requested, TM_BURST_MAX_MS)
      let wasBursting = self.burstUntilMs > now
      self.burstUntilMs = min(max(self.burstUntilMs, proposed), ceiling)
      if wasBursting {
        self.health.burstsExtended &+= 1
      } else {
        self.health.burstsStarted &+= 1
      }
      self.retimeLocked()
    }
  }

  func setBuildTag(_ tag: String) {
    // ⚠ Bounded and copied at the door. A build tag is a short stamp; anything
    // longer is a caller mistake and costs bytes, never a crash.
    let bounded = String(tag.prefix(64))
    queue.async { [weak self] in
      self?.buildTag = bounded
    }
  }

  // MARK: Reading

  /// ⚠⚠ FREEZE BEFORE COMPOSING A REPORT. Report composition is itself work —
  /// it allocates strings and runs on a thread that can be preempted — so a
  /// reader that walks a live ring can see rows shift underneath it and produce
  /// a trace that never happened. `freeze` returns the sequence numbers as of
  /// now; `drain` reads strictly below them. The recorder keeps recording
  /// throughout, which is the point: composing a report must not blind the
  /// instrument.
  func freeze() -> (sampleSeq: UInt64, eventSeq: UInt64) {
    return queue.sync { (sampleSeq, eventSeq) }
  }

  /// One immediate read, taken on the recorder queue. Used by the report for a
  /// "right now" line, not by the sampler.
  func snapshotNow() -> [String: Any] {
    return queue.sync {
      let vm = MemoryFlightRecorder.readVM()
      return [
        "ok": vm != nil,
        "footprint": tmInt(vm?.footprint ?? 0),
        "resident": tmInt(vm?.resident ?? 0),
        "residentPeak": tmInt(vm?.peak ?? 0),
        "available": tmInt(MemoryFlightRecorder.readAvailable()),
        "observedHighWater": tmInt(observedHighWater),
        "baseline": tmInt(baselineFootprint),
        "phase": tmInt(phase),
        "thermal": tmInt(MemoryFlightRecorder.readThermal()),
        "started": started,
        "uptimeMs": tmInt(started ? (MemoryFlightRecorder.uptimeMs() &- startUptimeMs) : 0),
      ]
    }
  }

  /// Everything below the frozen marks, oldest first, as plain JS-safe arrays.
  /// ⚠ Bounded by construction: the rings are capped, so this is capped, and no
  /// argument a caller passes can make it return more.
  func drain(sampleUpTo: UInt64, eventUpTo: UInt64) -> [String: Any] {
    return queue.sync {
      var sampleRows: [[String: Any]] = []
      let sHi = min(sampleUpTo, sampleSeq)
      let sLo = sHi > UInt64(TM_SAMPLE_CAPACITY) ? sHi &- UInt64(TM_SAMPLE_CAPACITY) : 0
      sampleRows.reserveCapacity(Int(sHi &- sLo))
      var i = sLo
      while i < sHi {
        let s = samples[Int(i % UInt64(TM_SAMPLE_CAPACITY))]
        sampleRows.append([
          "seq": tmInt(i),
          "t": tmInt(s.t),
          "footprint": tmInt(s.footprint),
          "resident": tmInt(s.resident),
          "residentPeak": tmInt(s.residentPeak),
          "available": tmInt(s.available),
          "mallocInUse": tmInt(s.mallocInUse),
          "mallocAllocated": tmInt(s.mallocAllocated),
          "mallocBlocks": tmInt(s.mallocBlocks),
          "phase": tmInt(s.phase),
          "thermal": tmInt(s.thermal),
          "flags": tmInt(s.flags),
        ])
        i &+= 1
      }

      var eventRows: [[String: Any]] = []
      let eHi = min(eventUpTo, eventSeq)
      let eLo = eHi > UInt64(TM_EVENT_CAPACITY) ? eHi &- UInt64(TM_EVENT_CAPACITY) : 0
      eventRows.reserveCapacity(Int(eHi &- eLo))
      var j = eLo
      while j < eHi {
        let e = events[Int(j % UInt64(TM_EVENT_CAPACITY))]
        eventRows.append([
          "seq": tmInt(j),
          "t": tmInt(e.t),
          "footprint": tmInt(e.footprint),
          "sampleSeq": tmInt(e.sampleSeq),
          "kind": tmInt(e.kind),
          "code": tmInt(e.code),
          "phase": tmInt(e.phase),
        ])
        j &+= 1
      }

      return [
        "samples": sampleRows,
        "events": eventRows,
        "health": healthDictLocked(),
        "startWallMs": tmInt(startWallMs),
        "capacity": ["samples": TM_SAMPLE_CAPACITY, "events": TM_EVENT_CAPACITY],
      ]
    }
  }

  func healthDict() -> [String: Any] {
    return queue.sync { healthDictLocked() }
  }

  private func healthDictLocked() -> [String: Any] {
    return [
      "samplesTaken": tmInt(health.samplesTaken),
      "samplesDropped": tmInt(health.samplesDropped),
      "eventsRecorded": tmInt(health.eventsRecorded),
      "eventsDropped": tmInt(health.eventsDropped),
      "machFailures": tmInt(health.machFailures),
      "burstsStarted": tmInt(health.burstsStarted),
      "burstsExtended": tmInt(health.burstsExtended),
      "memoryWarnings": tmInt(health.memoryWarnings),
      "checkpointWrites": tmInt(health.checkpointWrites),
      "checkpointFailures": tmInt(health.checkpointFailures),
      "mallocSamples": tmInt(health.mallocSamples),
      "jsStaleSamples": tmInt(health.jsStaleSamples),
      "sampleSeq": tmInt(sampleSeq),
      "eventSeq": tmInt(eventSeq),
      "cadenceMs": currentCadenceMs,
      "started": started,
    ]
  }

  // MARK: The sampler

  private func retimeLocked() {
    guard started else { return }
    let now = MemoryFlightRecorder.uptimeMs()
    let bursting = burstUntilMs > now
    let want: Int
    if bursting {
      want = TM_CADENCE_BURST_MS
    } else if phase == TM_PHASE_ACTIVE || phase == TM_PHASE_UNKNOWN {
      want = TM_CADENCE_ACTIVE_MS
    } else {
      want = TM_CADENCE_INACTIVE_MS
    }
    if timer != nil && want == currentCadenceMs { return }
    currentCadenceMs = want
    timer?.cancel()
    let t = DispatchSource.makeTimerSource(queue: queue)
    // ⚠ A generous leeway on purpose. This is a diagnostic, not a metronome:
    // letting the OS coalesce our wakeups with ones it was making anyway is
    // the difference between an instrument and a battery complaint.
    t.schedule(
      deadline: .now() + .milliseconds(want),
      repeating: .milliseconds(want),
      leeway: .milliseconds(want / 4)
    )
    t.setEventHandler { [weak self] in self?.tickLocked() }
    timer = t
    t.resume()
  }

  private func tickLocked() {
    guard started else { return }
    let now = MemoryFlightRecorder.uptimeMs()

    // A burst that has run out returns the sampler to its lifecycle cadence.
    if burstUntilMs != 0 && burstUntilMs <= now {
      burstUntilMs = 0
      retimeLocked()
    }

    var s = TMSample()
    s.t = now &- startUptimeMs
    s.phase = phase
    s.thermal = MemoryFlightRecorder.readThermal()

    if let vm = MemoryFlightRecorder.readVM() {
      s.footprint = vm.footprint
      s.resident = vm.resident
      s.residentPeak = vm.peak
    } else {
      s.flags |= TM_FLAG_MACH_FAILED
      health.machFailures &+= 1
    }
    s.available = MemoryFlightRecorder.readAvailable()

    if burstUntilMs > now { s.flags |= TM_FLAG_BURST }

    // ⚠ The allocator is on its own clock, deliberately slower than the sampler.
    if now &- lastMallocSampleMs >= TM_MALLOC_MIN_INTERVAL_MS {
      let m = MemoryFlightRecorder.readMallocZone()
      s.mallocInUse = m.inUse
      s.mallocAllocated = m.allocated
      s.mallocBlocks = m.blocks
      s.flags |= TM_FLAG_MALLOC_SAMPLED
      lastMallocSampleMs = now
      health.mallocSamples &+= 1
    }

    if now &- lastJsHeartbeatMs > TM_JS_HEARTBEAT_STALE_MS {
      s.flags |= TM_FLAG_JS_STALE
      health.jsStaleSamples &+= 1
    }

    if s.footprint > observedHighWater { observedHighWater = s.footprint }

    // ⚠ BASELINE IS THE FIRST SETTLED READING, not the first reading. The very
    // first samples of a process are taken mid-boot while the bundle is still
    // being evaluated, and calling that "baseline" would make every session
    // look like a catastrophic ratchet away from a number that never existed.
    if baselineSamples < 8 && s.footprint > 0 {
      baselineSamples &+= 1
      baselineFootprint = baselineSamples == 1
        ? s.footprint
        : (baselineFootprint / 2) &+ (s.footprint / 2)
    }

    samples[Int(sampleSeq % UInt64(TM_SAMPLE_CAPACITY))] = s
    if sampleSeq >= UInt64(TM_SAMPLE_CAPACITY) { health.samplesDropped &+= 1 }
    sampleSeq &+= 1
    health.samplesTaken &+= 1
  }

  // MARK: Events

  private func recordEventLocked(kind: UInt16, code: UInt16, atUptimeMs: UInt64? = nil) {
    var e = TMEvent()
    let now = atUptimeMs ?? MemoryFlightRecorder.uptimeMs()
    e.t = now >= startUptimeMs ? now &- startUptimeMs : 0
    e.kind = kind
    e.code = code
    e.phase = phase
    e.sampleSeq = sampleSeq
    // ⚠ The Mach read happens HERE, on the recorder queue — never on the thread
    // that called `annotate`. This is the whole reason annotate is a hand-off.
    e.footprint = MemoryFlightRecorder.readVM()?.footprint ?? 0
    events[Int(eventSeq % UInt64(TM_EVENT_CAPACITY))] = e
    if eventSeq >= UInt64(TM_EVENT_CAPACITY) { health.eventsDropped &+= 1 }
    eventSeq &+= 1
    health.eventsRecorded &+= 1
  }

  // MARK: Lifecycle + memory warning observers

  private func installObserversOnMain() {
    guard !observersInstalled else { return }
    observersInstalled = true
    #if os(iOS)
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let nc = NotificationCenter.default

      nc.addObserver(
        forName: UIApplication.didReceiveMemoryWarningNotification,
        object: nil, queue: nil
      ) { [weak self] _ in self?.onMemoryWarning() }

      nc.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil, queue: nil
      ) { [weak self] _ in self?.onPhase(TM_PHASE_ACTIVE, TMEventKind.didBecomeActive) }

      nc.addObserver(
        forName: UIApplication.willResignActiveNotification,
        object: nil, queue: nil
      ) { [weak self] _ in self?.onPhase(TM_PHASE_INACTIVE, TMEventKind.willResignActive) }

      nc.addObserver(
        forName: UIApplication.didEnterBackgroundNotification,
        object: nil, queue: nil
      ) { [weak self] _ in self?.onPhase(TM_PHASE_BACKGROUND, TMEventKind.didEnterBackground) }

      nc.addObserver(
        forName: UIApplication.willEnterForegroundNotification,
        object: nil, queue: nil
      ) { [weak self] _ in self?.onPhase(TM_PHASE_ACTIVE, TMEventKind.willEnterForeground) }

      nc.addObserver(
        forName: UIApplication.willTerminateNotification,
        object: nil, queue: nil
      ) { [weak self] _ in self?.onPhase(TM_PHASE_TERMINATING, TMEventKind.willTerminate) }

      // ⚠ THERMAL STATE ON CHANGE ONLY. Polling it would add a sampled field
      // that almost never moves; the notification carries the transition, which
      // is the only part that is evidence.
      nc.addObserver(
        forName: ProcessInfo.thermalStateDidChangeNotification,
        object: nil, queue: nil
      ) { [weak self] _ in
        self?.queue.async {
          guard let self = self, self.started else { return }
          self.recordEventLocked(
            kind: TMEventKind.thermalChange,
            code: UInt16(MemoryFlightRecorder.readThermal())
          )
        }
      }

      // Seed the phase from the application's own current state rather than
      // waiting for the first transition.
      let st = UIApplication.shared.applicationState
      let seeded: UInt8 = st == .active ? TM_PHASE_ACTIVE
        : (st == .background ? TM_PHASE_BACKGROUND : TM_PHASE_INACTIVE)
      self.queue.async {
        self.phase = seeded
        self.retimeLocked()
      }
    }
    #endif
  }

  private func onPhase(_ p: UInt8, _ kind: UInt16) {
    queue.async { [weak self] in
      guard let self = self, self.started else { return }
      self.phase = p
      self.recordEventLocked(kind: kind, code: UInt16(p))
      // ⚠ Leaving the foreground is the last reliable moment before a Jetsam
      // kill, so the checkpoint is written HERE as well as on a warning. A
      // process killed in the background never gets another chance to speak.
      if p == TM_PHASE_BACKGROUND || p == TM_PHASE_TERMINATING {
        self.writeCheckpointLocked(reason: kind)
      }
      self.retimeLocked()
    }
  }

  private func onMemoryWarning() {
    queue.async { [weak self] in
      guard let self = self, self.started else { return }
      self.health.memoryWarnings &+= 1
      self.recordEventLocked(
        kind: TMEventKind.memoryWarning,
        code: UInt16(truncatingIfNeeded: self.health.memoryWarnings)
      )
      self.writeCheckpointLocked(reason: TMEventKind.memoryWarning)
      // ⚠ A memory warning is the one moment worth the full 10 s of 100 ms
      // sampling: it is the OS telling us the interesting thing is happening
      // NOW, and the seconds either side of it are the only place a cause can
      // be distinguished from a coincidence.
      let now = MemoryFlightRecorder.uptimeMs()
      self.burstUntilMs = min(
        max(self.burstUntilMs, now &+ TM_BURST_MAX_MS),
        now &+ TM_BURST_MAX_MS
      )
      self.health.burstsStarted &+= 1
      self.retimeLocked()
    }
  }

  // MARK: Checkpoint

  private func writeCheckpointLocked(reason: UInt16) {
    let vm = MemoryFlightRecorder.readVM()
    let payload: [String: Any] = [
      "v": 1,
      "buildTag": buildTag,
      "reason": tmInt(reason),
      "wallMs": tmInt(UInt64(Date().timeIntervalSince1970 * 1000.0)),
      "sessionStartWallMs": tmInt(startWallMs),
      "uptimeMs": tmInt(MemoryFlightRecorder.uptimeMs() &- startUptimeMs),
      "footprint": tmInt(vm?.footprint ?? 0),
      "resident": tmInt(vm?.resident ?? 0),
      "residentPeak": tmInt(vm?.peak ?? 0),
      "available": tmInt(MemoryFlightRecorder.readAvailable()),
      "observedHighWater": tmInt(observedHighWater),
      "baseline": tmInt(baselineFootprint),
      "phase": tmInt(phase),
      "thermal": tmInt(MemoryFlightRecorder.readThermal()),
      "memoryWarnings": tmInt(health.memoryWarnings),
      "samplesTaken": tmInt(health.samplesTaken),
      "machFailures": tmInt(health.machFailures),
      "jsStaleSamples": tmInt(health.jsStaleSamples),
      "lastEvents": recentEventCodesLocked(),
    ]
    if MemoryCheckpointStore.shared.write(payload) {
      health.checkpointWrites &+= 1
    } else {
      health.checkpointFailures &+= 1
    }
  }

  /// The last 8 event kinds, as flat pairs. ⚠ Bounded on purpose: a checkpoint
  /// that grew with the session would be a file the next boot has to parse
  /// before it can tell us anything, and a Jetsam kill mid-write of a large
  /// file is exactly the corruption the two-slot scheme exists to survive.
  private func recentEventCodesLocked() -> [[String: Any]] {
    var out: [[String: Any]] = []
    let hi = eventSeq
    let want: UInt64 = 8
    let lo = hi > want ? hi &- want : 0
    var i = lo
    while i < hi {
      let e = events[Int(i % UInt64(TM_EVENT_CAPACITY))]
      out.append(["t": tmInt(e.t), "kind": tmInt(e.kind), "code": tmInt(e.code), "footprint": tmInt(e.footprint)])
      i &+= 1
    }
    return out
  }

  // MARK: Raw reads

  /// Milliseconds on a monotonic clock that does not run while the device is
  /// asleep stopping — `uptimeNanoseconds` is the documented monotonic source.
  static func uptimeMs() -> UInt64 {
    return DispatchTime.now().uptimeNanoseconds / 1_000_000
  }

  /// ⚠⚠ THE PRIMARY READ. task_info(TASK_VM_INFO) is the same source the
  /// kernel's own accounting uses, which is why phys_footprint here and the
  /// number in a jetsam report are comparable quantities.
  static func readVM() -> (footprint: UInt64, resident: UInt64, peak: UInt64)? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size
    )
    let kr = withUnsafeMutablePointer(to: &info) { ptr -> kern_return_t in
      ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { intPtr in
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), intPtr, &count)
      }
    }
    guard kr == KERN_SUCCESS else { return nil }
    return (
      UInt64(clamping: info.phys_footprint),
      UInt64(clamping: info.resident_size),
      UInt64(clamping: info.resident_size_peak)
    )
  }

  /// ⚠ NOT THE JETSAM THRESHOLD. See TMSample.available.
  static func readAvailable() -> UInt64 {
    #if os(iOS)
    let v = os_proc_available_memory()
    return v > 0 ? UInt64(clamping: v) : 0
    #else
    return 0
    #endif
  }

  /// ⚠⚠ THE DEFAULT ZONE ONLY. Enumerating every malloc zone walks allocator
  /// structures under their own locks and is explicitly out of scope; this is
  /// one lock, held briefly, at most once a second.
  static func readMallocZone() -> (inUse: UInt64, allocated: UInt64, blocks: UInt32) {
    var stats = malloc_statistics_t()
    malloc_zone_statistics(malloc_default_zone(), &stats)
    return (
      UInt64(clamping: stats.size_in_use),
      UInt64(clamping: stats.size_allocated),
      UInt32(clamping: stats.blocks_in_use)
    )
  }

  static func readThermal() -> UInt8 {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: return 0
    case .fair: return 1
    case .serious: return 2
    case .critical: return 3
    @unknown default: return 255
    }
  }
}

// MARK: - Event kinds owned by native

/// ⚠ Native owns only the kinds it raises itself. Everything the app annotates
/// — presentation, Qwen, native-ML, MiniLM, voice, persistence, Hermes — is
/// numbered in TypeScript, where the vocabulary is readable and tested. These
/// sit high enough to never collide with that range.
enum TMEventKind {
  static let recorderStart: UInt16 = 60000
  static let recorderStop: UInt16 = 60001
  static let memoryWarning: UInt16 = 60002
  static let didBecomeActive: UInt16 = 60003
  static let willResignActive: UInt16 = 60004
  static let didEnterBackground: UInt16 = 60005
  static let willEnterForeground: UInt16 = 60006
  static let willTerminate: UInt16 = 60007
  static let thermalChange: UInt16 = 60008
  static let metricKitPayload: UInt16 = 60009
}
