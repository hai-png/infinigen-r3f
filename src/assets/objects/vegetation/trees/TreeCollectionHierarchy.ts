/**
 * TreeCollectionHierarchy.ts — Child Collection Hierarchy for Tree Parts
 *
 * Original Infinigen creates leaves → twigs → branches → tree as separate
 * collections with independent factories. This module replicates that
 * architecture by grouping tree geometry into 4 independent collections
 * (trunk, branches, twigs, foliage), each with its own material and LOD settings.
 *
 * Architecture:
 *   TreePartCollection — groups of geometry with shared material and LOD settings
 *   TreeCollectionHierarchy — manages 4 collections with independent LOD
 *   Integration with VegetationLODSystem for per-part LOD thresholds
 *
 * @module assets/objects/vegetation/trees
 */

import * as THREE from 'three';
import type { TreeSkeleton } from '../SpaceColonization';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** The 4 tree part categories */
export type TreePartType = 'trunk' | 'branches' | 'twigs' | 'foliage';

/** LOD settings for a single tree part collection */
export interface PartLODSettings {
  /** Distance at which this part becomes visible */
  visibleDistance: number;
  /** Distance at which this part fades out (0 = never fade) */
  fadeDistance: number;
  /** Face budget for LOD0 (full detail) */
  highDetailFaces: number;
  /** Face budget for LOD1 (medium detail) */
  mediumDetailFaces: number;
  /** Face budget for LOD2 (low detail) */
  lowDetailFaces: number;
  /** Whether this part casts shadows */
  castShadow: boolean;
  /** Whether this part receives shadows */
  receiveShadow: boolean;
}

/** A collection of geometry for a specific tree part */
export class TreePartCollection {
  readonly type: TreePartType;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  lodSettings: PartLODSettings;
  private meshes: THREE.Mesh[] = [];

  constructor(
    type: TreePartType,
    geometry?: THREE.BufferGeometry,
    material?: THREE.Material,
    lodSettings?: Partial<PartLODSettings>
  ) {
    this.type = type;
    this.geometry = geometry ?? new THREE.BufferGeometry();
    this.material = material ?? new THREE.MeshStandardMaterial();
    this.lodSettings = {
      ...DEFAULT_PART_LOD_SETTINGS[type],
      ...lodSettings,
    };
  }

  /**
   * Create a THREE.Mesh from this collection's geometry and material.
   */
  toMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = this.lodSettings.castShadow;
    mesh.receiveShadow = this.lodSettings.receiveShadow;
    mesh.userData.treePart = this.type;
    this.meshes.push(mesh);
    return mesh;
  }

  /**
   * Update the geometry of this collection.
   */
  setGeometry(geometry: THREE.BufferGeometry): void {
    this.geometry = geometry;
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
  }

  /**
   * Update the material of this collection.
   */
  setMaterial(material: THREE.Material): void {
    this.material = material;
    for (const mesh of this.meshes) {
      mesh.material = material;
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.geometry.dispose();
    if (this.material instanceof THREE.Material) {
      this.material.dispose();
    }
    this.meshes = [];
  }
}

// ============================================================================
// Default LOD Settings per Part Type
// ============================================================================

const DEFAULT_PART_LOD_SETTINGS: Record<TreePartType, PartLODSettings> = {
  trunk: {
    visibleDistance: 0,      // Always visible
    fadeDistance: 0,         // Never fades
    highDetailFaces: 5000,
    mediumDetailFaces: 2000,
    lowDetailFaces: 500,
    castShadow: true,
    receiveShadow: true,
  },
  branches: {
    visibleDistance: 0,      // Always visible
    fadeDistance: 120,       // Fades at distance
    highDetailFaces: 4000,
    mediumDetailFaces: 1500,
    lowDetailFaces: 300,
    castShadow: true,
    receiveShadow: true,
  },
  twigs: {
    visibleDistance: 0,
    fadeDistance: 60,        // Fades early
    highDetailFaces: 2000,
    mediumDetailFaces: 500,
    lowDetailFaces: 100,
    castShadow: true,
    receiveShadow: false,
  },
  foliage: {
    visibleDistance: 0,
    fadeDistance: 100,       // Fades at medium distance
    highDetailFaces: 6000,
    mediumDetailFaces: 2000,
    lowDetailFaces: 400,
    castShadow: true,
    receiveShadow: false,
  },
};

