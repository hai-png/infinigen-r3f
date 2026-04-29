/**
 * Basic Composition Rules for Infinigen
 *
 * Implements fundamental spatial relationships and aesthetic principles.
 */
import { Vector3, Quaternion, Sphere } from 'three';
import { SpatialRelation, AestheticPrinciple } from '../CompositionEngine';
/**
 * Rule: Center object in bounds
 */
export const centerObjectRule = {
    id: 'center_object',
    name: 'Center Object',
    description: 'Centers the primary object in the scene bounds',
    relation: SpatialRelation.CENTERED,
    principles: [AestheticPrinciple.BALANCE, AestheticPrinciple.UNITY],
    priority: 90,
    parameters: {
        axis: 'xz', // 'x', 'y', 'z', 'xz', 'xy', 'yz', 'xyz'
        offset: { x: 0, y: 0, z: 0 },
    },
    validator: (context) => {
        return context.existingObjects.length > 0;
    },
    applier: (context) => {
        const result = {
            success: true,
            transformations: [],
            conflicts: [],
            score: 0,
            metrics: {
                balanceScore: 0, rhythmScore: 0, proportionScore: 0, harmonyScore: 0, overallScore: 0,
                details: { centerOfMass: new Vector3(), boundingVolume: new Sphere(new Vector3(), 0), densityDistribution: [], goldenRatioDeviations: [] }
            },
        };
        if (context.existingObjects.length === 0)
            return result;
        const primaryObject = context.existingObjects[0];
        const center = context.center?.clone() || new Vector3();
        // Apply axis-specific centering
        const axis = centerObjectRule.parameters.axis || 'xz';
        const offset = centerObjectRule.parameters.offset || { x: 0, y: 0, z: 0 };
        if (axis.includes('x'))
            center.x += offset.x || 0;
        if (axis.includes('y'))
            center.y += offset.y || 0;
        if (axis.includes('z'))
            center.z += offset.z || 0;
        const targetPosition = center.clone().sub(primaryObject.center).add(primaryObject.bounds.getCenter(new Vector3()));
        result.transformations.push({
            nodeId: primaryObject.nodeId,
            position: targetPosition,
        });
        return result;
    },
};
/**
 * Rule: Align objects along an axis
 */
export const alignObjectsRule = {
    id: 'align_objects',
    name: 'Align Objects',
    description: 'Aligns multiple objects along a specified axis',
    relation: SpatialRelation.ALIGNED,
    principles: [AestheticPrinciple.RHYTHM, AestheticPrinciple.HARMONY],
    priority: 80,
    parameters: {
        axis: 'x', // 'x', 'y', or 'z'
        spacing: 1.0, // Distance between objects
        startOffset: 0,
        alignTo: 'center', // 'min', 'center', 'max' of bounding box
    },
    validator: (context) => {
        return context.existingObjects.length >= 2;
    },
    applier: (context) => {
        const result = {
            success: true,
            transformations: [],
            conflicts: [],
            score: 0,
            metrics: {
                balanceScore: 0, rhythmScore: 0, proportionScore: 0, harmonyScore: 0, overallScore: 0,
                details: { centerOfMass: new Vector3(), boundingVolume: new Sphere(new Vector3(), 0), densityDistribution: [], goldenRatioDeviations: [] }
            },
        };
        if (context.existingObjects.length < 2)
            return result;
        const axis = alignObjectsRule.parameters.axis || 'x';
        const spacing = alignObjectsRule.parameters.spacing || 1.0;
        const alignTo = alignObjectsRule.parameters.alignTo || 'center';
        const startOffset = alignObjectsRule.parameters.startOffset || 0;
        // Sort objects by their current position on the axis
        const sorted = [...context.existingObjects].sort((a, b) => {
            const aCenter = a.bounds.getCenter(new Vector3());
            const bCenter = b.bounds.getCenter(new Vector3());
            const aPos = axis === 'x' ? aCenter.x : axis === 'y' ? aCenter.y : aCenter.z;
            const bPos = axis === 'x' ? bCenter.x : axis === 'y' ? bCenter.y : bCenter.z;
            return aPos - bPos;
        });
        // Calculate starting position
        let currentPosition = startOffset;
        if (alignTo === 'center') {
            const totalLength = (sorted.length - 1) * spacing;
            currentPosition = -totalLength / 2;
        }
        for (const obj of sorted) {
            const center = obj.bounds.getCenter(new Vector3());
            const newPosition = center.clone();
            // Adjust for alignment type using proper Vector3 methods
            const size = obj.bounds.getSize(new Vector3());
            if (alignTo === 'min') {
                if (axis === 'x')
                    newPosition.x += size.x / 2;
                else if (axis === 'y')
                    newPosition.y += size.y / 2;
                else
                    newPosition.z += size.z / 2;
            }
            else if (alignTo === 'max') {
                if (axis === 'x')
                    newPosition.x -= size.x / 2;
                else if (axis === 'y')
                    newPosition.y -= size.y / 2;
                else
                    newPosition.z -= size.z / 2;
            }
            // Set the position based on axis
            if (axis === 'x')
                newPosition.x = currentPosition;
            else if (axis === 'y')
                newPosition.y = currentPosition;
            else
                newPosition.z = currentPosition;
            result.transformations.push({
                nodeId: obj.nodeId,
                position: newPosition,
            });
            currentPosition += spacing;
        }
        return result;
    },
};
/**
 * Rule: Distribute objects in a grid pattern
 */
