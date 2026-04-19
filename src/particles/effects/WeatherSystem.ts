/**
 * InfiniGen R3F Port - Weather Effects System
 * 
 * Comprehensive weather simulation including rain, snow, fog,
 * wind, and atmospheric effects.
 * 
 * @module particles/effects/weather
 */

import * as THREE from 'three';
import { Vector3 } from '../../math/vector';
import { ParticleSystem, EmitterConfig, ParticleForceField, ParticleCollider } from '../core/ParticleSystem';

// ============================================================================
// Type Definitions
// ============================================================================

export type WeatherType = 
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'mist'
  | 'windy';

export interface WeatherConfig {
  type: WeatherType;
  intensity: number; // 0-1
  transitionDuration: number;
  
  // Rain settings
  rainRate: number;
  rainDropSize: number;
  rainWind: Vector3;
  rainSplash: boolean;
  
  // Snow settings
  snowRate: number;
  snowflakeSize: number;
  snowDrift: number;
  snowAccumulation: boolean;
  
  // Fog settings
  fogDensity: number;
  fogColor: THREE.Color;
  fogHeight: number;
  fogFalloff: number;
  
  // Wind settings
  windDirection: Vector3;
  windSpeed: number;
  windGusts: number;
  windTurbulence: number;
  
  // Cloud settings
  cloudCoverage: number;
  cloudDensity: number;
  cloudSpeed: number;
  cloudHeight: number;
  
  // Lightning settings
  lightningProbability: number;
  lightningIntensity: number;
  
  // Ambient settings
  ambientLightColor: THREE.Color;
  ambientLightIntensity: number;
  skyColor: THREE.Color;
}

// ============================================================================
// Weather System
// ============================================================================

export class WeatherSystem {
  private particleSystem: ParticleSystem;
  private currentConfig: WeatherConfig;
  private targetConfig: WeatherConfig | null;
  private transitionProgress: number;
  private time: number;
  private lightningTimer: number;
  private onLightningCallback: ((intensity: number) => void) | null;
  
  // Force fields
  private windField: ParticleForceField;
  
  // Colliders
  private groundCollider: ParticleCollider;

  constructor(particleSystem: ParticleSystem) {
    this.particleSystem = particleSystem;
    this.time = 0;
    this.lightningTimer = 0;
    this.transitionProgress = 1;
    this.onLightningCallback = null;
    
    this.currentConfig = this.getDefaultConfig();
    this.targetConfig = null;
    
    // Initialize wind force field
    this.windField = {
      id: 'weather-wind',
      type: 'constant',
      position: new Vector3(0, 0, 0),
      direction: new Vector3(1, 0, 0),
      magnitude: 0,
      range: 1000,
      falloff: 'none',
      noiseScale: 0.1,
      noiseFrequency: 0.5,
      enabled: false
    };
    
    // Initialize ground collider
    this.groundCollider = {
      id: 'weather-ground',
      type: 'plane',
      position: new Vector3(0, 0, 0),
      rotation: new THREE.Quaternion(),
      scale: new Vector3(1, 1, 1),
      bounceFactor: 0.1,
      frictionFactor: 0.5,
      killOnCollision: false,
      enabled: true
    };
    
    this.particleSystem.addForceField(this.windField);
    this.particleSystem.addCollider(this.groundCollider);
  }

  private getDefaultConfig(): WeatherConfig {
    return {
      type: 'clear',
      intensity: 0,
      transitionDuration: 2,
      rainRate: 0,
      rainDropSize: 0.05,
      rainWind: new Vector3(0, 0, 0),
      rainSplash: true,
      snowRate: 0,
      snowflakeSize: 0.08,
      snowDrift: 0.5,
      snowAccumulation: false,
      fogDensity: 0,
      fogColor: new THREE.Color(0.8, 0.8, 0.8),
      fogHeight: 10,
      fogFalloff: 0.5,
      windDirection: new Vector3(1, 0, 0),
      windSpeed: 0,
      windGusts: 0,
      windTurbulence: 0,
      cloudCoverage: 0,
      cloudDensity: 0,
      cloudSpeed: 0.1,
      cloudHeight: 100,
      lightningProbability: 0,
      lightningIntensity: 1,
      ambientLightColor: new THREE.Color(1, 1, 0.9),
      ambientLightIntensity: 1,
      skyColor: new THREE.Color(0.4, 0.6, 1)
    };
  }

