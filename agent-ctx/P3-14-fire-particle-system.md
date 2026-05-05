# P3-14: Fire Particle System Implementation

## Task
Create `src/assets/particles/FireParticleSystem.ts` — a production-quality fire particle system covering volumetric fire rendering, particle-based embers, smoke plumes, heat distortion, and fire-light interaction.

## Work Completed

### File Created
- `src/assets/particles/FireParticleSystem.ts` (1,686 lines)

### Components Implemented

1. **FireParticle interface** — Full particle state (position, velocity, life, maxLife, temperature, size, opacity, age, isSmoke, seed)

2. **FireConfig interface** — Complete system configuration with 20+ parameters including maxParticles, emissionRate, particleLifespan, initialSpeed, initialTemperature, particleSize, buoyancy, wind, emitterShape, coolingRate, turbulence, drag, smokeTransition

3. **FireEmitter class** — Multi-shape emitter:
   - POINT, LINE, CIRCLE, MESH_SURFACE shapes
   - Mesh surface uses triangle sampling + barycentric interpolation
   - Rate-based emission with accumulator pattern
   - Intensity control (0-1)

4. **FireParticleSystem class** — Complete simulation:
   - Physics: buoyancy, FBM turbulence, wind, drag
   - Temperature cooling over lifetime
   - Smoke transition when temperature drops below threshold
   - Dynamic PointLight with flicker + color shift
   - Heat map query via getHeatAtPosition()
   - Heat map texture generation for post-processing

5. **FireShaderMaterial class** — Custom GLSL:
   - Vertex: billboard particles with size attenuation, life/temperature curves
   - Fragment: soft circular particles, 6-stop temperature→color gradient, per-particle flickering, additive blending

6. **SmokeSystem class** — Secondary smoke:
   - Noise2D-based opacity variation
   - Buoyancy + wind + turbulence drift
   - Expanding size over lifetime
   - Normal blending (not additive)

7. **HeatDistortionPass class** — Post-processing:
   - Screen-space UV distortion proportional to heat
   - Noise2D-based distortion with upward bias
   - Configurable strength

### Additional
- 4 convenience factories: createCampfire(), createBonfire(), createLineFire(), createCandleFlame()
- DEFAULT_FIRE_CONFIG with campfire-scale defaults
- All GLSL shaders embedded as template literals

## Compilation
Zero TypeScript errors verified with `npx tsc --noEmit`

## Integration Notes
- File is self-contained (imports only from 'three')
- Compatible with existing ParticleSystem.ts core module
- FireShaderMaterial uses custom attributes (aLife, aTemperature, aSize, aOpacity, aSeed) — no conflict with built-in THREE attributes
- Can be added to particles/index.ts barrel export if desired
