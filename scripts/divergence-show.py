#!/usr/bin/env python3
"""Print the normalised diff of ONE file between golem and another line."""
import io, re, sys, difflib

RE_BLOCK = re.compile(r'/\*.*?\*/', re.S)
RE_LINE  = re.compile(r'(^|\s)//[^\n]*', re.M)
RE_NUM   = re.compile(r'\bOTA[-\s]?\d+\b|\bweb\d+\b|\barb\d+\b')
RE_VER   = re.compile(r'\b4\.\d+\.\d+\b')
RE_DATE  = re.compile(r'\b20\d\d-\d\d-\d\d(-[\w-]+)?\b')

ROOTS = {'golem': '/tmp/hal-golem', 'HAL': '/tmp/hal-main-fix',
         'steam': '/tmp/spin-steam', 'html': '/tmp/hal-plat'}

def norm_lines(path):
    s = io.open(path, encoding='utf-8', errors='ignore').read()
    s = RE_BLOCK.sub(' ', s)
    s = RE_LINE.sub(' ', s)
    s = RE_NUM.sub('N', s)
    s = RE_VER.sub('V', s)
    s = RE_DATE.sub('D', s)
    return [ln.strip() for ln in s.split('\n') if ln.strip()]

rel, line = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 60
a = norm_lines(ROOTS['golem'] + '/' + rel)
b = norm_lines(ROOTS[line] + '/' + rel)
shown = 0
for d in difflib.unified_diff(a, b, 'golem', line, n=1, lineterm=''):
    if d.startswith(('---', '+++', '@@')) or d.startswith(('-', '+')):
        print(d[:300])
        shown += 1
        if shown >= limit:
            print('… truncated')
            break
