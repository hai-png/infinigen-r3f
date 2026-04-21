/**
 * Clothes Generator
 * 
 * Procedural generation of various clothing items including hanging clothes,
 * folded garments, and draped fabrics.
 */

import * as THREE from 'three';
import { AssetFactory } from '../../placement/factory';
import { registerResource } from '../../util/ResourceRegistry';

export type ClothesType = 
  | 'shirt' | 'pants' | 'dress' | 'skirt' | 'jacket' 
  | 'socks' | 'underwear' | 'towel' | 'blanket' | 'curtain';

export type ClothesState = 'hanging' | 'folded' | 'draped' | 'crumpled';

export interface ClothesParams {
  type?: ClothesType;
  state?: ClothesState;
  count?: number;
  scale?: number;
  color?: number;
  pattern?: 'solid' | 'striped' | 'checkered' | 'polkadot';
  seed?: number;
}

interface ClothesSpec {
  baseShape: 'tube' | 'box' | 'sheet' | 'complex';
  sizeRange: [number, number, number]; // [width, height, depth]
  hasSleeves?: boolean;
  hasLegs?: boolean;
  fabricStiffness: number;
}

const CLOTHES_SPECS: Record<ClothesType, ClothesSpec> = {
  shirt: {
    baseShape: 'complex',
    sizeRange: [0.5, 0.7, 0.1],
    hasSleeves: true,
    fabricStiffness: 0.3
  },
  pants: {
    baseShape: 'complex',
    sizeRange: [0.35, 1.0, 0.15],
    hasLegs: true,
    fabricStiffness: 0.4
  },
  dress: {
    baseShape: 'complex',
    sizeRange: [0.45, 1.1, 0.15],
    fabricStiffness: 0.25
  },
  skirt: {
    baseShape: 'complex',
    sizeRange: [0.4, 0.5, 0.15],
    fabricStiffness: 0.3
  },
  jacket: {
    baseShape: 'complex',
    sizeRange: [0.55, 0.75, 0.15],
    hasSleeves: true,
    fabricStiffness: 0.6
  },
  socks: {
    baseShape: 'tube',
    sizeRange: [0.1, 0.15, 0.08],
    fabricStiffness: 0.2
  },
  underwear: {
    baseShape: 'sheet',
    sizeRange: [0.3, 0.2, 0.05],
    fabricStiffness: 0.15
  },
  towel: {
    baseShape: 'sheet',
    sizeRange: [0.7, 1.4, 0.02],
    fabricStiffness: 0.35
  },
  blanket: {
    baseShape: 'sheet',
    sizeRange: [1.5, 2.0, 0.03],
    fabricStiffness: 0.25
  },
  curtain: {
    baseShape: 'sheet',
    sizeRange: [1.2, 2.4, 0.05],
    fabricStiffness: 0.4
  }
};

export class ClothesGenerator extends AssetFactory<ClothesParams, THREE.Group> {
  private static instance: ClothesGenerator;

  private constructor() {
    super();
  }

  static getInstance(): ClothesGenerator {
    if (!ClothesGenerator.instance) {
      ClothesGenerator.instance = new ClothesGenerator();
    }
    return ClothesGenerator.instance;
  }

  generate(params: ClothesParams = {}): THREE.Group {
    const {
      type = 'shirt',
      state = 'hanging',
      count = 1,
      scale = 1,
      color,
      pattern = 'solid',
      seed
    } = params;

    this.seedRandom(seed);
    
    const group = new THREE.Group();
    const spec = CLOTHES_SPECS[type];

    for (let i = 0; i < count; i++) {
      const clothesScale = scale * (0.9 + this.random() * 0.2);
      const clothesColor = color ?? this.getRandomClothesColor();
      
      let clothes: THREE.Group;
      
      switch (state) {
        case 'hanging':
          clothes = this.createHangingClothes(type, spec, clothesColor, pattern, clothesScale);
          break;
        case 'folded':
          clothes = this.createFoldedClothes(type, spec, clothesColor, pattern, clothesScale);
          break;
        case 'draped':
          clothes = this.createDrapedClothes(type, spec, clothesColor, pattern, clothesScale);
          break;
        case 'crumpled':
          clothes = this.createCrumpledClothes(type, spec, clothesColor, pattern, clothesScale);
          break;
        default:
          clothes = this.createHangingClothes(type, spec, clothesColor, pattern, clothesScale);
      }
      
      clothes.position.set(
        (this.random() - 0.5) * 0.5,
        (this.random() - 0.5) * 0.5,
        (this.random() - 0.5) * 0.5
      );
      
      group.add(clothes);
    }

    return group;
  }

