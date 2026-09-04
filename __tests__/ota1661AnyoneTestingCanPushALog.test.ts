// OTA-1661 — ANYONE TESTING CAN PUSH A LOG.
//
// Owner, after OTA-1660 added two names to an allowlist: *"anyone testing
// should be able to push a log."*
//
// ⚠⚠⚠ THE ALLOWLIST WAS NEVER THE RIGHT SHAPE FOR THIS. OTA-1489 put SEND LOG
// behind `ownerTools` on a sound argument: the privacy policy promised players
// that nothing but crash records leaves their device, and this bundle carries
// the game log — everything they typed — plus their save. That was correct
// about the POLICY and wrong about the PRODUCT. It meant every tester outside a
// two-name list had to email a clipboard paste, which is exactly what both his
// daughters did rather than push a button.
//
// ⚠⚠ SO THE POLICY MOVED, RATHER THAN THE PROMISE BEING QUIETLY BENT.
// docs/PRIVACY.md now has a "Sending a log yourself" section naming the
// contents, the two-tap confirm, and the switch that disables it — and this
// suite refuses to let the button open without it. A feature that contradicts
// the privacy page is not a feature.
//
// ⚠ AND CONSENT IS THE BASIS, SO IT IS A REAL STEP: one tap arms and explains,
// a second sends. The owner tapping his own button always knew what was in it;
// a tester does not.
//
// ⚠⚠⚠ WHAT DID NOT OPEN: the OTA-1505 auto-bundle, which pushes the SAME
// payload with NO TAP on a slot load. "Able to push a log" is about the ability
// to push, not about collecting from people who never chose to send anything.
// The last describe below exists so that a future tidy-up cannot align the two
// gates and silently turn background uploads on for strangers.

const readRepoFile = (...parts: string[]): string =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', ...parts), 'utf8',
  ) as string;

const about = (): string => readRepoFile('app', 'screens', 'AboutScreen.tsx');
const privacy = (): string => readRepoFile('docs', 'PRIVACY.md');

/** The JSX block that decides whether SEND LOG is on screen at all. */
const sendLogGate = (): string => {
  const src = about();
  const at = src.indexOf('SEND LOG TO DEVELOPER');
  // Walk back to the conditional that opens the block.
  const head = src.lastIndexOf('{crashConfigured && (', at);
  return src.slice(head, at);
};

describe('OTA-1661 — the button is open to everyone', () => {
  it('⚠ SEND LOG no longer renders behind ownerTools', () => {
    expect(about()).not.toContain('{ownerTools && crashConfigured && (');
    expect(sendLogGate()).toContain('{crashConfigured && (');
  });

  it('but it still renders only where the build can actually deliver', () => {
    // A live-looking button on a build with no destination is how a tester
    // concludes their report was received when nothing was sent.
    expect(sendLogGate()).toContain('crashConfigured');
  });

  it('⚠⚠ and the crash switch still governs it, enforced in the transport', () => {
    // Measured, not assumed — this is the check that makes the privacy page's
    // "with the switch off the app never contacts Sentry at all" true of this
    // send too. The refusal names itself instead of failing silently.
    const t = readRepoFile('app', 'diagnostics', 'sentryTransport.ts');
    const body = t.slice(t.indexOf('export async function sendGameLogInline'));
    expect(body.slice(0, 2000)).toContain('if (!reportingEnabled()) {');
    expect(body.slice(0, 2000)).toContain('crash reporting is switched off on this device');
  });
});

describe('OTA-1661 — ⚠ consent is a real step, not a label', () => {
  it('the first tap ARMS and does not send', () => {
    const src = about();
    expect(src).toContain("setLogSendState('armed'); return;");
    // The send call must sit AFTER the arming return, or the guard is theatre.
    const arm = src.indexOf("setLogSendState('armed'); return;");
    const send = src.indexOf('void handleSendLog();', arm);
    expect(send).toBeGreaterThan(arm);
  });

  it('the armed state names what is about to leave the device', () => {
    const src = about();
    expect(src).toContain('TAP AGAIN TO CONFIRM SEND');
    // The three things that actually go, said in the player's words.
    expect(src).toMatch(/including anything you typed/);
    expect(src).toMatch(/your save and your\s+inventory/);
  });

  it('⚠ and backing out really cancels, because the caption promises it does', () => {
    // Switching tabs does not unmount this screen, so without the effect the
    // words "switch tabs to cancel" would be a sentence the code ignored.
    const src = about();
    expect(src).toContain("setLogSendState((st) => (st === 'armed' ? 'idle' : st));");
    expect(src).toContain('Switch tabs or leave this screen to cancel.');
  });
});

describe('OTA-1661 — ⚠⚠ the privacy page moved FIRST', () => {
  it('it carries a section describing this send', () => {
    expect(privacy()).toContain('## Sending a log yourself');
  });

  it('and that section names the contents, the two taps and the switch', () => {
    const p = privacy();
    const section = p.slice(p.indexOf('## Sending a log yourself'));
    expect(section).toMatch(/game log/);
    expect(section).toMatch(/the commands and text you typed/);
    expect(section).toMatch(/save/);
    expect(section).toMatch(/inventory/);
    expect(section).toMatch(/tap a second time to confirm/);
    expect(section).toMatch(/SEND LOG does nothing/);
  });

  it('⚠ the old blanket claim no longer contradicts the button', () => {
    // "Nothing except crash reports" was true when the button was owner-only.
    // Left alone it would now be a false statement in a privacy policy.
    const p = privacy();
    expect(p).not.toContain('**Nothing except crash reports, and only while their switch is on.**');
    expect(p).toContain('whatever you\nchoose to send yourself with SEND LOG');
  });

  it('the children section says what a sent log contains', () => {
    const p = privacy();
    const kids = p.slice(p.indexOf('## Children'));
    expect(kids).toMatch(/does include what\nthey typed/);
    expect(kids).toMatch(/ask a parent/);
  });

  it('and the policy is dated for this change', () => {
    expect(privacy()).toContain('**Last updated:** September 4, 2026');
  });
});

describe('OTA-1661 — ⚠⚠⚠ what stayed shut: the no-tap auto-bundle', () => {
  it('the background push is STILL owner-gated', () => {
    // This is the line that separates consent from collection. SEND LOG is a
    // person choosing to send their own log and confirming it. autoBundle
    // uploads the same payload on a slot load, with no tap, from someone who
    // never connected that moment to any transmission.
    const auto = readRepoFile('app', 'diagnostics', 'autoBundle.ts');
    expect(auto).toContain('if (!(await ownerToolsUnlocked(player?.name))) return null;');
  });

  it('⚠ and the asymmetry is written down where the next editor will look', () => {
    // Without the reason recorded, "align these two gates" reads like tidying.
    const auto = readRepoFile('app', 'diagnostics', 'autoBundle.ts');
    expect(auto).toContain('OTA-1661');
    expect(auto).toMatch(/One is consent\. The other is collection/);
  });
});