export const gridDistributionRule = {
    id: 'grid_distribution',
    name: 'Grid Distribution',
    description: 'Arranges objects in a regular grid pattern',
    relation: SpatialRelation.GRID,
    principles: [AestheticPrinciple.RHYTHM, AestheticPrinciple.HARMONY],
    priority: 75,
    parameters: {
        columns: 3,
        rows: 3,
        xSpacing: 1.0,
        ySpacing: 1.0,
        zSpacing: 0,
        centerGrid: true,
    },
    validator: (context) => {
        return context.existingObjects.length > 0;
    },
    applier: (context) => {
        const result = {
            success: true,
            transformations: [],
            conflicts: [],
            score: 0,
            metrics: {
                balanceScore: 0, rhythmScore: 0, proportionScore: 0, harmonyScore: 0, overallScore: 0,
                details: { centerOfMass: new Vector3(), boundingVolume: new Sphere(new Vector3(), 0), densityDistribution: [], goldenRatioDeviations: [] }
            },
        };
        const columns = gridDistributionRule.parameters.columns || 3;
        const rows = gridDistributionRule.parameters.rows || 3;
        const xSpacing = gridDistributionRule.parameters.xSpacing || 1.0;
        const ySpacing = gridDistributionRule.parameters.ySpacing || 1.0;
        const zSpacing = gridDistributionRule.parameters.zSpacing || 0;
        const centerGrid = gridDistributionRule.parameters.centerGrid !== false;
        const totalObjects = Math.min(context.existingObjects.length, columns * rows);
        // Calculate grid offset for centering
        const xOffset = centerGrid ? -((columns - 1) * xSpacing) / 2 : 0;
        const yOffset = centerGrid ? -((rows - 1) * ySpacing) / 2 : 0;
        for (let i = 0; i < totalObjects; i++) {
            const col = i % columns;
            const row = Math.floor(i / columns);
            const obj = context.existingObjects[i];
            const center = obj.bounds.getCenter(new Vector3());
            const newPosition = new Vector3(xOffset + col * xSpacing, yOffset + row * ySpacing, center.z + (Math.floor(i / (columns * rows)) * zSpacing));
            // Add center offset
            if (centerGrid) {
                newPosition.add(context.center);
            }
            result.transformations.push({
                nodeId: obj.nodeId,
                position: newPosition,
            });
        }
        return result;
    },
};
/**
 * Rule: Arrange objects radially around a center point
 */
