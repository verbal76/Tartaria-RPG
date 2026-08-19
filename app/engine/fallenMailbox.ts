// ⚠⚠ OTA-1362 — THE MAILBOX: automatic delivery for the shared roll.
//
// GOLEM LINE ONLY.
//
// Owner: *"I would like it to be automatic. how can we eliminate everything else
// but the two games?"* — the honest answer is that you cannot, and this file is
// where that constraint lives. Two phones on cell networks have no route to each
// other: carrier NAT, no stable address, no inbound path. Something has to sit
// in the middle. The only exceptions are same-WiFi and Bluetooth, which need
// native modules — a new APK, not an OTA — and only work in the same room.
//
// ⚠ BUT THE MIDDLE IS DUMB. It is not a game server and it holds no rules: it is
// a place to leave a file. Reads are a plain GET, writes a plain PUT. That maps
// onto a private repo, a static host, an object store, or a thirty-line worker,
// and swapping between them is a settings change, not a rewrite.
//
// ⚠⚠ AND IT IS OFF UNTIL A URL IS SET. Nothing here contacts anything until the
// player types a mailbox address in themselves. No default endpoint, no
// phone-home, no silent traffic on a build that never opted in.
//
// The shape is lifted from `updates/apkRelease.ts`, which has been doing exactly
// this for a year: one fetch, rate-limited, errors swallowed whole. That module
// is why this ships as an OTA at all — no native module, no new dependency, and
// a failure mode that can never reach the game thread.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildExportPayload,
  importPayloadText,
  cachedPaired,
  loadPaired,
  ensureInstallId,
  type ImportOutcome,
} from './fallenLedgerStore';

/** ⚠⚠ COMING SOON — owner's call, and the right one. The transport is built and
 *  tested, but it has no home yet: it wants a plain GET-to-read / PUT-to-write
 *  address, and the obvious candidate (a GitHub repo) cannot do the write half
 *  that way — reads come from raw.githubusercontent, writes go through the API
 *  with base64 content and the previous file's hash. Until that is settled,
 *  shipping the field would invite a player to type an address that silently
 *  never works, which is worse than not offering it.
 *
 *  Flipping this to true is the whole switch: the machinery below is complete
 *  and its suite runs against it either way. */
export const MAILBOX_ENABLED = false;
let ENABLED_OVERRIDE: boolean | null = null;
function mailboxEnabled(): boolean {
  return ENABLED_OVERRIDE ?? MAILBOX_ENABLED;
}
/** Lets the suite exercise the delivery machinery while the feature is dark. */
export function _setMailboxEnabledForTests(v: boolean | null): void { ENABLED_OVERRIDE = v; }

const CONFIG_KEY = 'tartaria.fallen.mailbox.v1';
/** The floor between automatic syncs. A death or a rest can ask for one sooner
 *  than this, but the heartbeat never beats faster. */
export const SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000;
/** A ledger is small — a few hundred KB at five houses — but a wrong URL could
 *  hand back anything, so the read is capped before it is parsed. */
export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export interface MailboxConfig {
  /** Base address. Empty = the mailbox is off and nothing is contacted. */
  url: string;
  /** Optional bearer token for writes. Read-only hosts need none. */
  token: string;
  /** Whether the heartbeat may run on its own. */
  auto: boolean;
}

const OFF: MailboxConfig = { url: '', token: '', auto: false };
let CONFIG: MailboxConfig | null = null;
let lastSyncAt = 0;
let inFlight: Promise<SyncOutcome> | null = null;

export async function loadMailboxConfig(): Promise<MailboxConfig> {
  if (CONFIG) return CONFIG;
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    const d: unknown = raw ? JSON.parse(raw) : null;
    if (typeof d === 'object' && d !== null) {
      const r = d as Record<string, unknown>;
      CONFIG = {
        url: typeof r.url === 'string' ? r.url.trim().slice(0, 300) : '',
        token: typeof r.token === 'string' ? r.token.trim().slice(0, 200) : '',
        auto: r.auto === true,
      };
    } else { CONFIG = { ...OFF }; }
  } catch { CONFIG = { ...OFF }; }
  return CONFIG;
}

export function cachedMailboxConfig(): MailboxConfig {
  if (CONFIG === null) { CONFIG = { ...OFF }; void loadMailboxConfig(); }
  return CONFIG;
}

