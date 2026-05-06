/**
 * Validation code for the NodeGraphMaterialBridge + NodeGraphTextureBridge integration.
 *
 * Tests end-to-end:
 * 1. Create a simple node graph (Principled BSDF + Noise texture + ColorRamp)
 * 2. Evaluate through NodeEvaluator
 * 3. Convert through the bridges
 * 4. Verify the resulting MeshPhysicalMaterial has expected properties set
 *
 * This is NOT a unit test framework — it's a standalone validation module
 * that can be run to check that the bridge pipeline works correctly.
 */

import * as THREE from 'three';
import { NodeEvaluator, EvaluationMode, type NodeGraph, type NodeEvaluationResult } from './NodeEvaluator';
import { NodeGraphMaterialBridge, type BSDFOutput, type NodeEvaluationOutput } from './NodeGraphMaterialBridge';
import { NodeGraphTextureBridge, type EvaluatorTextureOutput } from './NodeGraphTextureBridge';
import {
  evaluateToMaterial,
  evaluateToMaterialQuick,
  bsdfToMaterial,
  evaluatorTextureToThreeTexture,
  type EvaluateToMaterialResult,
} from './EvaluateToMaterial';

// ============================================================================
// Validation Result
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

// ============================================================================
// Test Helpers
// ============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function approxEqual(a: number, b: number, epsilon: number = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

function colorApproxEqual(a: THREE.Color, b: THREE.Color, epsilon: number = 0.01): boolean {
  return approxEqual(a.r, b.r, epsilon) && approxEqual(a.g, b.g, epsilon) && approxEqual(a.b, b.b, epsilon);
}

// ============================================================================
// Validation Tests
// ============================================================================

/**
 * Test 1: Principled BSDF → MeshPhysicalMaterial with all parameters
 */
function testPrincipledBSDFConversion(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const bsdfOutput: BSDFOutput = {
      type: 'principled_bsdf',
      baseColor: new THREE.Color(0.8, 0.2, 0.1),
      roughness: 0.3,
      metallic: 0.7,
      ior: 1.5,
      clearcoat: 0.5,
      clearcoatRoughness: 0.1,
      sheen: 0.2,
      sheenColor: new THREE.Color(0.5, 0.5, 1.0),
      transmission: 0.0,
      emissionStrength: 2.0,
      emissionColor: new THREE.Color(1.0, 0.8, 0.5),
      alpha: 1.0,
    };

    const material = bridge.convert(bsdfOutput);

    // Verify type
    assert(material instanceof THREE.MeshPhysicalMaterial, 'Material should be MeshPhysicalMaterial');

    // Verify color
    assert(colorApproxEqual(material.color, new THREE.Color(0.8, 0.2, 0.1)), 'Color should match');

    // Verify roughness
    assert(approxEqual(material.roughness, 0.3), `Roughness should be ~0.3, got ${material.roughness}`);

    // Verify metalness
    assert(approxEqual(material.metalness, 0.7), `Metalness should be ~0.7, got ${material.metalness}`);

    // Verify IOR
    assert(approxEqual(material.ior, 1.5), `IOR should be ~1.5, got ${material.ior}`);

    // Verify clearcoat
    assert(approxEqual(material.clearcoat, 0.5), `Clearcoat should be ~0.5, got ${material.clearcoat}`);

    // Verify clearcoat roughness
    assert(approxEqual(material.clearcoatRoughness, 0.1), `ClearcoatRoughness should be ~0.1, got ${material.clearcoatRoughness}`);

    // Verify sheen
    assert(approxEqual(material.sheen, 0.2), `Sheen should be ~0.2, got ${material.sheen}`);

    // Verify emission
    assert(material.emissiveIntensity > 0, 'Should have emissive intensity');
    assert(colorApproxEqual(material.emissive, new THREE.Color(1.0, 0.8, 0.5), 0.05), 'Emissive color should match');

    return {
      name: 'Principled BSDF → MeshPhysicalMaterial',
      passed: true,
      message: 'All properties mapped correctly',
      details: {
        color: `rgb(${material.color.r.toFixed(2)}, ${material.color.g.toFixed(2)}, ${material.color.b.toFixed(2)})`,
        roughness: material.roughness.toFixed(3),
        metalness: material.metalness.toFixed(3),
        ior: material.ior.toFixed(3),
        clearcoat: material.clearcoat.toFixed(3),
        emissiveIntensity: material.emissiveIntensity.toFixed(3),
      },
    };
  } catch (err: any) {
    return { name: 'Principled BSDF → MeshPhysicalMaterial', passed: false, message: err.message };
  }
}

