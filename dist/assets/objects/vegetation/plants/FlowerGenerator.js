import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';
/**
 * Generates flower meshes with various types
 */
export class FlowerGenerator {
    constructor() {
        this.noiseUtils = new NoiseUtils();
        this.materialCache = new Map();
    }
    /**
     * Generate a single flower mesh
     */
    generateFlower(config = {}) {
        const finalConfig = {
            petalCount: 8,
            petalLength: 0.15,
            petalWidth: 0.08,
            stemHeight: 0.4 + Math.random() * 0.2,
            stemThickness: 0.02,
            colorBase: new THREE.Color(0xffffff),
            colorCenter: new THREE.Color(0xffdd00),
            leafCount: 2,
            variety: 'daisy',
            count: 1,
            spreadArea: { width: 1, depth: 1 },
            density: 1.0,
            ...config,
        };
        const group = new THREE.Group();
        // Create stem
        const stem = this.createStem(finalConfig);
        group.add(stem);
        // Create leaves
        for (let i = 0; i < finalConfig.leafCount; i++) {
            const leaf = this.createLeaf(finalConfig, i / finalConfig.leafCount);
            group.add(leaf);
        }
        // Create flower head (petals + center)
        const flowerHead = this.createFlowerHead(finalConfig);
        flowerHead.position.y = finalConfig.stemHeight;
        group.add(flowerHead);
        return group;
    }
    /**
     * Generate flower field with instanced rendering
     */
    generateFlowerField(config = {}) {
        const finalConfig = {
            petalCount: 6,
            petalLength: 0.12,
            petalWidth: 0.06,
            stemHeight: 0.35,
            stemThickness: 0.015,
            colorBase: new THREE.Color(0xff69b4),
            colorCenter: new THREE.Color(0xffff00),
            leafCount: 2,
            variety: 'mixed',
            count: 200,
            spreadArea: { width: 10, depth: 10 },
            density: 0.6,
            ...config,
        };
        // Create base flower geometry
        const baseGeometry = this.createSimpleFlowerGeometry(finalConfig);
        const material = this.getFlowerMaterial(finalConfig);
        const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, finalConfig.count);
        const dummy = new THREE.Object3D();
        let instanceIndex = 0;
        for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
            if (Math.random() > finalConfig.density)
                continue;
            const x = (Math.random() - 0.5) * finalConfig.spreadArea.width;
            const z = (Math.random() - 0.5) * finalConfig.spreadArea.depth;
            const scale = 0.8 + Math.random() * 0.4;
            dummy.position.set(x, 0, z);
            dummy.scale.set(scale, scale, scale);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        return instancedMesh;
    }
    /**
     * Create flower stem
     */
    createStem(config) {
        const geometry = new THREE.CylinderGeometry(config.stemThickness * 0.7, config.stemThickness, config.stemHeight, 6);
        const material = new THREE.MeshStandardMaterial({
            color: 0x2d5a1e,
            roughness: 0.7,
            metalness: 0.0,
        });
        const stem = new THREE.Mesh(geometry, material);
        stem.position.y = config.stemHeight / 2;
        return stem;
    }
    /**
     * Create leaf attached to stem
     */
    createLeaf(config, heightRatio) {
        const leafGeometry = new THREE.CircleGeometry(config.stemThickness * 3, 8);
        // Flatten and shape the leaf
        const positions = leafGeometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] *= 0.3; // Flatten
            positions[i + 2] *= 0.1; // Make thin
        }
        const material = new THREE.MeshStandardMaterial({
            color: 0x3d7a2e,
            roughness: 0.6,
            side: THREE.DoubleSide,
        });
        const leaf = new THREE.Mesh(leafGeometry, material);
        leaf.position.y = config.stemHeight * heightRatio;
        leaf.rotation.x = Math.PI / 2 - 0.3;
        leaf.rotation.z = Math.PI / 2;
        return leaf;
    }
    /**
     * Create flower head with petals and center
     */
    createFlowerHead(config) {
        const group = new THREE.Group();
        // Create petals based on variety
        const petalGeometry = this.createPetalGeometry(config);
        const petalMaterial = new THREE.MeshStandardMaterial({
            color: config.colorBase.clone(),
            roughness: 0.5,
            metalness: 0.0,
            side: THREE.DoubleSide,
        });
        for (let i = 0; i < config.petalCount; i++) {
            const angle = (i / config.petalCount) * Math.PI * 2;
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            petal.rotation.y = angle;
            petal.rotation.x = Math.PI / 4;
            group.add(petal);
        }
        // Create center
        const centerGeometry = new THREE.SphereGeometry(config.stemThickness * 2, 8, 8);
        const centerMaterial = new THREE.MeshStandardMaterial({
            color: config.colorCenter.clone(),
            roughness: 0.8,
        });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        group.add(center);
        return group;
    }
    /**
     * Create petal geometry based on flower variety
     */
    createPetalGeometry(config) {
        switch (config.variety) {
            case 'tulip':
                return this.createTulipPetal(config);
            case 'rose':
                return this.createRosePetal(config);
            case 'wildflower':
                return this.createWildflowerPetal(config);
            case 'daisy':
            default:
                return this.createDaisyPetal(config);
        }
    }
    createDaisyPetal(config) {
        const geometry = new THREE.CircleGeometry(config.petalLength, 8);
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] *= config.petalWidth / config.petalLength; // Elongate
            positions[i + 2] *= 0.05; // Thin
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    createTulipPetal(config) {
        const geometry = new THREE.CircleGeometry(config.petalLength, 8);
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] *= config.petalWidth / config.petalLength;
            positions[i + 2] *= 0.1;
            // Cup shape
            const x = positions[i];
            positions[i + 2] += Math.pow(x / config.petalWidth, 2) * 0.05;
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    createRosePetal(config) {
        const geometry = new THREE.CircleGeometry(config.petalLength, 12);
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] *= config.petalWidth / config.petalLength;
            positions[i + 2] *= 0.08;
            // Wavy edge
            const angle = Math.atan2(positions[i + 1], positions[i]);
            positions[i + 2] += Math.sin(angle * 3) * 0.02;
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    createWildflowerPetal(config) {
        const geometry = new THREE.CircleGeometry(config.petalLength * 0.8, 6);
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] *= (config.petalWidth / config.petalLength) * 1.2;
            positions[i + 2] *= 0.05;
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create simplified flower geometry for instanced rendering
     */
    createSimpleFlowerGeometry(config) {
        const geometry = new THREE.Group();
        // Simple representation: stem + flower head
        const stemGeo = new THREE.CylinderGeometry(config.stemThickness * 0.7, config.stemThickness, config.stemHeight, 6);
        const headGeo = new THREE.SphereGeometry(config.petalLength, 8, 8);
        headGeo.translate(0, config.stemHeight, 0);
        // Merge geometries (simplified approach)
        return stemGeo;
    }
    /**
     * Get flower material
     */
    getFlowerMaterial(config) {
        const cacheKey = `flower-${config.colorBase.getHex()}-${config.variety}`;
        if (this.materialCache.has(cacheKey)) {
            return this.materialCache.get(cacheKey);
        }
        const material = new THREE.MeshStandardMaterial({
            color: config.colorBase.clone(),
            roughness: 0.5,
            metalness: 0.0,
        });
        this.materialCache.set(cacheKey, material);
        return material;
    }
    /**
     * Clear material cache
     */
    dispose() {
        this.materialCache.forEach((material) => material.dispose());
        this.materialCache.clear();
    }
}
//# sourceMappingURL=FlowerGenerator.js.map