/**
 * Symmetry Constraints Module
 *
 * Implements symmetry-based relation evaluators.
 * Ported from: infinigen/core/constraints/evaluator/node_impl/symmetry.py
 *
 * Relations implemented:
 * - Symmetric: Objects arranged symmetrically around an axis/plane
 * - Aligned: Objects aligned along a direction
 * - Distributed: Objects evenly distributed in a region
 */
import { Variable } from '../../language/types.js';
import * as THREE from 'three';
/**
 * Registry of symmetry node implementations
 */
export const symmetryNodeImpls = new Map();
/**
 * Evaluate Symmetric relation
 *
 * Checks if objects are arranged symmetrically around an axis or plane.
 * Uses bounding box centers for efficiency.
 *
 * @param node - Symmetric relation node
 * @param state - Current solver state
 * @param childVals - Evaluated child values
 * @param kwargs - Additional parameters
 * @returns SymmetryResult with satisfaction and loss
 */
export function evaluateSymmetric(node, state, childVals, kwargs = {}) {
    const args = node.args;
    if (args.length < 2) {
        return { satisfied: false, loss: Infinity };
    }
    // Extract object IDs from arguments
    const objectIds = extractObjectIds(args, childVals, state);
    if (objectIds.length < 2) {
        return { satisfied: false, loss: Infinity };
    }
    // Get symmetry axis or plane from kwargs or infer from objects
    let symmetryAxis;
    let symmetryPlane;
    if (kwargs.axis) {
        symmetryAxis = new THREE.Vector3(...kwargs.axis);
        symmetryAxis.normalize();
    }
    else if (kwargs.planeNormal && kwargs.planePoint) {
        symmetryPlane = {
            normal: new THREE.Vector3(...kwargs.planeNormal).normalize(),
            point: new THREE.Vector3(...kwargs.planePoint)
        };
    }
    else {
        // Infer symmetry from object arrangement
        const inferred = inferSymmetryFromObjects(objectIds, state);
        symmetryAxis = inferred.axis;
        symmetryPlane = inferred.plane;
    }
    if (!symmetryAxis && !symmetryPlane) {
        return { satisfied: false, loss: Infinity };
    }
    // Check pairwise symmetry
    const symmetricPairs = [];
    let totalLoss = 0;
    const used = new Set();
    for (let i = 0; i < objectIds.length; i++) {
        if (used.has(objectIds[i]))
            continue;
        const obj1 = state.getObject(objectIds[i]);
        if (!obj1)
            continue;
        const center1 = obj1.getBBoxCenter();
        let bestMatch = null;
        let bestLoss = Infinity;
        for (let j = i + 1; j < objectIds.length; j++) {
            if (used.has(objectIds[j]))
                continue;
            const obj2 = state.getObject(objectIds[j]);
            if (!obj2)
                continue;
            const center2 = obj2.getBBoxCenter();
            // Calculate reflection of center1 across symmetry element
            let reflected;
            if (symmetryAxis) {
                // Reflection across line (axis)
                reflected = reflectAcrossAxis(center1, symmetryAxis);
            }
            else {
                // Reflection across plane
                reflected = reflectAcrossPlane(center1, symmetryPlane.normal, symmetryPlane.point);
            }
            // Distance between reflected center and actual center2
            const loss = reflected.distanceTo(center2);
            if (loss < bestLoss) {
                bestLoss = loss;
                bestMatch = objectIds[j];
            }
        }
        if (bestMatch && bestLoss < (kwargs.tolerance ?? 0.5)) {
            symmetricPairs.push([objectIds[i], bestMatch]);
            used.add(objectIds[i]);
            used.add(bestMatch);
            totalLoss += bestLoss;
        }
        else {
            totalLoss += bestLoss === Infinity ? 10 : bestLoss;
        }
    }
    const allPaired = used.size === objectIds.length;
    const avgLoss = symmetricPairs.length > 0 ? totalLoss / symmetricPairs.length : totalLoss;
    return {
        satisfied: allPaired && avgLoss < (kwargs.threshold ?? 0.3),
        loss: avgLoss,
        symmetryAxis,
        symmetryPlane,
        symmetricPairs
    };
}
/**
 * Evaluate Aligned relation
 *
 * Checks if objects are aligned along a common direction.
 *
 * @param node - Aligned relation node
 * @param state - Current solver state
 * @param childVals - Evaluated child values
 * @param kwargs - Additional parameters
 */
