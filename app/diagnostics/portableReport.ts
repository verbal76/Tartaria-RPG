// OTA-1882 — THE PASTE FITS IN THE WINDOW (#214).
//
// The owner's title screen offered `CRASHED SAVE CAPTURED · screen-render · 60m
// ago · 420072 bytes` with a COPY CRASHED SAVE button. He pressed it and could
// not paste the result anywhere. This file is the budget that was missing.
//
// ⚠⚠⚠ WHAT WAS ACTUALLY WRONG, MEASURED AND NOT GUESSED. A real COPY export off
// his own device (`player-log_2026-08-25T02-07-26…/save.json`, 59,818 UTF-8
// bytes) is 95.9% ONE `JSON.stringify({ player, worldMemory })` call. Inside that
// blob the growth is concentrated, and it is all legitimate play:
//
//     player.inventory            21,372 B  37.3%   71 items
//     worldMemory.visitedRooms    10,598 B  18.5%   18 rooms
//     worldMemory.worldEvents      8,629 B  15.0%   50 events
//     worldMemory.recentRaids      2,614 B   4.6%   12 raids
//     worldMemory.patrols          2,076 B   3.6%   25 patrols
//
// Nothing there is a leak. The defect is that the EXPORT had no bound, in a
// codebase where every sibling diagnostic path does: LOG_CHARS_CAP 40,000 for the
// email paste, FULL_LOG_CHARS_CAP 200,000 for the Sentry push,
// INVENTORY_CHARS_CAP 12,000 for the pack listing, LOG_ATTACHMENT_MAX_CHARS
// 800,000 for the attachment, CRASH_LEDGER_CAP 10 for the ledger. The owner-facing
// clipboard was the only export with no ceiling at all.
//
// ⚠⚠ THE RETAINED ARTIFACT IS NOT TOUCHED, AND THAT IS THE POINT. `raw` in
// `@tartaria/lastCrashSave` stays byte-for-byte what crashed, because it is the
// recovery evidence — a save that bricks the app can never be loaded, so those
// bytes are the only way the brick reaches us (OTA-341/343). This file bounds the
// PASTE, never the evidence. And the full relayed evidence is already independent
// and already working: the owner's own log recorded `game log pushed
// automatically, delivered to Sentry, #mufzsk25hsud cleared from disk`. So the
// compact report does not have to CARRY the state — it has to NAME it, which is
// what `crashCorrelation.ts` is for.
//
// ⚠ BYTES, NOT CHARACTERS, AND THE NOTICES COUNT AGAINST THE BUDGET. A
// `.slice(0, N)` on characters is not a byte guarantee — one emoji is four UTF-8
// bytes and a `.length` of two — and a budget that is computed and then appended
// to is not a budget. Everything here measures UTF-8 and every truncation notice
// is paid for out of the same allowance it announces.

/**
 * The hard ceiling for a pasteable owner report, in UTF-8 bytes.
 *
 * ⚠ CHOSEN FROM THE PROJECT'S OWN PRECEDENT, not invented. `LOG_CHARS_CAP` has
 * been 40,000 since OTA-1792 for exactly this job — the human paste — while the
 * machine paths got their own larger caps ("the email paste stays 40k"). There is
 * no universal third-party limit to appeal to, so this is a project-owned
 * portability budget that matches the one the project already trusted, expressed
 * in bytes because that is what a byte-sensitive destination counts.
 */
export const PORTABLE_REPORT_MAX_BYTES = 40_000;

/** UTF-8 length without a TextEncoder, which is not guaranteed on every engine
 *  this ships to. Iterating with `for…of` walks CODE POINTS, so a surrogate pair
 *  is counted once as the 4-byte character it is rather than twice as 3. */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Cut a string to at most `maxBytes` UTF-8 bytes WITHOUT splitting a character.
 *  Accumulates whole code points, so the result is always valid text — a
 *  byte-index slice would happily halve a multi-byte character and hand the
 *  clipboard a replacement glyph. */