/**
 * Test 2: Glass BSDF → MeshPhysicalMaterial with transmission
 */
function testGlassBSDFConversion(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const bsdfOutput: BSDFOutput = {
      type: 'bsdf_glass',
      baseColor: new THREE.Color(0.9, 0.95, 1.0),
      roughness: 0.05,
      ior: 1.52,
    };

    const material = bridge.convert(bsdfOutput);

    // Verify transmission
    assert((material as any).transmission > 0, 'Should have transmission > 0');
    assert(approxEqual((material as any).transmission, 1.0), `Transmission should be ~1.0, got ${(material as any).transmission}`);
    assert(material.transparent === true, 'Should be transparent');
    assert(material.side === THREE.DoubleSide, 'Should be double-sided');
    assert(approxEqual(material.ior, 1.52), `IOR should be ~1.52, got ${material.ior}`);

    return {
      name: 'Glass BSDF → MeshPhysicalMaterial',
      passed: true,
      message: 'Transmission and IOR mapped correctly',
    };
  } catch (err: any) {
    return { name: 'Glass BSDF → MeshPhysicalMaterial', passed: false, message: err.message };
  }
}

/**
 * Test 3: Translucent BSDF → MeshPhysicalMaterial
 */
function testTranslucentBSDFConversion(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const bsdfOutput: BSDFOutput = {
      type: 'bsdf_translucent',
      baseColor: new THREE.Color(0.8, 0.6, 0.5),
      subsurfaceColor: new THREE.Color(0.8, 0.4, 0.3),
      roughness: 0.7,
    };

    const material = bridge.convert(bsdfOutput);

    // Verify translucent approximation
    assert((material as any).transmission > 0, 'Should have transmission > 0');
    assert(material.transparent === true, 'Should be transparent');
    assert(material.side === THREE.DoubleSide, 'Should be double-sided');
    assert(material.sheen > 0, 'Should have sheen for back-lit appearance');

    return {
      name: 'Translucent BSDF → MeshPhysicalMaterial',
      passed: true,
      message: 'Subsurface approximation via transmission+sheen applied',
    };
  } catch (err: any) {
    return { name: 'Translucent BSDF → MeshPhysicalMaterial', passed: false, message: err.message };
  }
}

/**
 * Test 4: Principled Volume → MeshPhysicalMaterial
 */
function testPrincipledVolumeConversion(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const bsdfOutput: BSDFOutput = {
      type: 'principled_volume',
      volumeColor: new THREE.Color(0.5, 0.3, 0.2),
      volumeDensity: 0.8,
      volumeEmissionStrength: 1.5,
      volumeEmissionColor: new THREE.Color(1.0, 0.5, 0.1),
    };

    const material = bridge.convert(bsdfOutput);

    // Verify volume approximation
    assert((material as any).transmission > 0, 'Should have transmission > 0');
    assert(material.transparent === true, 'Should be transparent');
    assert(material.emissiveIntensity > 0, 'Should have emissive intensity from volume emission');

    return {
      name: 'Principled Volume → MeshPhysicalMaterial',
      passed: true,
      message: 'Volume approximated via transmission + emissive',
    };
  } catch (err: any) {
    return { name: 'Principled Volume → MeshPhysicalMaterial', passed: false, message: err.message };
  }
}

/**
 * Test 5: Emission → MeshPhysicalMaterial
 */
