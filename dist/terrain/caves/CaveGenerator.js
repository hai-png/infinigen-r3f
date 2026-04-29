/**
 * Cave Generation System
 * Implements asset-based cave generation with decorations, stalactites/stalagmites, and lighting
 */
import * as THREE from 'three';
import { SDFOperations } from '../sdf/SDFOperations';
export class CaveGenerator {
    constructor(params = {}) {
        this.decorations = [];
        this.perm = [];
        this.params = {
            density: 0.3,
            caveSize: 3.0,
            complexity: 0.5,
            enableStalactites: true,
            enableStalagmites: true,
            stalactiteDensity: 0.2,
            stalagmiteDensity: 0.2,
            enableDecorations: true,
            decorationDensity: 0.1,
            enableLighting: true,
            lightIntensity: 0.5,
            lightColor: new THREE.Color(0xffaa88),
            ...params,
        };
        this.sdfOps = new SDFOperations();
    }
    /**
     * Generate cave SDF by subtracting from terrain SDF
     */
    generateCaves(terrainSDF, width, height, depth) {
        const caveSDF = new Float32Array(width * height * depth);
        // Generate cave network using noise
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = z * width * height + y * width + x;
                    // Multi-scale noise for cave formation
                    const noise1 = this.perlinNoise(x / 20, y / 20, z / 20);
                    const noise2 = this.perlinNoise(x / 5, y / 5, z / 5) * 0.5;
                    const noise3 = this.perlinNoise(x / 2, y / 2, z / 2) * 0.25;
                    const combinedNoise = (noise1 + noise2 + noise3) / 1.75;
                    // Carve caves where noise exceeds threshold
                    const threshold = 1.0 - this.params.density;
                    const caveValue = combinedNoise > threshold ?
                        -(Math.abs(combinedNoise - threshold) * this.params.caveSize) :
                        1000;
                    caveSDF[idx] = caveValue;
                }
            }
        }
        // Combine with terrain SDF (subtractive operation)
        const result = new Float32Array(terrainSDF.length);
        for (let i = 0; i < terrainSDF.length; i++) {
            result[i] = Math.min(terrainSDF[i], caveSDF[i]);
        }
        return result;
    }
    /**
     * Generate cave decorations
     */
    generateDecorations(caveMesh, bounds) {
        this.decorations = [];
        if (this.params.enableStalactites) {
            this.generateStalactites(bounds);
        }
        if (this.params.enableStalagmites) {
            this.generateStalagmites(bounds);
        }
        if (this.params.enableDecorations) {
            this.generateAdditionalDecorations(bounds);
        }
        return this.decorations;
    }
    generateStalactites(bounds) {
        const count = Math.floor(this.params.stalactiteDensity *
            (bounds.max.x - bounds.min.x) *
            (bounds.max.z - bounds.min.z));
        for (let i = 0; i < count; i++) {
            const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
            const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
            const y = bounds.max.y - 0.1; // Near ceiling
            const height = 0.5 + Math.random() * 2.0;
            const radius = 0.1 + Math.random() * 0.3;
            this.decorations.push({
                type: 'stalactite',
                position: new THREE.Vector3(x, y, z),
                rotation: new THREE.Euler(Math.PI, 0, 0), // Point downward
                scale: new THREE.Vector3(radius, height, radius),
            });
        }
    }
    generateStalagmites(bounds) {
        const count = Math.floor(this.params.stalagmiteDensity *
            (bounds.max.x - bounds.min.x) *
            (bounds.max.z - bounds.min.z));
        for (let i = 0; i < count; i++) {
            const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
            const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
            const y = bounds.min.y + 0.1; // Near floor
            const height = 0.3 + Math.random() * 1.5;
            const radius = 0.1 + Math.random() * 0.4;
            this.decorations.push({
                type: 'stalagmite',
                position: new THREE.Vector3(x, y, z),
                rotation: new THREE.Euler(0, 0, 0),
                scale: new THREE.Vector3(radius, height, radius),
            });
        }
    }
    generateAdditionalDecorations(bounds) {
        const decorationTypes = ['crystal', 'rock', 'puddle'];
        const totalArea = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
        const count = Math.floor(this.params.decorationDensity * totalArea);
        for (let i = 0; i < count; i++) {
            const type = decorationTypes[Math.floor(Math.random() * decorationTypes.length)];
            const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
            const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
            const y = bounds.min.y + 0.05 + Math.random() * (bounds.max.y - bounds.min.y - 0.1);
            const scale = 0.2 + Math.random() * 0.8;
            this.decorations.push({
                type,
                position: new THREE.Vector3(x, y, z),
                rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
                scale: new THREE.Vector3(scale, scale, scale),
            });
        }
    }
    /**
     * Create geometry for decorations
     */
    createDecorationGeometry(decoration) {
        switch (decoration.type) {
            case 'stalactite':
            case 'stalagmite':
                return new THREE.ConeGeometry(1, 1, 8, 1);
            case 'crystal':
                return new THREE.OctahedronGeometry(1, 0);
            case 'rock':
                return new THREE.DodecahedronGeometry(1, 0);
            case 'puddle':
                return new THREE.CircleGeometry(1, 16);
            default:
                return new THREE.SphereGeometry(1, 8, 8);
        }
    }
    /**
     * Create instanced mesh for all decorations
     */
    createInstancedMesh(scene) {
        const totalDecorations = this.decorations.length;
        if (totalDecorations === 0) {
            return new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshStandardMaterial({ color: 0x888888 }), 0);
        }
        // Group decorations by type for efficient instancing
        const byType = new Map();
        for (const dec of this.decorations) {
            const key = dec.type;
            if (!byType.has(key)) {
                byType.set(key, []);
            }
            byType.get(key).push(dec);
        }
        // Create first type as main mesh (simplified - would need multiple meshes in production)
        const firstType = Array.from(byType.entries())[0];
        const geometry = this.createDecorationGeometry(firstType[1][0]);
        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.9,
            metalness: 0.1,
        });
        const mesh = new THREE.InstancedMesh(geometry, material, totalDecorations);
        let idx = 0;
        for (const [type, decals] of byType) {
            for (const dec of decals) {
                const matrix = new THREE.Matrix4();
                matrix.compose(dec.position, dec.rotation, dec.scale);
                mesh.setMatrixAt(idx++, matrix);
            }
        }
        scene.add(mesh);
        return mesh;
    }
    /**
     * Create cave lighting
     */
    createLighting(scene, bounds) {
        if (!this.params.enableLighting)
            return;
        // Add point lights throughout the cave
        const lightCount = Math.max(3, Math.floor((bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z) / 50));
        for (let i = 0; i < lightCount; i++) {
            const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
            const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
            const y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.7;
            const light = new THREE.PointLight(this.params.lightColor, this.params.lightIntensity, 15);
            light.position.set(x, y, z);
            scene.add(light);
        }
    }
    /**
     * Update parameters
     */
    setParams(params) {
        this.params = { ...this.params, ...params };
    }
    /**
     * Get decorations
     */
    getDecorations() {
        return this.decorations;
    }
    /**
     * Simple Perlin-like noise function
     */
    perlinNoise(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        const A = this.perm[X] + Y;
        const AA = this.perm[A] + Z;
        const AB = this.perm[A + 1] + Z;
        const B = this.perm[X + 1] + Y;
        const BA = this.perm[B] + Z;
        const BB = this.perm[B + 1] + Z;
        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.perm[AA], x, y, z), this.grad(this.perm[BA], x - 1, y, z)), this.lerp(u, this.grad(this.perm[AB], x, y - 1, z), this.grad(this.perm[BB], x - 1, y - 1, z))), this.lerp(v, this.lerp(u, this.grad(this.perm[AA + 1], x, y, z - 1), this.grad(this.perm[BA + 1], x - 1, y, z - 1)), this.lerp(u, this.grad(this.perm[AB + 1], x, y - 1, z - 1), this.grad(this.perm[BB + 1], x - 1, y - 1, z - 1))));
    }
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    lerp(t, a, b) {
        return a + t * (b - a);
    }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}
export default CaveGenerator;
//# sourceMappingURL=CaveGenerator.js.map