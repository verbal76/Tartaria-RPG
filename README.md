# `promotions` — the HAL promotion control plane

THIS BRANCH IS NOT GAME SOURCE. It is a ledger. It is not a HAL source branch, not a Golem source branch, and never executable authority. The shared game-source trunk is `golem-line`; Golem and HAL are DISTRIBUTIONS of exact SHAs from it; `HaL2001` is archived.

To promote an exact, already-validated trunk SHA to HAL, add ONE file on this branch and push (fast-forward only):

    promotions/promote-hal-<full-40-hex-sha>.json
    { "target": "hal", "sha": "<the same sha>" }

`.github/workflows/promote.yml` (kept byte-identical to the copy on `golem-line`) proves intent and identity — canonical name, name == body, never added before, ancestor of current `origin/golem-line`, carries the Change-A contract — and dispatches the existing publisher with `sha=<exact sha> line=hal`. The PUBLISHER then checks out that exact SHA and runs the hardened receipt (`scripts/verify-ci-receipt.cjs`) — the sole CI-validation authority. This branch never touches source and never moves `golem-line`.

ONE SHA → ONE RECORD → ONE PUBLICATION. EAS publication is not idempotent, so a record that was ever added is consumed: editing, deleting, or re-adding one is refused. Two records in one push refuse. Force-pushes refuse. The creation push of this branch was inert by construction.

The release agent can create and fast-forward this branch but cannot delete it, any ref, or any tag (measured 2026-09-11). Design everything here as append-only.
