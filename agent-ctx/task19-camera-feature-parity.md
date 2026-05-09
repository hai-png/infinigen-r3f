# Task 19 — Camera Feature Parity

## Task
Implement 4 camera features missing from the R3F port, matching the original Infinigen:
1. Camera Rig System (spawn_camera_rigs — stereo/multiview)
2. Altitude-Maintaining Walk Trajectory (walk_same_altitude)
3. Trajectory Validation (freespace ray checks)
4. Tag-Based Camera Selection Ratios

## Files Created
- `src/core/placement/camera/CameraRig.ts` (~340 lines) — new file

## Files Modified
- `src/core/placement/camera/CameraRegistry.ts` — added AltitudeWalkTrajectory + TerrainHeightSampler type
- `src/core/placement/camera/CameraOrchestrator.ts` — added TrajectoryValidationResult + validateTrajectory()
- `src/core/placement/camera/CameraPoseSearchEngine.ts` — added TagCoverageConstraint, CameraSearchConfig, tag coverage scoring
- `src/core/placement/camera/index.ts` — added all new exports

## Compilation
- Zero new TypeScript errors in any modified or created file
- Pre-existing @/ path alias error in CameraPoseSearchEngine.ts unchanged (same as before)
- Name conflict resolved: CameraRig exported as PlacementCameraRig to avoid collision with editor CameraRig
