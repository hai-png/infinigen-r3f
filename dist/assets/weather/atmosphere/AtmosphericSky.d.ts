/**
 * Atmospheric Scattering & Sky System
 *
 * Implements physically-based atmospheric scattering for realistic sky rendering.
 * Based on Rayleigh and Mie scattering theory as used in Infinigen.
 *
 * Features:
 * - Rayleigh scattering (blue sky)
 * - Mie scattering (haze, sun glow)
 * - Ozone absorption
 * - Multiple scattering approximation
 * - Sunrise/sunset color shifts
 * - Moon and stars rendering
 *
 * @see https://github.com/princeton-vl/infinigen
 */
import * as THREE from 'three';
export interface AtmosphereParams {
    rayleighScale: number;
    mieScale: number;
    ozoneScale: number;
    rayleighCoefficient: THREE.Vector3;
    mieCoefficient: number;
    ozoneCoefficient: number;
    turbidity: number;
    ozoneDensity: number;
    sunIntensity: number;
    moonIntensity: number;
    sunDiscSize: number;
    groundColor: THREE.Color;
    groundAlbedo: number;
}
/**
 * Atmospheric scattering shader implementation
 */
export declare class AtmosphericSky {
    private scene;
    private camera;
    private skyMesh;
    private skyMaterial;
    private sunMesh?;
    private moonMesh?;
    private params;
    private sunPosition;
    private moonPosition;
    constructor(scene: THREE.Scene, camera: THREE.Camera, params?: Partial<AtmosphereParams>);
    /**
     * Create the sky dome with atmospheric scattering shader
     */
    private createSky;
    /**
     * Create sun disc sprite
     */
    private createSunDisc;
    /**
     * Create moon disc sprite
     */
    private createMoonDisc;
    private sunMaterial;
    private moonMaterial;
    /**
     * Set sun position
     */
    setSunPosition(position: THREE.Vector3): void;
    /**
     * Set moon position
     */
    setMoonPosition(position: THREE.Vector3): void;
    /**
     * Update atmosphere parameters
     */
    updateParams(params: Partial<AtmosphereParams>): void;
    /**
     * Update all shader uniforms
     */
    private updateUniforms;
    /**
     * Set time of day (0-24 hours)
     */
    setTimeOfDay(hours: number): void;
    /**
     * Handle window resize
     */
    onResize(width: number, height: number): void;
    /**
     * Cleanup resources
     */
    dispose(): void;
}
export default AtmosphericSky;
//# sourceMappingURL=AtmosphericSky.d.ts.map