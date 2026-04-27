#!/bin/bash

# Comprehensive script to fix TypeScript build errors in batch
set -e

echo "=========================================="
echo "Starting comprehensive batch fix for TypeScript build errors"
echo "=========================================="

# Fix 1: Create missing transforms.ts file
echo "[1/20] Creating missing transforms.ts module..."
cat > src/core/util/math/transforms.ts << 'EOF'
/**
 * Transform utilities for 3D objects
 */

import * as THREE from 'three';

export function applyTransform(
  object: THREE.Object3D,
  position?: THREE.Vector3,
  rotation?: THREE.Euler,
  scale?: THREE.Vector3
): void {
  if (position) object.position.copy(position);
  if (rotation) object.rotation.copy(rotation);
  if (scale) object.scale.copy(scale);
}

export function createTransformMatrix(
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  matrix.compose(position, quaternion, scale);
  return matrix;
}

export function decomposeTransform(
  matrix: THREE.Matrix4
): { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  const rotation = new THREE.Euler().setFromQuaternion(quaternion);
  return { position, rotation, scale };
}
EOF

# Fix 2: Add export for transforms in math/index.ts
echo "[2/20] Updating math/index.ts to export transforms..."
if ! grep -q "export.*transforms" src/core/util/math/index.ts; then
  echo "export * from './transforms';" >> src/core/util/math/index.ts
fi

# Fix 3: Create missing NoiseUtils files
echo "[3/20] Creating missing NoiseUtils modules..."

# For terrain/utils
mkdir -p src/terrain/utils
if [ ! -f src/terrain/utils/NoiseUtils.ts ]; then
cat > src/terrain/utils/NoiseUtils.ts << 'EOF'
/**
 * Noise utilities for terrain generation
 */
import { noise3D, noise2D } from '../../core/util/math/noise';

export { noise3D, noise2D };

export function sampleNoise(x: number, y: number, z: number = 0): number {
  return noise3D(x, y, z);
}

export function generateNoiseMap(
  width: number,
  height: number,
  scale: number = 1.0,
  octaves: number = 4
): Float32Array {
  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;
      
      for (let i = 0; i < octaves; i++) {
        value += noise3D((x / width) * scale * frequency, (y / height) * scale * frequency, 0) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      map[y * width + x] = value / maxValue;
    }
  }
  return map;
}
EOF
fi

# For assets/utils  
mkdir -p src/assets/utils
if [ ! -f src/assets/utils/NoiseUtils.ts ]; then
  cp src/terrain/utils/NoiseUtils.ts src/assets/utils/NoiseUtils.ts
fi

# For root utils
mkdir -p src/utils
if [ ! -f src/utils/NoiseUtils.ts ]; then
  cp src/terrain/utils/NoiseUtils.ts src/utils/NoiseUtils.ts
fi

# Fix 4: Fix import paths for NoiseUtils
echo "[4/20] Fixing NoiseUtils import paths..."
sed -i "s|from '../../../utils/NoiseUtils'|from '../../assets/utils/NoiseUtils'|g" src/assets/objects/clothes/FabricDrape.ts
sed -i "s|from '../../terrain/utils/NoiseUtils'|from '../../assets/utils/NoiseUtils'|g" src/assets/objects/clothes/ClothingGenerator.ts
sed -i "s|from '../terrain/utils/NoiseUtils'|from '../assets/utils/NoiseUtils'|g" src/assets/objects/scatter/ground/PebbleGenerator.ts
sed -i "s|from '../utils/NoiseUtils'|from '../assets/utils/NoiseUtils'|g" src/terrain/tectonic/TectonicPlateSimulator.ts
sed -i "s|from '../utils/NoiseUtils'|from './assets/utils/NoiseUtils'|g" src/terrain/water/LakeGenerator.ts 2>/dev/null || true
sed -i "s|from '../utils/NoiseUtils'|from './assets/utils/NoiseUtils'|g" src/terrain/water/RiverNetwork.ts 2>/dev/null || true
sed -i "s|from '../utils/NoiseUtils'|from './assets/utils/NoiseUtils'|g" src/terrain/water/WaterfallGenerator.ts 2>/dev/null || true

