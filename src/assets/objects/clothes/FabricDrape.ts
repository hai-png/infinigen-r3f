import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Fabric drape configuration
 */
export interface FabricDrapeConfig {
  /** Fabric type affecting drape behavior */
  fabricType: 'silk' | 'cotton' | 'wool' | 'linen' | 'velvet' | 'curtain';
  
  /** Drape dimensions */
  width: number;
  height: number;
  
  /** Number of folds */
  foldCount?: number;
  
  /** Drape style */
  style: 'curtain' | 'tablecloth' | 'blanket' | 'towel' | 'sheet';
  
  /** Color */
  color: THREE.Color;
  
  /** Transparency (0-1) */
  transparency?: number;
  
  /** Wrinkle intensity (0-1) */
  wrinkleIntensity?: number;
}

/**
 * Fabric drape generator for creating realistic cloth simulations
 */
export class FabricDrape {
  private config: FabricDrapeConfig;
  
  constructor(config: FabricDrapeConfig) {
    this.config = {
      foldCount: 10,
      transparency: 0,
      wrinkleIntensity: 0.5,
      ...config
    };
  }
  
  /**
   * Generate draped fabric mesh
   */
  public generate(): THREE.Mesh {
    const geometry = this.createDrapeGeometry();
    const material = this.createFabricMaterial();
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Create draped geometry with folds
   */
  private createDrapeGeometry(): THREE.BufferGeometry {
    const segments = 32;
    const rows = 24;
    
    const geometry = new THREE.PlaneGeometry(
      this.config.width,
      this.config.height,
      segments,
      rows
    );
    
    const positions = geometry.attributes.position.array;
    const vertices = positions.length / 3;
    
    // Apply draping based on style
    switch (this.config.style) {
      case 'curtain':
        this.applyCurtainDrape(positions, segments, rows);
        break;
      case 'tablecloth':
        this.applyTableclothDrape(positions, segments, rows);
        break;
      case 'blanket':
        this.applyBlanketDrape(positions, segments, rows);
        break;
      case 'towel':
        this.applyTowelDrape(positions, segments, rows);
        break;
      case 'sheet':
        this.applySheetDrape(positions, segments, rows);
        break;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Apply curtain-style drape
   */
  private applyCurtainDrape(positions: number[], segments: number, rows: number): void {
    const foldCount = this.config.foldCount || 10;
    const foldAmplitude = 0.05 * this.config.width;
    const wrinkleIntensity = this.config.wrinkleIntensity || 0.5;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Main curtain folds (vertical)
      const foldFrequency = foldCount / this.config.width;
      const foldOffset = Math.sin(x * foldFrequency * Math.PI * 2) * foldAmplitude;
      
      // Add gravity-based sag at bottom
      const sagFactor = Math.max(0, (y + this.config.height / 2) / this.config.height);
      const sag = sagFactor * sagFactor * 0.02;
      
      // Add small wrinkles using noise
      const wrinkle = NoiseUtils.perlin2D(x * 10, y * 10) * wrinkleIntensity * 0.01;
      
      // Apply displacement to z-axis (depth)
      positions[i + 2] = foldOffset + sag + wrinkle;
      
      // Slight x displacement for natural look
      positions[i] += Math.sin(y * 0.5) * 0.01 * wrinkleIntensity;
    }
  }
  
  /**
   * Apply tablecloth-style drape
   */
  private applyTableclothDrape(positions: number[], segments: number, rows: number): void {
    const wrinkleIntensity = this.config.wrinkleIntensity || 0.5;
    const tableWidth = this.config.width * 0.6;
    const tableDepth = this.config.height * 0.6;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Check if over table edge
      const overEdgeX = Math.abs(x) > tableWidth / 2;
      const overEdgeY = Math.abs(y) > tableDepth / 2;
      
      // Apply drape over edges
      if (overEdgeX || overEdgeY) {
        const distFromEdge = Math.min(
          Math.abs(Math.abs(x) - tableWidth / 2),
          Math.abs(Math.abs(y) - tableDepth / 2)
        );
        
        // Hang down
        positions[i + 1] -= distFromEdge * 0.3;
        
        // Add folds
        const foldFreq = 5;
        const foldAmp = 0.02;
        positions[i + 2] += Math.sin(distFromEdge * foldFreq) * foldAmp;
      }
      
      // Add wrinkles on surface
      const wrinkle = NoiseUtils.perlin2D(x * 15, y * 15) * wrinkleIntensity * 0.005;
      positions[i + 2] += wrinkle;
    }
  }
  
  /**
   * Apply blanket-style drape
   */
  private applyBlanketDrape(positions: number[], segments: number, rows: number): void {
    const wrinkleIntensity = this.config.wrinkleIntensity || 0.5;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Random rumpled appearance
      const rumple = NoiseUtils.perlin2D(x * 8, y * 8) * wrinkleIntensity * 0.03;
      const rumple2 = NoiseUtils.perlin2D(x * 15, y * 15) * wrinkleIntensity * 0.015;
      
      positions[i + 2] += rumple + rumple2;
      
      // Slight droop in center
      const centerDist = Math.sqrt(x * x + y * y);
      const maxDist = Math.sqrt(Math.pow(this.config.width / 2, 2) + Math.pow(this.config.height / 2, 2));
      const droop = Math.pow(centerDist / maxDist, 2) * 0.02;
      
      positions[i + 1] -= droop;
    }
  }
  
