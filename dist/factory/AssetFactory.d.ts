/**
 * Asset Factory - Hybrid Implementation
 *
 * Prioritizes browser-side instantiation for rapid feedback while maintaining
 * hooks for Python-side complex generation.
 *
 * Features:
 * 1. Procedural Primitive Generation (Box, Sphere, Cylinder, Plane)
 * 2. GLTF Model Loading
 * 3. Semantic Material Assignment based on tags
 * 4. State Application (Position, Rotation, Scale)
 */
import * as THREE from 'three';
import type { ObjectState } from '../constraints/solver/types';
import type { AssetDescription } from '../domain/types';
export interface AssetFactoryOptions {
    usePhysics?: boolean;
    defaultScale?: THREE.Vector3;
    assetPathPrefix?: string;
}
export declare class AssetFactory {
    private loader;
    private cache;
    private options;
    constructor(options?: AssetFactoryOptions);
    /**
     * Main entry point: Creates an object based on description and state
     */
    createObject(description: AssetDescription, state?: ObjectState): Promise<THREE.Object3D>;
    /**
     * Creates procedural primitives using THREE geometries
     */
    private createPrimitive;
    /**
     * Loads a GLTF model with caching
     */
    private loadModel;
    /**
     * Applies materials based on semantic tags
     * Implements hybrid logic: Simple colors in JS, complex shaders could come from Python config
     */
    private applySemanticMaterials;
    /**
     * Applies the solved state (position, rotation) to the mesh
     */
    private applyState;
    /**
     * Clears the internal model cache
     */
    clearCache(): void;
}
export declare const defaultAssetFactory: AssetFactory;
//# sourceMappingURL=AssetFactory.d.ts.map