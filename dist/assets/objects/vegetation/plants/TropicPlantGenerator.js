/**
 * TropicPlantGenerator - Generates tropical plants with large leaves
 *
 * This generator creates lush tropical vegetation including:
 * - Monstera deliciosa (Swiss cheese plant)
 * - Bird of Paradise (Strelitzia)
 * - Banana plants
 * - Philodendron
 * - Calathea
 * - Anthurium
 *
 * Features:
 * - Large, broad leaves with distinctive shapes
 * - Split and fenestrated leaf patterns
 * - Thick stems and aerial roots
 * - Dense clustering for jungle appearance
 */
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
export const TropicSpeciesPresets = {
    monstera: {
        height: 2.0,
        stemRadius: 0.04,
        leafSize: 1.2,
        leafCount: 12,
        leafSplitDepth: 0.7,
        leafFenestration: 0.6,
        leafWaviness: 0.3,
        leafDroop: 0.4,
        primaryColor: new THREE.Color(0x2d5a27),
        secondaryColor: new THREE.Color(0x1a3d16),
        variegation: 0.0,
        glossiness: 0.6,
        spiralAngle: Math.PI / 3,
        internodeLength: 0.15,
    },
    bird_of_paradise: {
        height: 2.5,
        stemRadius: 0.03,
        leafSize: 1.5,
        leafCount: 10,
        leafSplitDepth: 0.8,
        leafFenestration: 0.0,
        leafWaviness: 0.2,
        leafDroop: 0.5,
        primaryColor: new THREE.Color(0x3a6b35),
        secondaryColor: new THREE.Color(0x254d20),
        variegation: 0.0,
        glossiness: 0.5,
        spiralAngle: Math.PI / 4,
        internodeLength: 0.12,
    },
    banana: {
        height: 5.0,
        stemRadius: 0.15,
        leafSize: 2.0,
        leafCount: 8,
        leafSplitDepth: 0.3,
        leafFenestration: 0.0,
        leafWaviness: 0.4,
        leafDroop: 0.6,
        primaryColor: new THREE.Color(0x4a7a40),
        secondaryColor: new THREE.Color(0x305a2a),
        variegation: 0.0,
        glossiness: 0.4,
        spiralAngle: Math.PI / 2,
        internodeLength: 0.25,
    },
    philodendron: {
        height: 1.5,
        stemRadius: 0.02,
        leafSize: 0.8,
        leafCount: 15,
        leafSplitDepth: 0.0,
        leafFenestration: 0.0,
        leafWaviness: 0.2,
        leafDroop: 0.3,
        primaryColor: new THREE.Color(0x356030),
        secondaryColor: new THREE.Color(0x20401a),
        variegation: 0.15,
        glossiness: 0.7,
        spiralAngle: Math.PI / 3,
        internodeLength: 0.1,
    },
    calathea: {
        height: 0.8,
        stemRadius: 0.015,
        leafSize: 0.6,
        leafCount: 12,
        leafSplitDepth: 0.0,
        leafFenestration: 0.0,
        leafWaviness: 0.5,
        leafDroop: 0.2,
        primaryColor: new THREE.Color(0x406540),
        secondaryColor: new THREE.Color(0x2a452a),
        variegation: 0.4,
        glossiness: 0.5,
        spiralAngle: Math.PI / 4,
        internodeLength: 0.08,
    },
    anthurium: {
        height: 1.0,
        stemRadius: 0.02,
        leafSize: 0.7,
        leafCount: 10,
        leafSplitDepth: 0.0,
        leafFenestration: 0.0,
        leafWaviness: 0.3,
        leafDroop: 0.3,
        primaryColor: new THREE.Color(0x355535),
        secondaryColor: new THREE.Color(0x254025),
        variegation: 0.0,
        glossiness: 0.8,
        spiralAngle: Math.PI / 3,
        internodeLength: 0.1,
    },
    palm_small: {
        height: 3.0,
        stemRadius: 0.08,
        leafSize: 1.8,
        leafCount: 12,
        leafSplitDepth: 0.9,
        leafFenestration: 0.0,
        leafWaviness: 0.2,
        leafDroop: 0.7,
        primaryColor: new THREE.Color(0x3d6b38),
        secondaryColor: new THREE.Color(0x285023),
        variegation: 0.0,
        glossiness: 0.5,
        spiralAngle: Math.PI / 6,
        internodeLength: 0.08,
    },
};
const defaultConfig = {
    species: 'monstera',
    height: 2.0,
    stemRadius: 0.04,
    leafSize: 1.2,
    leafCount: 12,
    leafSplitDepth: 0.7,
    leafFenestration: 0.6,
    leafWaviness: 0.3,
    leafDroop: 0.4,
    primaryColor: new THREE.Color(0x2d5a27),
    secondaryColor: new THREE.Color(0x1a3d16),
    variegation: 0.0,
    glossiness: 0.6,
    spiralAngle: Math.PI / 3,
    internodeLength: 0.15,
    humidity: 0.8,
    lightExposure: 0.6,
};
export class TropicPlantGenerator {
    constructor(config = {}) {
        this.noise = createNoise3D();
        this.config = { ...defaultConfig, ...config };
        // Apply preset if species is specified
        if (config.species && TropicSpeciesPresets[config.species]) {
            this.config = {
                ...this.config,
                ...TropicSpeciesPresets[config.species],
                ...config,
            };
        }
    }
    /**
     * Generate a complete tropical plant
     */
    generate(position) {
        const group = new THREE.Group();
        if (position) {
            group.position.copy(position);
        }
        const { height, leafCount, spiralAngle, internodeLength } = this.config;
        // Generate main stem/trunk
        const stem = this.generateStem();
        group.add(stem);
        // Generate leaves in spiral pattern
        for (let i = 0; i < leafCount; i++) {
            const t = i / leafCount; // 0 to 1 along stem
            const y = t * height * 0.8;
            const angle = i * spiralAngle;
            const leaf = this.generateLeaf(t, angle);
            leaf.position.y = y;
            leaf.rotation.y = angle;
            group.add(leaf);
        }
        // Add aerial roots for certain species
        if (this.config.species === 'monstera' || this.config.species === 'philodendron') {
            const roots = this.generateAerialRoots();
            group.add(roots);
        }
        return group;
    }
    /**
     * Generate main stem
     */
    generateStem() {
        const { height, stemRadius, segments } = this.getConfigWithDefaults();
        const geometry = new THREE.CylinderGeometry(stemRadius * 0.8, stemRadius, height * 0.8, 8, 4);
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x4a3728),
            roughness: 0.9,
            metalness: 0.0,
        });
        const stem = new THREE.Mesh(geometry, material);
        stem.position.y = height * 0.4;
        return stem;
    }
    /**
     * Generate a single tropical leaf
     */
    generateLeaf(stemPosition, angle) {
        const group = new THREE.Group();
        // Create petiole (leaf stalk)
        const petiole = this.createPetiole();
        group.add(petiole);
        // Create leaf blade based on species
        const leafBlade = this.createLeafBlade();
        leafBlade.position.y = this.config.height * 0.1; // End of petiole
        group.add(leafBlade);
        return group;
    }
    /**
     * Create petiole (leaf stalk)
     */
    createPetiole() {
        const { stemRadius, leafSize } = this.config;
        const petioleLength = leafSize * 0.3;
        const geometry = new THREE.CylinderGeometry(stemRadius * 0.6, stemRadius * 0.8, petioleLength, 6);
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x3a5a30),
            roughness: 0.7,
            metalness: 0.0,
        });
        const petiole = new THREE.Mesh(geometry, material);
        petiole.position.y = petioleLength / 2;
        return petiole;
    }
    /**
     * Create leaf blade based on species
     */
    createLeafBlade() {
        const { species } = this.config;
        let geometry;
        switch (species) {
            case 'monstera':
                geometry = this.createMonsteraLeaf();
                break;
            case 'bird_of_paradise':
                geometry = this.createBirdOfParadiseLeaf();
                break;
            case 'banana':
                geometry = this.createBananaLeaf();
                break;
            case 'philodendron':
                geometry = this.createHeartShapedLeaf();
                break;
            case 'calathea':
                geometry = this.createOvalLeaf();
                break;
            case 'anthurium':
                geometry = this.createArrowLeaf();
                break;
            case 'palm_small':
                geometry = this.createPalmateLeaf();
                break;
            default:
                geometry = this.createGenericLeaf();
        }
        const material = this.createLeafMaterial();
        return new THREE.Mesh(geometry, material);
    }
    /**
     * Create Monstera leaf with characteristic splits and holes
     */
    createMonsteraLeaf() {
        const { leafSize, leafSplitDepth, leafFenestration, leafWaviness } = this.config;
        // Start with oval base
        const width = leafSize * 0.8;
        const length = leafSize * 1.2;
        const segments = 32;
        const geometry = new THREE.CircleGeometry(width, segments);
        const positions = geometry.attributes.position.array;
        // Scale to oval shape
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] *= length / width; // Stretch along X
        }
        // Apply splits along edges
        this.applyLeafSplits(geometry, leafSplitDepth);
        // Add fenestrations (holes)
        if (leafFenestration > 0) {
            this.addFenestrations(geometry, leafFenestration);
        }
        // Add edge waviness
        this.applyEdgeWave(geometry, leafWaviness);
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create Bird of Paradise leaf (large, paddle-shaped with splits)
     */
    createBirdOfParadiseLeaf() {
        const { leafSize, leafSplitDepth } = this.config;
        const width = leafSize * 0.6;
        const length = leafSize * 1.5;
        const geometry = new THREE.PlaneGeometry(width, length, 16, 32);
        const positions = geometry.attributes.position.array;
        // Shape into paddle form
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const t = (y + length / 2) / length;
            // Taper at both ends
            const widthFactor = Math.sin(t * Math.PI) * 0.8 + 0.2;
            positions[i] = x * widthFactor;
        }
        // Apply deep splits
        this.applyLeafSplits(geometry, Math.max(leafSplitDepth, 0.7));
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create Banana leaf (large, oblong with wavy edges)
     */
    createBananaLeaf() {
        const { leafSize, leafWaviness } = this.config;
        const width = leafSize * 0.8;
        const length = leafSize * 2.0;
        const geometry = new THREE.PlaneGeometry(width, length, 24, 32);
        const positions = geometry.attributes.position.array;
        // Shape and add characteristic midrib
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const t = (y + length / 2) / length;
            // Taper at ends
            const widthFactor = Math.sin(t * Math.PI) * 0.9 + 0.1;
            positions[i] = x * widthFactor;
            // Add slight curve
            positions[i + 2] = Math.sin(t * Math.PI) * length * 0.1;
        }
        // Wavy edges
        this.applyEdgeWave(geometry, Math.max(leafWaviness, 0.4));
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create heart-shaped leaf (Philodendron)
     */
    createHeartShapedLeaf() {
        const { leafSize } = this.config;
        const size = leafSize * 0.6;
        const segments = 64;
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * Math.PI * 2;
            // Heart shape parametric equation
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
            points.push(new THREE.Vector2(x, y).multiplyScalar(size * 0.05));
        }
        const shape = new THREE.Shape(points);
        const geometry = new THREE.ShapeGeometry(shape, 16);
        return geometry;
    }
    /**
     * Create oval leaf (Calathea)
     */
    createOvalLeaf() {
        const { leafSize } = this.config;
        const width = leafSize * 0.5;
        const length = leafSize * 0.8;
        // Use CircleGeometry scaled to create oval shape
        const geometry = new THREE.CircleGeometry(width, 32);
        const positions = geometry.attributes.position.array;
        // Scale along one axis to create ellipse
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] *= (length / width);
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create arrow-shaped leaf (Anthurium)
     */
    createArrowLeaf() {
        const { leafSize } = this.config;
        const shape = new THREE.Shape();
        const w = leafSize * 0.4;
        const l = leafSize * 0.7;
        shape.moveTo(0, l / 2);
        shape.quadraticCurveTo(w, 0, w * 0.3, -l / 2);
        shape.quadraticCurveTo(0, -l / 4, -w * 0.3, -l / 2);
        shape.quadraticCurveTo(-w, 0, 0, l / 2);
        const geometry = new THREE.ShapeGeometry(shape, 16);
        return geometry;
    }
    /**
     * Create palmate leaf (fan palm)
     */
    createPalmateLeaf() {
        const { leafSize, leafSplitDepth } = this.config;
        const radius = leafSize * 0.8;
        const segments = 64;
        const folds = 8;
        const geometry = new THREE.CircleGeometry(radius, segments);
        const positions = geometry.attributes.position.array;
        // Create fold lines radiating from center
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const angle = Math.atan2(y, x);
            const dist = Math.sqrt(x * x + y * y);
            // Create pleated effect
            const foldAngle = (Math.PI * 2) / folds;
            const localAngle = ((angle % foldAngle) + foldAngle) % foldAngle;
            const foldFactor = Math.cos((localAngle / foldAngle) * Math.PI);
            positions[i + 2] = foldFactor * dist * leafSplitDepth * 0.3;
        }
        // Deep splits at edges
        this.applyLeafSplits(geometry, 0.9);
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Create generic leaf as fallback
     */
    createGenericLeaf() {
        const { leafSize } = this.config;
        const width = leafSize * 0.5;
        const length = leafSize * 0.8;
        const geometry = new THREE.PlaneGeometry(width, length, 16, 16);
        return geometry;
    }
    /**
     * Apply splits along leaf edges
     */
    applyLeafSplits(geometry, depth) {
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        // Find edge vertices and pull them inward along split lines
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const dist = Math.sqrt(x * x + y * y);
            // Check if near edge
            if (dist > 0.7) {
                const angle = Math.atan2(y, x);
                // Create split pattern
                const splitPattern = Math.sin(angle * 10) * 0.5 + 0.5;
                if (splitPattern > 0.7) {
                    const pullIn = depth * (dist - 0.7);
                    positions[i] *= (1 - pullIn);
                    positions[i + 1] *= (1 - pullIn);
                }
            }
        }
        geometry.attributes.position.needsUpdate = true;
    }
    /**
     * Add fenestrations (holes) to leaf
     */
    addFenestrations(geometry, density) {
        // For simplicity, we'll modify vertex positions to create hole-like depressions
        // A more advanced implementation would use boolean operations or texture masks
        const positions = geometry.attributes.position.array;
        const holeCount = Math.floor(density * 5);
        const holes = [];
        for (let i = 0; i < holeCount; i++) {
            holes.push({
                x: (Math.random() - 0.5) * 0.8,
                y: (Math.random() - 0.5) * 0.6,
                radius: 0.05 + Math.random() * 0.1,
            });
        }
        // Create depressions around hole centers
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            for (const hole of holes) {
                const dx = x - hole.x;
                const dy = y - hole.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < hole.radius * 2) {
                    // Push vertices back to create depression
                    const factor = Math.pow(1 - dist / (hole.radius * 2), 2);
                    positions[i + 2] -= factor * 0.3;
                }
            }
        }
        geometry.attributes.position.needsUpdate = true;
    }
    /**
     * Apply wavy edge pattern
     */
    applyEdgeWave(geometry, amplitude) {
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const dist = Math.sqrt(x * x + y * y);
            // Only affect edge vertices
            if (dist > 0.6) {
                const angle = Math.atan2(y, x);
                const wave = Math.sin(angle * 8) * amplitude * 0.1;
                positions[i + 2] += wave;
            }
        }
        geometry.attributes.position.needsUpdate = true;
    }
    /**
     * Create leaf material with appropriate properties
     */
    createLeafMaterial() {
        const { primaryColor, secondaryColor, variegation, glossiness, lightExposure } = this.config;
        let color;
        if (variegation > 0) {
            // Create variegated pattern
            const t = Math.random() * variegation;
            color = new THREE.Color().lerpColors(primaryColor, secondaryColor, t);
        }
        else {
            color = primaryColor.clone();
        }
        // Adjust color based on light exposure
        if (lightExposure > 0.5) {
            color.multiplyScalar(0.8 + lightExposure * 0.4);
        }
        return new THREE.MeshStandardMaterial({
            color,
            roughness: 1.0 - glossiness * 0.8,
            metalness: 0.0,
            side: THREE.DoubleSide,
        });
    }
    /**
     * Generate aerial roots for climbing species
     */
    generateAerialRoots() {
        const group = new THREE.Group();
        const { height } = this.config;
        const rootCount = 5 + Math.floor(Math.random() * 5);
        for (let i = 0; i < rootCount; i++) {
            const y = Math.random() * height * 0.6;
            const angle = Math.random() * Math.PI * 2;
            const length = 0.2 + Math.random() * 0.4;
            const rootGeometry = new THREE.CylinderGeometry(0.005, 0.01, length, 6);
            const rootMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color(0x6b5344),
                roughness: 0.9,
            });
            const root = new THREE.Mesh(rootGeometry, rootMaterial);
            root.position.set(Math.cos(angle) * 0.05, y, Math.sin(angle) * 0.05);
            root.rotation.x = Math.PI / 3;
            root.rotation.z = angle;
            group.add(root);
        }
        return group;
    }
    /**
     * Get config with default segments value
     */
    getConfigWithDefaults() {
        return {
            ...this.config,
            segments: 8,
        };
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        // Re-apply preset if species changed
        if (config.species && TropicSpeciesPresets[config.species]) {
            this.config = {
                ...this.config,
                ...TropicSpeciesPresets[config.species],
            };
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
export default TropicPlantGenerator;
//# sourceMappingURL=TropicPlantGenerator.js.map