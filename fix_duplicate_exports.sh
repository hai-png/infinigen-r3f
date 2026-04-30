#!/bin/bash
# Fix redundant re-export blocks in files that already export classes/interfaces inline
# These files define `export class X` then later have `export { X }` which causes TS2484/TS2323

cd "$(dirname "$0")"

# CameraNodes.ts - remove lines 244-261 (redundant export block)
python3 -c "
import re
files_and_patterns = [
    # Each tuple: (filepath, start_marker, end_marker_inclusive)
    # We'll remove the 'Module Exports' section at the end of these files
]

# Generic approach: find and remove trailing 'export { ... }' and 'export type { ... }' blocks
# that re-export already-exported names
import glob
import os

target_files = [
    'src/core/nodes/camera/CameraNodes.ts',
    'src/core/nodes/collection/CollectionNodes.ts',
    'src/core/nodes/volume/VolumeNodes.ts',
    'src/core/nodes/helpers/attribute-helpers.ts',
    'src/core/nodes/groups/group-io-manager.ts',
]

for filepath in target_files:
    if not os.path.exists(filepath):
        print(f'SKIP: {filepath} not found')
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Find the 'Module Exports' section and remove it
    # Pattern: '// =====...Module Exports...=====' followed by export { } and export type { } blocks
    pattern = r'\n// =+\n// Module Exports\n// =+\n\nexport \{[^}]*\};\n(\nexport type \{[^}]*\};\n)?'
    new_content = re.sub(pattern, '\n', content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f'FIXED: {filepath}')
    else:
        # Try simpler pattern - just the trailing export blocks
        # Remove standalone 'export { AlreadyExported };' at end
        lines = content.split('\n')
        # Find last 'export {' block
        in_export = False
        remove_start = -1
        remove_ranges = []
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith('export {') or stripped.startswith('export type {'):
                # Check if this is at the end of file (within last 30 lines)
                if i > len(lines) - 35:
                    if remove_start == -1:
                        remove_start = i
                        # Also remove preceding blank lines and comment lines
                        while remove_start > 0 and (lines[remove_start-1].strip() == '' or lines[remove_start-1].strip().startswith('//')):
                            remove_start -= 1
            
        if remove_start > 0:
            new_lines = lines[:remove_start]
            new_content = '\n'.join(new_lines) + '\n'
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f'FIXED (alt): {filepath}')
        else:
            print(f'NO CHANGE: {filepath}')

# Fix attribute-helpers.ts - has 'export { AttributeDomain, AttributeType };' at end
# but these are defined with 'export type' or 'export enum' earlier  
filepath = 'src/core/nodes/helpers/attribute-helpers.ts'
if os.path.exists(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    # Remove the last two lines if they're re-exports
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped == 'export { AttributeDomain, AttributeType };':
            continue
        if stripped == 'export type { AttributeConfig };':
            continue
        new_lines.append(line)
    with open(filepath, 'w') as f:
        f.writelines(new_lines)
    print(f'FIXED trailing re-exports: {filepath}')

# Fix group-io-manager.ts - has 'export { GroupIOManager };' at end
filepath = 'src/core/nodes/groups/group-io-manager.ts'
if os.path.exists(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace('\nexport { GroupIOManager };\n', '\n')
    with open(filepath, 'w') as f:
        f.write(content)
    print(f'FIXED trailing re-export: {filepath}')
"

echo "Done fixing duplicate export blocks."
