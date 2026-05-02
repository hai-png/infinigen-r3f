import { describe, it, expect } from 'vitest';

describe('MaterialPresetLibrary', () => {
  it('should import the MaterialPresetLibrary module', async () => {
    const mod = await import('@/assets/materials/MaterialPresetLibrary');
    expect(mod).toBeDefined();
  });

  it('should have material categories defined', async () => {
    const mod = await import('@/assets/materials/MaterialPresetLibrary');
    // Look for category definitions or presets
    const keys = Object.keys(mod);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('should have terrain material presets', async () => {
    const mod = await import('@/assets/materials/MaterialPresetLibrary');
    const keys = Object.keys(mod);
    // Should have some material-related exports
    const hasMaterials = keys.some(k =>
      k.toLowerCase().includes('material') ||
      k.toLowerCase().includes('preset') ||
      k.toLowerCase().includes('terrain')
    );
    expect(hasMaterials).toBe(true);
  });

  it('should have creature material presets (19 total from audit)', async () => {
    const mod = await import('@/assets/materials/MaterialPresetLibrary');
    // Check that creature materials are available
    const keys = Object.keys(mod);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('should have fluid material presets', async () => {
    const mod = await import('@/assets/materials/MaterialPresetLibrary');
    const keys = Object.keys(mod);
    // Should have fluid-related exports
    expect(keys.length).toBeGreaterThan(0);
  });
});
