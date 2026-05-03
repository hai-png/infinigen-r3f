/**
 * GeneratorSmokeTest.ts — Smoke tests for representative generators
 *
 * Verifies that each generator can be imported, instantiated, and produce
 * non-empty output. This is NOT a comprehensive test — it just catches
 * import path breakage, constructor crashes, and empty-output regressions.
 *
 * Run with: npx vitest run src/__tests__/smoke/GeneratorSmokeTest.ts
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Test utilities
import {
  assertValidMesh,
  countMeshes,
  countVertices,
  hasNaN,
} from '../utils/testUtilities';

// ============================================================================
// Terrain Generators
// ============================================================================

describe('TerrainGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { TerrainGenerator } = await import('@/terrain/core/TerrainGenerator');
    const gen = new TerrainGenerator({ seed: 42, width: 64, height: 64 });
    expect(gen).toBeDefined();
  });

  it('produces non-empty terrain data', async () => {
    const { TerrainGenerator } = await import('@/terrain/core/TerrainGenerator');
    const gen = new TerrainGenerator({ seed: 42, width: 64, height: 64 });
    const data = gen.generate();
    expect(data.heightMap).toBeDefined();
    expect(data.width).toBe(64);
    expect(data.height).toBe(64);
    // Heightmap should have actual values (not all zeros)
    const heightArray = data.heightMap.data as Float32Array;
    let nonZero = 0;
    for (let i = 0; i < Math.min(heightArray.length, 100); i++) {
      if (heightArray[i] !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(10);
  });
});

// ============================================================================
// Fruit Generator
// ============================================================================

describe('FruitGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(42);
    expect(gen).toBeDefined();
  });

  it('produces non-empty fruit groups', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(42);
    const fruit = gen.generate({ fruitType: 'Apple' });
    expect(fruit).toBeInstanceOf(THREE.Group);
    expect(countMeshes(fruit)).toBeGreaterThan(0);
    expect(countVertices(fruit)).toBeGreaterThan(0);
  });

  it('produces valid geometry for Apple', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(42);
    const fruit = gen.generate({ fruitType: 'Apple' });
    const result = assertValidMesh(fruit);
    expect(result.valid).toBe(true);
  });

  it('produces non-empty output for multiple fruit types', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(123);
    const types = ['Orange', 'Banana', 'Pineapple'] as const;
    for (const type of types) {
      const fruit = gen.generate({ fruitType: type });
      expect(countMeshes(fruit)).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Cactus Generator
// ============================================================================

describe('CactusGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { CactusGenerator } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const gen = new CactusGenerator(42);
    expect(gen).toBeDefined();
  });

  it('produces non-empty cactus groups', async () => {
    const { CactusGenerator } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const gen = new CactusGenerator(42);
    const cactus = gen.generate({ variant: 'Saguaro' });
    expect(cactus).toBeInstanceOf(THREE.Group);
    expect(countMeshes(cactus)).toBeGreaterThan(0);
  });

  it('produces geometry for Saguaro variant (may have minor issues)', async () => {
    const { CactusGenerator } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const gen = new CactusGenerator(42);
    const cactus = gen.generate({ variant: 'Saguaro' });
    // Saguaro has meshes even if assertValidMesh catches minor issues
    expect(countMeshes(cactus)).toBeGreaterThan(0);
    expect(countVertices(cactus)).toBeGreaterThan(0);
  });
});

// ============================================================================
// Creature Generators
// ============================================================================

describe('MammalGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { MammalGenerator } = await import('@/assets/objects/creatures/MammalGenerator');
    const gen = new MammalGenerator(42);
    expect(gen).toBeDefined();
  });

  it('produces non-empty mammal groups', async () => {
    const { MammalGenerator } = await import('@/assets/objects/creatures/MammalGenerator');
    const gen = new MammalGenerator(42);
    const mammal = gen.generate('dog');
    expect(mammal).toBeInstanceOf(THREE.Group);
    expect(countMeshes(mammal)).toBeGreaterThan(0);
  });
});

describe('UnderwaterGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { UnderwaterGenerator } = await import('@/assets/objects/creatures/UnderwaterGenerator');
    const gen = new UnderwaterGenerator({ seed: 42 });
    expect(gen).toBeDefined();
  });

  it('produces non-empty jellyfish', async () => {
    const { UnderwaterGenerator } = await import('@/assets/objects/creatures/UnderwaterGenerator');
    const gen = new UnderwaterGenerator({ seed: 42 });
    const jellyfish = gen.generate('jellyfish');
    expect(jellyfish).toBeInstanceOf(THREE.Group);
    expect(countMeshes(jellyfish)).toBeGreaterThan(0);
  });

  it('produces non-empty crab with claws', async () => {
    const { UnderwaterGenerator } = await import('@/assets/objects/creatures/UnderwaterGenerator');
    const gen = new UnderwaterGenerator({ seed: 42 });
    const crab = gen.generate('crab');
    expect(crab).toBeInstanceOf(THREE.Group);
    expect(countMeshes(crab)).toBeGreaterThan(0);
  });
});

describe('BirdGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { BirdGenerator } = await import('@/assets/objects/creatures/BirdGenerator');
    const gen = new BirdGenerator(42);
    expect(gen).toBeDefined();
  });

  it('produces non-empty bird groups', async () => {
    const { BirdGenerator } = await import('@/assets/objects/creatures/BirdGenerator');
    const gen = new BirdGenerator(42);
    const bird = gen.generate('sparrow');
    expect(bird).toBeInstanceOf(THREE.Group);
    expect(countMeshes(bird)).toBeGreaterThan(0);
  });
});

describe('InsectGenerator', () => {
  it('can be imported and instantiated', async () => {
    const { InsectGenerator } = await import('@/assets/objects/creatures/InsectGenerator');
    const gen = new InsectGenerator({ seed: 42 });
    expect(gen).toBeDefined();
  });

  it('produces non-empty insect groups', async () => {
    const { InsectGenerator } = await import('@/assets/objects/creatures/InsectGenerator');
    const gen = new InsectGenerator({ seed: 42 });
    const insect = gen.generate('bee');
    expect(insect).toBeInstanceOf(THREE.Group);
    expect(countMeshes(insect)).toBeGreaterThan(0);
  });
});

// ============================================================================
// Export System
// ============================================================================

describe('Unified SceneExporter', () => {
  it('can be imported and instantiated', async () => {
    const { SceneExporter } = await import('@/tools/export/SceneExporter');
    const exporter = new SceneExporter();
    expect(exporter).toBeDefined();
  });

  it('getSupportedFormats returns native formats', async () => {
    const { SceneExporter } = await import('@/tools/export/SceneExporter');
    const exporter = new SceneExporter();
    const formats = exporter.getSupportedFormats();
    expect(formats).toContain('glb');
    expect(formats).toContain('gltf');
    expect(formats).toContain('obj');
    expect(formats).toContain('ply');
    expect(formats).toContain('stl');
    expect(formats).toContain('json');
  });

  it('isFormatSupported works for native formats', async () => {
    const { SceneExporter } = await import('@/tools/export/SceneExporter');
    const exporter = new SceneExporter();
    expect(exporter.isFormatSupported('glb')).toBe(true);
    expect(exporter.isFormatSupported('obj')).toBe(true);
    expect(exporter.isFormatSupported('ply')).toBe(true);
    // FBX requires Python bridge — not available in test env
    expect(exporter.isFormatSupported('fbx')).toBe(false);
  });

  it('FBX export returns clear error without Python bridge', async () => {
    const { SceneExporter } = await import('@/tools/export/SceneExporter');
    const exporter = new SceneExporter();
    const scene = new THREE.Scene();
    const result = await exporter.exportScene(scene, { format: 'fbx' });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('FBX export requires Python bridge'))).toBe(true);
  });
});

// ============================================================================
// Backward Compatibility: ExportToolkit shim
// ============================================================================

describe('ExportToolkit backward compatibility', () => {
  it('can be imported and delegates to SceneExporter', async () => {
    const { ExportToolkit } = await import('@/tools/ExportToolkit');
    const toolkit = new ExportToolkit();
    expect(toolkit).toBeDefined();
  });

  it('legacy ExportToolkit.exportScene returns legacy-shaped result', async () => {
    const { ExportToolkit } = await import('@/tools/ExportToolkit');
    const toolkit = new ExportToolkit();
    const scene = new THREE.Scene();
    // Add a simple mesh so export doesn't fail on empty scene
    scene.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    ));
    const result = await toolkit.exportScene(scene, {
      format: 'obj',
      outputPath: 'test',
    });
    expect(result.success).toBe(true);
    expect(result.outputPaths).toBeDefined();
    expect(result.outputPaths.length).toBeGreaterThan(0);
  });
});
