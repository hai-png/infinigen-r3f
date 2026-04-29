import * as THREE from 'three';
import { InstancedMesh } from 'three';
/**
 * Grass Scatter System
 * Generates realistic grass fields using instanced meshes
 */
export class GrassScatterSystem {
    constructor(config) {
        this.mesh = null;
        this.dummy = new THREE.Object3D();
        this.time = 0;
        this.config = {
            density: 50,
            minSpacing: 0.1,
            maxSpacing: 0.3,
            bladeHeight: 0.3,
            bladeHeightVariation: 0.4,
            bladeWidth: 0.02,
            bladeSegments: 3,
            bladeColor: new THREE.Color(0x228b22),
            bladeColorVariation: 0.2,
            enableWind: true,
            windSpeed: 1.0,
            windStrength: 0.1,
            area: new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0, 10)),
            ...config
        };
    }
    /**
     * Generate grass field
     */
    generate() {
        const size = this.config.area.getSize(new THREE.Vector3());
        const areaSize = Math.max(size.x, size.z);
        const grassCount = Math.floor(areaSize * areaSize * this.config.density);
        // Create blade geometry
        const bladeGeometry = this.createBladeGeometry();
        // Create material with transparency
        const material = new THREE.MeshStandardMaterial({
            color: this.config.bladeColor,
            roughness: 0.8,
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });
        // Create instanced mesh
        this.mesh = new InstancedMesh(bladeGeometry, material, grassCount);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        // Position blades
        const positions = [];
        for (let i = 0; i < grassCount; i++) {
            let position;
            let attempts = 0;
            // Find valid position with minimum spacing
            do {
                position = new THREE.Vector3(this.config.area.min.x + Math.random() * size.x, this.config.area.min.y, this.config.area.min.z + Math.random() * size.z);
                attempts++;
            } while (this.isTooClose(position, positions, this.config.minSpacing) &&
                attempts < 10);
            if (attempts >= 10)
                continue;
            positions.push(position);
            // Set instance transform
            this.dummy.position.copy(position);
            // Random rotation around Y axis
            this.dummy.rotation.y = Math.random() * Math.PI * 2;
            // Random scale variation
            const heightScale = 1 + (Math.random() - 0.5) * this.config.bladeHeightVariation;
            const widthScale = 0.8 + Math.random() * 0.4;
            this.dummy.scale.set(widthScale, heightScale, 1);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
            // Color variation
            if (this.config.bladeColorVariation > 0) {
                const color = this.config.bladeColor.clone();
                const variation = (Math.random() - 0.5) * this.config.bladeColorVariation;
                color.offsetHSL(0, 0, variation);
                this.mesh.setColorAt(i, color);
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
        return this.mesh;
    }
    /**
     * Create individual grass blade geometry
     */
    createBladeGeometry() {
        const shape = new THREE.Shape();
        const w = this.config.bladeWidth;
        const h = this.config.bladeHeight;
        // Curved blade shape
        shape.moveTo(-w / 2, 0);
        shape.quadraticCurveTo(0, h * 0.3, w / 2, 0);
        shape.quadraticCurveTo(w / 4, h * 0.7, 0, h);
        shape.quadraticCurveTo(-w / 4, h * 0.7, -w / 2, 0);
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 0.001,
            bevelEnabled: false
        });
        // Center and rotate to stand upright
        geometry.center();
        geometry.rotateX(Math.PI / 2);
        return geometry;
    }
    /**
     * Check if position is too close to existing positions
     */
    isTooClose(position, positions, minDistance) {
        for (const existing of positions) {
            if (position.distanceTo(existing) < minDistance) {
                return true;
            }
        }
        return false;
    }
    /**
     * Update wind animation
     */
    update(deltaTime) {
        if (!this.mesh || !this.config.enableWind)
            return;
        this.time += deltaTime * this.config.windSpeed;
        const count = this.mesh.count;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        for (let i = 0; i < count; i++) {
            this.mesh.getMatrixAt(i, matrix);
            matrix.decompose(position, quaternion, scale);
            // Calculate wind effect based on position and time
            const windX = Math.sin(this.time + position.x * 0.5) * this.config.windStrength;
            const windZ = Math.cos(this.time + position.z * 0.3) * this.config.windStrength;
            // Apply bend rotation
            const bendQuaternion = new THREE.Quaternion();
            bendQuaternion.setFromEuler(new THREE.Euler(windX, 0, windZ));
            quaternion.multiply(bendQuaternion);
            matrix.compose(position, quaternion, scale);
            this.mesh.setMatrixAt(i, matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
    /**
     * Get grass mesh
     */
    getMesh() {
        return this.mesh;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
}
//# sourceMappingURL=GrassScatterSystem.js.map