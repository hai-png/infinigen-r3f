/**
 * GPUScatterSystem.ts
 *
 * GPU-accelerated scatter system for instanced object placement with
 * camera frustum culling, distance-based LOD selection, and density
 * mask support.
 *
 * Provides four major components:
 *
 * 1. GPUScatterShader — GLSL compute-like vertex shader that reads
 *    instance transforms from DataTextures and performs per-instance
 *    frustum culling + LOD selection entirely on the GPU.
 *
 * 2. GPUScatterAccelerator — Generates Poisson-disk sample points on
 *    mesh surfaces, stores positions/rotations/scales in DataTextures,
 *    and returns a GPU-driven THREE.InstancedMesh.
 *
 * 3. ScatterCameraCuller — CPU-side frustum culling that sets
 *    scale=0 for off-screen instances (GPU-friendly culling).
 *
 * 4. ScatterDensityField — Evaluates PlacementFilters on a grid and
 *    stores the resulting density field as a DataTexture for GPU
 *    consumption.
 *
 * Public API:
 *   GPUScatterShader           GLSL vertex shader strings + uniform setup
 *   GPUScatterAccelerator      scatterOnSurface(), GPU-driven InstancedMesh
 *   ScatterCameraCuller        cullInstances(), createCulledInstanceMesh()
 *   ScatterDensityField        computeDensityField(), toDataTexture()
 *   ScatterResult              result type from scatterOnSurface()
 */

import * as THREE from 'three';
import { SeededRandom, seededNoise2D } from '@/core/util/MathUtils';
import type {
  TerrainData,
  PlacementFilter,
  PlacementMask,
} from '@/core/placement/DensityPlacementSystem';

// ============================================================================
// GLSL Shader Strings
// ============================================================================

/**
 * GLSL vertex shader for GPU-driven instanced scatter.
 *
 * Each instance reads its transform (position, rotation, scale) from
 * DataTextures.  Camera frustum culling is performed in the vertex
 * shader by testing the instance position against six frustum planes
 * passed as uniforms.  Culled instances are moved off-screen via
 * gl_Position = vec4(2.0, 2.0, 2.0, 1.0).
 *
 * Distance-based LOD selection writes the chosen LOD level to a
 * varying so that the fragment shader (or geometry shader) can adapt
 * detail accordingly.
 */
