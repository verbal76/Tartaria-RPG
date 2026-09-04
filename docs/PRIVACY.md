# Privacy Policy for Tartaria Realms

**Effective date:** May 23, 2026
**Last updated:** September 4, 2026 — REPORT A BUG now sends your report
straight to the developer instead of opening an email, and it includes your
game log and your character's inventory; see "Sending a report yourself" below
for exactly what it contains.
Automatic crash reports still start ON (August 24, 2026); see "The AUTOMATIC
CRASH REPORTS switch".
**Publisher:** Hot Attic Games
**Contact:** ernstkevin@yahoo.com

## Summary

Tartaria Realms collects no personal data, no usage analytics, no
device identifiers, no account information, and no contact details.
The game runs entirely on your device after a one-time download of
two AI model files from a public host. We do not operate any
backend server that holds player data.

There are two exceptions, and they work differently.

**Crash reports** are **on by default in this version and can be switched
off at any time**. While they are on, technical details about a crash —
never anything about you, and never anything from your saves — go to Sentry
so the crash can be fixed.

**Sending a report yourself** is something you do deliberately, and it sends
much more: your game log, which includes anything you typed. It never happens
on its own. Nothing is sent unless you open REPORT A BUG, describe the
problem, and tap send.

What each of them includes, exactly, is listed below, along with the switch
that stops both.

## Data we collect

**Nothing except crash reports (while their switch is on) and whatever you
choose to send yourself with REPORT A BUG.** The app does not request or
store any personal information about you or your device. Crash reporting
starts on; switch it off in Settings and the app transmits nothing at all —
that switch governs REPORT A BUG too.

There is no:
- account or login system
- analytics SDK (no Firebase Analytics, Mixpanel, Segment, etc.)
- advertising SDK
- social-media SDK
- in-app purchase or payment system

There **is** a crash-reporting service in this version. It starts on,
a single switch turns it off, and it is named and described in full
below.

### Crash records

When the app crashes, it writes a record of the crash — the error
message, the code location, what the game was doing, and which build
you were on — into its own private storage on your device, keeping the
ten most recent. This is how the LAST CRASH notice on the title screen
works, and it is what REPORT A BUG copies to your clipboard.

**These records leave your device only while the AUTOMATIC CRASH
REPORTS switch is on.** The switch starts on in this version; turn it
off and the records are sent only when *you* choose to send them, by
using REPORT A BUG and pasting the result somewhere yourself.

### The AUTOMATIC CRASH REPORTS switch

Settings contains an AUTOMATIC CRASH REPORTS switch. As of August 24,
2026 it is **on by default**; earlier versions shipped it off by
default. Two promises hold across that change: **turning it off stops
all automatic sending immediately**, and **an explicit OFF is
permanent** — if you switched it off on any version, it stays off; the
new default never overrides a recorded choice. An earlier version of
this policy said that if a future version ever added a reporting
service, this document would name it and say exactly what it receives
*before* the switch could do anything. This is that update.

**The service is Sentry** (sentry.io, operated by Functional Software,
Inc.), on their **United States** infrastructure. If you turn the
switch on, crash records already stored on your device are sent there,
and later ones are sent as they occur.

**Exactly what a report contains**, and nothing else:

- the error message and, when there is one, the stack trace text
- what kind of crash it was, and how far into startup it happened
- the build number, the version, and which edition you are playing
- how long the app had been running
- the last thing the app did before it died — the action, the room,
  the screen, and the internal phase. For a crash where the operating
  system killed the app outright, this is the only evidence there is,
  which is why it is collected.
- a random per-crash identifier, so the same crash is not counted twice

**What a report never contains:** your name, an account identifier (the
app has no accounts), your location, contacts, advertising identifiers,
your save files, your characters, or anything you typed into the game.

The reporting library is configured so that it sends **only** these
records and only on the path described above: its own automatic session
tracking, network-error capture and background breadcrumb collection are
all switched **off**. Nothing is transmitted at the moment of a crash;
records are sent on a later launch, and only while the switch is on.

You can turn the switch off at any time, and reporting stops.

Sentry's own handling of received data is governed by their privacy
policy at https://sentry.io/privacy/.

