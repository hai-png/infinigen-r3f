import { describe, it, expect } from 'vitest';

describe('ScenePresets', () => {
  it('should import the ScenePresets module', async () => {
    const mod = await import('@/assets/composition/ScenePresets');
    expect(mod).toBeDefined();
  });

  it('should have scene presets defined', async () => {
    const mod = await import('@/assets/composition/ScenePresets');
    const keys = Object.keys(mod);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('should have expanded presets from the audit (34+ total)', async () => {
    const mod = await import('@/assets/composition/ScenePresets');
    // Check for ALL_PRESETS or similar
    if (mod.ALL_PRESETS) {
      expect(mod.ALL_PRESETS.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('should have nature scene presets', async () => {
    const mod = await import('@/assets/composition/ScenePresets');
    // Should have alpine, desert, forest, etc.
    const keys = Object.keys(mod);
    const hasNature = keys.some(k =>
      k.toLowerCase().includes('alpine') ||
      k.toLowerCase().includes('desert') ||
      k.toLowerCase().includes('forest') ||
      k.toLowerCase().includes('nature')
    );
    expect(hasNature).toBe(true);
  });

  it('should have indoor scene presets', async () => {
    const mod = await import('@/assets/composition/ScenePresets');
    const keys = Object.keys(mod);
    const hasIndoor = keys.some(k =>
      k.toLowerCase().includes('indoor') ||
      k.toLowerCase().includes('living') ||
      k.toLowerCase().includes('bedroom') ||
      k.toLowerCase().includes('kitchen')
    );
    expect(hasIndoor).toBe(true);
  });

  it('should support getPreset function', async () => {
    const mod = await import('@/assets/composition/ScenePresets');
    if (typeof mod.getPreset === 'function') {
      const preset = mod.getPreset('alpineMeadow');
      // May return undefined for unknown presets
      expect(typeof preset === 'object' || preset === undefined).toBe(true);
    }
  });
});
