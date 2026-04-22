/**
 * Infinigen R3F Port - Surface Kernel System
 * 
 * Based on the original Infinigen surface kernel system from:
 * infinigen/terrain/surface_kernel/core.py
 * 
 * This system provides procedural surface generation for terrain,
 * including displacement, material blending, and attribute modification.
 */

import { Vector3 } from 'three';

/**
 * Surface output variables (mirroring Vars enum from original)
 */
export enum SurfaceVar {
  Position = 'position',
  Normal = 'normal',
  Offset = 'offset',
  Displacement = 'displacement',
  Color = 'color',
  Roughness = 'roughness',
  Metallic = 'metallic',
  NormalMap = 'normalMap',
}

/**
 * Data types for surface kernel parameters
 */
export enum KernelDataType {
  float = 'float',
  float2 = 'float2',
  float3 = 'float3',
  float4 = 'float4',
  int = 'int',
}

/**
 * Surface vertex data structure
 */
export interface SurfaceVertex {
  position: Vector3;
  normal: Vector3;
  attributes: Record<string, number | Vector3>;
}

/**
 * Surface mesh structure
 */
export interface SurfaceMesh {
  vertices: Vector3[];
  normals: Vector3[];
  vertexAttributes: Record<string, Float32Array>;
}

/**
 * Parameter type for surface kernels
 */
export type KernelParam = 
  | number 
  | Vector3 
  | Vector3[] 
  | number[];

/**
 * Surface kernel input/output specification
 */
export interface KernelSpec {
  inputs: Record<string, { type: KernelDataType; value: KernelParam }>;
  outputs: SurfaceVar[];
}

/**
 * Base class for all surface kernels
 * 
 * Mirrors the SurfaceKernel class from the original Python implementation.
 * Each surface type (dirt, snow, ice, etc.) extends this base class
 * and implements the evaluate method to compute surface properties.
 */
export abstract class SurfaceKernel {
  /** Unique name identifier for this surface type */
  public readonly name: string;
  
  /** Attribute name used for masking/blending */
  public readonly attribute: string;
  
  /** Device target (cpu/gpu/webgl/webgpu) */
  public readonly device: 'cpu' | 'gpu' | 'webgl' | 'webgpu';
  
  /** Whether this kernel uses position data */
  public readonly usePosition: boolean;
  
  /** Whether this kernel uses normal data */
  public readonly useNormal: boolean;
  
  /** Immutable parameter values */
  protected paramValues: Map<string, KernelParam>;
  
  /** Output variable specifications */
  protected outputs: SurfaceVar[];

  constructor(
    name: string,
    attribute: string = 'surface_weight',
    device: 'cpu' | 'gpu' | 'webgl' | 'webgpu' = 'cpu'
  ) {
    this.name = name;
    this.attribute = attribute;
    this.device = device;
    this.paramValues = new Map();
    this.outputs = [];
    this.usePosition = true;
    this.useNormal = true;
    
    // Initialize outputs based on kernel type
    this.outputs = [SurfaceVar.Offset];
  }

  /**
   * Register a parameter value for this kernel
   * @param name - Parameter name
   * @param value - Parameter value (number, Vector3, or array)
   */
  public setParam(name: string, value: KernelParam): this {
    this.paramValues.set(name, value);
    return this;
  }

  /**
   * Get a parameter value by name
   * @param name - Parameter name
   * @returns Parameter value or undefined if not found
   */
  public getParam(name: string): KernelParam | undefined {
    return this.paramValues.get(name);
  }

  /**
   * Get all parameters as a flat array (for GPU transfer)
   * @returns Object with floatParams and float3Params arrays
   */
  public getParamArrays(): { floatParams: number[]; float3Params: Vector3[] } {
    const floatParams: number[] = [];
    const float3Params: Vector3[] = [];

    // Sort parameter names for consistent ordering
    const sortedNames = Array.from(this.paramValues.keys()).sort();

    for (const name of sortedNames) {
      const value = this.paramValues.get(name)!;
      if (typeof value === 'number') {
        floatParams.push(value);
      } else if (value instanceof Vector3) {
        float3Params.push(value);
      } else if (Array.isArray(value)) {
        if (typeof value[0] === 'number') {
          floatParams.push(...(value as number[]));
        } else {
          float3Params.push(...(value as Vector3[]));
        }
      }
    }

    return { floatParams, float3Params };
  }