export function truncateToBytes(s: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (utf8Bytes(s) <= maxBytes) return s;
  let out = '';
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const w = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (n + w > maxBytes) break;
    out += ch;
    n += w;
  }
  return out;
}

/** A block of report text and how badly we want to keep it.
 *  1 — identity and the crash itself. Never dropped.
 *  2 — immediate context: what the player was doing, app state.
 *  3 — recent history worth having.
 *  4 — older context, first to go. */
export interface ReportBlock {
  priority: 1 | 2 | 3 | 4;
  /** Short name used in the omission notice when this block does not fit. */
  label: string;
  text: string;
}

export interface AssembledReport {
  text: string;
  /** Labels of blocks that did not fit, highest priority number first. */
  omittedLabels: string[];
  bytes: number;
}

const OMIT_HEADER = '--- PORTABLE REPORT TRUNCATED ---';

/**
 * Assemble blocks into a report guaranteed to be `<= maxBytes` UTF-8 bytes.
 *
 * Priority 1 is never dropped. Lower priorities are admitted in order while they
 * fit, and anything left out is named in an explicit notice that is itself
 * reserved for BEFORE the admissions are made — so the notice can never be the
 * thing that pushes the payload over. The last resort, if Priority 1 alone
 * exceeds the budget, is to cut the final Priority-1 block with its own marker
 * rather than silently lose the crash.
 */
export function assemblePortableReport(
  blocks: readonly ReportBlock[],
  maxBytes: number = PORTABLE_REPORT_MAX_BYTES,
): AssembledReport {
  const p1 = blocks.filter((b) => b.priority === 1);
  const rest = blocks.filter((b) => b.priority !== 1).sort((a, b) => a.priority - b.priority);

  // Worst-case notice: every non-P1 block named. Reserved up front so admitting
  // blocks can never be undone by the notice that describes the omissions.
  const worstNotice = renderNotice(rest.map((b) => b.label));
  const noticeReserve = utf8Bytes(worstNotice) + 1;

  const kept: string[] = [];
  let used = 0;
  for (const b of p1) {
    const piece = b.text;
    const cost = utf8Bytes(piece) + (kept.length ? 1 : 0);
    if (used + cost <= maxBytes) {
      kept.push(piece);
      used += cost;
      continue;
    }
    // ⚠ Pathological: the crash's own identity does not fit. Keep as much as the
    // budget allows and say so — losing the error silently would defeat the whole
    // report. In practice only a monstrous component stack reaches this. The
    // marker's own cost is measured, not estimated: guessing it is how a cap ends
    // up one byte over, which is still over.
    const marker = '\n[cut: block over budget]';
    const room = maxBytes - used - (kept.length ? 1 : 0) - utf8Bytes(marker);
    if (room > 0) {
      kept.push(`${truncateToBytes(piece, room)}${marker}`);
      used = maxBytes;
    }
    break;
  }

  const omitted: string[] = [];
  for (const b of rest) {
    const cost = utf8Bytes(b.text) + 1;
    if (used + cost + noticeReserve <= maxBytes) {
      kept.push(b.text);
      used += cost;
    } else {
      omitted.push(b.label);
    }
  }

  // ⚠⚠ THE NOTICE HAS TO FIT TOO. The reserve above is the WORST case, so on a
  // tight budget even the notice can be unaffordable — and appending it anyway is
  // exactly how a computed cap leaks (measured at 345 against a 300 budget before
  // this loop existed). The full notice is tried first, then a one-line form.
  if (omitted.length > 0) {
    const short = `${OMIT_HEADER} ${omitted.length} section(s) omitted for size; `
      + 'the full crashed save is retained on the device.';
    for (const notice of [renderNotice(omitted), short]) {
      if (used + utf8Bytes(notice) + 1 <= maxBytes) {
        kept.push(notice);
        used += utf8Bytes(notice) + 1;
        break;
      }
    }
  }

  // ⚠⚠⚠ THE LAST LINE OF DEFENCE, and it is unconditional. Everything above is
  // careful arithmetic; this is the guarantee. If any path ever miscounts, the
  // returned string is still within budget, because the caller's promise to the
  // clipboard is a hard ceiling and not a best effort.
  let text = kept.join('\n');
  if (utf8Bytes(text) > maxBytes) text = truncateToBytes(text, maxBytes);
  return { text, omittedLabels: omitted, bytes: utf8Bytes(text) };
}

