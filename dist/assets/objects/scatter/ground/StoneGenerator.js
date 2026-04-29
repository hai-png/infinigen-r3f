import * as THREE from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';
/**
 * Generates individual stone meshes for scatter systems
 * Distinct from pebbles by being larger, more detailed, and often unique
 */
export class StoneGenerator {
    constructor() {
        this.noiseUtils = new NoiseUtils();
        this.materialCache = new Map();
    }
    /**
     * Generate a single detailed stone mesh
     */
    generateStone(config = {}) {
        const finalConfig = {
            size: 0.8 + Math.random() * 1.2,
            variation: 0.3,
            roughness: 0.7 + Math.random() * 0.3,
            colorBase: new THREE.Color(0x888888),
            colorVariation: new THREE.Color(0x444444),
            mossChance: 0.15,
            wetChance: 0.1,
            count: 1,
            spreadRadius: 0,
            ...config,
        };
        const geometry = this.createStoneGeometry(finalConfig);
        const material = this.getStoneMaterial(finalConfig);
        const mesh = new THREE.Mesh(geometry, material);
        // Apply random rotation for natural look
        mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        return mesh;
    }
    /**
     * Generate multiple stones arranged in a cluster
     */
    generateStoneCluster(config) {
        const group = new THREE.Group();
        const clusterConfig = {
            size: 1.0,
            variation: 0.4,
            roughness: 0.8,
            colorBase: new THREE.Color(0x999999),
            colorVariation: new THREE.Color(0x555555),
            mossChance: 0.2,
            wetChance: 0.15,
            count: 1,
            spreadRadius: 0,
            clusterSize: 10,
            ...config,
        };
        for (let i = 0; i < clusterConfig.clusterSize; i++) {
            const stone = this.generateStone({
                size: clusterConfig.size * (0.5 + Math.random() * 0.8),
                variation: clusterConfig.variation,
                roughness: clusterConfig.roughness,
                colorBase: clusterConfig.colorBase.clone(),
                colorVariation: clusterConfig.colorVariation.clone(),
                mossChance: clusterConfig.mossChance,
                wetChance: clusterConfig.wetChance,
            });
            // Position in a circular cluster
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * clusterConfig.spreadRadius;
            stone.position.set(Math.cos(angle) * radius, Math.random() * 0.2, // Slight height variation
            Math.sin(angle) * radius);
            group.add(stone);
        }
        return group;
    }
    /**
     * Create irregular stone geometry using noise displacement
     */
    createStoneGeometry(config) {
        const detail = 16;
        const geometry = new THREE.IcosahedronGeometry(config.size, 2);
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        // Displace vertices using noise for irregular shape
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const noiseValue = this.noiseUtils.perlin2D(x * 0.5 + y * 0.5, z * 0.5);
            const displacement = 1 + (noiseValue * config.variation);
            positions[i] *= displacement;
            positions[i + 1] *= displacement;
            positions[i + 2] *= displacement;
            // Flatten bottom slightly for stability
            if (positions[i + 1] < -config.size * 0.3) {
                positions[i + 1] = -config.size * 0.3 * (0.8 + Math.random() * 0.2);
            }
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Get or create material for stone
     */
    getStoneMaterial(config) {
        const cacheKey = `${config.colorBase.getHex()}-${config.roughness}-${config.mossChance}`;
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }
        const material = new THREE.MeshStandardMaterial({
            color: config.colorBase.clone(),
            roughness: config.roughness,
            metalness: 0.1,
            flatShading: Math.random() > 0.5,
        });
        // Add color variation through vertex colors if needed
        if (config.mossChance > 0 || config.wetChance > 0) {
            // Could implement vertex color painting here for moss/wet spots
            // For now, we rely on texture or shader modifications
        }
        this.materialCache.set(cacheKey, material);
        return material;
    }
    /**
     * Generate standing stones (monoliths)
     */
    generateStandingStone(height = 3.0) {
        const width = height * (0.3 + Math.random() * 0.2);
        const depth = width * (0.4 + Math.random() * 0.3);
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const positions = geometry.attributes.position.array;
        // Erode edges with noise
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const noise = this.noiseUtils.perlin2D(x * 0.3 + z * 0.3, y * 0.3);
            const erosion = 1 - (Math.abs(noise) * 0.15);
            if (Math.abs(x) > width * 0.4)
                positions[i] *= erosion;
            if (Math.abs(z) > depth * 0.4)
                positions[i + 2] *= erosion;
        }
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
            color: 0x7a7a7a,
            roughness: 0.9,
            metalness: 0.05,
            flatShading: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = height / 2;
        return mesh;
    }
    /**
     * Clear material cache to free memory
     */
    dispose() {
        this.materialCache.forEach((material) => material.dispose());
        this.materialCache.clear();
    }
}
//# sourceMappingURL=StoneGenerator.js.map