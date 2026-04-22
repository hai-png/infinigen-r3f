/**
 * Primitive Node Groups - Pre-built node group templates
 * Based on infinigen/core/nodes/nodegroups/
 * 
 * Provides reusable node group patterns for common material effects
 */

import { NodeWrangler, NodeGroup } from '../core/node-wrangler';
import { NodeTypes } from '../core/node-types';

export interface PrimitiveGroupConfig {
  name: string;
  wrangler: NodeWrangler;
  location?: [number, number];
}

/**
 * Creates a bump mapping node group
 * Converts height/displacement to normal vectors
 */
export function createBumpGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('Bump');
  const groupId = group.id;
  
  // Create nodes
  const bumpNode = wrangler.newNode(
    NodeTypes.BUMP,
    'Bump',
    [location[0], location[1]],
    { strength: 1.0, distance: 1.0 }
  );
  
  const normalOutput = wrangler.newNode(
    NodeTypes.OUTPUT_NORMAL,
    'Normal Output',
    [location[0] + 300, location[1]]
  );
  
  // Connect nodes
  wrangler.connect(bumpNode.id, 'Normal', normalOutput.id, 'Normal');
  
  // Expose inputs
  wrangler.exposeInput(groupId, bumpNode.id, 'Height', 'Height');
  wrangler.exposeInput(groupId, bumpNode.id, 'Strength', 'Strength');
  wrangler.exposeInput(groupId, bumpNode.id, 'Distance', 'Distance');
  
  // Expose output
  wrangler.exposeOutput(groupId, normalOutput.id, 'Normal', 'Normal');
  
  return group;
}

/**
 * Creates a normal map processing node group
 */
export function createNormalMapGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('NormalMap');
  const groupId = group.id;
  
  const normalMapNode = wrangler.newNode(
    NodeTypes.NORMAL_MAP,
    'Normal Map',
    [location[0], location[1]],
    { strength: 1.0 }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_NORMAL,
    'Normal Output',
    [location[0] + 300, location[1]]
  );
  
  wrangler.connect(normalMapNode.id, 'Normal', output.id, 'Normal');
  
  wrangler.exposeInput(groupId, normalMapNode.id, 'Color', 'Color');
  wrangler.exposeInput(groupId, normalMapNode.id, 'Strength', 'Strength');
  wrangler.exposeOutput(groupId, output.id, 'Normal', 'Normal');
  
  return group;
}

/**
 * Creates a color ramp node group for gradient mapping
 */
export function createColorRampGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('ColorRamp');
  const groupId = group.id;
  
  const colorRampNode = wrangler.newNode(
    NodeTypes.COLOR_RAMP,
    'Color Ramp',
    [location[0], location[1]],
    {
      elements: [
        { position: 0.0, color: [0, 0, 0, 1] },
        { position: 1.0, color: [1, 1, 1, 1] },
      ],
      interpolation: 'LINEAR',
    }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_COLOR,
    'Color Output',
    [location[0] + 300, location[1]]
  );
  
  wrangler.connect(colorRampNode.id, 'Color', output.id, 'Color');
  
  wrangler.exposeInput(groupId, colorRampNode.id, 'Fac', 'Factor');
  wrangler.exposeOutput(groupId, output.id, 'Color', 'Color');
  
  return group;
}

/**
 * Creates a texture coordinate transformation group
 */
export function createTexCoordGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('TexCoordTransform');
  const groupId = group.id;
  
  const texCoordNode = wrangler.newNode(
    NodeTypes.TEX_COORD,
    'Texture Coordinate',
    [location[0], location[1]],
    { generated: false }
  );
  
  const mappingNode = wrangler.newNode(
    NodeTypes.MAPPING,
    'Mapping',
    [location[0] + 200, location[1]],
    {
      translation: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_VECTOR,
    'Vector Output',
    [location[0] + 400, location[1]]
  );
  
  wrangler.connect(texCoordNode.id, 'UV', mappingNode.id, 'Vector');
  wrangler.connect(mappingNode.id, 'Vector', output.id, 'Vector');
  
  wrangler.exposeInput(groupId, mappingNode.id, 'Translation', 'Translation');
  wrangler.exposeInput(groupId, mappingNode.id, 'Rotation', 'Rotation');
  wrangler.exposeInput(groupId, mappingNode.id, 'Scale', 'Scale');
  wrangler.exposeOutput(groupId, output.id, 'Vector', 'Vector');
  
  return group;
}

/**
 * Creates a noise texture with advanced controls
 */
export function createNoiseTextureGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('NoiseTexture');
  const groupId = group.id;
  
  const noiseNode = wrangler.newNode(
    NodeTypes.TEX_NOISE,
    'Noise Texture',
    [location[0], location[1]],
    {
      scale: 5.0,
      detail: 2.0,
      roughness: 0.5,
      distortion: 0.0,
    }
  );
  
  const colorRampNode = wrangler.newNode(
    NodeTypes.COLOR_RAMP,
    'Color Ramp',
    [location[0] + 200, location[1]],
    {
      elements: [
        { position: 0.0, color: [0, 0, 0, 1] },
        { position: 1.0, color: [1, 1, 1, 1] },
      ],
    }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_COLOR,
    'Color Output',
    [location[0] + 400, location[1]]
  );
  
  wrangler.connect(noiseNode.id, 'Color', colorRampNode.id, 'Fac');
  wrangler.connect(colorRampNode.id, 'Color', output.id, 'Color');
  
  wrangler.exposeInput(groupId, noiseNode.id, 'Vector', 'Vector');
  wrangler.exposeInput(groupId, noiseNode.id, 'Scale', 'Scale');
  wrangler.exposeInput(groupId, noiseNode.id, 'Detail', 'Detail');
  wrangler.exposeInput(groupId, colorRampNode.id, 'Fac', 'Contrast');
  wrangler.exposeOutput(groupId, output.id, 'Color', 'Color');
  
  return group;
}