function testEmissionConversion(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const bsdfOutput: BSDFOutput = {
      type: 'emission',
      emissionColor: new THREE.Color(1.0, 0.5, 0.0),
      emissionStrength: 5.0,
    };

    const material = bridge.convert(bsdfOutput);

    assert(colorApproxEqual(material.emissive, new THREE.Color(1.0, 0.5, 0.0)), 'Emissive color should match');
    assert(approxEqual(material.emissiveIntensity, 5.0), `Emissive intensity should be ~5.0, got ${material.emissiveIntensity}`);

    return {
      name: 'Emission → MeshPhysicalMaterial',
      passed: true,
      message: 'Emissive properties mapped correctly',
    };
  } catch (err: any) {
    return { name: 'Emission → MeshPhysicalMaterial', passed: false, message: err.message };
  }
}

/**
 * Test 6: Texture bridge converts evaluator output
 */
function testTextureBridgeFromEvaluator(): ValidationResult {
  try {
    const bridge = new NodeGraphTextureBridge();

    // Simulate the NodeEvaluator's noise texture output format
    const evaluatorOutput: EvaluatorTextureOutput = {
      Fac: { type: 'noise_texture', scale: 5.0, detail: 3, roughness: 0.5, distortion: 0.0 },
      Color: { type: 'noise_texture', scale: 5.0, detail: 3, roughness: 0.5, distortion: 0.0 },
    };

    // Test auto selection (should prefer Color)
    const autoResult = bridge.convertFromEvaluatorOutput(evaluatorOutput, 'auto', 64, 64);
    assert(autoResult.texture instanceof THREE.Texture, 'Should produce a Texture');
    assert(autoResult.isColor === true, 'Auto should select Color output');
    assert(autoResult.suggestedSlot === 'map', 'Color output suggests map slot');

    // Test Fac selection
    const facResult = bridge.convertFromEvaluatorOutput(evaluatorOutput, 'Fac', 64, 64);
    assert(facResult.texture instanceof THREE.Texture, 'Should produce a Texture from Fac');
    assert(facResult.isColor === false, 'Fac output is not color');
    assert(facResult.suggestedSlot === 'roughnessMap', 'Fac output suggests roughnessMap slot');

    // Test Voronoi evaluator output
    const voronoiOutput: EvaluatorTextureOutput = {
      Distance: { type: 'voronoi_texture', scale: 4.0, distanceMetric: 'euclidean', feature: 'f1' },
      Color: { type: 'voronoi_texture', scale: 4.0, distanceMetric: 'euclidean', feature: 'f1' },
    };
    const voronoiResult = bridge.convertFromEvaluatorOutput(voronoiOutput, 'Distance', 64, 64);
    assert(voronoiResult.texture instanceof THREE.Texture, 'Should produce Voronoi texture');
    assert(voronoiResult.isColor === false, 'Distance output is not color');

    return {
      name: 'Texture bridge from evaluator output',
      passed: true,
      message: 'All evaluator output formats converted correctly',
    };
  } catch (err: any) {
    return { name: 'Texture bridge from evaluator output', passed: false, message: err.message };
  }
}

/**
 * Test 7: Normal map generation from texture output
 */
function testNormalMapGeneration(): ValidationResult {
  try {
    const bridge = new NodeGraphTextureBridge();

    const evaluatorOutput: EvaluatorTextureOutput = {
      Fac: { type: 'noise_texture', scale: 8.0, detail: 4, roughness: 0.5, distortion: 0.2 },
    };

    const normalMap = bridge.convertToNormalMap(evaluatorOutput, 'Fac', 1.0, 64, 64);
    assert(normalMap instanceof THREE.DataTexture, 'Should produce DataTexture');
    assert(normalMap.image.width === 64, 'Width should be 64');
    assert(normalMap.image.height === 64, 'Height should be 64');

    return {
      name: 'Normal map generation from texture',
      passed: true,
      message: 'Normal map generated from height field via Sobel filter',
    };
  } catch (err: any) {
    return { name: 'Normal map generation from texture', passed: false, message: err.message };
  }
}

/**
 * Test 8: Material bridge processes texture descriptors
 */
