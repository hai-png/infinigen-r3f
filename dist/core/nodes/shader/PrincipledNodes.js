/**
 * Shader Nodes for Geometry Nodes System
 *
 * Handles material/shader node definitions and execution
 * Based on original: infinigen/core/nodes/nodegroups/shader_nodes.py
 */
import { Color, Vector3 } from 'three';
import { SocketType } from '../core/socket-types';
// ============================================================================
// Node Definitions
// ============================================================================
/**
 * Principled BSDF Node
 * Physically-based rendering shader following Disney's principled model
 */
export const PrincipledBSDFDefinition = {
    name: 'Principled BSDF',
    type: 'principled_bsdf',
    category: 'shader',
    description: 'Physically-based rendering shader following Disney\'s principled model',
    inputs: [
        { name: 'Base Color', type: SocketType.COLOR, default: new Color(0.8, 0.8, 0.8) },
        { name: 'Subsurface Weight', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Subsurface Radius', type: SocketType.VECTOR, default: new Vector3(1.0, 0.2, 0.1) },
        { name: 'Subsurface Color', type: SocketType.COLOR, default: new Color(1.0, 1.0, 1.0) },
        { name: 'Metallic', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Specular', type: SocketType.FLOAT, default: 0.5 },
        { name: 'Specular Tint', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Roughness', type: SocketType.FLOAT, default: 0.5 },
        { name: 'Anisotropic', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Anisotropic Rotation', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Sheen', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Sheen Tint', type: SocketType.FLOAT, default: 0.5 },
        { name: 'Clearcoat', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Clearcoat Roughness', type: SocketType.FLOAT, default: 0.03 },
        { name: 'IOR', type: SocketType.FLOAT, default: 1.45 },
        { name: 'Transmission', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Transmission Roughness', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Emission Strength', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Emission Color', type: SocketType.COLOR, default: new Color(0.0, 0.0, 0.0) },
        { name: 'Alpha', type: SocketType.FLOAT, default: 1.0 },
        { name: 'Normal', type: SocketType.VECTOR, default: null },
        { name: 'Tangent', type: SocketType.VECTOR, default: null },
    ],
    outputs: [
        { name: 'BSDF', type: SocketType.SHADER },
    ],
    defaults: {
        baseColor: new Color(0.8, 0.8, 0.8),
        subsurfaceWeight: 0.0,
        subsurfaceRadius: new Vector3(1.0, 0.2, 0.1),
        subsurfaceColor: new Color(1.0, 1.0, 1.0),
        metallic: 0.0,
        specular: 0.5,
        specularTint: 0.0,
        roughness: 0.5,
        anisotropic: 0.0,
        anisotropicRotation: 0.0,
        sheen: 0.0,
        sheenTint: 0.5,
        clearcoat: 0.0,
        clearcoatRoughness: 0.03,
        ior: 1.45,
        transmission: 0.0,
        transmissionRoughness: 0.0,
        emissionStrength: 0.0,
        emissionColor: new Color(0.0, 0.0, 0.0),
        alpha: 1.0,
    },
};
/**
 * Diffuse BSDF Node
 * Lambertian diffuse reflection shader
 */
export const BsdfDiffuseDefinition = {
    name: 'Diffuse BSDF',
    type: 'bsdf_diffuse',
    category: 'shader',
    description: 'Lambertian diffuse reflection shader',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: new Color(0.8, 0.8, 0.8) },
        { name: 'Roughness', type: SocketType.FLOAT, default: 0.5 },
        { name: 'Normal', type: SocketType.VECTOR, default: null },
    ],
    outputs: [
        { name: 'BSDF', type: SocketType.SHADER },
    ],
    defaults: {
        color: new Color(0.8, 0.8, 0.8),
        roughness: 0.5,
    },
};
/**
 * Glossy BSDF Node
 * Perfect specular reflection shader
 */
export const BsdfGlossyDefinition = {
    name: 'Glossy BSDF',
    type: 'bsdf_glossy',
    category: 'shader',
    description: 'Perfect specular reflection shader',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: new Color(1.0, 1.0, 1.0) },
        { name: 'Roughness', type: SocketType.FLOAT, default: 0.0 },
        { name: 'Normal', type: SocketType.VECTOR, default: null },
    ],
    outputs: [
        { name: 'BSDF', type: SocketType.SHADER },
    ],
    parameters: [
        { name: 'Distribution', type: 'enum', options: ['beckmann', 'ggx', 'multiggx'], default: 'ggx' },
    ],
    defaults: {
        color: new Color(1.0, 1.0, 1.0),
        roughness: 0.0,
        distribution: 'ggx',
    },
};
/**
 * Glass BSDF Node
 * Refractive glass shader
 */
export const BsdfGlassDefinition = {
    name: 'Glass BSDF',
    type: 'bsdf_glass',
    category: 'shader',
    description: 'Refractive glass shader',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: new Color(1.0, 1.0, 1.0) },
        { name: 'Roughness', type: SocketType.FLOAT, default: 0.0 },
        { name: 'IOR', type: SocketType.FLOAT, default: 1.45 },
        { name: 'Normal', type: SocketType.VECTOR, default: null },
    ],
    outputs: [
        { name: 'BSDF', type: SocketType.SHADER },
    ],
    defaults: {
        color: new Color(1.0, 1.0, 1.0),
        roughness: 0.0,
        ior: 1.45,
    },
};
/**
 * Emission Node
 * Light-emitting shader
 */