  /**
   * Apply towel-style drape
   */
  private applyTowelDrape(positions: number[], segments: number, rows: number): void {
    const wrinkleIntensity = this.config.wrinkleIntensity || 0.5;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Hanging fold pattern
      const foldFreq = 3;
      const foldAmp = 0.03;
      const fold = Math.sin(x * foldFreq) * foldAmp * (1 - Math.abs(y) / (this.config.height / 2));
      
      // Add creases
      const creaseFreq = 20;
      const creaseAmp = 0.005;
      const crease = Math.sin(y * creaseFreq) * creaseAmp * wrinkleIntensity;
      
      positions[i + 2] += fold + crease;
    }
  }
  
  /**
   * Apply sheet-style drape
   */
  private applySheetDrape(positions: number[], segments: number, rows: number): void {
    const wrinkleIntensity = this.config.wrinkleIntensity || 0.5;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Gentle waves
      const wave1 = Math.sin(x * 2 + y * 0.5) * 0.015;
      const wave2 = Math.cos(x * 0.5 - y * 2) * 0.01;
      
      // Fine wrinkles
      const wrinkle = NoiseUtils.perlin2D(x * 12, y * 12) * wrinkleIntensity * 0.008;
      
      positions[i + 2] += wave1 + wave2 + wrinkle;
    }
  }
  
  /**
   * Create fabric material
   */
  private createFabricMaterial(): THREE.MeshStandardMaterial {
    const fabricProps = this.getFabricProperties();
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: fabricProps.roughness,
      metalness: fabricProps.metalness,
      transparent: this.config.transparency! > 0,
      opacity: 1 - (this.config.transparency || 0),
      side: THREE.DoubleSide,
    });
    
    // Add subtle normal variation for fabric texture
    this.addFabricTexture(material);
    
    return material;
  }
  
  /**
   * Get fabric properties based on type
   */
  private getFabricProperties(): { roughness: number; metalness: number } {
    const fabricMap: Record<string, { roughness: number; metalness: number }> = {
      'silk': { roughness: 0.2, metalness: 0.1 },
      'cotton': { roughness: 0.7, metalness: 0.0 },
      'wool': { roughness: 0.9, metalness: 0.0 },
      'linen': { roughness: 0.6, metalness: 0.0 },
      'velvet': { roughness: 0.8, metalness: 0.0 },
      'curtain': { roughness: 0.5, metalness: 0.0 }
    };
    
    return fabricMap[this.config.fabricType] || { roughness: 0.6, metalness: 0.0 };
  }
  
  /**
   * Add fabric texture to material
   */
  private addFabricTexture(material: THREE.MeshStandardMaterial): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Fill with base color
    ctx.fillStyle = `#${this.config.color.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);
    
    // Add fabric weave pattern
    const imageData = ctx.getImageData(0, 0, 256, 256);
    const data = imageData.data;
    
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const index = (y * 256 + x) * 4;
        
        // Weave pattern
        const weave = ((x % 4) < 2) !== ((y % 4) < 2) ? 1 : -1;
        const noise = (Math.random() - 0.5) * 10;
        const variation = weave * 5 + noise;
        
        data[index] = Math.min(255, Math.max(0, data[index] + variation));
        data[index + 1] = Math.min(255, Math.max(0, data[index + 1] + variation));
        data[index + 2] = Math.min(255, Math.max(0, data[index + 2] + variation));
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    
    material.map = texture;
    material.needsUpdate = true;
  }
  
  /**
   * Generate hanging curtain
   */
  public static createHangingCurtain(
    width: number,
    height: number,
    color: THREE.Color,
    fabricType: 'silk' | 'cotton' | 'velvet' | 'curtain' = 'curtain'
  ): THREE.Mesh {
    const drape = new FabricDrape({
      fabricType,
      width,
      height,
      style: 'curtain',
      color,
      foldCount: Math.floor(width * 3),
      wrinkleIntensity: 0.6
    });
    
    return drape.generate();
  }
  
  /**
   * Generate tablecloth
   */
  public static createTablecloth(
    width: number,
    depth: number,
    color: THREE.Color,
    fabricType: 'cotton' | 'linen' | 'silk' = 'linen'
  ): THREE.Mesh {
    const drape = new FabricDrape({
      fabricType,
      width: width * 1.3,
      height: depth * 1.3,
      style: 'tablecloth',
      color,
      wrinkleIntensity: 0.4
    });
    
    return drape.generate();
  }
  
  /**
   * Generate folded towel
   */
  public static createFoldedTowel(
    width: number,
    height: number,
    color: THREE.Color
  ): THREE.Group {
    const group = new THREE.Group();
    
    // Create multiple folded layers
    for (let i = 0; i < 3; i++) {
      const drape = new FabricDrape({
        fabricType: 'cotton',
        width: width * (1 - i * 0.1),
        height: height * 0.3,
        style: 'towel',
        color,
        wrinkleIntensity: 0.7
      });
      
      const towel = drape.generate();
      towel.position.y = i * 0.02;
      towel.rotation.z = (Math.random() - 0.5) * 0.1;
      group.add(towel);
    }
    
    return group;
  }
}

export default FabricDrape;