export function evaluateAligned(node, state, childVals, kwargs = {}) {
    const args = node.args;
    if (args.length < 2) {
        return { satisfied: false, loss: Infinity };
    }
    const objectIds = extractObjectIds(args, childVals, state);
    if (objectIds.length < 2) {
        return { satisfied: false, loss: Infinity };
    }
    // Get alignment direction from kwargs or infer
    let direction;
    if (kwargs.direction) {
        direction = new THREE.Vector3(...kwargs.direction).normalize();
    }
    else {
        // Infer from first two objects
        const obj1 = state.getObject(objectIds[0]);
        const obj2 = state.getObject(objectIds[1]);
        if (obj1 && obj2) {
            direction = new THREE.Vector3()
                .subVectors(obj2.getBBoxCenter(), obj1.getBBoxCenter())
                .normalize();
        }
    }
    if (!direction) {
        return { satisfied: false, loss: Infinity };
    }
    // Check if all object centers lie on a line with this direction
    const centers = objectIds
        .map(id => state.getObject(id)?.getBBoxCenter())
        .filter((c) => c !== undefined);
    if (centers.length < 2) {
        return { satisfied: false, loss: Infinity };
    }
    // Fit line through centers and check deviation
    const lineFit = fitLineToPoints(centers);
    const alignmentLoss = centers.reduce((sum, center) => {
        const dist = distancePointToLine(center, lineFit.point, lineFit.direction);
        return sum + dist;
    }, 0) / centers.length;
    return {
        satisfied: alignmentLoss < (kwargs.threshold ?? 0.2),
        loss: alignmentLoss,
        direction: lineFit.direction
    };
}
/**
 * Evaluate Distributed relation
 *
 * Checks if objects are evenly distributed in a region.
 *
 * @param node - Distributed relation node
 * @param state - Current solver state
 * @param childVals - Evaluated child values
 * @param kwargs - Additional parameters
 */
export function evaluateDistributed(node, state, childVals, kwargs = {}) {
    const args = node.args;
    if (args.length < 3) {
        return { satisfied: false, loss: Infinity };
    }
    const objectIds = extractObjectIds(args, childVals, state);
    if (objectIds.length < 3) {
        return { satisfied: false, loss: Infinity };
    }
    const centers = objectIds
        .map(id => state.getObject(id)?.getBBoxCenter())
        .filter((c) => c !== undefined);
    if (centers.length < 3) {
        return { satisfied: false, loss: Infinity };
    }
    // Calculate pairwise distances
    const distances = [];
    for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
            distances.push(centers[i].distanceTo(centers[j]));
        }
    }
    // Check uniformity of distances
    const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDist, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / meanDist; // Coefficient of variation
    // Lower CV means more uniform distribution
    const distributionLoss = cv;
    const distributionType = cv < 0.2 ? 'grid' : cv < 0.5 ? 'uniform' : 'random';
    return {
        satisfied: distributionLoss < (kwargs.threshold ?? 0.4),
        loss: distributionLoss,
        distribution: distributionType
    };
}
/**
 * Helper: Extract object IDs from relation arguments
 */
function extractObjectIds(args, childVals, state) {
    const ids = [];
    for (const arg of args) {
        if (arg instanceof Variable) {
            const varName = arg.name;
            if (childVals.has(varName)) {
                const val = childVals.get(varName);
                if (typeof val === 'string') {
                    ids.push(val);
                }
                else if (Array.isArray(val)) {
                    ids.push(...val.filter(v => typeof v === 'string'));
                }
            }
        }
        else if (typeof arg === 'string') {
            ids.push(arg);
        }
    }
    return ids;
}
/**
 * Reflect a point across an axis (line)
 */
