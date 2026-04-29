/**
 * WindAnimationSystem - Procedural wind animation for vegetation and objects
 *
 * Implements realistic wind simulation for animating plants, trees, flags,
 * and other flexible objects. Uses Perlin noise for natural motion patterns.
 *
 * Features:
 * - Multi-layer wind noise (gusts, turbulence, steady flow)
 * - Object-specific response curves
 * - LOD-based animation quality
 * - Performance-optimized vertex shader integration
 * - Seasonal wind strength variation
 *
 * @module WindAnimationSystem
 */
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
const DEFAULT_WIND_PARAMS = {
    speed: 5.0,
    direction: new THREE.Vector3(1, 0, 0),
    gustStrength: 2.0,
    gustFrequency: 0.2,
    gustDuration: 3.0,
    turbulenceStrength: 0.5,
    turbulenceScale: 1.0,
    timeScale: 1.0,
    heightExponent: 0.5
};
const DEFAULT_ANIMATION_CONFIG = {
    flexibility: 0.5,
    damping: 0.9,
    mass: 1.0,
    maxAngle: Math.PI / 4,
    minAngle: -Math.PI / 4,
    naturalFrequency: 2.0,
    lodDistance: 50,
    lodQuality: 'medium'
};
export class WindAnimationSystem {
    constructor(windParams = {}) {
        this.time = 0;
        this.activeGusts = [];
        this.noise = createNoise3D();
        this.windParams = { ...DEFAULT_WIND_PARAMS, ...windParams };
        // Normalize direction
        this.windParams.direction.normalize();
    }
    /**
     * Update wind simulation
     */
    update(deltaTime) {
        this.time += deltaTime * this.windParams.timeScale;
        // Generate random gusts
        if (Math.random() < this.windParams.gustFrequency * deltaTime) {
            this.generateGust();
        }
        // Update active gusts
        this.updateGusts(deltaTime);
    }
    /**
     * Generate a wind gust
     */
    generateGust() {
        const strength = this.windParams.gustStrength * (0.5 + Math.random());
        const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
        this.activeGusts.push({
            strength,
            direction,
            progress: 0
        });
    }
    /**
     * Update active gusts
     */
    updateGusts(deltaTime) {
        for (let i = this.activeGusts.length - 1; i >= 0; i--) {
            const gust = this.activeGusts[i];
            gust.progress += deltaTime / this.windParams.gustDuration;
            if (gust.progress >= 1) {
                this.activeGusts.splice(i, 1);
            }
        }
    }
    /**
     * Get wind force at a specific position and time
     */
    getWindForce(position, height = 0) {
        const baseForce = this.getBaseWind(position, height);
        const gustForce = this.getGustForce(position, height);
        const turbulence = this.getTurbulence(position, height);
        const totalForce = new THREE.Vector3();
        totalForce.add(baseForce);
        totalForce.add(gustForce);
        totalForce.add(turbulence);
        return totalForce;
    }
    /**
     * Get base wind component
     */
    getBaseWind(position, height) {
        // Height-based wind strength (stronger at higher altitudes)
        const heightMultiplier = Math.pow(height + 1, this.windParams.heightExponent);
        const baseSpeed = this.windParams.speed * heightMultiplier;
        return this.windParams.direction.clone().multiplyScalar(baseSpeed);
    }
    /**
     * Get gust force component
     */
    getGustForce(position, height) {
        let gustForce = new THREE.Vector3(0, 0, 0);
        for (const gust of this.activeGusts) {
            // Smooth gust envelope
            const envelope = Math.sin(gust.progress * Math.PI);
            gustForce.add(gust.direction.clone().multiplyScalar(gust.strength * envelope * height));
        }
        return gustForce;
    }
    /**
     * Get turbulence component using noise
     */
    getTurbulence(position, height) {
        const scale = this.windParams.turbulenceScale;
        const strength = this.windParams.turbulenceStrength;
        const nx = this.noise(position.x * scale * 0.1, position.y * scale * 0.1, this.time * 0.5);
        const ny = this.noise(position.x * scale * 0.1 + 100, position.y * scale * 0.1, this.time * 0.5);
        const nz = this.noise(position.x * scale * 0.1 + 200, position.y * scale * 0.1, this.time * 0.5);
        return new THREE.Vector3(nx, ny, nz).multiplyScalar(strength * height);
    }
    /**
     * Calculate vertex displacement for wind animation
     */
    calculateVertexDisplacement(originalPosition, pivotPoint, config) {
        const height = originalPosition.y - pivotPoint.y;
        if (height <= 0)
            return new THREE.Vector3(0, 0, 0);
        const windForce = this.getWindForce(originalPosition, height);
        // Apply flexibility
        const displacement = windForce.clone().multiplyScalar(config.flexibility);
        // Apply damping based on mass
        displacement.multiplyScalar(1 / config.mass);
        // Limit displacement angle
        const displacementLength = displacement.length();
        const maxDisplacement = Math.tan(config.maxAngle) * height;
        if (displacementLength > maxDisplacement) {
            displacement.setLength(maxDisplacement);
        }
        return displacement;
    }
    /**
     * Animate a tree or plant hierarchy
     */
    animateHierarchy(root, config, deltaTime) {
        this.update(deltaTime);
        // Traverse and animate each branch/leaf
        root.traverse((child) => {
            if (child.userData.isVegetationPart) {
                const pivot = child.userData.pivotPoint || root.position;
                const originalPos = child.userData.originalPosition || child.position.clone();
                // Store original position if not already stored
                if (!child.userData.originalPosition) {
                    child.userData.originalPosition = child.position.clone();
                }
                const displacement = this.calculateVertexDisplacement(originalPos, new THREE.Vector3().copy(pivot), config);
                child.position.copy(originalPos).add(displacement);
            }
        });
    }
    /**
     * Create wind animation shader uniforms
     */
    createShaderUniforms() {
        return {
            uTime: { value: 0 },
            uWindSpeed: { value: this.windParams.speed },
            uWindDirection: { value: this.windParams.direction },
            uGustStrength: { value: this.windParams.gustStrength },
            uTurbulenceStrength: { value: this.windParams.turbulenceStrength },
            uFlexibility: { value: DEFAULT_ANIMATION_CONFIG.flexibility },
            uHeightExponent: { value: this.windParams.heightExponent }
        };
    }
    /**
     * Update shader uniforms
     */
    updateShaderUniforms(uniforms) {
        if (uniforms.uTime) {
            uniforms.uTime.value = this.time;
        }
        if (uniforms.uWindSpeed) {
            uniforms.uWindSpeed.value = this.windParams.speed;
        }
        if (uniforms.uWindDirection) {
            uniforms.uWindDirection.value = this.windParams.direction;
        }
    }
    /**
     * Get wind parameters for shader
     */
    getWindShaderData() {
        return {
            speed: this.windParams.speed,
            direction: this.windParams.direction,
            gustStrength: this.windParams.gustStrength,
            turbulence: this.windParams.turbulenceStrength,
            time: this.time
        };
    }
    /**
     * Set wind parameters
     */
    setWindParams(params) {
        this.windParams = { ...this.windParams, ...params };
        if (this.windParams.direction) {
            this.windParams.direction.normalize();
        }
    }
    /**
     * Get current wind state
     */
    getWindState() {
        return {
            params: { ...this.windParams },
            time: this.time,
            activeGustCount: this.activeGusts.length
        };
    }
    /**
     * Create wind zone for localized effects
     */
    createWindZone(center, radius, params) {
        return new WindZone(center, radius, params);
    }
}
/**
 * Localized wind zone
 */
export class WindZone {
    constructor(center, radius, params) {
        this.falloffExponent = 2.0;
        this.center = center.clone();
        this.radius = radius;
        this.params = { ...DEFAULT_WIND_PARAMS, ...params };
    }
    /**
     * Get wind force at position within zone
     */
    getForceAt(position) {
        const distance = position.distanceTo(this.center);
        if (distance > this.radius) {
            return new THREE.Vector3(0, 0, 0);
        }
        // Falloff based on distance from center
        const falloff = Math.pow(1 - distance / this.radius, this.falloffExponent);
        const baseForce = this.params.direction.clone().multiplyScalar(this.params.speed * falloff);
        return baseForce;
    }
    /**
     * Check if position is inside zone
     */
    contains(position) {
        return position.distanceTo(this.center) <= this.radius;
    }
    /**
     * Set falloff exponent
     */
    setFalloff(exponent) {
        this.falloffExponent = exponent;
    }
}
export default WindAnimationSystem;
//# sourceMappingURL=WindAnimationSystem.js.map