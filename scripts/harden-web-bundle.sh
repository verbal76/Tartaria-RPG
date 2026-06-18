#!/usr/bin/env bash
# Level-2 hardening for the web/desktop bundle. (1) Strip source maps so the
# minified code can't be decoded back to original source. (2) Light JS obfuscation
# (identifier mangling + a plain string array) so casual readers and
# "plug-in-a-number" tinkerers can't easily edit it. DELIBERATELY conservative on
# runtime cost: NO numbersToExpressions, NO string-array base64/rotate/shuffle, NO
# control-flow flattening / self-defending / console-disable. The first canary used
# numbersToExpressions + base64 rotate/shuffle and the .exe hung mid-boot — those
# transforms make the procedural-generation number/string hot loops pathologically
# slow. This profile keeps the app fast and the desktop diagnostic console intact.
# Native builds skip this — Hermes already ships bytecode.
set -euo pipefail
DIST="${1:-dist}"
JS_DIR="$DIST/_expo/static/js"
echo "[harden] stripping source maps under $DIST"
find "$DIST" -name '*.map' -type f -delete || true
echo "[harden] obfuscating JS under $JS_DIR (level 2)"
npx --yes javascript-obfuscator "$JS_DIR" --output "$JS_DIR" --config obfuscator.config.json
echo "[harden] done"