export const EmissionDefinition = {
    name: 'Emission',
    type: 'emission',
    category: 'shader',
    description: 'Light-emitting shader',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: new Color(1.0, 1.0, 1.0) },
        { name: 'Strength', type: SocketType.FLOAT, default: 1.0 },
    ],
    outputs: [
        { name: 'Emission', type: SocketType.SHADER },
    ],
    defaults: {
        color: new Color(1.0, 1.0, 1.0),
        strength: 1.0,
    },
};
/**
 * Transparent BSDF Node
 * Fully transparent shader
 */
export const TransparentBSDFDefinition = {
    name: 'Transparent BSDF',
    type: 'transparent_bsdf',
    category: 'shader',
    description: 'Fully transparent shader',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: new Color(1.0, 1.0, 1.0) },
        { name: 'Normal', type: SocketType.VECTOR, default: null },
    ],
    outputs: [
        { name: 'BSDF', type: SocketType.SHADER },
    ],
    defaults: {
        color: new Color(1.0, 1.0, 1.0),
    },
};
/**
 * Refraction BSDF Node
 * Pure refraction shader
 */
export const RefractionBSDFDefinition = {
    name: 'Refraction BSDF',
    type: 'refraction_bsdf',
    category: 'shader',
    description: 'Pure refraction shader',
    inputs: [
        { name: 'Color', type: SocketType.COLOR, default: new Color(1.0, 1.0, 1.0) },
        { name: 'Roughness', type: SocketType.FLOAT, default: 0.0 },
        { name: 'IOR', type: SocketType.FLOAT, default: 1.45 },
        { name: 'Normal', type: SocketType.VECTOR, default: null },
    ],
    outputs: [
        { name: 'BSDF', type: SocketType.SHADER },
    ],
    defaults: {
        color: new Color(1.0, 1.0, 1.0),
        roughness: 0.0,
        ior: 1.45,
    },
};
/**
 * Mix Shader Node
 * Mixes two shaders based on a factor
 */
export const MixShaderDefinition = {
    name: 'Mix Shader',
    type: 'mix_shader',
    category: 'shader',
    description: 'Mixes two shaders based on a factor',
    inputs: [
        { name: 'Factor', type: SocketType.FLOAT, default: 0.5 },
        { name: 'Shader 1', type: SocketType.SHADER, required: true },
        { name: 'Shader 2', type: SocketType.SHADER, required: true },
    ],
    outputs: [
        { name: 'Shader', type: SocketType.SHADER },
    ],
    defaults: {
        factor: 0.5,
    },
};
/**
 * Add Shader Node
 * Adds two shaders together
 */
