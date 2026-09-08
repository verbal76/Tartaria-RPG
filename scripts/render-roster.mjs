/* ⚠⚠⚠ PHOTOGRAPH THE REAL ROSTER — the check OTA-1756 exists because nobody had.
 *
 * A mock-up built from the implementation's own assumed card ratios is not a
 * check, it is an echo: the pictures that were supposed to validate the roster
 * watermark were drawn at 595x101.5 and 595x350, exactly the 340/58 and 340/200
 * the code assumed, so they could only ever agree with it. This loads the ACTUAL
 * bundle, lets the ACTUAL layout engine size the ACTUAL cards, and reports the
 * geometry it finds — card box, emblem box, where the artwork's focus landed,
 * how much of the card the column covers, and whether it bleeds any edge.
 *
 *   npm run export:web:harness           # build (see below)
 *   node scripts/render-roster.mjs out 411x915 [expandIndex]
 *
 * ⚠ IT NEEDS A HARNESS BUILD, and one substitution, which is declared rather
 * than hidden: metro.config.js swaps app/state/gameStore for
 * web-harness/gameStoreStub.js when TARTARIA_WEB_HARNESS=1. The web line cannot
 * currently boot the real store — a module-init cycle throws "Cannot access
 * 'FRESH_ENEMY_ARRAYS' before initialization" — which is a separate defect,
 * deliberately not fixed inside a geometry pass. The store has no bearing on
 * card geometry: the cards are sized by the real stylesheet and the real layout
 * engine either way.
 *
 *   TARTARIA_WEB_HARNESS=1 npx expo export --platform web --no-minify \
 *     --output-dir scratchpad/webbuild3 --clear
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import WebSocket from 'ws';

// The harness build. Override with TARTARIA_WEB_BUILD when it lives elsewhere.
const ROOT = process.env.TARTARIA_WEB_BUILD ?? path.resolve('scratchpad/webbuild3');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outPrefix, dims, expandIdx] = process.argv.slice(2);
/** Which screen to open. `--screen=contracts` etc.; defaults to the roster. */
const SCREEN = (process.argv.find((a) => a.startsWith('--screen=')) ?? '--screen=title').slice(9);
const [VW, VH] = (dims ?? '411x915').split('x').map(Number);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const profile = fs.mkdtempSync('/tmp/chrome-prof-');
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--hide-scrollbars', '--force-device-scale-factor=2',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('chrome never printed a ws url')), 30000);
  chrome.stderr.on('data', (d) => {
    buf += d;
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) { clearTimeout(t); resolve(m[0]); }
  });
});

let id = 0;
const pending = new Map();
const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.once('open', r));
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Log.enable');
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.method === 'Runtime.consoleAPICalled') {
    console.error('[console.' + m.params.type + ']',
      m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 400));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.error('[EXCEPTION]', (d.exception && (d.exception.description || d.exception.value)) || d.text);
  }
  if (m.method === 'Log.entryAdded') {
    console.error('[log.' + m.params.entry.level + ']', String(m.params.entry.text).slice(0, 300));
  }
});
await S('Emulation.setDeviceMetricsOverride', {
  width: VW, height: VH, deviceScaleFactor: 2, mobile: true,
});

const now = Date.now();
const slots = [
  { playerName: 'Johnny Blaze', factionId: 'tartarian_revivalists', raceId: 'tartarian_giant',
    locationId: 'great_tartary_plains', hp: 78, hpMax: 96, mainQuestPhase: 'cores',
    mainQuestCoresRecovered: 2 },
  { playerName: 'Cheddar Bob', factionId: 'mud_monarchs', raceId: 'mud_dweller',
    locationId: 'asgardar', hp: 41, hpMax: 62, mainQuestPhase: 'revelation' },
  { playerName: 'Great Scott', factionId: 'stone_builders', raceId: 'architectural_sentinel',
    locationId: 'grand_spire_of_etheria', hp: 120, hpMax: 120, mainQuestPhase: 'descent' },
].map((s, i) => ({
  ...s,
  slotId: `slot_fixture_${i}`,
  characterSeed: `${s.playerName}|${s.raceId}|${s.factionId}|${now - i * 86400000}`,
  savedAt: now - i * 3600000 * 7,
  createdAt: now - i * 86400000 * 9,
}));

// Seed on the app's own origin, then load the app for real.
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
await new Promise((r) => setTimeout(r, 1500));
await S('Runtime.evaluate', {
  expression: `localStorage.setItem('tartaria.slots.index.v2', ${JSON.stringify(JSON.stringify(slots))});
               localStorage.setItem('@tartaria/crashNoticeSeen','true');
               localStorage.setItem('@tartaria/crashReporting','1');
               localStorage.setItem('harness.screen', ${JSON.stringify(SCREEN)}); 'ok'`,
});
await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