// ============================================================================
// TreeCollectionHierarchy
// ============================================================================

/**
 * Manages 4 tree part collections with independent LOD and materials.
 *
 * The hierarchy separates tree geometry into:
 *   - trunk: Main trunk geometry (high detail, always visible)
 *   - branches: Branch geometry (medium detail)
 *   - twigs: Small twig geometry (low detail, fades first)
 *   - foliage: Leaf/needle instances (independent material)
 *
 * Each collection has its own BufferGeometry and Material, allowing
 * independent LOD management, material variation, and culling.
 *
 * Usage:
 *   const hierarchy = new TreeCollectionHierarchy(skeleton);
 *   hierarchy.buildFromSkeleton(skeleton);
 *   const lodGroup = hierarchy.toLODGroup();
 *   scene.add(lodGroup);
 */
export class TreeCollectionHierarchy {
  readonly collections: Map<TreePartType, TreePartCollection>;
  private skeleton?: TreeSkeleton;

  constructor(skeleton?: TreeSkeleton) {
    this.skeleton = skeleton;
    this.collections = new Map();

    // Initialize all 4 collections
    const types: TreePartType[] = ['trunk', 'branches', 'twigs', 'foliage'];
    for (const type of types) {
      this.collections.set(type, new TreePartCollection(type));
    }
  }

  /**
   * Get a specific collection by type.
   */
  getCollection(type: TreePartType): TreePartCollection {
    return this.collections.get(type)!;
  }

  /**
   * Build all collections from a tree skeleton by separating
   * vertices/edges by generation.
   *
   * Generation mapping:
   *   gen 0 → trunk
   *   gen 1 → branches
   *   gen 2 → twigs
   *   gen 3+ → foliage (leaf positions only)
   */
  buildFromSkeleton(skeleton: TreeSkeleton): void {
    this.skeleton = skeleton;

    // Separate vertices by generation
    const trunkVertices: number[] = [];
    const branchVertices: number[] = [];
    const twigVertices: number[] = [];
    const foliagePositions: THREE.Vector3[] = [];

    for (const vertex of skeleton.vertices) {
      switch (vertex.generation) {
        case 0:
          trunkVertices.push(vertex.index);
          break;
        case 1:
          branchVertices.push(vertex.index);
          break;
        case 2:
          twigVertices.push(vertex.index);
          break;
        default:
          foliagePositions.push(vertex.position.clone());
          break;
      }
    }

    // Build trunk geometry from generation-0 edges
    const trunkGeo = this.buildPartGeometry(skeleton, 0, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.collections.get('trunk')!.setGeometry(trunkGeo);
    this.collections.get('trunk')!.setMaterial(trunkMat);

    // Build branch geometry from generation-1 edges
    const branchGeo = this.buildPartGeometry(skeleton, 1, 1);
    const branchMat = new THREE.MeshStandardMaterial({
      color: 0x5d4037,
      roughness: 0.85,
      metalness: 0.0,
    });
    this.collections.get('branches')!.setGeometry(branchGeo);
    this.collections.get('branches')!.setMaterial(branchMat);

    // Build twig geometry from generation-2 edges
    const twigGeo = this.buildPartGeometry(skeleton, 2, 2);
    const twigMat = new THREE.MeshStandardMaterial({
      color: 0x6d5a4a,
      roughness: 0.7,
      metalness: 0.0,
    });
    this.collections.get('twigs')!.setGeometry(twigGeo);
    this.collections.get('twigs')!.setMaterial(twigMat);

    // Build foliage geometry from generation-3+ positions
    const foliageGeo = this.buildFoliageGeometry(foliagePositions);
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0x2d5a1d,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.collections.get('foliage')!.setGeometry(foliageGeo);
    this.collections.get('foliage')!.setMaterial(foliageMat);
  }

  /**
   * Create a THREE.LOD object with different detail levels.
   *
   * LOD0: All collections at full detail
   * LOD1: Trunk + branches at medium detail, foliage simplified, twigs removed
   * LOD2: Trunk at low detail + simplified canopy sphere, no branches/twigs/foliage
   * LOD3: Billboard only
   */
  toLODGroup(
    distances: number[] = [0, 30, 80, 150]
  ): THREE.LOD {
    const lod = new THREE.LOD();

    // LOD0: Full detail — all parts
    const fullGroup = new THREE.Group();
    for (const [, collection] of this.collections) {
      if (collection.geometry.attributes.position.count > 0) {
        fullGroup.add(collection.toMesh());
      }
    }
    lod.addLevel(fullGroup, distances[0] ?? 0);

    // LOD1: Medium — trunk + branches + simplified foliage, no twigs
    const mediumGroup = new THREE.Group();
    mediumGroup.add(this.collections.get('trunk')!.toMesh());
    mediumGroup.add(this.collections.get('branches')!.toMesh());

    // Simplified foliage as a sphere
    const foliageBounds = this.getFoliageBounds();
    if (foliageBounds) {
      const foliageMat = this.collections.get('foliage')!.material;
      const sphereGeo = new THREE.SphereGeometry(foliageBounds.radius, 8, 6);
      const sphereMesh = new THREE.Mesh(sphereGeo, foliageMat);
      sphereMesh.position.copy(foliageBounds.center);
      sphereMesh.castShadow = true;
      mediumGroup.add(sphereMesh);
    }
    lod.addLevel(mediumGroup, distances[1] ?? 30);

    // LOD2: Low — trunk cylinder + canopy sphere
    const lowGroup = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 8, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
    trunkMesh.position.y = 4;
    trunkMesh.castShadow = true;
    lowGroup.add(trunkMesh);

    if (foliageBounds) {
      const canopyGeo = new THREE.SphereGeometry(foliageBounds.radius * 0.8, 6, 4);
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1d, roughness: 0.7 });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.copy(foliageBounds.center);
      canopy.castShadow = true;
      lowGroup.add(canopy);
    }
    lod.addLevel(lowGroup, distances[2] ?? 80);

