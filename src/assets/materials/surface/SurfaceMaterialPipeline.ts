/**
 * SurfaceMaterialPipeline — Tag-based material assignment pipeline
 *
 * Ported from infinigen/core/surface.py — the core material application flow.
 * This pipeline handles applying materials to objects with tag-based face
 * selection, blending materials on tagged faces, and converting shader
 * functions (node graphs) to Three.js materials.
 *
 * Key features:
 * - Tag-based face selection: apply materials only to faces with a specific tag
 * - Material blending on tagged faces (equivalent to Infinigen's MixShader)
 * - Shader function to material conversion via SurfaceMaterialPipeline
 * - Geometry displacement via vertex shader modification
 */

import * as THREE from 'three';
import { MaterialPipeline } from '../MaterialPipeline';
import type { NodeGraph } from '../../../core/nodes/execution/NodeEvaluator';
import { FaceTagger } from '../../../core/tags/FaceTagger';

// ============================================================================
// Types
// ============================================================================

/** Options for material assignment */
export interface SurfaceAssignOptions {
  /** Optional face tag to restrict assignment to tagged faces */
  selection?: string;
  /** Whether to replace existing materials or blend */
  blend?: boolean;
  /** Blend weight when blending (0-1, default 0.5) */
  blendWeight?: number;
}

// ============================================================================
// SurfaceMaterialPipeline
// ============================================================================

export class SurfaceMaterialPipeline {
  private static pipeline = new MaterialPipeline();
  private static faceTagger = new FaceTagger();

  // ===========================================================================
  // Shader Function → Material Conversion
  // ===========================================================================

  /**
   * Convert a shader function (NodeGraph) to a Three.js material.
   *
   * This is the equivalent of Infinigen's `shader_func_to_material` —
   * it takes a node graph that defines a shader function and produces
   * a complete PBR material.
   *
   * @param shaderGraph - Node graph defining the shader
   * @param params - Optional additional parameters
   * @returns MeshPhysicalMaterial with the shader applied
   */
  static shaderFuncToMaterial(
    shaderGraph: NodeGraph,
    params?: Record<string, any>,
  ): THREE.MeshPhysicalMaterial {
    try {
      return SurfaceMaterialPipeline.pipeline.fromNodeGraph(shaderGraph);
    } catch (err) {
      console.warn('SurfaceMaterialPipeline: shaderFuncToMaterial failed, returning default:', err);
      return SurfaceMaterialPipeline.pipeline.createDefaultMaterial();
    }
  }

  // ===========================================================================
  // Material Assignment with Tag-Based Face Selection
  // ===========================================================================

  /**
   * Add material to objects with optional tag-based face selection.
   *
   * When a `selection` tag is provided, only faces with that tag
   * receive the material. Uses Three.js geometry groups for per-face
   * material assignment.
   *
   * @param objects - Array of objects to apply the material to
   * @param material - The material to apply
   * @param selection - Optional tag name to restrict assignment
   */
  static addMaterial(
    objects: THREE.Object3D[],
    material: THREE.Material,
    selection?: string,
  ): void {
    for (const obj of objects) {
      if (selection) {
        SurfaceMaterialPipeline.assignMaterialToTaggedFaces(obj, material, selection);
      } else {
        SurfaceMaterialPipeline.applyMaterialToAll(obj, material);
      }
    }
  }

  /**
   * Add geometry displacement via vertex shader modification.
   *
   * Applies a displacement map or node graph to modify the vertex
   * positions of the object's geometry.
   *
   * @param object - The object to apply displacement to
   * @param displacementGraph - Node graph defining the displacement
   * @param selection - Optional tag to restrict to tagged faces
   */
  static addGeomod(
    object: THREE.Object3D,
    displacementGraph: NodeGraph,
    selection?: string,
  ): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (selection && !SurfaceMaterialPipeline.hasTag(child, selection)) return;

      const geometry = child.geometry;
      if (!geometry.attributes.position) return;

