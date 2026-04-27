#!/bin/bash

# Fix BBox import in ApplianceBase.ts - use the math/index path which exports BBox
echo "Fixing BBox import in ApplianceBase.ts..."
if [ -f "src/assets/objects/appliances/ApplianceBase.ts" ]; then
    # Replace the MathUtils import with math/index import for BBox
    sed -i "s|import { SeededRandom } from '../../../core/util/MathUtils';|import { SeededRandom } from '../../../core/util/math/index';|" "src/assets/objects/appliances/ApplianceBase.ts"
    # Add BBox import if not present
    if ! grep -q "import.*BBox" "src/assets/objects/appliances/ApplianceBase.ts"; then
        sed -i "s|import { SeededRandom } from '../../../core/util/math/index';|import { SeededRandom, BBox } from '../../../core/util/math/index';|" "src/assets/objects/appliances/ApplianceBase.ts"
    fi
    echo "Fixed BBox import in ApplianceBase.ts"
fi

# Fix ArchwayGenerator import to use math/index
echo "Fixing ArchwayGenerator import..."
if [ -f "src/assets/objects/architectural/ArchwayGenerator.ts" ]; then
    # Replace MathUtils import with math/index
    sed -i "s|import { SeededRandom } from '../../../../core/util/MathUtils';|import { SeededRandom } from '../../../../core/util/math/index';|" "src/assets/objects/architectural/ArchwayGenerator.ts"
    echo "Fixed ArchwayGenerator import"
fi

echo "Fixes complete!"
