import { describe, it, expect } from 'vitest';

describe('CactusGenerator', () => {
  it('should import the CactusGenerator module', async () => {
    const mod = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    expect(mod).toBeDefined();
    expect(mod.CactusGenerator).toBeDefined();
  });

  it('should have cactus variant types defined', async () => {
    const mod = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    expect(mod.CACTUS_VARIANTS).toBeDefined();
    expect(mod.CACTUS_VARIANTS.length).toBe(7);
  });

  it('should create a cactus generator instance', async () => {
    const { CactusGenerator } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const gen = new CactusGenerator(42);
    expect(gen).toBeDefined();
  });

  it('should generate cactus geometry for columnar variant', async () => {
    const { CactusGenerator } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const gen = new CactusGenerator(42);
    const result = gen.generate({ variant: 'Columnar' });
    expect(result).toBeDefined();
    expect(result.children.length).toBeGreaterThan(0);
  });

  it('should generate all 7 variants', async () => {
    const { CactusGenerator, CACTUS_VARIANTS } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    for (const variant of CACTUS_VARIANTS) {
      const gen = new CactusGenerator(42);
      const result = gen.generate({ variant });
      expect(result).toBeDefined();
      expect(result.children.length).toBeGreaterThan(0);
    }
  });

  it('should produce deterministic output with same seed', async () => {
    const { CactusGenerator } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const gen1 = new CactusGenerator(42);
    const gen2 = new CactusGenerator(42);
    const r1 = gen1.generate({ variant: 'Columnar' });
    const r2 = gen2.generate({ variant: 'Columnar' });
    expect(r1.children.length).toBe(r2.children.length);
  });

  it('should support createCactus factory function', async () => {
    const { createCactus } = await import('@/assets/objects/vegetation/cactus/CactusGenerator');
    const cactus = createCactus(42, 'Saguaro');
    expect(cactus).toBeDefined();
    expect(cactus.children.length).toBeGreaterThan(0);
  });
});
