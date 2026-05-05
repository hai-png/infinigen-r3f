# P3-6: Surface Muscle Body (Multi-Muscle-Layer Composition)

## Task
Create `AdvancedMuscleBodySystem.ts` providing a dual-tube creature body with 5 surface muscle layers, per-muscle animation, and skeleton-driven activation.

## Files Created/Modified
- **Created**: `src/assets/objects/creatures/muscle/AdvancedMuscleBodySystem.ts` (1593 lines)
- **Modified**: `src/assets/objects/creatures/muscle/index.ts` (added exports)

## Implementation Summary

### Classes Implemented

1. **BodyTube** — Parametric NURBS-like tube with:
   - Dynamic radius profile via callback function
   - Gaussian surface deformations with t/angular falloff
   - Real BufferGeometry generation with proper vertex/index/UV data
   - Surface point and normal queries

2. **MuscleLayer** — Muscle displacement layer with:
   - 5 muscle groups (SHOULDER, BACK, ABDOMEN, HIP, LIMB)
   - Gaussian bell-curve along muscle length × Gaussian cross-section
   - Per-group activation with custom piecewise smoothstep curves
   - Vertex displacement along surface normals

3. **DualTubeBody** — Two-tube creature body with:
   - Primary body tube (shoulder/abdomen/hip bulge profile)
   - Secondary head tube (cranium/jaw/snout profile)
   - Smooth neck bridge (smoothstep radius interpolation)
   - Multiple muscle layers on body and head
   - updateMuscles() for real-time activation changes

4. **MuscleAnimationDriver** — Skeleton-driven activation:
   - Automatic walking detection (leg bone velocity)
   - Breathing (sinusoidal abdomen oscillation)
   - Jaw motion → head muscle activation
   - Spinal motion → back muscle activation
   - Smooth exponential transitions

5. **MuscleBodyPreset** + factory:
   - QUADRUPED (20 body + 4 head muscles)
   - BIPED (20 body + 4 head muscles)
   - SERPENTINE (16 segmented + 3 ventral muscles)
   - AVIAN (12 compact with prominent pectorals)

6. **MuscleBodyConfig** — Full configuration interface

### Key Design Decisions
- Renamed `MuscleGroup` to `SurfaceMuscleGroup` to avoid collision with existing `MuscleGroup` interface in `MuscleSystem.ts`
- Muscle displacement: `peakDisplacement × activation × bellCurve(t) × gaussianCrossSection(angle) × layerDepth`
- Neck bridge uses 3-zone smoothstep (body→neck→head) for smooth radius transition
- Animation driver stores previous bone transforms for velocity-based motion detection
