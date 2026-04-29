import * as THREE from 'three';
import { SceneObject } from '../../types';
import { BBox } from '../../../core/util/math/bbox';
/**
 * Viewpoint selection algorithms for optimal camera placement
 * Implements visibility, composition, and obstruction scoring
 */
export interface ViewpointScore {
    position: THREE.Vector3;
    score: number;
    visibility: number;
    composition: number;
    obstruction: number;
    details: ViewpointMetrics;
}
export interface ViewpointMetrics {
    visibleObjects: number;
    totalObjects: number;
    centerDistance: number;
    ruleOfThirds: number;
    leadingLines: number;
    occludedArea: number;
    depthVariation: number;
}
export interface ViewpointConfig {
    candidates: THREE.Vector3[];
    scene: SceneObject[];
    target?: SceneObject;
    weights?: {
        visibility: number;
        composition: number;
        obstruction: number;
        depth: number;
    };
    constraints?: {
        minDistance?: number;
        maxDistance?: number;
        minHeight?: number;
        maxHeight?: number;
        avoidZones?: BBox[];
    };
}
/**
 * Score a viewpoint based on multiple criteria
 */
export declare function scoreViewpoint(position: THREE.Vector3, scene: SceneObject[], target?: SceneObject, config?: Partial<ViewpointConfig>): number;
/**
 * Evaluate viewpoint and return detailed metrics
 */
export declare function evaluateViewpoint(position: THREE.Vector3, scene: SceneObject[], target?: SceneObject, config?: Partial<ViewpointConfig>): ViewpointMetrics;
/**
 * Select the best viewpoint from candidates
 */
export declare function selectBestViewpoint(candidates: THREE.Vector3[], scene: SceneObject[], target?: SceneObject, config?: Partial<ViewpointConfig>): ViewpointScore | null;
/**
 * Generate candidate viewpoints around a target
 */
export declare function generateViewpointCandidates(target: BBox, options?: {
    radius?: number;
    horizontalSteps?: number;
    verticalSteps?: number;
    minElevation?: number;
    maxElevation?: number;
}): THREE.Vector3[];
declare const _default: {
    scoreViewpoint: typeof scoreViewpoint;
    selectBestViewpoint: typeof selectBestViewpoint;
    evaluateViewpoint: typeof evaluateViewpoint;
    generateViewpointCandidates: typeof generateViewpointCandidates;
};
export default _default;
//# sourceMappingURL=ViewpointSelection.d.ts.map