  /**
   * Evaluate the surface kernel on a single vertex
   * @param vertex - Input vertex data
   * @returns Output values for each output variable
   */
  public abstract evaluate(vertex: SurfaceVertex): Record<SurfaceVar, number | Vector3>;

  /**
   * Apply the kernel to an entire mesh
   * @param mesh - Input mesh data
   * @returns Modified mesh with updated attributes
   */
  public apply(mesh: SurfaceMesh): SurfaceMesh {
    const N = mesh.vertices.length;
    const results: Record<SurfaceVar, (number | Vector3)[]> = {};

    // Initialize result arrays
    for (const output of this.outputs) {
      results[output] = [];
    }

    // Evaluate each vertex
    for (let i = 0; i < N; i++) {
      const vertex: SurfaceVertex = {
        position: mesh.vertices[i],
        normal: mesh.normals[i],
        attributes: {},
      };

      // Extract existing attributes
      for (const key in mesh.vertexAttributes) {
        const attr = mesh.vertexAttributes[key];
        if (attr.length >= i * 3 + 3) {
          vertex.attributes[key] = new Vector3(
            attr[i * 3],
            attr[i * 3 + 1],
            attr[i * 3 + 2]
          );
        } else if (attr.length >= i + 1) {
          vertex.attributes[key] = attr[i];
        }
      }

      // Get surface weight attribute for masking
      const surfaceWeight = vertex.attributes[this.attribute] as number ?? 1.0;

      // Evaluate kernel
      const outputs = this.evaluate(vertex);

      // Apply masking and store results
      for (const output of this.outputs) {
        let value = outputs[output];
        
        // Apply surface weight mask
        if (value instanceof Vector3) {
          value = value.clone().multiplyScalar(surfaceWeight as number);
        } else if (typeof value === 'number') {
          value = value * (surfaceWeight as number);
        }

        results[output].push(value);
      }
    }

    // Apply results to mesh
    for (const output of this.outputs) {
      const values = results[output];
      
      if (output === SurfaceVar.Offset) {
        // Apply vertex displacement
        for (let i = 0; i < N; i++) {
          const offset = values[i] as Vector3;
          mesh.vertices[i].add(offset);
        }
      } else {
        // Store as vertex attribute
        const attrName = output;
        const firstValue = values[0];
        
        if (typeof firstValue === 'number') {
          // Scalar attribute
          const attrArray = new Float32Array(N);
          for (let i = 0; i < N; i++) {
            attrArray[i] = values[i] as number;
          }
          mesh.vertexAttributes[attrName] = attrArray;
        } else if (firstValue instanceof Vector3) {
          // Vector attribute (stored as flat array)
          const attrArray = new Float32Array(N * 3);
          for (let i = 0; i < N; i++) {
            const v = values[i] as Vector3;
            attrArray[i * 3] = v.x;
            attrArray[i * 3 + 1] = v.y;
            attrArray[i * 3 + 2] = v.z;
          }
          mesh.vertexAttributes[attrName] = attrArray;
        }
      }
    }

    return mesh;
  }

