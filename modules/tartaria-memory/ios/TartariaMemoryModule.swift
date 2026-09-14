// ⚠⚠ BUILD 190 — THE JS DOOR ONTO THE FLIGHT RECORDER.
//
// This file is a bridge and nothing else. It holds no state, makes no
// decisions, and performs no measurement of its own: every function here
// forwards to MemoryFlightRecorder and returns what it is given. Keeping the
// bridge empty is deliberate — the recorder is testable as one object with one
// queue, and a bridge that started caching or interpreting would be a second
// place for the truth to live.
//
// ⚠ EVERY DOOR IS SAFE TO CALL ON A DEVICE WHERE NOTHING IS RUNNING. `start`
// twice is a no-op, `annotate` before `start` is dropped, `drain` on an empty
// recorder returns empty arrays. An instrument whose API can throw into the
// caller is an instrument that eventually takes the app down with it, and this
// one is being installed specifically to investigate a crash.

import ExpoModulesCore

public class TartariaMemoryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TartariaMemory")

    // ⚠ `Function`, not `AsyncFunction`, for the hot doors. These are called
    // from game seams — a generation settling, a scene presenting — and a
    // promise per annotation would put microtask traffic on the JS thread at
    // exactly the moments we are trying to measure. They are safe as sync calls
    // precisely because none of them does Mach work inline: each one reads a
    // clock and hands off to the recorder's own queue.

    Function("start") { () -> Bool in
      MemoryFlightRecorder.shared.start()
      return true
    }

    Function("stop") { () -> Bool in
      MemoryFlightRecorder.shared.stop()
      return true
    }

    Function("annotate") { (kind: Int, code: Int) -> Void in
      MemoryFlightRecorder.shared.annotate(
        kind: UInt16(truncatingIfNeeded: kind),
        code: UInt16(truncatingIfNeeded: code)
      )
    }

    Function("heartbeat") { () -> Void in
      MemoryFlightRecorder.shared.heartbeat()
    }

    Function("beginBurst") { (ms: Int) -> Void in
      MemoryFlightRecorder.shared.beginBurst(ms: ms <= 0 ? 0 : UInt64(ms))
    }

    Function("setBuildTag") { (tag: String) -> Void in
      MemoryFlightRecorder.shared.setBuildTag(tag)
    }

    // ⚠ The reading doors are Async. They take the recorder's queue
    // synchronously inside, and a report composition is not a hot path — so the
    // one thing worth protecting here is the JS thread, which an AsyncFunction
    // leaves alone while the queue is busy sampling.

    AsyncFunction("snapshot") { () -> [String: Any] in
      return MemoryFlightRecorder.shared.snapshotNow()
    }

    AsyncFunction("health") { () -> [String: Any] in
      return MemoryFlightRecorder.shared.healthDict()
    }

    /// ⚠⚠ FREEZE THEN DRAIN. Returns the two sequence marks as of now; the
    /// caller passes them straight back to `drain`, and everything the recorder
    /// writes in between is simply not in this report. The recorder is never
    /// paused — a report must not be able to blind the instrument that is
    /// producing it.
    AsyncFunction("freeze") { () -> [String: Any] in
      let f = MemoryFlightRecorder.shared.freeze()
      return [
        "sampleSeq": Int(clamping: f.sampleSeq),
        "eventSeq": Int(clamping: f.eventSeq),
      ]
    }

    AsyncFunction("drain") { (sampleUpTo: Int, eventUpTo: Int) -> [String: Any] in
      return MemoryFlightRecorder.shared.drain(
        sampleUpTo: sampleUpTo < 0 ? 0 : UInt64(sampleUpTo),
        eventUpTo: eventUpTo < 0 ? 0 : UInt64(eventUpTo)
      )
    }

    /// ⚠ The checkpoint written by the process that DIED. Null on a first
    /// install, after a clean uninstall, or when both slots failed validation —
    /// and null must be read as "no previous life on record", never as "the
    /// previous life was fine".
    AsyncFunction("previousLife") { () -> [String: Any]? in
      return MemoryCheckpointStore.shared.previousLife()
    }

    /// Supplementary only. See MemoryMetricKitSubscriber for why this can be
    /// empty on a perfectly healthy device.
    AsyncFunction("metricKit") { () -> [String: Any] in
      return MemoryMetricKitSubscriber.shared.report()
    }

    Function("startMetricKit") { () -> Bool in
      return MemoryMetricKitSubscriber.shared.start()
    }
  }
}
