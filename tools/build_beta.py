#!/usr/bin/env python3
# Build the beta page. `python3 tools/build_beta.py local <three dir>` makes a page for local testing that loads
# three.js from disk; `python3 tools/build_beta.py cdn` makes the page that is published.
import sys, os, shutil
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); mode = sys.argv[1] if len(sys.argv) > 1 else 'cdn'
tpl = open(os.path.join(root, 'src/app/index.tpl.html')).read()
out = os.path.join(root, 'build/beta' if mode == 'local' else 'build/beta_pub'); os.makedirs(out, exist_ok=True)
three = ('file://' + os.path.abspath(sys.argv[2])) if mode == 'local' else 'https://cdn.jsdelivr.net/npm/three@0.170.0'
for d in ['world', 'battle', 'render', 'app']:
    shutil.rmtree(os.path.join(out, d), ignore_errors=True); shutil.copytree(os.path.join(root, 'src', d), os.path.join(out, d), ignore=shutil.ignore_patterns('*.tpl.html'))
for f in ['engine.js', 'dmg.js', 'campaign.js']: shutil.copy(os.path.join(root, 'src', f), os.path.join(out, f))
page = tpl.replace('{{THREE}}', three).replace('{{SRC}}', '')
if mode == 'cdn':
    # the publishing service wraps the page in its own document skeleton, so ship only the contents of head and body
    import re
    head = re.search(r'<head>(.*?)</head>', page, re.S).group(1); body = re.search(r'<body>(.*?)</body>', page, re.S).group(1)
    head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>', '', head)
    page = head.strip() + '\n' + body.strip() + '\n'
open(os.path.join(out, 'index.html'), 'w').write(page)
print('built', out, mode)
