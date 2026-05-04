/**
 * Falling Leaves Particle System
 *
 * Autumn leaf simulation with 3D tumbling rotation, wind carry,
 * gravity, and ground settling with fade-out. Uses InstancedMesh
 * for high-performance rendering of up to 3000 leaves.
 *
 * Key physics differences from rain/snow:
 * - Slow fall speed (1.5 m/s vs 15 for rain, 3 for snow)
 * - 3D tumbling rotation on all three axes
 * - Heavy wind influence with sinusoidal lateral drift
 * - Ground settling: leaves rest on terrain before fading out
 *
 * @module LeavesSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';
import { createCanvas } from '../utils/CanvasUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeavesParams {
  intensity: number;           // 0-1, controls active leaf count
  windSpeed: number;           // m/s
  windDirection: THREE.Vector3; // normalized direction
  leafSize: number;            // default 0.12
  fallSpeed: number;           // default 1.5 (much slower than rain/snow)
  turbulence: number;          // default 0.8
  tumbling: number;            // 3D rotation speed, default 2.0
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  groundSettleTime: number;    // seconds on ground before fade, default 8.0
}

interface LeafParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rotationX: number; rotationY: number; rotationZ: number;
  angVelX: number; angVelY: number; angVelZ: number;
  size: number;
  phase: number;        // for sinusoidal drift
  settled: boolean;     // on ground?
  settleTime: number;   // time since settling
  alpha: number;        // fade-out alpha
}

// ---------------------------------------------------------------------------
// Season color palettes (hex strings)
// ---------------------------------------------------------------------------

const SEASON_COLORS: Record<string, string[]> = {
  autumn: ['#D2691E', '#CC3333', '#DAA520', '#8B4513', '#8B0000'],
  spring: ['#7CFC00', '#90EE90', '#98FB98'],
  summer: ['#228B22', '#006400', '#2E8B57'],
  winter: ['#8B7355', '#6B4226', '#A0522D'],
};

// ---------------------------------------------------------------------------
// FallingLeavesSystem
// ---------------------------------------------------------------------------

export class FallingLeavesSystem {
  private scene: THREE.Scene;
  private params: LeavesParams;
  private rng: SeededRandom;

  private leavesMesh: THREE.InstancedMesh | null = null;
  private dummy: THREE.Object3D;
  private leaves: LeafParticle[] = [];
  private readonly maxLeaves = 3000;

  // Per-leaf colors cached at init so we don't recompute every frame
  private leafColors: THREE.Color[] = [];

  // Reusable color object to avoid GC pressure in update loop
  private tmpColor: THREE.Color;

  // Terrain height callback (returns terrain height at world x,z)
  private terrainHeightFn: ((x: number, z: number) => number) | null;

  constructor(
    scene: THREE.Scene,
    params: Partial<LeavesParams> = {},
    seed: number = 42,
    terrainHeightFn: ((x: number, z: number) => number) | null = null
  ) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.terrainHeightFn = terrainHeightFn;

    this.params = {
      intensity: params.intensity ?? 0.7,
      windSpeed: params.windSpeed ?? 5,
      windDirection: params.windDirection || new THREE.Vector3(1, 0, 0.3),
      leafSize: params.leafSize ?? 0.12,
      fallSpeed: params.fallSpeed ?? 1.5,
      turbulence: params.turbulence ?? 0.8,
      tumbling: params.tumbling ?? 2.0,
      season: params.season ?? 'autumn',
      groundSettleTime: params.groundSettleTime ?? 8.0,
    };

    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();

    this.initializeLeaves();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Create the leaf texture on a 64x64 canvas.
   * Draws a simple pointed-oval leaf silhouette with a center vein line,
   * colored according to the current season with per-leaf variation.
   */
  private createLeafTexture(season: string): THREE.CanvasTexture {
    const canvas = createCanvas();
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Pick a base color for the texture from the season palette
    const palette = SEASON_COLORS[season] || SEASON_COLORS.autumn;
    const baseHex = palette[Math.floor(this.rng.next() * palette.length)];

    // Background – fully transparent
    ctx.clearRect(0, 0, 64, 64);

    // Leaf silhouette – pointed oval (bezier curves)
    ctx.beginPath();
    ctx.moveTo(32, 2);          // tip
    ctx.bezierCurveTo(50, 18, 54, 40, 32, 62);  // right side
    ctx.bezierCurveTo(10, 40, 14, 18, 32, 2);    // left side
    ctx.closePath();

    // Fill with season color
    ctx.fillStyle = baseHex;
    ctx.fill();

    // Subtle center vein
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(32, 58);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // A couple of side veins for realism
    ctx.beginPath();
    ctx.moveTo(32, 20);
    ctx.lineTo(46, 14);
    ctx.moveTo(32, 20);
    ctx.lineTo(18, 14);
    ctx.moveTo(32, 34);
    ctx.lineTo(48, 28);
    ctx.moveTo(32, 34);
    ctx.lineTo(16, 28);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private initializeLeaves(): void {
    // Leaf geometry – slightly taller than wide, like a real leaf
    const geometry = new THREE.PlaneGeometry(0.15, 0.2);

    // Create texture
    const texture = this.createLeafTexture(this.params.season);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.leavesMesh = new THREE.InstancedMesh(geometry, material, this.maxLeaves);
    this.leavesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leavesMesh.frustumCulled = false;
    this.scene.add(this.leavesMesh);

    // Build palette for per-leaf color variation
    const palette = SEASON_COLORS[this.params.season] || SEASON_COLORS.autumn;

    // Initialize leaf particles & instance colors
    for (let i = 0; i < this.maxLeaves; i++) {
      const size = this.params.leafSize * (0.6 + this.rng.next() * 0.8);
      const phase = this.rng.next() * Math.PI * 2;

      // Per-leaf color from season palette
      const colorHex = palette[Math.floor(this.rng.next() * palette.length)];
      const color = new THREE.Color(colorHex);
      // Slight per-leaf hue variation
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.h += (this.rng.next() - 0.5) * 0.05;
      hsl.l += (this.rng.next() - 0.5) * 0.1;
      hsl.l = Math.max(0.1, Math.min(0.9, hsl.l));
      color.setHSL(hsl.h, hsl.s, hsl.l);
      this.leafColors.push(color);

      const x = (this.rng.next() - 0.5) * 100;
      const y = this.rng.next() * 50 + 20;
      const z = (this.rng.next() - 0.5) * 100;

      const leaf: LeafParticle = {
        x, y, z,
        vx: (this.rng.next() - 0.5) * 0.5,
        vy: -this.params.fallSpeed * (0.7 + this.rng.next() * 0.6),
        vz: (this.rng.next() - 0.5) * 0.5,
        rotationX: this.rng.next() * Math.PI * 2,
        rotationY: this.rng.next() * Math.PI * 2,
        rotationZ: this.rng.next() * Math.PI * 2,
        angVelX: (this.rng.next() - 0.5) * this.params.tumbling * 2,
        angVelY: (this.rng.next() - 0.5) * this.params.tumbling * 2,
        angVelZ: (this.rng.next() - 0.5) * this.params.tumbling * 2,
        size,
        phase,
        settled: false,
        settleTime: 0,
        alpha: 1,
      };

      this.leaves.push(leaf);

      // Set initial instance matrix
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(leaf.rotationX, leaf.rotationY, leaf.rotationZ);
      this.dummy.scale.set(size, size, size);
      this.dummy.updateMatrix();
      this.leavesMesh.setMatrixAt(i, this.dummy.matrix);

      // Set per-instance color (includes alpha encoded in RGB for now)
      this.leavesMesh.setColorAt(i, color);
    }

    this.leavesMesh.instanceMatrix.needsUpdate = true;
    if (this.leavesMesh.instanceColor) {
      this.leavesMesh.instanceColor.needsUpdate = true;
    }
  }

  // -------------------------------------------------------------------------
  // Leaf Reset
  // -------------------------------------------------------------------------

  private resetLeaf(index: number): void {
    const leaf = this.leaves[index];

    leaf.x = (this.rng.next() - 0.5) * 100;
    leaf.y = 50 + this.rng.next() * 20;
    leaf.z = (this.rng.next() - 0.5) * 100;
    leaf.vx = (this.rng.next() - 0.5) * 0.5;
    leaf.vy = -this.params.fallSpeed * (0.7 + this.rng.next() * 0.6);
    leaf.vz = (this.rng.next() - 0.5) * 0.5;
    leaf.rotationX = this.rng.next() * Math.PI * 2;
    leaf.rotationY = this.rng.next() * Math.PI * 2;
    leaf.rotationZ = this.rng.next() * Math.PI * 2;
    leaf.angVelX = (this.rng.next() - 0.5) * this.params.tumbling * 2;
    leaf.angVelY = (this.rng.next() - 0.5) * this.params.tumbling * 2;
    leaf.angVelZ = (this.rng.next() - 0.5) * this.params.tumbling * 2;
    leaf.settled = false;
    leaf.settleTime = 0;
    leaf.alpha = 1;
  }

  // -------------------------------------------------------------------------
  // Terrain Helpers
  // -------------------------------------------------------------------------

  private getTerrainHeight(x: number, z: number): number {
    if (this.terrainHeightFn) {
      return this.terrainHeightFn(x, z);
    }
    return 0;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(deltaTime: number): void {
    if (!this.leavesMesh) return;

    const activeLeaves = Math.floor(this.maxLeaves * this.params.intensity);

    // Wind components
    const windX = this.params.windDirection.x * this.params.windSpeed;
    const windZ = this.params.windDirection.z * this.params.windSpeed;

    const time = typeof performance !== 'undefined'
      ? performance.now() * 0.001
      : Date.now() * 0.001;

    const gravity = -9.8 * 0.1; // very low – leaves float

    for (let i = 0; i < activeLeaves; i++) {
      const leaf = this.leaves[i];

      if (leaf.settled) {
        // ----- Settled on ground: wait, then fade out -----
        leaf.settleTime += deltaTime;

        if (leaf.settleTime > this.params.groundSettleTime) {
          // Fade out over 2 seconds
          const fadeElapsed = leaf.settleTime - this.params.groundSettleTime;
          leaf.alpha = Math.max(0, 1.0 - fadeElapsed / 2.0);

          if (leaf.alpha <= 0) {
            this.resetLeaf(i);
          }
        }

        // Update instance matrix (position unchanged, rotation frozen on ground)
        this.dummy.position.set(leaf.x, leaf.y, leaf.z);
        this.dummy.rotation.set(leaf.rotationX, leaf.rotationY, leaf.rotationZ);
        this.dummy.scale.set(leaf.size, leaf.size, leaf.size);
        this.dummy.updateMatrix();
        this.leavesMesh.setMatrixAt(i, this.dummy.matrix);

        // Update instance color with alpha
        const baseColor = this.leafColors[i];
        this.tmpColor.copy(baseColor);
        this.tmpColor.multiplyScalar(leaf.alpha);
        this.leavesMesh.setColorAt(i, this.tmpColor);
      } else {
        // ----- Airborne leaf physics -----

        // Gravity (very low – leaves float)
        leaf.vy += gravity * deltaTime;

        // Wind carry – leaves are heavily affected by wind
        leaf.vx += (windX - leaf.vx) * 0.3 * deltaTime;
        leaf.vz += (windZ - leaf.vz) * 0.3 * deltaTime;

        // Sinusoidal lateral drift – characteristic floating/swaying
        leaf.vx += Math.sin(time * 1.5 + leaf.phase) * this.params.turbulence * deltaTime;
        leaf.vz += Math.cos(time * 1.2 + leaf.phase * 1.3) * this.params.turbulence * deltaTime;

        // Clamp horizontal velocity to prevent runaway
        const maxHSpeed = this.params.windSpeed * 2.0;
        leaf.vx = Math.max(-maxHSpeed, Math.min(maxHSpeed, leaf.vx));
        leaf.vz = Math.max(-maxHSpeed, Math.min(maxHSpeed, leaf.vz));

        // Clamp vertical velocity (leaves float, they don't plummet)
        const maxVSpeed = this.params.fallSpeed * 2.0;
        leaf.vy = Math.max(-maxVSpeed, Math.min(maxVSpeed * 0.3, leaf.vy));

        // Update position
        leaf.x += leaf.vx * deltaTime;
        leaf.y += leaf.vy * deltaTime;
        leaf.z += leaf.vz * deltaTime;

        // Boundary wrapping
        if (leaf.x < -50) leaf.x = 50;
        if (leaf.x > 50) leaf.x = -50;
        if (leaf.z < -50) leaf.z = 50;
        if (leaf.z > 50) leaf.z = -50;

        // 3D tumbling rotation
        leaf.rotationX += leaf.angVelX * deltaTime;
        leaf.rotationY += leaf.angVelY * deltaTime;
        leaf.rotationZ += leaf.angVelZ * deltaTime;

        // Terrain collision – settle on ground
        const groundY = this.getTerrainHeight(leaf.x, leaf.z);

        if (leaf.y < groundY) {
          leaf.y = groundY + 0.01; // sit just above terrain
          leaf.settled = true;
          leaf.settleTime = 0;
          leaf.vx = 0;
          leaf.vy = 0;
          leaf.vz = 0;
          // Slow angular velocity to stop (leaf lays flat-ish on ground)
          leaf.angVelX *= 0.1;
          leaf.angVelY *= 0.1;
          leaf.angVelZ *= 0.1;
          // Lay leaf somewhat flat on ground
          leaf.rotationX = leaf.rotationX * 0.1;
          leaf.rotationZ = leaf.rotationZ * 0.1;
        }

        // Update instance matrix
        this.dummy.position.set(leaf.x, leaf.y, leaf.z);
        this.dummy.rotation.set(leaf.rotationX, leaf.rotationY, leaf.rotationZ);
        this.dummy.scale.set(leaf.size, leaf.size, leaf.size);
        this.dummy.updateMatrix();
        this.leavesMesh.setMatrixAt(i, this.dummy.matrix);

        // Full opacity for airborne leaves
        this.tmpColor.copy(this.leafColors[i]);
        this.leavesMesh.setColorAt(i, this.tmpColor);
      }
    }

    // Hide inactive leaves (y=-1000, scale 0)
    for (let i = activeLeaves; i < this.maxLeaves; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.leavesMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.leavesMesh.instanceMatrix.needsUpdate = true;

    if (this.leavesMesh.instanceColor) {
      this.leavesMesh.instanceColor.needsUpdate = true;
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Set the intensity of the falling leaves effect.
   * @param intensity Value between 0 and 1 controlling active leaf count.
   */
  setIntensity(intensity: number): void {
    this.params.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Set wind parameters.
   * @param speed Wind speed in m/s.
   * @param direction Normalized wind direction vector.
   */
  setWind(speed: number, direction: THREE.Vector3): void {
    this.params.windSpeed = speed;
    this.params.windDirection = direction.clone().normalize();
  }

  /**
   * Set the season, which controls leaf color palette.
   * Rebuilds per-leaf colors when the season changes.
   */
  setSeason(season: 'spring' | 'summer' | 'autumn' | 'winter'): void {
    if (this.params.season === season) return;
    this.params.season = season;

    // Rebuild colors for new season
    const palette = SEASON_COLORS[season] || SEASON_COLORS.autumn;
    for (let i = 0; i < this.maxLeaves; i++) {
      const colorHex = palette[Math.floor(this.rng.next() * palette.length)];
      const color = new THREE.Color(colorHex);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.h += (this.rng.next() - 0.5) * 0.05;
      hsl.l += (this.rng.next() - 0.5) * 0.1;
      hsl.l = Math.max(0.1, Math.min(0.9, hsl.l));
      color.setHSL(hsl.h, hsl.s, hsl.l);
      this.leafColors[i] = color;
    }

    // Recreate texture with new season color
    if (this.leavesMesh) {
      const material = this.leavesMesh.material as THREE.MeshBasicMaterial;
      const oldTexture = material.map;
      const newTexture = this.createLeafTexture(season);
      material.map = newTexture;
      material.needsUpdate = true;
      if (oldTexture) {
        oldTexture.dispose();
      }
    }
  }

  /**
   * Get the current intensity value.
   */
  getIntensity(): number {
    return this.params.intensity;
  }

  /**
   * Get the current season.
   */
  getSeason(): string {
    return this.params.season;
  }

  /**
   * Set or update the terrain height callback.
   */
  setTerrainHeightFn(fn: (x: number, z: number) => number): void {
    this.terrainHeightFn = fn;
  }

  /**
   * Set the ground settle time (seconds a leaf rests before fading).
   */
  setGroundSettleTime(time: number): void {
    this.params.groundSettleTime = Math.max(0, time);
  }

  /**
   * Set turbulence strength affecting lateral drift amplitude.
   */
  setTurbulence(turbulence: number): void {
    this.params.turbulence = Math.max(0, turbulence);
  }

  /**
   * Set tumbling rotation speed.
   */
  setTumbling(tumbling: number): void {
    this.params.tumbling = Math.max(0, tumbling);
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  /**
   * Clean up all GPU resources and remove the mesh from the scene.
   */
  dispose(): void {
    if (this.leavesMesh) {
      this.leavesMesh.geometry.dispose();
      const material = this.leavesMesh.material as THREE.MeshBasicMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
      this.scene.remove(this.leavesMesh);
      this.leavesMesh = null;
    }

    this.leaves.length = 0;
    this.leafColors.length = 0;
  }
}

/**
 * Filename-matching alias for backward compat.
 * `import LeavesSystem from './LeavesSystem'` and
 * `import { LeavesSystem } from './LeavesSystem'` both work.
 */
export { FallingLeavesSystem as LeavesSystem };
export default LeavesSystem;
