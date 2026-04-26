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
export type WindLayer = 'base' | 'gusts' | 'turbulence';
export interface WindParams {
    speed: number;
    direction: THREE.Vector3;
    gustStrength: number;
    gustFrequency: number;
    gustDuration: number;
    turbulenceStrength: number;
    turbulenceScale: number;
    timeScale: number;
    heightExponent: number;
}
export interface AnimationConfig {
    flexibility: number;
    damping: number;
    mass: number;
    maxAngle: number;
    minAngle: number;
    naturalFrequency: number;
    lodDistance: number;
    lodQuality: 'low' | 'medium' | 'high';
}
export declare class WindAnimationSystem {
    private noise;
    private windParams;
    private time;
    private activeGusts;
    constructor(windParams?: Partial<WindParams>);
    /**
     * Update wind simulation
     */
    update(deltaTime: number): void;
    /**
     * Generate a wind gust
     */
    private generateGust;
    /**
     * Update active gusts
     */
    private updateGusts;
    /**
     * Get wind force at a specific position and time
     */
    getWindForce(position: THREE.Vector3, height?: number): THREE.Vector3;
    /**
     * Get base wind component
     */
    private getBaseWind;
    /**
     * Get gust force component
     */
    private getGustForce;
    /**
     * Get turbulence component using noise
     */
    private getTurbulence;
    /**
     * Calculate vertex displacement for wind animation
     */
    calculateVertexDisplacement(originalPosition: THREE.Vector3, pivotPoint: THREE.Vector3, config: AnimationConfig): THREE.Vector3;
    /**
     * Animate a tree or plant hierarchy
     */
    animateHierarchy(root: THREE.Object3D, config: AnimationConfig, deltaTime: number): void;
    /**
     * Create wind animation shader uniforms
     */
    createShaderUniforms(): Record<string, {
        value: any;
    }>;
    /**
     * Update shader uniforms
     */
    updateShaderUniforms(uniforms: Record<string, {
        value: any;
    }>): void;
    /**
     * Get wind parameters for shader
     */
    getWindShaderData(): {
        speed: number;
        direction: THREE.Vector3;
        gustStrength: number;
        turbulence: number;
        time: number;
    };
    /**
     * Set wind parameters
     */
    setWindParams(params: Partial<WindParams>): void;
    /**
     * Get current wind state
     */
    getWindState(): {
        params: WindParams;
        time: number;
        activeGustCount: number;
    };
    /**
     * Create wind zone for localized effects
     */
    createWindZone(center: THREE.Vector3, radius: number, params: Partial<WindParams>): WindZone;
}
/**
 * Localized wind zone
 */
export declare class WindZone {
    private center;
    private radius;
    private params;
    private falloffExponent;
    constructor(center: THREE.Vector3, radius: number, params: Partial<WindParams>);
    /**
     * Get wind force at position within zone
     */
    getForceAt(position: THREE.Vector3): THREE.Vector3;
    /**
     * Check if position is inside zone
     */
    contains(position: THREE.Vector3): boolean;
    /**
     * Set falloff exponent
     */
    setFalloff(exponent: number): void;
}
export default WindAnimationSystem;
//# sourceMappingURL=WindAnimationSystem.d.ts.map