/**
 * PebbleGenerator - Small ground decoration stones
 *
 * Generates procedural pebbles and small stones for ground cover:
 * - Multiple size variations
 * - Natural shape irregularity
 * - Material diversity
 * - Optimized for instanced rendering
 */
import * as THREE from 'three';
import { NoiseUtils } from '../../terrain/utils/NoiseUtils';
// ============================================================================
// PebbleGenerator Class
// ============================================================================
export class PebbleGenerator {
    constructor(config = {}) {
        this.config = {
            sizeMin: 0.02,
            sizeMax: 0.08,
            count: 100,
            segments: 2,
            irregularity: 0.3,
            colors: [
                new THREE.Color(0x808080),
                new THREE.Color(0x7a7a7a),
                new THREE.Color(0x696969),
                new THREE.Color(0x8b7355),
                new THREE.Color(0xa0a0a0)
            ],
            roughness: 0.8,
            metalness: 0.1,
            spread: 1,
            seed: Math.random() * 10000,
            ...config
        };
        this.noise = new NoiseUtils(this.config.seed);
        this.baseGeometry = this.createBasePebbleGeometry();
    }
    /**
     * Create base pebble geometry
     */
    createBasePebbleGeometry() {
        const geometry = new THREE.IcosahedronGeometry(1, this.config.segments);
        this.applyIrregularity(geometry);
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Apply shape irregularity
     */
    applyIrregularity(geometry) {
        const positionAttribute = geometry.attributes.position;
        const vertex = new THREE.Vector3();
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            const direction = vertex.clone().normalize();
            const noiseValue = this.noise.perlin3D(vertex.x * 2, vertex.y * 2, vertex.z * 2);
            const displacement = 1 + (noiseValue - 0.5) * this.config.irregularity;
            vertex.copy(direction.multiplyScalar(displacement));
            positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
    }
    /**
     * Generate pebbles as instanced mesh
     */
    generate() {
        const material = new THREE.MeshStandardMaterial({
            roughness: this.config.roughness,
            metalness: this.config.metalness
        });
        const mesh = new THREE.InstancedMesh(this.baseGeometry, material, this.config.count);
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion();
        const color = new THREE.Color();
        for (let i = 0; i < this.config.count; i++) {
            // Random position within spread
            const x = (Math.random() - 0.5) * this.config.spread;
            const z = (Math.random() - 0.5) * this.config.spread;
            const y = 0;
            // Random rotation
            const rx = Math.random() * Math.PI;
            const ry = Math.random() * Math.PI * 2;
            const rz = Math.random() * Math.PI;
            // Random scale
            const scale = THREE.MathUtils.lerp(this.config.sizeMin, this.config.sizeMax, Math.random());
            // Select random color
            const colorIndex = Math.floor(Math.random() * this.config.colors.length);
            color.copy(this.config.colors[colorIndex]);
            // Set transform
            matrix.makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
            matrix.scale(new THREE.Vector3(scale, scale * 0.6, scale));
            matrix.setPosition(x, y, z);
            mesh.setMatrixAt(i, matrix);
            mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
    /**
     * Generate pebbles as individual instances
     */
    generateInstances() {
        const instances = [];
        for (let i = 0; i < this.config.count; i++) {
            const x = (Math.random() - 0.5) * this.config.spread;
            const z = (Math.random() - 0.5) * this.config.spread;
            const rx = Math.random() * Math.PI;
            const ry = Math.random() * Math.PI * 2;
            const rz = Math.random() * Math.PI;
            const scale = THREE.MathUtils.lerp(this.config.sizeMin, this.config.sizeMax, Math.random());
            const colorIndex = Math.floor(Math.random() * this.config.colors.length);
            instances.push({
                position: new THREE.Vector3(x, 0, z),
                rotation: new THREE.Euler(rx, ry, rz),
                scale: new THREE.Vector3(scale, scale * 0.6, scale),
                color: this.config.colors[colorIndex].clone()
            });
        }
        return instances;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.noise = new NoiseUtils(this.config.seed);
        this.baseGeometry.dispose();
        this.baseGeometry = this.createBasePebbleGeometry();
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Dispose resources
     */
    dispose() {
        this.baseGeometry.dispose();
    }
}
export default PebbleGenerator;
//# sourceMappingURL=PebbleGenerator.js.map