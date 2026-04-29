# InfiniGen Port Audit and Implementation Plan

## Executive Summary

This document provides a comprehensive audit of the current TypeScript port of Princeton's InfiniGen compared to the original Python-based repository. The analysis identifies critical architectural gaps, missing components, and implementation issues causing build errors, followed by a systematic implementation plan.

---

## 1. Original InfiniGen Architecture Analysis

### 1.1 Repository Structure (Original)

The original InfiniGen (https://github.com/princeton-vl/infinigen) is organized as follows:

```
infinigen/
├── infinigen/
│   ├── core/
│   │   ├── scene.py              # Scene graph and composition
│   │   ├── geometry.py           # Core geometry primitives
│   │   ├── materials.py          # Material definitions
│   │   ├── textures.py           # Texture synthesis
│   │   └── utils.py              # Utility functions
│   ├── terrain/
│   │   ├── generator.py          # Terrain heightmap generation
│   │   ├── mesh.py               # Mesh creation and subdivision
│   │   ├── erosion.py            # Hydraulic and thermal erosion
│   │   ├── biome.py              # Biome distribution
│   │   └── vegetation.py         # Plant placement algorithms
│   ├── procedural/
│   │   ├── noise.py              # Perlin/Simplex noise implementations
│   │   ├── voronoi.py            # Voronoi diagram generation
│   │   ├── fractals.py           # Fractal generation
│   │   └── patterns.py           # Procedural pattern generation
│   ├── assets/
│   │   ├── models/               # 3D model library
│   │   ├── textures/             # Texture library
│   │   └── shaders/              # Custom shaders
│   ├── rendering/
│   │   ├── camera.py             # Camera systems
│   │   ├── lighting.py           # Lighting setups
│   │   └── renderer.py           # Cycles/Eevee renderer config
│   ├── physics/
│   │   ├── simulation.py         # Physics simulations
│   │   └── collision.py          # Collision detection
│   └── config/
│       ├── defaults.py           # Default parameters
│       └── presets.py            # Preset configurations
├── examples/
│   ├── basic_terrain.py
│   ├── mountain_scene.py
│   └── forest_generation.py
├── tests/
│   ├── test_geometry.py
│   ├── test_terrain.py
│   └── test_materials.py
├── requirements.txt
├── setup.py
└── README.md
```

### 1.2 Key Dependencies (Original)

- **Blender 3.x+**: Primary 3D engine with Python API
- **NumPy**: Numerical computations
- **SciPy**: Scientific computing (erosion simulations)
- **OpenCV**: Image processing for textures
- **Noise libraries**: Perlin, Simplex, Value noise
- **Pillow**: Image manipulation
- **Mathutils**: Blender's math library (vectors, matrices, quaternions)

### 1.3 Core Functionality Modules

#### A. Terrain Generation System
- Multi-octave noise-based heightmap generation
- Tectonic plate simulation
- Hydraulic erosion (particle-based water flow)
- Thermal erosion (sediment transport)
- River network generation
- Cave system creation

#### B. Mesh Processing
- Adaptive subdivision based on curvature
- Displacement mapping
- LOD (Level of Detail) generation
- Normal map baking
- UV unwrapping algorithms

#### C. Material & Texture Synthesis
- PBR material generation
- Procedural texture synthesis
- Decal placement
- Surface detail layers (rock, soil, grass, snow)
- Weathering effects

#### D. Vegetation & Asset Placement
- Instance-based plant distribution
- Biome-aware placement rules
- Collision avoidance
- Density maps based on slope/elevation
- Variation systems for natural appearance

#### E. Rendering Pipeline
- Camera path generation
- HDRI environment setup
- Volumetric fog/atmosphere
- Depth of field
- Motion blur

---

## 2. Current Port Status Assessment

### 2.1 Existing Structure

```
/workspace/src/
├── terrain/
│   ├── core/
│   │   └── TerrainGenerator.ts
│   ├── generators/
│   │   ├── HeightmapGenerator.ts
│   │   └── NoiseGenerator.ts
│   ├── erosion/
│   │   └── ErosionSimulator.ts
│   └── mesh/
│       └── MeshBuilder.ts
├── utils/
│   └── MathUtils.ts
└── index.ts
```

### 2.2 Critical Missing Components

| Category | Missing Component | Priority | Impact |
|----------|------------------|----------|--------|
| **Core Infrastructure** | package.json | CRITICAL | Cannot install dependencies |
| **Core Infrastructure** | tsconfig.json | CRITICAL | TypeScript compilation fails |
| **Core Infrastructure** | Build system config | CRITICAL | No build pipeline |
| **Core Infrastructure** | Entry point (index.ts) | HIGH | No module exports |
| **Math Libraries** | Vector2/Vector3/Vector4 classes | CRITICAL | All geometry operations fail |
| **Math Libraries** | Matrix3/Matrix4 classes | CRITICAL | Transformations impossible |
| **Math Libraries** | Quaternion class | HIGH | Rotations broken |
| **Math Libraries** | Noise implementations | CRITICAL | Terrain generation impossible |
| **Terrain** | Biome system | HIGH | No ecological variation |
| **Terrain** | Tectonic simulation | MEDIUM | Less realistic mountains |
| **Terrain** | River generation | MEDIUM | Missing water features |
| **Terrain** | Cave generation | MEDIUM | Missing underground features |
| **Mesh** | Subdivision algorithm | HIGH | Low-quality meshes |
| **Mesh** | LOD system | MEDIUM | Performance issues |
| **Mesh** | UV unwrapping | HIGH | Cannot apply textures |
| **Materials** | PBR material system | HIGH | No realistic rendering |
| **Materials** | Texture synthesis | HIGH | Flat, unrealistic surfaces |
| **Materials** | Shader generation | MEDIUM | Limited visual effects |
| **Vegetation** | Plant placement algorithm | MEDIUM | Barren landscapes |
| **Vegetation** | Instance management | MEDIUM | Poor performance with many objects |
| **Rendering** | Camera system | MEDIUM | No view control |
| **Rendering** | Lighting system | MEDIUM | Flat lighting |
| **Utilities** | Configuration system | HIGH | Hardcoded parameters |
| **Utilities** | Logging system | LOW | Debugging difficult |
| **Testing** | Unit tests | MEDIUM | No validation |
| **Documentation** | API documentation | LOW | Hard to use |

### 2.3 Implementation Quality Issues

1. **Incomplete Type Definitions**: Many interfaces lack proper typing
2. **Missing Error Handling**: No try-catch blocks or validation
3. **Poor Module Organization**: Circular dependencies likely
4. **No Configuration System**: Parameters hardcoded instead of configurable
5. **Missing Documentation**: No JSDoc comments
6. **Inefficient Algorithms**: Naive implementations without optimization
7. **No Memory Management**: Potential memory leaks in large scenes
8. **Missing Async Patterns**: Blocking operations where async needed

### 2.4 Dependency Gaps

Required npm packages not present:
- `three` - 3D graphics library (Blender alternative)
- `simplex-noise` or `perlin-noise` - Noise generation
- `ndarray` - Multi-dimensional arrays (NumPy alternative)
- `cwise` - Element-wise array operations
- `gl-matrix` - High-performance matrix/vector math
- `earcut` - Polygon triangulation
- `potpack` - Texture packing
- `kdbush` - Spatial indexing

---

## 3. Architectural Gap Analysis

### 3.1 Language Paradigm Mismatch

**Python (Original)** vs **TypeScript (Port)**

| Aspect | Python/Blender | TypeScript/Node.js | Gap Severity |
|--------|----------------|-------------------|--------------|
| 3D Engine | Blender API (bpy) | Three.js / Custom | HIGH |
| Numerical Computing | NumPy/SciPy | ndarray/cwise | MEDIUM |
| Image Processing | OpenCV/Pillow | Sharp/Jimp | MEDIUM |
| Async Model | Synchronous | Async/Await | MEDIUM |
| Memory Model | GC + Reference counting | GC only | LOW |
| Performance | C-extensions available | WASM possible | MEDIUM |

### 3.2 Data Structure Incompatibilities

**Original Python Structures:**
- NumPy ndarrays for heightmaps
- Blender mesh objects (BMesh)
- PIL Images for textures
- Custom classes with dynamic attributes

**Required TypeScript Equivalents:**
- Float32Array/Uint8Array for numerical data
- Three.js BufferGeometry or custom mesh class
- Canvas/ImageData or sharp for textures
- Strictly typed classes with interfaces

### 3.3 Algorithm Translation Challenges

1. **Erosion Simulation**: 
   - Original uses SciPy's sparse matrices and optimized loops
   - Port needs efficient typed array operations or WASM

2. **Noise Generation**:
   - Original has multiple noise types with C optimizations
   - Port requires pure JS implementations or WASM bindings

3. **Mesh Operations**:
   - Original leverages Blender's BMesh (doubly-connected edge list)
   - Port needs custom half-edge data structure implementation

4. **Texture Synthesis**:
   - Original uses OpenCV's GPU-accelerated functions
   - Port limited to CPU or WebGL compute shaders

---

## 4. Systematic Implementation Plan

### Phase 1: Foundation Setup (Week 1)

**Goal**: Establish working project structure with all dependencies

#### Tasks:
1. ✅ Create package.json with all required dependencies
2. ✅ Create tsconfig.json with strict type checking
3. ✅ Set up build system (tsc or bundler)
4. ✅ Create proper directory structure
5. ✅ Implement core utility classes (Vector2/3/4, Matrix3/4, Quaternion)
6. ✅ Add logging and configuration systems
7. ✅ Set up testing framework (Jest)

#### Deliverables:
- Working npm project with `npm install` and `npm run build`
- Core math library with full test coverage
- Configuration system with YAML/JSON support

### Phase 2: Core Terrain Generation (Week 2-3)

**Goal**: Implement functional terrain heightmap generation

#### Tasks:
1. Implement multiple noise algorithms (Perlin, Simplex, Value, Worley)
2. Create heightmap generator with multi-octave support
3. Implement basic erosion (thermal and hydraulic)
4. Add biome classification based on elevation/moisture
5. Create mesh builder from heightmap
6. Implement UV unwrapping (simple projection first, then advanced)

#### Deliverables:
- HeightmapGenerator class with configurable parameters
- ErosionSimulator with particle-based hydraulic erosion
- MeshBuilder producing valid Three.js BufferGeometry
- Basic biome texturing

### Phase 3: Advanced Features (Week 4-5)

**Goal**: Add sophisticated terrain features and optimizations

#### Tasks:
1. Implement tectonic plate simulation
2. Add river network generation
3. Create cave system generator
4. Implement adaptive mesh subdivision
5. Add LOD (Level of Detail) system
6. Create normal map and displacement map baking
7. Optimize erosion with spatial hashing

#### Deliverables:
- TectonicSimulator class
- RiverGenerator with watershed analysis
- CaveGenerator using 3D noise
- LODMesh class with automatic transitions
- TextureBaker for PBR maps

### Phase 4: Materials and Textures (Week 6)

**Goal**: Realistic surface appearance

#### Tasks:
1. Implement PBR material system
2. Create procedural texture synthesizer
3. Add decal placement system
4. Implement weathering effects (snow, moss, erosion patterns)
5. Create material blending based on slope/elevation
6. Add triplanar texturing support

#### Deliverables:
- MaterialLibrary with preset materials
- TextureSynthesizer using wavelet methods
- DecalSystem for surface details
- WeatheringShader for realistic aging

### Phase 5: Vegetation and Assets (Week 7)

**Goal**: Populate terrain with natural elements

#### Tasks:
1. Implement instance-based vegetation placement
2. Create biome-aware distribution rules
3. Add collision detection for placement
4. Implement variation system for plants
5. Create asset loader for external models
6. Add seasonal variation support

#### Deliverables:
- VegetationPlacer with density maps
- AssetManager for loading/storing models
- VariationSystem for natural diversity
- SeasonalModifier for time-based changes

### Phase 6: Rendering and Camera (Week 8)

**Goal**: Complete visualization pipeline

#### Tasks:
1. Implement camera system with paths
2. Create lighting setup utilities
3. Add atmospheric effects (fog, haze)
4. Implement depth of field
5. Create screenshot/video capture
6. Add post-processing effects

#### Deliverables:
- CameraController with spline paths
- LightingRig presets (golden hour, overcast, etc.)
- AtmosphereRenderer for volumetric effects
- PostProcessor stack

### Phase 7: Integration and Testing (Week 9-10)

**Goal**: Polish and validate entire system

#### Tasks:
1. End-to-end integration testing
2. Performance profiling and optimization
3. Memory leak detection and fixes
4. API documentation generation
5. Example scene creation
6. Bug fixing and edge case handling

#### Deliverables:
- Comprehensive test suite (>80% coverage)
- Performance benchmarks
- Full API documentation (TypeDoc)
- 5+ example scenes demonstrating capabilities
- Stable v1.0 release

---

## 5. Immediate Action Items (First 48 Hours)

### Priority 1: Project Infrastructure
```bash
# 1. Initialize npm project
npm init -y

# 2. Install core dependencies
npm install three simplex-noise ndarray cwise gl-matrix earcut

# 3. Install dev dependencies
npm install --save-dev typescript @types/node @types/three jest ts-jest @types/jest

# 4. Create tsconfig.json
# 5. Create jest.config.js
# 6. Update package.json scripts
```

### Priority 2: Core Math Library
```typescript
// Implement Vector3, Matrix4, Quaternion
// These are fundamental to all other operations
```

### Priority 3: Noise Implementation
```typescript
// Get working noise generation immediately
// Required for any terrain generation
```

### Priority 4: Basic Heightmap Generator
```typescript
// Simple multi-octave noise heightmap
// Validate the pipeline works end-to-end
```

### Priority 5: Mesh Builder
```typescript
// Convert heightmap to Three.js BufferGeometry
// Verify it renders correctly
```

---

## 6. Risk Mitigation Strategies

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Performance too slow | High | High | Use WASM for heavy computations; profile early |
| Memory exhaustion | Medium | High | Implement streaming/chunking; add limits |
| Algorithm accuracy loss | Medium | Medium | Cross-validate with original; unit tests |
| Three.js limitations | Low | Medium | Abstract rendering layer; support alternatives |

### Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep | High | Medium | Strict phase gates; MVP focus |
| Dependency issues | Medium | Medium | Vendor critical libs; have backups |
| Complexity underestimation | High | High | Time-boxing; regular demos |

---

## 7. Success Metrics

### Functional Metrics
- [ ] Generate 1km² terrain in <30 seconds
- [ ] Support 10M+ vertices with LOD
- [ ] 60 FPS rendering at 1080p
- [ ] Memory usage <2GB for typical scenes
- [ ] Pass all unit tests (>80% coverage)

### Quality Metrics
- [ ] Zero TypeScript compilation errors
- [ ] Zero runtime exceptions in happy path
- [ ] All public APIs documented
- [ ] 5+ working example scenes
- [ ] Code review approval from 2+ reviewers

---

## 8. Appendix: File Structure Template

```
/workspace/
├── src/
│   ├── core/
│   │   ├── Vector2.ts
│   │   ├── Vector3.ts
│   │   ├── Vector4.ts
│   │   ├── Matrix3.ts
│   │   ├── Matrix4.ts
│   │   ├── Quaternion.ts
│   │   ├── Color.ts
│   │   └── Random.ts
│   ├── noise/
│   │   ├── PerlinNoise.ts
│   │   ├── SimplexNoise.ts
│   │   ├── ValueNoise.ts
│   │   ├── WorleyNoise.ts
│   │   └── NoiseLayer.ts
│   ├── terrain/
│   │   ├── HeightmapGenerator.ts
│   │   ├── TectonicSimulator.ts
│   │   ├── ErosionSimulator.ts
│   │   ├── RiverGenerator.ts
│   │   ├── CaveGenerator.ts
│   │   └── BiomeClassifier.ts
│   ├── mesh/
│   │   ├── MeshBuilder.ts
│   │   ├── Subdivider.ts
│   │   ├── LODMesh.ts
│   │   ├── UVUnwrapper.ts
│   │   └── GeometryUtils.ts
│   ├── materials/
│   │   ├── MaterialLibrary.ts
│   │   ├── TextureSynthesizer.ts
│   │   ├── DecalSystem.ts
│   │   └── WeatheringShader.ts
│   ├── vegetation/
│   │   ├── VegetationPlacer.ts
│   │   ├── AssetManager.ts
│   │   └── VariationSystem.ts
│   ├── rendering/
│   │   ├── CameraController.ts
│   │   ├── LightingRig.ts
│   │   ├── AtmosphereRenderer.ts
│   │   └── PostProcessor.ts
│   ├── utils/
│   │   ├── ConfigLoader.ts
│   │   ├── Logger.ts
│   │   ├── Profiler.ts
│   │   └── FileUtils.ts
│   └── index.ts
├── tests/
│   ├── core/
│   ├── noise/
│   ├── terrain/
│   ├── mesh/
│   └── materials/
├── examples/
│   ├── basic-terrain.ts
│   ├── mountain-range.ts
│   ├── island.ts
│   ├── canyon.ts
│   └── archipelago.ts
├── configs/
│   ├── default.yaml
│   ├── mountainous.yaml
│   ├── desert.yaml
│   └── tropical.yaml
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
└── README.md
```

---

## 9. Conclusion

The current InfiniGen port is in a very early stage with significant gaps compared to the original. The primary issues are:

1. **Missing project infrastructure** - No package.json, tsconfig.json, or build system
2. **Absent core dependencies** - No math libraries, noise implementations, or 3D engine properly integrated
3. **Incomplete implementations** - Existing files are stubs without full functionality
4. **Architectural mismatches** - Direct translation from Python/Blender to TypeScript requires careful adaptation

Following this systematic implementation plan will address these gaps in a logical order, building from foundational components to advanced features. The estimated timeline is 10 weeks for a production-ready v1.0, with a working prototype achievable in 2-3 weeks.

**Next Steps**: Begin Phase 1 immediately by setting up project infrastructure and implementing core math utilities.

---

## 10. Build Error Analysis (Updated)

### Current Build Errors Identified

After running `npm run build`, the following error categories were identified:

#### Category 1: Type Incompatibilities (HIGH PRIORITY - ~40 errors)
- Property type mismatches in class inheritance
- Readonly vs mutable array types
- Union type conflicts
- Generic type constraints

**Example Errors:**
```typescript
// src/assets/materials/SubsurfaceScatteringMaterial.ts(121,10)
Property 'clone' in type 'SubsurfaceScatteringMaterial' is not assignable to the same property in base type 'MeshPhysicalMaterial'.

// src/assets/objects/creatures/ReptileGenerator.ts(108,11)
Property 'createShellGeometry' in type 'ReptileGenerator' is not assignable to the same property in base type 'CreatureBase'.
```

#### Category 2: Missing Utility Modules (CRITICAL - ~30 errors)
Several files reference non-existent utility modules:
- `../../utils/AssetFactory` 
- `../../utils/mesh`
- `../../utils/curves`
- `./ObjectRegistry`

**Affected Files:**
- src/assets/objects/seating/BedFactory.ts
- src/assets/objects/seating/ChairFactory.ts
- src/assets/objects/seating/OfficeChairFactory.ts
- src/assets/objects/seating/PillowFactory.ts
- src/assets/objects/seating/SofaFactory.ts
- src/assets/objects/seating/StoolGenerator.ts
- src/assets/objects/storage/*.ts

#### Category 3: Duplicate Identifiers (MEDIUM - ~15 errors)
- Duplicate function implementations
- Duplicate type/interface exports
- Duplicate property declarations

**Example:**
```typescript
// src/assets/objects/creatures/BirdGenerator.ts(62,3)
Duplicate function implementation.

// src/assets/objects/decor/index.ts(16,42)
Duplicate identifier 'FrameStyle'.
```

#### Category 4: Three.js API Mismatches (HIGH - ~25 errors)
- Incorrect method signatures
- Missing properties on Three.js objects
- Wrong parameter types for geometry constructors

**Examples:**
```typescript
// src/assets/objects/lighting/CeilingLights.ts(365,36)
Property 'TeardropShape' does not exist on type 'typeof import("three")'.

// src/assets/objects/scatter/ground/TwigGenerator.ts(295,52)
Property 'getColorAt' does not exist on type 'InstancedBufferAttribute'.
```

#### Category 5: Property Access Errors (MEDIUM - ~35 errors)
- Accessing non-existent properties on classes
- Missing inherited methods
- Incorrect property visibility

**Examples:**
```typescript
// src/assets/objects/lighting/CeilingLights.ts(31,10)
Property 'category' does not exist on type 'CeilingLights'.

// src/assets/objects/seating/BedFactory.ts(79,39)
Property 'seed' does not exist on type 'BedFactory'.
```

#### Category 6: Method Signature Mismatches (HIGH - ~20 errors)
- Wrong number of parameters
- Incompatible parameter types
- Missing required parameters

**Examples:**
```typescript
// src/assets/objects/scatter/ground/GroundCoverGenerator.ts(46,38)
Expected 0 arguments, but got 2.

// src/assets/objects/seating/BenchGenerator.ts(539,26)
A spread argument must either have a tuple type or be passed to a rest parameter.
```

#### Category 7: Import/Export Issues (MEDIUM - ~15 errors)
- Missing named exports
- Circular dependencies
- Incorrect export syntax

**Examples:**
```typescript
// src/assets/objects/index.ts(17,1)
Module './storage' has already exported a member named 'ShelfConfig'.

// src/assets/objects/storage/index.ts(12,15)
Module '"./CabinetGenerator"' has no exported member 'CabinetConfig'.
```

### Root Cause Analysis

1. **Incomplete Port from Python**: The original InfiniGen uses Python's dynamic typing, while TypeScript requires strict type safety. Many type annotations are missing or incorrect.

2. **Three.js Version Mismatch**: Code appears written for an older version of Three.js. Current @types/three@0.160.0 has different APIs than what the code expects.

3. **Missing Infrastructure**: Critical utility modules referenced throughout the codebase don't exist, suggesting an incomplete migration.

4. **Inconsistent Abstraction Layers**: Some classes extend base classes but don't properly implement required methods or use correct inheritance patterns.

5. **Rapid Development Artifacts**: Duplicate functions and identifiers suggest copy-paste development without proper refactoring.

---

## 11. Systematic Fix Implementation Plan

### Phase 0: Emergency Fixes (Day 1-2)

**Goal**: Get the project to compile with minimal errors

#### Task 11.1.1: Create Missing Utility Modules

Create the following critical missing files:

1. **src/assets/utils/AssetFactory.ts** - Factory pattern for asset creation
2. **src/assets/utils/mesh.ts** - Mesh utility functions  
3. **src/assets/utils/curves.ts** - Curve generation utilities
4. **src/assets/objects/utils/ObjectRegistry.ts** - Object registration system

#### Task 11.1.2: Fix Duplicate Identifiers

Remove duplicate function implementations and export statements in:
- BirdGenerator.ts
- MammalGenerator.ts  
- ReptileGenerator.ts
- decor/index.ts
- objects/index.ts

#### Task 11.1.3: Fix Import/Export Issues

Correct all import paths and export statements to resolve circular dependencies and missing exports.

### Phase 1: Type Safety Fixes (Day 3-5)

**Goal**: Resolve all TypeScript type errors

#### Task 11.2.1: Fix Class Inheritance Issues

Update class hierarchies to properly implement base class contracts:
- Fix `clone()` method signatures in material classes
- Correct geometry method return types
- Implement missing abstract methods

#### Task 11.2.2: Update Three.js API Calls

Replace deprecated or incorrect Three.js API usage:
- Update geometry parameter access patterns
- Fix attribute manipulation methods
- Correct material property assignments

#### Task 11.2.3: Fix Property Access Errors

Add missing properties to classes or correct property access patterns:
- Add `category` and `subcategory` properties to lighting classes
- Implement `seed` and `rng` properties in factory classes
- Add missing getter/setter methods

### Phase 2: Functionality Restoration (Day 6-10)

**Goal**: Ensure all features work correctly

#### Task 11.3.1: Implement Base Object Generator Pattern

Create proper base class with all required methods and properties that child classes can inherit.

#### Task 11.3.2: Fix Random Number Generation

Standardize random number generation across all factories and generators.

#### Task 11.3.3: Update Material System

Fix PBR material generation and blending systems.

### Priority Matrix

| Priority | Category | Error Count | Estimated Time | Impact |
|----------|----------|-------------|----------------|--------|
| P0 | Missing Modules | 30 | 4 hours | CRITICAL |
| P0 | Duplicate Identifiers | 15 | 2 hours | HIGH |
| P1 | Type Incompatibilities | 40 | 8 hours | HIGH |
| P1 | Three.js API | 25 | 6 hours | HIGH |
| P2 | Property Access | 35 | 6 hours | MEDIUM |
| P2 | Method Signatures | 20 | 4 hours | MEDIUM |
| P3 | Import/Export | 15 | 3 hours | LOW |

**Total Estimated Fix Time**: 33 hours (~4-5 working days)

---
