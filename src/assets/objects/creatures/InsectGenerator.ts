/**
 * InsectGenerator - Procedural insect generation
 * Generates: ants, bees, butterflies, beetles, dragonflies, spiders
 */

import { Group, Mesh, SphereGeometry, CylinderGeometry, BoxGeometry } from 'three';
import { CreatureBase, CreatureParams } from './CreatureBase';
import { BodyPartGenerator } from './parts/BodyPartGenerator';
import { WingGenerator } from './parts/WingGenerator';
import { LegGenerator } from './parts/LegGenerator';
import { AntennaGenerator } from './parts/AntennaGenerator';
import { EyeGenerator } from './parts/EyeGenerator';

export interface InsectParams extends CreatureParams {
  insectType: 'ant' | 'bee' | 'butterfly' | 'beetle' | 'dragonfly' | 'spider';
  wingCount: number;
  legCount: number;
  hasAntennae: boolean;
  exoskeletonMaterial: string;
}

export class InsectGenerator extends CreatureBase {
  private insectParams: InsectParams;
  private bodyPartGen: BodyPartGenerator;
  private wingGen: WingGenerator;
  private legGen: LegGenerator;
  private antennaGen: AntennaGenerator;
  private eyeGen: EyeGenerator;

  constructor(params: Partial<InsectParams> = {}) {
    super({ species: 'insect', ...params });
    this.insectParams = {
      insectType: params.insectType || 'ant',
      wingCount: params.wingCount || 0,
      legCount: params.legCount || 6,
      hasAntennae: params.hasAntennae !== false,
      exoskeletonMaterial: params.exoskeletonMaterial || 'chitin',
      ...this.params
    };
    
    this.bodyPartGen = new BodyPartGenerator(this.rng);
    this.wingGen = new WingGenerator(this.rng);
    this.legGen = new LegGenerator(this.rng);
    this.antennaGen = new AntennaGenerator(this.rng);
    this.eyeGen = new EyeGenerator(this.rng);
  }

  generate(): Group {
    const creature = new Group();
    
    // Generate body segments
    const head = this.generateHead();
    const thorax = this.generateBodyCore();
    const abdomen = this.generateAbdomen();
    
    creature.add(head);
    creature.add(thorax);
    creature.add(abdomen);
    
    // Add legs
    const legs = this.generateLimbs();
    legs.forEach(leg => creature.add(leg));
    
    // Add wings if applicable
    if (this.insectParams.wingCount > 0) {
      const wings = this.generateAppendages();
      wings.forEach(wing => creature.add(wing));
    }
    
    // Add antennae
    if (this.insectParams.hasAntennae) {
      const antennae = this.antennaGen.generate(this.insectParams.insectType);
      antennae.forEach(antenna => {
        antenna.position.copy(head.position);
        creature.add(antenna);
      });
    }
    
    // Apply materials
    this.applyMaterials(creature);
    
    return creature;
  }

  protected generateBodyCore(): Mesh {
    const thoraxSize = this.getThoraxSize();
    const geometry = new SphereGeometry(thoraxSize, 16, 16);
    const mesh = new Mesh(geometry);
    mesh.position.set(0, thoraxSize, 0);
    return mesh;
  }

  protected generateHead(): Mesh {
    const headSize = this.getHeadSize();
    const geometry = new SphereGeometry(headSize, 16, 16);
    const mesh = new Mesh(geometry);
    mesh.position.set(0, headSize * 2.5, 0);
    
    // Add compound eyes
    const eyes = this.eyeGen.generate('compound', this.insectParams.insectType);
    eyes.forEach(eye => {
      eye.position.set(0, headSize * 2.5, 0);
      mesh.add(eye);
    });
    
    return mesh;
  }

  protected generateLimbs(): Mesh[] {
    const legs: Mesh[] = [];
    const legCount = this.insectParams.legCount;
    
    for (let i = 0; i < legCount; i++) {
      const leg = this.legGen.generate('insect', i, legCount);
      const angle = (i / legCount) * Math.PI * 2;
      const radius = 0.3;
      
      leg.position.set(
        Math.cos(angle) * radius,
        0.5,
        Math.sin(angle) * radius
      );
      leg.rotation.y = angle;
      
      legs.push(leg);
    }
    
    return legs;
  }

  protected generateAppendages(): Mesh[] {
    const wings: Mesh[] = [];
    const wingCount = this.insectParams.wingCount;
    
    for (let i = 0; i < wingCount; i++) {
      const wing = this.wingGen.generate(this.insectParams.insectType, i % 2 === 0 ? 'left' : 'right');
      const yOffset = i < 2 ? 0.8 : 0.4;
      const xOffset = i % 2 === 0 ? 0.3 : -0.3;
      
      wing.position.set(xOffset, yOffset, 0);
      wings.push(wing);
    }
    
    return wings;
  }

  protected applySkin(materials: any[]): any[] {
    // Insects use exoskeleton materials
    return materials;
  }

  private generateAbdomen(): Mesh {
    const abdomenSize = this.getAbdomenSize();
    const geometry = this.insectParams.insectType === 'dragonfly' 
      ? new CylinderGeometry(abdomenSize * 0.3, abdomenSize, abdomenSize * 3, 8)
      : new SphereGeometry(abdomenSize, 16, 16);
    
    const mesh = new Mesh(geometry);
    mesh.position.set(0, -abdomenSize * 1.5, 0);
    mesh.rotation.x = Math.PI / 6;
    
    return mesh;
  }

  private getThoraxSize(): number {
    const baseSizes = { ant: 0.1, bee: 0.15, butterfly: 0.12, beetle: 0.2, dragonfly: 0.15, spider: 0.25 };
    return baseSizes[this.insectParams.insectType] * this.getSizeMultiplier();
  }

  private getHeadSize(): number {
    return this.getThoraxSize() * 0.7;
  }

  private getAbdomenSize(): number {
    return this.getThoraxSize() * 1.2;
  }

  private getSizeMultiplier(): number {
    const multipliers = { tiny: 0.5, small: 0.8, medium: 1.0, large: 1.5, huge: 2.0 };
    return multipliers[this.insectParams.size];
  }

  private applyMaterials(creature: Group): void {
    // Apply exoskeleton material based on type
    const colors = {
      ant: 0x2c1810,
      bee: 0xffaa00,
      butterfly: 0xff69b4,
      beetle: 0x00ff00,
      dragonfly: 0x0066ff,
      spider: 0x333333
    };
    
    creature.traverse((child) => {
      if (child instanceof Mesh) {
        child.material.color.setHex(colors[this.insectParams.insectType]);
      }
    });
  }
}
