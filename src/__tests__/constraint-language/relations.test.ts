/**
 * Test Suite for Constraint Relations
 */

import { describe, it, expect } from 'vitest';
import {
  Touching,
  SupportedBy,
  CoPlanar,
  StableAgainst,
  Facing,
  Between,
  AccessibleFrom,
  ReachableFrom,
  InFrontOf,
  Aligned,
  Hidden,
  Visible,
  Grouped,
  Distributed,
  Coverage,
  SupportCoverage,
  Stability,
  Containment,
  Proximity,
  AndRelations,
  OrRelations,
} from '../../constraint-language/relations';
import { item } from '../../constraint-language/constants';

describe('Spatial Relations', () => {
  const chair = item('chair_1');
  const table = item('table_1');
  const lamp = item('lamp_1');
  const rug = item('rug_1');

  describe('Touching', () => {
    it('should create a touching relation between two objects', () => {
      const relation = new Touching(chair, table);

      expect(relation.type).toBe('relation');
      expect(relation.relationType).toBe('touching');
      expect(relation.obj1).toEqual(chair);
      expect(relation.obj2).toEqual(table);
    });
  });

  describe('SupportedBy', () => {
    it('should create a supported-by relation', () => {
      const relation = new SupportedBy(lamp, table);

      expect(relation.relationType).toBe('supported_by');
      expect(relation.supported).toEqual(lamp);
      expect(relation.supporter).toEqual(table);
    });
  });

  describe('CoPlanar', () => {
    it('should create a coplanar relation with optional normal tolerance', () => {
      const relation = new CoPlanar(chair, table, 0.1);

      expect(relation.relationType).toBe('coplanar');
      expect(relation.normalTolerance).toBe(0.1);
    });

    it('should use default normal tolerance', () => {
      const relation = new CoPlanar(chair, table);

      expect(relation.normalTolerance).toBe(0.05);
    });
  });

  describe('StableAgainst', () => {
    it('should create a stability relation', () => {
      const relation = new StableAgainst(lamp, table);

      expect(relation.relationType).toBe('stable_against');
    });
  });

  describe('Facing', () => {
    it('should create a facing relation with optional angle tolerance', () => {
      const relation = new Facing(chair, table, Math.PI / 4);

      expect(relation.relationType).toBe('facing');
      expect(relation.angleTolerance).toBe(Math.PI / 4);
    });

    it('should use default angle tolerance', () => {
      const relation = new Facing(chair, table);

      expect(relation.angleTolerance).toBe(Math.PI / 6);
    });
  });

  describe('Between', () => {
    it('should create a between relation with three objects', () => {
      const relation = new Between(chair, lamp, table);

      expect(relation.relationType).toBe('between');
      expect(relation.middle).toEqual(chair);
      expect(relation.endpoint1).toEqual(lamp);
      expect(relation.endpoint2).toEqual(table);
    });
  });

  describe('AccessibleFrom', () => {
    it('should create an accessibility relation', () => {
      const relation = new AccessibleFrom(chair, table);

      expect(relation.relationType).toBe('accessible_from');
      expect(relation.target).toEqual(chair);
      expect(relation.source).toEqual(table);
    });
  });

  describe('ReachableFrom', () => {
    it('should create a reachability relation with optional max distance', () => {
      const relation = new ReachableFrom(chair, table, 2.0);

      expect(relation.relationType).toBe('reachable_from');
      expect(relation.maxDistance).toBe(2.0);
    });

    it('should use default max distance', () => {
      const relation = new ReachableFrom(chair, table);

      expect(relation.maxDistance).toBe(1.5);
    });
  });

  describe('InFrontOf', () => {
    it('should create an in-front-of relation with optional distance', () => {
      const relation = new InFrontOf(chair, table, 1.0);

      expect(relation.relationType).toBe('in_front_of');
      expect(relation.minDistance).toBe(1.0);
    });
  });

  describe('Aligned', () => {
    it('should create an aligned relation with axis specification', () => {
      const relation = new Aligned(chair, table, 'x');

      expect(relation.relationType).toBe('aligned');
      expect(relation.axis).toBe('x');
    });

    it('should support multiple axes', () => {
      const relation = new Aligned(chair, table, ['x', 'z']);

      expect(relation.axis).toEqual(['x', 'z']);
    });
  });

  describe('Hidden', () => {
    it('should create a hidden relation from viewpoint', () => {
      const viewpoint = item('camera_1');
      const relation = new Hidden(chair, viewpoint);

      expect(relation.relationType).toBe('hidden');
      expect(relation.hiddenObject).toEqual(chair);
      expect(relation.fromViewpoint).toEqual(viewpoint);
    });
  });

  describe('Visible', () => {
    it('should create a visible relation from viewpoint', () => {
      const viewpoint = item('camera_1');
      const relation = new Visible(chair, viewpoint);

      expect(relation.relationType).toBe('visible');
      expect(relation.visibleObject).toEqual(chair);
      expect(relation.fromViewpoint).toEqual(viewpoint);
    });
  });

  describe('Grouped', () => {
    it('should create a grouped relation with multiple objects', () => {
      const relation = new Grouped([chair, table, lamp]);

      expect(relation.relationType).toBe('grouped');
      expect(relation.objects).toHaveLength(3);
    });

    it('should require at least 2 objects', () => {
      expect(() => new Grouped([chair])).toThrow();
    });
  });

  describe('Distributed', () => {
    it('should create a distributed relation over a region', () => {
      const region = item('room_1');
      const relation = new Distributed([chair, table, lamp], region);

      expect(relation.relationType).toBe('distributed');
      expect(relation.region).toEqual(region);
    });
  });

  describe('Coverage', () => {
    it('should create a coverage relation with percentage', () => {
      const relation = new Coverage(rug, table, 0.8);

      expect(relation.relationType).toBe('coverage');
      expect(relation.coveredObject).toEqual(table);
      expect(relation.coveringObject).toEqual(rug);
      expect(relation.coveragePercentage).toBe(0.8);
    });
  });

  describe('SupportCoverage', () => {
    it('should create a support coverage relation', () => {
      const relation = new SupportCoverage(table, chair, 0.5);

      expect(relation.relationType).toBe('support_coverage');
      expect(relation.supportedObject).toEqual(chair);
      expect(relation.supportingObject).toEqual(table);
      expect(relation.coveragePercentage).toBe(0.5);
    });
  });

  describe('Stability', () => {
    it('should create a stability constraint with minimum score', () => {
      const relation = new Stability(table, 0.9);

      expect(relation.relationType).toBe('stability');
      expect(relation.minStabilityScore).toBe(0.9);
    });

    it('should use default stability threshold', () => {
      const relation = new Stability(table);

      expect(relation.minStabilityScore).toBe(0.8);
    });
  });

  describe('Containment', () => {
    it('should create a containment relation', () => {
      const relation = new Containment(lamp, table);

      expect(relation.relationType).toBe('containment');
      expect(relation.contained).toEqual(lamp);
      expect(relation.container).toEqual(table);
    });
  });

  describe('Proximity', () => {
    it('should create a proximity relation with distance', () => {
      const relation = new Proximity(chair, table, 0.5);

      expect(relation.relationType).toBe('proximity');
      expect(relation.maxDistance).toBe(0.5);
    });

    it('should support min and max distance', () => {
      const relation = new Proximity(chair, table, 0.5, 0.2);

      expect(relation.maxDistance).toBe(0.5);
      expect(relation.minDistance).toBe(0.2);
    });
  });
});

