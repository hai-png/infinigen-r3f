/**
 * Weather System
 * 
 * Dynamic weather simulation including rain, snow, fog,
 * wind, storms, and atmospheric effects.
 * 
 * @module WeatherSystem
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm' | 'thunderstorm';

export interface WeatherParams {
  intensity: number;
  windSpeed: number;
  windDirection: THREE.Vector3;
  temperature: number;
  humidity: number;
  cloudCover: number;
  precipitationRate: number;
  visibility: number;
}

export interface WeatherState {
  currentType: WeatherType;
  params: WeatherParams;
  transitionProgress: number;
  targetWeather: WeatherType | null;
}

export class WeatherSystem {
  private scene: THREE.Scene;
  private state: WeatherState;
  private noise: SimplexNoise;
  
  // Particle systems
  private rainParticles: THREE.Points | null = null;
  private snowParticles: THREE.Points | null = null;
  private fogVolume: THREE.Mesh | null = null;
  
  // Cloud system
  private clouds: THREE.Group;
  
  // Lightning
  private lightningMesh: THREE.Mesh | null = null;
  private lastLightningTime: number = 0;
  private lightningInterval: number = 5000;

  constructor(scene: THREE.Scene, initialWeather: WeatherType = 'clear') {
    this.scene = scene;
    this.noise = new SimplexNoise();
    
    this.state = {
      currentType: initialWeather,
      params: this.getDefaultParams(initialWeather),
      transitionProgress: 1.0,
      targetWeather: null
    };
    
    this.clouds = new THREE.Group();
    this.scene.add(this.clouds);
    
    this.initializeParticleSystems();
  }

  /**
   * Get default parameters for each weather type
   */
  private getDefaultParams(type: WeatherType): WeatherParams {
    const defaults: Record<WeatherType, WeatherParams> = {
      clear: {
        intensity: 0,
        windSpeed: 2,
        windDirection: new THREE.Vector3(1, 0, 0),
        temperature: 20,
        humidity: 40,
        cloudCover: 0.1,
        precipitationRate: 0,
        visibility: 100
      },
      cloudy: {
        intensity: 0.3,
        windSpeed: 5,
        windDirection: new THREE.Vector3(1, 0, 0.5),
        temperature: 18,
        humidity: 60,
        cloudCover: 0.7,
        precipitationRate: 0,
        visibility: 50
      },
      rain: {
        intensity: 0.7,
        windSpeed: 10,
        windDirection: new THREE.Vector3(1, 0, 0.5),
        temperature: 15,
        humidity: 85,
        cloudCover: 0.9,
        precipitationRate: 5,
        visibility: 20
      },
      snow: {
        intensity: 0.6,
        windSpeed: 8,
        windDirection: new THREE.Vector3(1, 0, 0.3),
        temperature: -2,
        humidity: 70,
        cloudCover: 0.8,
        precipitationRate: 2,
        visibility: 15
      },
      fog: {
        intensity: 0.5,
        windSpeed: 1,
        windDirection: new THREE.Vector3(0, 0, 0),
        temperature: 10,
        humidity: 95,
        cloudCover: 0.5,
        precipitationRate: 0,
        visibility: 5
      },
      storm: {
        intensity: 0.9,
        windSpeed: 25,
        windDirection: new THREE.Vector3(1, 0, 1),
        temperature: 12,
        humidity: 90,
        cloudCover: 1.0,
        precipitationRate: 15,
        visibility: 8
      },
      thunderstorm: {
        intensity: 1.0,
        windSpeed: 35,
        windDirection: new THREE.Vector3(1, 0, 1),
        temperature: 14,
        humidity: 95,
        cloudCover: 1.0,
        precipitationRate: 20,
        visibility: 5
      }
    };
    
    return defaults[type];
  }

  /**
   * Initialize particle systems for precipitation
   */
  private initializeParticleSystems(): void {
    // Rain particles
    const rainGeometry = new THREE.BufferGeometry();
    const rainCount = 10000;
    const rainPositions = new Float32Array(rainCount * 3);
    const rainVelocities = new Float32Array(rainCount);
    
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 200;
      rainPositions[i * 3 + 1] = Math.random() * 100;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      rainVelocities[i] = 20 + Math.random() * 10;
    }
    
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(rainVelocities, 1));
    
    const rainMaterial = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 0.2,
      transparent: true,
      opacity: 0.6
    });
    
    this.rainParticles = new THREE.Points(rainGeometry, rainMaterial);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
    
    // Snow particles
    const snowGeometry = new THREE.BufferGeometry();
    const snowCount = 5000;
    const snowPositions = new Float32Array(snowCount * 3);
    
    for (let i = 0; i < snowCount; i++) {
      snowPositions[i * 3] = (Math.random() - 0.5) * 200;
      snowPositions[i * 3 + 1] = Math.random() * 100;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    
    const snowMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.8
    });
    
    this.snowParticles = new THREE.Points(snowGeometry, snowMaterial);
    this.snowParticles.visible = false;
    this.scene.add(this.snowParticles);
  }

  /**
   * Transition to a new weather type
   */
  setWeather(type: WeatherType, transitionDuration: number = 5000): void {
    if (this.state.currentType === type) return;
    
    this.state.targetWeather = type;
    this.state.transitionProgress = 0;
    
    // Start transition animation
    this.startTransition(transitionDuration);
  }

  /**
   * Animate weather transition
   */
  private startTransition(duration: number): void {
    const startTime = Date.now();
    const startParams = { ...this.state.params };
    const targetParams = this.getDefaultParams(this.state.targetWeather!);
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      this.state.transitionProgress = Math.min(elapsed / duration, 1);
      
      const t = this.easeInOutCubic(this.state.transitionProgress);
      
      // Interpolate parameters
      this.state.params.intensity = this.lerp(startParams.intensity, targetParams.intensity, t);
      this.state.params.windSpeed = this.lerp(startParams.windSpeed, targetParams.windSpeed, t);
      this.state.params.temperature = this.lerp(startParams.temperature, targetParams.temperature, t);
      this.state.params.humidity = this.lerp(startParams.humidity, targetParams.humidity, t);
      this.state.params.cloudCover = this.lerp(startParams.cloudCover, targetParams.cloudCover, t);
      this.state.params.precipitationRate = this.lerp(startParams.precipitationRate, targetParams.precipitationRate, t);
      this.state.params.visibility = this.lerp(startParams.visibility, targetParams.visibility, t);
      
      this.updateParticleVisibility();
      this.updateClouds();
      
      if (this.state.transitionProgress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.state.currentType = this.state.targetWeather!;
        this.state.targetWeather = null;
      }
    };
    
    animate();
  }

  /**
   * Update weather simulation
   */
  update(deltaTime: number): void {
    const time = Date.now();
    
    // Update particles
    this.updateRainParticles(deltaTime);
    this.updateSnowParticles(deltaTime);
    
    // Update clouds
    this.updateClouds();
    
    // Handle lightning for thunderstorms
    if (this.state.currentType === 'thunderstorm' || this.state.currentType === 'storm') {
      if (time - this.lastLightningTime > this.lightningInterval * (0.5 + Math.random())) {
        this.triggerLightning();
        this.lastLightningTime = time;
      }
    }
    
    // Add noise-based variation
    this.addWeatherVariation(deltaTime);
  }

  /**
   * Update rain particle positions
   */
  private updateRainParticles(deltaTime: number): void {
    if (!this.rainParticles || !this.rainParticles.visible) return;
    
    const positions = this.rainParticles.geometry.attributes.position.array as Float32Array;
    const velocities = this.rainParticles.geometry.attributes.velocity.array as Float32Array;
    
    for (let i = 0; i < positions.length / 3; i++) {
      // Apply gravity and wind
      positions[i * 3 + 1] -= velocities[i] * deltaTime;
      positions[i * 3] += this.state.params.windDirection.x * this.state.params.windSpeed * deltaTime;
      positions[i * 3 + 2] += this.state.params.windDirection.z * this.state.params.windSpeed * deltaTime;
      
      // Reset particle if it falls below ground
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 100;
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      }
    }
    
    this.rainParticles.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Update snow particle positions
   */
  private updateSnowParticles(deltaTime: number): void {
    if (!this.snowParticles || !this.snowParticles.visible) return;
    
    const positions = this.snowParticles.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length / 3; i++) {
      // Gentle falling with wind drift
      positions[i * 3 + 1] -= 2 * deltaTime;
      positions[i * 3] += Math.sin(time * 0.001 + i) * 0.5 * deltaTime;
      positions[i * 3] += this.state.params.windDirection.x * this.state.params.windSpeed * 0.3 * deltaTime;
      positions[i * 3 + 2] += this.state.params.windDirection.z * this.state.params.windSpeed * 0.3 * deltaTime;
      
      // Reset particle if it falls below ground
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 100;
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      }
    }
    
    this.snowParticles.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Update cloud system
   */
  private updateClouds(): void {
    // Simplified cloud update - in production would use volumetric clouds
    const targetCloudCount = Math.floor(this.state.params.cloudCover * 20);
    
    while (this.clouds.children.length < targetCloudCount) {
      const cloud = this.createCloud();
      this.clouds.add(cloud);
    }
    
    while (this.clouds.children.length > targetCloudCount) {
      this.clouds.remove(this.clouds.children[this.clouds.children.length - 1]);
    }
    
    // Move clouds with wind
    this.clouds.children.forEach((cloud, i) => {
      cloud.position.x += this.state.params.windDirection.x * this.state.params.windSpeed * 0.1;
      cloud.position.z += this.state.params.windDirection.z * this.state.params.windSpeed * 0.1;
      
      // Wrap around
      if (cloud.position.x > 100) cloud.position.x = -100;
      if (cloud.position.x < -100) cloud.position.x = 100;
      if (cloud.position.z > 100) cloud.position.z = -100;
      if (cloud.position.z < -100) cloud.position.z = 100;
    });
  }

  /**
   * Create a simple cloud mesh
   */
  private createCloud(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(5 + Math.random() * 10, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6
    });
    
    const cloud = new THREE.Mesh(geometry, material);
    cloud.position.set(
      (Math.random() - 0.5) * 200,
      50 + Math.random() * 30,
      (Math.random() - 0.5) * 200
    );
    
    return cloud;
  }

  /**
   * Trigger lightning flash
   */
  private triggerLightning(): void {
    // Flash the scene with bright light
    const flashColor = 0xffffff;
    const flashIntensity = 2.0;
    
    // In production, would add actual lightning bolt mesh and sound
    console.log('⚡ Lightning strike!');
  }

  /**
   * Add natural variation to weather parameters
   */
  private addWeatherVariation(deltaTime: number): void {
    const time = Date.now() * 0.001;
    const variation = this.noise.noise3D(time * 0.1, 0, 0) * 0.1;
    
    this.state.params.windSpeed *= (1 + variation);
    this.state.params.cloudCover = Math.max(0, Math.min(1, this.state.params.cloudCover + variation * 0.05));
  }

  /**
   * Update particle system visibility based on weather
   */
  private updateParticleVisibility(): void {
    if (this.rainParticles) {
      this.rainParticles.visible = 
        this.state.currentType === 'rain' || 
        this.state.currentType === 'storm' ||
        this.state.currentType === 'thunderstorm';
      
      this.rainParticles.material.opacity = this.state.params.intensity * 0.6;
    }
    
    if (this.snowParticles) {
      this.snowParticles.visible = this.state.currentType === 'snow';
      this.snowParticles.material.opacity = this.state.params.intensity * 0.8;
    }
  }

  /**
   * Utility: Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Utility: Ease-in-out cubic
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Get current weather state
   */
  getState(): WeatherState {
    return { ...this.state };
  }

  /**
   * Get current visibility distance
   */
  getVisibility(): number {
    return this.state.params.visibility;
  }
}

export default WeatherSystem;