Your save files, character history, settings, and game log are
stored only on your device, inside the app's private storage area,
unless you choose to send them with REPORT A BUG (see "Sending a
report yourself" below). Uninstalling the app permanently deletes all of it.

## Data we share

**None.** We do not have any data to share, and we have no agreements
with third parties to receive or process player data.

## Third-party services contacted by the app

The app makes outbound network requests in exactly the following
circumstances:

1. **First-launch AI model download** — On the very first launch
   after installation, the app downloads three on-device AI model
   files from the public Hugging Face content delivery network:

   - `huggingface.co/Xenova/all-MiniLM-L6-v2` — the small classifier
     model used for natural-language input parsing
   - `huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF` — the small
     language model used for novel-phrase fallback parsing

   These downloads are anonymous HTTP requests for static files.
   We send no identifier, no account, no telemetry payload. Hugging
   Face's own privacy policy applies to whatever request metadata
   their servers log (IP address, user agent). See
   https://huggingface.co/privacy for their terms.

2. **Over-the-air JavaScript updates** — When the app launches, it
   contacts the Expo update server at `u.expo.dev` to check whether
   a newer JavaScript bundle is available for this build's runtime
   version. The request contains only the build's runtime version
   and update channel — no player data. If a newer bundle is
   available, the app downloads it as a static file. See
   https://expo.dev/privacy-explained for the Expo update service's
   privacy details.

3. **Google Play Store updates and app integrity checks** — These
   are managed by the Android operating system and Google Play
   Services on your device, not by Tartaria Realms. See Google's
   own privacy policies for details on what Play Services collects.

4. **Crash reports — unless you switch them off.** With AUTOMATIC
   CRASH REPORTS on — the state this version starts in — the app posts
   stored crash records to `ingest.us.sentry.io`. With the switch off,
   the app never contacts Sentry at all, not even to check in. The
   full contents of a report are listed under "The AUTOMATIC CRASH
   REPORTS switch" above.

5. **A report you send yourself.** If you file a REPORT A BUG, the app posts
   that one report to the same address. It is sent once, when you ask for
   it, and never on a schedule or in the background. With AUTOMATIC CRASH
   REPORTS off, the button cannot send at all.

No other outbound network traffic originates from the app.

## Sending a report yourself

Settings → SESSION → REPORTING, and the title screen, both have a **REPORT A
BUG** button. It exists so that a bug you hit can be traced without you
having to copy and paste anything into an email — which is what it used to
require, and what it no longer does.

**It only ever runs when you ask.** You open it, describe what went wrong,
and tap send. Nothing leaves your device before that.

**What it sends:**

- what you **typed into the report** — your description of the problem
- your **game log** — the play-by-play of your session, which includes the
  commands and text you typed into the game
- your **inventory** — a list of what your character is carrying and wearing.
  This is new in the September 4, 2026 update; the same list used to require a
  separate COPY INVENTORY button and a second paste, and that button is gone
  now that the report carries it
- the **voice diagnostics** (engine, voice, recent speech routes and errors)
- the **device and build summary** shown on the About screen (device model,
  Android version, app and update version, memory and crash counters)

**What it still never sends:** your name, an account identifier (the app has
no accounts), your location, your contacts, or any advertising identifier.

**One report per session of play.** After a report goes out, the button will
not send another until something new has happened in your game log — a second
report on an identical log carries identical evidence. It tells you so when it
refuses, rather than appearing to send.

It goes to the same destination as crash reports (`ingest.us.sentry.io`) and
is read only by the developer, to find the bug. If AUTOMATIC CRASH REPORTS is
off, REPORT A BUG cannot send — it is the same connection, and the switch
governs both.

## After the model download

Once the three model files are on your device, the entire game runs
offline. You can keep your device in airplane mode for every
subsequent session and Tartaria Realms will work exactly the same.
(With crash reports switched on, the app will try to send stored
records when it next has a connection; with the switch off, nothing
is ever waiting to be sent.)

## Children

Tartaria Realms is rated for ages 13 and up. The game contains
fantasy combat with stylized, non-graphic violence (d20-style dice
rolls describing combat outcomes). No personal data is collected
from any user regardless of age — including in crash reports, which
carry no name, no account, and nothing typed into the game.

If a player chooses to file a REPORT A BUG, the report they send does include
what they typed into the game — that is what makes it useful for finding a
bug. It is never sent automatically, it takes a deliberate description and
send, and turning AUTOMATIC CRASH REPORTS off disables it entirely. A younger
player should ask a parent before using it.

## Changes to this policy

We may update this policy if the game adds new third-party services
or new outbound network requests. Updates will be posted at the URL
where you originally read this policy, with a new effective date at
the top.

## Contact

Questions about this policy or about how Tartaria Realms handles
data: **ernstkevin@yahoo.com**

---

This policy is published at: <REPLACE-WITH-PUBLIC-URL>