    // LOD3: Billboard — single quad
    const billboardGeo = new THREE.PlaneGeometry(5, 8);
    const billboardMat = new THREE.MeshBasicMaterial({
      color: 0x2d5a1d,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
    const billboard = new THREE.Mesh(billboardGeo, billboardMat);
    billboard.position.y = 4;
    lod.addLevel(billboard, distances[3] ?? 150);

    return lod;
  }

  /**
   * Create a THREE.Group with all collection meshes (no LOD).
   */
  toGroup(): THREE.Group {
    const group = new THREE.Group();
    for (const [, collection] of this.collections) {
      if (collection.geometry.attributes.position.count > 0) {
        group.add(collection.toMesh());
      }
    }
    return group;
  }

  /**
   * Get LOD thresholds for integration with VegetationLODSystem.
   * Each part type has independent distance thresholds.
   */
  getLODThresholds(): Record<TreePartType, { visible: number; fade: number }> {
    const result: Record<TreePartType, { visible: number; fade: number }> = {} as any;
    for (const [type, collection] of this.collections) {
      result[type] = {
        visible: collection.lodSettings.visibleDistance,
        fade: collection.lodSettings.fadeDistance,
      };
    }
    return result;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const [, collection] of this.collections) {
      collection.dispose();
    }
    this.collections.clear();
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Build geometry for edges of a specific generation.
   * Creates tapered cylinder segments for each edge.
   */
  private buildPartGeometry(
    skeleton: TreeSkeleton,
    minGeneration: number,
    maxGeneration: number
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];

    for (const edge of skeleton.edges) {
      const parentGen = skeleton.vertices[edge.parent].generation;
      const childGen = skeleton.vertices[edge.child].generation;

      // Include edge if either vertex is in the target generation range
      const parentInRange = parentGen >= minGeneration && parentGen <= maxGeneration;
      const childInRange = childGen >= minGeneration && childGen <= maxGeneration;

      if (!parentInRange && !childInRange) continue;

      const parent = skeleton.vertices[edge.parent];
      const child = skeleton.vertices[edge.child];

      const startRadius = Math.max(parent.radius, 0.02);
      const endRadius = Math.max(child.radius, 0.01);

      const direction = new THREE.Vector3().subVectors(child.position, parent.position);
      const length = direction.length();

      if (length < 0.001) continue;

      direction.normalize();

      // Build a simple tapered cylinder segment
      const radialSegments = maxGeneration === 0 ? 8 : 6;
      const segment = this.createTaperedCylinder(
        parent.position, child.position,
        startRadius, endRadius,
        radialSegments
      );

      geometries.push(segment);
    }

    if (geometries.length === 0) return new THREE.BufferGeometry();

    // Merge all segments
    return this.mergeGeometries(geometries);
  }