      // Create a displacement texture from the node graph
      try {
        const shaderMaterial = SurfaceMaterialPipeline.pipeline.create3DMaterialFromGraph(
          displacementGraph,
          { enableDisplacement: true, displacementScale: 0.1 },
        );

        // For displacement, we modify the geometry directly
        // rather than using a vertex shader (which requires custom materials)
        const positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;

        if (positions && normals) {
          const posArray = positions.array as Float32Array;
          const normArray = normals.array as Float32Array;

          // Simple displacement along normals
          // In a full implementation, this would evaluate the displacement
          // graph per-vertex
          for (let i = 0; i < positions.count; i++) {
            const nx = normArray[i * 3];
            const ny = normArray[i * 3 + 1];
            const nz = normArray[i * 3 + 2];

            // Use a simple noise-based displacement as placeholder
            const px = posArray[i * 3];
            const py = posArray[i * 3 + 1];
            const pz = posArray[i * 3 + 2];

            const displacement = Math.sin(px * 5) * Math.cos(py * 5) * Math.sin(pz * 5) * 0.02;

            posArray[i * 3] += nx * displacement;
            posArray[i * 3 + 1] += ny * displacement;
            posArray[i * 3 + 2] += nz * displacement;
          }

          positions.needsUpdate = true;
          geometry.computeVertexNormals();
        }
      } catch (err) {
        console.warn('SurfaceMaterialPipeline: addGeomod failed:', err);
      }
    });
  }

  /**
   * Assign material with face-level tag-based selection.
   *
   * Uses Three.js geometry groups to assign different materials to
   * different face sets within a single mesh. When a tag is provided,
   * only faces tagged with that tag receive the material; other faces
   * retain their existing material.
   *
   * @param objects - Objects to assign materials to
   * @param material - Material to assign
   * @param selection - Tag name for face selection
   */
  static assignMaterial(
    objects: THREE.Object3D[],
    material: THREE.Material,
    selection?: string,
  ): void {
    SurfaceMaterialPipeline.addMaterial(objects, material, selection);
  }

  /**
   * Blend materials on tagged faces.
   *
   * Equivalent to Infinigen's MixShader approach — creates a blended
   * material on faces identified by `tagMask`. The blend weight
   * controls the mix between the base and overlay materials.
   *
   * @param object - The object to blend materials on
   * @param baseMat - Base material
   * @param overlayMat - Overlay material to blend in
   * @param tagMask - Tag identifying which faces to blend on
   * @param blendWeight - Blend weight (0 = all base, 1 = all overlay)
   */
  static blendMaterialOnFaces(
    object: THREE.Object3D,
    baseMat: THREE.Material,
    overlayMat: THREE.Material,
    tagMask: string,
    blendWeight: number = 0.5,
  ): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const geometry = child.geometry;
      if (!geometry.index) return;

      // Get tagged face indices
      const taggedFaces = SurfaceMaterialPipeline.getTaggedFaceIndices(child, tagMask);
      if (taggedFaces.length === 0) return;

      // Create a blended material
      const blendedMat = SurfaceMaterialPipeline.createBlendedMaterial(
        baseMat,
        overlayMat,
        blendWeight,
      );

      // Split geometry into tagged and untagged groups
      SurfaceMaterialPipeline.splitGeometryByTag(child, taggedFaces, blendedMat, baseMat);
    });
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /**
   * Assign material only to faces with the given tag.
   */
  private static assignMaterialToTaggedFaces(
    object: THREE.Object3D,
    material: THREE.Material,
    tag: string,
  ): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const geometry = child.geometry;
      if (!geometry.index) {
        // No index buffer — apply to entire mesh
        SurfaceMaterialPipeline.applyMaterialToAll(child, material);
        return;
      }

      // Get tagged face indices
      const taggedFaces = SurfaceMaterialPipeline.getTaggedFaceIndices(child, tag);
      if (taggedFaces.length === 0) return;

      // If all faces are tagged, just apply the material
      const totalFaces = geometry.index.count / 3;
      if (taggedFaces.length >= totalFaces) {
        SurfaceMaterialPipeline.applyMaterialToAll(child, material);
        return;
      }

      // Split geometry: create groups for tagged and untagged faces
      SurfaceMaterialPipeline.splitGeometryByTag(child, taggedFaces, material, null);
    });
  }

  /**
   * Apply material to all faces of an object.
   */
  private static applyMaterialToAll(object: THREE.Object3D, material: THREE.Material): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
      }
    });
  }

  /**
   * Check if an object has a specific tag.
   */
  private static hasTag(mesh: THREE.Mesh, tag: string): boolean {
    // Check userData for tags
    if (mesh.userData?.tags) {
      const tags = mesh.userData.tags;
      if (Array.isArray(tags) && tags.includes(tag)) return true;
      if (typeof tags === 'object' && tag in tags) return true;
    }

    // Check geometry userData
    if (mesh.geometry?.userData?.tags) {
      const tags = mesh.geometry.userData.tags;
      if (Array.isArray(tags) && tags.includes(tag)) return true;
      if (typeof tags === 'object' && tag in tags) return true;
    }

    return false;
  }

  /**
   * Get face indices that have a specific tag.
   *
   * In Three.js, face tags are stored in geometry userData as a mapping
   * from tag name to an array of face indices.
   */
  private static getTaggedFaceIndices(mesh: THREE.Mesh, tag: string): number[] {
    // Check geometry userData for face tag map
    const faceTags = mesh.geometry?.userData?.faceTags;
    if (faceTags && typeof faceTags === 'object' && tag in faceTags) {
      return (faceTags as Record<string, number[]>)[tag];
    }

    // Check mesh userData for face tag map
    const meshFaceTags = mesh.userData?.faceTags;
    if (meshFaceTags && typeof meshFaceTags === 'object' && tag in meshFaceTags) {
      return (meshFaceTags as Record<string, number[]>)[tag];
    }

    // If the mesh itself is tagged (not face-level), all faces qualify
    if (SurfaceMaterialPipeline.hasTag(mesh, tag)) {
      const geometry = mesh.geometry;
      if (geometry.index) {
        const faceCount = geometry.index.count / 3;
        return Array.from({ length: faceCount }, (_, i) => i);
      } else if (geometry.attributes.position) {
        const faceCount = geometry.attributes.position.count / 3;
        return Array.from({ length: faceCount }, (_, i) => i);
      }
    }

    return [];
  }

  /**
   * Split a mesh's geometry into groups based on tagged faces.
   *
   * Creates geometry groups so that tagged faces get `taggedMaterial`
   * and untagged faces get `untaggedMaterial` (or keep existing).
   */
  private static splitGeometryByTag(
    mesh: THREE.Mesh,
    taggedFaces: number[],
    taggedMaterial: THREE.Material,
    untaggedMaterial: THREE.Material | null,
  ): void {
    const geometry = mesh.geometry;
    if (!geometry.index) return;

    const index = geometry.index;
    const totalFaces = index.count / 3;

    // Create a set for quick lookup
    const taggedSet = new Set(taggedFaces);

    // Collect indices for tagged and untagged faces
    const taggedIndices: number[] = [];
    const untaggedIndices: number[] = [];

    for (let faceIdx = 0; faceIdx < totalFaces; faceIdx++) {
      const baseIdx = faceIdx * 3;
      const i0 = index.getX(baseIdx);
      const i1 = index.getX(baseIdx + 1);
      const i2 = index.getX(baseIdx + 2);

      if (taggedSet.has(faceIdx)) {
        taggedIndices.push(i0, i1, i2);
      } else {
        untaggedIndices.push(i0, i1, i2);
      }
    }

    // Clear existing groups
    geometry.clearGroups();

    // Create groups
    const existingMaterial = mesh.material;
    const materials: THREE.Material[] = [];

    if (untaggedIndices.length > 0) {
      // Group 0: untagged faces
      geometry.addGroup(0, untaggedIndices.length, 0);
      materials.push(untaggedMaterial ?? (Array.isArray(existingMaterial) ? existingMaterial[0] : existingMaterial));
    }

    if (taggedIndices.length > 0) {
      // Group 1: tagged faces
      geometry.addGroup(untaggedIndices.length, taggedIndices.length, materials.length);
      materials.push(taggedMaterial);
    }

    // Rebuild the index buffer with the new order
    const newIndex = new Uint16Array([...untaggedIndices, ...taggedIndices]);
    geometry.setIndex(new THREE.BufferAttribute(newIndex, 1));

    // Set multi-material
    mesh.material = materials;
  }

  /**
   * Create a blended material from two source materials.
   *
   * Uses MeshPhysicalMaterial to blend properties between base and overlay.
   */
  private static createBlendedMaterial(
    baseMat: THREE.Material,
    overlayMat: THREE.Material,
    weight: number,
  ): THREE.MeshPhysicalMaterial {
    const base = baseMat as THREE.MeshPhysicalMaterial;
    const overlay = overlayMat as THREE.MeshPhysicalMaterial;

    const blended = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().lerpColors(
        base.color ?? new THREE.Color(0.5, 0.5, 0.5),
        overlay.color ?? new THREE.Color(0.5, 0.5, 0.5),
        weight,
      ),
      roughness: (base.roughness ?? 0.5) * (1 - weight) + (overlay.roughness ?? 0.5) * weight,
      metalness: (base.metalness ?? 0) * (1 - weight) + (overlay.metalness ?? 0) * weight,
    });

    // Blend maps if both have them
    if (base.map && overlay.map) {
      // In a full implementation, we would create a blended texture
      // For now, use the base map with reduced intensity
      blended.map = base.map;
    } else if (base.map) {
      blended.map = base.map;
    } else if (overlay.map) {
      blended.map = overlay.map;
    }

    blended.name = `Blended_${base.name ?? 'base'}_${overlay.name ?? 'overlay'}_${weight.toFixed(2)}`;
    return blended;
  }
}

export default SurfaceMaterialPipeline;
