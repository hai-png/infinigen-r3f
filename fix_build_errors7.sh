#!/bin/bash

# Fix ArchwayGenerator.ts - remove FixedSeed import and keep only SeededRandom
echo "Fixing ArchwayGenerator.ts imports..."
if [ -f "src/assets/objects/architectural/ArchwayGenerator.ts" ]; then
    # Remove the FixedSeed import line
    sed -i '/import.*FixedSeed.*MathUtils/d' "src/assets/objects/architectural/ArchwayGenerator.ts"
    echo "Removed FixedSeed import from ArchwayGenerator.ts"
fi

echo "Fixes complete!"