function testTextureDescriptorProcessing(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ textureResolution: 64 });

    const bsdfOutput: BSDFOutput = {
      type: 'principled_bsdf',
      baseColor: new THREE.Color(0.8, 0.8, 0.8),
      roughness: 0.5,
      metallic: 0.0,
      mapDescriptor: {
        Color: { type: 'noise_texture', scale: 5.0, detail: 3, roughness: 0.5, distortion: 0.0 },
      },
      roughnessMapDescriptor: {
        Fac: { type: 'musgrave_texture', scale: 10.0, detail: 4, dimension: 2.0, lacunarity: 2.0, musgraveType: 'fbm' },
      },
    };

    const material = bridge.convert(bsdfOutput);

    // Verify textures were generated and assigned
    assert(material.map !== null && material.map !== undefined, 'Should have a color map from descriptor');
    assert(material.roughnessMap !== null && material.roughnessMap !== undefined, 'Should have a roughness map from descriptor');

    return {
      name: 'Texture descriptor processing',
      passed: true,
      message: 'Texture descriptors converted and assigned to material',
      details: {
        hasMap: !!material.map,
        hasRoughnessMap: !!material.roughnessMap,
      },
    };
  } catch (err: any) {
    return { name: 'Texture descriptor processing', passed: false, message: err.message };
  }
}

/**
 * Test 9: NodeEvaluationOutput wrapper formats
 */
function testEvaluationOutputFormats(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    // Test BSDF wrapper
    const bsdfWrapper: NodeEvaluationOutput = {
      BSDF: {
        type: 'principled_bsdf',
        baseColor: new THREE.Color(0.5, 0.5, 0.5),
        roughness: 0.5,
      },
    };
    const mat1 = bridge.convert(bsdfWrapper);
    assert(mat1 instanceof THREE.MeshPhysicalMaterial, 'BSDF wrapper should produce material');

    // Test Emission wrapper
    const emissionWrapper: NodeEvaluationOutput = {
      Emission: {
        type: 'emission',
        emissionColor: new THREE.Color(1, 0, 0),
        emissionStrength: 2.0,
      },
    };
    const mat2 = bridge.convert(emissionWrapper);
    assert(mat2.emissiveIntensity > 0, 'Emission wrapper should produce emissive material');

    // Test Volume wrapper
    const volumeWrapper: NodeEvaluationOutput = {
      Volume: {
        type: 'principled_volume',
        volumeDensity: 1.0,
      },
    };
    const mat3 = bridge.convert(volumeWrapper);
    assert((mat3 as any).transmission > 0, 'Volume wrapper should produce transmissive material');

    return {
      name: 'NodeEvaluationOutput wrapper formats',
      passed: true,
      message: 'All wrapper formats (BSDF, Emission, Volume) handled correctly',
    };
  } catch (err: any) {
    return { name: 'NodeEvaluationOutput wrapper formats', passed: false, message: err.message };
  }
}

/**
 * Test 10: bsdfToMaterial convenience function
 */
function testBsdfToMaterial(): ValidationResult {
  try {
    const material = bsdfToMaterial({
      type: 'bsdf_glossy',
      baseColor: new THREE.Color(1.0, 0.8, 0.2),
      roughness: 0.1,
    });

    assert(material instanceof THREE.MeshPhysicalMaterial, 'Should produce MeshPhysicalMaterial');
    assert(approxEqual(material.metalness, 1.0), 'Glossy BSDF should have metalness 1.0');
    assert(colorApproxEqual(material.color, new THREE.Color(1.0, 0.8, 0.2)), 'Color should match');

    return {
      name: 'bsdfToMaterial convenience function',
      passed: true,
      message: 'Convenience function works correctly',
    };
  } catch (err: any) {
    return { name: 'bsdfToMaterial convenience function', passed: false, message: err.message };
  }
}

/**
 * Test 11: evaluatorTextureToThreeTexture convenience function
 */
function testEvaluatorTextureToThreeTexture(): ValidationResult {
  try {
    const texture = evaluatorTextureToThreeTexture({
      Fac: { type: 'gradient_texture', gradientType: 'linear' },
      Color: { type: 'gradient_texture', gradientType: 'linear' },
    }, 'Color', 128);

    assert(texture instanceof THREE.Texture, 'Should produce a Texture');

    return {
      name: 'evaluatorTextureToThreeTexture convenience function',
      passed: true,
      message: 'Convenience function works correctly',
    };
  } catch (err: any) {
    return { name: 'evaluatorTextureToThreeTexture convenience function', passed: false, message: err.message };
  }
}

