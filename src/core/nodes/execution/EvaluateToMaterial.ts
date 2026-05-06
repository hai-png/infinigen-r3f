/**
 * evaluateToMaterial - Convenience function for converting a node graph
 * to a Three.js MeshPhysicalMaterial via the full bridge pipeline.
 *
 * Pipeline:
 * 1. Evaluate the node graph using NodeEvaluator
 * 2. Process texture descriptors through NodeGraphTextureBridge
 * 3. Convert BSDF output through NodeGraphMaterialBridge
 *
 * This is the primary high-level API for going from a node graph
 * to a renderable Three.js material.
 */

import * as THREE from 'three';
import { NodeEvaluator, EvaluationMode, type NodeGraph, type NodeEvaluationResult } from './NodeEvaluator';
import { NodeGraphMaterialBridge, type MaterialBridgeOptions, type BSDFOutput, type NodeEvaluationOutput } from './NodeGraphMaterialBridge';
import { NodeGraphTextureBridge, type EvaluatorTextureOutput } from './NodeGraphTextureBridge';

// ============================================================================
// Options
// ============================================================================

export interface EvaluateToMaterialOptions extends MaterialBridgeOptions {
  /**
   * Evaluation mode to use (default: MATERIAL).
   * Usually MATERIAL is correct, but TEXTURE can be used for
   * texture-only graphs.
   */
  mode?: EvaluationMode;

  /**
   * If true, when the evaluator returns errors, still attempt
   * to produce a material from whatever partial output is available.
   * If false, errors result in a default gray material.
   * (default: true)
   */
  fallbackOnErrors?: boolean;

  /**
   * If provided, this callback receives the raw evaluation result
   * for inspection/logging before the bridge conversion.
   */
  onEvaluated?: (result: NodeEvaluationResult) => void;
}

// ============================================================================
// Result
// ============================================================================

export interface EvaluateToMaterialResult {
  /** The resulting MeshPhysicalMaterial */
  material: THREE.MeshPhysicalMaterial;

  /** The raw evaluation result from NodeEvaluator */
  evaluationResult: NodeEvaluationResult;

  /** Whether the evaluation had errors */
  hasErrors: boolean;

  /** Whether the evaluation had warnings */
  hasWarnings: boolean;

  /** Error messages from evaluation */
  errors: string[];

  /** Warning messages from evaluation */
  warnings: string[];
}

// ============================================================================
// evaluateToMaterial
// ============================================================================

/**
 * Evaluate a node graph and convert the result to a MeshPhysicalMaterial.
 *
 * This is the primary convenience function for going from a node graph
 * (as produced by NodeWrangler) to a renderable Three.js material.
 *
 * @param graph - The node graph to evaluate
 * @param options - Options for evaluation and material conversion
 * @returns An EvaluateToMaterialResult containing the material and metadata
 *
 * @example
 * ```ts
 * import { evaluateToMaterial } from './execution';
 * import { NodeWrangler } from '../core/node-wrangler';
 *
 * const nw = new NodeWrangler();
 * // ... build shader graph using nw ...
 *
 * const graph = {
 *   nodes: nw.getActiveGroup().nodes,
 *   links: Array.from(nw.getActiveGroup().links.values()),
 * };
 *
 * const result = evaluateToMaterial(graph, { textureResolution: 256 });
 * const material = result.material; // MeshPhysicalMaterial
 * ```
 */
export function evaluateToMaterial(
  graph: NodeGraph,
  options?: EvaluateToMaterialOptions,
): EvaluateToMaterialResult {
  const opts: Required<Omit<EvaluateToMaterialOptions, 'onEvaluated'>> & { onEvaluated?: EvaluateToMaterialOptions['onEvaluated'] } = {
    mode: options?.mode ?? EvaluationMode.MATERIAL,
    fallbackOnErrors: options?.fallbackOnErrors ?? true,
    textureResolution: options?.textureResolution ?? 512,
    processTextureDescriptors: options?.processTextureDescriptors ?? true,
    normalMapStrength: options?.normalMapStrength ?? 1.0,
    onEvaluated: options?.onEvaluated,
  };

  // Step 1: Evaluate the node graph
  const evaluator = new NodeEvaluator();
  const evalResult = evaluator.evaluate(graph, opts.mode);

  // Notify callback
  if (opts.onEvaluated) {
    opts.onEvaluated(evalResult);
  }

  // Step 2: Convert through the material bridge
  const materialBridge = new NodeGraphMaterialBridge({
    textureResolution: opts.textureResolution,
    processTextureDescriptors: opts.processTextureDescriptors,
    normalMapStrength: opts.normalMapStrength,
  });

  let material: THREE.MeshPhysicalMaterial;

  if (evalResult.value && (opts.fallbackOnErrors || evalResult.errors.length === 0)) {
    try {
      material = materialBridge.convert(evalResult.value);
    } catch (err) {
      console.warn('[evaluateToMaterial] Bridge conversion failed, using default material:', err);
      material = materialBridge.convert({ type: 'principled_bsdf' } as BSDFOutput);
    }
  } else {
    // No value or non-recoverable errors
    console.warn('[evaluateToMaterial] Evaluation produced no output or has errors:', evalResult.errors);
    material = materialBridge.convert({ type: 'principled_bsdf' } as BSDFOutput);
  }

  return {
    material,
    evaluationResult: evalResult,
    hasErrors: evalResult.errors.length > 0,
    hasWarnings: evalResult.warnings.length > 0,
    errors: evalResult.errors,
    warnings: evalResult.warnings,
  };
}

/**
 * Quick one-liner: evaluate a node graph and return just the material.
 * Throws on errors.
 */
export function evaluateToMaterialQuick(
  graph: NodeGraph,
  options?: EvaluateToMaterialOptions,
): THREE.MeshPhysicalMaterial {
  const result = evaluateToMaterial(graph, options);
  if (result.hasErrors && !options?.fallbackOnErrors) {
    throw new Error(`Node graph evaluation failed: ${result.errors.join(', ')}`);
  }
  return result.material;
}

/**
 * Create a material from a BSDF descriptor object directly,
 * without going through the full NodeEvaluator pipeline.
 *
 * Useful when you already have a BSDF data object (e.g., from
 * manual construction or from a cached evaluation result).
 */
export function bsdfToMaterial(
  bsdf: BSDFOutput | NodeEvaluationOutput,
  options?: MaterialBridgeOptions,
): THREE.MeshPhysicalMaterial {
  const bridge = new NodeGraphMaterialBridge(options);
  return bridge.convert(bsdf, options);
}

/**
 * Create a texture from a NodeEvaluator texture output descriptor.
 *
 * @param textureOutput - The evaluator output (e.g., { Fac: { type: 'noise_texture', ... } })
 * @param outputSocket - Which socket to use ('Color', 'Fac', 'Distance', or 'auto')
 * @param resolution - Texture resolution (default 512)
 */
export function evaluatorTextureToThreeTexture(
  textureOutput: EvaluatorTextureOutput,
  outputSocket: 'auto' | 'Color' | 'Fac' | 'Distance' = 'auto',
  resolution: number = 512,
): THREE.Texture {
  const bridge = new NodeGraphTextureBridge();
  const result = bridge.convertFromEvaluatorOutput(textureOutput, outputSocket, resolution, resolution);
  return result.texture;
}