export const AddShaderDefinition = {
    name: 'Add Shader',
    type: 'add_shader',
    category: 'shader',
    description: 'Adds two shaders together',
    inputs: [
        { name: 'Shader 1', type: SocketType.SHADER, required: true },
        { name: 'Shader 2', type: SocketType.SHADER, required: true },
    ],
    outputs: [
        { name: 'Shader', type: SocketType.SHADER },
    ],
};
/**
 * Ambient Occlusion Node
 * Calculates ambient occlusion factor
 */
export const AmbientOcclusionDefinition = {
    name: 'Ambient Occlusion',
    type: 'ambient_occlusion',
    category: 'shader',
    description: 'Calculates ambient occlusion factor',
    inputs: [
        { name: 'Normal', type: SocketType.VECTOR, default: null },
        { name: 'Distance', type: SocketType.FLOAT, default: 0.0 },
    ],
    outputs: [
        { name: 'Occlusion', type: SocketType.FLOAT },
    ],
    parameters: [
        { name: 'Samples', type: 'integer', default: 16, min: 1 },
        { name: 'Only Local', type: 'boolean', default: false },
    ],
    defaults: {
        samples: 16,
        onlyLocal: false,
    },
};
/**
 * Texture Coordinate Node
 * Provides various texture coordinate systems
 */
export const TextureCoordinateDefinition = {
    name: 'Texture Coordinate',
    type: 'texture_coordinate',
    category: 'shader',
    description: 'Provides various texture coordinate systems',
    inputs: [],
    outputs: [
        { name: 'Generated', type: SocketType.VECTOR },
        { name: 'Normal', type: SocketType.VECTOR },
        { name: 'UV', type: SocketType.VECTOR },
        { name: 'Object', type: SocketType.VECTOR },
        { name: 'Camera', type: SocketType.VECTOR },
        { name: 'Window', type: SocketType.VECTOR },
    ],
};
/**
 * Mapping Node
 * Transforms texture coordinates
 */
export const MappingDefinition = {
    name: 'Mapping',
    type: 'mapping',
    category: 'shader',
    description: 'Transforms texture coordinates (translation, rotation, scale)',
    inputs: [
        { name: 'Vector', type: SocketType.VECTOR, required: true },
    ],
    outputs: [
        { name: 'Vector', type: SocketType.VECTOR },
    ],
    parameters: [
        { name: 'Translation', type: 'vector', default: new Vector3(0, 0, 0) },
        { name: 'Rotation', type: 'vector', default: new Vector3(0, 0, 0) },
        { name: 'Scale', type: 'vector', default: new Vector3(1, 1, 1) },
        { name: 'Type', type: 'enum', options: ['point', 'texture', 'vector', 'normal'], default: 'point' },
    ],
    defaults: {
        translation: new Vector3(0, 0, 0),
        rotation: new Vector3(0, 0, 0),
        scale: new Vector3(1, 1, 1),
        type: 'point',
    },
};
// ============================================================================
// Execution Functions
// ============================================================================
/**
 * Execute Principled BSDF Node
 * Creates a PBR material configuration
 */
export function executePrincipledBSDF(node) {
    const { baseColor, metallic, roughness, specular, ior, transmission, emissionStrength, emissionColor, alpha, clearcoat, clearcoatRoughness, subsurfaceWeight, } = node.inputs;
    // Convert to Three.js MeshPhysicalMaterial configuration
    const materialConfig = {
        color: typeof baseColor === 'string' ? baseColor : '#' + baseColor.getHexString(),
        metalness: metallic,
        roughness: roughness,
        reflectivity: specular,
        ior: ior,
        transmission: transmission > 0,
        transmissionMap: transmission > 0 ? undefined : null,
        emissive: typeof emissionColor === 'string' ? emissionColor : '#' + emissionColor.getHexString(),
        emissiveIntensity: emissionStrength,
        opacity: alpha,
        transparent: alpha < 1.0,
        clearcoat: clearcoat,
        clearcoatRoughness: clearcoatRoughness,
        // Subsurface scattering would require custom shader
        subsurface: subsurfaceWeight > 0,
    };
    return { materialConfig };
}
/**
 * Execute Diffuse BSDF Node
 */
