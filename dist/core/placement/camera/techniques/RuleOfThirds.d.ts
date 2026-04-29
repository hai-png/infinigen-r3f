/**
 * Rule of Thirds Composition Helper
 */
import * as THREE from 'three';
export interface GridIntersection {
    x: number;
    y: number;
    strength: number;
}
export declare function getRuleOfThirdsPoints(frameWidth: number, frameHeight: number): GridIntersection[];
export declare function alignSubjectToRuleOfThirds(subjectPosition: THREE.Vector3, cameraPosition: THREE.Vector3, frameWidth: number, frameHeight: number): THREE.Vector3;
declare const _default: {
    getRuleOfThirdsPoints: typeof getRuleOfThirdsPoints;
    alignSubjectToRuleOfThirds: typeof alignSubjectToRuleOfThirds;
};
export default _default;
//# sourceMappingURL=RuleOfThirds.d.ts.map