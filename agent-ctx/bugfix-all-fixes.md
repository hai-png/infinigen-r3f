# Bug Fix Summary - infinigen-r3f Codebase

## All 13 bugs fixed

### Bug 1: CaveGenerator perm[] never initialized
- **File**: `src/terrain/caves/CaveGenerator.ts`
- **Fix**: Added `initPerm()` method that populates `perm` array with the standard Perlin permutation table (256 entries duplicated to 512). Called from constructor.

### Bug 2: ErosionEnhanced re-creates droplets incorrectly
- **File**: `src/terrain/erosion/ErosionEnhanced.ts`
- **Fix**: Moved droplet creation INSIDE the iteration loop. Each iteration now creates fresh random droplets (modeling repeated rainfall) while accumulating erosion on the shared heightmap. Previously, droplets were created once and became inactive after the first iteration, making subsequent iterations do nothing.

### Bug 3: TectonicPlateSimulator uses Math.random()
- **File**: `src/terrain/tectonic/TectonicPlateSimulator.ts`
- **Fix**: Added `SeededRandom` import and `rng` field. Replaced all `Math.random()` calls with `this.rng.next()` for deterministic seeded randomness. Updated `updateConfig()` to also re-seed the RNG.

### Bug 4: RiverNetwork tributary logic empty
- **File**: `src/terrain/water/RiverNetwork.ts`
- **Fix**: Implemented tributary joining logic. When a tributary is spawned, the code finds a perpendicular offset source, traces a river path from that source, merges the tributary's flow into the main river at the junction point, and widens the main river at the confluence.

### Bug 5: TerrainGenerator getHeightAt() returns 0
- **File**: `src/terrain/core/TerrainGenerator.ts`
- **Fix**: Added `cachedHeightMap` field. After terrain generation, the heightmap is cached. `getHeightAt()` now performs proper bilinear interpolation on the cached heightmap instead of returning 0.

### Bug 6: SnowSystem applyToGeometry ignores depth map
- **File**: `src/terrain/snow/SnowSystem.ts`
- **Fix**: Modified `applyToGeometry()` to look up snow depth from `this.snowDepthMap` using the vertex's world coordinates mapped to depth map indices, falling back to `baseDepth` only when the depth map is unavailable or the coordinate is out of bounds.

### Bug 7: DoorGenerator geometries never made into Meshes
- **File**: `src/assets/objects/architectural/DoorGenerator.ts`
- **Fix**: Rewrote all geometry creation methods to wrap geometries in `new THREE.Mesh(geometry, material)` before adding to groups. Fixed `createFrame()` to create proper top/left/right jamb meshes, `createPanels()` to add mesh children, `createHandle()` to create knob/lever/pull meshes, `createHinges()` to create hinge meshes, `createGlassPanels()` to create glass meshes, `addDecorativePanels()` to create decorative meshes, and `createSlidingHandle()` to create handle mesh.

### Bug 8: AtmosphericSky shaders won't compile
- **File**: `src/assets/weather/atmosphere/AtmosphericSky.ts`
- **Fix**: Fixed sun and moon disc shaders. Added `uniform vec2 resolution` and `uniform float aspectRatio` declarations to fragment shaders. Changed vertex shaders from `gl_Position = vec4(position, 1.0)` to proper projection using `modelViewMatrix` and `projectionMatrix`. Changed fragment shaders to use `vUv` (passed from vertex shader) instead of `gl_FragCoord.xy / resolution`.

### Bug 9: TreeGenerator palm fronds returns only first geometry
- **File**: `src/assets/objects/vegetation/trees/TreeGenerator.ts`
- **Fix**: Replaced `return geometries[0]` with a proper geometry merge. The method now merges all 8 frond geometries into a single `BufferGeometry` by combining position/normal attributes and reindexing.

### Bug 10: WeatherSystem lightning is just console.log
- **File**: `src/assets/weather/WeatherSystem.ts`
- **Fix**: Replaced `console.log('⚡ Lightning strike!')` with a full visual lightning effect: creates a bright PointLight flash, generates a jagged bolt path using thin CylinderGeometry segments, adds a glow effect around the bolt, and implements a flicker effect with timed removal/cleanup.

### Bug 11: LightingSystem uses CubeTextureLoader for equirectangular HDR
- **File**: `src/assets/lighting/LightingSystem.ts`
- **Fix**: Replaced `CubeTextureLoader` (which loads 6 face textures) with `RGBELoader` (from `three/examples/jsm/loaders/RGBELoader.js`) which properly loads equirectangular HDR files. Removed the `loadCubeTexture()` helper method.

### Bug 12: PhysicsWorld is a 1-line stub
- **File**: `src/sim/physics/PhysicsWorld.ts`
- **Fix**: Implemented complete physics system with: `RigidBody` class (mass, position, velocity, acceleration, force, AABB collision bounds, restitution, friction), `PhysicsWorld` class with gravity, semi-implicit Euler integration, AABB collision detection and impulse-based resolution with friction, raycasting support, and proper cleanup.

### Bug 13: DataPipeline renderColorImage() returns ""
- **File**: `src/datagen/pipeline/DataPipeline.ts`
- **Fix**: Implemented `renderColorImage()` using `OffscreenCanvas` + `THREE.WebGLRenderer`. Creates an offscreen canvas (with fallback to regular canvas), configures the renderer with proper tone mapping, renders the scene, and converts the result to a blob URL or data URL.
