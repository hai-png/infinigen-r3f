import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';
/**
 * Starfish types with specific characteristics
 */
export var StarfishType;
(function (StarfishType) {
    StarfishType["COMMON"] = "common";
    StarfishType["CUSHION"] = "cushion";
    StarfishType["SUN"] = "sun";
    StarfishType["KNOBBY"] = "knobby";
    StarfishType["BLOOD"] = "blood";
    StarfishType["CHOCOLATE"] = "chocolate";
})(StarfishType || (StarfishType = {}));
/**
 * Generates procedural starfish meshes with various species and patterns
 */
export class StarfishGenerator {
    /**
     * Generate a single starfish mesh
     */
    static generateStarfish(config) {
        const key = this.getGeometryKey(config);
        let geometry;
        if (this.geometryCache.has(key)) {
            geometry = this.geometryCache.get(key);
        }
        else {
            geometry = this.createStarfishGeometry(config);
            this.geometryCache.set(key, geometry);
        }
        const material = this.getMaterial(config);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.starfishData = { config };
        return mesh;
    }
    /**
     * Get unique key for geometry caching
     */
    static getGeometryKey(config) {
        return `${config.type}-${config.armCount}-${config.armLength}-${config.armWidth}-${config.bodySize}`;
    }
    /**
     * Create starfish geometry using parametric surface
     */
    static createStarfishGeometry(config) {
        const { armCount, armLength, armWidth, bodySize, bumpiness } = config;
        // Create starfish shape using polar coordinates
        const radialSegments = 64;
        const thetaSegments = 32;
        const positions = [];
        const normals = [];
        const uvs = [];
        for (let i = 0; i <= thetaSegments; i++) {
            const theta = (i / thetaSegments) * Math.PI * 2;
            for (let j = 0; j <= radialSegments; j++) {
                const r = (j / radialSegments);
                // Calculate radius at this angle using starfish pattern
                const baseRadius = this.getStarfishRadius(theta, armCount, armLength, armWidth, bodySize);
                // Interpolate between center and edge
                const currentRadius = r * baseRadius;
                // Convert to Cartesian
                const x = Math.cos(theta) * currentRadius;
                const z = Math.sin(theta) * currentRadius;
                // Calculate height (dome shape with bumps)
                let y = this.calculateHeight(r, theta, config);
                // Add surface bumps
                if (bumpiness > 0) {
                    const noise = NoiseUtils.perlin2D(x * 5, z * 5, 2);
                    y += noise * bumpiness * 0.1 * bodySize;
                }
                positions.push(x, y, z);
                // Calculate normal (simplified - pointing up with slight variation)
                const nx = -x * 0.5;
                const ny = 1;
                const nz = -z * 0.5;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                normals.push(nx / len, ny / len, nz / len);
                // UV mapping
                uvs.push((theta / (Math.PI * 2)), r);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        // Create indices for proper rendering
        const indices = [];
        for (let i = 0; i < thetaSegments; i++) {
            for (let j = 0; j < radialSegments; j++) {
                const a = i * (radialSegments + 1) + j;
                const b = a + 1;
                const c = (i + 1) * (radialSegments + 1) + j;
                const d = c + 1;
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Calculate radius at given angle for starfish shape
     */
    static getStarfishRadius(theta, armCount, armLength, armWidth, bodySize) {
        // Base body radius
        const bodyRadius = bodySize;
        // Calculate distance to nearest arm center
        const armAngleStep = (Math.PI * 2) / armCount;
        let minAngleDiff = Infinity;
        for (let i = 0; i < armCount; i++) {
            const armAngle = i * armAngleStep;
            let angleDiff = Math.abs(theta - armAngle);
            // Handle wrap-around
            if (angleDiff > Math.PI) {
                angleDiff = Math.PI * 2 - angleDiff;
            }
            minAngleDiff = Math.min(minAngleDiff, angleDiff);
        }
        // Smooth interpolation between arm and gap
        const armFactor = Math.pow(Math.cos(minAngleDiff * (armCount / 2)), 2);
        // Radius = body + arm extension based on angle
        const radius = bodyRadius + (armLength - bodyRadius) * armFactor;
        return radius;
    }
    /**
     * Calculate height at position for 3D form
     */
    static calculateHeight(r, theta, config) {
        const { armCount, armLength, bodySize, type } = config;
        // Dome shape - highest at center
        const domeHeight = bodySize * 0.3 * (1 - r * r);
        // Arm ridge along center of each arm
        const armAngleStep = (Math.PI * 2) / armCount;
        let ridgeHeight = 0;
        for (let i = 0; i < armCount; i++) {
            const armAngle = i * armAngleStep;
            let angleDiff = Math.abs(theta - armAngle);
            if (angleDiff > Math.PI) {
                angleDiff = Math.PI * 2 - angleDiff;
            }
            // Ridge is highest along arm center
            const ridgeFactor = Math.cos(angleDiff * (armCount / 2));
            if (ridgeFactor > 0) {
                ridgeHeight += ridgeFactor * bodySize * 0.15 * (1 - r * 0.5);
            }
        }
        // Type-specific adjustments
        let typeAdjustment = 0;
        switch (type) {
            case StarfishType.CUSHION:
                // Puffier center
                typeAdjustment = domeHeight * 0.5 * Math.exp(-r * 3);
                break;
            case StarfishType.SUN:
                // Flatter overall
                typeAdjustment = -domeHeight * 0.3;
                break;
            case StarfishType.KNOBBY:
                // Knobs along arms
                const knobFreq = 8;
                const knobHeight = Math.sin(r * knobFreq * Math.PI) * 0.05 * bodySize;
                typeAdjustment = Math.max(0, knobHeight);
                break;
        }
        return domeHeight + ridgeHeight + typeAdjustment;
    }
    /**
     * Get or create material for starfish
     */
    static getMaterial(config) {
        const key = `${config.type}-${config.color.getHexString()}-${config.pattern}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key);
        }
        const material = new THREE.MeshStandardMaterial({
            color: config.color,
            roughness: config.roughness,
            metalness: 0.0
        });
        // Pattern handling via vertex colors would go here
        // For now, we use emissive for simple patterns
        if (config.pattern === 'spotted' && config.patternColor) {
            material.emissive = config.patternColor;
            material.emissiveIntensity = 0.1;
        }
        this.materialCache.set(key, material);
        return material;
    }
    /**
     * Generate scattered starfish on seabed
     */
    static generateScatter(configs, count, area) {
        const group = new THREE.Group();
        for (let i = 0; i < count; i++) {
            const config = configs[Math.floor(Math.random() * configs.length)];
            // Randomize size slightly
            const randomizedConfig = {
                ...config,
                armLength: config.armLength * (0.9 + Math.random() * 0.2),
                bodySize: config.bodySize * (0.9 + Math.random() * 0.2)
            };
            const starfish = this.generateStarfish(randomizedConfig);
            // Position on seabed
            starfish.position.set((Math.random() - 0.5) * area.width, 0, (Math.random() - 0.5) * area.depth);
            // Random rotation
            starfish.rotation.y = Math.random() * Math.PI * 2;
            // Slight tilt for natural look
            starfish.rotation.x = (Math.random() - 0.5) * 0.2;
            starfish.rotation.z = (Math.random() - 0.5) * 0.2;
            group.add(starfish);
        }
        return group;
    }
    /**
     * Get preset configurations for different starfish types
     */
    static getPreset(type) {
        switch (type) {
            case StarfishType.COMMON:
                return {
                    type: StarfishType.COMMON,
                    armCount: 5,
                    armLength: 0.15,
                    armWidth: 0.04,
                    bodySize: 0.05,
                    color: new THREE.Color(0xff6347),
                    pattern: 'solid',
                    roughness: 0.5,
                    bumpiness: 0.3
                };
            case StarfishType.CUSHION:
                return {
                    type: StarfishType.CUSHION,
                    armCount: 5,
                    armLength: 0.08,
                    armWidth: 0.06,
                    bodySize: 0.06,
                    color: new THREE.Color(0xffd700),
                    pattern: 'spotted',
                    patternColor: new THREE.Color(0xffa500),
                    roughness: 0.4,
                    bumpiness: 0.5
                };
            case StarfishType.SUN:
                return {
                    type: StarfishType.SUN,
                    armCount: 20,
                    armLength: 0.12,
                    armWidth: 0.015,
                    bodySize: 0.04,
                    color: new THREE.Color(0xffa500),
                    pattern: 'gradient',
                    roughness: 0.3,
                    bumpiness: 0.2
                };
            case StarfishType.KNOBBY:
                return {
                    type: StarfishType.KNOBBY,
                    armCount: 5,
                    armLength: 0.18,
                    armWidth: 0.035,
                    bodySize: 0.045,
                    color: new THREE.Color(0x8b4513),
                    pattern: 'spotted',
                    patternColor: new THREE.Color(0xd2691e),
                    roughness: 0.6,
                    bumpiness: 0.7
                };
            case StarfishType.BLOOD:
                return {
                    type: StarfishType.BLOOD,
                    armCount: 5,
                    armLength: 0.14,
                    armWidth: 0.03,
                    bodySize: 0.04,
                    color: new THREE.Color(0xdc143c),
                    pattern: 'solid',
                    roughness: 0.4,
                    bumpiness: 0.3
                };
            case StarfishType.CHOCOLATE:
                return {
                    type: StarfishType.CHOCOLATE,
                    armCount: 5,
                    armLength: 0.16,
                    armWidth: 0.04,
                    bodySize: 0.05,
                    color: new THREE.Color(0x654321),
                    pattern: 'striped',
                    patternColor: new THREE.Color(0x8b4513),
                    roughness: 0.5,
                    bumpiness: 0.4
                };
            default:
                return this.getPreset(StarfishType.COMMON);
        }
    }
}
StarfishGenerator.materialCache = new Map();
StarfishGenerator.geometryCache = new Map();
//# sourceMappingURL=StarfishGenerator.js.map