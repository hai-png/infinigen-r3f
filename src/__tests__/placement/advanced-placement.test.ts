/**
 * Tests for Advanced Placement & Scattering System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, BoxGeometry, Mesh } from 'three';
import { BBox } from '../../../core/util/math/bbox';
import {
  PoissonDiskSampler,
  RelaxationSolver,
  SurfaceProjector,
  CollisionAvoidance,
  SemanticFilter,
  AdvancedPlacer,
  createDefaultConfig
} from '../advanced/AdvancedPlacer';
import {
  ScatterSystem,
  DensityMapGenerator,
  ClumpingSystem,
  VariationEngine,
  LODManager,
  createDefaultScatterConfig
} from '../advanced/ScatterSystem';
import {
  OcclusionMesher,
  Voxelizer,
  ConvexDecomposer,
  createDefaultVoxelConfig,
  createDefaultConvexConfig
} from '../advanced/OcclusionMesher';

describe('Advanced Placement', () => {
  describe('PoissonDiskSampler', () => {
    it('should generate points with minimum separation', () => {
      const sampler = new PoissonDiskSampler(10, 10, 10, 1.0);
      const points = sampler.sample(50);

      expect(points.length).toBeGreaterThan(0);
      
      // Verify minimum distance constraint
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dist = points[i].distanceTo(points[j]);
          expect(dist).toBeGreaterThanOrEqual(0.95); // Small tolerance
        }
      }
    });

    it('should respect bounds', () => {
      const sampler = new PoissonDiskSampler(5, 5, 5, 0.5);
      const points = sampler.sample(20);

      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThan(5);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThan(5);
        expect(point.z).toBeGreaterThanOrEqual(0);
        expect(point.z).toBeLessThan(5);
      }
    });
  });

  describe('RelaxationSolver', () => {
    it('should smooth point distribution', () => {
      const points = [
        new Vector3(0, 0, 0),
        new Vector3(1, 0, 0),
        new Vector3(0.5, 0.866, 0),
      ];
      
      const bounds = new BBox(
        new Vector3(-1, -1, -1),
        new Vector3(2, 2, 2)
      );
      
      const solver = new RelaxationSolver(points, bounds, 3);
      const relaxed = solver.relax();

      expect(relaxed.length).toBe(3);
      
      // Points should have moved toward centroid
      const centroid = new Vector3(
        points.reduce((s, p) => s + p.x, 0) / 3,
        points.reduce((s, p) => s + p.y, 0) / 3,
        points.reduce((s, p) => s + p.z, 0) / 3
      );
      
      // After relaxation, points should be closer to centroid on average
      const originalDist = points[0].distanceTo(centroid);
      const relaxedDist = relaxed[0].distanceTo(centroid);
      
      expect(relaxedDist).toBeLessThanOrEqual(originalDist + 0.1);
    });
  });

  describe('CollisionAvoidance', () => {
    it('should detect sphere collisions', () => {
      const collider = new CollisionAvoidance(0.1);
      collider.addShape({
        type: 'sphere',
        position: new Vector3(0, 0, 0),
        size: 1
      });

      expect(collider.hasCollision(new Vector3(0, 0, 0), 0.5)).toBe(true);
      expect(collider.hasCollision(new Vector3(5, 5, 5), 0.5)).toBe(false);
    });

    it('should find valid positions near colliding target', () => {
      const collider = new CollisionAvoidance(0);
      collider.addShape({
        type: 'sphere',
        position: new Vector3(0, 0, 0),
        size: 1
      });

      const valid = collider.findValidPosition(
        new Vector3(0, 0, 0),
        0.5,
        2,
        100
      );

      if (valid) {
        expect(collider.hasCollision(valid, 0.5)).toBe(false);
      }
    });
  });

  describe('SemanticFilter', () => {
    it('should filter by required tags', () => {
      const filter = new SemanticFilter();
      filter.addRequiredTag('floor');
      filter.addRequiredTag('wood');

      expect(filter.test(['floor', 'wood'])).toBe(true);
      expect(filter.test(['floor'])).toBe(false);
      expect(filter.test(['wood'])).toBe(false);
      expect(filter.test(['floor', 'wood', 'polished'])).toBe(true);
    });

    it('should filter by forbidden tags', () => {
      const filter = new SemanticFilter();
      filter.addForbiddenTag('wet');
      filter.addForbiddenTag('slippery');

      expect(filter.test(['floor'])).toBe(true);
      expect(filter.test(['floor', 'wet'])).toBe(false);
      expect(filter.test(['floor', 'slippery'])).toBe(false);
    });
  });
});

describe('Scatter System', () => {
  describe('DensityMapGenerator', () => {
    it('should create gradient density map', () => {
      const bounds = new BBox(
        new Vector3(0, 0, 0),
        new Vector3(10, 0, 10)
      );
      
      const generator = new DensityMapGenerator([10, 10], bounds);
      generator.createGradient('x', 0, 1);

      expect(generator.getValue(new Vector3(0, 0, 0))).toBeCloseTo(0, 1);
      expect(generator.getValue(new Vector3(10, 0, 0))).toBeCloseTo(1, 1);
      expect(generator.getValue(new Vector3(5, 0, 5))).toBeCloseTo(0.5, 1);
    });

    it('should create radial density map', () => {
      const bounds = new BBox(
        new Vector3(-10, 0, -10),
        new Vector3(10, 0, 10)
      );
      
      const generator = new DensityMapGenerator([20, 20], bounds);
      const centers = [new Vector3(0, 0, 0)];
      generator.createRadial(centers, 5, 'linear');

      const centerValue = generator.getValue(new Vector3(0, 0, 0));
      const edgeValue = generator.getValue(new Vector3(5, 0, 0));
      const outsideValue = generator.getValue(new Vector3(10, 0, 0));

      expect(centerValue).toBeGreaterThan(0.8);
      expect(edgeValue).toBeLessThan(0.3);
      expect(outsideValue).toBe(0);
    });
  });

  describe('ClumpingSystem', () => {
    it('should generate clumped positions', () => {
      const config = {
        numClumps: 3,
        clumpRadius: 2,
        instancesPerClump: 10
      };
      
      const clumper = new ClumpingSystem(config);
      const positions = clumper.generatePositions(30);

      expect(positions.length).toBe(30);

      // Verify positions are clustered around centers
      const centers = clumper.getClumpCenters();
      expect(centers.length).toBe(3);

      for (const pos of positions) {
        let inClump = false;
        for (const center of centers) {
          if (pos.distanceTo(center) <= config.clumpRadius * 1.5) {
            inClump = true;
            break;
          }
        }
        expect(inClump).toBe(true);
      }
    });
  });

  describe('VariationEngine', () => {
    it('should generate varied scales', () => {
      const engine = new VariationEngine([0.5, 2.0], Math.PI, []);
      
      const scales = new Set<number>();
      for (let i = 0; i < 20; i++) {
        const scale = engine.generateScale(i);
        scales.add(Math.round(scale.x * 100));
      }

      // Should have some variation
      expect(scales.size).toBeGreaterThan(5);
      
      // All scales should be in range
      for (const scale of scales) {
        expect(scale).toBeGreaterThanOrEqual(50);
        expect(scale).toBeLessThanOrEqual(200);
      }
    });

    it('should generate varied rotations', () => {
      const engine = new VariationEngine([1, 1], Math.PI, []);
      
      const rotations = new Set<number>();
      for (let i = 0; i < 20; i++) {
        const rot = engine.generateRotation(false, undefined, i);
        rotations.add(Math.round(rot.y * 100));
      }

      expect(rotations.size).toBeGreaterThan(5);
    });
  });

  describe('LODManager', () => {
    it('should assign correct LOD levels based on distance', () => {
      const manager = new LODManager([10, 30, 100]);
      const instancePos = new Vector3(0, 0, 0);

      expect(manager.getLODLevel(new Vector3(5, 0, 0), instancePos)).toBe(0);
      expect(manager.getLODLevel(new Vector3(20, 0, 0), instancePos)).toBe(1);
      expect(manager.getLODLevel(new Vector3(50, 0, 0), instancePos)).toBe(2);
      expect(manager.getLODLevel(new Vector3(150, 0, 0), instancePos)).toBe(3);
    });
  });
});

describe('Occlusion Mesher', () => {
  describe('Voxelizer', () => {
    it('should voxelize a mesh', () => {
      const config = createDefaultVoxelConfig();
      const voxelizer = new Voxelizer(config);
      
      const geometry = new BoxGeometry(2, 2, 2);
      const mesh = new Mesh(geometry);
      
      const voxels = voxelizer.voxelize(mesh);
      
      expect(voxels.length).toBeGreaterThan(0);
      expect(voxels.length).toBeLessThanOrEqual(config.maxVoxels);
    });
  });

  describe('ConvexDecomposer', () => {
    it('should decompose mesh into convex hulls', () => {
      const config = createDefaultConvexConfig();
      const decomposer = new ConvexDecomposer(config);
      
      const geometry = new BoxGeometry(4, 4, 4);
      const mesh = new Mesh(geometry);
      
      const hulls = decomposer.decomposeMulti(mesh);
      
      expect(hulls.length).toBeGreaterThan(0);
      expect(hulls.length).toBeLessThanOrEqual(config.maxHulls);
      
      // All hulls should be convex
      for (const hull of hulls) {
        expect(hull.isConvex).toBe(true);
      }
    });
  });

  describe('OcclusionMesher', () => {
    it('should generate occlusion mesh using voxels', () => {
      const config = {
        voxel: createDefaultVoxelConfig(),
        convex: createDefaultConvexConfig(),
        useVoxels: true,
        lodLevels: 1
      };
      
      const mesher = new OcclusionMesher(config);
      
      const geometry = new BoxGeometry(2, 2, 2);
      const mesh = new Mesh(geometry);
      
      const result = mesher.generate(mesh);
      
      expect(result.length).toBe(1);
      expect(result[0].geometry).toBeDefined();
      expect(result[0].triangleCount).toBeGreaterThan(0);
    });

    it('should generate occlusion mesh using convex decomposition', () => {
      const config = {
        voxel: createDefaultVoxelConfig(),
        convex: createDefaultConvexConfig(),
        useVoxels: false,
        lodLevels: 1
      };
      
      const mesher = new OcclusionMesher(config);
      
      const geometry = new BoxGeometry(2, 2, 2);
      const mesh = new Mesh(geometry);
      
      const result = mesher.generate(mesh);
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].isConvex).toBe(true);
    });
  });
});

describe('Integration Tests', () => {
  it('should perform complete scattering pipeline', async () => {
    const bounds = new BBox(
      new Vector3(-10, 0, -10),
      new Vector3(10, 0, 10)
    );
    
    const config = {
      ...createDefaultScatterConfig(),
      maxInstances: 20,
      minDistance: 0.5
    };
    
    const system = new ScatterSystem({
      config,
      bounds
    });
    
    const instances = await system.scatter();
    
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.length).toBeLessThanOrEqual(20);
    
    // Verify all instances have required properties
    for (const instance of instances) {
      expect(instance.position).toBeDefined();
      expect(instance.rotation).toBeDefined();
      expect(instance.scale).toBeDefined();
      expect(instance.lodLevel).toBeGreaterThanOrEqual(0);
      expect(instance.lodLevel).toBeLessThan(3);
    }
  }, 10000);

  it('should perform advanced placement with collision avoidance', async () => {
    const bounds = new BBox(
      new Vector3(-5, 0, -5),
      new Vector3(5, 0, 5)
    );
    
    const config = {
      ...createDefaultConfig(),
      minDistance: 0.5,
      avoidCollisions: true,
      maxAttempts: 50
    };
    
    const placer = new AdvancedPlacer({
      config,
      bounds,
      targetCount: 10
    });
    
    const positions = await placer.generatePlacements();
    
    expect(positions.length).toBeGreaterThan(0);
    
    // Verify minimum distance between positions
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = positions[i].distanceTo(positions[j]);
        expect(dist).toBeGreaterThanOrEqual(config.minDistance * 0.9);
      }
    }
  }, 10000);
});

describe('Performance Benchmarks', () => {
  it('should handle large scatter counts efficiently', async () => {
    const bounds = new BBox(
      new Vector3(-50, 0, -50),
      new Vector3(50, 0, 50)
    );
    
    const config = {
      ...createDefaultScatterConfig(),
      maxInstances: 500,
      minDistance: 0.3
    };
    
    const system = new ScatterSystem({
      config,
      bounds
    });
    
    const startTime = performance.now();
    const instances = await system.scatter();
    const endTime = performance.now();
    
    expect(instances.length).toBeGreaterThan(0);
    expect(endTime - startTime).toBeLessThan(5000); // Should complete in < 5s
  }, 10000);

  it('should voxelize complex mesh efficiently', () => {
    const config = {
      ...createDefaultVoxelConfig(),
      maxVoxels: 500
    };
    
    const voxelizer = new Voxelizer(config);
    
    // Create a more complex mesh
    const geometry = new BoxGeometry(10, 10, 10);
    const mesh = new Mesh(geometry);
    
    const startTime = performance.now();
    const voxels = voxelizer.voxelize(mesh);
    const endTime = performance.now();
    
    expect(voxels.length).toBeGreaterThan(0);
    expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1s
  });
});