function renderNotice(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  return [
    OMIT_HEADER,
    `omitted for size (${labels.length}): ${labels.join(', ')}`,
    'The FULL crashed save is still retained on the device, and the full diagnostic',
    'bundle was pushed to Sentry independently. Quote the correlation id above to',
    'pull the complete evidence.',
  ].join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
// STATE EVIDENCE — BOUNDED STRUCTURALLY, NOT BY CUTTING A JSON STRING
// ════════════════════════════════════════════════════════════════════════════

/** How a collection's meaning decides which members survive.
 *  `chronological` — ordered history; the NEWEST entries are the informative
 *  ones, so keep the tail.
 *  `current` — a live picture (what is in the pack, where patrols are). A tail
 *  would misrepresent it, so these are projected (bulky prose dropped, every
 *  member's identity kept) and only counted down as a last resort. */
type CollectionKind = 'chronological' | 'current';

/** Measured against real owner state; see the header table. `hour`-stamped
 *  ascending lists are history, the rest are a snapshot of now. */
const COLLECTION_SEMANTICS: Record<string, CollectionKind> = {
  'player.inventory': 'current',
  'worldMemory.visitedRooms': 'current',
  'worldMemory.patrols': 'current',
  'worldMemory.worldEvents': 'chronological',
  'worldMemory.recentRaids': 'chronological',
  'worldMemory.npcTranscripts': 'chronological',
  'worldMemory.memorableEvents': 'chronological',
};

export function collectionKind(path: string): CollectionKind {
  return COLLECTION_SEMANTICS[path] ?? 'chronological';
}

/** Per-item fields that are prose rather than state. Dropping them keeps every
 *  item's IDENTITY — which is what a reader needs to understand the pack — while
 *  shedding the bulk. Labelled in the output, never passed off as complete. */
const PROSE_FIELDS = ['description', 'flavor', 'flavour', 'searchedAmbientNouns', 'text'];

interface BoundedCollection {
  lines: string[];
  original: number;
  retained: number;
}

function boundList(path: string, list: readonly unknown[], keep: number): BoundedCollection {
  const kind = collectionKind(path);
  const original = list.length;
  const slice = kind === 'chronological' ? list.slice(-keep) : list.slice(0, keep);
  const lines = slice.map((entry) => JSON.stringify(project(entry)));
  return { lines, original, retained: slice.length };
}

function project(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object') return entry;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
    if (PROSE_FIELDS.includes(k)) continue;
    out[k] = v && typeof v === 'object' ? '[object]' : v;
  }
  return out;
}

/**
 * Render one collection as report text that can never be mistaken for the whole
 * thing: the counts are always stated, and a partial rendering says so on its
 * own line before the entries.
 */
export function renderBoundedCollection(
  path: string,
  value: unknown,
  keep: number,
): string | null {
  const kind = collectionKind(path);
  if (Array.isArray(value)) {
    const { lines, original, retained } = boundList(path, value, keep);
    const head = retained < original
      ? `${path}: PARTIAL — ${original} total, ${retained} shown, ${original - retained} omitted `
        + `(${kind === 'chronological' ? 'newest kept' : 'first kept; this is a current-state list, not history'})`
      : `${path}: ${original} total, all shown${original > 0 ? ' (prose fields omitted)' : ''}`;
    return [head, ...lines].join('\n');
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const shown = keys.slice(0, keep);
    const head = shown.length < keys.length
      ? `${path}: PARTIAL — ${keys.length} keys, ${shown.length} shown, ${keys.length - shown.length} omitted`
      : `${path}: ${keys.length} keys, all shown (prose fields omitted)`;
    const rows = shown.map((k) => `${k}: ${JSON.stringify(project((value as Record<string, unknown>)[k]))}`);
    return [head, ...rows].join('\n');
  }
  return null;
}
