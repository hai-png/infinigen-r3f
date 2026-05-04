/**
 * Marine Snow Particle System
 *
 * Underwater organic particle simulation with slow sinking,
 * Brownian lateral drift, current effects, and subtle
 * bioluminescent glow. Uses InstancedMesh for performance.
 *
 * Marine snow is organic debris (detritus, dead plankton, fecal pellets,
 * etc.) that slowly sinks through ocean water. Unlike rain or snow which
 * fall from sky to ground, marine snow exists in a 3D volume and drifts
 * with water currents. Particles wrap around the volume boundaries to
 * maintain constant density.
 *
 * @module MarineSnowSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';
import { createCanvas } from '../utils/CanvasUtils';

export interface MarineSnowParams {
  intensity: number;              // 0-1, controls number of visible particles
  currentSpeed: number;           // water current speed, default 0.3
  currentDirection: THREE.Vector3;// default (1, 0, 0.3) normalized
  particleSize: number;           // default 0.04
  sinkSpeed: number;              // downward drift, default 0.2 m/s
  brownianStrength: number;       // lateral random walk, default 0.08
  volumeSize: THREE.Vector3;      // bounding volume, default (80, 40, 80)
  volumeCenter: THREE.Vector3;    // default (0, -20, 0) — underwater
  glowIntensity: number;          // 0-1 bioluminescence, default 0.15
  depthFadeStart: number;         // depth where size starts decreasing, default -30
  depthFadeEnd: number;           // depth where particles are smallest, default -50
}

/**
 * Marine Snow Particle System
 *
 * Simulates organic debris sinking slowly through ocean water with
 * Brownian lateral drift, gentle water currents, depth-based sizing,
 * and subtle bioluminescent glow. Particles exist in a 3D volume
 * and wrap around boundaries to maintain constant density.
 */
export class MarineSnowSystem {
  private scene: THREE.Scene;
  private params: MarineSnowParams;
  private rng: SeededRandom;
  private mesh: THREE.InstancedMesh | null = null;
  private dummy: THREE.Object3D;
  private particleData: Float32Array; // per particle: x, y, z, vx, vy, vz, size, phase (8 floats)
  private readonly maxParticles = 2000;

  constructor(
    scene: THREE.Scene,
    params: Partial<MarineSnowParams> = {},
    seed: number = 42
  ) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.params = {
      intensity: params.intensity ?? 0.6,
      currentSpeed: params.currentSpeed ?? 0.3,
      currentDirection: params.currentDirection
        ? params.currentDirection.clone().normalize()
        : new THREE.Vector3(1, 0, 0.3).normalize(),
      particleSize: params.particleSize ?? 0.04,
      sinkSpeed: params.sinkSpeed ?? 0.2,
      brownianStrength: params.brownianStrength ?? 0.08,
      volumeSize: params.volumeSize
        ? params.volumeSize.clone()
        : new THREE.Vector3(80, 40, 80),
      volumeCenter: params.volumeCenter
        ? params.volumeCenter.clone()
        : new THREE.Vector3(0, -20, 0),
      glowIntensity: params.glowIntensity ?? 0.15,
      depthFadeStart: params.depthFadeStart ?? -30,
      depthFadeEnd: params.depthFadeEnd ?? -50,
    };

    this.dummy = new THREE.Object3D();
    // 8 floats per particle: x, y, z, vx, vy, vz, size, phase
    this.particleData = new Float32Array(this.maxParticles * 8);

