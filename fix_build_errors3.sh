#!/bin/bash

# Fix material category generators - replace FixedSeed import with SeededRandom
echo "Fixing material category generator imports..."

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
        # Replace the FixedSeed import line with SeededRandom import
        sed -i 's|import { FixedSeed } from.*MathUtils.*|import { SeededRandom } from "../../../../core/util/MathUtils";|g' "$file"
        sed -i 's|import { FixedSeed } from.*math/index.*|import { SeededRandom } from "../../../../core/util/MathUtils";|g' "$file"
        echo "Fixed import in: $file"
    fi
done

echo "Import fixes complete!"
