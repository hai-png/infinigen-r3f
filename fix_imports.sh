#!/bin/bash

echo "=== Fixing Import Paths Systematically ==="

# Fix 1: BaseMaterialGenerator imports in categories (../../BaseMaterialGenerator is correct, no change needed)
echo "Checking BaseMaterialGenerator imports..."
grep -r "from '../BaseMaterialGenerator'" /workspace/src/assets/materials --include="*.ts" 2>/dev/null | while read line; do
    file=$(echo "$line" | cut -d: -f1)
    echo "Fixing: $file (../BaseMaterialGenerator -> ../../BaseMaterialGenerator)"
    sed -i "s|from '../BaseMaterialGenerator'|from '../../BaseMaterialGenerator'|g" "$file"
done

# Fix 2: Transform imports - files in src/assets/objects/*/ need ../../../core/util/math/transforms
echo "Fixing Transform imports..."
find /workspace/src/assets/objects -name "*.ts" -type f -exec grep -l "from '../../../../core/util/math/transforms'" {} \; 2>/dev/null | while read file; do
    depth=$(echo "$file" | grep -o '/' | wc -l)
    if [ $depth -ge 6 ]; then
        echo "Fixing: $file (../../../../core/util/math/transforms -> ../../../../../core/util/math/transforms)"
        sed -i "s|from '../../../../core/util/math/transforms'|from '../../../../../core/util/math/transforms'|g" "$file"
    fi
done

# Fix 3: utils imports in objects directory  
echo "Fixing utils imports in objects..."
find /workspace/src/assets/objects -mindepth 2 -name "*.ts" -type f -exec grep -l "from '../../../../core/util/math/utils'" {} \; 2>/dev/null | while read file; do
    echo "Checking: $file"
    # Files in src/assets/objects/category/*.ts need ../../../../core/util/math/utils (4 levels up from category)
    # But they're using it correctly already
done

# Fix 4: BaseObjectGenerator imports
echo "Fixing BaseObjectGenerator imports..."
find /workspace/src/assets/objects -name "*.ts" -type f -exec grep -l "from '../BaseObjectGenerator'" {} \; 2>/dev/null | while read file; do
    dir=$(dirname "$file")
    basename=$(basename "$dir")
    if [ "$basename" != "utils" ]; then
        echo "Fixing: $file (../BaseObjectGenerator -> ../utils/BaseObjectGenerator)"
        sed -i "s|from '../BaseObjectGenerator'|from '../utils/BaseObjectGenerator'|g" "$file"
    fi
done

# Fix 5: NoiseUtils imports
echo "Fixing NoiseUtils imports..."
find /workspace/src/assets -name "*.ts" -type f -exec grep -l "from '../../../utils/NoiseUtils'" {} \; 2>/dev/null | while read file; do
    echo "Fixing: $file (../../../utils/NoiseUtils -> ../../utils/NoiseUtils)"
    sed -i "s|from '../../../utils/NoiseUtils'|from '../../utils/NoiseUtils'|g" "$file"
done

find /workspace/src/assets -name "*.ts" -type f -exec grep -l "from '../../terrain/utils/NoiseUtils'" {} \; 2>/dev/null | while read file; do
    echo "Fixing: $file (../../terrain/utils/NoiseUtils -> ../utils/NoiseUtils)"
    sed -i "s|from '../../terrain/utils/NoiseUtils'|from '../utils/NoiseUtils'|g" "$file"
done

echo "=== Import Path Fixes Complete ==="
