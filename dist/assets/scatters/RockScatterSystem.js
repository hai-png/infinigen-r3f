/**
 * RockScatterSystem
 *
 * Advanced rock scattering system that combines procedural rock generation
 * with instance-based distribution for realistic terrain decoration.
 *
 * Features:
 * - Integration with RockGenerator for mesh creation
 * - Altitude-based rock type selection
 * - Slope-aware placement logic
 * - Cluster formation for natural rock groups
 * - LOD support for performance
 * - Biome-specific configurations
 * - Erosion-based distribution
 *
 * Usage:
 * ```typescript
 * const rockScatter = new RockScatterSystem();
 * rockScatter.configure({
 *   boulderDensity: 15,
 *   gravelDensity: 3,
 *   clusterProbability: 0.4
 * });
 *
 * const result = rockScatter.scatter(terrainGeometry, terrainMatrix);
 * scene.add(result.group);
 * ```
 */
import * as THREE from 'three';
import { RockGenerator } from './ground/RockGenerator.js';
import { InstanceScatterSystem } from '../InstanceScatterSystem.js';
import { NoiseUtils } from '../../terrain/utils/NoiseUtils.js';
// ============================================================================
// Biome Presets
// ============================================================================
const ROCK_BIOME_PRESETS = {
    mountain: {
        name: 'Mountain',
        config: {
            boulderDensity: 25,
            gravelDensity: 4,
            pebbleDensity: 8,
            clusterProbability: 0.5,
            clusterSizeMin: 5,
            clusterSizeMax: 12,
            slopePreference: 0.8,
            altitudeRange: [500, 4000],
            erosionFactor: 0.4,
            rockTypes: ['granite', 'basalt']
        }
    },
    desert: {
        name: 'Desert',
        config: {
            boulderDensity: 8,
            gravelDensity: 2,
            pebbleDensity: 5,
            clusterProbability: 0.2,
            clusterSizeMin: 2,
            clusterSizeMax: 5,
            slopePreference: 0.3,
            altitudeRange: [0, 1500],
            erosionFactor: 0.7,
            rockTypes: ['sandstone', 'limestone']
        }
    },
    forest: {
        name: 'Forest',
        config: {
            boulderDensity: 12,
            gravelDensity: 3,
            pebbleDensity: 6,
            clusterProbability: 0.35,
            clusterSizeMin: 3,
            clusterSizeMax: 8,
            slopePreference: 0.5,
            altitudeRange: [0, 2000],
            erosionFactor: 0.5,
            rockTypes: ['granite', 'limestone', 'basalt']
        }
    },
    beach: {
        name: 'Beach',
        config: {
            boulderDensity: 3,
            gravelDensity: 5,
            pebbleDensity: 15,
            clusterProbability: 0.15,
            clusterSizeMin: 2,
            clusterSizeMax: 4,
            slopePreference: 0.1,
            altitudeRange: [-10, 50],
            erosionFactor: 0.9,
            rockTypes: ['sandstone', 'limestone']
        }
    },
    arctic: {
        name: 'Arctic',
        config: {
            boulderDensity: 20,
            gravelDensity: 2,
            pebbleDensity: 4,
            clusterProbability: 0.4,
            clusterSizeMin: 4,
            clusterSizeMax: 10,
            slopePreference: 0.7,
            altitudeRange: [0, 3000],
            erosionFactor: 0.3,
            rockTypes: ['granite', 'basalt']
        }
    }
};
// ============================================================================
// RockScatterSystem Class
// ============================================================================
export class RockScatterSystem {
    constructor(config) {
        // Default configuration
        this.config = {
            boulderDensity: 10,
            gravelDensity: 2,
            pebbleDensity: 4,
            clusterProbability: 0.3,
            clusterSizeMin: 3,
            clusterSizeMax: 8,
            clusterSpread: 3,
            sizeVariation: 0.4,
            boulderScaleMin: 0.5,
            boulderScaleMax: 3.0,
            gravelScaleMin: 0.05,
            gravelScaleMax: 0.3,
            altitudeRange: [-50, 3000],
            slopePreference: 0.5,
            erosionFactor: 0.6,
            rockTypes: this.getDefaultRockTypes(),
            useLOD: true,
            lodDistances: [20, 50, 100],
            maxInstances: 10000,
            ...config
        };
        this.rockGenerator = new RockGenerator({
            seed: Math.random() * 10000,
            boulderDensity: this.config.boulderDensity,
            gravelDensity: this.config.gravelDensity,
            clusterProbability: this.config.clusterProbability,
            clusterSize: [this.config.clusterSizeMin, this.config.clusterSizeMax],
            sizeVariation: this.config.sizeVariation,
            altitudeRange: this.config.altitudeRange,
            slopePreference: this.config.slopePreference,
            erosionFactor: this.config.erosionFactor,
            rockTypes: this.config.rockTypes
        });
        this.scatterSystem = new InstanceScatterSystem();
        this.noise = new NoiseUtils(this.config.rockTypes.length);
        this.instances = [];
        this.instancedMeshes = [];
        this.group = new THREE.Group();
    }
    /**
     * Get default rock types
     */
    getDefaultRockTypes() {
        return [
            {
                name: 'granite',
                colorBase: new THREE.Color(0.6, 0.55, 0.5),
                colorVariation: new THREE.Color(0.1, 0.08, 0.06),
                roughness: 0.8,
                metalness: 0.1,
                scaleMin: 0.5,
                scaleMax: 3.0,
            },
            {
                name: 'limestone',
                colorBase: new THREE.Color(0.75, 0.73, 0.7),
                colorVariation: new THREE.Color(0.08, 0.07, 0.06),
                roughness: 0.7,
                metalness: 0.05,
                scaleMin: 0.3,
                scaleMax: 2.5,
            },
            {
                name: 'basalt',
                colorBase: new THREE.Color(0.25, 0.23, 0.22),
                colorVariation: new THREE.Color(0.05, 0.04, 0.04),
                roughness: 0.9,
                metalness: 0.15,
                scaleMin: 0.4,
                scaleMax: 2.0,
            },
            {
                name: 'sandstone',
                colorBase: new THREE.Color(0.76, 0.7, 0.5),
                colorVariation: new THREE.Color(0.1, 0.08, 0.05),
                roughness: 0.85,
                metalness: 0.05,
                scaleMin: 0.3,
                scaleMax: 2.5,
            },
        ];
    }
    /**
     * Configure the scatter system
     */
    configure(config) {
        this.config = { ...this.config, ...config };
        // Update rock generator
        this.rockGenerator.updateConfig({
            seed: Math.random() * 10000,
            boulderDensity: this.config.boulderDensity,
            gravelDensity: this.config.gravelDensity,
            clusterProbability: this.config.clusterProbability,
            clusterSize: [this.config.clusterSizeMin, this.config.clusterSizeMax],
            sizeVariation: this.config.sizeVariation,
            altitudeRange: this.config.altitudeRange,
            slopePreference: this.config.slopePreference,
            erosionFactor: this.config.erosionFactor,
            rockTypes: this.config.rockTypes
        });
    }
    /**
     * Apply a biome preset
     */
    applyBiomePreset(biomeName) {
        const preset = ROCK_BIOME_PRESETS[biomeName.toLowerCase()];
        if (!preset) {
            console.warn(`Rock biome preset "${biomeName}" not found. Available: ${Object.keys(ROCK_BIOME_PRESETS).join(', ')}`);
            return;
        }
        // Merge preset config with current config
        const mergedConfig = { ...this.config, ...preset.config };
        // Override rock types if specified
        if (preset.config.rockTypes) {
            const typeMap = {};
            this.config.rockTypes.forEach(t => typeMap[t.name] = t);
            mergedConfig.rockTypes = preset.config.rockTypes
                .map(name => typeMap[name])
                .filter(Boolean);
        }
        this.configure(mergedConfig);
    }
    /**
     * Scatter rocks on terrain
     */
    scatter(positions, normals, heights, resolution, worldSize, erosionMap) {
        const startTime = performance.now();
        // Clear previous instances
        this.clear();
        // Generate rock instances
        this.instances = this.rockGenerator.generate(positions, normals, heights, resolution, worldSize, erosionMap);
        // Limit instances if needed
        if (this.instances.length > this.config.maxInstances) {
            // Prioritize boulders and clusters
            this.instances.sort((a, b) => {
                if (a.isCluster && !b.isCluster)
                    return -1;
                if (!a.isCluster && b.isCluster)
                    return 1;
                const scaleA = a.scale.length();
                const scaleB = b.scale.length();
                return scaleB - scaleA;
            });
            this.instances = this.instances.slice(0, this.config.maxInstances);
        }
        // Create instanced meshes
        this.createInstancedMeshes();
        // Add to group
        this.instancedMeshes.forEach(mesh => this.group.add(mesh));
        const computationTime = performance.now() - startTime;
        // Calculate statistics
        const stats = this.calculateStats(computationTime);
        return {
            group: this.group,
            instances: this.instances,
            stats
        };
    }
    /**
     * Create instanced meshes for rendering
     */
    createInstancedMeshes() {
        // Group instances by rock type
        const byType = new Map();
        this.instances.forEach(instance => {
            const existing = byType.get(instance.type.name) || [];
            existing.push(instance);
            byType.set(instance.type.name, existing);
        });
        // Create instanced mesh for each rock type
        byType.forEach((instances, typeName) => {
            const rockType = this.config.rockTypes.find(t => t.name === typeName);
            if (!rockType)
                return;
            // Create base geometry (simplified icosahedron for rocks)
            const geometry = this.createRockGeometry();
            // Create material
            const material = this.createRockMaterial(rockType);
            // Create instanced mesh
            const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Set instance matrices
            const matrix = new THREE.Matrix4();
            const quaternion = new THREE.Quaternion();
            instances.forEach((instance, i) => {
                quaternion.setFromEuler(instance.rotation);
                matrix.compose(instance.position, quaternion, instance.scale);
                mesh.setMatrixAt(i, matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            this.instancedMeshes.push(mesh);
        });
    }
    /**
     * Create simplified rock geometry
     */
    createRockGeometry() {
        // Use icosahedron as base for natural rock shape
        const geometry = new THREE.IcosahedronGeometry(1, 1);
        // Add some noise to vertices for irregularity
        const positionAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            const noise = this.noise.perlin3D(vertex.x * 2, vertex.y * 2, vertex.z * 2);
            const displacement = 1 + (noise - 0.5) * 0.3;
            vertex.multiplyScalar(displacement);
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create rock material
     */
    createRockMaterial(rockType) {
        // Add color variation
        const color = rockType.colorBase.clone();
        const variation = rockType.colorVariation;
        color.r += (Math.random() - 0.5) * variation.r;
        color.g += (Math.random() - 0.5) * variation.g;
        color.b += (Math.random() - 0.5) * variation.b;
        return new THREE.MeshStandardMaterial({
            color,
            roughness: rockType.roughness,
            metalness: rockType.metalness,
        });
    }
    /**
     * Calculate scatter statistics
     */
    calculateStats(computationTime) {
        const boulderCount = this.instances.filter(i => i.scale.length() > 1.0).length;
        const gravelCount = this.instances.filter(i => i.scale.length() < 0.5).length;
        const clusterCount = new Set(this.instances.filter(i => i.isCluster).map(i => i.clusterId)).size;
        return {
            totalInstances: this.instances.length,
            boulderCount,
            gravelCount,
            clusterCount,
            rockTypeDistribution: this.calculateTypeDistribution(),
            computationTime,
            memoryUsage: this.estimateMemoryUsage()
        };
    }
    /**
     * Calculate rock type distribution
     */
    calculateTypeDistribution() {
        const distribution = {};
        this.instances.forEach(instance => {
            distribution[instance.type.name] = (distribution[instance.type.name] || 0) + 1;
        });
        return distribution;
    }
    /**
     * Estimate memory usage
     */
    estimateMemoryUsage() {
        // Rough estimate: ~200 bytes per instance
        return this.instances.length * 200 / 1024 / 1024; // MB
    }
    /**
     * Clear all instances
     */
    clear() {
        this.instances = [];
        this.instancedMeshes.forEach(mesh => {
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.instancedMeshes = [];
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
    }
    /**
     * Get the group containing all rock meshes
     */
    getGroup() {
        return this.group;
    }
    /**
     * Get all instances
     */
    getInstances() {
        return [...this.instances];
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.configure(config);
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
export default RockScatterSystem;
//# sourceMappingURL=RockScatterSystem.js.map