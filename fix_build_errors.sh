#!/bin/bash

# Script to fix TypeScript build errors in batch
set -e

echo "Starting batch fix for TypeScript build errors..."

# Fix 1: Add missing THREE import in StaircaseGenerator.ts
echo "Fixing StaircaseGenerator.ts - adding THREE import..."
sed -i '1i import * as THREE from '\''three'\'';' src/assets/objects/architectural/StaircaseGenerator.ts

# Fix 2: Fix re-exporting type issues with isolatedModules
echo "Fixing type re-export issues..."

# bathroom/index.ts
sed -i 's/export { BathroomFixtureParams, FixtureType } from/export type { BathroomFixtureParams, FixtureType } from/' src/assets/objects/bathroom/index.ts

# beds/index.ts  
sed -i 's/export { BedParams, BedStyle } from/export type { BedParams, BedStyle } from/' src/assets/objects/beds/index.ts

# clothes/index.ts
sed -i 's/export { ClothingParams, ClothingType, FabricType, WearState } from/export type { ClothingParams, ClothingType, FabricType, WearState } from/' src/assets/objects/clothes/index.ts

# caves/index.ts
sed -i 's/export { CaveParams, CaveStyle } from/export type { CaveParams, CaveStyle } from/' src/assets/objects/caves/index.ts

# erosion/index.ts
sed -i 's/export type ErosionParams, ErosionType } from/export type { ErosionParams, ErosionType } from/' src/terrain/erosion/index.ts 2>/dev/null || true

# snow/index.ts
sed -i 's/export { SnowParams } from/export type { SnowParams } from/' src/terrain/snow/index.ts

# Fix 3: Fix duplicate useRef in useSolverControls.ts
echo "Fixing duplicate useRef in useSolverControls.ts..."
# Remove the duplicate import line (line 167 area)
head -n 1 src/ui/hooks/useSolverControls.ts > /tmp/useSolverControls.tmp
tail -n +2 src/ui/hooks/useSolverControls.ts | grep -v "^import.*useRef.*from.*react" >> /tmp/useSolverControls.tmp || true
mv /tmp/useSolverControls.tmp src/ui/hooks/useSolverControls.ts

# Fix 4: Fix TypedArray to number[] conversion in FabricDrape.ts
echo "Fixing TypedArray issues in FabricDrape.ts..."
sed -i 's/positions\.set( geometry\.attributes\.position\.array)/positions.set(Array.from(geometry.attributes.position.array))/' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/normals\.set( geometry\.attributes\.normal\.array)/normals.set(Array.from(geometry.attributes.normal.array))/' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/uvs\.set( geometry\.attributes\.uv\.array)/uvs.set(Array.from(geometry.attributes.uv.array))/' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/tangents\.set( geometry\.attributes\.tangent\.array)/tangents.set(Array.from(geometry.attributes.tangent.array))/' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/colors\.set( geometry\.attributes\.color\.array)/colors.set(Array.from(geometry.attributes.color.array))/' src/assets/objects/clothes/FabricDrape.ts

# Fix 5: Fix Float32Array ArrayBufferLike issue in WaterfallGenerator.ts
echo "Fixing Float32Array ArrayBufferLike issue..."
sed -i 's/new Float32Array( buffer )/new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length)/' src/terrain/water/WaterfallGenerator.ts

# Fix 6: Fix MeshOptimizer BufferGeometry issues
echo "Fixing MeshOptimizer type issues..."
sed -i 's/geometry\.mergeVertices()/geometry = geometry.mergeVertices()/' src/terrain/mesher/TerrainMesher.ts

echo "Batch fixes applied. Running build to check remaining errors..."
npm run build 2>&1 | tee build_output_after_fix.log

echo "Done! Check build_output_after_fix.log for remaining errors."
