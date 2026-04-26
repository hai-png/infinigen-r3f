#!/bin/bash

# Script to systematically fix import path issues in TypeScript files

echo "Starting systematic import path fixes..."

# Fix 1: Fix core/util/math/utils imports (should be ../../core/util/math/utils or similar)
echo "Fixing core/util/math/utils imports..."
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./core/util/math/utils'|from '../../../../core/util/math/utils'|g" {} \;
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./\.\./core/util/math/utils'|from '../../../../core/util/math/utils'|g" {} \;
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./\.\./\.\./core/util/math/utils'|from '../../../../../core/util/math/utils'|g" {} \;

# Fix 2: Fix core/util/math/noise imports
echo "Fixing core/util/math/noise imports..."
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./core/util/math/noise'|from '../../../../core/util/math/noise'|g" {} \;
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./\.\./core/util/math/noise'|from '../../../../core/util/math/noise'|g" {} \;

# Fix 3: Fix BaseMaterialGenerator imports
echo "Fixing BaseMaterialGenerator imports..."
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./BaseMaterialGenerator'|from '../../BaseMaterialGenerator'|g" {} \;

# Fix 4: Fix BaseObjectGenerator imports  
echo "Fixing BaseObjectGenerator imports..."
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\./utils/BaseObjectGenerator'|from '../utils/BaseObjectGenerator'|g" {} \;
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\./BaseObjectGenerator'|from '../BaseObjectGenerator'|g" {} \;

# Fix 5: Fix Transform imports
echo "Fixing Transform imports..."
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./core/util/math/transforms'|from '../../../../core/util/math/transforms'|g" {} \;

# Fix 6: Fix Vector3, Quaternion imports from math directory
echo "Fixing Vector3/Quaternion imports..."
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./core/util/math/vector'|from '../../../../core/util/math/vector'|g" {} \;
find src -name "*.ts" -type f -exec sed -i \
  "s|from '\.\./\.\./\.\./core/util/math/quaternion'|from '../../../../core/util/math/quaternion'|g" {} \;

echo "Import path fixes completed!"
echo "Running TypeScript compiler to check for remaining errors..."
npx tsc --noEmit 2>&1 | head -100
