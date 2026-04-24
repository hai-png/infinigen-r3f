/**
 * PillowFactory - Procedural pillow generator
 *
 * Ported from Infinigen's PillowFactory (Princeton VL)
 * Generates varied pillow shapes with configurable seams and materials
 */
import * as THREE from 'three';
import { AssetFactory } from '../../utils/AssetFactory';
import { SeededRandom, weightedSample } from '../../../../core/util/MathUtils';
/**
 * Procedural pillow generator with multiple shape options
 */
export class PillowFactory extends AssetFactory {
    constructor(seed) {
        super(seed);
        this.shapes = ['square', 'rectangle', 'circle', 'torus'];
        this.shapeWeights = [4, 4, 1, 1];
    }
    /**
     * Generate random pillow configuration
     */
    generateConfig() {
        const rng = new SeededRandom(this.seed);
        const shape = weightedSample(this.shapes, rng, this.shapeWeights);
        const width = rng.uniform(0.4, 0.7);
        const size = shape === 'square'
            ? width
            : width * rng.logUniform(0.6, 0.8);
        return {
            shape,
            width,
            size,
            thickness: rng.logUniform(0.006, 0.008),
            bevelWidth: rng.uniform(0.02, 0.05),
            extrudeThickness: rng.uniform() < 0.5
                ? rng.logUniform(0.006, 0.008) * rng.logUniform(1, 8)
                : 0,
            hasSeam: rng.uniform() < 0.3 && shape !== 'torus',
            seamRadius: rng.uniform(0.01, 0.02),
        };
    }
    /**
     * Create pillow from configuration
     */
    create(config) {
        let geometry;
        switch (config.shape) {
            case 'circle':
                geometry = this.createCircleGeometry(config);
                break;
            case 'torus':
                geometry = this.createTorusGeometry(config);
                break;
            case 'rectangle':
                geometry = this.createRectangleGeometry(config);
                break;
            default: // square
                geometry = this.createSquareGeometry(config);
        }
        const material = this.createFabricMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        return {
            mesh,
            config,
            material,
        };
    }
    /**
     * Create square pillow geometry
     */
    createSquareGeometry(config) {
        const geometry = new THREE.BoxGeometry(config.width + config.bevelWidth * 2, config.thickness + config.extrudeThickness, config.size + config.bevelWidth * 2, 8, 1, 8);
        // Add bevel effect by modifying vertices
        this.applyBevel(geometry, config.bevelWidth);
        // Add seam if requested
        if (config.hasSeam) {
            this.addSeam(geometry, config);
        }
        return geometry;
    }
    /**
     * Create rectangle pillow geometry
     */
    createRectangleGeometry(config) {
        return this.createSquareGeometry(config);
    }
    /**
     * Create circle pillow geometry
     */
    createCircleGeometry(config) {
        const radius = config.width / 2;
        const segments = 64;
        // Create circular shape using cylinder with very low height
        const geometry = new THREE.CylinderGeometry(radius, radius, config.thickness + config.extrudeThickness, segments, 1, false);
        // Rotate to lie flat
        geometry.rotateX(Math.PI / 2);
        if (config.hasSeam) {
            this.addSeam(geometry, config);
        }
        return geometry;
    }
    /**
     * Create torus (donut) pillow geometry
     */
    createTorusGeometry(config) {
        const outerRadius = config.width / 2;
        const innerRadius = outerRadius * this.rng.uniform(0.2, 0.4);
        const tubeRadius = (outerRadius - innerRadius) / 2;
        const geometry = new THREE.TorusGeometry((outerRadius + innerRadius) / 2, tubeRadius, 32, 64);
        return geometry;
    }
    /**
     * Apply bevel effect to geometry edges
     */
    applyBevel(geometry, bevelWidth) {
        const positionAttribute = geometry.attributes.position;
        const positions = positionAttribute.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            // Soften corners based on distance from center
            const dist = Math.sqrt(x * x + z * z);
            const maxDist = Math.max(Math.abs(x), Math.abs(z));
            if (maxDist > bevelWidth * 0.5) {
                const factor = 1 - (bevelWidth / maxDist) * 0.3;
                positions[i] = x * factor;
                positions[i + 2] = z * factor;
            }
        }
        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();
    }
    /**
     * Add seam detail to pillow
     */
    addSeam(geometry, config) {
        // For a more advanced implementation, we could add a separate seam mesh
        // or modify the UV mapping to include seam texture details
        // This is a placeholder for future enhancement
    }
    /**
     * Create fabric material for pillow
     */
    createFabricMaterial() {
        const colors = [
            0xFFFFFF, 0xF5F5DC, 0xE6E6FA, 0xFFB6C1,
            0xADD8E6, 0x90EE90, 0xFFD700, 0xFFA07A
        ];
        return new THREE.MeshStandardMaterial({
            color: colors[Math.floor(this.rng.uniform() * colors.length)],
            roughness: 0.8,
            metalness: 0.0,
        });
    }
}
//# sourceMappingURL=PillowFactory.js.map