export const GPUScatterVertexShader = /* glsl */ `
  // ---------------------------------------------------------------------------
  // Attributes (per-instance)
  // ---------------------------------------------------------------------------
  // NOTE: Three.js InstancedBufferGeometry provides built-in instanceMatrix,
  // but we read from custom data-textures instead for maximum flexibility.

  // ---------------------------------------------------------------------------
  // Uniforms
  // ---------------------------------------------------------------------------
  uniform sampler2D uPositionTexture;   // RGB = world position
  uniform sampler2D uRotationTexture;   // RGB = Euler rotation (radians)
  uniform sampler2D uScaleTexture;      // RGB = scale (usually uniform)
  uniform float     uInstanceCount;     // total instance count
  uniform float     uTextureSize;       // width/height of data textures

  // Frustum planes (6 planes, each vec4: normal.xyz + distance.w)
  uniform vec4 uFrustumPlanes[6];

  // LOD distances
  uniform float uLODDistance0;  // near  (LOD 0)
  uniform float uLODDistance1;  // mid   (LOD 1)
  uniform float uLODDistance2;  // far   (LOD 2)

  // Camera position for distance calculation
  uniform vec3 uCameraPosition;

  // ---------------------------------------------------------------------------
  // Varyings
  // ---------------------------------------------------------------------------
  varying float vLODLevel;      // computed LOD level (0, 1, 2, or 3 = culled)
  varying float vInstanceIndex; // passed through for debug / custom shading

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Sample a DataTexture at a given instance index.
   * The texture is laid out as a uTextureSize x uTextureSize grid;
   * each pixel stores data for one instance.
   */
  vec4 sampleInstanceData(sampler2D tex, float instanceIdx) {
    float col = mod(instanceIdx, uTextureSize);
    float row = floor(instanceIdx / uTextureSize);
    vec2 uv = (vec2(col, row) + 0.5) / uTextureSize;
    return texture2D(tex, uv);
  }

  /**
   * Test a world-space point against the six frustum planes.
   * Returns true if the point is inside all planes.
   */
  bool isInFrustum(vec3 point) {
    for (int i = 0; i < 6; i++) {
      float dist = dot(uFrustumPlanes[i].xyz, point) + uFrustumPlanes[i].w;
      if (dist < 0.0) return false;
    }
    return true;
  }

  /**
   * Build a rotation matrix from Euler angles (YXZ order).
   */
  mat3 eulerToMat3(vec3 euler) {
    float cx = cos(euler.x); float sx = sin(euler.x);
    float cy = cos(euler.y); float sy = sin(euler.y);
    float cz = cos(euler.z); float sz = sin(euler.z);

    // YXZ rotation order
    mat3 Ry = mat3(
       cy, 0.0,  sy,
      0.0, 1.0, 0.0,
      -sy, 0.0,  cy
    );
    mat3 Rx = mat3(
      1.0, 0.0, 0.0,
      0.0,  cx, -sx,
      0.0,  sx,  cx
    );
    mat3 Rz = mat3(
       cz, -sz, 0.0,
       sz,  cz, 0.0,
      0.0, 0.0, 1.0
    );
    return Rz * Rx * Ry;
  }

  // ---------------------------------------------------------------------------
  // Main
  // ---------------------------------------------------------------------------
  void main() {
    float instanceIdx = float(gl_InstanceID);

    // --- Read per-instance data from textures ---
    vec3 instancePos = sampleInstanceData(uPositionTexture, instanceIdx).rgb;
    vec3 instanceRot = sampleInstanceData(uRotationTexture, instanceIdx).rgb;
    vec3 instanceScl = sampleInstanceData(uScaleTexture, instanceIdx).rgb;

    // --- Frustum culling in vertex shader ---
    if (!isInFrustum(instancePos)) {
      // Move off-screen — rasteriser will discard
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vLODLevel = 3.0;
      vInstanceIndex = instanceIdx;
      return;
    }

    // --- Distance-based LOD selection ---
    float distToCamera = distance(instancePos, uCameraPosition);
    float lodLevel = 0.0;
    if (distToCamera > uLODDistance2) {
      lodLevel = 3.0; // culled
    } else if (distToCamera > uLODDistance1) {
      lodLevel = 2.0;
    } else if (distToCamera > uLODDistance0) {
      lodLevel = 1.0;
    }

    // If LOD culled, also move off-screen
    if (lodLevel > 2.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vLODLevel = lodLevel;
      vInstanceIndex = instanceIdx;
      return;
    }

    vLODLevel = lodLevel;
    vInstanceIndex = instanceIdx;

    // --- Build instance transform ---
    mat3 rotMat = eulerToMat3(instanceRot);
    vec3 worldPos = rotMat * (position * instanceScl) + instancePos;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`;

/**
 * Fragment shader for GPU scatter — passes through a simple colour
 * modulated by LOD level for visualisation; users should replace
 * with their own material.
 */
