/**
 * Tests for Physics Materials (FluidMaterial, SoftBodyMaterial)
 */
import { describe, it, expect } from 'vitest';
import {
  FluidMaterial,
  createFluidMaterial,
  createCustomFluidMaterial,
  FLUID_PRESETS,
  reynoldsNumber,
  computePressure,
  speedOfSound,
  maxStableTimeStep,
} from '../../sim/physics/materials/FluidMaterial';
import {
  SoftBodyMaterial,
  createSoftBodyMaterial,
  createCustomSoftBodyMaterial,
  SOFTBODY_PRESETS,
  computeSpringForce,
  computeStrain,
  hasYielded,
  hasBroken,
  naturalFrequency,
  criticalDamping,
  dampingRatio,
} from '../../sim/physics/materials/SoftBodyMaterial';

// ============================================================================
// FluidMaterial Tests
// ============================================================================

describe('FluidMaterial', () => {
  describe('createFluidMaterial', () => {
    it('should create water preset', () => {
      const water = createFluidMaterial('water');
      expect(water.name).toBe('water');
      expect(water.viscosity).toBe(0.001);
      expect(water.density).toBe(1000);
      expect(water.surfaceTension).toBe(0.0728);
    });

    it('should create all presets', () => {
      const presets = Object.keys(FLUID_PRESETS) as Array<keyof typeof FLUID_PRESETS>;
      for (const preset of presets) {
        const mat = createFluidMaterial(preset);
        expect(mat.name).toBe(preset);
        expect(mat.density).toBeGreaterThan(0);
        expect(mat.viscosity).toBeGreaterThanOrEqual(0);
        expect(mat.gasConstant).toBeGreaterThan(0);
      }
    });

    it('should throw for unknown preset', () => {
      expect(() => createFluidMaterial('unknown' as any)).toThrow();
    });

    it('should return a copy, not the preset object itself', () => {
      const water1 = createFluidMaterial('water');
      const water2 = createFluidMaterial('water');
      water1.viscosity = 999;
      expect(water2.viscosity).toBe(0.001); // Should not be affected
    });
  });

  describe('createCustomFluidMaterial', () => {
    it('should override specific properties', () => {
      const thickWater = createCustomFluidMaterial('water', { viscosity: 0.01, density: 1100 });
      expect(thickWater.viscosity).toBe(0.01);
      expect(thickWater.density).toBe(1100);
      expect(thickWater.surfaceTension).toBe(0.0728); // Unchanged
      expect(thickWater.name).toBe('water_custom');
    });

    it('should allow custom name', () => {
      const custom = createCustomFluidMaterial('water', { name: 'my_water' });
      expect(custom.name).toBe('my_water');
    });
  });

  describe('physics helpers', () => {
    it('should compute Reynolds number', () => {
      const water = createFluidMaterial('water');
      const Re = reynoldsNumber(water, 1.0, 0.1); // v=1m/s, L=0.1m
      // Re = 1000 * 1 * 0.1 / 0.001 = 100000
      expect(Re).toBeCloseTo(100000, -2);
    });

    it('should compute pressure from density deviation', () => {
      const water = createFluidMaterial('water');
      const pressure = computePressure(water, 1050); // 50 kg/m³ above rest
      // P = 2000 * (1050 - 1000) = 100000 Pa
      expect(pressure).toBeCloseTo(100000, -3);
    });

    it('should compute zero pressure at rest density', () => {
      const water = createFluidMaterial('water');
      const pressure = computePressure(water, 1000);
      expect(pressure).toBe(0);
    });

    it('should compute speed of sound', () => {
      const water = createFluidMaterial('water');
      const c = speedOfSound(water);
      // c = sqrt(2000 / 1000) = sqrt(2) ≈ 1.414 m/s
      expect(c).toBeCloseTo(Math.sqrt(2), 3);
    });

    it('should compute stable time step', () => {
      const water = createFluidMaterial('water');
      const dt = maxStableTimeStep(water);
      expect(dt).toBeGreaterThan(0);
      // dt < 0.4 * h / c
      const c = speedOfSound(water);
      expect(dt).toBeLessThanOrEqual(0.4 * water.smoothingRadius / c + 1e-10);
    });
  });

  describe('lava preset', () => {
    it('should have high viscosity and density', () => {
      const lava = createFluidMaterial('lava');
      expect(lava.viscosity).toBe(100);
      expect(lava.density).toBe(2600);
      expect(lava.temperature).toBe(1473);
    });
  });

  describe('honey preset', () => {
    it('should have moderate viscosity and higher density than water', () => {
      const honey = createFluidMaterial('honey');
      expect(honey.viscosity).toBeGreaterThan(0.001);
      expect(honey.density).toBeGreaterThan(1000);
    });
  });
});

// ============================================================================
// SoftBodyMaterial Tests
// ============================================================================

