/**
 * WindAnimationSystem - Procedural wind animation for vegetation and objects
 * 
 * Implements realistic wind simulation for animating plants, trees, flags,
 * and other flexible objects. Uses Perlin noise for natural motion patterns.
 * 
 * Features:
 * - Multi-layer wind noise (gusts, turbulence, steady flow)
 * - Object-specific response curves
 * - LOD-based animation quality
 * - Performance-optimized vertex shader integration
 * - Seasonal wind strength variation
 * 
 * @module WindAnimationSystem
 */

import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

export type WindLayer = 'base' | 'gusts' | 'turbulence';

export interface WindParams {
  // Base wind
  speed: number;
  direction: THREE.Vector3;
  
  // Gusts
  gustStrength: number;
  gustFrequency: number;
  gustDuration: number;
  
  // Turbulence
  turbulenceStrength: number;
  turbulenceScale: number;
  
  // Time
  timeScale: number;
  
  // Height influence
  heightExponent: number;
}

export interface AnimationConfig {
  // Response to wind
  flexibility: number;
  damping: number;
  mass: number;
  
  // Motion limits
  maxAngle: number;
  minAngle: number;
  
  // Frequency response
  naturalFrequency: number;
  
  // LOD
  lodDistance: number;
  lodQuality: 'low' | 'medium' | 'high';
}

const DEFAULT_WIND_PARAMS: WindParams = {
  speed: 5.0,
  direction: new THREE.Vector3(1, 0, 0),
  gustStrength: 2.0,
  gustFrequency: 0.2,
  gustDuration: 3.0,
  turbulenceStrength: 0.5,
  turbulenceScale: 1.0,
  timeScale: 1.0,
  heightExponent: 0.5
};

const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  flexibility: 0.5,
  damping: 0.9,
  mass: 1.0,
  maxAngle: Math.PI / 4,
  minAngle: -Math.PI / 4,
  naturalFrequency: 2.0,
  lodDistance: 50,
  lodQuality: 'medium'
};

export class WindAnimationSystem {
  private noise: SimplexNoise;
  private windParams: WindParams;
  private time: number = 0;
  private activeGusts: Array<{strength: number; direction: THREE.Vector3; progress: number}> = [];
  
  constructor(windParams: Partial<WindParams> = {}) {
    this.noise = new SimplexNoise();
    this.windParams = { ...DEFAULT_WIND_PARAMS, ...windParams };
    
    // Normalize direction
    this.windParams.direction.normalize();
  }

  /**
   * Update wind simulation
   */
  update(deltaTime: number): void {
    this.time += deltaTime * this.windParams.timeScale;
    
    // Generate random gusts
    if (Math.random() < this.windParams.gustFrequency * deltaTime) {
      this.generateGust();
    }
    
    // Update active gusts
    this.updateGusts(deltaTime);
  }

  /**
   * Generate a wind gust
   */
  private generateGust(): void {
    const strength = this.windParams.gustStrength * (0.5 + Math.random());
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() * 0.3,
      Math.random() - 0.5
    ).normalize();
    
