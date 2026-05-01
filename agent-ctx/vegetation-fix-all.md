# Task: Fix All Vegetation Generators and Scatter Systems

## Summary

Fixed all 16 vegetation generators and 3 scatter systems in the infinigen-r3f codebase to ensure they produce visible geometry wrapped in `Mesh(geometry, MeshStandardMaterial)` and use `SeededRandom` throughout.

## Files Modified

### Vegetation Generators (16 files)

1. **TreeGenerator.ts** - Fixed foliage positioning to use actual trunk height (was using `config.trunkHeight.max` causing foliage to float). Refactored `generateTrunk` to return actual height. Added `mergeGeometries` helper. All 5 species (oak, pine, birch, palm, willow) now produce visible trees.

2. **DeciduousGenerator.ts** - Added **branch recursion** via `createBranchesRecursive()` with configurable `maxRecursion` depth. Each branch can spawn sub-branches. Crown uses InstancedMesh with 250 spheres.

3. **ConiferGenerator.ts** - Refined cone-shaped branch layers with proper radius tapering. Lower tiers wider, upper tiers narrower creating classic conifer silhouette.

4. **PalmGenerator.ts** - Curved trunk via CatmullRomCurve3 + TubeGeometry. 10 radiating fronds each with stem + 10 paired leaf blades. Coconut spheres for coconut type.

5. **FruitTreeGenerator.ts** - Like deciduous with recursive branching + fruit spheres. Uses InstancedMesh for both crown (180 spheres) and fruit.

6. **FlowerGenerator.ts** - Stem + elliptical petals arranged radially + center sphere. Improved petal geometry using `ShapeGeometry` with proper Shape paths instead of squashed CircleGeometry.

7. **ShrubGenerator.ts** - Multiple stems + leaf clusters (spherical, elliptical, irregular, flat). Flat foliage merges all frond geometries. Berry support.

8. **FernGenerator.ts** - Central stem base + fronds radiating outward with alternating pinnae (leaflets) on both sides. Pinnae use visible `ShapeGeometry` instead of paper-thin `ExtrudeGeometry(depth=0.001)`.

9. **GrassGenerator.ts** - Blade clusters via InstancedMesh with tapered PlaneGeometry. Color variation support.

10. **MushroomGenerator.ts** - Stem + dome-shaped cap (hemisphere for most, cone for morel, full sphere for puffball). Gill detail planes.

11. **MossGenerator.ts** - **Bumpy patches** instead of flat planes. Sheet moss uses vertex-displaced PlaneGeometry with layered sine bumps. Clump moss uses InstancedMesh spheres. Lichen uses subtle bumps with pale color.

12. **MonocotGenerator.ts** - Stem + blade leaves with taper and curvature. PlaneGeometry leaves with vertex displacement for droop.

13. **TropicPlantGenerator.ts** - Large Bézier-curve leaves in spiral pattern with droop and waviness. Aerial roots for monstera/philodendron.

14. **SmallPlantGenerator.ts** - 6 species (succulent, cactus, fern, aloe, jade, spider_plant). All use MeshStandardMaterial.

15. **VineGenerator.ts** - Curved stems + **leaf PAIRS** (two leaves at each node, opposite sides). Previously leaves were randomly placed. Now uses `generateLeafPairs()` method.

16. **IvyGenerator.ts** - **Branching vine** with configurable `branchCount`. Main vine + branch vines positioned along it. Each vine has TubeGeometry stem + ShapeGeometry leaves.

### Scatter Systems (4 files)

17. **GrassScatterSystem.ts** - Already used SeededRandom throughout. No changes needed.

18. **RockScatterSystem.ts** - Replaced `Math.floor(Math.random() * 10000)` with `42` default seed. Added `seed` field to `RockScatterConfig` interface.

19. **InstanceScatterSystem.ts** - Replaced `MathUtils.randFloat()` calls in `randomQuaternion()` with `SeededRandom.uniform()`. Added `rng` parameter to `randomQuaternion()`. Updated `calculateRotation()` to pass `this.rng`. Removed `MathUtils` import.

20. **RockGenerator.ts** (bonus) - Replaced ALL 15+ `Math.random()` calls with `this.rng.next()` / `this.rng.uniform()`. Added `SeededRandom` import and `rng` field.

## Key Principles Applied

- All geometries wrapped in `Mesh(geometry, MeshStandardMaterial)` 
- No `Math.random()` — all randomness via `SeededRandom`
- No `ExtrudeGeometry(depth=0.001)` — replaced with visible `ShapeGeometry`
- No `MathUtils.randFloat` — replaced with `SeededRandom.uniform`
- All materials explicitly set `metalness: 0.0` and `roughness` values
- `DoubleSide` used for thin/flat geometries (leaves, petals, fronds)