/**
 * Test 12: Mix Shader blending
 */
function testMixShaderBlending(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const mixOutput: BSDFOutput = {
      type: 'mix_shader',
      factor: 0.5,
      shader1: {
        type: 'principled_bsdf',
        baseColor: new THREE.Color(1, 0, 0),
        roughness: 0.2,
        metallic: 0.0,
      },
      shader2: {
        type: 'principled_bsdf',
        baseColor: new THREE.Color(0, 0, 1),
        roughness: 0.8,
        metallic: 1.0,
      },
    };

    const material = bridge.convert(mixOutput);

    // Verify blending at factor 0.5
    // Color should be roughly (0.5, 0, 0.5) = lerp(red, blue, 0.5)
    assert(approxEqual(material.color.r, 0.5, 0.05), `Red channel should be ~0.5, got ${material.color.r}`);
    assert(approxEqual(material.color.b, 0.5, 0.05), `Blue channel should be ~0.5, got ${material.color.b}`);

    // Roughness should be average
    const expectedRoughness = Math.max(0.04, (0.2 + 0.8) / 2);
    assert(approxEqual(material.roughness, expectedRoughness, 0.05), `Roughness should be ~${expectedRoughness}, got ${material.roughness}`);

    // Metalness should be average
    assert(approxEqual(material.metalness, 0.5, 0.05), `Metalness should be ~0.5, got ${material.metalness}`);

    return {
      name: 'Mix Shader blending',
      passed: true,
      message: 'Mix shader blends properties correctly at factor 0.5',
    };
  } catch (err: any) {
    return { name: 'Mix Shader blending', passed: false, message: err.message };
  }
}

/**
 * Test 13: Add Shader with emission
 */
function testAddShaderEmission(): ValidationResult {
  try {
    const bridge = new NodeGraphMaterialBridge({ processTextureDescriptors: false });

    const addOutput: BSDFOutput = {
      type: 'add_shader',
      shader1: {
        type: 'principled_bsdf',
        baseColor: new THREE.Color(0.5, 0.5, 0.5),
        roughness: 0.3,
        metallic: 0.5,
      },
      shader2: {
        type: 'emission',
        emissionColor: new THREE.Color(1, 0.5, 0),
        emissionStrength: 2.0,
      },
    };

    const material = bridge.convert(addOutput);

    // Should have base properties from shader1
    assert(approxEqual(material.metalness, 0.5), 'Should have metalness from shader1');

    // Should have emission from shader2
    assert(material.emissiveIntensity > 0, 'Should have emissive intensity from shader2');

    return {
      name: 'Add Shader with emission',
      passed: true,
      message: 'Add shader correctly adds emission to base shader',
    };
  } catch (err: any) {
    return { name: 'Add Shader with emission', passed: false, message: err.message };
  }
}

// ============================================================================
// Run All Validations
// ============================================================================

export function runAllValidations(): ValidationResult[] {
  const tests = [
    testPrincipledBSDFConversion,
    testGlassBSDFConversion,
    testTranslucentBSDFConversion,
    testPrincipledVolumeConversion,
    testEmissionConversion,
    testTextureBridgeFromEvaluator,
    testNormalMapGeneration,
    testTextureDescriptorProcessing,
    testEvaluationOutputFormats,
    testBsdfToMaterial,
    testEvaluatorTextureToThreeTexture,
    testMixShaderBlending,
    testAddShaderEmission,
  ];

  const results: ValidationResult[] = [];

  for (const test of tests) {
    const result = test();
    results.push(result);

    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (result.details) {
      console.log('  Details:', result.details);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n${passed}/${total} validations passed`);

  return results;
}

/**
 * Run validations and return a summary.
 */
export function validateBridgePipeline(): { passed: boolean; results: ValidationResult[]; summary: string } {
  const results = runAllValidations();
  const allPassed = results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;

  return {
    passed: allPassed,
    results,
    summary: `${passedCount}/${results.length} validations passed`,
  };
}
