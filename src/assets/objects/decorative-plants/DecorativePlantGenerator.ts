/**
 * Decorative Plant Generator for Infinigen R3F
 * Generates ornamental plants for interior/exterior decoration
 * Includes: Potted plants, hanging plants, bonsai, succulents, tropical plants
 */

import * as THREE from 'three';
import { MaterialGenerator } from '../../materials';

export interface DecorativePlantParams {
  type: 'potted' | 'hanging' | 'bonsai' | 'succulent' | 'tropical';
  species: 'fern' | 'peace_lily' | 'spider_plant' | 'snake_plant' | 'pothos' | 'monstera' | 'fiddle_leaf' | 'aloe';
  potStyle?: 'ceramic' | 'terracotta' | 'plastic' | 'metal' | 'woven';
  potColor?: THREE.Color;
  size?: 'small' | 'medium' | 'large';
  health?: number; // 0-1, affects leaf color and droop
  age?: number; // 0-1, affects size and complexity
  flowering?: boolean;
}

export class DecorativePlantGenerator {
  private materialGen: MaterialGenerator;

  constructor(materialGen: MaterialGenerator) {
    this.materialGen = materialGen;
  }

  async generate(params: DecorativePlantParams): Promise<THREE.Group> {
    const group = new THREE.Group();
    
    const {
      type,
      species,
      potStyle = 'ceramic',
      potColor = new THREE.Color(0x8b4513),
      size = 'medium',
      health = 1.0,
      age = 0.5,
      flowering = false,
    } = params;

    const sizeScale = size === 'small' ? 0.5 : size === 'large' ? 1.5 : 1.0;

    // Generate pot or mounting
    if (type === 'potted' || type === 'succulent' || type === 'bonsai') {
      const pot = await this.createPot(potStyle, potColor, sizeScale, species);
      group.add(pot);
    } else if (type === 'hanging') {
      const hanger = await this.createHanger(potStyle, potColor, sizeScale);
      group.add(hanger);
    }

    // Generate plant based on species
    const plant = await this.createPlant(species, type, health, age, flowering, sizeScale);
    group.add(plant);

    // Add soil if potted
    if ((type === 'potted' || type === 'succulent' || type === 'bonsai') && species !== 'air_plant') {
      const soil = this.createSoil(sizeScale);
      group.add(soil);
    }

    return group;
  }

  private async createPot(
    style: string,
    color: THREE.Color,
    scale: number,
    species: string
  ): Promise<THREE.Mesh> {
    const potRadius = 0.2 * scale;
    const potHeight = 0.25 * scale;
    
    let geometry: THREE.BufferGeometry;
    
    if (style === 'terracotta') {
      // Classic tapered terracotta pot
      geometry = new THREE.CylinderGeometry(potRadius * 0.85, potRadius, potHeight, 8, 1, true);
    } else if (style === 'modern' || style === 'plastic') {
      // Cylindrical modern pot
      geometry = new THREE.CylinderGeometry(potRadius, potRadius, potHeight, 12, 1, true);
    } else if (style === 'ceramic') {
      // Decorative ceramic with rim
      const points = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const r = potRadius * (0.9 + 0.15 * Math.sin(t * Math.PI));
        points.push(new THREE.Vector2(r, t * potHeight));
      }
      geometry = new THREE.LatheGeometry(points, 12);
    } else if (style === 'metal') {
      // Sleek metal pot
      geometry = new THREE.CylinderGeometry(potRadius * 0.95, potRadius * 1.05, potHeight * 0.9, 8, 1, true);
    } else {
      // Woven basket texture
      geometry = new THREE.CylinderGeometry(potRadius * 0.9, potRadius, potHeight, 10, 1, true);
    }

    let material: THREE.Material;
    