  /**
   * Build foliage geometry from leaf positions.
   * Creates small sphere instances at each position.
   */
  private buildFoliageGeometry(positions: THREE.Vector3[]): THREE.BufferGeometry {
    if (positions.length === 0) return new THREE.BufferGeometry();

    const geometries: THREE.BufferGeometry[] = [];
    const leafRadius = 0.05;

    for (const pos of positions) {
      const geo = new THREE.SphereGeometry(leafRadius, 4, 3);
      geo.translate(pos.x, pos.y, pos.z);
      geometries.push(geo);
    }

    return this.mergeGeometries(geometries);
  }

  /**
   * Create a tapered cylinder segment between two points.
   */
  private createTaperedCylinder(
    start: THREE.Vector3,
    end: THREE.Vector3,
    startRadius: number,
    endRadius: number,
    radialSegments: number
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    direction.normalize();

    const arbitrary = Math.abs(direction.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const perp1 = new THREE.Vector3().crossVectors(direction, arbitrary).normalize();
    const perp2 = new THREE.Vector3().crossVectors(direction, perp1).normalize();

    // Two rings: start and end
    const rings = [
      { center: start, radius: startRadius, v: 0 },
      { center: end, radius: endRadius, v: 1 },
    ];

    for (const ring of rings) {
      for (let i = 0; i < radialSegments; i++) {
        const angle = (i / radialSegments) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const px = ring.center.x + (perp1.x * cosA + perp2.x * sinA) * ring.radius;
        const py = ring.center.y + (perp1.y * cosA + perp2.y * sinA) * ring.radius;
        const pz = ring.center.z + (perp1.z * cosA + perp2.z * sinA) * ring.radius;

        positions.push(px, py, pz);

        const normal = new THREE.Vector3(
          perp1.x * cosA + perp2.x * sinA,
          perp1.y * cosA + perp2.y * sinA,
          perp1.z * cosA + perp2.z * sinA
        ).normalize();
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(i / radialSegments, ring.v);
      }
    }

    // Build triangles
    for (let i = 0; i < radialSegments; i++) {
      const next = (i + 1) % radialSegments;
      const a = i;
      const b = next;
      const c = radialSegments + i;
      const d = radialSegments + next;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Get the bounding information for foliage positions.
   */
  private getFoliageBounds(): { center: THREE.Vector3; radius: number } | null {
    if (!this.skeleton) return null;

    const foliageVertices = this.skeleton.vertices.filter(v => v.generation >= 3);
    if (foliageVertices.length === 0) return null;

    const positions = foliageVertices.map(v => v.position);
    const box = new THREE.Box3().setFromPoints(positions);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.5;

    return { center, radius };
  }

  /**
   * Merge multiple geometries.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 0) return new THREE.BufferGeometry();
    if (geometries.length === 1) return geometries[0];

    let totalVertices = 0;
    let totalIndices = 0;

    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
      if (geo.index) totalIndices += geo.index.count;
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedUVs = new Float32Array(totalVertices * 2);
    const mergedIndices: number[] = [];

    let vertexOffset = 0;

    for (const geo of geometries) {
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvAttr = geo.attributes.uv;
      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        mergedPositions[(vertexOffset + i) * 3] = posAttr.getX(i);
        mergedPositions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
        mergedPositions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);

        if (normAttr) {
          mergedNormals[(vertexOffset + i) * 3] = normAttr.getX(i);
          mergedNormals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
          mergedNormals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);
        }

        if (uvAttr) {
          mergedUVs[(vertexOffset + i) * 2] = uvAttr.getX(i);
          mergedUVs[(vertexOffset + i) * 2 + 1] = uvAttr.getY(i);
        }
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          mergedIndices.push(geo.index.getX(i) + vertexOffset);
        }
      }

      vertexOffset += count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(mergedUVs, 2));
    if (mergedIndices.length > 0) {
      merged.setIndex(mergedIndices);
    }

    return merged;
  }
}
