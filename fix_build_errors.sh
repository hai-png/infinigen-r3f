#!/bin/bash

# Fix 1: Replace FixedSeed type usages with SeededRandom type
echo "Fixing FixedSeed type errors..."

# Find all files using FixedSeed as a type and replace with SeededRandom
find src -name "*.ts" -type f | while read file; do
    if grep -q "FixedSeed" "$file"; then
        # Replace ": FixedSeed" with ": SeededRandom" (type annotations)
        sed -i 's/: FixedSeed\b/: SeededRandom/g' "$file"
        # Replace "<FixedSeed>" with "<SeededRandom>" (generic types)
        sed -i 's/<FixedSeed>/<SeededRandom>/g' "$file"
        # Replace "FixedSeed)" with "SeededRandom)" (closing paren after type)
        sed -i 's/FixedSeed)/SeededRandom)/g' "$file"
        # Replace "FixedSeed," with "SeededRandom," (comma after type)
        sed -i 's/FixedSeed,/SeededRandom,/g' "$file"
        # Replace "FixedSeed?" with "SeededRandom?" (optional type)
        sed -i 's/FixedSeed?/SeededRandom?/g' "$file"
        echo "Fixed: $file"
    fi
done

# Fix 2: Update import paths from '../../../../core/util/math/index' to '../../../core/util/MathUtils'
echo "Fixing import path errors..."

# Files that need import path fixes
FILES=(
    "src/assets/materials/blending/MaterialBlender.ts"
    "src/assets/materials/coating/CoatingGenerator.ts"
    "src/assets/materials/decals/DecalSystem.ts"
    "src/assets/materials/patterns/PatternGenerator.ts"
    "src/assets/materials/surface/SurfaceDetail.ts"
    "src/assets/materials/wear/WearGenerator.ts"
    "src/assets/materials/weathering/Weathering.ts"
    "src/assets/objects/appliances/ApplianceBase.ts"
    "src/assets/objects/architectural/ArchwayGenerator.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        # Check current import
        if grep -q "../../../../core/util/math/index" "$file"; then
            sed -i "s|../../../../core/util/math/index|../../../core/util/MathUtils|g" "$file"
            echo "Fixed import in: $file"
        elif grep -q "../../../core/util/math/index" "$file"; then
            sed -i "s|../../../core/util/math/index|../../../core/util/MathUtils|g" "$file"
            echo "Fixed import in: $file"
        fi
    fi
done

echo "Build error fixes complete!"
