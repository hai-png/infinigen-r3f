#!/bin/bash

# The issue is that SeededRandom is a class, so it can be used as a type directly
# But there was a line "export const SeededRandom = SeededRandom;" which created a circular reference
# We already fixed that by changing it to "export type SeededRandomType = SeededRandom;"

# Now we need to check if files are importing correctly
# For classes in TypeScript, you import them and use them as types directly

echo "Checking MaterialBlender.ts imports..."
head -15 src/assets/materials/blending/MaterialBlender.ts

echo ""
echo "Checking CeramicGenerator.ts imports..."
head -15 src/assets/materials/categories/Ceramic/CeramicGenerator.ts

echo "Fixes complete!"
