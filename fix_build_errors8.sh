#!/bin/bash

# Fix remaining FixedSeed references in ArchwayGenerator.ts
echo "Fixing ArchwayGenerator.ts FixedSeed usage..."
if [ -f "src/assets/objects/architectural/ArchwayGenerator.ts" ]; then
    # Replace FixedSeed with SeededRandom
    sed -i 's/\bFixedSeed\b/SeededRandom/g' "src/assets/objects/architectural/ArchwayGenerator.ts"
    echo "Fixed FixedSeed reference in ArchwayGenerator.ts"
fi

# Find all files still using FixedSeed and fix them
echo "Finding and fixing remaining FixedSeed references..."
find src -name "*.ts" -type f | while read file; do
    if grep -q "\bFixedSeed\b" "$file"; then
        sed -i 's/\bFixedSeed\b/SeededRandom/g' "$file"
        echo "Fixed: $file"
    fi
done

echo "Fixes complete!"
