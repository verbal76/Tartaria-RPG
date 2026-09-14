// ⚠⚠ BUILD 190 — METRICKIT, AND IT IS SUPPLEMENTARY BY DESIGN.
//
// MetricKit is the OS's own memory accounting, delivered as a daily payload,
// and it is the one signal in this build that we cannot be accused of having
// measured wrong: peakMemoryUsage and averageSuspendedMemory come from iOS, not
// from our Mach reads. Where it agrees with the flight recorder it corroborates
// it; where it disagrees, that disagreement is itself the finding.
//
// ⚠⚠⚠ AND IT CANNOT BE THE PRIMARY INSTRUMENT, WHICH IS WHY THE RECORDER EXISTS
// AT ALL. MetricKit delivers ONCE A DAY, at a moment of the OS's choosing,
// summarising the previous 24 hours. It cannot tell us what memory was doing in
// the eight seconds before a freeze, it will not arrive at all on a device that
// has not met its delivery conditions, and on a fresh TestFlight install the
// first payload can be a full day away. A report section that is empty here
// means "iOS has not delivered a payload yet" and NEVER "memory was fine".
//
// ⚠ BOUNDED like everything else in this module: the last 4 payload summaries,
// scalars only, no diagnostic blobs retained.

import Foundation

#if canImport(MetricKit)
import MetricKit
#endif

final class MemoryMetricKitSubscriber: NSObject {

  static let shared = MemoryMetricKitSubscriber()

  private let queue = DispatchQueue(
    label: "com.hotatticgames.tartaria.memory-metrickit",
    qos: .utility
  )

  /// ⚠ FIXED. Four daily payloads is four days of OS-side corroboration, which
  /// is more history than any single investigation has ever needed, and it can
  /// never grow past that.
  private let maxPayloads = 4

  private var summaries: [[String: Any]] = []
  private var subscribed = false
  private var deliveries = 0

  private override init() { super.init() }

  @discardableResult
  func start() -> Bool {
    #if canImport(MetricKit) && os(iOS)
    var didSubscribe = false
    queue.sync {
      guard !subscribed else { return }
      subscribed = true
      didSubscribe = true
    }
    if didSubscribe {
      // ⚠ MXMetricManager insists on the main thread for registration.
      DispatchQueue.main.async {
        MXMetricManager.shared.add(self)
      }
    }
    return true
    #else
    return false
    #endif
  }

  func report() -> [String: Any] {
    return queue.sync {
      return [
        "subscribed": subscribed,
        "deliveries": deliveries,
        // ⚠ Say so explicitly rather than letting an empty array be read as a
        // clean bill of health.
        "note": summaries.isEmpty
          ? "NO PAYLOAD DELIVERED YET — iOS delivers MetricKit roughly daily. Empty means undelivered, not healthy."
          : "OS-side corroboration, roughly daily.",
        "payloads": summaries,
      ]
    }
  }
}

#if canImport(MetricKit) && os(iOS)
extension MemoryMetricKitSubscriber: MXMetricManagerSubscriber {

  func didReceive(_ payloads: [MXMetricPayload]) {
    // ⚠ Everything worth keeping is lifted to scalars HERE, on delivery. The
    // MXMetricPayload objects themselves are never retained — holding OS
    // diagnostic objects in a memory investigation would be its own joke.
    var lifted: [[String: Any]] = []
    for p in payloads {
      var row: [String: Any] = [:]
      row["begin"] = p.timeStampBegin.timeIntervalSince1970 * 1000.0
      row["end"] = p.timeStampEnd.timeIntervalSince1970 * 1000.0
      if let mem = p.memoryMetrics {
        row["peakMemoryBytes"] = mem.peakMemoryUsage.converted(to: .bytes).value
        row["avgSuspendedBytes"] =
          mem.averageSuspendedMemory.averageMeasurement.converted(to: .bytes).value
      }
      if let exits = p.applicationExitMetrics {
        let fg = exits.foregroundExitData
        let bg = exits.backgroundExitData
        // ⚠⚠ THE ONE FIELD THIS WHOLE SUBSCRIBER IS HERE FOR. A non-zero
        // memory-resource-limit exit is iOS stating, in its own accounting,
        // that it killed us for memory. That is the only evidence that can move
        // LIVE CLASS-H MEMORY CAUSATION off UNKNOWN, and it cannot be produced
        // by any instrument of ours.
        row["fgMemoryResourceLimitExits"] = fg.cumulativeMemoryResourceLimitExitCount
        row["bgMemoryResourceLimitExits"] = bg.cumulativeMemoryResourceLimitExitCount
        row["fgNormalExits"] = fg.cumulativeNormalAppExitCount
        row["bgNormalExits"] = bg.cumulativeNormalAppExitCount
        row["fgWatchdogExits"] = fg.cumulativeAppWatchdogExitCount
        row["bgWatchdogExits"] = bg.cumulativeAppWatchdogExitCount
      }
      lifted.append(row)
    }

    queue.async { [weak self] in
      guard let self = self else { return }
      self.deliveries += lifted.count
      self.summaries.append(contentsOf: lifted)
      // Deterministic eviction, oldest first — same discipline as every other
      // ring in this module.
      while self.summaries.count > self.maxPayloads {
        self.summaries.removeFirst()
      }
    }

    MemoryFlightRecorder.shared.annotate(
      kind: TMEventKind.metricKitPayload,
      code: UInt16(truncatingIfNeeded: lifted.count)
    )
  }

  /// ⚠ Diagnostics are acknowledged and DROPPED. MXDiagnosticPayload can carry
  /// crash and hang diagnostics with call stacks in them; lifting those would
  /// mean this module started retaining stack trees, which is exactly the
  /// unbounded shape every other line in Build 190 refuses. Sentry already owns
  /// crash reporting.
  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    // Intentionally empty. See the note above.
  }
}
#endif
