/**
 * Floating Dust / Pollen Particle System
 *
 * Ambient atmospheric particles drifting in Brownian motion.
 * Creates subtle depth cues in clear weather, especially visible
 * in sunbeams. Uses InstancedMesh for performance.
 *
 * @module DustSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';
import { createCanvas } from '../utils/CanvasUtils';

export interface DustParams {
  intensity: number;           // 0-1, controls visibility
  windSpeed: number;           // m/s (usually low, 0-3)
  windDirection: THREE.Vector3;
  particleSize: number;        // default 0.03
  driftSpeed: number;          // lateral drift, default 0.3
  brownianStrength: number;    // random walk intensity, default 0.15
  sunDirection: THREE.Vector3; // for sunbeam visibility
  volumeSize: THREE.Vector3;   // bounding volume, default (60, 30, 60)
  color: THREE.ColorRepresentation; // default 0xffffee (warm white)
}

/**
 * Floating Dust / Pollen Particle System
 *
 * Simulates tiny atmospheric particles (dust motes, pollen) that drift
 * lazily through the air using Brownian-motion-like random walks.
 * Unlike rain or snow, these particles have no gravity — they float
 * and gently meander, becoming more visible when caught in sunbeams
 * or when close to the camera.
 */
export class DustSystem {
  private scene: THREE.Scene;
  private params: DustParams;
  private rng: SeededRandom;
  private dustMesh: THREE.InstancedMesh | null = null;
  private dummy: THREE.Object3D;
  private particleData: Float32Array; // x, y, z, vx, vy, vz, phase (7 per particle)
  private readonly maxParticles = 1500;

  // Camera reference for distance-based alpha
  private camera: THREE.Camera | null = null;