export function executeBsdfDiffuse(node) {
    const { color, roughness } = node.inputs;
    const materialConfig = {
        color: typeof color === 'string' ? color : '#' + color.getHexString(),
        roughness: roughness,
        metalness: 0.0,
    };
    return { materialConfig };
}
/**
 * Execute Glossy BSDF Node
 */
export function executeBsdfGlossy(node) {
    const { color, roughness, distribution } = node.inputs;
    const materialConfig = {
        color: typeof color === 'string' ? color : '#' + color.getHexString(),
        metalness: 1.0,
        roughness: roughness,
        // Distribution affects microfacet model (GGX is default in Three.js)
    };
    return { materialConfig };
}
/**
 * Execute Glass BSDF Node
 */
export function executeBsdfGlass(node) {
    const { color, roughness, ior } = node.inputs;
    const materialConfig = {
        color: typeof color === 'string' ? color : '#' + color.getHexString(),
        metalness: 0.0,
        roughness: roughness,
        transmission: true,
        ior: ior,
        transparent: true,
        opacity: 1.0,
    };
    return { materialConfig };
}
/**
 * Execute Emission Node
 */
export function executeEmission(node) {
    const { color, strength } = node.inputs;
    const materialConfig = {
        emissive: typeof color === 'string' ? color : '#' + color.getHexString(),
        emissiveIntensity: strength,
    };
    return { materialConfig };
}
/**
 * Execute Mix Shader Node
 */
export function executeMixShader(node) {
    const { factor, shader1, shader2 } = node.inputs;
    // In a full implementation, this would blend two material configs
    const materialConfig = {
        mixFactor: factor,
        shader1,
        shader2,
    };
    return { materialConfig };
}
/**
 * Execute Mapping Node
 */
export function executeMapping(node, vector) {
    const { translation, rotation, scale, type } = node.parameters;
    const result = vector.clone();
    // Apply transformations in order: scale -> rotate -> translate
    result.multiply(scale);
    // Apply rotation (simplified - would need proper rotation matrix)
    // For now, skip rotation as it requires more complex math
    result.add(translation);
    return result;
}
/**
 * Execute Texture Coordinate Node
 */
export function executeTextureCoordinate(geometry) {
    const posAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;
    const generated = [];
    const normal = [];
    const uv = [];
    const object = [];
    if (!posAttr) {
        return { generated: [], normal: [], uv: [], object: [] };
    }
    // Compute bounding box for generated coordinates
    const bbox = geometry.boundingBox || new Box3().setFromObject({ geometry });
    const min = bbox.min;
    const max = bbox.max;
    const size = new Vector3().subVectors(max, min);
    for (let i = 0; i < posAttr.count; i++) {
        // Generated: normalized position in bounding box
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        generated.push(new Vector3((x - min.x) / size.x, (y - min.y) / size.y, (z - min.z) / size.z));
        // Normal
        if (normalAttr) {
            normal.push(new Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)));
        }
        else {
            normal.push(new Vector3(0, 1, 0));
        }
        // UV
        if (uvAttr) {
            uv.push(new Vector3(uvAttr.getX(i), uvAttr.getY(i), 0));
        }
        else {
            uv.push(new Vector3(0, 0, 0));
        }
        // Object (same as position for now)
        object.push(new Vector3(x, y, z));
    }
    return { generated, normal, uv, object };
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Parse color from various input types
 */
export function parseColor(input) {
    if (input instanceof Color) {
        return input;
    }
    if (typeof input === 'string') {
        return new Color(input);
    }
    if (typeof input === 'number') {
        return new Color(input);
    }
    return new Color(1, 1, 1);
}
/**
 * Create Three.js material from shader node output
 */
export function createMaterialFromShader(shaderOutput, materialType = 'physical') {
    // This would be implemented with actual Three.js material creation
    // For now, return placeholder
    console.warn('createMaterialFromShader not fully implemented');
    return new THREE.MeshStandardMaterial();
}
//# sourceMappingURL=PrincipledNodes.js.map