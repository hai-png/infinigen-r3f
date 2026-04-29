/**
 * Rule of Thirds Composition Helper
 */
import * as THREE from 'three';
export function getRuleOfThirdsPoints(frameWidth, frameHeight) {
    const thirdW = frameWidth / 3;
    const thirdH = frameHeight / 3;
    return [
        { x: thirdW, y: thirdH, strength: 1.0 },
        { x: thirdW * 2, y: thirdH, strength: 1.0 },
        { x: thirdW, y: thirdH * 2, strength: 1.0 },
        { x: thirdW * 2, y: thirdH * 2, strength: 1.0 },
    ];
}
export function alignSubjectToRuleOfThirds(subjectPosition, cameraPosition, frameWidth, frameHeight) {
    const points = getRuleOfThirdsPoints(frameWidth, frameHeight);
    // Find closest intersection point
    const projected = projectToWorld(subjectPosition, cameraPosition, frameWidth, frameHeight);
    let bestPoint = points[0];
    let minDist = Infinity;
    for (const point of points) {
        const dist = Math.hypot(point.x - projected.x, point.y - projected.y);
        if (dist < minDist) {
            minDist = dist;
            bestPoint = point;
        }
    }
    return new THREE.Vector3(bestPoint.x, bestPoint.y, subjectPosition.z);
}
function projectToWorld(subject, camera, frameW, frameH) {
    // Simplified projection
    return {
        x: (subject.x - camera.x) * 10,
        y: (subject.y - camera.y) * 10,
    };
}
export default { getRuleOfThirdsPoints, alignSubjectToRuleOfThirds };
//# sourceMappingURL=RuleOfThirds.js.map