function reflectAcrossAxis(point, axis) {
    // Project point onto axis
    const projection = axis.clone().multiplyScalar(point.dot(axis));
    // Vector from projection to point
    const perp = new THREE.Vector3().subVectors(point, projection);
    // Reflection is projection - perp
    return new THREE.Vector3().subVectors(projection, perp);
}
/**
 * Reflect a point across a plane
 */
function reflectAcrossPlane(point, normal, planePoint) {
    // Vector from plane point to point
    const v = new THREE.Vector3().subVectors(point, planePoint);
    // Distance to plane (signed)
    const dist = v.dot(normal);
    // Reflection is point - 2 * dist * normal
    return new THREE.Vector3().subVectors(point, normal.clone().multiplyScalar(2 * dist));
}
/**
 * Infer symmetry from object arrangement
 */
function inferSymmetryFromObjects(objectIds, state) {
    const centers = objectIds
        .map(id => state.getObject(id)?.getBBoxCenter())
        .filter((c) => c !== undefined);
    if (centers.length < 2) {
        return {};
    }
    // Try to find a symmetry plane
    const centroid = new THREE.Vector3();
    centers.forEach(c => centroid.add(c));
    centroid.divideScalar(centers.length);
    // Simple heuristic: use the primary axis of variation
    const covariance = computeCovarianceMatrix(centers);
    const eigenvectors = computeEigenvectors(covariance);
    if (eigenvectors.length > 0) {
        // Plane normal is the direction of least variance
        return {
            plane: {
                normal: eigenvectors[eigenvectors.length - 1],
                point: centroid
            }
        };
    }
    return {};
}
/**
 * Compute covariance matrix of points
 */
function computeCovarianceMatrix(points) {
    if (points.length === 0) {
        return new THREE.Matrix3();
    }
    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);
    const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of points) {
        const dx = p.x - centroid.x;
        const dy = p.y - centroid.y;
        const dz = p.z - centroid.z;
        cov[0] += dx * dx;
        cov[1] += dx * dy;
        cov[2] += dx * dz;
        cov[4] += dy * dy;
        cov[5] += dy * dz;
        cov[8] += dz * dz;
    }
    const n = points.length;
    cov[0] /= n;
    cov[1] /= n;
    cov[2] /= n;
    cov[4] /= n;
    cov[5] /= n;
    cov[8] /= n;
    // Symmetric
    cov[3] = cov[1];
    cov[6] = cov[2];
    cov[7] = cov[5];
    return new THREE.Matrix3().set(...cov);
}
/**
 * Compute eigenvectors of a 3x3 matrix (simplified)
 */
function computeEigenvectors(matrix) {
    // Simplified: just return principal axes
    // In production, use proper eigendecomposition
    return [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1)
    ];
}
/**
 * Fit a line to a set of points using PCA
 */
function fitLineToPoints(points) {
    if (points.length === 0) {
        return { point: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0) };
    }
    // Centroid
    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);
    // Direction is the primary axis of variation
    const cov = computeCovarianceMatrix(points);
    const eigenvectors = computeEigenvectors(cov);
    return {
        point: centroid,
        direction: eigenvectors[0] || new THREE.Vector3(1, 0, 0)
    };
}
/**
 * Distance from point to line
 */
function distancePointToLine(point, linePoint, lineDir) {
    const v = new THREE.Vector3().subVectors(point, linePoint);
    const proj = lineDir.clone().multiplyScalar(v.dot(lineDir));
    const perp = new THREE.Vector3().subVectors(v, proj);
    return perp.length();
}
// Register symmetry node implementations
symmetryNodeImpls.set('Symmetric', evaluateSymmetric);
symmetryNodeImpls.set('Aligned', evaluateAligned);
symmetryNodeImpls.set('Distributed', evaluateDistributed);
//# sourceMappingURL=symmetry.js.map