    if (style === 'terracotta') {
      material = this.materialGen.generate({
        type: 'ceramic',
        style: 'rustic',
        color: new THREE.Color(0xc15a3e),
        roughness: 0.9,
      });
    } else if (style === 'ceramic') {
      material = this.materialGen.generate({
        type: 'ceramic',
        style: 'modern',
        color: color,
        roughness: 0.3,
        metalness: 0.1,
      });
    } else if (style === 'metal') {
      material = this.materialGen.generate({
        type: 'metal',
        style: 'modern',
        color: color,
        roughness: 0.4,
        metalness: 0.7,
      });
    } else if (style === 'woven') {
      material = this.materialGen.generate({
        type: 'fabric',
        style: 'rustic',
        color: new THREE.Color(0xd2b48c),
        roughness: 0.95,
      });
    } else {
      // Plastic
      material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.1,
      });
    }

    const pot = new THREE.Mesh(geometry, material);
    pot.position.y = potHeight / 2;
    pot.castShadow = true;
    pot.receiveShadow = true;

    return pot;
  }

  private async createHanger(style: string, color: THREE.Color, scale: number): Promise<THREE.Group> {
    const group = new THREE.Group();
    const potRadius = 0.15 * scale;
    
    // Hanging pot/basket
    const potGeometry = new THREE.SphereGeometry(potRadius, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const potMaterial = style === 'woven' 
      ? this.materialGen.generate({
          type: 'fabric',
          style: 'rustic',
          color: new THREE.Color(0xd2b48c),
          roughness: 0.9,
        })
      : new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.6,
        });
    
    const pot = new THREE.Mesh(potGeometry, potMaterial);
    pot.position.y = 0;
    group.add(pot);
    
    // Hanging chains/ropes
    const chainMaterial = style === 'metal'
      ? this.materialGen.generate({
          type: 'metal',
          style: 'modern',
          color: new THREE.Color(0xcccccc),
          roughness: 0.3,
          metalness: 0.8,
        })
      : this.materialGen.generate({
          type: 'fabric',
          style: 'rustic',
          color: new THREE.Color(0x8b7355),
          roughness: 0.8,
        });
    
    // Create 3-4 hanging chains
    const chainCount = 4;
    for (let i = 0; i < chainCount; i++) {
      const angle = (i / chainCount) * Math.PI * 2;
      const x = Math.cos(angle) * potRadius * 0.8;
      const z = Math.sin(angle) * potRadius * 0.8;
      
      const chainGeometry = new THREE.CylinderGeometry(0.01 * scale, 0.01 * scale, 0.5 * scale, 6);
      const chain = new THREE.Mesh(chainGeometry, chainMaterial);
      chain.position.set(x, 0.25 * scale, z);
      
      // Angle chain inward
      chain.lookAt(0, 0.5 * scale, 0);
      chain.rotateX(Math.PI / 2);
      
      group.add(chain);
    }
    
    // Join ring at top
    const ringGeometry = new THREE.TorusGeometry(potRadius * 0.8, 0.015 * scale, 6, 16);
    const ring = new THREE.Mesh(ringGeometry, chainMaterial);
    ring.position.y = 0.5 * scale;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    
    return group;
  }

  private async createPlant(
    species: string,
    type: string,
    health: number,
    age: number,
    flowering: boolean,
    scale: number
  ): Promise<THREE.Group> {
    const group = new THREE.Group();
    
    // Leaf color based on health
    const baseGreen = new THREE.Color(0x228b22);
    const unhealthyYellow = new THREE.Color(0x8b8b00);
    const leafColor = baseGreen.clone().lerp(unhealthyYellow, 1 - health);
    
    // Generate plant structure based on species
    switch (species) {
      case 'fern':
        group.add(this.createFern(leafColor, health, age, scale));
        break;
      case 'peace_lily':
        group.add(this.createPeaceLily(leafColor, health, age, scale, flowering));
        break;
      case 'spider_plant':
        group.add(this.createSpiderPlant(leafColor, health, age, scale));
        break;
      case 'snake_plant':
        group.add(this.createSnakePlant(leafColor, health, age, scale));
        break;
      case 'pothos':
        group.add(this.createPothos(leafColor, health, age, scale, type === 'hanging'));
        break;
      case 'monstera':
        group.add(this.createMonstera(leafColor, health, age, scale));
        break;
      case 'fiddle_leaf':
        group.add(this.createFiddleLeaf(leafColor, health, age, scale));
        break;
      case 'aloe':
        group.add(this.createAloe(leafColor, health, age, scale));
        break;
    }
    
    return group;
  }

  private createFern(color: THREE.Color, health: number, age: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const frondCount = Math.floor(8 + age * 12);
    
    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const frond = this.createFernFrond(color, health, scale, age);
      frond.rotation.y = angle;
      frond.rotation.x = 0.3 + (1 - health) * 0.3; // Droop if unhealthy
      frond.position.y = 0.1 * scale;
      group.add(frond);
    }
    
    return group;
  }

  private createFernFrond(color: THREE.Color, health: number, scale: number, age: number): THREE.Group {
    const group = new THREE.Group();
    const frondLength = 0.3 * scale * (0.8 + age * 0.4);
    const leafletCount = Math.floor(10 + age * 10);
    
    // Central stem
    const stemCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, frondLength * 0.5, frondLength * 0.2),
      new THREE.Vector3(0, frondLength, 0)
    );
    
    const stemGeometry = new THREE.TubeGeometry(stemCurve, 8, 0.01 * scale, 4, false);
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.7),
      roughness: 0.6,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    group.add(stem);
    
    // Leaflets along stem
    for (let i = 0; i < leafletCount; i++) {
      const t = (i + 1) / (leafletCount + 1);
      const point = stemCurve.getPoint(t);
      const side = i % 2 === 0 ? 1 : -1;
      
      const leafletShape = new THREE.Shape();
      leafletShape.moveTo(0, 0);
      leafletShape.quadraticCurveTo(0.03 * scale, 0.04 * scale, 0, 0.08 * scale);
      leafletShape.quadraticCurveTo(-0.03 * scale, 0.04 * scale, 0, 0);
      
      const leafletGeometry = new THREE.ExtrudeGeometry(leafletShape, {
        depth: 0.005 * scale,
        bevelEnabled: false,
      });
      
      const leafletMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
      
      const leaflet = new THREE.Mesh(leafletGeometry, leafletMaterial);
      leaflet.position.copy(point);
      leaflet.position.x += side * 0.03 * scale;
      leaflet.rotation.z = side * 0.3;
      leaflet.rotation.y = side * 0.2;
      
      group.add(leaflet);
    }
    
    return group;
  }

  private createPeaceLily(color: THREE.Color, health: number, age: number, scale: number, flowering: boolean): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(5 + age * 8);
    
    // Large leaves
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leaf = this.createBroadLeaf(color, health, scale * 1.5, 0.15, 0.4);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.4;
      leaf.position.y = 0.05 * scale;
      group.add(leaf);
    }
    
    // Flower if flowering
    if (flowering && health > 0.7) {
      const flower = this.createPeaceLilyFlower(scale);
      flower.position.y = 0.3 * scale;
      group.add(flower);
    }
    
    return group;
  }

  private createBroadLeaf(
    color: THREE.Color,
    health: number,
    scale: number,
    width: number,
    length: number
  ): THREE.Mesh {
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(width * scale, length * scale * 0.4, 0, length * scale);
    leafShape.quadraticCurveTo(-width * scale, length * scale * 0.4, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(leafShape, {
      depth: 0.01 * scale,
      bevelEnabled: true,
      bevelThickness: 0.005 * scale,
      bevelSize: 0.005 * scale,
      bevelSegments: 2,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.005 * scale;
    
    // Add slight curl
    leaf.scale.z = 1 + (1 - health) * 0.2;
    
    return leaf;
  }

  private createPeaceLilyFlower(scale: number): THREE.Group {
    const group = new THREE.Group();
    
    // White spathe
    const spatheShape = new THREE.Shape();
    spatheShape.moveTo(0, 0);
    spatheShape.quadraticCurveTo(0.08 * scale, 0.1 * scale, 0, 0.2 * scale);
    spatheShape.quadraticCurveTo(-0.08 * scale, 0.1 * scale, 0, 0);
    
    const spatheGeometry = new THREE.ExtrudeGeometry(spatheShape, {
      depth: 0.01 * scale,
      bevelEnabled: false,
    });
    
    const spatheMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    
    const spathe = new THREE.Mesh(spatheGeometry, spatheMaterial);
    spathe.rotation.x = 0.3;
    group.add(spathe);
    
    // Yellow spadix
    const spadixGeometry = new THREE.CylinderGeometry(0.015 * scale, 0.02 * scale, 0.12 * scale, 8);
    const spadixMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      roughness: 0.7,
    });
    const spadix = new THREE.Mesh(spadixGeometry, spadixMaterial);
    spadix.position.y = 0.06 * scale;
    spadix.rotation.x = 0.3;
    group.add(spadix);
    
    return group;
  }

  private createSpiderPlant(color: THREE.Color, health: number, age: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(10 + age * 15);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leaf = this.createGrassLikeLeaf(color, health, scale * 0.8, 0.03, 0.35);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.5 + (1 - health) * 0.3;
      leaf.position.y = 0.05 * scale;
      group.add(leaf);
    }
    
    // Add plantlets if mature
    if (age > 0.6 && health > 0.8) {
      for (let i = 0; i < 3; i++) {
        const plantlet = this.createSmallSpiderPlantlet(color, scale * 0.4);
        const angle = (i / 3) * Math.PI * 2;
        plantlet.position.set(
          Math.cos(angle) * 0.2 * scale,
          0.15 * scale,
          Math.sin(angle) * 0.2 * scale
        );
        group.add(plantlet);
      }
    }
    
    return group;
  }

  private createGrassLikeLeaf(
    color: THREE.Color,
    health: number,
    scale: number,
    width: number,
    length: number
  ): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width * scale, length * scale * 0.5, 0, length * scale);
    shape.quadraticCurveTo(-width * scale, length * scale * 0.5, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.005 * scale,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.0025 * scale;
    
    // Natural arch
    leaf.rotation.x = -0.2;
    
    return leaf;
  }

  private createSmallSpiderPlantlet(color: THREE.Color, scale: number): THREE.Group {
    const group = new THREE.Group();
    const leafCount = 6;
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leaf = this.createGrassLikeLeaf(color, 1, scale, 0.02, 0.15);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.4;
      group.add(leaf);
    }
    
    return group;
  }

  private createSnakePlant(color: THREE.Color, health: number, age: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(4 + age * 6);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leaf = this.createSnakeLeaf(color, health, scale, age);
      leaf.rotation.y = angle;
      leaf.position.y = 0.05 * scale;
      group.add(leaf);
    }
    
    return group;
  }

  private createSnakeLeaf(color: THREE.Color, health: number, scale: number, age: number): THREE.Mesh {
    const height = 0.5 * scale * (0.8 + age * 0.5);
    const width = 0.08 * scale;
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(width * scale, height * 0.3);
    shape.lineTo(width * scale * 0.8, height);
    shape.lineTo(0, height);
    shape.lineTo(-width * scale * 0.8, height);
    shape.lineTo(-width * scale, height * 0.3);
    shape.closePath();
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.02 * scale,
      bevelEnabled: false,
    });
    
    // Snake plant has characteristic banding
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.01 * scale;
    
    return leaf;
  }

  private createPothos(color: THREE.Color, health: number, age: number, scale: number, hanging: boolean): THREE.Group {
    const group = new THREE.Group();
    const vineCount = Math.floor(3 + age * 5);
    
    for (let i = 0; i < vineCount; i++) {
      const angle = (i / vineCount) * Math.PI * 2;
      const vine = this.createPothosVine(color, health, scale, age, hanging);
      vine.rotation.y = angle;
      group.add(vine);
    }
    
    return group;
  }

  private createPothosVine(color: THREE.Color, health: number, scale: number, age: number, hanging: boolean): THREE.Group {
    const group = new THREE.Group();
    const vineLength = 0.4 * scale * (1 + age);
    const leafCount = Math.floor(5 + age * 8);
    
    // Vine stem
    const curve = hanging
      ? new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.1 * scale, -vineLength * 0.5, 0.1 * scale),
          new THREE.Vector3(0.2 * scale, -vineLength, 0),
        ])
      : new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.1 * scale, vineLength * 0.3, 0.1 * scale),
          new THREE.Vector3(0.2 * scale, vineLength, 0),
        ]);
    
    const stemGeometry = new THREE.TubeGeometry(curve, 10, 0.01 * scale, 6, false);
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.8),
      roughness: 0.6,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    group.add(stem);
    
    // Leaves along vine
    for (let i = 0; i < leafCount; i++) {
      const t = (i + 1) / (leafCount + 1);
      const point = curve.getPoint(t);
      
      const leaf = this.createHeartLeaf(color, health, scale * (0.5 + t * 0.5));
      leaf.position.copy(point);
      
      // Orient leaf
      if (hanging) {
        leaf.rotation.x = -0.5;
        leaf.rotation.y = Math.random() * 0.5;
      } else {
        leaf.rotation.x = 0.3;
        leaf.rotation.y = Math.random() * 0.3;
      }
      
      group.add(leaf);
    }
    
    return group;
  }

  private createHeartLeaf(color: THREE.Color, health: number, scale: number): THREE.Mesh {
    const size = 0.08 * scale;
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(size, -size, size * 1.5, 0, 0, size * 1.5);
    shape.bezierCurveTo(-size * 1.5, 0, -size, -size, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.005 * scale,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.0025 * scale;
    leaf.rotation.x = Math.PI;
    
    return leaf;
  }

  private createMonstera(color: THREE.Color, health: number, age: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(3 + age * 5);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leaf = this.createMonsteraLeaf(color, health, scale * 1.5, age);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.3;
      leaf.position.y = 0.1 * scale * (1 + i * 0.3);
      group.add(leaf);
    }
    
    return group;
  }

  private createMonsteraLeaf(color: THREE.Color, health: number, scale: number, age: number): THREE.Mesh {
    const size = 0.3 * scale;
    
    // Monstera leaf with characteristic splits
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    
    // Create split leaf outline
    const points = 20;
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const angle = t * Math.PI;
      const r = size * (0.5 + 0.5 * Math.sin(angle)) * (0.8 + 0.2 * Math.sin(angle * 3));
      
      // Add splits for mature leaves
      let x = Math.cos(angle) * r;
      let y = Math.sin(angle) * r * 1.3;
      
      if (age > 0.5 && i > 3 && i < points - 3) {
        if (i % 4 === 0) {
          x *= 0.7;
          y *= 0.8;
        }
      }
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.01 * scale,
      bevelEnabled: true,
      bevelThickness: 0.005 * scale,
      bevelSize: 0.005 * scale,
      bevelSegments: 2,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.005 * scale;
    
    return leaf;
  }

  private createFiddleLeaf(color: THREE.Color, health: number, age: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(4 + age * 6);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leaf = this.createFiddleLeafLeaf(color, health, scale, age);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.4;
      leaf.position.y = 0.15 * scale * (1 + i * 0.2);
      group.add(leaf);
    }
    
    return group;
  }

  private createFiddleLeafLeaf(color: THREE.Color, health: number, scale: number, age: number): THREE.Mesh {
    const width = 0.15 * scale;
    const length = 0.35 * scale * (0.8 + age * 0.4);
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width, length * 0.3, width * 0.8, length);
    shape.quadraticCurveTo(0, length * 1.1, -width * 0.8, length);
    shape.quadraticCurveTo(-width, length * 0.3, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.01 * scale,
      bevelEnabled: false,
    });
    
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.005 * scale;
    
    return leaf;
  }

  private createAloe(color: THREE.Color, health: number, age: number, scale: number): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(8 + age * 12);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const radius = 0.05 * scale + (i / leafCount) * 0.15 * scale;
      const leaf = this.createAloeLeaf(color, health, scale, age);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.6 - (i / leafCount) * 0.3;
      leaf.position.set(
        Math.cos(angle) * radius,
        0.05 * scale,
        Math.sin(angle) * radius
      );
      group.add(leaf);
    }
    
    return group;
  }

  private createAloeLeaf(color: THREE.Color, health: number, scale: number, age: number): THREE.Mesh {
    const width = 0.04 * scale;
    const length = 0.2 * scale * (0.8 + age * 0.4);
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width, length * 0.5, 0, length);
    shape.quadraticCurveTo(-width, length * 0.5, 0, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.03 * scale,
      bevelEnabled: true,
      bevelThickness: 0.01 * scale,
      bevelSize: 0.01 * scale,
      bevelSegments: 3,
    });
    
    // Aloe has spotted texture
    const material = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.9),
      roughness: 0.5,
    });
    
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.z = -0.015 * scale;
    
    // Slight curve
    leaf.rotation.x = -0.1;
    
    return leaf;
  }

  private createSoil(scale: number): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(0.18 * scale, 12);
    const material = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      roughness: 0.95,
    });
    
    const soil = new THREE.Mesh(geometry, material);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.23 * scale;
    
    return soil;
  }
}
