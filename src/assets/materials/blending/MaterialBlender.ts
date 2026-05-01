/**
 * Material Blending System - Multi-material mixing, gradient blends, mask-based blending
 * Blends two materials by interpolating their properties
 */
import { Material, MeshStandardMaterial, MeshPhysicalMaterial, Texture, CanvasTexture, Color, RepeatWrapping } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';

export interface BlendParams {
  material1: Material;
  material2: Material;
  blendFactor: number;
  blendType: 'linear' | 'gradient' | 'noise' | 'mask';
  noiseScale: number;
  gradientDirection: 'horizontal' | 'vertical' | 'radial';
}

export class MaterialBlender {
  /**
   * Blend two materials by interpolating their properties
   * Returns a new material with blended properties and a blend map
   */
  blend(params: BlendParams, seed: number): { blendedMaterial: Material; blendMap: Texture } {
    const rng = new SeededRandom(seed);
    const blendMap = this.generateBlendMap(params, rng);

    // Attempt property-level blending of the two materials
    const blendedMaterial = this.createBlendedMaterial(params, blendMap);

    return {
      blendedMaterial,
      blendMap,
    };
  }

  private createBlendedMaterial(params: BlendParams, blendMap: Texture): Material {
    const mat1 = params.material1 as MeshStandardMaterial;
    const mat2 = params.material2 as MeshStandardMaterial;

    // Determine if we need MeshPhysicalMaterial
    const needsPhysical = mat1 instanceof MeshPhysicalMaterial || mat2 instanceof MeshPhysicalMaterial;
    const MaterialClass = needsPhysical ? MeshPhysicalMaterial : MeshStandardMaterial;

    const factor = params.blendFactor;

    // Blend colors
    const blendedColor = new Color();
    if (mat1.color && mat2.color) {
      blendedColor.copy(mat1.color).lerp(mat2.color, factor);
    } else {
      blendedColor.copy(mat1.color || mat2.color || new Color(0x888888));
    }

    // Blend numeric properties
    const blendedRoughness = this.lerpProp(mat1.roughness, mat2.roughness, factor, 0.5);
    const blendedMetalness = this.lerpProp(mat1.metalness, mat2.metalness, factor, 0.0);
    const blendedOpacity = this.lerpProp(mat1.opacity, mat2.opacity, factor, 1.0);

    const blended = new MaterialClass({
      color: blendedColor,
      roughness: blendedRoughness,
      metalness: blendedMetalness,
      transparent: blendedOpacity < 1,
      opacity: blendedOpacity,
    }) as MeshStandardMaterial;

    // Use material1's maps for the base, blend map controls the mix
    if (mat1.map) blended.map = mat1.map;
    if (mat1.normalMap) blended.normalMap = mat1.normalMap;
    if (mat1.roughnessMap) blended.roughnessMap = mat1.roughnessMap;

    // For MeshPhysicalMaterial properties
    if (blended instanceof MeshPhysicalMaterial) {
      const phys1 = mat1 as MeshPhysicalMaterial;
      const phys2 = mat2 as MeshPhysicalMaterial;

      if (phys1.clearcoat !== undefined || phys2.clearcoat !== undefined) {
        blended.clearcoat = this.lerpProp(phys1.clearcoat || 0, phys2.clearcoat || 0, factor, 0);
        blended.clearcoatRoughness = this.lerpProp(phys1.clearcoatRoughness || 0, phys2.clearcoatRoughness || 0, factor, 0);
      }

      if (phys1.transmission !== undefined || phys2.transmission !== undefined) {
        blended.transmission = this.lerpProp(phys1.transmission || 0, phys2.transmission || 0, factor, 0);
        blended.ior = this.lerpProp(phys1.ior || 1.5, phys2.ior || 1.5, factor, 1.5);
        blended.thickness = this.lerpProp(phys1.thickness || 0, phys2.thickness || 0, factor, 0);
      }
    }

    return blended;
  }

  private lerpProp(a: number | undefined, b: number | undefined, factor: number, fallback: number): number {
    const va = a !== undefined ? a : fallback;
    const vb = b !== undefined ? b : fallback;
    return va + (vb - va) * factor;
  }

  private generateBlendMap(params: BlendParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    switch (params.blendType) {
      case 'linear':
        this.generateLinearBlend(ctx, size, params);
        break;
      case 'gradient':
        this.generateGradientBlend(ctx, size, params);
        break;
      case 'noise':
        this.generateNoiseBlend(ctx, size, params, rng);
        break;
      case 'mask':
        this.generateMaskBlend(ctx, size, params);
        break;
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateLinearBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(params.blendFactor, '#808080');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  private generateGradientBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    let gradient: CanvasGradient;

    if (params.gradientDirection === 'vertical') {
      gradient = ctx.createLinearGradient(0, 0, 0, size);
    } else if (params.gradientDirection === 'radial') {
      gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    } else {
      gradient = ctx.createLinearGradient(0, 0, size, 0);
    }

    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  private generateNoiseBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams, rng: SeededRandom): void {
    const noise = new Noise3D(rng.seed);

    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 50 * params.noiseScale, y / 50 * params.noiseScale, 0);
        const value = Math.floor((n + 1) / 2 * 255);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }

  private generateMaskBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Draw circular mask
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * params.blendFactor * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  getDefaultParams(material1: Material, material2: Material): BlendParams {
    return {
      material1,
      material2,
      blendFactor: 0.5,
      blendType: 'noise',
      noiseScale: 1.0,
      gradientDirection: 'horizontal',
    };
  }
}