  setWeather(type: WeatherType, intensity: number = 1, duration: number = 2): void {
    const config = this.getDefaultConfig();
    config.type = type;
    config.intensity = intensity;
    config.transitionDuration = duration;
    
    this.applyWeatherPreset(config);
    
    this.targetConfig = config;
    this.transitionProgress = 0;
  }

  private applyWeatherPreset(config: WeatherConfig): void {
    switch (config.type) {
      case 'clear':
        this.applyClearWeather(config);
        break;
      case 'cloudy':
        this.applyCloudyWeather(config);
        break;
      case 'rain':
        this.applyRainWeather(config);
        break;
      case 'storm':
        this.applyStormWeather(config);
        break;
      case 'snow':
        this.applySnowWeather(config);
        break;
      case 'fog':
        this.applyFogWeather(config);
        break;
      case 'mist':
        this.applyMistWeather(config);
        break;
      case 'windy':
        this.applyWindyWeather(config);
        break;
    }
  }

  private applyClearWeather(config: WeatherConfig): void {
    config.rainRate = 0;
    config.snowRate = 0;
    config.fogDensity = 0;
    config.windSpeed = 0.5;
    config.cloudCoverage = 0.2;
    config.lightningProbability = 0;
    config.ambientLightColor.set(1, 1, 0.95);
    config.ambientLightIntensity = 1.2;
    config.skyColor.set(0.4, 0.7, 1);
  }

