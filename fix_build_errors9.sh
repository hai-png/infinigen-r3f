#!/bin/bash

# Fix duplicate SeededRandom imports in MaterialBlender.ts
echo "Fixing duplicate SeededRandom imports..."
if [ -f "src/assets/materials/blending/MaterialBlender.ts" ]; then
    # Remove duplicate import lines (keep only one)
    awk '!seen[$0]++ || !/import.*SeededRandom/' "src/assets/materials/blending/MaterialBlender.ts" > temp_file && mv temp_file "src/assets/materials/blending/MaterialBlender.ts"
    echo "Fixed duplicate imports in MaterialBlender.ts"
fi

# Check if SeededRandom is a class (should be used as type without typeof)
# The error says "SeededRandom refers to a value, but is being used as a type"
# This means we need to check how it's exported

echo "Checking SeededRandom export type..."
grep -n "export.*SeededRandom" src/core/util/MathUtils.ts | head -5

echo "Fixes complete!"
