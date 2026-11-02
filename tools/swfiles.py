#!/usr/bin/env python3
"""Refresh the list of files the service worker saves for offline use (run by release.sh)."""
import json, os, re
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
files = ['./', 'index.html', 'app.webmanifest']
for d in ['planner', 'home', 'lap', 'setup']:
    files.append(d + '/')
    files += [f'{d}/{f}' for f in sorted(os.listdir(d)) if f.endswith(('.html', '.js', '.svg', '.png')) and f != 'sw.js']
files += ['shared/' + f for f in sorted(os.listdir('shared'))]
s = open('sw.js').read()
s = re.sub(r'const FILES=\[.*?\];', 'const FILES=' + json.dumps(files) + ';', s, flags=re.S)
open('sw.js', 'w').write(s)
