/**
 * Example Scene - Demonstrating Infinigen R3F capabilities
 *
 * This example shows how to use the asset factories, lighting, and placement systems
 * to create a procedural outdoor scene.
 */
import * as THREE from 'three';
export interface SceneConfig {
    seed: number;
    terrainSize: number;
    boulderCount: number;
    plantCount: number;
    timeOfDay: number;
}
/**
 * Create a complete procedural outdoor scene
 */
export declare function createOutdoorScene(config?: Partial<SceneConfig>): Promise<THREE.Group>;
/**
 * Create a simple rock garden scene
 */
export declare function createRockGarden(size?: number, seed?: number): Promise<THREE.Group>;
declare const _default: {
    createOutdoorScene: typeof createOutdoorScene;
    createRockGarden: typeof createRockGarden;
};
export default _default;
//# sourceMappingURL=outdoor-scene.d.ts.map