export const GPUScatterFragmentShader = /* glsl */ `
  varying float vLODLevel;
  varying float vInstanceIndex;

  void main() {
    // LOD-based tint for debug visualisation
    vec3 color = vec3(1.0);
    if (vLODLevel < 0.5) {
      color = vec3(0.2, 0.8, 0.2);  // LOD 0 — green
    } else if (vLODLevel < 1.5) {
      color = vec3(0.8, 0.8, 0.2);  // LOD 1 — yellow
    } else {
      color = vec3(0.8, 0.2, 0.2);  // LOD 2 — red
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// ScatterResult
// ============================================================================

/**
 * Result returned by GPUScatterAccelerator.scatterOnSurface().
 */
export interface ScatterResult {
  /** The GPU-driven InstancedMesh */
  instanceMesh: THREE.InstancedMesh;
  /** DataTexture containing per-instance world positions (RGB float) */
  positionTexture: THREE.DataTexture;
  /** DataTexture containing per-instance Euler rotations (RGB float) */
  rotationTexture: THREE.DataTexture;
  /** DataTexture containing per-instance scales (RGB float) */
  scaleTexture: THREE.DataTexture;
  /** Number of instances actually placed */
  instanceCount: number;
  /** The custom ShaderMaterial used (for uniform updates) */
  material: THREE.ShaderMaterial;
}

// ============================================================================
// GPUScatterAccelerator
// ============================================================================

/**
 * GPU-driven scatter accelerator.
 *
 * Generates Poisson-disk sample points on the surface of a target mesh,
 * optionally filtered by a density mask texture and material tags.
 * Stores per-instance positions, rotations, and scales in Float32Array
 * DataTextures and returns an InstancedMesh rendered with a custom
 * vertex shader that performs frustum culling and LOD selection.
 */
export class GPUScatterAccelerator {
  /** Minimum Poisson-disk radius (world units) */
  private minRadius: number;
  /** Maximum Poisson-disk iterations before giving up */
  private maxPoissonIterations: number;

  /**
   * @param minRadius  Minimum distance between scattered instances (default 1.0)
   * @param maxPoissonIterations  Cap for Poisson-disk generation (default 30)
   */
  constructor(minRadius: number = 1.0, maxPoissonIterations: number = 30) {
    this.minRadius = minRadius;
    this.maxPoissonIterations = maxPoissonIterations;
  }

  /**
   * Scatter instances on the surface of a target mesh.
   *
   * @param targetMesh    Mesh whose surface is sampled for placement
   * @param count         Target number of instances
   * @param seed          Random seed for reproducibility
   * @param densityMask   Optional DataTexture (R channel) controlling density 0-1
   * @param camera        Optional camera — used to set initial LOD distances
   * @returns ScatterResult with InstancedMesh and DataTextures
   */
  scatterOnSurface(
    targetMesh: THREE.Mesh,
    count: number,
    seed: number,
    densityMask?: THREE.DataTexture,
    camera?: THREE.Camera,
  ): ScatterResult {
    const rng = new SeededRandom(seed);

    // --- 1. Generate Poisson-disk sample points on the mesh surface ---
    const samples = this.poissonDiskOnSurface(targetMesh, count, rng, densityMask);

    // --- 2. Pack per-instance data into Float32Arrays ---
    const texSize = this.computeTextureSize(samples.length);
    const positions = new Float32Array(texSize * texSize * 4);
    const rotations = new Float32Array(texSize * texSize * 4);
    const scales = new Float32Array(texSize * texSize * 4);

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];

      // Position
      positions[i * 4 + 0] = s.position.x;
      positions[i * 4 + 1] = s.position.y;
      positions[i * 4 + 2] = s.position.z;
      positions[i * 4 + 3] = 1.0;

      // Rotation (Euler YXZ)
      rotations[i * 4 + 0] = s.rotation.x;
      rotations[i * 4 + 1] = s.rotation.y;
      rotations[i * 4 + 2] = s.rotation.z;
      rotations[i * 4 + 3] = 0.0;

      // Scale
      scales[i * 4 + 0] = s.scale.x;
      scales[i * 4 + 1] = s.scale.y;
      scales[i * 4 + 2] = s.scale.z;
      scales[i * 4 + 3] = 0.0;
    }

    // --- 3. Create DataTextures ---
    const positionTexture = new THREE.DataTexture(
      positions, texSize, texSize, THREE.RGBAFormat, THREE.FloatType,
    );
    positionTexture.needsUpdate = true;

    const rotationTexture = new THREE.DataTexture(
      rotations, texSize, texSize, THREE.RGBAFormat, THREE.FloatType,
    );
    rotationTexture.needsUpdate = true;

    const scaleTexture = new THREE.DataTexture(
      scales, texSize, texSize, THREE.RGBAFormat, THREE.FloatType,
    );
    scaleTexture.needsUpdate = true;

    // --- 4. Build the InstancedMesh ---
    const geometry = new THREE.BoxGeometry(0.5, 1.0, 0.5);
    const material = new THREE.ShaderMaterial({
      vertexShader: GPUScatterVertexShader,
      fragmentShader: GPUScatterFragmentShader,
      uniforms: {
        uPositionTexture: { value: positionTexture },
        uRotationTexture: { value: rotationTexture },
        uScaleTexture: { value: scaleTexture },
        uInstanceCount: { value: samples.length },
        uTextureSize: { value: texSize },
        uFrustumPlanes: { value: this.createDefaultFrustumPlanes() },
        uLODDistance0: { value: 50.0 },
        uLODDistance1: { value: 150.0 },
        uLODDistance2: { value: 400.0 },
        uCameraPosition: { value: camera
          ? camera.position.clone()
          : new THREE.Vector3(0, 10, 0) },
      },
      side: THREE.DoubleSide,
    });

    const instanceMesh = new THREE.InstancedMesh(
      geometry, material, samples.length,
    );
    instanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Tag the mesh for easy identification
    instanceMesh.userData.isGPUScatter = true;
    instanceMesh.userData.scatterSeed = seed;

    return {
      instanceMesh,
      positionTexture,
      rotationTexture,
      scaleTexture,
      instanceCount: samples.length,
      material,
    };
  }

  /**
   * Update the frustum planes and camera position uniforms.
   * Call this every frame for correct GPU-side frustum culling.
   *
   * @param result   The ScatterResult returned by scatterOnSurface()
   * @param camera   The current camera
   */
  updateFrustumUniforms(result: ScatterResult, camera: THREE.PerspectiveCamera): void {
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const planes: THREE.Vector4[] = [];
    for (let i = 0; i < 6; i++) {
      const p = frustum.planes[i];
      planes.push(new THREE.Vector4(p.normal.x, p.normal.y, p.normal.z, p.constant));
    }

    result.material.uniforms.uFrustumPlanes.value = planes;
    result.material.uniforms.uCameraPosition.value.copy(camera.position);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Generate Poisson-disk sample points on the surface of a mesh.
   *
   * Uses a rejection-based approach:
   * 1. Compute cumulative triangle area weights.
   * 2. Randomly select triangles proportional to area.
   * 3. Sample a random point on the selected triangle.
   * 4. Accept the point only if it is at least minRadius from all
   *    previously accepted points, and (optionally) the density mask
   *    value at that location exceeds a random threshold.
   */
  private poissonDiskOnSurface(
    targetMesh: THREE.Mesh,
    count: number,
    rng: SeededRandom,
    densityMask?: THREE.DataTexture,
  ): Array<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> {
    const result: Array<{
      position: THREE.Vector3;
      rotation: THREE.Euler;
      scale: THREE.Vector3;
    }> = [];

    const geometry = targetMesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const indexAttr = geometry.getIndex();

    if (!posAttr) return result;

    // --- Build triangle list with area weights ---
    const triangles: Array<{
      a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3;
      normal: THREE.Vector3; area: number;
    }> = [];

    const totalTriangles = indexAttr
      ? indexAttr.count / 3
      : posAttr.count / 3;

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();

    for (let t = 0; t < totalTriangles; t++) {
      let ia: number, ib: number, ic: number;
      if (indexAttr) {
        ia = indexAttr.getX(t * 3);
        ib = indexAttr.getX(t * 3 + 1);
        ic = indexAttr.getX(t * 3 + 2);
      } else {
        ia = t * 3;
        ib = t * 3 + 1;
        ic = t * 3 + 2;
      }

      vA.fromBufferAttribute(posAttr as THREE.BufferAttribute, ia);
      vB.fromBufferAttribute(posAttr as THREE.BufferAttribute, ib);
      vC.fromBufferAttribute(posAttr as THREE.BufferAttribute, ic);

      // Apply mesh world transform
      vA.applyMatrix4(targetMesh.matrixWorld);
      vB.applyMatrix4(targetMesh.matrixWorld);
      vC.applyMatrix4(targetMesh.matrixWorld);

      const edge1 = new THREE.Vector3().subVectors(vB, vA);
      const edge2 = new THREE.Vector3().subVectors(vC, vA);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2);
      const area = normal.length() * 0.5;
      normal.normalize();

      triangles.push({ a: vA.clone(), b: vB.clone(), c: vC.clone(), normal, area });
    }

    if (triangles.length === 0) return result;

    // --- Cumulative area distribution ---
    const cumulativeArea: number[] = [];
    let totalArea = 0;
    for (const tri of triangles) {
      totalArea += tri.area;
      cumulativeArea.push(totalArea);
    }

    // --- Poisson-disk sampling ---
    const maxAttempts = count * this.maxPoissonIterations;
    let attempts = 0;

    while (result.length < count && attempts < maxAttempts) {
      attempts++;

      // Pick a random triangle proportional to area
      const areaRand = rng.next() * totalArea;
      let triIdx = 0;
      for (let i = 0; i < cumulativeArea.length; i++) {
        if (cumulativeArea[i] >= areaRand) { triIdx = i; break; }
      }
      const tri = triangles[triIdx];

      // Random barycentric coordinates
      const u = rng.next();
      const v = rng.next();
      const w = 1 - u - v;
      // If outside triangle, reflect
      const uu = u < 0 ? -u : u;
      const vv = v < 0 ? -v : v;
      const ww = 1 - uu - vv;
      const fu = uu + ww * 0.5;
      const fv = vv + ww * 0.5;

      const point = new THREE.Vector3()
        .addScaledVector(tri.a, 1 - fu - fv)
        .addScaledVector(tri.b, fu)
        .addScaledVector(tri.c, fv);

      // --- Density mask check ---
      if (densityMask) {
        const densityValue = this.sampleDensityMask(point, densityMask);
        if (rng.next() > densityValue) continue;
      }

      // --- Poisson-disk distance check ---
      let tooClose = false;
      for (const existing of result) {
        if (existing.position.distanceTo(point) < this.minRadius) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // --- Build instance transform ---
      // Align Y-axis with surface normal via quaternion
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, tri.normal);
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
      // Add random yaw rotation around the normal
      euler.y += rng.uniform(0, Math.PI * 2);

      // Random scale variation
      const scaleBase = rng.uniform(0.7, 1.3);
      const scale = new THREE.Vector3(scaleBase, scaleBase, scaleBase);

      result.push({ position: point, rotation: euler, scale });
    }

    return result;
  }

  /**
   * Sample the density mask at a world-space position.
   * Expects the mask to be an RGBA float texture where R = density [0,1].
   */
  private sampleDensityMask(point: THREE.Vector3, mask: THREE.DataTexture): number {
    const data = mask.image.data as Float32Array;
    const width = mask.image.width;
    const height = mask.image.height;

    // Naive UV mapping: use XZ as UV, normalised to [0,1]
    // Users should provide a properly mapped texture for complex surfaces
    const u = (point.x * 0.01 + 0.5) % 1.0;
    const v = (point.z * 0.01 + 0.5) % 1.0;
    const ix = Math.min(Math.max(Math.floor(u * width), 0), width - 1);
    const iy = Math.min(Math.max(Math.floor(v * height), 0), height - 1);
    const idx = (iy * width + ix) * 4;

    return data[idx] ?? 1.0;
  }

  /**
   * Compute a square texture size large enough to hold `count` instances.
   */
  private computeTextureSize(count: number): number {
    const side = Math.ceil(Math.sqrt(count));
    return Math.max(side, 1);
  }

  /**
   * Create default frustum planes (a very wide frustum that passes everything).
   */
  private createDefaultFrustumPlanes(): THREE.Vector4[] {
    return [
      new THREE.Vector4(1, 0, 0, 1e6),   // +X
      new THREE.Vector4(-1, 0, 0, 1e6),   // -X
      new THREE.Vector4(0, 1, 0, 1e6),    // +Y
      new THREE.Vector4(0, -1, 0, 1e6),   // -Y
      new THREE.Vector4(0, 0, 1, 1e6),    // +Z
      new THREE.Vector4(0, 0, -1, 1e6),   // -Z
    ];
  }
}

// ============================================================================
// ScatterCameraCuller
// ============================================================================

/**
 * CPU-side camera frustum culler for InstancedMesh objects.
 *
 * Rather than removing instances (which would require rebuilding the
 * instance buffer), culled instances have their scale set to (0, 0, 0)
 * which collapses them to zero size on the GPU — a GPU-friendly
 * approach that avoids buffer reallocation.
 *
 * Supports optional padding for shadow/LOD transition zones so that
 * instances just outside the frustum are still rendered (they may cast
 * shadows or need to transition smoothly between LOD levels).
 */
export class ScatterCameraCuller {
  /** Padding distance beyond the frustum to keep instances visible */
  private padding: number;
  /** Reusable frustum object */
  private frustum: THREE.Frustum;
  /** Reusable proj-screen matrix */
  private projScreenMatrix: THREE.Matrix4;

  /**
   * @param padding  Extra distance beyond frustum to keep instances visible
   *                 (useful for shadows / LOD transitions). Default 5.
   */
  constructor(padding: number = 5) {
    this.padding = padding;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
  }

  /**
   * Cull instances of an InstancedMesh against the camera frustum.
   *
   * Culled instances have their matrix modified so that scale = 0,
   * effectively making them invisible without changing the instance count.
   *
   * @param instanceMesh  The InstancedMesh to cull
   * @param camera        The camera to test against
   * @param padding       Optional per-call padding override
   * @returns Object with visible and total instance counts
   */
  cullInstances(
    instanceMesh: THREE.InstancedMesh,
    camera: THREE.PerspectiveCamera,
    padding?: number,
  ): { visible: number; total: number } {
    const pad = padding ?? this.padding;

    // Build frustum
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const count = instanceMesh.count;
    const dummy = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const boundingSphere = new THREE.Sphere();

    let visibleCount = 0;

    for (let i = 0; i < count; i++) {
      instanceMesh.getMatrixAt(i, dummy);
      dummy.decompose(position, rotation, scale);

      // Create a bounding sphere at the instance position
      // Use the largest scale component as an approximate radius
      const approxRadius = Math.max(scale.x, scale.y, scale.z) * 2 + pad;
      boundingSphere.set(position, approxRadius);

      const isVisible = this.frustum.intersectsSphere(boundingSphere);

      if (isVisible) {
        // Restore original scale (may have been zeroed in a previous frame)
        // If scale was zeroed, we need the original — store it in userData
        const origScale = this.getOriginalScale(instanceMesh, i, scale);
        dummy.compose(position, rotation, origScale);
        visibleCount++;
      } else {
        // Set scale to zero to hide
        dummy.compose(position, rotation, new THREE.Vector3(0, 0, 0));
      }

      instanceMesh.setMatrixAt(i, dummy);
    }

    instanceMesh.instanceMatrix.needsUpdate = true;
    return { visible: visibleCount, total: count };
  }

  /**
   * Create a new InstancedMesh from a set of positions, with only
   * those inside the camera frustum given non-zero scale.
   *
   * @param sourceMesh  Template mesh (geometry + material)
   * @param positions   World-space positions for each instance
   * @param camera      The camera for frustum testing
   * @returns A new InstancedMesh with frustum-culled instances
   */
  createCulledInstanceMesh(
    sourceMesh: THREE.Mesh,
    positions: THREE.Vector3[],
    camera: THREE.PerspectiveCamera,
  ): THREE.InstancedMesh {
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const instanceMesh = new THREE.InstancedMesh(
      sourceMesh.geometry,
      sourceMesh.material,
      positions.length,
    );

    const dummy = new THREE.Matrix4();
    const boundingSphere = new THREE.Sphere();

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      boundingSphere.set(pos, this.padding);

      const isVisible = this.frustum.intersectsSphere(boundingSphere);

      if (isVisible) {
        dummy.makeTranslation(pos.x, pos.y, pos.z);
      } else {
        // Zero scale — invisible
        dummy.compose(
          pos,
          new THREE.Quaternion(),
          new THREE.Vector3(0, 0, 0),
        );
      }

      instanceMesh.setMatrixAt(i, dummy);
    }

    instanceMesh.instanceMatrix.needsUpdate = true;
    return instanceMesh;
  }

  /**
   * Attempt to recover the original scale for an instance.
   * If the scale has been zeroed (culled in a previous frame), try
   * userData cache; otherwise return the provided scale (which may be 0).
   */
  private getOriginalScale(
    mesh: THREE.InstancedMesh,
    index: number,
    currentScale: THREE.Vector3,
  ): THREE.Vector3 {
    // If scale is non-zero, it's already valid
    if (currentScale.x > 0 || currentScale.y > 0 || currentScale.z > 0) {
      return currentScale;
    }

    // Try userData cache
    const cache = mesh.userData._originalScales as Map<number, THREE.Vector3> | undefined;
    if (cache && cache.has(index)) {
      return cache.get(index)!.clone();
    }

    // Default to unit scale
    return new THREE.Vector3(1, 1, 1);
  }

  /**
   * Cache original scales before the first cull pass.
   * Call this once after creating the InstancedMesh to preserve
   * original scales before they are zeroed by culling.
   */
  cacheOriginalScales(instanceMesh: THREE.InstancedMesh): void {
    const cache = new Map<number, THREE.Vector3>();
    const dummy = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < instanceMesh.count; i++) {
      instanceMesh.getMatrixAt(i, dummy);
      dummy.decompose(position, rotation, scale);
      cache.set(i, scale.clone());
    }

    instanceMesh.userData._originalScales = cache;
  }
}

// ============================================================================
// ScatterDensityField
// ============================================================================

/**
 * Computes a 2D density field from PlacementFilters over terrain data
 * and stores it as a Float32Array / DataTexture for GPU consumption.
 *
 * Supports all filter types from DensityPlacementSystem (noise, altitude,
 * slope, tag, biome, distance) and custom filters.
 */
export class ScatterDensityField {
  /** Grid resolution */
  private resolution: number;
  /** World-space size of the density field */
  private worldSize: number;

  /**
   * @param resolution  Grid resolution (width = height = resolution)
   * @param worldSize   World-space extent of the density field
   */
  constructor(resolution: number = 256, worldSize: number = 200) {
    this.resolution = resolution;
    this.worldSize = worldSize;
  }

  /**
   * Evaluate all placement filters on a grid over the terrain.
   *
   * @param terrainData  Terrain height/slope/tag data
   * @param filters      Array of PlacementFilter instances
   * @param mask         Optional PlacementMask to evaluate (alternative to filters array)
   * @returns Float32Array of density values in [0, 1]
   */
  computeDensityField(
    terrainData: TerrainData,
    filters?: PlacementFilter[],
    mask?: PlacementMask,
  ): Float32Array {
    const size = this.resolution * this.resolution;
    const field = new Float32Array(size);
    const halfWorld = this.worldSize * 0.5;

    for (let iz = 0; iz < this.resolution; iz++) {
      for (let ix = 0; ix < this.resolution; ix++) {
        // Map grid coordinates to world-space
        const u = ix / (this.resolution - 1);
        const v = iz / (this.resolution - 1);
        const worldX = (u - 0.5) * this.worldSize;
        const worldZ = (v - 0.5) * this.worldSize;

        let density = 1.0;

        if (mask) {
          // Use the composable mask directly
          density = mask.evaluate(worldX, worldZ, terrainData);
        } else if (filters && filters.length > 0) {
          // Multiply all filter values together
          for (const filter of filters) {
            density *= filter.evaluate(worldX, worldZ, terrainData);
            if (density <= 0) break; // early out
          }
        }

        field[iz * this.resolution + ix] = Math.max(0, Math.min(1, density));
      }
    }

    return field;
  }

  /**
   * Convert a density field Float32Array into a THREE.DataTexture
   * suitable for GPU sampling.
   *
   * @param field  Density field from computeDensityField()
   * @returns DataTexture with R = density, GBA = 0
   */
  toDataTexture(field: Float32Array): THREE.DataTexture {
    // Pack into RGBA float texture
    const rgba = new Float32Array(this.resolution * this.resolution * 4);
    for (let i = 0; i < this.resolution * this.resolution; i++) {
      rgba[i * 4 + 0] = field[i]; // R = density
      rgba[i * 4 + 1] = 0;       // G
      rgba[i * 4 + 2] = 0;       // B
      rgba[i * 4 + 3] = 1;       // A
    }

    const texture = new THREE.DataTexture(
      rgba,
      this.resolution,
      this.resolution,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return texture;
  }

  /**
   * Create a density field texture from a PlacementMask directly.
   * Convenience method combining computeDensityField() + toDataTexture().
   *
   * @param terrainData  Terrain data
   * @param mask         Composable placement mask
   * @returns DataTexture ready for GPU use
   */
  createDensityTexture(
    terrainData: TerrainData,
    mask: PlacementMask,
  ): THREE.DataTexture {
    const field = this.computeDensityField(terrainData, undefined, mask);
    return this.toDataTexture(field);
  }

  /**
   * Generate a noise-based density field for quick prototyping.
   *
   * @param scale     Noise scale
   * @param threshold Noise threshold (values below are 0)
   * @param seed      Noise seed
   * @returns Float32Array of density values
   */
  generateNoiseDensityField(
    scale: number = 0.02,
    threshold: number = 0.4,
    seed: number = 42,
  ): Float32Array {
    const size = this.resolution * this.resolution;
    const field = new Float32Array(size);
    const halfWorld = this.worldSize * 0.5;

    for (let iz = 0; iz < this.resolution; iz++) {
      for (let ix = 0; ix < this.resolution; ix++) {
        const u = ix / (this.resolution - 1);
        const v = iz / (this.resolution - 1);
        const worldX = (u - 0.5) * this.worldSize;
        const worldZ = (v - 0.5) * this.worldSize;

        const raw = seededNoise2D(worldX, worldZ, scale, seed);
        const norm = (raw + 1) * 0.5; // [-1,1] → [0,1]
        field[iz * this.resolution + ix] = norm >= threshold ? norm : 0;
      }
    }

    return field;
  }

  /**
   * Get the resolution of the density field.
   */
  getResolution(): number {
    return this.resolution;
  }

  /**
   * Get the world-space size of the density field.
   */
  getWorldSize(): number {
    return this.worldSize;
  }
}

// ============================================================================
// GPUScatterShader — convenience uniform builder
// ============================================================================

/**
 * Helper namespace for building shader uniforms for the GPU scatter
 * vertex shader.  Encapsulates common setup patterns.
 */
export namespace GPUScatterShader {
  /**
   * Build a complete set of uniforms for the scatter vertex shader.
   *
   * @param positionTexture  DataTexture with per-instance positions
   * @param rotationTexture  DataTexture with per-instance rotations
   * @param scaleTexture     DataTexture with per-instance scales
   * @param instanceCount    Total number of instances
   * @param textureSize      Width/height of data textures
   * @param camera           Camera for LOD distances and frustum
   * @param lodDistances     Optional [near, mid, far] LOD distances
   */
  export function buildUniforms(
    positionTexture: THREE.DataTexture,
    rotationTexture: THREE.DataTexture,
    scaleTexture: THREE.DataTexture,
    instanceCount: number,
    textureSize: number,
    camera?: THREE.PerspectiveCamera,
    lodDistances?: [number, number, number],
  ): { [uniform: string]: THREE.IUniform } {
    const lod = lodDistances ?? [50, 150, 400];

    // Build frustum planes from camera if available
    let frustumPlanes: THREE.Vector4[];
    if (camera) {
      const frustum = new THREE.Frustum();
      const projScreenMatrix = new THREE.Matrix4();
      projScreenMatrix.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      frustum.setFromProjectionMatrix(projScreenMatrix);
      frustumPlanes = frustum.planes.map(
        p => new THREE.Vector4(p.normal.x, p.normal.y, p.normal.z, p.constant),
      );
    } else {
      frustumPlanes = [
        new THREE.Vector4(1, 0, 0, 1e6),
        new THREE.Vector4(-1, 0, 0, 1e6),
        new THREE.Vector4(0, 1, 0, 1e6),
        new THREE.Vector4(0, -1, 0, 1e6),
        new THREE.Vector4(0, 0, 1, 1e6),
        new THREE.Vector4(0, 0, -1, 1e6),
      ];
    }

    return {
      uPositionTexture: { value: positionTexture },
      uRotationTexture: { value: rotationTexture },
      uScaleTexture: { value: scaleTexture },
      uInstanceCount: { value: instanceCount },
      uTextureSize: { value: textureSize },
      uFrustumPlanes: { value: frustumPlanes },
      uLODDistance0: { value: lod[0] },
      uLODDistance1: { value: lod[1] },
      uLODDistance2: { value: lod[2] },
      uCameraPosition: {
        value: camera ? camera.position.clone() : new THREE.Vector3(0, 10, 0),
      },
    };
  }

  /**
   * Create a ShaderMaterial configured for GPU scatter rendering.
   *
   * @param uniforms  Uniforms from buildUniforms()
   * @param customFragmentShader  Optional custom fragment shader
   */
  export function createMaterial(
    uniforms: { [uniform: string]: THREE.IUniform },
    customFragmentShader?: string,
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: GPUScatterVertexShader,
      fragmentShader: customFragmentShader ?? GPUScatterFragmentShader,
      uniforms,
      side: THREE.DoubleSide,
    });
  }
}
