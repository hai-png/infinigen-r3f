/**
 * Automatic Camera Placement Algorithms
 */
import * as THREE from 'three';
export interface AutoPlacementOptions {
    ruleOfThirds?: boolean;
    goldenRatio?: boolean;
    leadingLines?: boolean;
    subjectFocus?: boolean;
    minDistance?: number;
    maxDistance?: number;
    preferredHeight?: number;
}
export declare function calculateOptimalCameraPosition(subjectPosition: THREE.Vector3, subjectBounds: THREE.Box3, options?: AutoPlacementOptions): THREE.Vector3;
export declare function evaluateViewpointQuality(cameraPosition: THREE.Vector3, subjectPosition: THREE.Vector3, sceneObjects: THREE.Object3D[]): number;
declare const _default: {
    calculateOptimalCameraPosition: typeof calculateOptimalCameraPosition;
    evaluateViewpointQuality: typeof evaluateViewpointQuality;
};
export default _default;
//# sourceMappingURL=AutoPlacement.d.ts.map