describe('SoftBodyMaterial', () => {
  describe('createSoftBodyMaterial', () => {
    it('should create rubber preset', () => {
      const rubber = createSoftBodyMaterial('rubber');
      expect(rubber.name).toBe('rubber');
      expect(rubber.stiffness).toBe(5000);
      expect(rubber.damping).toBe(0.05);
    });

    it('should create all presets', () => {
      const presets = Object.keys(SOFTBODY_PRESETS) as Array<keyof typeof SOFTBODY_PRESETS>;
      for (const preset of presets) {
        const mat = createSoftBodyMaterial(preset);
        expect(mat.name).toBe(preset);
        expect(mat.stiffness).toBeGreaterThan(0);
        expect(mat.density).toBeGreaterThan(0);
      }
    });

    it('should throw for unknown preset', () => {
      expect(() => createSoftBodyMaterial('unknown' as any)).toThrow();
    });
  });

  describe('createCustomSoftBodyMaterial', () => {
    it('should override specific properties', () => {
      const stiffCloth = createCustomSoftBodyMaterial('cloth', { stiffness: 500, bendingStiffness: 200 });
      expect(stiffCloth.stiffness).toBe(500);
      expect(stiffCloth.bendingStiffness).toBe(200);
      expect(stiffCloth.damping).toBe(0.03); // Unchanged
    });
  });

  describe('computeSpringForce', () => {
    it('should compute Hooke\'s law force', () => {
      const rubber = createSoftBodyMaterial('rubber');
      const force = computeSpringForce(rubber, 0.1, 0);
      // F = -k * x = -5000 * 0.1 = -500
      expect(force).toBeCloseTo(-500, 0);
    });

    it('should add damping force', () => {
      const rubber = createSoftBodyMaterial('rubber');
      const forceNoVelocity = computeSpringForce(rubber, 0.1, 0);
      const forceWithVelocity = computeSpringForce(rubber, 0.1, 1.0);
      // With velocity, force should be more negative (damping opposes motion)
      expect(forceWithVelocity).toBeLessThan(forceNoVelocity);
    });

    it('should apply compression ratio for compressed springs', () => {
      const cloth = createSoftBodyMaterial('cloth');
      const tensionForce = computeSpringForce(cloth, 0.1, 0);
      const compressionForce = computeSpringForce(cloth, -0.1, 0);
      // Cloth has compressionRatio: 0.01, so compression force should be much less
      expect(Math.abs(compressionForce)).toBeLessThan(Math.abs(tensionForce));
    });
  });

  describe('computeStrain', () => {
    it('should compute strain correctly', () => {
      expect(computeStrain(0.1, 1.0)).toBeCloseTo(0.1);
      expect(computeStrain(0.5, 1.0)).toBeCloseTo(0.5);
      expect(computeStrain(-0.1, 1.0)).toBeCloseTo(-0.1);
    });

    it('should return 0 for zero rest length', () => {
      expect(computeStrain(0.1, 0)).toBe(0);
    });
  });

  describe('hasYielded', () => {
    it('should return false for zero yield stress', () => {
      const rubber = createSoftBodyMaterial('rubber');
      expect(rubber.yieldStress).toBe(0);
      expect(hasYielded(rubber, 2.0)).toBe(false);
    });

    it('should detect yielding for flesh material', () => {
      const flesh = createSoftBodyMaterial('flesh');
      expect(flesh.yieldStress).toBeGreaterThan(0);
      // yieldStrain = yieldStress / stiffness = 500 / 1000 = 0.5
      expect(hasYielded(flesh, 0.3)).toBe(false);
      expect(hasYielded(flesh, 0.6)).toBe(true);
    });
  });

  describe('hasBroken', () => {
    it('should detect when max strain is exceeded', () => {
      const cloth = createSoftBodyMaterial('cloth');
      expect(cloth.maxStrain).toBe(1.2);
      expect(hasBroken(cloth, 1.0)).toBe(false);
      expect(hasBroken(cloth, 1.5)).toBe(true);
    });
  });

  describe('naturalFrequency', () => {
    it('should compute natural frequency', () => {
      const rubber = createSoftBodyMaterial('rubber');
      const omega = naturalFrequency(rubber);
      // omega = sqrt(5000 / 0.02) = sqrt(250000) ≈ 500
      expect(omega).toBeCloseTo(500, -1);
    });
  });

  describe('criticalDamping', () => {
    it('should compute critical damping coefficient', () => {
      const rubber = createSoftBodyMaterial('rubber');
      const cCrit = criticalDamping(rubber);
      // cCrit = 2 * sqrt(5000 * 0.02) = 2 * sqrt(100) = 20
      expect(cCrit).toBeCloseTo(20, 0);
    });
  });

  describe('dampingRatio', () => {
    it('should compute damping ratio', () => {
      const rubber = createSoftBodyMaterial('rubber');
      const zeta = dampingRatio(rubber);
      expect(zeta).toBeGreaterThanOrEqual(0);
      expect(zeta).toBeLessThanOrEqual(1);
    });
  });

  describe('preset-specific properties', () => {
    it('cloth should have low compression ratio and bending stiffness', () => {
      const cloth = createSoftBodyMaterial('cloth');
      expect(cloth.compressionRatio).toBeLessThan(0.1);
      expect(cloth.bendingStiffness).toBeGreaterThan(0);
      expect(cloth.shearStiffness).toBeGreaterThan(0);
    });

    it('jelly should have internal pressure (balloon-like)', () => {
      const jelly = createSoftBodyMaterial('jelly');
      expect(jelly.internalPressure).toBeGreaterThan(0);
    });

    it('flesh should have yield stress for plastic deformation', () => {
      const flesh = createSoftBodyMaterial('flesh');
      expect(flesh.yieldStress).toBeGreaterThan(0);
    });
  });
});
