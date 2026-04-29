/**
 * BoulderGenerator - Large boulder and rock formation generator
 *
 * Generates large-scale boulder formations for terrain enhancement.
 * Uses procedural noise-based displacement for realistic rock surfaces.
 *
 * Features:
 * - Multiple boulder shapes (round, angular, flat, irregular)
 * - Size variation from 1m to 10m+ diameter
 * - Surface weathering and erosion effects
 * - Material variation (granite, limestone, sandstone, basalt)
 * - Instancing support for performance
 *
 * @module BoulderGenerator
 */
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
const DEFAULT_BOULDER_CONFIG = {
    type: 'irregular',
    size: 3.0,
    sizeVariation: 0.5,
    detailLevel: 3,
    displacementScale: 0.3,
    displacementDetail: 2.0,
    materialType: 'granite',
    colorVariation: 0.15,
    roughness: 0.8,
    metalness: 0.1,
    weatheringAmount: 0.3,
    erosionLevel: 0.2,
    mossCoverage: 0.0,
    rotationRandomization: Math.PI,
    scaleRandomization: 0.3
};
export class BoulderGenerator {
    constructor(config = {}) {
        this.noise = createNoise3D();
        this.config = { ...DEFAULT_BOULDER_CONFIG, ...config };
    }
    /**
     * Generate a single boulder mesh
     */
    generateBoulder(position) {
        const geometry = this.createBoulderGeometry();
        const material = this.createBoulderMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        if (position) {
            mesh.position.copy(position);
        }
        else {
            mesh.position.set(0, 0, 0);
        }
        // Apply random rotation
        if (this.config.rotationRandomization > 0) {
            mesh.rotation.x = Math.random() * this.config.rotationRandomization;
            mesh.rotation.y = Math.random() * this.config.rotationRandomization;
            mesh.rotation.z = Math.random() * this.config.rotationRandomization;
        }
        // Apply random scale
        if (this.config.scaleRandomization > 0) {
            const scale = 1 + (Math.random() - 0.5) * this.config.scaleRandomization;
            mesh.scale.setScalar(scale);
        }
        return mesh;
    }
    /**
     * Generate multiple boulders as instanced mesh
     */
    generateBoulderInstances(count, areaSize) {
        const baseGeometry = this.createBoulderGeometry();
        const material = this.createBoulderMaterial();
        const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, count);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            // Random position within area
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            const y = 0; // Should be placed on terrain surface
            dummy.position.set(x, y, z);
            // Random rotation
            dummy.rotation.x = Math.random() * Math.PI;
            dummy.rotation.y = Math.random() * Math.PI;
            dummy.rotation.z = Math.random() * Math.PI;
            // Random scale variation
            const scale = 1 + (Math.random() - 0.5) * this.config.sizeVariation;
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
            // Color variation
            const color = this.getMaterialColor(this.config.materialType);
            const variation = this.config.colorVariation;
            color.r *= 1 + (Math.random() - 0.5) * variation;
            color.g *= 1 + (Math.random() - 0.5) * variation;
            color.b *= 1 + (Math.random() - 0.5) * variation;
            instancedMesh.setColorAt(i, color);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }
        return instancedMesh;
    }
    /**
     * Create boulder geometry based on type
     */
    createBoulderGeometry() {
        let geometry;
        // Start with an icosahedron for organic shape
        const subdivisions = this.config.detailLevel;
        const radius = this.config.size;
        geometry = new THREE.IcosahedronGeometry(radius, subdivisions);
        // Apply shape-specific modifications
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        switch (this.config.type) {
            case 'round':
                this.makeRound(geometry, positions);
                break;
            case 'angular':
                this.makeAngular(geometry, positions);
                break;
            case 'flat':
                this.makeFlat(geometry, positions);
                break;
            case 'weathered':
                this.makeWeathered(geometry, positions, normals);
                break;
            case 'irregular':
            default:
                this.makeIrregular(geometry, positions, normals);
                break;
        }
        // Apply noise-based displacement for surface detail
        this.applyDisplacement(geometry, positions, normals);
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Make boulder more spherical/rounded
     */
    makeRound(geometry, positions) {
        // Normalize vertices to create more spherical shape
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const length = Math.sqrt(x * x + y * y + z * z);
            if (length > 0) {
                const scale = this.config.size / length;
                positions[i] = x * scale;
                positions[i + 1] = y * scale;
                positions[i + 2] = z * scale;
            }
        }
    }
    /**
     * Make boulder more angular with sharp edges
     */
    makeAngular(geometry, positions) {
        // Displace vertices along noise to create angular features
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const noise = this.noise(x * 0.5, y * 0.5, z * 0.5);
            const factor = 1 + noise * 0.3;
            positions[i] = x * factor;
            positions[i + 1] = y * factor;
            positions[i + 2] = z * factor;
        }
    }
    /**
     * Make boulder flatter (sedimentary rock style)
     */
    makeFlat(geometry, positions) {
        // Flatten along Y axis
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] *= 0.5; // Compress Y
        }
    }
    /**
     * Make boulder irregular with varied features
     */
    makeIrregular(geometry, positions, normals) {
        // Combine multiple noise frequencies for complex shape
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            // Multi-octave noise
            const noise1 = this.noise(x * 0.3, y * 0.3, z * 0.3);
            const noise2 = this.noise(x * 0.8, y * 0.8, z * 0.8) * 0.5;
            const noise3 = this.noise(x * 1.5, y * 1.5, z * 1.5) * 0.25;
            const combinedNoise = noise1 + noise2 + noise3;
            const factor = 1 + combinedNoise * this.config.displacementScale;
            positions[i] = x * factor;
            positions[i + 1] = y * factor;
            positions[i + 2] = z * factor;
        }
    }
    /**
     * Add weathering effects to boulder surface
     */
    makeWeathered(geometry, positions, normals) {
        // Erode surface based on normal direction (more erosion on top)
        for (let i = 0; i < positions.length; i += 3) {
            const nx = normals[i];
            const ny = normals[i + 1];
            const nz = normals[i + 2];
            // More erosion on upward-facing surfaces
            const erosionFactor = Math.max(0, ny) * this.config.erosionLevel;
            const noise = this.noise(positions[i] * 1.0, positions[i + 1] * 1.0, positions[i + 2] * 1.0);
            const displacement = noise * this.config.displacementScale * (1 - erosionFactor * 0.5);
            positions[i] += nx * displacement;
            positions[i + 1] += ny * displacement;
            positions[i + 2] += nz * displacement;
        }
    }
    /**
     * Apply detailed displacement to surface
     */
    applyDisplacement(geometry, positions, normals) {
        const detail = this.config.displacementDetail;
        const scale = this.config.displacementScale;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            // High-frequency noise for surface roughness
            const noise = this.noise(x * detail, y * detail, z * detail);
            // Get approximate normal
            const nx = normals[i];
            const ny = normals[i + 1];
            const nz = normals[i + 2];
            positions[i] += nx * noise * scale;
            positions[i + 1] += ny * noise * scale;
            positions[i + 2] += nz * noise * scale;
        }
    }
    /**
     * Create boulder material
     */
    createBoulderMaterial() {
        const baseColor = this.getMaterialColor(this.config.materialType);
        return new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: this.config.roughness,
            metalness: this.config.metalness,
            bumpScale: this.config.displacementScale * 0.5,
            side: THREE.FrontSide
        });
    }
    /**
     * Get base color for material type
     */
    getMaterialColor(type) {
        const colors = {
            granite: new THREE.Color(0x8b8b8b),
            limestone: new THREE.Color(0xd4c5b0),
            sandstone: new THREE.Color(0xc4a574),
            basalt: new THREE.Color(0x3d3d3d),
            slate: new THREE.Color(0x6b7b8c)
        };
        return colors[type].clone();
    }
    /**
     * Generate a boulder field
     */
    generateBoulderField(count, areaSize, terrainHeight) {
        const group = new THREE.Group();
        for (let i = 0; i < count; i++) {
            const boulder = this.generateBoulder();
            // Position in area
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            const y = terrainHeight ? terrainHeight(x, z) : 0;
            boulder.position.set(x, y, z);
            // Rotate to sit on surface
            boulder.rotation.x = Math.random() * Math.PI;
            boulder.rotation.y = Math.random() * Math.PI;
            boulder.rotation.z = Math.random() * Math.PI;
            // Scale variation
            const scale = 0.5 + Math.random() * 1.5;
            boulder.scale.setScalar(scale);
            group.add(boulder);
        }
        return group;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
export default BoulderGenerator;
//# sourceMappingURL=BoulderGenerator.js.map