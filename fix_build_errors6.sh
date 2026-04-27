#!/bin/bash

# Fix ApplianceBase.ts - change BBox import to use math/index
echo "Fixing ApplianceBase.ts imports..."
if [ -f "src/assets/objects/appliances/ApplianceBase.ts" ]; then
    # Replace the incorrect BBox import
    sed -i "s|import { BBox } from '../../../core/util/MathUtils';|import { BBox, SeededRandom } from '../../../core/util/math/index';|" "src/assets/objects/appliances/ApplianceBase.ts"
    echo "Fixed ApplianceBase.ts imports"
fi

# Fix ArchwayGenerator.ts - use correct relative path
echo "Fixing ArchwayGenerator.ts import..."
if [ -f "src/assets/objects/architectural/ArchwayGenerator.ts" ]; then
    # Check current import
    if grep -q "import.*math/index" "src/assets/objects/architectural/ArchwayGenerator.ts"; then
        # The path needs one more level up since it's in architectural folder
        sed -i "s|import { SeededRandom } from '../../../../core/util/math/index';|import { SeededRandom } from '../../../../core/util/math/index';|" "src/assets/objects/architectural/ArchwayGenerator.ts"
    fi
    echo "Checked ArchwayGenerator.ts import"
fi

echo "Fixes complete!"
