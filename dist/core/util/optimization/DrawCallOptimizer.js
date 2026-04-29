/**
 * DrawCallOptimizer - Analyzes and optimizes draw calls for better rendering performance
 *
 * Provides tools to batch geometries, merge materials, and reduce state changes
 * to minimize GPU overhead in large scenes.
 */
import * as THREE from 'three';
/**
 * Analyzes a scene for draw call optimization opportunities
 */
export class DrawCallOptimizer {
    constructor(scene) {
        this.scene = scene;
    }
    /**
     * Analyze current draw call statistics
     */
    analyze() {
        const materialGroups = new Map();
        const geometrySet = new Set();
        let totalDrawCalls = 0;
        this.scene.traverse((object) => {
            if (this.isRenderable(object)) {
                const mesh = object;
                // Count draw calls
                if (mesh.geometry) {
                    totalDrawCalls++;
                    // Track unique geometries
                    const geomId = this.getGeometryId(mesh.geometry);
                    geometrySet.add(geomId);
                }
                // Group by material
                if (mesh.material) {
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach(material => {
                        if (!materialGroups.has(material)) {
                            materialGroups.set(material, []);
                        }
                        materialGroups.get(material).push(object);
                    });
                }
            }
        });
        const uniqueMaterials = materialGroups.size;
        const uniqueGeometries = geometrySet.size;
        // Calculate potential reduction
        // Objects with same material could potentially be batched
        let potentialBatches = 0;
        materialGroups.forEach(objects => {
            potentialBatches += Math.ceil(objects.length / 10); // Assume 10 objects per batch
        });
        const potentialReduction = totalDrawCalls - potentialBatches;
        // Generate suggestions
        const suggestions = this.generateSuggestions({
            totalDrawCalls,
            uniqueMaterials,
            uniqueGeometries,
            materialGroups,
            potentialReduction,
            suggestions: []
        });
        return {
            totalDrawCalls,
            uniqueMaterials,
            uniqueGeometries,
            materialGroups,
            potentialReduction: Math.max(0, potentialReduction),
            suggestions
        };
    }
    /**
     * Optimize scene by batching objects
     */
    optimize(config = {}) {
        const { maxBatchSize = 100, mergeByMaterial = true, mergeByGeometry = false, minDistance = 0.1, preserveTransforms = false } = config;
        const stats = this.analyze();
        const beforeDrawCalls = stats.totalDrawCalls;
        const optimizedRoot = new THREE.Group();
        let mergedObjects = 0;
        if (mergeByMaterial) {
            // Batch by material
            stats.materialGroups.forEach((objects, material) => {
                const batches = this.createMaterialBatches(objects, material, maxBatchSize, preserveTransforms);
                batches.forEach(batch => {
                    optimizedRoot.add(batch);
                    mergedObjects += objects.length;
                });
            });
        }
        else {
            // Keep original structure but apply optimizations
            this.scene.traverse((object) => {
                if (this.isRenderable(object)) {
                    const clone = object.clone();
                    optimizedRoot.add(clone);
                }
            });
        }
        // Recalculate draw calls after optimization
        const afterDrawCalls = this.countDrawCalls(optimizedRoot);
        const reductionPercent = beforeDrawCalls > 0
            ? ((beforeDrawCalls - afterDrawCalls) / beforeDrawCalls) * 100
            : 0;
        return {
            optimizedRoot,
            beforeDrawCalls,
            afterDrawCalls,
            reductionPercent: Math.max(0, reductionPercent),
            mergedObjects
        };
    }
    /**
     * Create batches from objects sharing the same material
     */
    createMaterialBatches(objects, material, maxBatchSize, preserveTransforms) {
        const batches = [];
        for (let i = 0; i < objects.length; i += maxBatchSize) {
            const batchObjects = objects.slice(i, i + maxBatchSize);
            if (batchObjects.length === 1 && !preserveTransforms) {
                // Single object, just clone
                const obj = batchObjects[0];
                const batch = obj.clone();
                batches.push(batch);
            }
            else {
                // Multiple objects, merge geometries
                const mergedGeometry = this.mergeGeometries(batchObjects.map(obj => obj.geometry), batchObjects, preserveTransforms);
                if (mergedGeometry) {
                    const batch = new THREE.Mesh(mergedGeometry, material);
                    batches.push(batch);
                }
            }
        }
        return batches;
    }
    /**
     * Merge multiple geometries into one
     */
    mergeGeometries(geometries, objects, preserveTransforms) {
        const validGeometries = geometries.filter((g) => g !== null);
        if (validGeometries.length === 0)
            return null;
        if (preserveTransforms) {
            // Apply transforms to geometries before merging
            const transformedGeometries = validGeometries.map((geom, idx) => {
                const cloned = geom.clone();
                const obj = objects[idx];
                if (obj) {
                    cloned.applyMatrix4(obj.matrixWorld);
                }
                return cloned;
            });
            return this.mergeBufferGeometries(transformedGeometries);
        }
        else {
            return this.mergeBufferGeometries(validGeometries);
        }
    }
    /**
     * Merge array of buffer geometries
     */
    mergeBufferGeometries(geometries) {
        if (geometries.length === 0)
            return null;
        if (geometries.length === 1)
            return geometries[0].clone();
        try {
            // Use Three.js built-in merge if available
            const merged = new THREE.BufferGeometry();
            const positions = [];
            const normals = [];
            const uvs = [];
            const indices = [];
            let indexOffset = 0;
            geometries.forEach(geom => {
                const pos = geom.attributes.position?.array;
                const norm = geom.attributes.normal?.array;
                const uv = geom.attributes.uv?.array;
                const idx = geom.index?.array;
                if (pos)
                    positions.push(...Array.from(pos));
                if (norm)
                    normals.push(...Array.from(norm));
                if (uv)
                    uvs.push(...Array.from(uv));
                if (idx) {
                    for (let i = 0; i < idx.length; i++) {
                        indices.push(idx[i] + indexOffset);
                    }
                }
                else {
                    // No index, create one
                    const vertexCount = pos ? pos.length / 3 : 0;
                    for (let i = 0; i < vertexCount; i++) {
                        indices.push(i + indexOffset);
                    }
                }
                indexOffset += pos ? pos.length / 3 : 0;
            });
            merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            if (normals.length > 0) {
                merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            }
            if (uvs.length > 0) {
                merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            }
            merged.setIndex(indices);
            return merged;
        }
        catch (error) {
            console.warn('Failed to merge geometries:', error);
            return null;
        }
    }
    /**
     * Count draw calls in a scene
     */
    countDrawCalls(root) {
        let count = 0;
        root.traverse((object) => {
            if (this.isRenderable(object)) {
                const mesh = object;
                if (mesh.geometry) {
                    count++;
                }
            }
        });
        return count;
    }
    /**
     * Check if object is renderable
     */
    isRenderable(object) {
        return 'isMesh' in object && object.visible;
    }
    /**
     * Get unique identifier for geometry
     */
    getGeometryId(geometry) {
        return `${geometry.id}-${geometry.attributes.position?.count || 0}`;
    }
    /**
     * Generate optimization suggestions
     */
    generateSuggestions(stats) {
        const suggestions = [];
        if (stats.totalDrawCalls > 1000) {
            suggestions.push(`High draw call count (${stats.totalDrawCalls}). Consider batching objects by material.`);
        }
        if (stats.uniqueMaterials > 50) {
            suggestions.push(`Many unique materials (${stats.uniqueMaterials}). Consider using texture atlases or shared materials.`);
        }
        if (stats.uniqueGeometries > 100) {
            suggestions.push(`Many unique geometries (${stats.uniqueGeometries}). Consider instancing for repeated objects.`);
        }
        // Check for small batches
        let smallBatchCount = 0;
        stats.materialGroups.forEach(objects => {
            if (objects.length < 5) {
                smallBatchCount++;
            }
        });
        if (smallBatchCount > stats.uniqueMaterials * 0.5) {
            suggestions.push(`Many materials have few objects. Consider consolidating materials.`);
        }
        if (stats.potentialReduction > 100) {
            suggestions.push(`Potential to reduce ${stats.potentialReduction} draw calls through batching.`);
        }
        return suggestions;
    }
    /**
     * Enable instancing for repeated geometries
     */
    convertToInstancedMeshes(maxInstances = 100) {
        const result = new THREE.Group();
        const geometryMap = new Map();
        this.scene.traverse((object) => {
            if (this.isRenderable(object)) {
                const mesh = object;
                if (mesh.geometry) {
                    const geomId = this.getGeometryId(mesh.geometry);
                    if (!geometryMap.has(geomId)) {
                        geometryMap.set(geomId, {
                            geometry: mesh.geometry,
                            matrices: []
                        });
                    }
                    geometryMap.get(geomId).matrices.push(mesh.matrixWorld.clone());
                }
            }
        });
        // Create instanced meshes
        geometryMap.forEach(({ geometry, matrices }, geomId) => {
            if (matrices.length >= 2) {
                // Use instancing for repeated geometries
                const instanceCount = Math.min(matrices.length, maxInstances);
                const instancedMesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), instanceCount);
                for (let i = 0; i < instanceCount; i++) {
                    instancedMesh.setMatrixAt(i, matrices[i]);
                }
                instancedMesh.instanceMatrix.needsUpdate = true;
                result.add(instancedMesh);
            }
            else {
                // Keep single objects as regular meshes
                matrices.forEach(matrix => {
                    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
                    mesh.matrix.copy(matrix);
                    mesh.matrixAutoUpdate = false;
                    result.add(mesh);
                });
            }
        });
        return result;
    }
}
export default DrawCallOptimizer;
//# sourceMappingURL=DrawCallOptimizer.js.map