// ⚠⚠⚠ BUILD 190 — THE PRE-JETSAM CHECKPOINT.
//
// THE PROBLEM THIS SOLVES, AND IT IS THE WHOLE REASON THE FLIGHT RECORDER IS
// NOT ENOUGH ON ITS OWN. A Jetsam kill gives the process no notice, no
// unwind, no `applicationWillTerminate`, and no chance to flush anything. The
// in-memory rings — every sample, every annotation — die with the process. So
// the single most important trace we could ever capture, the one leading up to
// an actual memory death, is exactly the one that can never be reported by the
// session that recorded it.
//
// A checkpoint on disk is the only way that evidence survives its own process.
// The next boot reads it and the report says PREVIOUS LIFE.
//
// ⚠⚠ WHY TWO SLOTS AND A CHECKSUM, rather than one file written carefully.
// The moment we are most likely to be killed is the moment we are most likely
// to be writing: a memory warning fires, we write, and the kill lands during
// the write. `Data.write(options: .atomic)` writes to a temporary file and
// renames, which protects the OLD contents — but a rename that lands with a
// short or torn payload behind it, or a slot whose write never completed,
// leaves a file that parses to nonsense. Nonsense read as evidence is worse
// than no evidence: it would send the next investigation somewhere false.
//
// So: two slots, alternating, each carrying a CRC32 of its own payload and a
// sequence number. A reader validates both and takes the highest VALID one.
// Losing the newest checkpoint to a torn write costs us one interval; being
// unable to tell a torn write from a real reading would cost us the truth.
//
// ⚠ BOUNDED BY CONSTRUCTION. The payload is a fixed set of scalars plus at most
// eight event stubs. It does not grow with session length, and there is no path
// by which a caller can make it larger.

import Foundation

final class MemoryCheckpointStore {

  static let shared = MemoryCheckpointStore()

  private let queue = DispatchQueue(
    label: "com.hotatticgames.tartaria.memory-checkpoint",
    qos: .utility
  )

  private let magic = "TMCP1"

  /// ⚠⚠ CAPTURED ONCE, AT FIRST TOUCH, BEFORE THIS PROCESS HAS WRITTEN
  /// ANYTHING. This is the ordering the whole feature depends on: the moment we
  /// write our first checkpoint we have overwritten a slot belonging to the
  /// process that died, so the previous life must be lifted into memory before
  /// that can happen. Read once, cached forever, never re-read.
  private var previousLifeCache: [String: Any]??
  private var nextSeq: UInt64 = 1

  private init() {}

  private var directory: URL? {
    guard let base = FileManager.default.urls(
      for: .applicationSupportDirectory, in: .userDomainMask
    ).first else { return nil }
    let dir = base.appendingPathComponent("TartariaMemory", isDirectory: true)
    if !FileManager.default.fileExists(atPath: dir.path) {
      try? FileManager.default.createDirectory(
        at: dir, withIntermediateDirectories: true, attributes: nil
      )
    }
    return dir
  }

  private func slotURL(_ i: Int) -> URL? {
    return directory?.appendingPathComponent(i == 0 ? "flight-a.tmcp" : "flight-b.tmcp")
  }

  // MARK: Previous life

  /// The last valid checkpoint written by a PREVIOUS process, or nil.
  /// ⚠ Calling this is what pins the previous life in memory, so the recorder
  /// calls it during start — before any checkpoint of its own can be written.
  func previousLife() -> [String: Any]? {
    return queue.sync {
      if let cached = previousLifeCache { return cached }
      let found = readBestLocked()
      previousLifeCache = .some(found?.payload)
      // Continue the sequence rather than restarting it, so a later reader can
      // still order checkpoints across process boundaries.
      if let f = found { nextSeq = f.seq &+ 1 }
      return found?.payload
    }
  }

  // MARK: Write

  @discardableResult
  func write(_ payload: [String: Any]) -> Bool {
    // ⚠ Make sure the previous life is lifted before the first overwrite. This
    // is belt and braces — the recorder already reads it at start — but the
    // cost is one branch and the failure it prevents is silent and total.
    _ = previousLife()

    return queue.sync {
      let seq = nextSeq
      guard let url = slotURL(Int(seq % 2)) else { return false }
      guard JSONSerialization.isValidJSONObject(payload),
            let body = try? JSONSerialization.data(withJSONObject: payload, options: [])
      else { return false }

      let crc = MemoryCheckpointStore.crc32(body)
      // Header is fixed-width ASCII and carries everything needed to validate
      // the body without trusting the body: magic, CRC, sequence, byte count.
      let header = "\(magic) \(String(format: "%08x", crc)) \(seq) \(body.count)\n"
      guard var out = header.data(using: .utf8) else { return false }
      out.append(body)

      do {
        try out.write(to: url, options: [.atomic])
        nextSeq = seq &+ 1
        return true
      } catch {
        return false
      }
    }
  }

  // MARK: Read

  private struct Slot {
    let seq: UInt64
    let payload: [String: Any]
  }

  private func readBestLocked() -> Slot? {
    var best: Slot?
    for i in 0..<2 {
      guard let s = readSlotLocked(i) else { continue }
      if best == nil || s.seq > best!.seq { best = s }
    }
    return best
  }

  private func readSlotLocked(_ i: Int) -> Slot? {
    guard let url = slotURL(i),
          let raw = try? Data(contentsOf: url),
          raw.count > 8
    else { return nil }

    // Split on the first newline: header then body.
    guard let nl = raw.firstIndex(of: 0x0A) else { return nil }
    let headerData = raw.subdata(in: raw.startIndex..<nl)
    let body = raw.subdata(in: raw.index(after: nl)..<raw.endIndex)
    guard let header = String(data: headerData, encoding: .utf8) else { return nil }

    let parts = header.split(separator: " ")
    guard parts.count == 4, parts[0] == magic else { return nil }
    guard let crcExpected = UInt32(parts[1], radix: 16),
          let seq = UInt64(parts[2]),
          let len = Int(parts[3])
    else { return nil }

    // ⚠ THE THREE CHECKS THAT MAKE A TORN WRITE UNREADABLE RATHER THAN
    // PLAUSIBLE: the body must be exactly the promised length, its checksum
    // must match, and it must still parse as the object shape we wrote. A
    // payload that fails any of them is discarded in silence — the other slot
    // is there precisely for this.
    guard body.count == len else { return nil }
    guard MemoryCheckpointStore.crc32(body) == crcExpected else { return nil }
    guard let obj = try? JSONSerialization.jsonObject(with: body, options: []),
          let dict = obj as? [String: Any]
    else { return nil }

    return Slot(seq: seq, payload: dict)
  }

  // MARK: CRC32

  private static let crcTable: [UInt32] = {
    var table = [UInt32](repeating: 0, count: 256)
    for i in 0..<256 {
      var c = UInt32(i)
      for _ in 0..<8 {
        c = (c & 1) != 0 ? (0xEDB8_8320 ^ (c >> 1)) : (c >> 1)
      }
      table[i] = c
    }
    return table
  }()

  static func crc32(_ data: Data) -> UInt32 {
    var c: UInt32 = 0xFFFF_FFFF
    for b in data {
      c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8)
    }
    return c ^ 0xFFFF_FFFF
  }
}
