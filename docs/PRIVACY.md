# Privacy Policy for Tartaria Realms

**Effective date:** May 23, 2026
**Publisher:** Hot Attic Games
**Contact:** ernstkevin@yahoo.com

## Summary

Tartaria Realms collects no personal data, no usage analytics, no
device identifiers, no account information, and no contact details.
The game runs entirely on your device after a one-time download of
two AI model files from a public host. We do not operate any
backend server that holds player data.

## Data we collect

**None.** The app does not request, transmit, or store any personal
information about you or your device.

There is no:
- account or login system
- analytics SDK (no Firebase Analytics, Mixpanel, Segment, etc.)
- crash-reporting service that uploads data
- advertising SDK
- social-media SDK
- in-app purchase or payment system

### Crash records (on-device only)

When the app crashes, it writes a record of the crash — the error
message, the code location, what the game was doing, and which build
you were on — into its own private storage on your device, keeping the
ten most recent. This is how the LAST CRASH notice on the title screen
works, and it is what REPORT A BUG copies to your clipboard.

**These records never leave your device on their own.** They are sent
only when *you* choose to send them, by using REPORT A BUG and pasting
the result somewhere yourself.

Settings contains an AUTOMATIC CRASH REPORTS switch. It is **off by
default**, and in this version it is not available at all — no crash
reporting service is built into the app, so there is nothing for it to
send to. If a future version adds one, this policy will be updated to
name the service and say exactly what it receives, before the switch
can do anything. Turning that switch on would always be your decision,
never a default.

Crash records contain no personal information, no account identifier,
and no contents of your saves.

Your save files, character history, settings, and game log are
stored only on your device, inside the app's private storage area.
Uninstalling the app permanently deletes all of it.

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

No other outbound network traffic originates from the app.

## After the model download

Once the three model files are on your device, the entire game runs
offline. You can keep your device in airplane mode for every
subsequent session and Tartaria Realms will work exactly the same.

## Children

Tartaria Realms is rated for ages 13 and up. The game contains
fantasy combat with stylized, non-graphic violence (d20-style dice
rolls describing combat outcomes). No personal data is collected
from any user regardless of age.

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
