#!/usr/bin/env python3
"""Fail the build when a CS Pathway module imports an absent project asset."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / '_projects/games/cs-pathway'
BUILT = ROOT / 'assets/js/projects/cs-pathway'
IMPORTS = re.compile(r'\b(?:from\s*|import\s*\()\s*[\'\"]([^\'\"]+)[\'\"]')
missing = []
for module in [*SOURCE.rglob('*.js'), *BUILT.rglob('*.js')]:
    for specifier in IMPORTS.findall(module.read_text()):
        if specifier.startswith('@assets/js/projects/cs-pathway/'):
            target = BUILT / specifier.split('cs-pathway/', 1)[1]
        elif specifier.startswith('./') or specifier.startswith('../'):
            target = module.parent / specifier
        else:
            continue
        if not target.is_file():
            missing.append(f'{module.relative_to(ROOT)} imports missing {specifier}')
if missing:
    print('\n'.join(missing), file=sys.stderr)
    sys.exit(1)
print('CS Pathway imports resolve in the built site.')