/**
 * Creates a principled BSDF material group with common inputs
 */
export function createPrincipledBSDFGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('PrincipledBSDF');
  const groupId = group.id;
  
  const bsdfNode = wrangler.newNode(
    NodeTypes.BSDF_PRINCIPLED,
    'Principled BSDF',
    [location[0], location[1]],
    {
      baseColor: [0.8, 0.8, 0.8, 1],
      metallic: 0.0,
      roughness: 0.5,
      specular: 0.5,
      clearcoat: 0.0,
      clearcoatRoughness: 0.03,
    }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_MATERIAL,
    'Material Output',
    [location[0] + 300, location[1]]
  );
  
  wrangler.connect(bsdfNode.id, 'BSDF', output.id, 'Surface');
  
  // Expose all important inputs
  wrangler.exposeInput(groupId, bsdfNode.id, 'Base Color', 'Base Color');
  wrangler.exposeInput(groupId, bsdfNode.id, 'Metallic', 'Metallic');
  wrangler.exposeInput(groupId, bsdfNode.id, 'Roughness', 'Roughness');
  wrangler.exposeInput(groupId, bsdfNode.id, 'Normal', 'Normal');
  wrangler.exposeInput(groupId, bsdfNode.id, 'Specular', 'Specular');
  wrangler.exposeInput(groupId, bsdfNode.id, 'Clearcoat', 'Clearcoat');
  
  wrangler.exposeOutput(groupId, output.id, 'Surface', 'Surface');
  
  return group;
}

/**
 * Creates a layer weight node group for fresnel effects
 */
export function createLayerWeightGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('LayerWeight');
  const groupId = group.id;
  
  const layerWeightNode = wrangler.newNode(
    NodeTypes.LAYER_WEIGHT,
    'Layer Weight',
    [location[0], location[1]],
    { blend: 0.5 }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_VALUE,
    'Value Output',
    [location[0] + 200, location[1]]
  );
  
  wrangler.connect(layerWeightNode.id, 'Facing', output.id, 'Value');
  
  wrangler.exposeInput(groupId, layerWeightNode.id, 'Blend', 'Blend');
  wrangler.exposeOutput(groupId, output.id, 'Value', 'Fresnel');
  
  return group;
}

/**
 * Creates a vector math operations group
 */
export function createVectorMathGroup(config: PrimitiveGroupConfig): NodeGroup {
  const { wrangler, location = [0, 0] } = config;
  
  const group = wrangler.createNodeGroup('VectorMath');
  const groupId = group.id;
  
  const vectorMathNode = wrangler.newNode(
    NodeTypes.VECTOR_MATH,
    'Vector Math',
    [location[0], location[1]],
    { operation: 'ADD' }
  );
  
  const output = wrangler.newNode(
    NodeTypes.OUTPUT_VECTOR,
    'Vector Output',
    [location[0] + 200, location[1]]
  );
  
  wrangler.connect(vectorMathNode.id, 'Vector', output.id, 'Vector');
  
  wrangler.exposeInput(groupId, vectorMathNode.id, 'Vector', 'Vector A');
  wrangler.exposeInput(groupId, vectorMathNode.id, 'Vector.001', 'Vector B');
  wrangler.exposeInput(groupId, vectorMathNode.id, 'Operation', 'Operation');
  wrangler.exposeOutput(groupId, output.id, 'Vector', 'Result');
  
  return group;
}

/**
 * Registry of all primitive groups
 */
export const PRIMITIVE_GROUPS: Record<string, (config: PrimitiveGroupConfig) => NodeGroup> = {
  'Bump': createBumpGroup,
  'NormalMap': createNormalMapGroup,
  'ColorRamp': createColorRampGroup,
  'TexCoordTransform': createTexCoordGroup,
  'NoiseTexture': createNoiseTextureGroup,
  'PrincipledBSDF': createPrincipledBSDFGroup,
  'LayerWeight': createLayerWeightGroup,
  'VectorMath': createVectorMathGroup,
};

/**
 * Factory function to create primitive groups by name
 */
export function createPrimitiveGroup(
  name: string,
  wrangler: NodeWrangler,
  location?: [number, number]
): NodeGroup | null {
  const creator = PRIMITIVE_GROUPS[name];
  if (!creator) {
    console.warn(`Unknown primitive group: ${name}`);
    return null;
  }
  
  return creator({ name, wrangler, location });
}

export default {
  createBumpGroup,
  createNormalMapGroup,
  createColorRampGroup,
  createTexCoordGroup,
  createNoiseTextureGroup,
  createPrincipledBSDFGroup,
  createLayerWeightGroup,
  createVectorMathGroup,
  createPrimitiveGroup,
  PRIMITIVE_GROUPS,
};
