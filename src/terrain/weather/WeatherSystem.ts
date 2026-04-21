/**
 * Dynamic Weather System
 * 
 * Implements dynamic weather effects including rain, snow, fog, and storms.
 * Inspired by Infinigen's environmental simulation capabilities.
 * 
 * Features:
 * - Particle-based precipitation (rain/snow)
 * - Volumetric fog with height variation
 * - Lightning and thunder effects
 * - Wind simulation affecting particles
 * - Smooth weather transitions
 * 
 * @see https://github.com/princeton-vl/infinigen
 */

import * as THREE from 'three';

export type WeatherType = 'clear' | 'rain' | 'snow' | 'fog' | 'storm' | 'drizzle';

export interface WeatherParams {
  // Precipitation
  precipitationRate: number; // 0-1
  precipitationType: 'rain' | 'snow';
  
  // Fog
  fogDensity: number;
  fogHeight: number;
  fogDecay: number;
  
  // Wind
  windSpeed: THREE.Vector3;
  windGusts: number;
  
  // Storm
  lightningFrequency: number;
  cloudCover: number;
  
  // Transitions
  transitionDuration: number;
}

const DEFAULT_WEATHER_PARAMS: WeatherParams = {
  precipitationRate: 0,
  precipitationType: 'rain',
  fogDensity: 0,
  fogHeight: 100,
  fogDecay: 0.02,
  windSpeed: new THREE.Vector3(5, 0, 2),
  windGusts: 0.3,
  lightningFrequency: 0,
  cloudCover: 0.3,
  transitionDuration: 5000,
};

/**
 * Weather preset configurations
 */
export const WEATHER_PRESETS: Record<WeatherType, Partial<WeatherParams>> = {
  clear: {
    precipitationRate: 0,
    fogDensity: 0.0001,
    cloudCover: 0.2,
    windSpeed: new THREE.Vector3(2, 0, 1),
    lightningFrequency: 0,
  },
  drizzle: {
    precipitationRate: 0.2,
    precipitationType: 'rain',
    fogDensity: 0.0005,
    cloudCover: 0.6,
    windSpeed: new THREE.Vector3(3, 0, 2),
    lightningFrequency: 0,
  },
  rain: {
    precipitationRate: 0.6,
    precipitationType: 'rain',
    fogDensity: 0.001,
    cloudCover: 0.8,
    windSpeed: new THREE.Vector3(8, 0, 4),
    lightningFrequency: 0.05,
  },
  snow: {
    precipitationRate: 0.4,
    precipitationType: 'snow',
    fogDensity: 0.0008,
    fogHeight: 50,
    cloudCover: 0.7,
    windSpeed: new THREE.Vector3(4, 0, 2),
    lightningFrequency: 0,
  },
  fog: {
    precipitationRate: 0.1,
    precipitationType: 'rain',
    fogDensity: 0.02,
    fogHeight: 30,
    fogDecay: 0.01,
    cloudCover: 0.9,
    windSpeed: new THREE.Vector3(1, 0, 0.5),
    lightningFrequency: 0,
  },
  storm: {
    precipitationRate: 0.9,
    precipitationType: 'rain',
    fogDensity: 0.002,
    cloudCover: 1.0,
    windSpeed: new THREE.Vector3(15, 0, 8),
    windGusts: 0.8,
    lightningFrequency: 0.3,
  },
};

/**
 * Dynamic weather system manager
 */
