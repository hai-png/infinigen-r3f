import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';
export class CoralGenerator {
    /**
     * Generate coral geometry based on parameters
     */
    static generate(params = {}) {
        const config = {
            species: 'branching',
            size: 1.0,
            complexity: 0.7,
            colorVariation: 0.3,
            branchDensity: 0.5,
            polypDetail: true,
            health: 0.8,
            ...params
        };
        switch (config.species) {
            case 'branching':
                return this.generateBranchingCoral(config);
            case 'brain':
                return this.generateBrainCoral(config);
            case 'plate':
                return this.generatePlateCoral(config);
            case 'massive':
                return this.generateMassiveCoral(config);
            case 'soft':
                return this.generateSoftCoral(config);
            case 'tube':
                return this.generateTubeCoral(config);
            default:
                return this.generateBranchingCoral(config);
        }
    }
    /**
     * Generate branching coral (staghorn, elkhorn)
     */
    static generateBranchingCoral(config) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const branchCount = Math.floor(10 + config.branchDensity * 20);
        const segments = Math.floor(8 + config.complexity * 12);
        for (let i = 0; i < branchCount; i++) {
            const baseAngle = (i / branchCount) * Math.PI * 2;
            const height = config.size * (0.5 + Math.random() * 0.5);
            const branches = Math.floor(3 + config.branchDensity * 5);
            this.createBranch(positions, normals, uvs, new THREE.Vector3(Math.cos(baseAngle) * config.size * 0.3, 0, Math.sin(baseAngle) * config.size * 0.3), new THREE.Vector3(Math.cos(baseAngle) * 0.3 - Math.sin(baseAngle) * 0.2, 0.5, Math.sin(baseAngle) * 0.3 + Math.cos(baseAngle) * 0.2), height, segments, config.complexity);
            // Add secondary branches
            for (let j = 0; j < branches; j++) {
                const t = (j + 1) / (branches + 1);
                const offset = new THREE.Vector3((Math.random() - 0.5) * config.size * 0.4, height * t, (Math.random() - 0.5) * config.size * 0.4);
                this.createBranch(positions, normals, uvs, offset, new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5).normalize(), height * (0.3 + Math.random() * 0.3), segments, config.complexity * 0.7);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        return geometry;
    }
    static createBranch(positions, normals, uvs, origin, direction, length, segments, complexity) {
        const radius = 0.05 * config.size;
        const radialSegments = 8;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const noise = NoiseUtils.perlin3D(origin.x * 2 + t * 5, origin.y * 2, origin.z * 2 + t * 5) * complexity * 0.3;
            const currentRadius = radius * (1 - t * 0.5) * (1 + noise);
            const point = origin.clone().add(direction.clone().multiplyScalar(length * t));
            for (let j = 0; j <= radialSegments; j++) {
                const angle = (j / radialSegments) * Math.PI * 2;
                const perpendicular1 = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
                const perpendicular2 = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
                const vertex = point.clone()
                    .add(perpendicular1.multiplyScalar(currentRadius))
                    .add(perpendicular2.multiplyScalar(currentRadius));
                positions.push(vertex.x, vertex.y, vertex.z);
                const normal = vertex.clone().sub(point).normalize();
                normals.push(normal.x, normal.y, normal.z);
                uvs.push(j / radialSegments, t);
            }
        }
    }
    /**
     * Generate brain coral with maze-like surface
     */
    static generateBrainCoral(config) {
        const geometry = new THREE.SphereGeometry(config.size * 0.6, 64, 64);
        const positions = geometry.attributes.position.array;
        const noiseScale = 3 + config.complexity * 5;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            const noise = NoiseUtils.perlin3D(x * noiseScale, y * noiseScale, z * noiseScale);
            const displacement = 0.05 * config.size * (0.5 + noise);
            const scale = 1 + displacement / config.size;
            positions[i] *= scale;
            positions[i + 1] *= scale;
            positions[i + 2] *= scale;
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Generate plate/table coral
     */
    static generatePlateCoral(config) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const radius = config.size;
        const radialSegments = 64;
        const rings = Math.floor(10 + config.complexity * 10);
        for (let i = 0; i <= rings; i++) {
            const t = i / rings;
            const currentRadius = radius * t;
            const height = Math.sin(t * Math.PI) * config.size * 0.3;
            for (let j = 0; j <= radialSegments; j++) {
                const angle = (j / radialSegments) * Math.PI * 2;
                const x = Math.cos(angle) * currentRadius;
                const z = Math.sin(angle) * currentRadius;
                const y = height;
                positions.push(x, y, z);
                normals.push(0, 1, 0);
                uvs.push(j / radialSegments, t);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        return geometry;
    }
    /**
     * Generate massive/boulder coral
     */
    static generateMassiveCoral(config) {
        const geometry = new THREE.DodecahedronGeometry(config.size * 0.5, 2);
        const positions = geometry.attributes.position.array;
        const noiseScale = 2 + config.complexity * 3;
        for (let i = 0; i < positions.length; i += 3) {
            const noise = NoiseUtils.perlin3D(positions[i] * noiseScale, positions[i + 1] * noiseScale, positions[i + 2] * noiseScale);
            const displacement = 0.1 * config.size * noise;
            const scale = 1 + displacement / config.size;
            positions[i] *= scale;
            positions[i + 1] *= scale;
            positions[i + 2] *= scale;
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Generate soft coral/sea fan
     */
    static generateSoftCoral(config) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const width = config.size;
        const height = config.size * 0.8;
        const segments = 20;
        const branches = Math.floor(5 + config.branchDensity * 10);
        // Main fan structure
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = t * height;
            const w = width * Math.sin(t * Math.PI) * (0.5 + Math.random() * 0.3);
            for (let j = -10; j <= 10; j++) {
                const x = (j / 10) * w;
                const z = NoiseUtils.perlin3D(x * 2, y * 2, 0) * 0.1 * config.size;
                positions.push(x, y, z);
                normals.push(0, 0, 1);
                uvs.push((j + 10) / 20, t);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        return geometry;
    }
    /**
     * Generate tube coral
     */
    static generateTubeCoral(config) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const tubeCount = Math.floor(5 + config.branchDensity * 10);
        const tubeRadius = config.size * 0.1;
        const tubeHeight = config.size * 0.6;
        for (let i = 0; i < tubeCount; i++) {
            const centerX = (Math.random() - 0.5) * config.size;
            const centerZ = (Math.random() - 0.5) * config.size;
            const segments = 16;
            const rings = Math.floor(10 + config.complexity * 10);
            for (let j = 0; j <= rings; j++) {
                const t = j / rings;
                const y = t * tubeHeight;
                const radius = tubeRadius * (1 + Math.sin(t * Math.PI * 4) * 0.2);
                for (let k = 0; k <= segments; k++) {
                    const angle = (k / segments) * Math.PI * 2;
                    const x = centerX + Math.cos(angle) * radius;
                    const z = centerZ + Math.sin(angle) * radius;
                    positions.push(x, y, z);
                    const normal = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                    normals.push(normal.x, normal.y, normal.z);
                    uvs.push(k / segments, t);
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        return geometry;
    }
    /**
     * Get preset by name
     */
    static getPreset(name) {
        return this.presets[name.toLowerCase()] || null;
    }
    /**
     * Get all available presets
     */
    static getPresets() {
        return Object.values(this.presets);
    }
}
CoralGenerator.presets = {
    staghorn: {
        name: 'Staghorn Coral',
        params: {
            species: 'branching',
            size: 1.5,
            complexity: 0.8,
            branchDensity: 0.7,
            polypDetail: true,
            health: 0.9
        }
    },
    brainCoral: {
        name: 'Brain Coral',
        params: {
            species: 'brain',
            size: 1.2,
            complexity: 0.9,
            branchDensity: 0,
            polypDetail: false,
            health: 0.85
        }
    },
    plateCoral: {
        name: 'Plate Coral',
        params: {
            species: 'plate',
            size: 2.0,
            complexity: 0.6,
            branchDensity: 0.3,
            polypDetail: true,
            health: 0.95
        }
    },
    boulderCoral: {
        name: 'Boulder Coral',
        params: {
            species: 'massive',
            size: 1.8,
            complexity: 0.5,
            branchDensity: 0.1,
            polypDetail: false,
            health: 0.8
        }
    },
    seaFan: {
        name: 'Sea Fan',
        params: {
            species: 'soft',
            size: 1.6,
            complexity: 0.7,
            branchDensity: 0.5,
            polypDetail: true,
            health: 0.9
        }
    },
    bleached: {
        name: 'Bleached Coral',
        params: {
            species: 'branching',
            size: 1.3,
            complexity: 0.6,
            colorVariation: 0.1,
            health: 0.2
        }
    }
};
//# sourceMappingURL=CoralGenerator.js.map