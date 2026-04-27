#!/bin/bash

# Remove duplicate SeededRandom imports from files
FILES=(
    "src/assets/materials/coating/CoatingGenerator.ts"
    "src/assets/materials/decals/DecalSystem.ts"
    "src/assets/materials/patterns/PatternGenerator.ts"
    "src/assets/materials/surface/SurfaceDetail.ts"
    "src/assets/materials/wear/WearGenerator.ts"
    "src/assets/materials/weathering/Weathering.ts"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        # Keep only the first occurrence of SeededRandom import
        awk '!(/import.*SeededRandom/ && seen++)' "$file" > temp_file && mv temp_file "$file"
        echo "Fixed duplicates in: $file"
    fi
done

echo "Duplicate fix complete!"
