#!/usr/bin/env python3
"""Step 1 — measure the REAL divergence across the four product lines.

The point of the exercise: a `git diff` between two lines cannot tell an
INTENTIONAL platform difference from accidental DRIFT, because both are stored
in the same medium. This normalises away the things that are known noise (OTA
numbers, display versions, comments) and reports what is left, so each surviving
difference can be classified by hand.

Normalisation, and why each one:
  • comments      — every line carries the same code under different OTA prose
  • OTA-nnnn/webn/arbn — per-line numbering, renumbered by the port scripts
  • 4.x.y         — DISPLAY_VERSION, per-line by design
  • whitespace    — porting reflows

What is deliberately NOT normalised: identifiers, string literals the player
sees, and control flow. Those are the differences that matter.
"""
import io, os, re, sys, json

LINES = {
    'golem': '/tmp/hal-golem',
    'HAL':   '/tmp/hal-main-fix',
    'steam': '/tmp/spin-steam',
    'html':  '/tmp/hal-plat',
}
BASE = 'golem'

# buildInfo/buildCodename are per-line changelogs by design — 24k lines of
# superseded comments. Comparing them tells you nothing you did not already know.
SKIP = {'app/buildInfo.ts', 'app/buildCodename.ts'}

RE_BLOCK = re.compile(r'/\*.*?\*/', re.S)
RE_LINE  = re.compile(r'(^|\s)//[^\n]*', re.M)
RE_NUM   = re.compile(r'\bOTA[-\s]?\d+\b|\bweb\d+\b|\barb\d+\b')
RE_VER   = re.compile(r'\b4\.\d+\.\d+\b')
RE_DATE  = re.compile(r'\b20\d\d-\d\d-\d\d(-[\w-]+)?\b')

def norm(path):
    try:
        s = io.open(path, encoding='utf-8', errors='ignore').read()
    except Exception:
        return None
    s = RE_BLOCK.sub(' ', s)
    s = RE_LINE.sub(' ', s)
    s = RE_NUM.sub('N', s)
    s = RE_VER.sub('V', s)
    s = RE_DATE.sub('D', s)
    return ' '.join(s.split())

def collect(root):
    out = {}
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in
                   ('node_modules', '.git', 'assets', 'coverage', '.expo', 'dist', 'android', 'ios')]
        for f in files:
            if not f.endswith(('.ts', '.tsx', '.json', '.mjs')):
                continue
            rel = os.path.relpath(os.path.join(base, f), root)
            if not rel.startswith(('app', 'App', 'scripts')):
                continue
            if rel in SKIP or '__tests__' in rel:
                continue
            out[rel] = os.path.join(base, f)
    return out

def main():
    base_files = collect(LINES[BASE])
    base_norm = {}
    report = {}
    for name, root in LINES.items():
        if name == BASE:
            continue
        other = collect(root)
        shared = sorted(set(base_files) & set(other))
        diffs = []
        for rel in shared:
            if rel not in base_norm:
                base_norm[rel] = norm(base_files[rel])
            a = base_norm[rel]
            b = norm(other[rel])
            if a is None or b is None or a == b:
                continue
            # size of the difference, cheaply: normalised length delta + a
            # token-level count so a one-word change is not filed beside a
            # whole new subsystem
            ta, tb = a.split(' '), b.split(' ')
            sa, sb = set(ta), set(tb)
            only_base = len(sa - sb)
            only_other = len(sb - sa)
            diffs.append({
                'file': rel,
                'base_tokens': len(ta), 'other_tokens': len(tb),
                'tokens_only_base': only_base, 'tokens_only_other': only_other,
                'magnitude': only_base + only_other,
            })
        report[name] = {
            'shared': len(shared),
            'only_on_base': sorted(set(base_files) - set(other)),
            'only_on_line': sorted(set(other) - set(base_files)),
            'differing': sorted(diffs, key=lambda d: -d['magnitude']),
        }
    print(json.dumps(report, indent=1))

if __name__ == '__main__':
    main()
