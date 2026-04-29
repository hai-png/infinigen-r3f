import * as THREE from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';
/**
 * Pine debris types for coniferous forest floors
 */
export var PineDebrisType;
(function (PineDebrisType) {
    PineDebrisType["NEEDLE_CARPET"] = "needle_carpet";
    PineDebrisType["LOOSE_NEEDLES"] = "loose_needles";
    PineDebrisType["PINECONE_SMALL"] = "pinecone_small";
    PineDebrisType["PINECONE_MEDIUM"] = "pinecone_medium";
    PineDebrisType["PINECONE_LARGE"] = "pinecone_large";
    PineDebrisType["MIXED"] = "mixed";
})(PineDebrisType || (PineDebrisType = {}));
/**
 * Pine cone characteristics
 */
export var PineConeState;
(function (PineConeState) {
    PineConeState["CLOSED"] = "closed";
    PineConeState["OPEN"] = "open";
    PineConeState["AGED"] = "aged";
    PineConeState["DAMAGED"] = "damaged"; // Broken scales
})(PineConeState || (PineConeState = {}));
/**
 * Generates pine needle carpets and pinecone scatter for coniferous forests
 */
export class PineDebrisGenerator {
    /**
     * Generate pine needle carpet with instanced rendering
     */
    static generateNeedleCarpet(config) {
        const needleCount = Math.floor(config.density * config.area.x * config.area.y * 10);
        const geometry = this.createNeedleGeometry();
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.InstancedMesh(geometry, material, needleCount);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < needleCount; i++) {
            const x = (Math.random() - 0.5) * config.area.x;
            const z = (Math.random() - 0.5) * config.area.y;
            const y = this.calculateHeight(x, z, config.area);
            dummy.position.set(x, y, z);
            // Needles lie flat with slight variation
            dummy.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.1);
            // Scale variation for natural look
            const scale = 0.8 + Math.random() * 0.4;
            dummy.scale.set(scale * 0.1, scale, scale * 0.1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            // Color variation
            const colorIndex = Math.floor(Math.random() * PineDebrisGenerator.NEEDLE_COLORS.length);
            const color = PineDebrisGenerator.NEEDLE_COLORS[colorIndex].clone();
            if (config.needleColorVariation) {
                color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
            }
            mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        return mesh;
    }
    /**
     * Generate pinecones with instanced rendering
     */
    static generatePinecones(config) {
        const coneCount = Math.floor(config.density * config.area.x * config.area.y * 0.1);
        const geometry = this.createPineconeGeometry(config.pineConeState || PineConeState.OPEN);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8
        });
        const mesh = new THREE.InstancedMesh(geometry, material, coneCount);
        const dummy = new THREE.Object3D();
        const colors = PineDebrisGenerator.PINECONE_COLORS[config.pineConeState || PineConeState.OPEN];
        for (let i = 0; i < coneCount; i++) {
            const x = (Math.random() - 0.5) * config.area.x;
            const z = (Math.random() - 0.5) * config.area.y;
            const y = this.calculateHeight(x, z, config.area);
            dummy.position.set(x, y, z);
            // Random rotation
            dummy.rotation.set((Math.random() - 0.5) * Math.PI, Math.random() * Math.PI * 2, (Math.random() - 0.5) * Math.PI);
            // Size variation
            const scale = config.coneSizeVariation ? 0.7 + Math.random() * 0.6 : 1.0;
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            // Color variation
            const colorIndex = Math.floor(Math.random() * colors.length);
            const color = colors[colorIndex].clone();
            color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
            mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor)
            mesh.instanceColor.needsUpdate = true;
        return mesh;
    }
    /**
     * Create individual pine needle geometry
     */
    static createNeedleGeometry() {
        // Pine needles are thin, elongated cylinders
        const geometry = new THREE.CylinderGeometry(0.005, 0.003, 0.15, 6);
        geometry.rotateX(Math.PI / 2);
        // Add slight curve using vertex displacement
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const noise = NoiseUtils.perlin2D(x * 10, 0) * 0.005;
            positions[i + 1] += noise;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create pinecone geometry with scale detail
     */
    static createPineconeGeometry(state) {
        const group = new THREE.Group();
        // Central core
        const coreGeometry = new THREE.CylinderGeometry(0.03, 0.02, 0.15, 8);
        const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6f47 });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.rotation.x = Math.PI / 2;
        group.add(core);
        // Scales arranged in spiral pattern
        const scaleCount = state === PineConeState.CLOSED ? 30 : 20;
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
        for (let i = 0; i < scaleCount; i++) {
            const angle = i * goldenAngle;
            const height = (i / scaleCount - 0.5) * 0.12;
            const radius = state === PineConeState.OPEN ? 0.06 : 0.035;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const scaleGeometry = new THREE.ConeGeometry(0.015, 0.03, 5);
            const scaleMaterial = new THREE.MeshStandardMaterial({
                color: 0xa08060,
                roughness: 0.9
            });
            const scale = new THREE.Mesh(scaleGeometry, scaleMaterial);
            scale.position.set(x, height, z);
            scale.lookAt(new THREE.Vector3(0, height, 0));
            // Open scales point outward more
            if (state === PineConeState.OPEN) {
                scale.rotateX(Math.PI / 6);
            }
            // Add weathering for aged cones
            if (state === PineConeState.AGED || state === PineConeState.DAMAGED) {
                scale.scale.multiplyScalar(0.9 + Math.random() * 0.2);
                if (state === PineConeState.DAMAGED && Math.random() > 0.7) {
                    scale.scale.setScalar(0.5); // Broken scale
                }
            }
            group.add(scale);
        }
        // Merge geometries for better performance
        const mergedGeometry = this.mergeGroupGeometries(group);
        group.clear();
        return mergedGeometry || new THREE.SphereGeometry(0.05, 8, 8);
    }
    /**
     * Helper to merge group geometries (simplified)
     */
    static mergeGroupGeometries(group) {
        // In production, use BufferGeometryUtils.mergeGeometries
        // For now, return a simplified representation
        return new THREE.SphereGeometry(0.05, 8, 8);
    }
    /**
     * Calculate height based on terrain
     */
    static calculateHeight(x, z, area) {
        const normalizedX = (x / area.x + 0.5) * 10;
        const normalizedZ = (z / area.y + 0.5) * 10;
        return NoiseUtils.perlin2D(normalizedX, normalizedZ) * 0.02;
    }
    /**
     * Generate complete pine debris field (needles + cones)
     */
    static generateMixedDebris(config) {
        const group = new THREE.Group();
        // Generate needle carpet
        const needleConfig = {
            ...config,
            debrisType: PineDebrisType.NEEDLE_CARPET
        };
        const needles = this.generateNeedleCarpet(needleConfig);
        group.add(needles);
        // Generate pinecones
        const coneConfig = {
            ...config,
            debrisType: PineDebrisType.PINECONE_MEDIUM,
            density: config.density * 0.1
        };
        const cones = this.generatePinecones(coneConfig);
        group.add(cones);
        // Add seed dispersal around cones if enabled
        if (config.seedDispersal) {
            const seeds = this.generateSeeds(config);
            group.add(seeds);
        }
        return group;
    }
    /**
     * Generate scattered pine seeds around cones
     */
    static generateSeeds(config) {
        const seedCount = Math.floor(config.density * config.area.x * config.area.y * 0.5);
        const geometry = new THREE.CapsuleGeometry(0.005, 0.02, 4, 4);
        const material = new THREE.MeshStandardMaterial({
            color: 0x6b5344,
            roughness: 0.7
        });
        const mesh = new THREE.InstancedMesh(geometry, material, seedCount);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < seedCount; i++) {
            const x = (Math.random() - 0.5) * config.area.x;
            const z = (Math.random() - 0.5) * config.area.y;
            const y = this.calculateHeight(x, z, config.area);
            dummy.position.set(x, y, z);
            dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI);
            dummy.scale.setScalar(0.5 + Math.random() * 0.5);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }
    /**
     * Generate dense needle clusters under trees
     */
    static generateNeedleClusters(config, clusterCount) {
        const group = new THREE.Group();
        for (let i = 0; i < clusterCount; i++) {
            const clusterConfig = {
                ...config,
                area: new THREE.Vector2(0.8, 0.8),
                density: config.density * 3
            };
            const cluster = this.generateNeedleCarpet(clusterConfig);
            const x = (Math.random() - 0.5) * config.area.x * 0.8;
            const z = (Math.random() - 0.5) * config.area.y * 0.8;
            cluster.position.set(x, 0, z);
            group.add(cluster);
        }
        return group;
    }
}
PineDebrisGenerator.NEEDLE_COLORS = [
    new THREE.Color(0x3d5c2f), // Dark green
    new THREE.Color(0x4a6b3a), // Medium green
    new THREE.Color(0x5c7f4a), // Light green
    new THREE.Color(0x6b8f5a), // Yellow-green
    new THREE.Color(0x8b7355) // Brown (dead needles)
];
PineDebrisGenerator.PINECONE_COLORS = {
    [PineConeState.CLOSED]: [
        new THREE.Color(0x8b6f47), new THREE.Color(0x9c7f57)
    ],
    [PineConeState.OPEN]: [
        new THREE.Color(0xa08060), new THREE.Color(0xb09070)
    ],
    [PineConeState.AGED]: [
        new THREE.Color(0x6b5344), new THREE.Color(0x5a4635)
    ],
    [PineConeState.DAMAGED]: [
        new THREE.Color(0x7a6251), new THREE.Color(0x6b5344)
    ]
};
//# sourceMappingURL=PineDebrisGenerator.js.map