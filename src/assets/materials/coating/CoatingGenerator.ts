/**
 * Coating Generator - Varnish, lacquer, paint, powder coating
 * Uses MeshPhysicalMaterial for clearcoat support (NOT MeshStandardMaterial)
 */
import * as THREE from 'three';
import { Color, MeshPhysicalMaterial } from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../BaseMaterialGenerator';
import { SeededRandom } from '../../../core/util/MathUtils';

export interface CoatingParams {
  type: 'varnish' | 'lacquer' | 'paint' | 'powder' | 'anodized';
  color: Color;
  glossiness: number;
  thickness: number;
  clearcoat: number;
  [key: string]: unknown;
}

export class CoatingGenerator extends BaseMaterialGenerator<CoatingParams> {
  private static readonly DEFAULT_PARAMS: CoatingParams = {
    type: 'varnish',
    color: new Color(0xffffff),
    glossiness: 0.7,
    thickness: 0.01,
    clearcoat: 0.5,
  };

  constructor() { super(); }
  getDefaultParams(): CoatingParams { return { ...CoatingGenerator.DEFAULT_PARAMS }; }

  /**
   * Override createBaseMaterial to return MeshPhysicalMaterial
   * Required for clearcoat support
   */
  protected createBaseMaterial(): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.15,
    });
  }

  generate(params: Partial<CoatingParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(CoatingGenerator.DEFAULT_PARAMS, params);
    
    // Use MeshPhysicalMaterial - required for clearcoat
    const material = this.createBaseMaterial();
    
    material.color = finalParams.color;
    material.roughness = 1 - finalParams.glossiness;
    material.clearcoat = finalParams.clearcoat;
    material.clearcoatRoughness = (1 - finalParams.glossiness) * 0.5;
    
    if (finalParams.type === 'powder') {
      material.roughness = 0.4;
      material.metalness = 0.0;
      material.clearcoat = 0.2;
    } else if (finalParams.type === 'anodized') {
      material.metalness = 0.5;
      material.clearcoat = 0.8;
    } else if (finalParams.type === 'lacquer') {
      material.clearcoat = 1.0;
      material.clearcoatRoughness = 0.05;
    }
    
    return { material: material as any, maps: { map: null, roughnessMap: null, normalMap: null }, params: finalParams };
  }

  getVariations(count: number): CoatingParams[] {
    const variations: CoatingParams[] = [];
    const types: CoatingParams['type'][] = ['varnish', 'lacquer', 'paint', 'powder'];
    for (let i = 0; i < count; i++) {
      variations.push({
        type: types[this.rng.nextInt(0, types.length - 1)],
        color: new Color().setHSL(this.rng.nextFloat(), 0.5, 0.5),
        glossiness: 0.3 + this.rng.nextFloat() * 0.6,
        thickness: 0.005 + this.rng.nextFloat() * 0.02,
        clearcoat: 0.3 + this.rng.nextFloat() * 0.6,
      });
    }
    return variations;
  }
}