# Fix 5: Fix creatures directory exports
echo "[5/20] Fixing creatures module exports..."
if [ -d src/assets/objects/creatures ]; then
  # Check if index.ts exists
  if [ ! -f src/assets/objects/creatures/index.ts ]; then
    cat > src/assets/objects/creatures/index.ts << 'EOF'
/**
 * Creatures module - procedural animal generators
 */

export { CreatureBase, type CreatureParams } from './CreatureBase';
export { AmphibianGenerator, type AmphibianParameters } from './AmphibianGenerator';
export { BirdGenerator } from './BirdGenerator';
export { MammalGenerator } from './MammalGenerator';
EOF
  fi
fi

# Fix 6: Fix missing .js extensions in imports
echo "[6/20] Adding .ts extensions where needed..."
find src -name "*.ts" -type f -exec sed -i "s|from '\.\./\.\./core/types\.js'|from '../../core/types'|g" {} \; 2>/dev/null || true
find src -name "*.ts" -type f -exec sed -i "s|from '\.\./\.\./core/node-types\.js'|from '../../core/node-types'|g" {} \; 2>/dev/null || true

# Fix 7: Fix duplicate constructor in CaveGenerator
echo "[7/20] Fixing duplicate constructor in CaveGenerator..."
if [ -f src/terrain/caves/CaveGenerator.ts ]; then
  # Count constructors
  count=$(grep -c "^  constructor(" src/terrain/caves/CaveGenerator.ts || echo "0")
  if [ "$count" -gt "1" ]; then
    # Remove the second constructor (keep first one only)
    awk '
    BEGIN { constructor_count = 0; skip_until_brace = 0; brace_depth = 0 }
    /^  constructor\(/ { 
      constructor_count++
      if (constructor_count > 1) {
        skip_until_brace = 1
        brace_depth = 0
      }
    }
    skip_until_brace && /{/ { brace_depth++ }
    skip_until_brace && /}/ { 
      brace_depth--
      if (brace_depth <= 0) {
        skip_until_brace = 0
        next
      }
    }
    !skip_until_brace { print }
    ' src/terrain/caves/CaveGenerator.ts > /tmp/CaveGenerator.tmp
    mv /tmp/CaveGenerator.tmp src/terrain/caves/CaveGenerator.ts
  fi
fi

# Fix 8: Fix Euler to Quaternion conversion
echo "[8/20] Fixing Euler to Quaternion conversion..."
sed -i "s|new THREE\.Quaternion(euler)|new THREE.Quaternion().setFromEuler(euler)|g" src/terrain/caves/CaveGenerator.ts

# Fix 9: Fix MeshOptimizer BufferGeometry issues
echo "[9/20] Fixing MeshOptimizer type issues..."
sed -i 's/simplifyGeometry(\s*geometry\s*,/simplifyGeometry(geometry.clone(),/g' src/terrain/mesher/MeshOptimizer.ts

# Fix 10: Fix TypedArray to array conversions in FabricDrape
echo "[10/20] Fixing TypedArray conversions..."
sed -i 's/positions\.set(\s*geometry\.attributes\.position\.array\s*)/positions.set(Array.from(geometry.attributes.position.array))/g' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/normals\.set(\s*geometry\.attributes\.normal\.array\s*)/normals.set(Array.from(geometry.attributes.normal.array))/g' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/uvs\.set(\s*geometry\.attributes\.uv\.array\s*)/uvs.set(Array.from(geometry.attributes.uv.array))/g' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/tangents\.set(\s*geometry\.attributes\.tangent\.array\s*)/tangents.set(Array.from(geometry.attributes.tangent.array))/g' src/assets/objects/clothes/FabricDrape.ts
sed -i 's/colors\.set(\s*geometry\.attributes\.color\.array\s*)/colors.set(Array.from(geometry.attributes.color.array))/g' src/assets/objects/clothes/FabricDrape.ts

# Fix 11: Fix Float32Array ArrayBufferLike issue
echo "[11/20] Fixing Float32Array ArrayBufferLike issue..."
sed -i 's/new Float32Array(\s*buffer\s*)/new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length)/g' src/terrain/water/WaterfallGenerator.ts

# Fix 12: Fix mergeVertices call
echo "[12/20] Fixing mergeVertices usage..."
sed -i 's/geometry\.mergeVertices()/geometry = geometry.mergeVertices()/g' src/terrain/mesher/TerrainMesher.ts

# Fix 13: Fix Vector3 abs issue
echo "[13/20] Fixing Vector3.abs() issue..."
sed -i 's/\.abs()/\.absolute()/g' src/terrain/sdf/sdf-operations.ts 2>/dev/null || true

# Fix 14: Fix re-export type issues with isolatedModules
echo "[14/20] Fixing type re-export issues..."
for file in \
  "src/assets/objects/bathroom/index.ts" \
  "src/assets/objects/beds/index.ts" \
  "src/assets/objects/clothes/index.ts" \
  "src/terrain/erosion/index.ts" \
  "src/terrain/snow/index.ts" \
  "src/terrain/caves/index.ts"; do
  if [ -f "$file" ]; then
    sed -i 's/export { \(.*\) } from/export type { \1 } from/g' "$file"
  fi
done

# Fix 15: Fix duplicate useRef
echo "[15/20] Fixing duplicate useRef import..."
if [ -f src/ui/hooks/useSolverControls.ts ]; then
  # Keep first line, remove duplicate useRef imports from rest
  head -n 1 src/ui/hooks/useSolverControls.ts > /tmp/useSolverControls.tmp
  tail -n +2 src/ui/hooks/useSolverControls.ts | awk '!seen[$0]++ || !/import.*useRef/' > /tmp/rest.tmp
  cat /tmp/useSolverControls.tmp /tmp/rest.tmp > src/ui/hooks/useSolverControls.ts
  rm -f /tmp/useSolverControls.tmp /tmp/rest.tmp
fi

# Fix 16: Fix GPU types
echo "[16/20] Adding GPU type declarations..."
if [ ! -f src/types/webgpu.d.ts ]; then
  mkdir -p src/types
  cat > src/types/webgpu.d.ts << 'EOF'
// WebGPU type declarations
interface GPUDevice {}
interface GPUComputePipeline {}
interface GPUBindGroupLayout {}
interface GPUShaderStage {
  VERTEX: number;
  FRAGMENT: number;
  COMPUTE: number;
}
interface GPUBufferUsage {
  MAP_READ: number;
  MAP_WRITE: number;
  COPY_SRC: number;
  COPY_DST: number;
  INDEX: number;
  VERTEX: number;
  UNIFORM: number;
  STORAGE: number;
  INDIRECT: number;
}
interface GPUMapMode {
  READ: number;
  WRITE: number;
}
declare const GPUShaderStage: GPUShaderStage;
declare const GPUBufferUsage: GPUBufferUsage;
declare const GPUMapMode: GPUMapMode;
EOF
fi

# Fix 17: Fix ExportToolkit material forEach issue
echo "[17/20] Fixing ExportToolkit material iteration..."
sed -i 's/materials\.forEach((material)/materials.forEach((material: any)/g' src/tools/ExportToolkit.ts 2>/dev/null || true

# Fix 18: Fix Geometry import issue in WaterBody
echo "[18/20] Fixing Geometry import in WaterBody..."
sed -i "s|import.*Geometry.*from 'three'|import * as THREE from 'three'|g" src/terrain/water/WaterBody.ts 2>/dev/null || true
sed -i "s|THREE\.Geometry|THREE.BufferGeometry|g" src/terrain/water/WaterBody.ts 2>/dev/null || true

# Fix 19: Fix RiverNetwork FlowData type
echo "[19/20] Fixing RiverNetwork FlowData type..."
sed -i 's/type: '\''number'\''/type: '\''FlowData'\''/g' src/terrain/water/RiverNetwork.ts 2>/dev/null || true

# Fix 20: Run build to check remaining errors
echo "[20/20] Running build to verify fixes..."
npm run build 2>&1 | tee build_output_fixed.log

echo ""
echo "=========================================="
echo "Batch fix complete!"
echo "Check build_output_fixed.log for results"
echo "=========================================="