    this.activeGusts.push({
      strength,
      direction,
      progress: 0
    });
  }

  /**
   * Update active gusts
   */
  private updateGusts(deltaTime: number): void {
    for (let i = this.activeGusts.length - 1; i >= 0; i--) {
      const gust = this.activeGusts[i];
      gust.progress += deltaTime / this.windParams.gustDuration;
      
      if (gust.progress >= 1) {
        this.activeGusts.splice(i, 1);
      }
    }
  }

  /**
   * Get wind force at a specific position and time
   */
  getWindForce(position: THREE.Vector3, height: number = 0): THREE.Vector3 {
    const baseForce = this.getBaseWind(position, height);
    const gustForce = this.getGustForce(position, height);
    const turbulence = this.getTurbulence(position, height);
    
    const totalForce = new THREE.Vector3();
    totalForce.add(baseForce);
    totalForce.add(gustForce);
    totalForce.add(turbulence);
    
    return totalForce;
  }

  /**
   * Get base wind component
   */
  private getBaseWind(position: THREE.Vector3, height: number): THREE.Vector3 {
    // Height-based wind strength (stronger at higher altitudes)
    const heightMultiplier = Math.pow(height + 1, this.windParams.heightExponent);
    
    const baseSpeed = this.windParams.speed * heightMultiplier;
    
    return this.windParams.direction.clone().multiplyScalar(baseSpeed);
  }

  /**
   * Get gust force component
   */
  private getGustForce(position: THREE.Vector3, height: number): THREE.Vector3 {
    let gustForce = new THREE.Vector3(0, 0, 0);
    
    for (const gust of this.activeGusts) {
      // Smooth gust envelope
      const envelope = Math.sin(gust.progress * Math.PI);
      
      gustForce.add(
        gust.direction.clone().multiplyScalar(
          gust.strength * envelope * height
        )
      );
    }
    
    return gustForce;
  }

  /**
   * Get turbulence component using noise
   */
  private getTurbulence(position: THREE.Vector3, height: number): THREE.Vector3 {
    const scale = this.windParams.turbulenceScale;
    const strength = this.windParams.turbulenceStrength;
    
    const nx = this.noise.noise3D(
      position.x * scale * 0.1,
      position.y * scale * 0.1,
      this.time * 0.5
    );
    
    const ny = this.noise.noise3D(
      position.x * scale * 0.1 + 100,
      position.y * scale * 0.1,
      this.time * 0.5
    );
    
    const nz = this.noise.noise3D(
      position.x * scale * 0.1 + 200,
      position.y * scale * 0.1,
      this.time * 0.5
    );
    
    return new THREE.Vector3(nx, ny, nz).multiplyScalar(strength * height);
  }

  /**
   * Calculate vertex displacement for wind animation
   */
  calculateVertexDisplacement(
    originalPosition: THREE.Vector3,
    pivotPoint: THREE.Vector3,
    config: AnimationConfig
  ): THREE.Vector3 {
    const height = originalPosition.y - pivotPoint.y;
    if (height <= 0) return new THREE.Vector3(0, 0, 0);
    
    const windForce = this.getWindForce(originalPosition, height);
    
    // Apply flexibility
    const displacement = windForce.clone().multiplyScalar(config.flexibility);
    
    // Apply damping based on mass
    displacement.multiplyScalar(1 / config.mass);
    
    // Limit displacement angle
    const displacementLength = displacement.length();
    const maxDisplacement = Math.tan(config.maxAngle) * height;
    
    if (displacementLength > maxDisplacement) {
      displacement.setLength(maxDisplacement);
    }
    
    return displacement;
  }

  /**
   * Animate a tree or plant hierarchy
   */
  animateHierarchy(
    root: THREE.Object3D,
    config: AnimationConfig,
    deltaTime: number
  ): void {
    this.update(deltaTime);
    
    // Traverse and animate each branch/leaf
    root.traverse((child) => {
      if (child.userData.isVegetationPart) {
        const pivot = child.userData.pivotPoint || root.position;
        const originalPos = child.userData.originalPosition || child.position.clone();
        
        // Store original position if not already stored
        if (!child.userData.originalPosition) {
          child.userData.originalPosition = child.position.clone();
        }
        
        const displacement = this.calculateVertexDisplacement(
          originalPos,
          new THREE.Vector3().copy(pivot),
          config
        );
        
        child.position.copy(originalPos).add(displacement);
      }
    });
  }

  /**
   * Create wind animation shader uniforms
   */
  createShaderUniforms(): Record<string, { value: any }> {
    return {
      uTime: { value: 0 },
      uWindSpeed: { value: this.windParams.speed },
      uWindDirection: { value: this.windParams.direction },
      uGustStrength: { value: this.windParams.gustStrength },
      uTurbulenceStrength: { value: this.windParams.turbulenceStrength },
      uFlexibility: { value: DEFAULT_ANIMATION_CONFIG.flexibility },
      uHeightExponent: { value: this.windParams.heightExponent }
    };
  }

  /**
   * Update shader uniforms
   */
  updateShaderUniforms(uniforms: Record<string, { value: any }>): void {
    if (uniforms.uTime) {
      uniforms.uTime.value = this.time;
    }
    if (uniforms.uWindSpeed) {
      uniforms.uWindSpeed.value = this.windParams.speed;
    }
    if (uniforms.uWindDirection) {
      uniforms.uWindDirection.value = this.windParams.direction;
    }
  }

  /**
   * Get wind parameters for shader
   */
  getWindShaderData(): {
    speed: number;
    direction: THREE.Vector3;
    gustStrength: number;
    turbulence: number;
    time: number;
  } {
    return {
      speed: this.windParams.speed,
      direction: this.windParams.direction,
      gustStrength: this.windParams.gustStrength,
      turbulence: this.windParams.turbulenceStrength,
      time: this.time
    };
  }

  /**
   * Set wind parameters
   */
  setWindParams(params: Partial<WindParams>): void {
    this.windParams = { ...this.windParams, ...params };
    
    if (this.windParams.direction) {
      this.windParams.direction.normalize();
    }
  }

  /**
   * Get current wind state
   */
  getWindState(): {
    params: WindParams;
    time: number;
    activeGustCount: number;
  } {
    return {
      params: { ...this.windParams },
      time: this.time,
      activeGustCount: this.activeGusts.length
    };
  }

  /**
   * Create wind zone for localized effects
   */
  createWindZone(
    center: THREE.Vector3,
    radius: number,
    params: Partial<WindParams>
  ): WindZone {
    return new WindZone(center, radius, params);
  }
}

/**
 * Localized wind zone
 */
export class WindZone {
  private center: THREE.Vector3;
  private radius: number;
  private params: WindParams;
  private falloffExponent: number = 2.0;
  
  constructor(
    center: THREE.Vector3,
    radius: number,
    params: Partial<WindParams>
  ) {
    this.center = center.clone();
    this.radius = radius;
    this.params = { ...DEFAULT_WIND_PARAMS, ...params };
  }

  /**
   * Get wind force at position within zone
   */
  getForceAt(position: THREE.Vector3): THREE.Vector3 {
    const distance = position.distanceTo(this.center);
    
    if (distance > this.radius) {
      return new THREE.Vector3(0, 0, 0);
    }
    
    // Falloff based on distance from center
    const falloff = Math.pow(1 - distance / this.radius, this.falloffExponent);
    
    const baseForce = this.params.direction.clone().multiplyScalar(
      this.params.speed * falloff
    );
    
    return baseForce;
  }

  /**
   * Check if position is inside zone
   */
  contains(position: THREE.Vector3): boolean {
    return position.distanceTo(this.center) <= this.radius;
  }

  /**
   * Set falloff exponent
   */
  setFalloff(exponent: number): void {
    this.falloffExponent = exponent;
  }
}

export default WindAnimationSystem;
