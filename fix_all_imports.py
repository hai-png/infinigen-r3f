#!/usr/bin/env python3
"""
Systematic import path fixer for TypeScript files
"""
import os
import re
from pathlib import Path

def get_file_depth(filepath):
    """Calculate how many directories deep a file is from src/"""
    rel_path = filepath.replace('src/', '')
    return rel_path.count('/') 

def fix_import_in_file(filepath):
    """Fix import paths in a single file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    file_depth = get_file_depth(filepath)
    
    # Calculate correct relative path depth
    # Files in src/assets/X/Y.ts need to go back (file_depth) levels to reach src/
    # Then go into core/util/math/
    
    # Fix 1: core/util/math/utils imports
    patterns_to_fix = [
        # Pattern: various depths trying to reach core/util/math/utils
        (r"from ['\"]\.\./\.\./\.\./core/util/math/utils['\"]", 
         f"from '{'../' * max(1, file_depth - 2)}core/util/math/utils'"),
        
        # Fix 2: core/util/math/noise imports  
        (r"from ['\"]\.\./\.\./\.\./core/util/math/noise['\"]",
         f"from '{'../' * max(1, file_depth - 2)}core/util/math/noise'"),
         
        # Fix 3: core/util/math/quaternion imports
        (r"from ['\"]\.\./\.\./\.\./core/util/math/quaternion['\"]",
         f"from '{'../' * max(1, file_depth - 2)}core/util/math/quaternion'"),
         
        # Fix 4: core/util/math/transforms imports
        (r"from ['\"]\.\./\.\./\.\./core/util/math/transforms['\"]",
         f"from '{'../' * max(1, file_depth - 2)}core/util/math/transforms'"),
         
        # Fix 5: BaseMaterialGenerator - should be ../../BaseMaterialGenerator from categories/*
        (r"from ['\"]\.\./BaseMaterialGenerator['\"]",
         "from '../../BaseMaterialGenerator'"),
         
        # Fix 6: BaseObjectGenerator
        (r"from ['\"]\.\./BaseObjectGenerator['\"]",
         "from '../BaseObjectGenerator'"),
        (r"from ['\"]\.\./utils/BaseObjectGenerator['\"]",
         "from '../utils/BaseObjectGenerator'"),
    ]
    
    for pattern, replacement in patterns_to_fix:
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    src_dir = Path('src')
    ts_files = list(src_dir.rglob('*.ts'))
    
    fixed_count = 0
    for filepath in ts_files:
        if fix_import_in_file(str(filepath)):
            fixed_count += 1
            print(f"Fixed: {filepath}")
    
    print(f"\nTotal files fixed: {fixed_count}")

if __name__ == '__main__':
    main()