  private applyCloudyWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 0;
    config.snowRate = 0;
    config.fogDensity = 0.02 * i;
    config.windSpeed = 2 + i * 3;
    config.cloudCoverage = 0.6 + i * 0.4;
    config.lightningProbability = 0;
    config.ambientLightColor.set(0.8, 0.8, 0.85);
    config.ambientLightIntensity = 0.7 - i * 0.2;
    config.skyColor.setScalar(0.5 + i * 0.2);
  }

  private applyRainWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 200 + i * 300;
    config.rainDropSize = 0.04 + i * 0.03;
    config.rainWind = new Vector3(i * 2, 0, 0);
    config.rainSplash = true;
    config.snowRate = 0;
    config.fogDensity = 0.03 * i;
    config.windSpeed = 3 + i * 5;
    config.cloudCoverage = 0.9;
    config.lightningProbability = i * 0.1;
    config.ambientLightColor.set(0.7, 0.75, 0.8);
    config.ambientLightIntensity = 0.5 - i * 0.2;
    config.skyColor.set(0.3, 0.35, 0.4);
  }

  private applyStormWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 400 + i * 400;
    config.rainDropSize = 0.06 + i * 0.04;
    config.rainWind = new Vector3(5 + i * 5, 0, 2 + i * 2);
    config.rainSplash = true;
    config.snowRate = 0;
    config.fogDensity = 0.05 * i;
    config.windSpeed = 10 + i * 15;
    config.windGusts = 5 + i * 10;
    config.windTurbulence = 0.5 + i * 0.5;
    config.cloudCoverage = 1;
    config.lightningProbability = 0.3 + i * 0.5;
    config.lightningIntensity = 1.5 + i * 0.5;
    config.ambientLightColor.set(0.5, 0.5, 0.6);
    config.ambientLightIntensity = 0.3 - i * 0.1;
    config.skyColor.set(0.2, 0.2, 0.25);
  }

  private applySnowWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 0;
    config.snowRate = 100 + i * 200;
    config.snowflakeSize = 0.06 + i * 0.04;
    config.snowDrift = 0.3 + i * 0.5;
    config.snowAccumulation = i > 0.5;
    config.fogDensity = 0.04 * i;
    config.windSpeed = 1 + i * 3;
    config.cloudCoverage = 0.8;
    config.lightningProbability = 0;
    config.ambientLightColor.set(0.85, 0.9, 1);
    config.ambientLightIntensity = 0.8 - i * 0.2;
    config.skyColor.set(0.6, 0.7, 0.8);
  }

  private applyFogWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 0;
    config.snowRate = 0;
    config.fogDensity = 0.05 + i * 0.15;
    config.fogHeight = 20 - i * 15;
    config.windSpeed = 0.5;
    config.cloudCoverage = 1;
    config.lightningProbability = 0;
    config.ambientLightColor.set(0.8, 0.8, 0.75);
    config.ambientLightIntensity = 0.6 - i * 0.2;
    config.skyColor.set(0.6, 0.6, 0.55);
  }

  private applyMistWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 0;
    config.snowRate = 0;
    config.fogDensity = 0.02 + i * 0.05;
    config.fogHeight = 5 - i * 3;
    config.windSpeed = 0.3;
    config.cloudCoverage = 0.5;
    config.lightningProbability = 0;
    config.ambientLightColor.set(0.9, 0.9, 0.85);
    config.ambientLightIntensity = 0.9 - i * 0.2;
    config.skyColor.set(0.7, 0.75, 0.7);
  }

  private applyWindyWeather(config: WeatherConfig): void {
    const i = config.intensity;
    config.rainRate = 0;
    config.snowRate = 0;
    config.fogDensity = 0.01 * i;
    config.windSpeed = 5 + i * 20;
    config.windGusts = 2 + i * 8;
    config.windTurbulence = 0.3 + i * 0.5;
    config.cloudCoverage = 0.3 + i * 0.4;
    config.lightningProbability = 0;
    config.ambientLightColor.set(0.95, 0.95, 0.9);
    config.ambientLightIntensity = 1.1;
    config.skyColor.set(0.5, 0.65, 0.8);
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    
    // Handle transition
    if (this.targetConfig && this.transitionProgress < 1) {
      this.transitionProgress += deltaTime / this.targetConfig.transitionDuration;
      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.currentConfig = { ...this.targetConfig };
        this.targetConfig = null;
      } else {
        // Interpolate configs
        this.interpolateConfigs(this.currentConfig, this.targetConfig, this.transitionProgress);
      }
    }
    
    // Update wind field
    this.updateWindField(deltaTime);
    
    // Handle lightning
    this.handleLightning(deltaTime);
    
    // Update particle emitters based on current weather
    this.updateWeatherEmitters(deltaTime);
  }

  private interpolateConfigs(current: WeatherConfig, target: WeatherConfig, t: number): void {
    // Linear interpolation for numeric values
    current.intensity = this.lerp(current.intensity, target.intensity, t);
    current.rainRate = this.lerp(current.rainRate, target.rainRate, t);
    current.rainDropSize = this.lerp(current.rainDropSize, target.rainDropSize, t);
    current.snowRate = this.lerp(current.snowRate, target.snowRate, t);
    current.snowflakeSize = this.lerp(current.snowflakeSize, target.snowflakeSize, t);
    current.fogDensity = this.lerp(current.fogDensity, target.fogDensity, t);
    current.windSpeed = this.lerp(current.windSpeed, target.windSpeed, t);
    current.cloudCoverage = this.lerp(current.cloudCoverage, target.cloudCoverage, t);
    current.lightningProbability = this.lerp(current.lightningProbability, target.lightningProbability, t);
    
    // Vector interpolation
    current.rainWind.lerp(target.rainWind, t);
    current.windDirection.lerp(target.windDirection, t);
    
    // Color interpolation
    current.fogColor.lerp(target.fogColor, t);
    current.ambientLightColor.lerp(target.ambientLightColor, t);
    current.skyColor.lerp(target.skyColor, t);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private updateWindField(deltaTime: number): void {
    const config = this.currentConfig;
    
    // Base wind
    let speed = config.windSpeed;
    
    // Add gusts
    if (config.windGusts > 0) {
      const gustPhase = this.time * config.windTurbulence;
      const gustFactor = 1 + Math.sin(gustPhase) * 0.5 + Math.random() * 0.5;
      speed += config.windGusts * gustFactor;
    }
    
    this.windField.direction.copy(config.windDirection).normalize();
    this.windField.magnitude = speed * 0.1;
    this.windField.enabled = speed > 0.1;
  }

  private handleLightning(deltaTime: number): void {
    const config = this.currentConfig;
    
    if (config.lightningProbability <= 0) return;
    
    this.lightningTimer -= deltaTime;
    
    if (this.lightningTimer <= 0) {
      // Check if lightning should occur
      if (Math.random() < config.lightningProbability) {
        this.triggerLightning();
      }
      
      // Reset timer with random interval
      this.lightningTimer = 2 + Math.random() * 8;
    }
  }

  private triggerLightning(): void {
    if (this.onLightningCallback) {
      this.onLightningCallback(this.currentConfig.lightningIntensity);
    }
  }

  private updateWeatherEmitters(deltaTime: number): void {
    const config = this.currentConfig;
    
    // Update or create rain emitter
    if (config.rainRate > 0) {
      this.ensureRainEmitter(config);
    } else {
      this.particleSystem.removeEmitter('rain');
    }
    
    // Update or create snow emitter
    if (config.snowRate > 0) {
      this.ensureSnowEmitter(config);
    } else {
      this.particleSystem.removeEmitter('snow');
    }
    
    // Update or create rain splash emitter
    if (config.rainSplash && config.rainRate > 0) {
      this.ensureSplashEmitter(config);
    } else {
      this.particleSystem.removeEmitter('splash');
    }
  }

  private ensureRainEmitter(config: WeatherConfig): void {
    let emitter = this.particleSystem.getEmitter('rain');
    
    if (!emitter) {
      const rainConfig = this.createRainConfig(config);
      emitter = this.particleSystem.addEmitter('rain', rainConfig);
    } else {
      // Update existing emitter config
      const rainConfig = this.createRainConfig(config);
      emitter.config.emissionRate = rainConfig.emissionRate;
      emitter.config.particleSize = rainConfig.particleSize;
      emitter.config.initialVelocity.copy(rainConfig.initialVelocity);
    }
  }

  private createRainConfig(config: WeatherConfig): EmitterConfig {
    return {
      name: 'rain',
      enabled: true,
      shape: 'box',
      emissionMode: 'continuous',
      emissionRate: config.rainRate,
      burstCount: 0,
      burstInterval: 1,
      waveFrequency: 0,
      waveAmplitude: 0,
      radius: 1,
      radiusInner: 0,
      width: 50,
      height: 1,
      depth: 50,
      angle: 0,
      arc: Math.PI * 2,
      thickness: 0.1,
      initialVelocity: new Vector3(
        config.rainWind.x,
        -8 - config.rainRate / 100,
        config.rainWind.z
      ),
      velocityMin: 8,
      velocityMax: 12,
      velocitySpread: 0.1,
      speedCurve: [],
      particleLifetime: 3,
      lifetimeVariation: 0.5,
      particleSize: config.rainDropSize,
      sizeVariation: 0.3,
      sizeOverLife: [1, 1, 1],
      particleColor: new THREE.Color(0.7, 0.8, 1),
      colorVariation: new THREE.Color(0.1, 0.1, 0.1),
      colorOverLife: [],
      alphaOverLife: [0.6, 0.6, 0.6],
      particleMass: 0.5,
      particleDrag: 0.1,
      gravity: new Vector3(0, -9.8, 0),
      wind: config.rainWind,
      turbulence: 0.2,
      turbulenceFrequency: 0.5,
      enableCollision: true,
      collisionRadius: 0.05,
      bounceFactor: 0.1,
      frictionFactor: 0.5,
      maxParticles: 5000,
      sortMode: 'none',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      textures: [],
      textureSheetColumns: 1,
      textureSheetRows: 1,
      startFrame: 0,
      endFrame: 0,
      frameOverLife: [],
      randomizeFrame: false,
      subEmitters: []
    };
  }

  private ensureSnowEmitter(config: WeatherConfig): void {
    let emitter = this.particleSystem.getEmitter('snow');
    
    if (!emitter) {
      const snowConfig = this.createSnowConfig(config);
      emitter = this.particleSystem.addEmitter('snow', snowConfig);
    } else {
      const snowConfig = this.createSnowConfig(config);
      emitter.config.emissionRate = snowConfig.emissionRate;
      emitter.config.particleSize = snowConfig.particleSize;
    }
  }

  private createSnowConfig(config: WeatherConfig): EmitterConfig {
    return {
      name: 'snow',
      enabled: true,
      shape: 'box',
      emissionMode: 'continuous',
      emissionRate: config.snowRate,
      burstCount: 0,
      burstInterval: 1,
      waveFrequency: 0,
      waveAmplitude: 0,
      radius: 1,
      radiusInner: 0,
      width: 50,
      height: 20,
      depth: 50,
      angle: 0,
      arc: Math.PI * 2,
      thickness: 0.1,
      initialVelocity: new Vector3(0, -0.5, 0),
      velocityMin: 0.3,
      velocityMax: 1,
      velocitySpread: Math.PI,
      speedCurve: [],
      particleLifetime: 8,
      lifetimeVariation: 2,
      particleSize: config.snowflakeSize,
      sizeVariation: 0.5,
      sizeOverLife: [1, 1, 1],
      particleColor: new THREE.Color(1, 1, 1),
      colorVariation: new THREE.Color(0, 0, 0.1),
      colorOverLife: [],
      alphaOverLife: [0.8, 0.8, 0.8],
      particleMass: 0.1,
      particleDrag: 0.5,
      gravity: new Vector3(0, -1, 0),
      wind: config.windDirection.clone().multiplyScalar(config.windSpeed * 0.1),
      turbulence: config.snowDrift,
      turbulenceFrequency: 0.5,
      enableCollision: true,
      collisionRadius: 0.05,
      bounceFactor: 0.2,
      frictionFactor: 0.8,
      maxParticles: 3000,
      sortMode: 'distance',
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      textures: [],
      textureSheetColumns: 1,
      textureSheetRows: 1,
      startFrame: 0,
      endFrame: 0,
      frameOverLife: [],
      randomizeFrame: false,
      subEmitters: []
    };
  }

  private ensureSplashEmitter(config: WeatherConfig): void {
    let emitter = this.particleSystem.getEmitter('splash');
    
    if (!emitter) {
      const splashConfig = this.createSplashConfig(config);
      emitter = this.particleSystem.addEmitter('splash', splashConfig);
    }
  }

  private createSplashConfig(config: WeatherConfig): EmitterConfig {
    return {
      name: 'splash',
      enabled: true,
      shape: 'point',
      emissionMode: 'burst',
      emissionRate: 0,
      burstCount: 3,
      burstInterval: 0.01,
      waveFrequency: 0,
      waveAmplitude: 0,
      radius: 0.1,
      radiusInner: 0,
      width: 1,
      height: 1,
      depth: 1,
      angle: Math.PI,
      arc: Math.PI * 2,
      thickness: 0.1,
      initialVelocity: new Vector3(0, 2, 0),
      velocityMin: 1,
      velocityMax: 3,
      velocitySpread: Math.PI * 0.5,
      speedCurve: [],
      particleLifetime: 0.3,
      lifetimeVariation: 0.1,
      particleSize: 0.03,
      sizeVariation: 0.5,
      sizeOverLife: [1, 1, 0],
      particleColor: new THREE.Color(0.8, 0.9, 1),
      colorVariation: new THREE.Color(0.1, 0.1, 0.1),
      colorOverLife: [],
      alphaOverLife: [0.5, 0.5, 0],
      particleMass: 0.2,
      particleDrag: 0.3,
      gravity: new Vector3(0, -9.8, 0),
      wind: new Vector3(0, 0, 0),
      turbulence: 0.1,
      turbulenceFrequency: 1,
      enableCollision: true,
      collisionRadius: 0.03,
      bounceFactor: 0.3,
      frictionFactor: 0.7,
      maxParticles: 2000,
      sortMode: 'distance',
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      textures: [],
      textureSheetColumns: 1,
      textureSheetRows: 1,
      startFrame: 0,
      endFrame: 0,
      frameOverLife: [],
      randomizeFrame: false,
      subEmitters: []
    };
  }

  onLightning(callback: (intensity: number) => void): void {
    this.onLightningCallback = callback;
  }

  getCurrentConfig(): WeatherConfig {
    return { ...this.currentConfig };
  }

  getFogParams(): { density: number; color: THREE.Color; height: number } {
    return {
      density: this.currentConfig.fogDensity,
      color: this.currentConfig.fogColor.clone(),
      height: this.currentConfig.fogHeight
    };
  }

  getAmbientLightParams(): { color: THREE.Color; intensity: number } {
    return {
      color: this.currentConfig.ambientLightColor.clone(),
      intensity: this.currentConfig.ambientLightIntensity
    };
  }

  getSkyColor(): THREE.Color {
    return this.currentConfig.skyColor.clone();
  }

  clear(): void {
    this.particleSystem.removeEmitter('rain');
    this.particleSystem.removeEmitter('snow');
    this.particleSystem.removeEmitter('splash');
    this.setWeather('clear', 0, 1);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

export function createWeatherSystem(particleSystem?: ParticleSystem): WeatherSystem {
  const system = particleSystem || new ParticleSystem();
  return new WeatherSystem(system);
}

export { ParticleSystem } from '../core/ParticleSystem';
