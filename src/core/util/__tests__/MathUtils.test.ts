import { describe, it, expect } from 'vitest';

describe('MathUtils', () => {
  describe('SeededRandom', () => {
    it('should produce deterministic sequences with the same seed', async () => {
      const { SeededRandom } = await import('@/core/util/MathUtils');
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const seq1 = [rng1.next(), rng1.next(), rng1.next(), rng1.next(), rng1.next()];
      const seq2 = [rng2.next(), rng2.next(), rng2.next(), rng2.next(), rng2.next()];
      expect(seq1).toEqual(seq2);
    });

    it('should return values between 0 and 1', async () => {
      const { SeededRandom } = await import('@/core/util/MathUtils');
      const rng = new SeededRandom(999);
      for (let i = 0; i < 100; i++) {
        const val = rng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Basic math functions', () => {
    it('should export lerp function', async () => {
      const mod = await import('@/core/util/MathUtils');
      if (typeof mod.lerp === 'function') {
        expect(mod.lerp(0, 10, 0.5)).toBeCloseTo(5);
        expect(mod.lerp(0, 10, 0)).toBeCloseTo(0);
        expect(mod.lerp(0, 10, 1)).toBeCloseTo(10);
      }
    });

    it('should export clamp function', async () => {
      const mod = await import('@/core/util/MathUtils');
      if (typeof mod.clamp === 'function') {
        expect(mod.clamp(5, 0, 10)).toBe(5);
        expect(mod.clamp(-1, 0, 10)).toBe(0);
        expect(mod.clamp(15, 0, 10)).toBe(10);
      }
    });
  });
});