export async function setMailboxConfig(next: Partial<MailboxConfig>): Promise<MailboxConfig> {
  const cur = await loadMailboxConfig();
  const merged: MailboxConfig = {
    url: (next.url ?? cur.url).trim().slice(0, 300),
    token: (next.token ?? cur.token).trim().slice(0, 200),
    auto: next.auto ?? cur.auto,
  };
  CONFIG = merged;
  try { await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(merged)); } catch { /* memory-only this run */ }
  return merged;
}

export function _setMailboxForTests(c: MailboxConfig | null, lastAt = 0): void {
  CONFIG = c;
  lastSyncAt = lastAt;
  inFlight = null;
}

/** ⚠ Only http(s), and never a bare host we invented. A typo'd URL should fail
 *  as a refusal we can show the player, not as a mystery request. */
function validUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

function boxUrl(base: string, installId: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}/${encodeURIComponent(installId)}.json`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  // AbortController exists in RN and in jest's environment; guard anyway so a
  // missing implementation degrades to "no timeout" instead of throwing.
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try { controller = new AbortController(); } catch { controller = null; }
  try {
    if (controller) timer = setTimeout(() => controller?.abort(), FETCH_TIMEOUT_MS);
    return await fetch(url, controller ? { ...init, signal: controller.signal } : init);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface SyncOutcome {
  ran: boolean;
  reason?: 'coming-soon' | 'off' | 'bad-url' | 'too-soon' | 'no-houses';
  pushed: boolean;
  pulled: number;
  failed: number;
  imported: ImportOutcome[];
}

const IDLE: SyncOutcome = { ran: false, pushed: false, pulled: 0, failed: 0, imported: [] };

/** ⚠⚠ ONE ROUND OF DELIVERY: leave our dead in the box, then read every house we
 *  ride with. Every failure is swallowed — a mailbox that is down, a phone with
 *  no signal, or a URL that has rotted must cost the sync and nothing else. The
 *  game never learns this ran. */
export async function syncNow(opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  const run = (async (): Promise<SyncOutcome> => {
    // Dark until it has somewhere to live. Nothing is contacted, nothing leaks.
    if (!mailboxEnabled()) return { ...IDLE, reason: 'coming-soon' };
    const cfg = await loadMailboxConfig();
    if (!cfg.url) return { ...IDLE, reason: 'off' };
    if (!validUrl(cfg.url)) return { ...IDLE, reason: 'bad-url' };
    if (!opts.force && Date.now() - lastSyncAt < SYNC_MIN_INTERVAL_MS) return { ...IDLE, reason: 'too-soon' };
    const paired = (await loadPaired()).slice(0, 24);
    lastSyncAt = Date.now();

    const out: SyncOutcome = { ran: true, pushed: false, pulled: 0, failed: 0, imported: [] };

    // ---- push: our own dead, sealed ----------------------------------------
    try {
      const installId = await ensureInstallId();
      const payload = await buildExportPayload();
      const res = await fetchWithTimeout(boxUrl(cfg.url, installId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        },
        body: payload,
      });
      out.pushed = !!res && res.ok;
      if (res && !res.ok) out.failed += 1;
      if (!res) out.failed += 1;
    } catch { out.failed += 1; }

    // ---- pull: every house we ride with ------------------------------------
    if (paired.length === 0) return out;
    for (const h of paired) {
      try {
        const res = await fetchWithTimeout(boxUrl(cfg.url, h.installId), {
          method: 'GET',
          headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {},
        });
        if (!res || !res.ok) { out.failed += 1; continue; }
        const text = await res.text();
        if (!text || text.length > MAX_PAYLOAD_BYTES) { out.failed += 1; continue; }
        // ⚠ Straight into the same door a pasted payload uses: seal check,
        // pairing gate, validator, merge. The mailbox gets no shortcuts.
        out.imported.push(await importPayloadText(text));
        out.pulled += 1;
      } catch { out.failed += 1; }
    }
    return out;
  })();
  inFlight = run;
  try { return await run; } finally { inFlight = null; }
}

/** The heartbeat: safe to call as often as you like — boot, a death, a rest,
 *  a screen opening. It declines quietly unless auto is on and the floor has
 *  passed. */
export function maybeAutoSync(): void {
  if (!mailboxEnabled()) return;
  const cfg = cachedMailboxConfig();
  if (!cfg.auto || !cfg.url) return;
  if (Date.now() - lastSyncAt < SYNC_MIN_INTERVAL_MS) return;
  if (cachedPaired().length === 0) return;
  void syncNow().catch(() => { /* the mailbox never reaches the game thread */ });
}
