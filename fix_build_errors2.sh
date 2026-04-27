#!/bin/bash

# Fix 1: Add import for SeededRandom in files that need it
echo "Adding SeededRandom imports..."

FILES=(
    "src/assets/materials/blending/MaterialBlender.ts"
    "src/assets/materials/coating/CoatingGenerator.ts"
    "src/assets/materials/decals/DecalSystem.ts"
    "src/assets/materials/patterns/PatternGenerator.ts"
    "src/assets/materials/surface/SurfaceDetail.ts"
    "src/assets/materials/wear/WearGenerator.ts"
    "src/assets/materials/weathering/Weathering.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        # Check if SeededRandom is already imported
        if ! grep -q "import.*SeededRandom" "$file"; then
            # Add import after the existing MathUtils import
            sed -i "/import.*MathUtils/a import { SeededRandom } from '../../../core/util/MathUtils';" "$file"
            echo "Added import to: $file"
        fi
    fi
done

# Fix material category generators
echo "Fixing material category generators..."

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
        # Check if SeededRandom is already imported
        if ! grep -q "import.*SeededRandom" "$file"; then
            # Find the import line for FixedSeed and replace it
            if grep -q "FixedSeed" "$file"; then
                # Replace import of FixedSeed with SeededRandom
                sed -i 's/import.*FixedSeed.*from.*MathUtils.*/import { SeededRandom } from "../../../../core\/util\/MathUtils";/' "$file"
                echo "Fixed import in: $file"
            else
                # Add import after existing imports
                sed -i "1a import { SeededRandom } from '../../../../core/util/MathUtils';" "$file"
                echo "Added import to: $file"
            fi
        fi
    fi
done

# Fix BBox import in ApplianceBase.ts
echo "Fixing BBox import..."
if [ -f "src/assets/objects/appliances/ApplianceBase.ts" ]; then
    # Add BBox import from bbox.ts
    if ! grep -q "import.*BBox.*from.*bbox" "src/assets/objects/appliances/ApplianceBase.ts"; then
        sed -i "s|import { SeededRandom } from '../../../core/util/MathUtils';|import { SeededRandom } from '../../../core/util/MathUtils';\nimport { BBox } from '../../../core/util/math/bbox';|" "src/assets/objects/appliances/ApplianceBase.ts"
        echo "Added BBox import to ApplianceBase.ts"
    fi
fi

echo "Import fixes complete!"