export class WeatherSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  
  // Precipitation
  private rainParticles?: THREE.Points;
  private rainMaterial?: THREE.ShaderMaterial;
  private rainGeometry?: THREE.BufferGeometry;
  private rainData: Float32Array;
  
  // Fog
  private fogMesh?: THREE.Mesh;
  private fogMaterial?: THREE.ShaderMaterial;
  
  // Lightning
  private lightningMesh?: THREE.Mesh;
  private lightningMaterial?: THREE.ShaderMaterial;
  private lastLightningTime: number = 0;
  
  private params: WeatherParams;
  private currentWeather: WeatherType = 'clear';
  private targetParams: Partial<WeatherParams> = {};
  private transitionStartTime: number = 0;
  private isTransitioning: boolean = false;
  
  private time: number = 0;
  
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    params: Partial<WeatherParams> = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    
    this.params = { ...DEFAULT_WEATHER_PARAMS, ...params };
    this.rainData = new Float32Array(10000 * 3); // 10K particles
    
    this.initializeRain();
    this.initializeFog();
    this.initializeLightning();
  }
  
  /**
   * Initialize rain particle system
   */
  private initializeRain(): void {
    const particleCount = 10000;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 200;
      positions[i * 3 + 1] = Math.random() * 100;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      
      velocities[i * 3] = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = -10 - Math.random() * 5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      
      sizes[i] = Math.random() * 0.1 + 0.05;
    }
    
    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    this.rainGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const vertexShader = `
      attribute vec3 velocity;
      attribute float size;
      
      uniform float time;
      uniform vec3 windSpeed;
      uniform float precipitationRate;
      
      varying float vOpacity;
      
      void main() {
        vec3 pos = position;
        
        // Animate raindrop
        pos.x += windSpeed.x * time * 0.001 + velocity.x * time * 0.001;
        pos.y += velocity.y * time * 0.001;
        pos.z += windSpeed.z * time * 0.001 + velocity.z * time * 0.001;
        
        // Reset when below ground
        if (pos.y < 0.0) {
          pos.y = 100.0;
        }
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        // Size attenuation
        gl_PointSize = size * (300.0 / -mvPosition.z);
        
        // Fade based on precipitation rate
        vOpacity = precipitationRate;
      }
    `;
    
    const fragmentShader = `
      varying float vOpacity;
      
      void main() {
        // Circular raindrop
        vec2 coord = gl_PointCoord - vec2(0.5);
        if (length(coord) > 0.5) discard;
        
        // Gradient for raindrop appearance
        float alpha = 1.0 - length(coord) * 2.0;
        alpha = smoothstep(0.0, 1.0, alpha);
        
        vec3 color = vec3(0.7, 0.8, 0.9);
        gl_FragColor = vec4(color, alpha * vOpacity * 0.6);
      }
    `;
    
    this.rainMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        windSpeed: { value: this.params.windSpeed },
        precipitationRate: { value: this.params.precipitationRate },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    
    this.rainParticles = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainParticles.visible = this.params.precipitationRate > 0.01;
    this.scene.add(this.rainParticles);
  }
  
  /**
   * Initialize volumetric fog
   */
  private initializeFog(): void {
    const geometry = new THREE.PlaneGeometry(2000, 2000, 64, 64);
    
    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform float fogDensity;
      uniform float fogHeight;
      uniform float fogDecay;
      uniform float time;
      uniform vec3 cameraPosition;
      
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      
      // Simple noise function
      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p * frequency);
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        
        return value;
      }
      
      void main() {
        // Height-based fog density
        float heightFactor = exp(-(vWorldPosition.y - fogHeight) * fogDecay);
        heightFactor = clamp(heightFactor, 0.0, 1.0);
        
        // Animated noise for fog movement
        vec2 noisePos = vUv * 10.0 + vec2(time * 0.01);
        float noiseValue = fbm(noisePos);
        
        float density = fogDensity * heightFactor * (0.5 + 0.5 * noiseValue);
        
        // Distance fog
        float dist = distance(vWorldPosition.xz, cameraPosition.xz);
        float fogFactor = 1.0 - exp(-dist * density);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        
        vec3 fogColor = vec3(0.8, 0.85, 0.9);
        gl_FragColor = vec4(fogColor, fogFactor * 0.5);
      }
    `;
    
    this.fogMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        fogDensity: { value: this.params.fogDensity },
        fogHeight: { value: this.params.fogHeight },
        fogDecay: { value: this.params.fogDecay },
        time: { value: 0 },
        cameraPosition: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    
    this.fogMesh = new THREE.Mesh(geometry, this.fogMaterial);
    this.fogMesh.position.y = 0.5;
    this.fogMesh.rotation.x = -Math.PI / 2;
    this.fogMesh.visible = this.params.fogDensity > 0.0001;
    this.scene.add(this.fogMesh);
  }
  
  /**
   * Initialize lightning effect
   */
  private initializeLightning(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform float flashIntensity;
      uniform vec3 flashColor;
      
      void main() {
        vec3 color = flashColor * flashIntensity;
        gl_FragColor = vec4(color, flashIntensity);
      }
    `;
    
    this.lightningMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        flashIntensity: { value: 0 },
        flashColor: { value: new THREE.Color(1.0, 0.95, 0.8) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    
    this.lightningMesh = new THREE.Mesh(geometry, this.lightningMaterial);
    this.lightningMesh.frustumCulled = false;
    this.scene.add(this.lightningMesh);
  }
  
  /**
   * Set weather type with smooth transition
   */
  setWeather(type: WeatherType): void {
    const preset = WEATHER_PRESETS[type];
    if (!preset) return;
    
    this.targetParams = preset;
    this.transitionStartTime = performance.now();
    this.isTransitioning = true;
    this.currentWeather = type;
  }
  
  /**
   * Update weather parameters directly
   */
  updateParams(params: Partial<WeatherParams>): void {
    this.params = { ...this.params, ...params };
    this.updateUniforms();
  }
  
  /**
   * Interpolate between current and target parameters
   */
  private interpolateParams(deltaTime: number): void {
    if (!this.isTransitioning) return;
    
    const elapsed = performance.now() - this.transitionStartTime;
    const t = Math.min(elapsed / this.params.transitionDuration, 1.0);
    const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // Ease in-out
    
    for (const key in this.targetParams) {
      const targetValue = (this.targetParams as any)[key];
      const currentValue = (this.params as any)[key];
      
      if (targetValue instanceof THREE.Vector3) {
        (currentValue as THREE.Vector3).lerp(targetValue, easeT);
      } else if (typeof targetValue === 'number') {
        (this.params as any)[key] = currentValue + (targetValue - currentValue) * easeT;
      }
    }
    
    if (t >= 1.0) {
      this.isTransitioning = false;
    }
    
    this.updateUniforms();
  }
  
  /**
   * Update all shader uniforms
   */
  private updateUniforms(): void {
    if (this.rainMaterial) {
      this.rainMaterial.uniforms.windSpeed.value.copy(this.params.windSpeed);
      this.rainMaterial.uniforms.precipitationRate.value = this.params.precipitationRate;
    }
    
    if (this.fogMaterial) {
      this.fogMaterial.uniforms.fogDensity.value = this.params.fogDensity;
      this.fogMaterial.uniforms.fogHeight.value = this.params.fogHeight;
      this.fogMaterial.uniforms.fogDecay.value = this.params.fogDecay;
    }
    
    // Update visibility
    if (this.rainParticles) {
      this.rainParticles.visible = this.params.precipitationRate > 0.01;
    }
    
    if (this.fogMesh) {
      this.fogMesh.visible = this.params.fogDensity > 0.0001;
    }
  }
  
  /**
   * Trigger lightning flash
   */
  private triggerLightning(): void {
    const now = performance.now();
    if (now - this.lastLightningTime < 2000) return; // Minimum 2s between strikes
    
    this.lastLightningTime = now;
    
    // Flash sequence
    let flashCount = 0;
    const maxFlashes = 3 + Math.floor(Math.random() * 3);
    const flashInterval = setInterval(() => {
      flashCount++;
      
      if (flashCount <= maxFlashes && this.lightningMaterial) {
        const intensity = 0.5 + Math.random() * 0.5;
        this.lightningMaterial.uniforms.flashIntensity.value = intensity;
        
        setTimeout(() => {
          if (this.lightningMaterial) {
            this.lightningMaterial.uniforms.flashIntensity.value = 0;
          }
        }, 50 + Math.random() * 100);
      } else {
        clearInterval(flashInterval);
      }
    }, 100 + Math.random() * 150);
  }
  
  /**
   * Update rain particle positions
   */
  private updateRainParticles(deltaTime: number): void {
    if (!this.rainGeometry || !this.rainParticles?.visible) return;
    
    const positions = this.rainGeometry.attributes.position.array as Float32Array;
    const velocities = this.rainGeometry.attributes.velocity.array as Float32Array;
    
    for (let i = 0; i < positions.length / 3; i++) {
      // Apply wind
      positions[i * 3] += this.params.windSpeed.x * deltaTime * 0.01;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime * 0.01;
      positions[i * 3 + 2] += this.params.windSpeed.z * deltaTime * 0.01;
      
      // Reset when below ground
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
      }
    }
    
    this.rainGeometry.attributes.position.needsUpdate = true;
  }
  
  /**
   * Animate weather system
   */
  animate(deltaTime: number): void {
    this.time += deltaTime;
    
    // Interpolate parameters if transitioning
    this.interpolateParams(deltaTime);
    
    // Update rain particles
    this.updateRainParticles(deltaTime);
    
    // Update fog animation
    if (this.fogMaterial) {
      this.fogMaterial.uniforms.time.value = this.time;
      this.fogMaterial.uniforms.cameraPosition.value.copy(this.camera.position);
    }
    
    // Random lightning during storms
    if (this.params.lightningFrequency > 0 && Math.random() < this.params.lightningFrequency * deltaTime * 0.01) {
      this.triggerLightning();
    }
    
    // Wind gusts
    if (this.params.windGusts > 0 && Math.random() < 0.01) {
      const gustStrength = this.params.windGusts * (0.5 + Math.random() * 0.5);
      this.params.windSpeed.x += (Math.random() - 0.5) * gustStrength;
      this.params.windSpeed.z += (Math.random() - 0.5) * gustStrength;
      this.updateUniforms();
    }
  }
  
  /**
   * Get current weather type
   */
  getCurrentWeather(): WeatherType {
    return this.currentWeather;
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.rainParticles) {
      this.scene.remove(this.rainParticles);
      this.rainGeometry?.dispose();
      this.rainMaterial?.dispose();
    }
    
    if (this.fogMesh) {
      this.scene.remove(this.fogMesh);
      this.fogMesh.geometry.dispose();
      this.fogMaterial?.dispose();
    }
    
    if (this.lightningMesh) {
      this.scene.remove(this.lightningMesh);
      this.lightningMesh.geometry.dispose();
      this.lightningMaterial?.dispose();
    }
  }
}

export default WeatherSystem;