  /**
   * Apply the kernel to vertex data directly (dictionary-style like original)
   * @param params - Dictionary with Position, Normal, and attribute arrays
   * @returns Dictionary with output arrays
   */
  public applyDict(
    params: Record<string, Float32Array | Vector3[]>
  ): Record<string, Float32Array> {
    const positions = params[SurfaceVar.Position] as Float32Array;
    const N = positions.length / 3;
    
    // Initialize output arrays
    const results: Record<string, Float32Array> = {};
    for (const output of this.outputs) {
      if (output === SurfaceVar.Offset) {
        results[output] = new Float32Array(N * 3);
      } else {
        // Assume scalar outputs for now
        results[output] = new Float32Array(N);
      }
    }

    // Process each vertex
    for (let i = 0; i < N; i++) {
      const position = new Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );

      const normal = params[SurfaceVar.Normal]
        ? new Vector3(
            (params[SurfaceVar.Normal] as Float32Array)[i * 3],
            (params[SurfaceVar.Normal] as Float32Array)[i * 3 + 1],
            (params[SurfaceVar.Normal] as Float32Array)[i * 3 + 2]
          )
        : new Vector3(0, 0, 1);

      const vertex: SurfaceVertex = { position, normal, attributes: {} };

      // Extract attribute weights
      const attrArray = params[this.attribute] as Float32Array;
      if (attrArray) {
        vertex.attributes[this.attribute] = attrArray[i];
      }

      // Evaluate kernel
      const outputs = this.evaluate(vertex);

      // Store results with masking
      for (const output of this.outputs) {
        const value = outputs[output];
        const mask = (attrArray?.[i] ?? 1.0);

        if (output === SurfaceVar.Offset) {
          if (value instanceof Vector3) {
            results[output][i * 3] = value.x * mask;
            results[output][i * 3 + 1] = value.y * mask;
            results[output][i * 3 + 2] = value.z * mask;
          }
        } else {
          results[output][i] = (typeof value === 'number' ? value : 0) * mask;
        }
      }
    }

    return results;
  }

  /**
   * Get kernel specification
   * @returns Kernel I/O specification
   */
  public getSpec(): KernelSpec {
    const inputs: Record<string, { type: KernelDataType; value: KernelParam }> = {};
    
    for (const [name, value] of this.paramValues.entries()) {
      if (typeof value === 'number') {
        inputs[name] = { type: KernelDataType.float, value };
      } else if (value instanceof Vector3) {
        inputs[name] = { type: KernelDataType.float3, value };
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'number') {
          inputs[name] = { type: KernelDataType.float, value };
        } else {
          inputs[name] = { type: KernelDataType.float3, value };
        }
      }
    }

    return {
      inputs,
      outputs: this.outputs,
    };
  }
}

/**
 * Registry for surface kernels
 */
export class SurfaceKernelRegistry {
  private static instance: SurfaceKernelRegistry;
  private kernels: Map<string, new () => SurfaceKernel> = new Map();

  private constructor() {}

  public static getInstance(): SurfaceKernelRegistry {
    if (!SurfaceKernelRegistry.instance) {
      SurfaceKernelRegistry.instance = new SurfaceKernelRegistry();
    }
    return SurfaceKernelRegistry.instance;
  }

  /**
   * Register a surface kernel class
   * @param name - Kernel name
   * @param kernelClass - Kernel class constructor
   */
  public register(name: string, kernelClass: new () => SurfaceKernel): void {
    if (this.kernels.has(name)) {
      console.warn(`Surface kernel '${name}' is already registered`);
    }
    this.kernels.set(name, kernelClass);
  }

  /**
   * Create a surface kernel instance by name
   * @param name - Kernel name
   * @returns New kernel instance
   */
  public create(name: string): SurfaceKernel {
    const kernelClass = this.kernels.get(name);
    if (!kernelClass) {
      throw new Error(`Surface kernel '${name}' not found in registry`);
    }
    return new kernelClass();
  }

  /**
   * Check if a kernel is registered
   * @param name - Kernel name
   * @returns True if registered
   */
  public has(name: string): boolean {
    return this.kernels.has(name);
  }

  /**
   * Get all registered kernel names
   * @returns Array of kernel names
   */
  public getRegisteredKernels(): string[] {
    return Array.from(this.kernels.keys());
  }
}

// Export default registry instance
export const surfaceKernelRegistry = SurfaceKernelRegistry.getInstance();
