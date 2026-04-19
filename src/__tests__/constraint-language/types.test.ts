/**
 * Test Suite for Constraint Language Types
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ObjectSetDomain,
  NumericDomain,
  PoseDomain,
  BBoxDomain,
  BooleanDomain,
  Variable,
  Domain,
} from '../../constraint-language/types';
import { item, scalar, bool } from '../../constraint-language/constants';

describe('Domain Types', () => {
  describe('ObjectSetDomain', () => {
    it('should create an object set domain with values', () => {
      const domain: ObjectSetDomain = {
        type: 'object_set',
        values: ['chair_1', 'table_2', 'lamp_3'],
      };

      expect(domain.type).toBe('object_set');
      expect(domain.values).toHaveLength(3);
      expect(domain.values).toContain('chair_1');
    });

    it('should create an empty object set domain', () => {
      const domain: ObjectSetDomain = {
        type: 'object_set',
        values: [],
      };

      expect(domain.type).toBe('object_set');
      expect(domain.values).toHaveLength(0);
    });
  });

  describe('NumericDomain', () => {
    it('should create a numeric domain with bounds', () => {
      const domain: NumericDomain = {
        type: 'numeric',
        min: 0,
        max: 100,
      };

      expect(domain.type).toBe('numeric');
      expect(domain.min).toBe(0);
      expect(domain.max).toBe(100);
    });

    it('should create a numeric domain with infinite bounds', () => {
      const domain: NumericDomain = {
        type: 'numeric',
        min: -Infinity,
        max: Infinity,
      };

      expect(domain.min).toBe(-Infinity);
      expect(domain.max).toBe(Infinity);
    });

    it('should create a numeric domain with discrete values', () => {
      const domain: NumericDomain = {
        type: 'numeric',
        min: 0,
        max: 10,
        discreteValues: [1, 2, 5, 10],
      };

      expect(domain.discreteValues).toEqual([1, 2, 5, 10]);
    });
  });

  describe('PoseDomain', () => {
    it('should create a pose domain with position and rotation bounds', () => {
      const domain: PoseDomain = {
        type: 'pose',
        positionMin: { x: -10, y: 0, z: -10 },
        positionMax: { x: 10, y: 5, z: 10 },
        rotationMin: { x: 0, y: 0, z: 0 },
        rotationMax: { x: 0, y: Math.PI * 2, z: 0 },
      };

      expect(domain.type).toBe('pose');
      expect(domain.positionMin.y).toBe(0);
      expect(domain.rotationMax.y).toBe(Math.PI * 2);
    });
  });

  describe('BBoxDomain', () => {
    it('should create a bounding box domain', () => {
      const domain: BBoxDomain = {
        type: 'bbox',
        minCorner: { x: -5, y: 0, z: -5 },
        maxCorner: { x: 5, y: 10, z: 5 },
      };

      expect(domain.type).toBe('bbox');
      expect(domain.minCorner.x).toBe(-5);
      expect(domain.maxCorner.x).toBe(5);
    });
  });

  describe('BooleanDomain', () => {
    it('should create a boolean domain', () => {
      const domain: BooleanDomain = {
        type: 'boolean',
      };

      expect(domain.type).toBe('boolean');
    });
  });
});

describe('Variable Creation', () => {
  it('should create an object variable with item()', () => {
    const chairVar = item('chair_1');

    expect(chairVar.name).toBe('chair_1');
    expect(chairVar.domainType).toBe('object_set');
  });

  it('should create a numeric variable with scalar()', () => {
    const distanceVar = scalar('distance');

    expect(distanceVar.name).toBe('distance');
    expect(distanceVar.domainType).toBe('numeric');
  });

  it('should create a boolean variable with bool()', () => {
    const visibleVar = bool('is_visible');

    expect(visibleVar.name).toBe('is_visible');
    expect(visibleVar.domainType).toBe('boolean');
  });

  it('should create a variable with explicit domain', () => {
    const domain: NumericDomain = {
      type: 'numeric',
      min: 0,
      max: 100,
    };

    const varWithDomain: Variable = {
      name: 'temperature',
      domainType: 'numeric',
      value: 25,
    };

    expect(varWithDomain.name).toBe('temperature');
    expect(varWithDomain.value).toBe(25);
  });
});

describe('Domain Validation', () => {
  it('should validate numeric value within domain', () => {
    const domain: NumericDomain = {
      type: 'numeric',
      min: 0,
      max: 100,
    };

    const isValid = (value: number) => value >= domain.min && value <= domain.max;

    expect(isValid(50)).toBe(true);
    expect(isValid(-1)).toBe(false);
    expect(isValid(101)).toBe(false);
  });

  it('should validate object within object set domain', () => {
    const domain: ObjectSetDomain = {
      type: 'object_set',
      values: ['chair_1', 'chair_2', 'table_1'],
    };

    const isValid = (objId: string) => domain.values.includes(objId);

    expect(isValid('chair_1')).toBe(true);
    expect(isValid('lamp_1')).toBe(false);
  });

  it('should validate pose within pose domain', () => {
    const domain: PoseDomain = {
      type: 'pose',
      positionMin: { x: 0, y: 0, z: 0 },
      positionMax: { x: 10, y: 5, z: 10 },
      rotationMin: { x: 0, y: 0, z: 0 },
      rotationMax: { x: 0, y: Math.PI, z: 0 },
    };

    const isPositionValid = (x: number, y: number, z: number) =>
      x >= domain.positionMin.x && x <= domain.positionMax.x &&
      y >= domain.positionMin.y && y <= domain.positionMax.y &&
      z >= domain.positionMin.z && z <= domain.positionMax.z;

    expect(isPositionValid(5, 2.5, 5)).toBe(true);
    expect(isPositionValid(-1, 2.5, 5)).toBe(false);
    expect(isPositionValid(5, 6, 5)).toBe(false);
  });
});

describe('Domain Operations', () => {
  it('should intersect two numeric domains', () => {
    const domain1: NumericDomain = { type: 'numeric', min: 0, max: 100 };
    const domain2: NumericDomain = { type: 'numeric', min: 50, max: 150 };

    const intersection: NumericDomain = {
      type: 'numeric',
      min: Math.max(domain1.min, domain2.min),
      max: Math.min(domain1.max, domain2.max),
    };

    expect(intersection.min).toBe(50);
    expect(intersection.max).toBe(100);
  });

  it('should union two object set domains', () => {
    const domain1: ObjectSetDomain = {
      type: 'object_set',
      values: ['chair_1', 'table_1'],
    };
    const domain2: ObjectSetDomain = {
      type: 'object_set',
      values: ['table_1', 'lamp_1'],
    };

    const union: ObjectSetDomain = {
      type: 'object_set',
      values: [...new Set([...domain1.values, ...domain2.values])],
    };

    expect(union.values).toHaveLength(3);
    expect(union.values).toContain('chair_1');
    expect(union.values).toContain('table_1');
    expect(union.values).toContain('lamp_1');
  });

  it('should check if one domain contains another', () => {
    const outer: NumericDomain = { type: 'numeric', min: 0, max: 100 };
    const inner: NumericDomain = { type: 'numeric', min: 25, max: 75 };

    const contains =
      inner.min >= outer.min && inner.max <= outer.max;

    expect(contains).toBe(true);

    const outside: NumericDomain = { type: 'numeric', min: 50, max: 150 };
    const containsOutside =
      outside.min >= outer.min && outside.max <= outer.max;

    expect(containsOutside).toBe(false);
  });
});
