#!/bin/bash

# Fix remaining FixedSeed references in category generators
echo "Fixing remaining FixedSeed references..."

CATEGORY_FILES=(
    "src/assets/materials/categories/Ceramic/CeramicGenerator.ts"
    "src/assets/materials/categories/Fabric/FabricGenerator.ts"
    "src/assets/materials/categories/Glass/GlassGenerator.ts"
    "src/assets/materials/categories/Leather/LeatherGenerator.ts"
    "src/assets/materials/categories/Metal/MetalGenerator.ts"
    "src/assets/materials/categories/Plastic/PlasticGenerator.ts"
    "src/assets/materials/categories/Stone/StoneGenerator.ts"
    "src/assets/materials/categories/Wood/WoodGenerator.ts"
)

for file in "${CATEGORY_FILES[@]}"; do
    if [ -f "$file" ]; then
        # Replace any remaining FixedSeed with SeededRandom (these are likely type annotations or variable declarations)
        sed -i 's/\bFixedSeed\b/SeededRandom/g' "$file"
        echo "Fixed: $file"
    fi
done

# Fix ArchwayGenerator import
echo "Fixing ArchwayGenerator import..."
if [ -f "src/assets/objects/architectural/ArchwayGenerator.ts" ]; then
    if ! grep -q "import.*SeededRandom" "src/assets/objects/architectural/ArchwayGenerator.ts"; then
        sed -i "/import.*MathUtils/a import { SeededRandom } from '../../../../core/util/MathUtils';" "src/assets/objects/architectural/ArchwayGenerator.ts"
        echo "Added SeededRandom import to ArchwayGenerator.ts"
    fi
fi

# Fix BBox import - use correct path
echo "Fixing BBox import in ApplianceBase.ts..."
if [ -f "src/assets/objects/appliances/ApplianceBase.ts" ]; then
    # Remove the incorrect BBox import and add correct one
    sed -i "s|import { BBox } from '../../../core/util/math/bbox';||g" "src/assets/objects/appliances/ApplianceBase.ts"
    # Check if there's a BBox export in MathUtils
    if grep -q "export.*BBox" "src/core/util/MathUtils.ts"; then
        echo "BBox is exported from MathUtils"
    else
        # Need to check what's available
        echo "BBox not found in MathUtils, checking bbox.ts exports..."
        grep "export" "src/core/util/math/bbox.ts" | head -5
    fi
fi

echo "Fixes complete!"