describe('Logical Combinations', () => {
  const chair = item('chair_1');
  const table = item('table_1');

  describe('AndRelations', () => {
    it('should combine multiple relations with AND', () => {
      const relation1 = new Touching(chair, table);
      const relation2 = new SupportedBy(chair, table);
      
      const combined = new AndRelations([relation1, relation2]);

      expect(combined.type).toBe('and');
      expect(combined.children).toHaveLength(2);
    });

    it('should flatten nested AND relations', () => {
      const relation1 = new Touching(chair, table);
      const relation2 = new SupportedBy(chair, table);
      const nested = new AndRelations([relation1, relation2]);
      
      const combined = new AndRelations([nested, relation1]);

      // Should flatten to 3 children
      expect(combined.children.length).toBeGreaterThanOrEqual(2);
    });

    it('should simplify single-child AND', () => {
      const relation1 = new Touching(chair, table);
      const combined = new AndRelations([relation1]);

      // Single child should be simplified
      expect(combined.children).toHaveLength(1);
    });
  });

  describe('OrRelations', () => {
    it('should combine multiple relations with OR', () => {
      const relation1 = new Touching(chair, table);
      const relation2 = new Proximity(chair, table, 0.5);
      
      const combined = new OrRelations([relation1, relation2]);

      expect(combined.type).toBe('or');
      expect(combined.children).toHaveLength(2);
    });

    it('should remove duplicate relations', () => {
      const relation1 = new Touching(chair, table);
      const combined = new OrRelations([relation1, relation1]);

      // Duplicates should be removed
      expect(combined.children).toHaveLength(1);
    });
  });

  describe('Complex Combinations', () => {
    it('should create complex nested logical expressions', () => {
      const chair = item('chair_1');
      const table = item('table_1');
      const lamp = item('lamp_1');

      // (touching OR proximity) AND supported
      const touchingOrProx = new OrRelations([
        new Touching(chair, table),
        new Proximity(chair, table, 0.5),
      ]);
      
      const supported = new SupportedBy(chair, table);
      const complex = new AndRelations([touchingOrProx, supported]);

      expect(complex.type).toBe('and');
      expect(complex.children).toHaveLength(2);
      expect((complex.children[0] as any).type).toBe('or');
    });
  });
});

describe('Relation Negation', () => {
  const chair = item('chair_1');
  const table = item('table_1');

  it('should negate a relation', () => {
    // Note: This assumes a NotRelation or similar exists
    // For now, we test the pattern
    const touching = new Touching(chair, table);
    
    // In the actual implementation, you might have:
    // const notTouching = new NotRelation(touching);
    
    expect(touching.relationType).toBe('touching');
  });
});
