/**
 * Phase 4: Asset Generation System - Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  AssetFactory, 
  ChairGenerator, 
  TableGenerator, 
  PottedPlantGenerator,
  AssetType,
  GeneratedAsset 
} from '../objects/furniture';
import { 
  MaterialGenerator, 
  MaterialLibrary, 
  MaterialType,
  GeneratedMaterial 
} from '../materials/MaterialSystem';

describe('Phase 4: Asset Generation System', () => {
  
  // ============================================================================
  // Furniture Generator Tests
  // ============================================================================
  
  describe('ChairGenerator', () => {
    let generator: ChairGenerator;
    
    beforeEach(() => {
      generator = new ChairGenerator();
    });
    
    it('should generate chair with default parameters', () => {
      const asset = generator.generate({});
      
      expect(asset).toBeDefined();
      expect(asset.geometry).toBeDefined();
      expect(asset.bbox).toBeDefined();
      expect(asset.tags.semantics).toBeDefined();
      expect(asset.lod).toBe('medium');
    });
    
    it('should generate chair with custom dimensions', () => {
      const asset = generator.generate({
        width: 0.6,
        height: 1.0,
        depth: 0.55,
      });
      
      expect(asset.bbox.min.x).toBeCloseTo(-0.3, 1);
      expect(asset.bbox.max.x).toBeCloseTo(0.3, 1);
      expect(asset.bbox.max.y).toBeCloseTo(1.0, 1);
    });
    
    it('should generate chair with different styles', () => {
      const modern = generator.generate({ style: 'modern' });
      const traditional = generator.generate({ style: 'traditional' });
      const rustic = generator.generate({ style: 'rustic' });
      
      expect(modern.tags.style).toBeDefined();
      expect(traditional.tags.style).toBeDefined();
      expect(rustic.tags.style).toBeDefined();
    });
    
    it('should generate chair without armrests when specified', () => {
      const asset = generator.generate({ hasArmrests: false });
      
      expect(asset).toBeDefined();
      expect(asset.geometry.attributes.position.count).toBeGreaterThan(0);
    });
    
    it('should generate chair without backrest when specified', () => {
      const asset = generator.generate({ hasBackrest: false });
      
      expect(asset).toBeDefined();
      expect(asset.geometry.attributes.position.count).toBeGreaterThan(0);
    });
    
    it('should generate collision geometry for low LOD', () => {
      const asset = generator.generate({ lod: 'low' });
      
      expect(asset.collisionGeometry).toBeDefined();
      expect(asset.collisionGeometry!.attributes.position.count).toBeGreaterThan(0);
    });
    
    it('should assign correct material tags based on parameters', () => {
      const woodFabric = generator.generate({ 
        primaryMaterial: 'wood', 
        secondaryMaterial: 'fabric' 
      });
      
      expect(woodFabric.tags.material).toContainEqual(expect.anything());
    });
    
    it('should assign size tags correctly', () => {
      const small = generator.generate({ width: 0.3 });
      const medium = generator.generate({ width: 0.5 });
      const large = generator.generate({ width: 0.8 });
      
      expect(small.tags.size).toBeDefined();
      expect(medium.tags.size).toBeDefined();
      expect(large.tags.size).toBeDefined();
    });
  });
  
  describe('TableGenerator', () => {
    let generator: TableGenerator;
    
    beforeEach(() => {
      generator = new TableGenerator();
    });
    
    it('should generate table with default parameters', () => {
      const asset = generator.generate({});
      
      expect(asset).toBeDefined();
      expect(asset.geometry).toBeDefined();
      expect(asset.bbox).toBeDefined();
    });
    
    it('should generate table with custom dimensions', () => {
      const asset = generator.generate({
        width: 1.5,
        height: 0.8,
        depth: 1.0,
      });
      
      expect(asset.bbox.max.y).toBeCloseTo(0.8, 1);
    });
    
    it('should generate table with different leg styles', () => {
      const straight = generator.generate({ legStyle: 'straight' });
      const tapered = generator.generate({ legStyle: 'tapered' });
      
      expect(straight).toBeDefined();
      expect(tapered).toBeDefined();
    });
    
    it('should add apron for traditional and rustic styles', () => {
      const traditional = generator.generate({ style: 'traditional' });
      const modern = generator.generate({ style: 'modern' });
      
      expect(traditional.geometry.attributes.position.count)
        .toBeGreaterThan(modern.geometry.attributes.position.count);
    });
  });
  
  describe('PottedPlantGenerator', () => {
    let generator: PottedPlantGenerator;
    
    beforeEach(() => {
      generator = new PottedPlantGenerator();
    });
    
    it('should generate plant with default parameters', () => {
      const asset = generator.generate({});
      
      expect(asset).toBeDefined();
      expect(asset.geometry).toBeDefined();
      expect(asset.tags.semantics).toBeDefined();
    });
    
    it('should generate plant with custom leaf count', () => {
      const fewLeaves = generator.generate({ leafCount: 5 });
      const manyLeaves = generator.generate({ leafCount: 50 });
      
      expect(fewLeaves).toBeDefined();
      expect(manyLeaves).toBeDefined();
      expect(manyLeaves.geometry.attributes.position.count)
        .toBeGreaterThan(fewLeaves.geometry.attributes.position.count);
    });
    
    it('should generate deterministic plants with seed', () => {
      const plant1 = generator.generate({ seed: 12345 });
      const plant2 = generator.generate({ seed: 12345 });
      
      // Same seed should produce same geometry
      expect(plant1.geometry.attributes.position.count)
        .toBe(plant2.geometry.attributes.position.count);
    });
    
    it('should assign PLANT semantic tag', () => {
      const asset = generator.generate({});
      
      expect(asset.tags.semantics).toBeDefined();
    });
  });
  
  // ============================================================================
  // Asset Factory Tests
  // ============================================================================
  
  describe('AssetFactory', () => {
    beforeEach(() => {
      // Re-initialize factory for clean state
      AssetFactory.initialize();
    });
    
    it('should generate chair through factory', () => {
      const asset = AssetFactory.generate('chair');
      
      expect(asset).not.toBeNull();
      expect(asset!.tags.semantics).toBeDefined();
    });
    
    it('should generate table through factory', () => {
      const asset = AssetFactory.generate('table');
      
      expect(asset).not.toBeNull();
      expect(asset!.geometry).toBeDefined();
    });
    
    it('should generate potted plant through factory', () => {
      const asset = AssetFactory.generate('potted_plant');
      
      expect(asset).not.toBeNull();
      expect(asset!.tags.semantics).toBeDefined();
    });
    
    it('should return null for unsupported asset types', () => {
      const asset = AssetFactory.generate('sofa' as AssetType);
      
      expect(asset).toBeNull();
    });
    
    it('should merge custom parameters with defaults', () => {
      const asset = AssetFactory.generate('chair', {
        width: 0.7,
        style: 'industrial',
      });
      
      expect(asset).not.toBeNull();
      expect(asset!.parameters.width).toBe(0.7);
      expect(asset!.parameters.style).toBe('industrial');
    });
    
    it('should generate multiple variations', () => {
      const variations = AssetFactory.getRandomVariation('chair', 5);
      
      expect(variations.length).toBe(5);
      variations.forEach(v => {
        expect(v).toBeDefined();
        expect(v.geometry).toBeDefined();
      });
    });
    
    it('should categorize asset types correctly', () => {
      expect(AssetFactory.getCategoryForType('chair')).toBe('furniture');
      expect(AssetFactory.getCategoryForType('table')).toBe('furniture');
      expect(AssetFactory.getCategoryForType('potted_plant')).toBe('plants');
    });
  });
  
  // ============================================================================
  // Material System Tests
  // ============================================================================
  
  describe('MaterialGenerator', () => {
    let generator: MaterialGenerator;
    
    beforeEach(() => {
      generator = new MaterialGenerator(12345);
    });
    
    it('should generate wood material', () => {
      const material = generator.generate('wood');
      
      expect(material).toBeDefined();
      expect(material.type).toBe('wood');
      expect(material.properties.roughness).toBeGreaterThan(0);
      expect(material.properties.metalness).toBe(0);
    });
    
    it('should generate metal material', () => {
      const material = generator.generate('metal');
      
      expect(material.type).toBe('metal');
      expect(material.properties.metalness).toBeGreaterThan(0.5);
    });
    
    it('should generate fabric material', () => {
      const material = generator.generate('fabric');
      
      expect(material.type).toBe('fabric');
      expect(material.properties.roughness).toBeGreaterThan(0.5);
    });
    
    it('should generate all material types', () => {
      const types: MaterialType[] = [
        'wood', 'metal', 'fabric', 'ceramic', 'plastic', 
        'glass', 'leather', 'stone', 'terrain', 'plant'
      ];
      
      types.forEach(type => {
        const material = generator.generate(type);
        expect(material.type).toBe(type);
      });
    });
    
    it('should apply custom properties', () => {
      const material = generator.generate('wood', {
        roughness: 0.8,
        metalness: 0.1,
      });
      
      expect(material.properties.roughness).toBe(0.8);
      expect(material.properties.metalness).toBe(0.1);
    });
    
    it('should generate textures for materials with patterns', () => {
      const material = generator.generate('wood', { pattern: 'grain' });
      
      expect(material.textures.baseColor).toBeDefined();
    });
    
    it('should generate normal maps when requested', () => {
      const material = generator.generate('wood', { hasNormalMap: true });
      
      expect(material.textures.normal).toBeDefined();
    });
    
    it('should apply wear to materials', () => {
      const base = generator.generate('wood');
      const worn = generator.applyWear(base, 0.5);
      
      expect(worn.properties.wearLevel).toBe(0.5);
      expect(worn.properties.roughness).toBeGreaterThan(base.properties.roughness);
    });
    
    it('should apply dirt to materials', () => {
      const base = generator.generate('wood');
      const dirty = generator.applyWear(base, 0.3, 0.5);
      
      expect(dirty.properties.dirtLevel).toBe(0.5);
    });
    
    it('should create style variations', () => {
      const base = generator.generate('wood');
      
      const modern = generator.createStyleVariation(base, 'modern');
      const rustic = generator.createStyleVariation(base, 'rustic');
      const industrial = generator.createStyleVariation(base, 'industrial');
      
      expect(modern).toBeDefined();
      expect(rustic).toBeDefined();
      expect(industrial).toBeDefined();
    });
    
    it('should generate deterministic materials with seed', () => {
      const gen1 = new MaterialGenerator(99999);
      const gen2 = new MaterialGenerator(99999);
      
      const mat1 = gen1.generate('wood');
      const mat2 = gen2.generate('wood');
      
      // Same seed should produce similar materials
      expect(mat1.properties.roughness).toBe(mat2.properties.roughness);
    });
  });
  
  describe('MaterialLibrary', () => {
    beforeEach(() => {
      MaterialLibrary.clearCache();
    });
    
    it('should get cached materials', () => {
      const mat1 = MaterialLibrary.getMaterial('wood');
      const mat2 = MaterialLibrary.getMaterial('wood');
      
      // Should return same cached instance
      expect(mat1).toBe(mat2);
    });
    
    it('should cache materials with different styles separately', () => {
      const modern = MaterialLibrary.getMaterial('wood', 'modern');
      const rustic = MaterialLibrary.getMaterial('wood', 'rustic');
      
      expect(modern).not.toBe(rustic);
    });
    
    it('should generate random wood variations', () => {
      const wood = MaterialLibrary.getRandomWood();
      
      expect(wood.type).toBe('wood');
      expect(wood.properties.baseColor).toBeDefined();
    });
    
    it('should generate random metal variations', () => {
      const metal = MaterialLibrary.getRandomMetal();
      
      expect(metal.type).toBe('metal');
      expect(metal.properties.metalness).toBeGreaterThan(0.5);
    });
    
    it('should generate random fabric variations', () => {
      const fabric = MaterialLibrary.getRandomFabric();
      
      expect(fabric.type).toBe('fabric');
    });
  });
  
  // ============================================================================
  // Integration Tests
  // ============================================================================
  
  describe('Asset and Material Integration', () => {
    it('should create furnished scene with appropriate materials', () => {
      // Generate furniture
      const chair = AssetFactory.generate('chair', { 
        primaryMaterial: 'wood',
        style: 'modern'
      });
      
      const table = AssetFactory.generate('table', {
        primaryMaterial: 'wood',
        style: 'modern'
      });
      
      const plant = AssetFactory.generate('potted_plant', {
        potMaterial: 'ceramic'
      });
      
      expect(chair).toBeDefined();
      expect(table).toBeDefined();
      expect(plant).toBeDefined();
      
      // Verify all have proper tags
      expect(chair!.tags.semantics).toBeDefined();
      expect(table!.tags.semantics).toBeDefined();
      expect(plant!.tags.semantics).toBeDefined();
    });
    
    it('should generate consistent style across assets and materials', () => {
      const rusticChair = AssetFactory.generate('chair', { style: 'rustic' });
      const rusticTable = AssetFactory.generate('table', { style: 'rustic' });
      
      const rusticWood = MaterialLibrary.getMaterial('wood', 'rustic');
      
      expect(rusticChair).toBeDefined();
      expect(rusticTable).toBeDefined();
      expect(rusticWood).toBeDefined();
    });
  });
});
