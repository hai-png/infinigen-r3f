/**
 * Shader Nodes for Geometry Nodes System
 *
 * Handles material/shader node definitions and execution
 * Based on original: infinigen/core/nodes/nodegroups/shader_nodes.py
 */
import { Color, Vector3 } from 'three';
import type { NodeDefinition } from '../core/types';
export interface PrincipledBSDFNode {
    type: 'principled_bsdf';
    inputs: {
        baseColor: Color | string;
        subsurfaceWeight: number;
        subsurfaceRadius: Vector3;
        subsurfaceColor: Color;
        metallic: number;
        specular: number;
        specularTint: number;
        roughness: number;
        anisotropic: number;
        anisotropicRotation: number;
        sheen: number;
        sheenTint: number;
        clearcoat: number;
        clearcoatRoughness: number;
        ior: number;
        transmission: number;
        transmissionRoughness: number;
        emissionStrength: number;
        emissionColor: Color;
        alpha: number;
        normal?: Vector3;
        tangent?: Vector3;
    };
    outputs: {
        bsdf: any;
    };
}
export interface BsdfDiffuseNode {
    type: 'bsdf_diffuse';
    inputs: {
        color: Color | string;
        roughness: number;
        normal?: Vector3;
    };
    outputs: {
        bsdf: any;
    };
}
export interface BsdfGlossyNode {
    type: 'bsdf_glossy';
    inputs: {
        color: Color | string;
        roughness: number;
        distribution: 'beckmann' | 'ggx' | 'multiggx';
        normal?: Vector3;
    };
    outputs: {
        bsdf: any;
    };
}
export interface BsdfGlassNode {
    type: 'bsdf_glass';
    inputs: {
        color: Color | string;
        roughness: number;
        ior: number;
        normal?: Vector3;
    };
    outputs: {
        bsdf: any;
    };
}
export interface EmissionNode {
    type: 'emission';
    inputs: {
        color: Color | string;
        strength: number;
    };
    outputs: {
        emission: any;
    };
}
export interface TransparentBSDFNode {
    type: 'transparent_bsdf';
    inputs: {
        color: Color | string;
        normal?: Vector3;
    };
    outputs: {
        bsdf: any;
    };
}
export interface RefractionBSDFNode {
    type: 'refraction_bsdf';
    inputs: {
        color: Color | string;
        roughness: number;
        ior: number;
        normal?: Vector3;
    };
    outputs: {
        bsdf: any;
    };
}
export interface MixShaderNode {
    type: 'mix_shader';
    inputs: {
        factor: number;
        shader1: any;
        shader2: any;
    };
    outputs: {
        shader: any;
    };
}
export interface AddShaderNode {
    type: 'add_shader';
    inputs: {
        shader1: any;
        shader2: any;
    };
    outputs: {
        shader: any;
    };
}
export interface AmbientOcclusionNode {
    type: 'ambient_occlusion';
    inputs: {
        normal?: Vector3;
        distance?: number;
    };
    parameters: {
        samples: number;
        onlyLocal: boolean;
    };
    outputs: {
        occlusion: number;
    };
}
export interface TextureCoordinateNode {
    type: 'texture_coordinate';
    inputs: {};
    outputs: {
        generated: Vector3;
        normal: Vector3;
        uv: Vector3;
        object: Vector3;
        camera: Vector3;
        window: Vector3;
    };
}
export interface MappingNode {
    type: 'mapping';
    inputs: {
        vector: Vector3;
    };
    parameters: {
        translation: Vector3;
        rotation: Vector3;
        scale: Vector3;
        type: 'point' | 'texture' | 'vector' | 'normal';
    };
    outputs: {
        vector: Vector3;
    };
}
export interface TexCoordUVNode {
    type: 'tex_coord_uv';
    inputs: {};
    parameters: {
        uvMapName?: string;
    };
    outputs: {
        uv: Vector3;
    };
}
/**
 * Principled BSDF Node
 * Physically-based rendering shader following Disney's principled model
 */
export declare const PrincipledBSDFDefinition: NodeDefinition<PrincipledBSDFNode>;
/**
 * Diffuse BSDF Node
 * Lambertian diffuse reflection shader
 */
export declare const BsdfDiffuseDefinition: NodeDefinition<BsdfDiffuseNode>;
/**
 * Glossy BSDF Node
 * Perfect specular reflection shader
 */
export declare const BsdfGlossyDefinition: NodeDefinition<BsdfGlossyNode>;
/**
 * Glass BSDF Node
 * Refractive glass shader
 */
export declare const BsdfGlassDefinition: NodeDefinition<BsdfGlassNode>;
/**
 * Emission Node
 * Light-emitting shader
 */
export declare const EmissionDefinition: NodeDefinition<EmissionNode>;
/**
 * Transparent BSDF Node
 * Fully transparent shader
 */
export declare const TransparentBSDFDefinition: NodeDefinition<TransparentBSDFNode>;
/**
 * Refraction BSDF Node
 * Pure refraction shader
 */
export declare const RefractionBSDFDefinition: NodeDefinition<RefractionBSDFNode>;
/**
 * Mix Shader Node
 * Mixes two shaders based on a factor
 */
export declare const MixShaderDefinition: NodeDefinition<MixShaderNode>;
/**
 * Add Shader Node
 * Adds two shaders together
 */
export declare const AddShaderDefinition: NodeDefinition<AddShaderNode>;
/**
 * Ambient Occlusion Node
 * Calculates ambient occlusion factor
 */
export declare const AmbientOcclusionDefinition: NodeDefinition<AmbientOcclusionNode>;
/**
 * Texture Coordinate Node
 * Provides various texture coordinate systems
 */
export declare const TextureCoordinateDefinition: NodeDefinition<TextureCoordinateNode>;
/**
 * Mapping Node
 * Transforms texture coordinates
 */
export declare const MappingDefinition: NodeDefinition<MappingNode>;
/**
 * Execute Principled BSDF Node
 * Creates a PBR material configuration
 */
export declare function executePrincipledBSDF(node: PrincipledBSDFNode): {
    materialConfig: any;
};
/**
 * Execute Diffuse BSDF Node
 */
export declare function executeBsdfDiffuse(node: BsdfDiffuseNode): {
    materialConfig: any;
};
/**
 * Execute Glossy BSDF Node
 */
export declare function executeBsdfGlossy(node: BsdfGlossyNode): {
    materialConfig: any;
};
/**
 * Execute Glass BSDF Node
 */
export declare function executeBsdfGlass(node: BsdfGlassNode): {
    materialConfig: any;
};
/**
 * Execute Emission Node
 */
export declare function executeEmission(node: EmissionNode): {
    materialConfig: any;
};
/**
 * Execute Mix Shader Node
 */
export declare function executeMixShader(node: MixShaderNode): {
    materialConfig: any;
};
/**
 * Execute Mapping Node
 */
export declare function executeMapping(node: MappingNode, vector: Vector3): Vector3;
/**
 * Execute Texture Coordinate Node
 */
export declare function executeTextureCoordinate(geometry: THREE.BufferGeometry): {
    generated: Vector3[];
    normal: Vector3[];
    uv: Vector3[];
    object: Vector3[];
};
/**
 * Parse color from various input types
 */
export declare function parseColor(input: Color | string | number): Color;
/**
 * Create Three.js material from shader node output
 */
export declare function createMaterialFromShader(shaderOutput: any, materialType?: 'physical' | 'standard' | 'lambert'): THREE.Material;
//# sourceMappingURL=PrincipledNodes.d.ts.map