  // Reusable vectors to avoid per-frame allocation
  private _tempVec: THREE.Vector3;
  private _particleToCamera: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    params: Partial<DustParams> = {},
    seed: number = 42
  ) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.params = {
      intensity: params.intensity ?? 0.5,
      windSpeed: params.windSpeed ?? 1.0,
      windDirection: params.windDirection || new THREE.Vector3(1, 0, 0.3).normalize(),
      particleSize: params.particleSize ?? 0.03,
      driftSpeed: params.driftSpeed ?? 0.3,
      brownianStrength: params.brownianStrength ?? 0.15,
      sunDirection: params.sunDirection || new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
      volumeSize: params.volumeSize || new THREE.Vector3(60, 30, 60),
      color: params.color ?? 0xffffee,
    };

    this.dummy = new THREE.Object3D();
    this.particleData = new Float32Array(this.maxParticles * 7);
    this._tempVec = new THREE.Vector3();
    this._particleToCamera = new THREE.Vector3();

    this.initialize();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private initialize(): void {
    // Tiny sphere geometry — dust is omnidirectional, not a flat sprite
    const geometry = new THREE.SphereGeometry(0.03, 4, 4);

    // Create soft dot texture using CanvasUtils
    const canvas = createCanvas();
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 240, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 230, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 255, 220, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.MeshBasicMaterial({
      color: this.params.color,
      map: texture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.dustMesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dustMesh.frustumCulled = false;
    this.scene.add(this.dustMesh);

    // Initialize particle data
    for (let i = 0; i < this.maxParticles; i++) {
      this.resetParticle(i);
    }

    // Initialize instance matrices
    for (let i = 0; i < this.maxParticles; i++) {
      const x = this.particleData[i * 7];
      const y = this.particleData[i * 7 + 1];
      const z = this.particleData[i * 7 + 2];
      const size = this.particleData[i * 7 + 6] * this.params.particleSize;

      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(size, size, size);
      this.dummy.updateMatrix();
      this.dustMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.dustMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Particle Reset / Spawn
  // -------------------------------------------------------------------------

  private resetParticle(index: number): void {
    const vol = this.params.volumeSize;
    const halfX = vol.x * 0.5;
    const halfZ = vol.z * 0.5;

    const x = (this.rng.next() - 0.5) * vol.x;
    const y = this.rng.next() * vol.y;
    const z = (this.rng.next() - 0.5) * vol.z;
    const vx = (this.rng.next() - 0.5) * 0.02;
    const vy = (this.rng.next() - 0.5) * 0.01;
    const vz = (this.rng.next() - 0.5) * 0.02;
    // Phase used for subtle oscillation variation per particle
    const phase = this.rng.next() * Math.PI * 2;

    const offset = index * 7;
    this.particleData[offset] = x;
    this.particleData[offset + 1] = y;
    this.particleData[offset + 2] = z;
    this.particleData[offset + 3] = vx;
    this.particleData[offset + 4] = vy;
    this.particleData[offset + 5] = vz;
    this.particleData[offset + 6] = phase;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(deltaTime: number): void {
    if (!this.dustMesh) return;

    const activeCount = Math.floor(this.maxParticles * this.params.intensity);

    // Wind components (gentle)
    const windX = this.params.windDirection.x * this.params.windSpeed * this.params.driftSpeed;
    const windY = this.params.windDirection.y * this.params.windSpeed * this.params.driftSpeed;
    const windZ = this.params.windDirection.z * this.params.windSpeed * this.params.driftSpeed;

    const vol = this.params.volumeSize;
    const halfX = vol.x * 0.5;
    const halfY = vol.y;
    const halfZ = vol.z * 0.5;

    const brownian = this.params.brownianStrength;
    const drag = 0.98;

    // Time for subtle oscillation
    const time = typeof performance !== 'undefined' ? performance.now() * 0.001 : Date.now() * 0.001;

    // Sun direction (normalized)
    const sunDir = this.params.sunDirection;

    // Camera position for distance-based alpha
    const cameraPos = this.camera ? this.camera.position : null;

    // Material opacity will be modulated per-frame based on average visibility
    const baseMaterial = this.dustMesh.material as THREE.MeshBasicMaterial;

    for (let i = 0; i < activeCount; i++) {
      const offset = i * 7;

      // Read current state
      let x = this.particleData[offset];
      let y = this.particleData[offset + 1];
      let z = this.particleData[offset + 2];
      let vx = this.particleData[offset + 3];
      let vy = this.particleData[offset + 4];
      let vz = this.particleData[offset + 5];
      const phase = this.particleData[offset + 6];

      // --- Brownian motion: add small random perturbation to velocity ---
      vx += (this.rng.next() - 0.5) * brownian;
      vy += (this.rng.next() - 0.5) * brownian * 0.5; // less vertical brownian
      vz += (this.rng.next() - 0.5) * brownian;

      // --- Gentle wind drift ---
      vx += windX * deltaTime * 0.1;
      vy += windY * deltaTime * 0.05;
      vz += windZ * deltaTime * 0.1;

      // --- Subtle sinusoidal oscillation for organic feel ---
      vx += Math.sin(time * 0.3 + phase) * 0.005;
      vz += Math.cos(time * 0.25 + phase * 1.3) * 0.005;

      // --- Drag / damping ---
      vx *= drag;
      vy *= drag;
      vz *= drag;

      // --- Update position ---
      x += vx * deltaTime;
      y += vy * deltaTime;
      z += vz * deltaTime;

      // --- Volume wrapping (no terrain collision, just wrap around) ---
      if (x < -halfX) x += vol.x;
      else if (x > halfX) x -= vol.x;

      if (y < 0) y += vol.y;
      else if (y > halfY) y -= vol.y;

      if (z < -halfZ) z += vol.z;
      else if (z > halfZ) z -= vol.z;

      // --- Write back updated state ---
      this.particleData[offset] = x;
      this.particleData[offset + 1] = y;
      this.particleData[offset + 2] = z;
      this.particleData[offset + 3] = vx;
      this.particleData[offset + 4] = vy;
      this.particleData[offset + 5] = vz;

      // --- Sunbeam visibility ---
      // Particles "in a sunbeam" (between camera and sun direction) appear brighter
      let sunbeamAlpha = 0.0;
      if (cameraPos) {
        this._particleToCamera.set(
          x - cameraPos.x,
          y - cameraPos.y,
          z - cameraPos.z
        );
        const dist = this._particleToCamera.length();
        if (dist > 0.001) {
          this._particleToCamera.divideScalar(dist); // normalize
          // Dot product: high when particle is between camera and sun
          const dot = this._particleToCamera.dot(sunDir);
          // Only boost when the particle is roughly in the sun direction from camera
          sunbeamAlpha = Math.max(0, dot) * 0.6;
        }
      }

      // --- Distance-based alpha boost ---
      let distanceAlpha = 1.0;
      if (cameraPos) {
        const dx = x - cameraPos.x;
        const dy = y - cameraPos.y;
        const dz = z - cameraPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);
        distanceAlpha = 1.0 / (dist * 0.1 + 1.0);
      }

      // --- Compute final scale based on visibility ---
      // Size varies slightly per particle using phase as a size seed
      const sizeVariation = 0.7 + (Math.sin(phase * 3.7) * 0.5 + 0.5) * 0.6; // 0.7 – 1.3
      const particleScale = this.params.particleSize * sizeVariation;

      // Brightness scale: particles in sunbeams or near camera appear larger/brighter
      const visibilityBoost = 1.0 + sunbeamAlpha * 0.8 + distanceAlpha * 0.3;
      const finalScale = particleScale * Math.min(visibilityBoost, 2.5);

      // --- Update instance matrix ---
      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(finalScale, finalScale, finalScale);
      this.dummy.updateMatrix();
      this.dustMesh!.setMatrixAt(i, this.dummy.matrix);
    }

    // --- Hide inactive particles ---
    for (let i = activeCount; i < this.maxParticles; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.dustMesh!.setMatrixAt(i, this.dummy.matrix);
    }

    this.dustMesh.instanceMatrix.needsUpdate = true;

    // --- Update material opacity based on intensity and average sunbeam ---
    // Base opacity scales with intensity; add a subtle pulse
    const pulseFactor = 1.0 + Math.sin(time * 0.5) * 0.05;
    baseMaterial.opacity = Math.min(0.3 * this.params.intensity * pulseFactor + 0.05, 0.5);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Set dust particle intensity (0-1).
   * 0 = no particles visible, 1 = full 1500 particles.
   */
  setIntensity(intensity: number): void {
    this.params.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set wind speed and direction.
   * Dust typically responds to gentle winds.
   */
  setWind(speed: number, direction: THREE.Vector3): void {
    this.params.windSpeed = speed;
    this.params.windDirection = direction.clone().normalize();
  }

  /**
   * Set the sun direction for sunbeam visibility calculation.
   * Particles between the camera and the sun appear brighter.
   */
  setSunDirection(direction: THREE.Vector3): void {
    this.params.sunDirection = direction.clone().normalize();
  }

  /**
   * Set the camera reference for distance-based alpha and sunbeam calculations.
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Set the bounding volume for particle wrapping.
   * Particles that drift outside this volume wrap to the opposite side.
   */
  setVolumeSize(size: THREE.Vector3): void {
    this.params.volumeSize = size.clone();
  }

  /**
   * Set Brownian motion strength.
   * Higher values = more erratic drift. Default is 0.15.
   */
  setBrownianStrength(strength: number): void {
    this.params.brownianStrength = strength;
  }

  /**
   * Set lateral drift speed multiplier.
   * Controls how much wind affects dust movement. Default is 0.3.
   */
  setDriftSpeed(speed: number): void {
    this.params.driftSpeed = speed;
  }

  /**
   * Get current dust intensity.
   */
  getIntensity(): number {
    return this.params.intensity;
  }

  /**
   * Dispose of all resources and remove from scene.
   */
  dispose(): void {
    if (this.dustMesh) {
      this.dustMesh.geometry.dispose();
      const material = this.dustMesh.material as THREE.MeshBasicMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
      this.scene.remove(this.dustMesh);
      this.dustMesh = null;
    }

    this.camera = null;
  }
}

export default DustSystem;
