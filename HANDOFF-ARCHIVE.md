> ARCHIVED 2026-07-02 — superseded by HANDOFF.md (rewritten & de-bloated).
> This is the PREVIOUS handoff verbatim: the full open/closed issue tracker
> and the complete OTA changelog, kept for historical "why". The current
> operating model, processes, and open issues live in HANDOFF.md.

---

# Tartaria Realms — START HERE (main branch pointer)

> **You are on the `main` branch. Active development does NOT happen here.**

`main` is a stale snapshot. **All live work — engine code, OTA updates,
the canonical issue tracker, and the build timeline — is on the
`HaL2001` branch.** That is the branch the OTA update server publishes
from and the branch every recent commit lands on.

## What to do first

1. **Switch to the working branch:**
   ```
   git fetch origin HaL2001
   git checkout HaL2001
   ```
2. **Read the real handoff there:** `HANDOFF.md` on `HaL2001` is the
   full source of truth — the **⚡ ACTIVE TASK block at the top of
   Section 0.A** tells you exactly what the current session is doing and
   where the cursor is, followed by the canonical Open / Closed issue
   tracker.
3. **Read `CLAUDE.md`** (also on `HaL2001`) for the working rules —
   canon precedence, the OTA-only shipping flow, and the HANDOFF.md
   timeline discipline.

## Current active task (as of 2026-05-31)

Getting a signed iOS build onto **TestFlight External Testing** for
the user's Apple playtesters. The one remaining blocker is the
interactive iOS **Distribution Certificate** creation, being done via
`eas credentials --platform ios` on the user's Windows laptop. Full
state — what's done, the menu route, and the steps after the cert
lands — is in the ACTIVE TASK block of `HANDOFF.md` on `HaL2001`.

## Key facts

- **Working/OTA branch:** `HaL2001`
- **App version (rt floor):** `2.4.1` — pinned for OTA delivery; visible
  version is `3.0.0` via the `DISPLAY_VERSION` constant (cosmetic, OTA-able).
- **OTA channel:** `hal2001`
- **Project:** Expo account `hot-attic-games`, slug `tartaria-`.

---

*This file exists only to redirect a fresh session to `HaL2001`. Do not
treat it as the issue tracker — the real `HANDOFF.md` is on `HaL2001`.*
