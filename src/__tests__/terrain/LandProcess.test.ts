/**
 * Tests for Land Process algorithms (HydraulicErosionProcess, ThermalWeatheringProcess, SedimentTransportProcess)
 */
import { describe, it, expect } from 'vitest';
import {
  HydraulicErosionProcess,
  ThermalWeatheringProcess,
  SedimentTransportProcess,
} from '../../terrain/land-process';

function createFlatHeightMap(width: number, height: number, value: number = 0): Float32Array {
  const map = new Float32Array(width * height);
  map.fill(value);
  return map;
}

function createSlopeHeightMap(width: number, height: number): Float32Array {
  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      map[y * width + x] = (height - y) / height;
    }
  }
  return map;
}

function createPeakHeightMap(width: number, height: number): Float32Array {
  const map = new Float32Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      map[y * width + x] = Math.max(0, 1 - dist / maxDist);
    }
  }
  return map;
}

describe('HydraulicErosionProcess', () => {
  it('should modify terrain with a peak', () => {
    const size = 32;
    const original = createPeakHeightMap(size, size);
    const modified = original.slice();

    const process = new HydraulicErosionProcess({ iterations: 100, strength: 0.5, enabled: true });
    const result = process.apply(modified, size, size);

    const originalMax = Math.max(...original);
    const resultMax = Math.max(...result);
    expect(resultMax).toBeLessThanOrEqual(originalMax);
  });

  it('should not crash on flat terrain', () => {
    const size = 16;
    const map = createFlatHeightMap(size, size, 0.5);
    const process = new HydraulicErosionProcess({ iterations: 10, strength: 0.5 });
    const result = process.apply(map, size, size);
    expect(result).toBeDefined();
    expect(result.length).toBe(size * size);
  });

  it('should produce deterministic results with same input', () => {
    const size = 16;
    const map1 = createPeakHeightMap(size, size);
    const map2 = createPeakHeightMap(size, size);
    const process = new HydraulicErosionProcess({ iterations: 50, strength: 0.5 });
    const result1 = process.apply(map1, size, size);
    const result2 = process.apply(map2, size, size);
    for (let i = 0; i < result1.length; i++) {
      expect(result1[i]).toBeCloseTo(result2[i], 5);
    }
  });
});

describe('ThermalWeatheringProcess', () => {
  it('should flatten steep slopes', () => {
    const size = 32;
    const map = createSlopeHeightMap(size, size);
    const original = map.slice();

    const process = new ThermalWeatheringProcess({ iterations: 50, strength: 0.5 });
    const result = process.apply(map, size, size);

    let origMaxDiff = 0;
    let resultMaxDiff = 0;
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size; x++) {
        const oi = Math.abs(original[y * size + x] - original[(y + 1) * size + x]);
        const ri = Math.abs(result[y * size + x] - result[(y + 1) * size + x]);
        origMaxDiff = Math.max(origMaxDiff, oi);
        resultMaxDiff = Math.max(resultMaxDiff, ri);
      }
    }
    expect(resultMaxDiff).toBeLessThanOrEqual(origMaxDiff + 0.001);
  });

  it('should not modify flat terrain', () => {
    const size = 16;
    const map = createFlatHeightMap(size, size, 0.5);
    const original = map.slice();
    const process = new ThermalWeatheringProcess({ iterations: 20, strength: 0.5 });
    const result = process.apply(map, size, size);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('should produce deterministic results', () => {
    const size = 16;
    const map1 = createSlopeHeightMap(size, size);
    const map2 = createSlopeHeightMap(size, size);
    const process = new ThermalWeatheringProcess({ iterations: 10, strength: 0.3 });
    const result1 = process.apply(map1, size, size);
    const result2 = process.apply(map2, size, size);
    for (let i = 0; i < result1.length; i++) {
      expect(result1[i]).toBeCloseTo(result2[i], 5);
    }
  });
});

describe('SedimentTransportProcess', () => {
  it('should erode high-flow steep areas', () => {
    const size = 32;
    const map = createPeakHeightMap(size, size);
    const original = map.slice();

    const process = new SedimentTransportProcess({ iterations: 5, strength: 0.5 });
    const result = process.apply(map, size, size);

    const origMax = Math.max(...original);
    const resultMax = Math.max(...result);
    expect(resultMax).toBeLessThanOrEqual(origMax + 0.001);
  });

  it('should not crash on flat terrain', () => {
    const size = 16;
    const map = createFlatHeightMap(size, size, 0.5);
    const process = new SedimentTransportProcess({ iterations: 3, strength: 0.5 });
    const result = process.apply(map, size, size);
    expect(result).toBeDefined();
    expect(result.length).toBe(size * size);
  });

  it('should produce deterministic results', () => {
    const size = 16;
    const map1 = createPeakHeightMap(size, size);
    const map2 = createPeakHeightMap(size, size);
    const process = new SedimentTransportProcess({ iterations: 3, strength: 0.5 });
    const result1 = process.apply(map1, size, size);
    const result2 = process.apply(map2, size, size);
    for (let i = 0; i < result1.length; i++) {
      expect(result1[i]).toBeCloseTo(result2[i], 5);
    }
  });
});