export const radialArrangementRule = {
    id: 'radial_arrangement',
    name: 'Radial Arrangement',
    description: 'Arranges objects in a circular/radial pattern',
    relation: SpatialRelation.RADIAL,
    principles: [AestheticPrinciple.BALANCE, AestheticPrinciple.HARMONY],
    priority: 70,
    parameters: {
        radius: 2.0,
        startAngle: 0, // In radians
        endAngle: Math.PI * 2, // Full circle by default
        axis: 'y', // Axis to rotate around
        faceCenter: true, // Rotate objects to face center
    },
    validator: (context) => {
        return context.existingObjects.length >= 2;
    },
    applier: (context) => {
        const result = {
            success: true,
            transformations: [],
            conflicts: [],
            score: 0,
            metrics: {
                balanceScore: 0, rhythmScore: 0, proportionScore: 0, harmonyScore: 0, overallScore: 0,
                details: { centerOfMass: new Vector3(), boundingVolume: new Sphere(new Vector3(), 0), densityDistribution: [], goldenRatioDeviations: [] }
            },
        };
        if (context.existingObjects.length < 2)
            return result;
        const radius = radialArrangementRule.parameters.radius || 2.0;
        const startAngle = radialArrangementRule.parameters.startAngle || 0;
        const endAngle = radialArrangementRule.parameters.endAngle || Math.PI * 2;
        const axis = radialArrangementRule.parameters.axis || 'y';
        const faceCenter = radialArrangementRule.parameters.faceCenter !== false;
        const angleStep = (endAngle - startAngle) / (context.existingObjects.length - 1);
        const center = context.center?.clone() || new Vector3();
        for (let i = 0; i < context.existingObjects.length; i++) {
            const obj = context.existingObjects[i];
            const angle = startAngle + i * angleStep;
            // Calculate position based on axis
            let position;
            if (axis === 'y') {
                position = new Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius);
            }
            else if (axis === 'x') {
                position = new Vector3(center.x, center.y + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius);
            }
            else { // z
                position = new Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, center.z);
            }
            const transformation = {
                nodeId: obj.nodeId,
                position,
            };
            // Rotate to face center if requested
            if (faceCenter) {
                const direction = center.clone().sub(position).normalize();
                const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), // Assuming forward is +Z
                direction);
                transformation.rotation = rotation;
            }
            result.transformations.push(transformation);
        }
        return result;
    },
};
/**
 * Rule: Maintain minimum distance between objects
 */
export const separationRule = {
    id: 'separation',
    name: 'Separation',
    description: 'Ensures objects maintain minimum distance from each other',
    relation: SpatialRelation.DISTRIBUTED,
    principles: [AestheticPrinciple.HARMONY],
    priority: 85,
    parameters: {
        minDistance: 0.5,
        maxIterations: 10,
        relaxationFactor: 0.3,
    },
    validator: (context) => {
        return context.existingObjects.length >= 2;
    },
    applier: (context) => {
        const result = {
            success: true,
            transformations: [],
            conflicts: [],
            score: 0,
            metrics: {
                balanceScore: 0, rhythmScore: 0, proportionScore: 0, harmonyScore: 0, overallScore: 0,
                details: { centerOfMass: new Vector3(), boundingVolume: new Sphere(new Vector3(), 0), densityDistribution: [], goldenRatioDeviations: [] }
            },
        };
        if (context.existingObjects.length < 2)
            return result;
        const minDistance = separationRule.parameters.minDistance || 0.5;
        const maxIterations = separationRule.parameters.maxIterations || 10;
        const relaxationFactor = separationRule.parameters.relaxationFactor || 0.3;
        // Create working copies of positions
        const positions = context.existingObjects.map(obj => obj.bounds.getCenter(new Vector3()));
        // Iteratively resolve overlaps
        for (let iter = 0; iter < maxIterations; iter++) {
            let moved = false;
            for (let i = 0; i < positions.length; i++) {
                for (let j = i + 1; j < positions.length; j++) {
                    const delta = positions[j].clone().sub(positions[i]);
                    const distance = delta.length();
                    if (distance < minDistance && distance > 0) {
                        moved = true;
                        // Calculate push direction
                        const direction = delta.normalize();
                        const overlap = (minDistance - distance) / 2;
                        // Move both objects apart
                        const adjustment = direction.multiplyScalar(overlap * relaxationFactor);
                        positions[i].sub(adjustment);
                        positions[j].add(adjustment);
                    }
                }
            }
            if (!moved)
                break;
        }
        // Generate transformations
        for (let i = 0; i < context.existingObjects.length; i++) {
            result.transformations.push({
                nodeId: context.existingObjects[i].nodeId,
                position: positions[i],
            });
        }
        return result;
    },
};
/**
 * Rule: Symmetrical arrangement
 */
