import { describe, it, expect } from 'vitest';

describe('FruitGenerator', () => {
  it('should import the FruitGenerator module', async () => {
    const mod = await import('@/assets/objects/food/FruitGenerator');
    expect(mod).toBeDefined();
    expect(mod.FruitGenerator).toBeDefined();
  });

  it('should create a FruitGenerator instance', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(42);
    expect(gen).toBeDefined();
  });

  it('should generate apple geometry', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(42);
    const result = gen.generate({ fruitType: 'Apple' });
    expect(result).toBeDefined();
    expect(result.children.length).toBeGreaterThan(0);
  });

  it('should generate banana geometry', async () => {
    const { FruitGenerator } = await import('@/assets/objects/food/FruitGenerator');
    const gen = new FruitGenerator(42);
    const result = gen.generate({ fruitType: 'Banana' });
    expect(result).toBeDefined();
  });

  it('should support FruitBowlGenerator', async () => {
    const { FruitBowlGenerator } = await import('@/assets/objects/food/FruitGenerator');
    expect(FruitBowlGenerator).toBeDefined();
    const bowl = new FruitBowlGenerator(42);
    expect(bowl).toBeDefined();
  });

  it('should support createFruit factory function', async () => {
    const { createFruit } = await import('@/assets/objects/food/FruitGenerator');
    expect(typeof createFruit).toBe('function');
  });
});
