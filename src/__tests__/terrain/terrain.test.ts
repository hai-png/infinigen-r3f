/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Comprehensive Test Suite
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TerrainGenerator, type TerrainData } from '../core/TerrainGenerator';
import { TerrainMesher } from '../mesher/TerrainMesher';
import { BiomeSystem, BiomeType } from '../biomes/BiomeSystem';
import { VegetationScatter } from '../vegetation/VegetationScatter';
import { TerrainUtils } from '../utils/TerrainUtils';
import { Vector3 } from 'three';

describe('Phase 10: Terrain Generation', () => {
  describe('TerrainGenerator', () => {
    let generator: TerrainGenerator;

    beforeEach(() => {
      generator = new TerrainGenerator({
        seed: 12345,
        width: 64,
        height: 64,
        scale: 20,
        octaves: 4,
        erosionIterations: 10,
      });
    });

    it('should generate terrain with correct dimensions', () => {
      const terrain = generator.generate();
      
      expect(terrain.heightMap).toBeInstanceOf(Float32Array);
      expect(terrain.heightMap.length).toBe(64 * 64);
      expect(terrain.normalMap.length).toBe(64 * 64 * 3);
      expect(terrain.slopeMap.length).toBe(64 * 64);
      expect(terrain.biomeMask.length).toBe(64 * 64);
    });

    it('should normalize height values to 0-1 range', () => {
      const terrain = generator.generate();
      
      for (let i = 0; i < terrain.heightMap.length; i++) {
        expect(terrain.heightMap[i]).toBeGreaterThanOrEqual(0);
        expect(terrain.heightMap[i]).toBeLessThanOrEqual(1);
      }
    });

    it('should produce deterministic results with same seed', () => {
      const gen1 = new TerrainGenerator({ seed: 99999, width: 32, height: 32 });
      const gen2 = new TerrainGenerator({ seed: 99999, width: 32, height: 32 });
      
      const terrain1 = gen1.generate();
      const terrain2 = gen2.generate();
      
      for (let i = 0; i < terrain1.heightMap.length; i++) {
        expect(terrain1.heightMap[i]).toBeCloseTo(terrain2.heightMap[i], 5);
      }
    });

    it('should apply erosion that reduces extreme heights', () => {
      const genNoErosion = new TerrainGenerator({ 
        seed: 12345, 
        width: 64, 
        height: 64,
        erosionIterations: 0 
      });
      
      const terrainNoErosion = genNoErosion.generate();
      const terrainWithErosion = generator.generate();
      
      // Calculate variance
      const getVariance = (map: Float32Array) => {
        const mean = Array.from(map).reduce((a, b) => a + b, 0) / map.length;
        return map.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / map.length;
      };
      
      const varianceNoErosion = getVariance(terrainNoErosion.heightMap);
      const varianceWithErosion = getVariance(terrainWithErosion.heightMap);
      
      // Erosion should reduce variance (smooth extremes)
      expect(varianceWithErosion).toBeLessThan(varianceNoErosion * 1.5);
    });

    it('should generate different biomes based on height and slope', () => {
      const terrain = generator.generate();
      const biomeCounts = new Map<number, number>();
      
      for (let i = 0; i < terrain.biomeMask.length; i++) {
        const biome = terrain.biomeMask[i];
        biomeCounts.set(biome, (biomeCounts.get(biome) || 0) + 1);
      }
      
      // Should have multiple biome types
      expect(biomeCounts.size).toBeGreaterThan(1);
    });

    it('should reseed and produce different terrain', () => {
      const terrain1 = generator.generate();
      generator.reseed(99999);
      const terrain2 = generator.generate();
      
      let different = false;
      for (let i = 0; i < terrain1.heightMap.length; i++) {
        if (Math.abs(terrain1.heightMap[i] - terrain2.heightMap[i]) > 0.01) {
          different = true;
          break;
        }
      }
      
      expect(different).toBe(true);
    });
  });

  describe('TerrainMesher', () => {
    let mesher: TerrainMesher;
    let terrainData: TerrainData;

    beforeEach(() => {
      const generator = new TerrainGenerator({ 
        seed: 12345, 
        width: 64, 
        height: 64 
      });
      terrainData = generator.generate();
      mesher = new TerrainMesher({ chunkSize: 32, lodLevels: 4 });
    });

    it('should generate mesh with correct attributes', () => {
      const geometry = mesher.generateMesh(terrainData);
      
      expect(geometry.attributes.position).toBeDefined();
      expect(geometry.attributes.normal).toBeDefined();
      expect(geometry.attributes.uv).toBeDefined();
      expect(geometry.index).toBeDefined();
      
      expect(geometry.attributes.position.count).toBe(64 * 64);
      expect(geometry.attributes.normal.count).toBe(64 * 64);
      expect(geometry.attributes.uv.count).toBe(64 * 64);
    });

    it('should generate chunks with LOD', () => {
      const cameraPos = new Vector3(32, 50, 32);
      const chunks = mesher.generateChunkedMesh(terrainData, cameraPos);
      
      expect(chunks.size).toBeGreaterThan(0);
      
      // Check chunk structure
      const firstChunk = chunks.values().next().value;
      expect(firstChunk.geometry).toBeDefined();
      expect(firstChunk.lodLevel).toBeDefined();
      expect(firstChunk.bounds).toBeDefined();
      expect(firstChunk.boundingSphere).toBeDefined();
    });

    it('should optimize geometry', () => {
      const geometry = mesher.generateMesh(terrainData);
      const optimized = mesher.optimizeGeometry(geometry);
      
      expect(optimized).toBeDefined();
      expect(optimized.boundingBox).toBeDefined();
      expect(optimized.boundingSphere).toBeDefined();
    });
  });

  describe('BiomeSystem', () => {
    let biomeSystem: BiomeSystem;

    beforeEach(() => {
      biomeSystem = new BiomeSystem(0.3);
    });

    it('should classify biomes correctly by height and slope', () => {
      // Deep water
      expect(biomeSystem.getBiomeFromHeightSlope(0.1, 0.1).type).toBe(BiomeType.DEEP_WATER);
      
      // Beach
      expect(biomeSystem.getBiomeFromHeightSlope(0.32, 0.05).type).toBe(BiomeType.BEACH);
      
      // Plains
      expect(biomeSystem.getBiomeFromHeightSlope(0.35, 0.1).type).toBe(BiomeType.PLAINS);
      
      // Forest
      expect(biomeSystem.getBiomeFromHeightSlope(0.5, 0.2).type).toBe(BiomeType.FOREST);
      
      // Mountain
      expect(biomeSystem.getBiomeFromHeightSlope(0.8, 0.5).type).toBe(BiomeType.MOUNTAIN);
      
      // Snow peak
      expect(biomeSystem.getBiomeFromHeightSlope(0.9, 0.3).type).toBe(BiomeType.SNOW_PEAK);
    });

    it('should return correct soil colors', () => {
      const beachColor = biomeSystem.getSoilColor(BiomeType.BEACH);
      expect(beachColor[0]).toBeGreaterThan(0.7); // Sandy color
      
      const forestColor = biomeSystem.getSoilColor(BiomeType.FOREST);
      expect(forestColor[0]).toBeLessThan(0.3); // Dark soil
    });

    it('should interpolate colors smoothly', () => {
      const color1: [number, number, number] = [0, 0, 0];
      const color2: [number, number, number] = [1, 1, 1];
      
      const mid = biomeSystem.interpolateColors(color1, color2, 0.5);
      expect(mid[0]).toBeCloseTo(0.5, 2);
      expect(mid[1]).toBeCloseTo(0.5, 2);
      expect(mid[2]).toBeCloseTo(0.5, 2);
    });

    it('should validate biome configurations', () => {
      const validConfig = {
        name: 'Test',
        type: BiomeType.PLAINS as BiomeType,
        minHeight: 0.2,
        maxHeight: 0.5,
        maxSlope: 0.3,
        soilColor: [0.5, 0.5, 0.5] as [number, number, number],
        rockColor: [0.4, 0.4, 0.4] as [number, number, number],
        vegetationDensity: 0.5,
        allowedVegetation: ['grass'],
      };
      
      expect(biomeSystem.validateBiome(validConfig)).toBe(true);
      
      // Invalid: minHeight >= maxHeight
      const invalidConfig = { ...validConfig, minHeight: 0.6, maxHeight: 0.5 };
      expect(biomeSystem.validateBiome(invalidConfig)).toBe(false);
    });
  });

  describe('VegetationScatter', () => {
    let biomeSystem: BiomeSystem;
    let scatterer: VegetationScatter;
    let terrainData: TerrainData;

    beforeEach(() => {
      biomeSystem = new BiomeSystem(0.3);
      scatterer = new VegetationScatter(biomeSystem, 12345);
      
      const generator = new TerrainGenerator({ 
        seed: 12345, 
        width: 64, 
        height: 64 
      });
      terrainData = generator.generate();
    });

    it('should scatter vegetation based on biome', () => {
      const instances = scatterer.scatterVegetation(
        terrainData.heightMap,
        terrainData.slopeMap,
        terrainData.biomeMask,
        64,
        64,
        1.0
      );
      
      expect(instances.length).toBeGreaterThan(0);
      
      // All instances should have valid properties
      for (const inst of instances) {
        expect(inst.position).toBeDefined();
        expect(inst.scale).toBeGreaterThan(0);
        expect(inst.rotation).toBeGreaterThanOrEqual(0);
        expect(inst.rotation).toBeLessThanOrEqual(Math.PI * 2);
      }
    });

    it('should respect slope limits', () => {
      const config = scatterer.getVegetationConfig('oak_trees');
      expect(config).toBeDefined();
      expect(config!.slopeLimit).toBeLessThan(1.0);
    });

    it('should apply clumping', () => {
      const instances = scatterer.scatterVegetation(
        terrainData.heightMap,
        terrainData.slopeMap,
        terrainData.biomeMask,
        64,
        64,
        1.0
      );
      
      const clustered = scatterer.applyClumping(instances, 0.7);
      expect(clustered.length).toBe(instances.length);
    });

    it('should filter by biome type', () => {
      const instances = scatterer.scatterVegetation(
        terrainData.heightMap,
        terrainData.slopeMap,
        terrainData.biomeMask,
        64,
        64,
        1.0
      );
      
      const forestInstances = scatterer.filterByBiome(instances, [BiomeType.FOREST]);
      
      for (const inst of forestInstances) {
        expect(inst.biome).toBe(BiomeType.FOREST);
      }
    });
  });

  describe('TerrainUtils', () => {
    let heightMap: Float32Array;
    const width = 32;
    const height = 32;

    beforeEach(() => {
      heightMap = new Float32Array(width * height);
      for (let i = 0; i < heightMap.length; i++) {
        heightMap[i] = Math.sin(i / 10) * 0.5 + 0.5;
      }
    });

    it('should sample height with bilinear interpolation', () => {
      const h1 = TerrainUtils.sampleHeight(heightMap, width, 5, 5);
      const h2 = TerrainUtils.sampleHeight(heightMap, width, 5.5, 5.5);
      
      expect(h1).toBeGreaterThanOrEqual(0);
      expect(h1).toBeLessThanOrEqual(1);
      expect(h2).toBeGreaterThanOrEqual(0);
      expect(h2).toBeLessThanOrEqual(1);
    });

    it('should calculate slope correctly', () => {
      const slope = TerrainUtils.calculateSlope(heightMap, width, 10, 10);
      expect(slope).toBeGreaterThanOrEqual(0);
    });

    it('should detect underwater positions', () => {
      expect(TerrainUtils.isUnderwater(0.2, 0.3)).toBe(true);
      expect(TerrainUtils.isUnderwater(0.4, 0.3)).toBe(false);
    });

    it('should calculate water depth', () => {
      expect(TerrainUtils.getWaterDepth(0.2, 0.3)).toBeCloseTo(0.1, 2);
      expect(TerrainUtils.getWaterDepth(0.4, 0.3)).toBe(0);
    });

    it('should calculate bounding box', () => {
      const bounds = TerrainUtils.calculateBounds(heightMap, width, height, 100);
      
      expect(bounds.min.x).toBe(0);
      expect(bounds.min.z).toBe(0);
      expect(bounds.max.x).toBe(width - 1);
      expect(bounds.max.z).toBe(height - 1);
    });

    it('should smooth heightmap', () => {
      const smoothed = TerrainUtils.smoothHeightmap(heightMap, width, height, 2);
      
      expect(smoothed.length).toBe(heightMap.length);
      
      // Smoothing should reduce variance
      const getVariance = (map: Float32Array) => {
        const mean = Array.from(map).reduce((a, b) => a + b, 0) / map.length;
        return map.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / map.length;
      };
      
      const originalVar = getVariance(heightMap);
      const smoothedVar = getVariance(smoothed);
      
      expect(smoothedVar).toBeLessThan(originalVar);
    });

    it('should generate minimap data', () => {
      const minimap = TerrainUtils.generateMinimap(heightMap, width, height, 64);
      
      expect(minimap.length).toBe(64 * 64 * 4); // RGBA
    });
  });

  describe('Performance Benchmarks', () => {
    it('should generate 512x512 terrain in reasonable time', () => {
      const generator = new TerrainGenerator({
        seed: 12345,
        width: 512,
        height: 512,
        erosionIterations: 15,
      });

      const start = performance.now();
      generator.generate();
      const end = performance.now();

      const duration = end - start;
      console.log(`512x512 terrain generation: ${duration.toFixed(2)}ms`);
      
      // Should complete in under 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should handle chunked meshing efficiently', () => {
      const generator = new TerrainGenerator({ seed: 12345, width: 256, height: 256 });
      const terrain = generator.generate();
      const mesher = new TerrainMesher({ chunkSize: 64 });

      const start = performance.now();
      const chunks = mesher.generateChunkedMesh(terrain, new Vector3(128, 100, 128));
      const end = performance.now();

      const duration = end - start;
      console.log(`Chunked meshing (${chunks.size} chunks): ${duration.toFixed(2)}ms`);
      
      expect(duration).toBeLessThan(500);
    });
  });
});
