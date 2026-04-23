/**
 * Node System Test Suite
 * Tests for core node functionality, geometry nodes, and attribute nodes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VectorMathNode, CombineXYZNode, SeparateXYZNode } from '../vector/VectorNodes';
import { StoreNamedAttributeNode, AttributeStatisticNode } from '../attribute/AttributeNodes';
import { GroupOutputNode, MaterialOutputNode } from '../output/OutputNodes';
import { SubdivideMeshNode } from '../geometry/SubdivisionNodes';
import { ExtrudeMeshNode } from '../geometry/MeshEditNodes';
import { DistributePointsOnFacesNode } from '../geometry/SampleNodes';

describe('Vector Nodes', () => {
  describe('VectorMathNode', () => {
    it('should add two vectors', () => {
      const node = new VectorMathNode();
      node.inputs.operation = 'add';
      node.inputs.vector1 = [1, 2, 3];
      node.inputs.vector2 = [4, 5, 6];
      
      const result = node.execute();
      
      expect(result.vector).toEqual([5, 7, 9]);
    });

    it('should subtract two vectors', () => {
      const node = new VectorMathNode();
      node.inputs.operation = 'subtract';
      node.inputs.vector1 = [5, 7, 9];
      node.inputs.vector2 = [1, 2, 3];
      
      const result = node.execute();
      
      expect(result.vector).toEqual([4, 5, 6]);
    });

    it('should calculate dot product', () => {
      const node = new VectorMathNode();
      node.inputs.operation = 'dot_product';
      node.inputs.vector1 = [1, 2, 3];
      node.inputs.vector2 = [4, 5, 6];
      
      const result = node.execute();
      
      expect(result.value).toBe(32); // 1*4 + 2*5 + 3*6
    });

    it('should normalize a vector', () => {
      const node = new VectorMathNode();
      node.inputs.operation = 'normalize';
      node.inputs.vector1 = [3, 0, 0];
      
      const result = node.execute();
      
      expect(result.vector).toEqual([1, 0, 0]);
      expect(result.value).toBe(3); // length output
    });

    it('should handle cross product', () => {
      const node = new VectorMathNode();
      node.inputs.operation = 'cross_product';
      node.inputs.vector1 = [1, 0, 0];
      node.inputs.vector2 = [0, 1, 0];
      
      const result = node.execute();
      
      expect(result.vector).toEqual([0, 0, 1]);
    });
  });

  describe('CombineXYZNode', () => {
    it('should combine XYZ components into vector', () => {
      const node = new CombineXYZNode();
      node.inputs.x = 1;
      node.inputs.y = 2;
      node.inputs.z = 3;
      
      const result = node.execute();
      
      expect(result.vector).toEqual([1, 2, 3]);
    });
  });

  describe('SeparateXYZNode', () => {
    it('should separate vector into XYZ components', () => {
      const node = new SeparateXYZNode();
      node.inputs.vector = [1, 2, 3];
      
      const result = node.execute();
      
      expect(result.x).toBe(1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(3);
    });
  });
});

describe('Attribute Nodes', () => {
  describe('StoreNamedAttributeNode', () => {
    it('should store attribute with name', () => {
      const node = new StoreNamedAttributeNode();
      node.inputs.name = 'testAttribute';
      node.inputs.value = 42;
      node.inputs.domain = 'point';
      
      const result = node.execute({});
      
      expect(result.geometry).toBeDefined();
    });
  });

  describe('AttributeStatisticNode', () => {
    it('should calculate statistics for array', () => {
      const node = new AttributeStatisticNode();
      node.inputs.attribute = [1, 2, 3, 4, 5];
      
      const result = node.execute();
      
      expect(result.count).toBe(5);
      expect(result.average).toBe(3);
      expect(result.min).toBe(1);
      expect(result.max).toBe(5);
      expect(result.sum).toBe(15);
    });

    it('should handle empty array', () => {
      const node = new AttributeStatisticNode();
      node.inputs.attribute = [];
      
      const result = node.execute();
      
      expect(result.count).toBe(0);
    });
  });
});

describe('Output Nodes', () => {
  describe('GroupOutputNode', () => {
    it('should pass through geometry', () => {
      const node = new GroupOutputNode();
      const mockGeometry = { type: 'mesh', vertices: [] };
      node.inputs.geometry = mockGeometry;
      
      const result = node.execute();
      
      expect(result.geometry).toBe(mockGeometry);
    });
  });

  describe('MaterialOutputNode', () => {
    it('should create material with surface shader', () => {
      const node = new MaterialOutputNode();
      node.inputs.surface = { type: 'principled_bsdf' };
      
      const result = node.execute();
      
      expect(result.material).toBeDefined();
      expect(result.material.surface).toBeDefined();
    });
  });
});

describe('Geometry Nodes Integration', () => {
  describe('SubdivideMeshNode', () => {
    it('should subdivide mesh with levels', () => {
      const node = new SubdivideMeshNode();
      node.inputs.levels = 2;
      
      const mockMesh = {
        positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces: [[0, 1, 2]],
      };
      
      const result = node.execute(mockMesh as any);
      
      expect(result.geometry).toBeDefined();
    });
  });

  describe('ExtrudeMeshNode', () => {
    it('should extrude faces', () => {
      const node = new ExtrudeMeshNode();
      node.inputs.offsetScale = 1;
      
      const mockMesh = {
        positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces: [[0, 1, 2]],
      };
      
      const result = node.execute(mockMesh as any);
      
      expect(result.geometry).toBeDefined();
    });
  });

  describe('DistributePointsOnFacesNode', () => {
    it('should distribute points on mesh faces', () => {
      const node = new DistributePointsOnFacesNode();
      node.inputs.density = 10;
      node.inputs.seed = 42;
      
      const mockMesh = {
        positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces: [[0, 1, 2]],
      };
      
      const result = node.execute(mockMesh as any);
      
      expect(result.points).toBeDefined();
    });
  });
});

describe('Node Type Safety', () => {
  it('should have correct node types', () => {
    const vectorMath = new VectorMathNode();
    const combineXYZ = new CombineXYZNode();
    const groupOutput = new GroupOutputNode();
    
    expect(vectorMath.type).toBeDefined();
    expect(combineXYZ.type).toBeDefined();
    expect(groupOutput.type).toBeDefined();
  });

  it('should have execute methods', () => {
    const nodes = [
      new VectorMathNode(),
      new CombineXYZNode(),
      new StoreNamedAttributeNode(),
      new GroupOutputNode(),
    ];
    
    nodes.forEach(node => {
      expect(node.execute).toBeDefined();
      expect(typeof node.execute).toBe('function');
    });
  });
});