    this.initialize();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private initialize(): void {
    // Tiny irregular sphere geometry for organic debris
    const geometry = new THREE.SphereGeometry(0.04, 4, 3);

    // Create soft glow texture using CanvasUtils
    const canvas = createCanvas();
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(238, 238, 221, 1)');     // warm cream center
    gradient.addColorStop(0.3, 'rgba(238, 238, 221, 0.7)'); // warm cream falloff
    gradient.addColorStop(0.6, 'rgba(220, 215, 200, 0.3)'); // slightly dimmer
    gradient.addColorStop(1, 'rgba(200, 195, 180, 0)');     // fade to transparent
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.MeshBasicMaterial({
      color: 0xeeeedd,             // warm cream, organic
      map: texture,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // underwater bioluminescent glow
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    // Initialize particle data and instance matrices
    for (let i = 0; i < this.maxParticles; i++) {
      this.resetParticle(i);
    }

    // Set initial instance matrices
    for (let i = 0; i < this.maxParticles; i++) {
      const offset = i * 8;
      const x = this.particleData[offset];
      const y = this.particleData[offset + 1];
      const z = this.particleData[offset + 2];
      const size = this.particleData[offset + 6];

      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(size, size, size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Particle Reset / Spawn
  // -------------------------------------------------------------------------

  private resetParticle(index: number): void {
    const vol = this.params.volumeSize;
    const center = this.params.volumeCenter;

    // Position within volume (relative to center)
    const x = center.x + (this.rng.next() - 0.5) * vol.x;
    const y = center.y + (this.rng.next() - 0.5) * vol.y;
    const z = center.z + (this.rng.next() - 0.5) * vol.z;

    // Small initial velocities (mostly still)
    const vx = (this.rng.next() - 0.5) * 0.01;
    const vy = -this.params.sinkSpeed * (0.5 + this.rng.next() * 0.5); // slow sink, slight variation
    const vz = (this.rng.next() - 0.5) * 0.01;

    // Size with per-particle variation
    const size = this.params.particleSize * (0.5 + this.rng.next() * 0.5);

    // Phase for subtle oscillation / rotation variation
    const phase = this.rng.next() * Math.PI * 2;

    const offset = index * 8;
    this.particleData[offset] = x;
    this.particleData[offset + 1] = y;
    this.particleData[offset + 2] = z;
    this.particleData[offset + 3] = vx;
    this.particleData[offset + 4] = vy;
    this.particleData[offset + 5] = vz;
    this.particleData[offset + 6] = size;
    this.particleData[offset + 7] = phase;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(deltaTime: number): void {
    if (!this.mesh) return;

    const activeCount = Math.floor(this.maxParticles * this.params.intensity);

    // Current components (gentle drift)
    const currentX = this.params.currentDirection.x * this.params.currentSpeed;
    const currentY = this.params.currentDirection.y * this.params.currentSpeed;
    const currentZ = this.params.currentDirection.z * this.params.currentSpeed;

    const vol = this.params.volumeSize;
    const center = this.params.volumeCenter;

    // Volume bounds (centered on volumeCenter)
    const halfX = vol.x * 0.5;
    const halfY = vol.y * 0.5;
    const halfZ = vol.z * 0.5;

    const brownian = this.params.brownianStrength;
    const drag = 0.95; // water drag

    // Depth fade parameters
    const depthFadeStart = this.params.depthFadeStart;
    const depthFadeEnd = this.params.depthFadeEnd;
    const depthRange = depthFadeEnd - depthFadeStart;

    // Glow intensity for material modulation
    const glowIntensity = this.params.glowIntensity;

    // Time for subtle oscillation
    const time = typeof performance !== 'undefined'
      ? performance.now() * 0.001
      : Date.now() * 0.001;

    for (let i = 0; i < activeCount; i++) {
      const offset = i * 8;

      // Read current state
      let x = this.particleData[offset];
      let y = this.particleData[offset + 1];
      let z = this.particleData[offset + 2];
      let vx = this.particleData[offset + 3];
      let vy = this.particleData[offset + 4];
      let vz = this.particleData[offset + 5];
      const baseSize = this.particleData[offset + 6];
      const phase = this.particleData[offset + 7];

      // --- Brownian motion: random lateral perturbation ---
      vx += (this.rng.next() - 0.5) * brownian;
      vz += (this.rng.next() - 0.5) * brownian;

      // --- Water current drift (gentle, constant force) ---
      vx += currentX * deltaTime * 0.1;
      vy += currentY * deltaTime * 0.05;
      vz += currentZ * deltaTime * 0.1;

      // --- Sink speed: maintain slow downward drift ---
      // Gently steer vy toward -sinkSpeed
      const targetVy = -this.params.sinkSpeed * (0.8 + Math.sin(phase) * 0.2);
      vy += (targetVy - vy) * 0.05;

      // --- Subtle sinusoidal oscillation for organic feel ---
      vx += Math.sin(time * 0.2 + phase) * 0.003;
      vz += Math.cos(time * 0.15 + phase * 1.3) * 0.003;

      // --- Drag / damping ---
      vx *= drag;
      vy *= drag;
      vz *= drag;

      // --- Update position ---
      x += vx * deltaTime;
      y += vy * deltaTime;
      z += vz * deltaTime;

      // --- Volume wrapping ---
      // X axis: wrap around
      const minX = center.x - halfX;
      const maxX = center.x + halfX;
      if (x < minX) x += vol.x;
      else if (x > maxX) x -= vol.x;

      // Y axis: wrap bottom to top (sinks below → respawn at top)
      const minY = center.y - halfY;
      const maxY = center.y + halfY;
      if (y < minY) {
        y = maxY;
        // Randomize x/z slightly on wrap for natural appearance
        x = center.x + (this.rng.next() - 0.5) * vol.x;
        z = center.z + (this.rng.next() - 0.5) * vol.z;
        // Reset lateral velocity
        vx = (this.rng.next() - 0.5) * 0.01;
        vz = (this.rng.next() - 0.5) * 0.01;
      } else if (y > maxY) {
        y = minY;
      }

      // Z axis: wrap around
      const minZ = center.z - halfZ;
      const maxZ = center.z + halfZ;
      if (z < minZ) z += vol.z;
      else if (z > maxZ) z -= vol.z;

      // --- Depth-based size multiplier ---
      // Particles deeper than depthFadeStart get smaller, up to 50% reduction
      let depthSizeMultiplier = 1.0;
      if (y < depthFadeStart && depthRange !== 0) {
        const depthPastStart = depthFadeStart - y; // positive when below start
        const depthFraction = Math.min(depthPastStart / Math.abs(depthRange), 1.0);
        depthSizeMultiplier = 1.0 - depthFraction * 0.5; // shrink to 50% at most
      }

      // --- Very slow rotation (1/10th of snow rotation speed) ---
      const rotSpeed = 0.2; // much slower than snow
      const rotX = Math.sin(time * rotSpeed + phase) * 0.1;
      const rotY = time * rotSpeed * 0.1 + phase;
      const rotZ = Math.cos(time * rotSpeed * 0.7 + phase * 1.5) * 0.05;

      // --- Write back updated state ---
      this.particleData[offset] = x;
      this.particleData[offset + 1] = y;
      this.particleData[offset + 2] = z;
      this.particleData[offset + 3] = vx;
      this.particleData[offset + 4] = vy;
      this.particleData[offset + 5] = vz;

      // --- Compute final scale ---
      const finalSize = baseSize * depthSizeMultiplier;

      // --- Update instance matrix ---
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(rotX, rotY, rotZ);
      this.dummy.scale.set(finalSize, finalSize, finalSize);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    // --- Hide inactive particles ---
    for (let i = activeCount; i < this.maxParticles; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;

    // --- Update material opacity with glow pulse ---
    const baseMaterial = this.mesh.material as THREE.MeshBasicMaterial;
    const pulseFactor = 1.0 + Math.sin(time * 0.3) * 0.08;
    baseMaterial.opacity = Math.min(
      (0.4 + glowIntensity * 0.3) * this.params.intensity * pulseFactor,
      0.7
    );
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Set marine snow intensity (0-1).
   * 0 = no particles visible, 1 = full 2000 particles.
   */
  setIntensity(intensity: number): void {
    this.params.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set water current speed and direction.
   * Marine snow drifts gently with underwater currents.
   */
  setCurrent(speed: number, direction: THREE.Vector3): void {
    this.params.currentSpeed = speed;
    this.params.currentDirection = direction.clone().normalize();
  }

  /**
   * Set the downward sink speed (m/s).
   * Marine snow sinks very slowly, default 0.2 m/s.
   */
  setSinkSpeed(speed: number): void {
    this.params.sinkSpeed = Math.max(0, speed);
  }

  /**
   * Set bioluminescent glow intensity (0-1).
   * Higher values make particles glow more brightly.
   */
  setGlowIntensity(intensity: number): void {
    this.params.glowIntensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set the center of the bounding volume.
   * Particles wrap around this volume. Default is (0, -20, 0).
   */
  setVolumeCenter(center: THREE.Vector3): void {
    this.params.volumeCenter = center.clone();
  }

  /**
   * Get current marine snow intensity.
   */
  getIntensity(): number {
    return this.params.intensity;
  }

  /**
   * Dispose of all resources and remove from scene.
   */
  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      const material = this.mesh.material as THREE.MeshBasicMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
      this.scene.remove(this.mesh);
      this.mesh = null;
    }
  }
}

export default MarineSnowSystem;