// Wait for the roster to actually paint a card, rather than a fixed sleep.
const deadline = Date.now() + (SCREEN === 'title' ? 60000 : 25000);
let ready = SCREEN !== 'title';
while (!ready && Date.now() < deadline) {
  const { result } = await S('Runtime.evaluate', {
    expression: `(() => { const t = document.body ? document.body.innerText : '';
                 return t.includes('Johnny Blaze') ? 'yes' : t.slice(0, 80); })()`,
    returnByValue: true,
  });
  if (result.value === 'yes') { ready = true; break; }
  await new Promise((r) => setTimeout(r, 700));
}
if (!ready) console.error('!! roster never rendered — screenshot will show whatever is there');

// Clear boot/first-run overlays. Precise coordinate clicks — an earlier
// version walked up parents clicking as it went and opened random dialogs.
for (let pass = 0; pass < 10; pass++) {
  const { result: hit } = await S('Runtime.evaluate', {
    expression: `(() => {
      const WANT = /^(TAP TO CONTINUE|KEEP ON|CANCEL|GOT IT|SKIP|CLOSE|DISMISS)$/i;
      for (const e of document.querySelectorAll('div,span,button')) {
        if (e.children.length) continue;
        const t = (e.textContent || '').trim();
        if (!WANT.test(t)) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        return JSON.stringify({ t, x: r.x + r.width / 2, y: r.y + r.height / 2 });
      }
      return '';
    })()`,
    returnByValue: true,
  });
  if (!hit.value) break;
  const { t, x, y } = JSON.parse(hit.value);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await S('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  console.error('dismissed:', t);
  await new Promise((r) => setTimeout(r, 600));
}

const NAMES = ['Johnny Blaze', 'Cheddar Bob', 'Great Scott', 'Tall Case'];
if (expandIdx !== undefined) {
  const want = NAMES[Number(expandIdx)];
  // Fire on the ROLE=BUTTON ancestor of the name, with a full pointer sequence.
  // React's delegated listeners do not care that the events are untrusted, and
  // this reaches the Touchable through SwipeableRow's PanResponder.
  const { result: t } = await S('Runtime.evaluate', {
    expression: '(() => {'
      + 'const want = ' + JSON.stringify(want) + ';'
      + 'let leaf = null;'
      + 'for (const e of document.querySelectorAll("div,span")) {'
      + '  if (!e.children.length && (e.textContent || "").trim() === want) { leaf = e; break; }'
      + '}'
      + 'if (!leaf) return "no leaf";'
      + 'let btn = leaf;'
      + 'while (btn && btn.getAttribute("role") !== "button") btn = btn.parentElement;'
      + 'if (!btn) return "no button ancestor";'
      + 'const r = btn.getBoundingClientRect();'
      + 'const x = r.x + r.width / 2, y = r.y + r.height / 2;'
      + 'const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 };'
      + 'btn.dispatchEvent(new PointerEvent("pointerdown", opt));'
      + 'btn.dispatchEvent(new MouseEvent("mousedown", opt));'
      + 'btn.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, opt, { buttons: 0 })));'
      + 'btn.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, opt, { buttons: 0 })));'
      + 'btn.click();'
      + 'return "fired on " + (btn.getAttribute("aria-label") || btn.className).slice(0, 40);'
      + '})()',
    returnByValue: true,
  });
  console.error('expand:', t.value);
  await new Promise((r) => setTimeout(r, 1500));
}

/* ⚠ OTA-1759 — `--tap=LABEL`, REPEATABLE. The roster's cards were the only thing
 * the harness could reach, so any row, tab or state behind a control was
 * invisible to it — and the list rows this pass is about live behind a TAB. Same
 * untrusted-event trick as the card expand above; React's delegated listeners do
 * not care. Matching is on the leaf's exact text, so `--tap=REPAIR` finds the
 * tab and not the word inside a row. */
for (const arg of process.argv.filter((a) => a.startsWith('--tap='))) {
  const label = arg.slice(6);
  const { result: t } = await S('Runtime.evaluate', {
    expression: '(() => {'
      + 'const want = ' + JSON.stringify(label) + ';'
      + 'let leaf = null;'
      + 'for (const e of document.querySelectorAll("div,span")) {'
      + '  if (!e.children.length && (e.textContent || "").trim() === want) { leaf = e; break; }'
      + '}'
      + 'if (!leaf) return "no leaf for " + want;'
      + 'let btn = leaf;'
      + 'while (btn && btn.getAttribute("role") !== "button") btn = btn.parentElement;'
      + 'btn = btn || leaf;'
      + 'const r = btn.getBoundingClientRect();'
      + 'const x = r.x + r.width / 2, y = r.y + r.height / 2;'
      + 'const opt = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 };'
      + 'btn.dispatchEvent(new PointerEvent("pointerdown", opt));'
      + 'btn.dispatchEvent(new MouseEvent("mousedown", opt));'
      + 'btn.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, opt, { buttons: 0 })));'
      + 'btn.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, opt, { buttons: 0 })));'
      + 'btn.click();'
      + 'return "tapped " + want;'
      + '})()',
    returnByValue: true,
  });
  console.error('tap:', t.value);
  await new Promise((r) => setTimeout(r, 1200));
}

await new Promise((r) => setTimeout(r, 3000));

const { result: probe } = await S('Runtime.evaluate', {
  expression: `(() => {
    const r = (e) => { const b = e.getBoundingClientRect();
      return [Math.round(b.x*10)/10, Math.round(b.y*10)/10, Math.round(b.width*10)/10, Math.round(b.height*10)/10]; };
    const out = [];
    for (const e of document.querySelectorAll('div,span')) {
      const t = (e.textContent || '').trim();
      const leaf = ![...e.children].some((c) => (c.textContent || '').trim() === t);
      if (leaf && /^(← BACK|CONTRACTS|ACTIONS)$/.test(t)) {
        const cs = getComputedStyle(e);
        out.push({ t, box: r(e), color: cs.color, size: cs.fontSize,
                   spacing: cs.letterSpacing, weight: cs.fontWeight });
        const btn = e.parentElement;
        if (t === '← BACK' && btn) {
          const b = getComputedStyle(btn);
          out.push({ t: 'backBtn', box: r(btn), bg: b.backgroundColor,
                     border: b.borderTopColor + ' ' + b.borderTopWidth,
                     radius: b.borderTopLeftRadius, pad: b.paddingTop + '/' + b.paddingLeft });
        }
      }
    }
    return JSON.stringify(out, null, 1);
  })()`,
  returnByValue: true,
});
console.log(probe.value);

/* ⚠ OTA-1759 — THE ROW PROBE. `--probe=rows` reports every element painted on
 * the list ground (#13110f = rgb(19,17,15)) with the declarations the chassis
 * owns. That is the before/after check for TRow: a chassis that reproduced the
 * shipped values in the STYLESHEET but composed wrong at the CALL SITE would
 * pass every unit test and still move the screen. OTA-1758 proved that risk is
 * not theoretical — its "nothing moves" claim was false, and only the render
 * said so. */
const ROW = (process.argv.find((a) => a.startsWith('--row=')) ?? '--row=Rusted Blade').slice(6);
if (process.argv.includes('--probe=rows')) {
  const { result: rows } = await S('Runtime.evaluate', {
    expression: `(() => {
      const r = (e) => { const b = e.getBoundingClientRect();
        return [Math.round(b.x*10)/10, Math.round(b.y*10)/10, Math.round(b.width*10)/10, Math.round(b.height*10)/10]; };
      const out = [];
      /* The row is the pressable itself (or, for Vendor's three non-pressable
       * rows, the outermost box carrying the list ground). Match on the row's
       * own text and take the SMALLEST match, so an ancestor scroll view whose
       * textContent happens to start with the same words is not mistaken for it. */
      const want = ${JSON.stringify(ROW)};
      for (const e of document.querySelectorAll('div')) {
        const t = (e.textContent || '').trim();
        if (!t.includes(want)) continue;
        const c = getComputedStyle(e);
        out.push({ box: r(e), bg: c.backgroundColor, cls: (e.className || '').slice(0, 60),
                   border: c.borderTopColor + ' ' + c.borderTopWidth, radius: c.borderTopLeftRadius,
                   mb: c.marginBottom, dir: c.flexDirection, clip: c.overflow, op: c.opacity,
                   role: e.getAttribute('role') || '-', head: t.slice(0, 24) });
      }
      return JSON.stringify({ rows: out.length, out }, null, 1);
    })()`,
    returnByValue: true,
  });
  console.log(rows.value);
}

/* ⚠ OTA-1760 — THE LABEL PROBE. `--probe=labels --label=X` reports a leaf's own
 * box beside its pressable parent's, which is what you need to see whether a
 * control's tap target is centred on its label, or whether two stacked things
 * overlap. */
if (process.argv.includes('--probe=labels')) {
  const LABELS = process.argv.filter((a) => a.startsWith('--label=')).map((a) => a.slice(8));
  const { result: labs } = await S('Runtime.evaluate', {
    expression: `(() => {
      const r = (e) => { const b = e.getBoundingClientRect();
        return [Math.round(b.x*10)/10, Math.round(b.y*10)/10, Math.round(b.width*10)/10, Math.round(b.height*10)/10]; };
      const want = ${JSON.stringify(LABELS)};
      const out = [];
      for (const e of document.querySelectorAll('div,span')) {
        const t = (e.textContent || '').trim();
        if (e.children.length || !want.includes(t)) continue;
        const par = e.parentElement;
        const pc = par ? getComputedStyle(par) : null;
        out.push({ t, text: r(e), parent: par ? r(par) : null,
                   pad: pc ? [pc.paddingTop, pc.paddingRight, pc.paddingBottom, pc.paddingLeft].join('/') : null,
                   pborder: pc ? pc.borderTopWidth + ' ' + pc.borderTopColor : null });
      }
      return JSON.stringify(out, null, 1);
    })()`,
    returnByValue: true,
  });
  console.log(labs.value);
}

const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(`${outPrefix}.png`, Buffer.from(data, 'base64'));
console.error('wrote', `${outPrefix}.png`);

ws.close(); chrome.kill(); server.close();
process.exit(0);
