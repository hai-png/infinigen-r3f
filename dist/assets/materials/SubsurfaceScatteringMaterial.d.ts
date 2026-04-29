import * as THREE from 'three';
/**
 * Subsurface Scattering (SSS) Material
 * Approximates light scattering through translucent materials like skin, wax, marble
 */
export interface SSSConfig {
    color: THREE.Color;
    thickness: number;
    roughness: number;
    metalness: number;
    subsurfaceColor: THREE.Color;
    subsurfaceIntensity: number;
    subsurfaceRadius: THREE.Vector3;
    normalScale: number;
}
export declare class SubsurfaceScatteringMaterial extends THREE.MeshPhysicalMaterial {
    private config;
    private sssTexture;
    constructor(config?: Partial<SSSConfig>);
    private updateFromConfig;
    setColor(color: THREE.Color | number): void;
    setSubsurfaceColor(color: THREE.Color | number): void;
    setSubsurfaceIntensity(intensity: number): void;
    setThickness(thickness: number): void;
    setRoughness(roughness: number): void;
    setNormalMap(texture: THREE.Texture | null): void;
    setNormalScale(scale: number): void;
    setSubsurfaceRadius(r: number, g: number, b: number): void;
    clone(): SubsurfaceScatteringMaterial;
    toJSON(meta?: any): any;
    dispose(): void;
}
export declare class AdvancedSSSMaterial extends THREE.ShaderMaterial {
    constructor(config?: Partial<SSSConfig>);
    setTexture(texture: THREE.Texture): void;
    setNormalMap(texture: THREE.Texture): void;
}
export default SubsurfaceScatteringMaterial;
//# sourceMappingURL=SubsurfaceScatteringMaterial.d.ts.map