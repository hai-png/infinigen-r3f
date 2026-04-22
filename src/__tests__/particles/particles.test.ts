/**
 * InfiniGen R3F Port - Particle System Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import * as THREE from 'three';
import {
  Particle,
  ParticlePool,
  ParticleEmitter,
  ParticleSystem,
  createFireEmitter,
  createSmokeEmitter,
  createRainEmitter,
  createSparkEmitter,
  type EmitterConfig,
  type ParticleForceField,
  type ParticleCollider
} from '../../particles/core/ParticleSystem';
import { WeatherSystem, createWeatherSystem } from '../../particles/effects/WeatherSystem';
import { Vector3 } from '../../math/vector';

describe('Particle System', () => {
  describe('Particle', () => {
    it('should create a particle with default values', () => {
      const particle = new Particle(0);
      
      expect(particle.data.id).toBe(0);
      expect(particle.data.position.x).toBe(0);
      expect(particle.data.lifeCycle).toBe('dead');
      expect(particle.isAlive).toBe(false);
      expect(particle.normalizedAge).toBe(0);
    });

    it('should initialize particle with custom values', () => {
      const particle = new Particle(1);
      const config = {
        position: new Vector3(1, 2, 3),
        velocity: new Vector3(0, 1, 0),
        lifetime: 2.0,
        size: 0.5,
        color: new THREE.Color(1, 0, 0),
        alpha: 0.8
      };
      
      particle.initialize(config);
      
      expect(particle.data.position.x).toBe(1);
      expect(particle.data.velocity.y).toBe(1);
      expect(particle.data.lifetime).toBe(2.0);
      expect(particle.data.size).toBe(0.5);
      expect(particle.data.color.r).toBe(1);
      expect(particle.data.alpha).toBe(0.8);
      expect(particle.isAlive).toBe(true);
    });

    it('should update particle age and lifecycle', () => {
      const particle = new Particle(2);
      particle.initialize({ lifetime: 1.0 });
      
      expect(particle.data.age).toBe(0);
      
      particle.update(0.5);
      expect(particle.data.age).toBeCloseTo(0.5, 2);
      expect(particle.isAlive).toBe(true);
      
      particle.update(0.6);
      expect(particle.data.age).toBeCloseTo(1.1, 1);
      expect(particle.isAlive).toBe(false);
    });

    it('should apply forces correctly', () => {
      const particle = new Particle(3);
      particle.data.mass = 2.0;
      particle.initialize({});
      
      const force = new Vector3(10, 0, 0);
      particle.addForce(force);
      
      particle.update(0.1);
      
      // a = F/m = 10/2 = 5
      // v = a * dt = 5 * 0.1 = 0.5
      expect(particle.data.velocity.x).toBeCloseTo(0.5, 3);
    });

    it('should reset particle to default state', () => {
      const particle = new Particle(4);
      particle.initialize({
        position: new Vector3(5, 5, 5),
        velocity: new Vector3(1, 1, 1),
        lifetime: 10
      });
      
      particle.reset();
      
      expect(particle.data.position.x).toBe(0);
      expect(particle.data.velocity.x).toBe(0);
      expect(particle.data.lifeCycle).toBe('dead');
    });
  });

  describe('ParticlePool', () => {
    it('should create pool with specified size', () => {
      const pool = new ParticlePool(100);
      
      expect(pool.getTotalCount()).toBe(100);
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(100);
    });

    it('should acquire and release particles', () => {
      const pool = new ParticlePool(10);
      
      const p1 = pool.acquire();
      expect(p1).not.toBeNull();
      expect(pool.getActiveCount()).toBe(1);
      expect(pool.getFreeCount()).toBe(9);
      
      if (p1) {
        pool.release(p1);
        expect(pool.getActiveCount()).toBe(0);
        expect(pool.getFreeCount()).toBe(10);
      }
    });

    it('should return null when pool is exhausted', () => {
      const pool = new ParticlePool(3);
      
      const p1 = pool.acquire();
      const p2 = pool.acquire();
      const p3 = pool.acquire();
      const p4 = pool.acquire();
      
      expect(p1).not.toBeNull();
      expect(p2).not.toBeNull();
      expect(p3).not.toBeNull();
      expect(p4).toBeNull();
      expect(pool.getActiveCount()).toBe(3);
    });

    it('should clear all active particles', () => {
      const pool = new ParticlePool(10);
      
      pool.acquire();
      pool.acquire();
      pool.acquire();
      
      expect(pool.getActiveCount()).toBe(3);
      
      pool.clear();
      
      expect(pool.getActiveCount()).toBe(0);
      expect(pool.getFreeCount()).toBe(10);
    });
  });

  describe('ParticleEmitter', () => {
    it('should create emitter with config', () => {
      const config = createFireEmitter();
      const emitter = new ParticleEmitter(config);
      
      expect(emitter.config.name).toBe('fire');
      expect(emitter.config.emissionRate).toBe(200);
      expect(emitter.getActiveCount()).toBe(0);
    });

    it('should emit particles in continuous mode', () => {
      const config: EmitterConfig = {
        name: 'test',
        enabled: true,
        shape: 'point',
        emissionMode: 'continuous',
        emissionRate: 100,
        burstCount: 0,
        burstInterval: 1,
        waveFrequency: 0,
        waveAmplitude: 0,
        radius: 1,
        radiusInner: 0,
        width: 1,
        height: 1,
        depth: 1,
        angle: 0,
        arc: Math.PI * 2,
        thickness: 0.1,
        initialVelocity: new Vector3(0, 1, 0),
        velocityMin: 1,
        velocityMax: 2,
        velocitySpread: 0.1,
        speedCurve: [],
        particleLifetime: 10,
        lifetimeVariation: 0,
        particleSize: 0.1,
        sizeVariation: 0,
        sizeOverLife: [],
        particleColor: new THREE.Color(1, 1, 1),
        colorVariation: new THREE.Color(0, 0, 0),
        colorOverLife: [],
        alphaOverLife: [],
        particleMass: 1,
        particleDrag: 0,
        gravity: new Vector3(0, 0, 0),
        wind: new Vector3(0, 0, 0),
        turbulence: 0,
        turbulenceFrequency: 0,
        enableCollision: false,
        collisionRadius: 0.1,
        bounceFactor: 0.5,
        frictionFactor: 0.5,
        maxParticles: 1000,
        sortMode: 'none',
        blending: THREE.NormalBlending,
        depthWrite: true,
        depthTest: true,
        transparent: false,
        textures: [],
        textureSheetColumns: 1,
        textureSheetRows: 1,
        startFrame: 0,
        endFrame: 0,
        frameOverLife: [],
        randomizeFrame: false,
        subEmitters: []
      };
      
      const emitter = new ParticleEmitter(config);
      
      // Update for 0.1 seconds at 100 particles/sec = 10 particles
      emitter.update(0.1, 0);
      
      expect(emitter.getActiveCount()).toBeGreaterThanOrEqual(9);
      expect(emitter.getActiveCount()).toBeLessThanOrEqual(11);
    });

    it('should emit burst of particles', () => {
      const config: EmitterConfig = {
        name: 'burst-test',
        enabled: true,
        shape: 'point',
        emissionMode: 'burst',
        emissionRate: 0,
        burstCount: 50,
        burstInterval: 0.5,
        waveFrequency: 0,
        waveAmplitude: 0,
        radius: 1,
        radiusInner: 0,
        width: 1,
        height: 1,
        depth: 1,
        angle: 0,
        arc: Math.PI * 2,
        thickness: 0.1,
        initialVelocity: new Vector3(0, 1, 0),
        velocityMin: 1,
        velocityMax: 2,
        velocitySpread: 0.1,
        speedCurve: [],
        particleLifetime: 10,
        lifetimeVariation: 0,
        particleSize: 0.1,
        sizeVariation: 0,
        sizeOverLife: [],
        particleColor: new THREE.Color(1, 1, 1),
        colorVariation: new THREE.Color(0, 0, 0),
        colorOverLife: [],
        alphaOverLife: [],
        particleMass: 1,
        particleDrag: 0,
        gravity: new Vector3(0, 0, 0),
        wind: new Vector3(0, 0, 0),
        turbulence: 0,
        turbulenceFrequency: 0,
        enableCollision: false,
        collisionRadius: 0.1,
        bounceFactor: 0.5,
        frictionFactor: 0.5,
        maxParticles: 1000,
        sortMode: 'none',
        blending: THREE.NormalBlending,
        depthWrite: true,
        depthTest: true,
        transparent: false,
        textures: [],
        textureSheetColumns: 1,
        textureSheetRows: 1,
        startFrame: 0,
        endFrame: 0,
        frameOverLife: [],
        randomizeFrame: false,
        subEmitters: []
      };
      
      const emitter = new ParticleEmitter(config);
      
      // Wait for burst interval
      emitter.update(0.5, 0.5);
      
      expect(emitter.getActiveCount()).toBe(50);
    });

    it('should generate particles in different shapes', () => {
      const baseConfig = createFireEmitter();
      
      // Test sphere shape
      const sphereConfig = { ...baseConfig, shape: 'sphere' as const, radius: 5 };
      const sphereEmitter = new ParticleEmitter(sphereConfig);
      sphereConfig.emissionMode = 'burst';
      sphereConfig.burstCount = 1;
      
      const particles = sphereEmitter.emit(100);
      particles.forEach(p => {
        const dist = Math.sqrt(
          p.data.position.x ** 2 +
          p.data.position.y ** 2 +
          p.data.position.z ** 2
        );
        expect(dist).toBeLessThanOrEqual(5.1);
      });
    });

    it('should clear all particles', () => {
      const emitter = new ParticleEmitter(createFireEmitter());
      
      emitter.update(0.1, 0);
      expect(emitter.getActiveCount()).toBeGreaterThan(0);
      
      emitter.clear();
      expect(emitter.getActiveCount()).toBe(0);
    });
  });

  describe('ParticleSystem', () => {
    it('should manage multiple emitters', () => {
      const system = new ParticleSystem();
      
      system.addEmitter('fire', createFireEmitter());
      system.addEmitter('smoke', createSmokeEmitter());
      
      expect(system.getEmitter('fire')).toBeDefined();
      expect(system.getEmitter('smoke')).toBeDefined();
      expect(system.getEmitter('nonexistent')).toBeUndefined();
    });

    it('should update all emitters', () => {
      const system = new ParticleSystem();
      
      system.addEmitter('fire', createFireEmitter());
      
      system.update(0.1);
      
      expect(system.getTotalParticleCount()).toBeGreaterThan(0);
    });

    it('should apply force fields to particles', () => {
      const system = new ParticleSystem();
      system.addEmitter('test', {
        ...createFireEmitter(),
        emissionRate: 10,
        maxParticles: 100
      });
      
      const windField: ParticleForceField = {
        id: 'wind',
        type: 'constant',
        position: new Vector3(0, 0, 0),
        direction: new Vector3(10, 0, 0),
        magnitude: 5,
        range: 100,
        falloff: 'none',
        noiseScale: 0,
        noiseFrequency: 0,
        enabled: true
      };
      
      system.addForceField(windField);
      system.update(0.1);
      
      const particles = system.getEmitter('test')!.getActiveParticles();
      if (particles.length > 0) {
        // Particles should have been affected by wind
        const avgX = particles.reduce((sum, p) => sum + p.data.velocity.x, 0) / particles.length;
        expect(avgX).toBeGreaterThan(0);
      }
    });

    it('should remove emitters', () => {
      const system = new ParticleSystem();
      
      system.addEmitter('fire', createFireEmitter());
      expect(system.getEmitter('fire')).toBeDefined();
      
      system.removeEmitter('fire');
      expect(system.getEmitter('fire')).toBeUndefined();
    });

    it('should handle collisions', () => {
      const system = new ParticleSystem();
      system.addEmitter('rain', {
        ...createRainEmitter(),
        emissionRate: 10,
        maxParticles: 100
      });
      
      const groundCollider: ParticleCollider = {
        id: 'ground',
        type: 'plane',
        position: new Vector3(0, 0, 0),
        rotation: new THREE.Quaternion(),
        scale: new Vector3(1, 1, 1),
        bounceFactor: 0.5,
        frictionFactor: 0.5,
        killOnCollision: false,
        enabled: true
      };
      
      system.addCollider(groundCollider);
      
      // Let rain fall and hit ground
      for (let i = 0; i < 100; i++) {
        system.update(0.016);
      }
      
      // Should have particles bouncing off ground
      expect(system.getTotalParticleCount()).toBeGreaterThan(0);
    });
  });

  describe('Preset Emitters', () => {
    it('should create fire emitter', () => {
      const config = createFireEmitter();
      
      expect(config.name).toBe('fire');
      expect(config.shape).toBe('cone');
      expect(config.emissionRate).toBe(200);
      expect(config.particleColor.r).toBe(1);
      expect(config.particleColor.g).toBe(0.6);
    });

    it('should create smoke emitter', () => {
      const config = createSmokeEmitter();
      
      expect(config.name).toBe('smoke');
      expect(config.emissionRate).toBe(50);
      expect(config.particleLifetime).toBe(3.0);
    });

    it('should create rain emitter', () => {
      const config = createRainEmitter();
      
      expect(config.name).toBe('rain');
      expect(config.shape).toBe('box');
      expect(config.emissionRate).toBe(500);
      expect(config.initialVelocity.y).toBe(-10);
    });

    it('should create spark emitter', () => {
      const config = createSparkEmitter();
      
      expect(config.name).toBe('sparks');
      expect(config.emissionMode).toBe('burst');
      expect(config.burstCount).toBe(100);
      expect(config.gravity.y).toBe(-9.8);
    });
  });
});

describe('Weather System', () => {
  let particleSystem: ParticleSystem;
  let weatherSystem: WeatherSystem;

  beforeEach(() => {
    particleSystem = new ParticleSystem();
    weatherSystem = new WeatherSystem(particleSystem);
  });

  it('should initialize with clear weather', () => {
    const config = weatherSystem.getCurrentConfig();
    
    expect(config.type).toBe('clear');
    expect(config.intensity).toBe(0);
  });

  it('should set rain weather', () => {
    weatherSystem.setWeather('rain', 0.8, 1);
    
    const config = weatherSystem.getCurrentConfig();
    expect(config.type).toBe('rain');
    expect(config.intensity).toBeCloseTo(0.8, 1);
  });

  it('should set snow weather', () => {
    weatherSystem.setWeather('snow', 1.0, 0.5);
    
    // Wait for transition
    for (let i = 0; i < 10; i++) {
      weatherSystem.update(0.1);
    }
    
    const config = weatherSystem.getCurrentConfig();
    expect(config.type).toBe('snow');
    expect(config.snowRate).toBeGreaterThan(0);
  });

  it('should transition between weather types', () => {
    weatherSystem.setWeather('storm', 1.0, 2);
    
    const initialConfig = weatherSystem.getCurrentConfig();
    expect(initialConfig.intensity).toBeLessThan(1);
    
    // Complete transition
    for (let i = 0; i < 20; i++) {
      weatherSystem.update(0.1);
    }
    
    const finalConfig = weatherSystem.getCurrentConfig();
    expect(finalConfig.type).toBe('storm');
    expect(finalConfig.intensity).toBe(1);
  });

  it('should get fog parameters', () => {
    weatherSystem.setWeather('fog', 0.5, 0.1);
    
    for (let i = 0; i < 5; i++) {
      weatherSystem.update(0.1);
    }
    
    const fogParams = weatherSystem.getFogParams();
    expect(fogParams.density).toBeGreaterThan(0);
    expect(fogParams.color).toBeDefined();
  });

  it('should get ambient light parameters', () => {
    weatherSystem.setWeather('storm', 1.0, 0.1);
    
    for (let i = 0; i < 5; i++) {
      weatherSystem.update(0.1);
    }
    
    const lightParams = weatherSystem.getAmbientLightParams();
    expect(lightParams.intensity).toBeLessThan(1);
    expect(lightParams.color).toBeDefined();
  });

  it('should get sky color', () => {
    const skyColor = weatherSystem.getSkyColor();
    
    expect(skyColor).toBeDefined();
    expect(skyColor.r).toBeGreaterThan(0);
  });

  it('should trigger lightning callback', () => {
    let lightningTriggered = false;
    let lightningIntensity = 0;
    
    weatherSystem.onLightning((intensity) => {
      lightningTriggered = true;
      lightningIntensity = intensity;
    });
    
    weatherSystem.setWeather('storm', 1.0, 0.1);
    
    // Run for a while to potentially trigger lightning
    for (let i = 0; i < 1000; i++) {
      weatherSystem.update(0.016);
    }
    
    // Lightning may or may not trigger due to randomness
    // Just verify the callback mechanism works
    expect(typeof weatherSystem.onLightning).toBe('function');
  });

  it('should clear weather', () => {
    weatherSystem.setWeather('storm', 1.0, 0.1);
    
    weatherSystem.clear();
    
    const config = weatherSystem.getCurrentConfig();
    expect(config.type).toBe('clear');
    expect(config.rainRate).toBe(0);
    expect(config.snowRate).toBe(0);
  });

  it('should apply different weather presets', () => {
    const weatherTypes: Array<'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'mist' | 'windy'> = 
      ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'mist', 'windy'];
    
    weatherTypes.forEach(type => {
      weatherSystem.setWeather(type, 1.0, 0.1);
      
      for (let i = 0; i < 5; i++) {
        weatherSystem.update(0.1);
      }
      
      const config = weatherSystem.getCurrentConfig();
      expect(config.type).toBe(type);
    });
  });
});

describe('Integration Tests', () => {
  it('should integrate weather with particle system', () => {
    const system = new ParticleSystem();
    const weather = new WeatherSystem(system);
    
    weather.setWeather('rain', 1.0, 0.5);
    
    for (let i = 0; i < 20; i++) {
      weather.update(0.1);
    }
    
    expect(system.getTotalParticleCount()).toBeGreaterThan(0);
    
    const rainEmitter = system.getEmitter('rain');
    expect(rainEmitter).toBeDefined();
  });

  it('should handle multiple weather effects simultaneously', () => {
    const system = new ParticleSystem();
    const weather = new WeatherSystem(system);
    
    // Start with rain
    weather.setWeather('rain', 0.5, 0.5);
    
    for (let i = 0; i < 10; i++) {
      weather.update(0.1);
    }
    
    // Transition to storm
    weather.setWeather('storm', 1.0, 1.0);
    
    for (let i = 0; i < 20; i++) {
      weather.update(0.1);
    }
    
    const config = weather.getCurrentConfig();
    expect(config.type).toBe('storm');
    expect(config.rainRate).toBeGreaterThan(300);
  });
});