  private getRandomClothesColor(): number {
    const colors = [
      0xffffff, // white
      0x222222, // black
      0x4466aa, // blue
      0xaa4444, // red
      0x44aa44, // green
      0xcc8844, // brown
      0x8844aa, // purple
      0xdddd44, // yellow
      0xff88cc, // pink
      0x88cccc  // cyan
    ];
    return colors[Math.floor(this.random() * colors.length)];
  }

  private createMaterial(color: number, pattern: string, stiffness: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7 + stiffness * 0.2,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // Add pattern via vertex colors or texture coordinates
    if (pattern !== 'solid') {
      // Pattern would be implemented with custom shaders or textures
      // For now, use solid color with slight variation
      const variation = 0.1;
      material.color.offsetHSL(0, 0, (this.random() - 0.5) * variation);
    }

    return material;
  }

  private createHangingClothes(
    type: ClothesType,
    spec: ClothesSpec,
    color: number,
    pattern: string,
    scale: number
  ): THREE.Group {
    const group = new THREE.Group();
    const material = this.createMaterial(color, pattern, spec.fabricStiffness);
    const [w, h, d] = spec.sizeRange;

    if (type === 'shirt' || type === 'jacket') {
      // Body
      const bodyGeo = new THREE.PlaneGeometry(w * 0.6, h * 0.6, 8, 12);
      this.addHangDeformation(bodyGeo, 'vertical');
      const body = new THREE.Mesh(bodyGeo, material);
      body.rotation.z = Math.PI * 0.5;
      group.add(body);

      // Sleeves
      if (spec.hasSleeves) {
        const sleeveGeo = new THREE.PlaneGeometry(w * 0.25, h * 0.35, 6, 10);
        this.addHangDeformation(sleeveGeo, 'diagonal');
        
        const leftSleeve = new THREE.Mesh(sleeveGeo, material);
        leftSleeve.position.set(-w * 0.15, h * 0.15, 0);
        leftSleeve.rotation.z = Math.PI * 0.3;
        group.add(leftSleeve);

        const rightSleeve = new THREE.Mesh(sleeveGeo, material);
        rightSleeve.position.set(w * 0.15, h * 0.15, 0);
        rightSleeve.rotation.z = -Math.PI * 0.3;
        group.add(rightSleeve);
      }

      // Hanger hook
      const hookGeo = new THREE.TorusGeometry(0.03, 0.003, 8, 16, Math.PI);
      const hookMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
      const hook = new THREE.Mesh(hookGeo, hookMat);
      hook.position.y = h * 0.35;
      hook.rotation.x = Math.PI * 0.5;
      group.add(hook);
    } else if (type === 'pants') {
      // Waist
      const waistGeo = new THREE.CylinderGeometry(w * 0.25, w * 0.2, h * 0.15, 16, 1, true);
      const waist = new THREE.Mesh(waistGeo, material);
      group.add(waist);

      // Legs
      const legGeo = new THREE.CylinderGeometry(w * 0.12, w * 0.08, h * 0.45, 12, 1, true);
      this.addHangDeformation(legGeo, 'vertical');

      const leftLeg = new THREE.Mesh(legGeo, material);
      leftLeg.position.set(-w * 0.12, -h * 0.3, 0);
      group.add(leftLeg);

      const rightLeg = new THREE.Mesh(legGeo, material);
      rightLeg.position.set(w * 0.12, -h * 0.3, 0);
      group.add(rightLeg);

      // Hanger clip
      const clipGeo = new THREE.BoxGeometry(w * 0.3, 0.02, 0.03);
      const clipMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 });
      const clip = new THREE.Mesh(clipGeo, clipMat);
      clip.position.y = h * 0.1;
      group.add(clip);
    } else if (type === 'dress' || type === 'skirt') {
      // Top part
      const topGeo = new THREE.CylinderGeometry(w * 0.2, w * 0.25, h * 0.3, 16, 1, true);
      const top = new THREE.Mesh(topGeo, material);
      group.add(top);

      // Skirt part with flowing deformation
      const skirtGeo = new THREE.CylinderGeometry(w * 0.25, w * 0.5, h * 0.7, 20, 1, true);
      this.addFlowingDeformation(skirtGeo);
      const skirt = new THREE.Mesh(skirtGeo, material);
      skirt.position.y = -h * 0.35;
      group.add(skirt);

      // Hanger
      const hookGeo = new THREE.TorusGeometry(0.03, 0.003, 8, 16, Math.PI);
      const hookMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
      const hook = new THREE.Mesh(hookGeo, hookMat);
      hook.position.y = h * 0.2;
      hook.rotation.x = Math.PI * 0.5;
      group.add(hook);
    } else {
      // Generic sheet-like clothes (towel, blanket, curtain)
      const geo = new THREE.PlaneGeometry(w, h, 12, 16);
      this.addHangDeformation(geo, 'vertical');
      const mesh = new THREE.Mesh(geo, material);
      group.add(mesh);
    }

    group.scale.setScalar(scale);
    return group;
  }

  private createFoldedClothes(
    type: ClothesType,
    spec: ClothesSpec,
    color: number,
    pattern: string,
    scale: number
  ): THREE.Group {
    const group = new THREE.Group();
    const material = this.createMaterial(color, pattern, spec.fabricStiffness);
    const [w, h, d] = spec.sizeRange;

    if (type === 'shirt') {
      // Folded into rectangle
      const foldGeo = new THREE.BoxGeometry(w * 0.3, h * 0.25, d * 0.3);
      const fold = new THREE.Mesh(foldGeo, material);
      group.add(fold);
    } else if (type === 'pants') {
      // Folded in half lengthwise, then in thirds
      const foldGeo = new THREE.BoxGeometry(w * 0.25, h * 0.15, d * 0.25);
      const fold = new THREE.Mesh(foldGeo, material);
      group.add(fold);
    } else {
      // Generic folded pile
      const layers = 3 + Math.floor(this.random() * 3);
      for (let i = 0; i < layers; i++) {
        const layerGeo = new THREE.BoxGeometry(
          w * (0.3 + this.random() * 0.1),
          0.03 + this.random() * 0.02,
          d * (0.3 + this.random() * 0.1)
        );
        const layer = new THREE.Mesh(layerGeo, material);
        layer.position.y = i * 0.035;
        layer.rotation.set(
          (this.random() - 0.5) * 0.1,
          (this.random() - 0.5) * 0.2,
          (this.random() - 0.5) * 0.1
        );
        group.add(layer);
      }
    }

    group.scale.setScalar(scale);
    return group;
  }

  private createDrapedClothes(
    type: ClothesType,
    spec: ClothesSpec,
    color: number,
    pattern: string,
    scale: number
  ): THREE.Group {
    const group = new THREE.Group();
    const material = this.createMaterial(color, pattern, spec.fabricStiffness);
    const [w, h, d] = spec.sizeRange;

    // Draped over something (chair back, bed, etc.)
    const drapeGeo = new THREE.PlaneGeometry(w, h, 16, 20);
    this.addDrapeDeformation(drapeGeo);
    const drape = new THREE.Mesh(drapeGeo, material);
    drape.rotation.x = -Math.PI * 0.3;
    
    group.add(drape);
    group.scale.setScalar(scale);
    return group;
  }

  private createCrumpledClothes(
    type: ClothesType,
    spec: ClothesSpec,
    color: number,
    pattern: string,
    scale: number
  ): THREE.Group {
    const group = new THREE.Group();
    const material = this.createMaterial(color, pattern, spec.fabricStiffness);
    const [w, h, d] = spec.sizeRange;

    // Crumpled ball shape
    const crumpleGeo = new THREE.SphereGeometry(Math.max(w, h) * 0.25, 16, 16);
    this.addCrumpleDeformation(crumpleGeo);
    const crumple = new THREE.Mesh(crumpleGeo, material);
    
    group.add(crumple);
    group.scale.setScalar(scale);
    return group;
  }

  private addHangDeformation(geometry: THREE.BufferGeometry, direction: 'vertical' | 'diagonal'): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Gravity sag
      const sag = Math.abs(x) * 0.1 * (1 - y);
      positions[i + 1] -= sag;
      
      // Natural folds
      if (direction === 'vertical') {
        positions[i] += Math.sin(y * Math.PI * 4) * 0.02;
      } else {
        positions[i] += Math.cos(y * Math.PI * 3) * 0.03;
      }
    }
    
    geometry.computeVertexNormals();
  }

  private addFlowingDeformation(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Wavy motion
      positions[i + 2] += Math.sin(x * Math.PI * 3 + y * Math.PI * 2) * 0.05;
      positions[i] += Math.cos(y * Math.PI * 2) * 0.03;
    }
    
    geometry.computeVertexNormals();
  }

  private addDrapeDeformation(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Drape curve
      positions[i + 1] -= Math.abs(x) * 0.3;
      
      // Folds
      positions[i + 2] += Math.sin(x * Math.PI * 6) * 0.03 * (1 - Math.abs(y));
    }
    
    geometry.computeVertexNormals();
  }

  private addCrumpleDeformation(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position.array as Float32Array;
    const noiseScale = 0.15;
    
    for (let i = 0; i < positions.length; i += 3) {
      // Random displacement for crumpled look
      positions[i] += (this.random() - 0.5) * noiseScale;
      positions[i + 1] += (this.random() - 0.5) * noiseScale;
      positions[i + 2] += (this.random() - 0.5) * noiseScale;
    }
    
    geometry.computeVertexNormals();
  }

  generateCloset(closetParams: {
    clothes?: Array<{ type: ClothesType; count: number; state?: ClothesState }>;
    closetWidth?: number;
    closetHeight?: number;
    seed?: number;
  } = {}): THREE.Group {
    const {
      clothes = [
        { type: 'shirt', count: 5, state: 'hanging' },
        { type: 'pants', count: 3, state: 'hanging' },
        { type: 'dress', count: 2, state: 'hanging' }
      ],
      closetWidth = 1.2,
      closetHeight = 2.0,
      seed
    } = closetParams;

    this.seedRandom(seed);
    
    const closetGroup = new THREE.Group();
    
    // Simple closet rod
    const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, closetWidth, 16);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.rotation.z = Math.PI * 0.5;
    rod.position.y = closetHeight * 0.3;
    closetGroup.add(rod);

    // Add clothes
    let xOffset = -closetWidth * 0.4;
    clothes.forEach(({ type, count, state = 'hanging' }) => {
      for (let i = 0; i < count; i++) {
        const item = this.generate({ 
          type, 
          state: state as ClothesState, 
          scale: 0.8 + this.random() * 0.2,
          seed: this.randomInt(0, 10000)
        });
        
        item.position.set(xOffset, closetHeight * 0.3, 0);
        xOffset += 0.12 + this.random() * 0.05;
        
        closetGroup.add(item);
      }
    });

    return closetGroup;
  }
}

// Export singleton instance
export const clothesGenerator = ClothesGenerator.getInstance();

// Register for resource system
registerResource('clothes', clothesGenerator);
