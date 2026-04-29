/**
 * Placement Types
 * Type definitions for object placement system
 */
import * as THREE from 'three';
export type PlacementStrategy = 'random' | 'grid' | 'poisson_disk' | 'surface' | 'volume' | 'path' | 'cluster';
export interface PlacementZone {
    id: string;
    geometry: THREE.BufferGeometry | THREE.Shape;
    weight: number;
    tags?: string[];
}
export interface PlacementConstraints {
    minDistance?: number;
    maxDistance?: number;
    minAngle?: number;
    maxAngle?: number;
    alignToNormal?: boolean;
    avoidOverlap?: boolean;
    surfaceOnly?: boolean;
    boundingBox?: THREE.Box3;
}
export interface PlacementConfig {
    strategy: PlacementStrategy;
    count?: number;
    density?: number;
    zone?: PlacementZone;
    constraints?: PlacementConstraints;
    seed?: number;
}
export interface PlacedObject {
    position: THREE.Vector3;
    rotation: THREE.Euler | THREE.Quaternion;
    scale: THREE.Vector3;
    objectId: string;
    zoneId?: string;
    normal?: THREE.Vector3;
}
export interface PlacementResult {
    placedObjects: PlacedObject[];
    failedPlacements: number;
    boundingBox: THREE.Box3;
}
export interface PlacementContext {
    scene: any;
    objects: Map<string, THREE.Object3D>;
    zones: Map<string, PlacementZone>;
    seed?: number;
}
export declare function createPlacementZone(id: string, geometry: THREE.BufferGeometry | THREE.Shape, weight?: number, tags?: string[]): PlacementZone;
export declare function createPlacementConfig(strategy: PlacementStrategy, options?: Partial<PlacementConfig>): PlacementConfig;
//# sourceMappingURL=types.d.ts.map