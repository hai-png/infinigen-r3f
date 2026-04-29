/**
 * Snow System for Terrain
 * Implements snow accumulation, slope-based sliding, wind-driven patterns, and melting
 */
import * as THREE from 'three';
export class SnowSystem {
    constructor(params = {}) {
        this.snowDepthMap = null;
        this.width = 0;
        this.height = 0;
        this.params = {
            baseDepth: 0.1,
            maxDepth: 2.0,
            slideThreshold: 45,
            windStrength: 0.3,
            windDirection: new THREE.Vector3(1, 0, 0),
            temperature: -5,
            meltRate: 0.001,
            accumulateRate: 0.01,
            enableDrifts: true,
            driftScale: 10,
            ...params,
        };
    }
    /**
     * Initialize snow depth map
     */
    initialize(width, height) {
        this.width = width;
        this.height = height;
        this.snowDepthMap = new Float32Array(width * height);
        // Initialize with base depth
        for (let i = 0; i < width * height; i++) {
            this.snowDepthMap[i] = this.params.baseDepth;
        }
    }
    /**
     * Simulate snow accumulation based on slope and wind
     */
    simulate(heightMap, normalMap, deltaTime) {
        if (!this.snowDepthMap) {
            throw new Error('Snow system not initialized');
        }
        const newDepthMap = new Float32Array(this.snowDepthMap.length);
        const slideThresholdRad = (this.params.slideThreshold * Math.PI) / 180;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                // Get surface normal
                const nx = normalMap[idx * 3];
                const ny = normalMap[idx * 3 + 1];
                const nz = normalMap[idx * 3 + 2];
                // Calculate slope angle from normal
                const slopeAngle = Math.acos(Math.max(0, ny));
                let depth = this.snowDepthMap[idx];
                // Accumulation
                depth += this.params.accumulateRate * deltaTime;
                // Slope-based sliding
                if (slopeAngle > slideThresholdRad) {
                    const slideFactor = (slopeAngle - slideThresholdRad) / (Math.PI / 2 - slideThresholdRad);
                    depth *= (1 - slideFactor * 0.5);
                }
                // Wind-driven patterns
                if (this.params.enableDrifts) {
                    const windDot = nx * this.params.windDirection.x + nz * this.params.windDirection.z;
                    if (windDot > 0) {
                        // Windward side - less accumulation
                        depth *= 0.8;
                    }
                    else {
                        // Leeward side - more accumulation (drifts)
                        const driftNoise = Math.sin(x / this.params.driftScale) * Math.cos(y / this.params.driftScale);
                        depth += this.params.windStrength * this.params.driftScale * Math.max(0, driftNoise) * deltaTime;
                    }
                }
                // Temperature-based melting
                if (this.params.temperature > 0) {
                    depth -= this.params.meltRate * (this.params.temperature / 10) * deltaTime;
                }
                // Clamp depth
                depth = Math.max(0, Math.min(depth, this.params.maxDepth));
                newDepthMap[idx] = depth;
            }
        }
        this.snowDepthMap = newDepthMap;
        return newDepthMap;
    }
    /**
     * Get snow depth at a specific position
     */
    getDepth(x, y) {
        if (!this.snowDepthMap || x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return this.params.baseDepth;
        }
        return this.snowDepthMap[y * this.width + x];
    }
    /**
     * Apply snow to geometry by displacing vertices
     */
    applyToGeometry(geometry, heightMap) {
        const positions = geometry.attributes.position.array;
        const newPositions = new Float32Array(positions.length);
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 2]; // Z is Y in terrain space
            const z = positions[i + 1];
            // Sample snow depth (simplified - would need proper UV mapping in production)
            const snowDepth = this.params.baseDepth;
            newPositions[i] = x;
            newPositions[i + 1] = z + snowDepth;
            newPositions[i + 2] = y;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Update parameters
     */
    setParams(params) {
        this.params = { ...this.params, ...params };
    }
    /**
     * Get current snow depth map
     */
    getDepthMap() {
        return this.snowDepthMap;
    }
}
export default SnowSystem;
//# sourceMappingURL=SnowSystem.js.map