export const symmetryRule = {
    id: 'symmetry',
    name: 'Symmetry',
    description: 'Arranges objects symmetrically around an axis',
    relation: SpatialRelation.SYMMETRICAL,
    principles: [AestheticPrinciple.BALANCE, AestheticPrinciple.HARMONY],
    priority: 75,
    parameters: {
        axis: 'x', // 'x', 'y', or 'z'
        plane: 'yz', // Plane of symmetry
        pairs: true, // Create pairs or mirror all
    },
    validator: (context) => {
        return context.existingObjects.length >= 2;
    },
    applier: (context) => {
        const result = {
            success: true,
            transformations: [],
            conflicts: [],
            score: 0,
            metrics: {
                balanceScore: 0, rhythmScore: 0, proportionScore: 0, harmonyScore: 0, overallScore: 0,
                details: { centerOfMass: new Vector3(), boundingVolume: new Sphere(new Vector3(), 0), densityDistribution: [], goldenRatioDeviations: [] }
            },
        };
        if (context.existingObjects.length < 2)
            return result;
        const axis = symmetryRule.parameters.axis || 'x';
        const center = context.center || new Vector3();
        const pairsParam = symmetryRule.parameters.pairs;
        // Group objects into pairs
        const objects = [...context.existingObjects];
        const pairs = [];
        if (pairsParam) {
            while (objects.length >= 2) {
                pairs.push([objects.pop(), objects.pop()]);
            }
        }
        else {
            // Mirror each object
            for (const obj of objects) {
                const mirrored = { ...obj, nodeId: `${obj.nodeId}_mirror` };
                pairs.push([obj, mirrored]);
            }
        }
        // Arrange each pair symmetrically
        for (const [obj1, obj2] of pairs) {
            const center1 = obj1.bounds.getCenter(new Vector3());
            const center2 = obj2.bounds.getCenter(new Vector3());
            // Calculate midpoint
            const midpoint = center1.clone().add(center2).multiplyScalar(0.5);
            // Project midpoint onto symmetry plane
            const symmetricMidpoint = midpoint.clone();
            symmetricMidpoint[axis] = center[axis];
            // Calculate offsets from midpoint
            const offset1 = center1.sub(midpoint);
            const offset2 = center2.sub(midpoint);
            // Apply symmetric positions
            const pos1 = symmetricMidpoint.clone().add(offset1);
            const pos2 = symmetricMidpoint.clone().add(offset2);
            result.transformations.push({ nodeId: obj1.nodeId, position: pos1 }, { nodeId: obj2.nodeId, position: pos2 });
        }
        return result;
    },
};
// Export all basic rules
export const basicRules = [
    centerObjectRule,
    alignObjectsRule,
    gridDistributionRule,
    radialArrangementRule,
    separationRule,
    symmetryRule,
];
//# sourceMappingURL=BasicRules.js.map