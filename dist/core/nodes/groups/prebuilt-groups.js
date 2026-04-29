/**
 * Node Groups - Pre-built node group utilities
 *
 * Ports: infinigen/core/nodes/nodegroups/
 *
 * Provides reusable node groups for common procedural generation tasks.
 */
import { createGeometryNodeTree, createMaterialNodeTree } from '../core/node-wrangler.js';
import { NodeType } from '../core/types.js';
/**
 * Create a noise-based displacement node group
 */
export function createNoiseDisplacementGroup(name = 'NoiseDisplacement', scale = 5, detail = 2, strength = 1) {
    const nw = createGeometryNodeTree(name);
    // Add nodes
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.GroupOutput)[0];
    const noise = nw.addNode(NodeType.NoiseTexture, 'Noise Texture', { x: -200, y: 0 });
    const colorRamp = nw.addNode(NodeType.ColorRamp, 'ColorRamp', { x: 0, y: 0 });
    const setPos = nw.addNode(NodeType.SetPosition, 'Set Position', { x: 200, y: 0 });
    // Configure nodes
    nw.setInputValue(noise, 'Scale', scale);
    nw.setInputValue(noise, 'Detail', detail);
    nw.setInputValue(setPos, 'Offset', [0, 0, strength]);
    // Connect nodes
    nw.link(groupInput, 'Geometry', setPos, 'Geometry');
    nw.link(noise, 'Fac', colorRamp, 'Fac');
    nw.link(colorRamp, 'Fac', setPos, 'Selection');
    nw.link(setPos, 'Geometry', groupOutput, 'Geometry');
    return nw;
}
/**
 * Create a principled material node group
 */
export function createPrincipledMaterialGroup(name = 'PrincipledMaterial', baseColor = [0.8, 0.8, 0.8, 1], roughness = 0.5, metallic = 0) {
    const nw = createMaterialNodeTree(name);
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.MaterialOutput)[0] ||
        nw.addNode(NodeType.MaterialOutput, 'Material Output', { x: 400, y: 0 });
    const principled = nw.addNode(NodeType.PrincipledBSDF, 'Principled BSDF', { x: 200, y: 0 });
    // Configure
    nw.setInputValue(principled, 'Base Color', baseColor);
    nw.setInputValue(principled, 'Roughness', roughness);
    nw.setInputValue(principled, 'Metallic', metallic);
    // Connect
    nw.link(principled, 'BSDF', groupOutput, 'Surface');
    return nw;
}
/**
 * Create a random distribution node group
 */
export function createRandomDistributionGroup(name = 'RandomDistribution', min = 0, max = 1, seed = 0) {
    const nw = createGeometryNodeTree(name);
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.GroupOutput)[0];
    const random = nw.addNode(NodeType.RandomValue, 'Random Value', { x: 0, y: 0 });
    // Configure
    nw.setInputValue(random, 'Min', min);
    nw.setInputValue(random, 'Max', max);
    nw.setInputValue(random, 'Seed', seed);
    // Connect
    nw.link(random, 'Value', groupOutput, 'Value');
    return nw;
}
/**
 * Create an instance-on-points node group
 */
export function createInstanceOnPointsGroup(name = 'InstanceOnPoints', rotateInstances = true, scaleInstances = true) {
    const nw = createGeometryNodeTree(name);
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.GroupOutput)[0];
    const instanceOnPoints = nw.addNode(NodeType.InstanceOnPoints, 'Instance on Points', { x: 0, y: 0 });
    const realizeInstances = nw.addNode(NodeType.RealizeInstances, 'Realize Instances', { x: 200, y: 0 });
    // Connect
    nw.link(groupInput, 'Points', instanceOnPoints, 'Points');
    nw.link(groupInput, 'Instance', instanceOnPoints, 'Instance');
    nw.link(instanceOnPoints, 'Instances', realizeInstances, 'Geometry');
    nw.link(realizeInstances, 'Geometry', groupOutput, 'Geometry');
    if (rotateInstances) {
        nw.setInputValue(instanceOnPoints, 'Rotate Instances', true);
    }
    if (scaleInstances) {
        nw.setInputValue(instanceOnPoints, 'Scale Instances', true);
    }
    return nw;
}
/**
 * Create a mesh boolean operation node group
 */
export function createMeshBooleanGroup(name = 'MeshBoolean', operation = 'Union') {
    const nw = createGeometryNodeTree(name);
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.GroupOutput)[0];
    const boolean = nw.addNode(NodeType.MeshBoolean, 'Mesh Boolean', { x: 0, y: 0 });
    // Configure
    nw.setInputValue(boolean, 'Operation', operation);
    // Connect
    nw.link(groupInput, 'Mesh 1', boolean, 'Mesh 1');
    nw.link(groupInput, 'Mesh 2', boolean, 'Mesh 2');
    nw.link(boolean, 'Mesh', groupOutput, 'Geometry');
    return nw;
}
/**
 * Create a texture coordinate + mapping node group
 */
export function createTextureMappingGroup(name = 'TextureMapping', location = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const nw = createMaterialNodeTree(name);
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.GroupOutput)[0];
    const texCoord = nw.addNode(NodeType.TextureCoordinate, 'Texture Coordinate', { x: -200, y: 0 });
    const mapping = nw.addNode(NodeType.Mapping, 'Mapping', { x: 0, y: 0 });
    // Configure
    nw.setInputValue(mapping, 'Location', location);
    nw.setInputValue(mapping, 'Rotation', rotation);
    nw.setInputValue(mapping, 'Scale', scale);
    // Connect
    nw.link(texCoord, 'UV', mapping, 'Vector');
    nw.link(mapping, 'Vector', groupOutput, 'Vector');
    return nw;
}
/**
 * Create a color ramp mapper node group
 */
export function createColorRampGroup(name = 'ColorRampMapper', stops = []) {
    const nw = createMaterialNodeTree(name);
    const groupInput = nw.findNodesByType(NodeType.GroupInput)[0];
    const groupOutput = nw.findNodesByType(NodeType.GroupOutput)[0];
    const colorRamp = nw.addNode(NodeType.ColorRamp, 'ColorRamp', { x: 0, y: 0 });
    // Configure stops
    nw.setInputValue(colorRamp, 'Stops', stops);
    // Connect
    nw.link(groupInput, 'Fac', colorRamp, 'Fac');
    nw.link(colorRamp, 'Color', groupOutput, 'Color');
    return nw;
}
/**
 * Export all pre-built node groups
 */
export const NodeGroups = {
    createNoiseDisplacementGroup,
    createPrincipledMaterialGroup,
    createRandomDistributionGroup,
    createInstanceOnPointsGroup,
    createMeshBooleanGroup,
    createTextureMappingGroup,
    createColorRampGroup,
};
//# sourceMappingURL=prebuilt-groups.js.map