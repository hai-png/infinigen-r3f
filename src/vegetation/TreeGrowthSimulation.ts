/**
 * TreeGrowthSimulation.ts
 * L-system based tree growth with seasonal changes and competition modeling
 * Part of Phase 4: Advanced Features - 100% Completion
 */

import * as THREE from 'three';

export interface GrowthConfig {
  maxAge: number;
  growthRate: number;
  branchingAngle: number;
  branchLengthDecay: number;
  branchThicknessDecay: number;
  phototropism: number;
  gravitropism: number;
  competitionRadius: number;
  competitionStrength: number;
  seasonalVariation: boolean;
}

export interface LSystemRule {
  predecessor: string;
  successor: string;
  probability?: number;
}

export interface Branch {
  start: THREE.Vector3;
  end: THREE.Vector3;
  thickness: number;
  age: number;
  length: number;
  direction: THREE.Vector3;
  children: Branch[];
  leafArea: number;
}

export interface SeasonalState {
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  leafColor: THREE.Color;
  leafDensity: number;
  growthMultiplier: number;
}

const defaultConfig: Required<GrowthConfig> = {
  maxAge: 100,
  growthRate: 0.5,
  branchingAngle: 25 * (Math.PI / 180),
  branchLengthDecay: 0.85,
  branchThicknessDecay: 0.7,
  phototropism: 0.3,
  gravitropism: 0.1,
  competitionRadius: 10,
  competitionStrength: 0.5,
  seasonalVariation: true,
};

export class LSystem {
  private axiom: string;
  private rules: Map<string, LSystemRule[]>;
  private iterations: number;

  constructor(axiom: string = 'F', rules: LSystemRule[] = [], iterations: number = 4) {
    this.axiom = axiom;
    this.rules = new Map();
    this.iterations = iterations;
    
    rules.forEach(rule => {
      if (!this.rules.has(rule.predecessor)) {
        this.rules.set(rule.predecessor, []);
      }
      this.rules.get(rule.predecessor)!.push(rule);
    });
  }

  generate(): string {
    let current = this.axiom;
    
    for (let i = 0; i < this.iterations; i++) {
      let next = '';
      
      for (const char of current) {
        const charRules = this.rules.get(char);
        
        if (charRules && charRules.length > 0) {
          const selected = this.selectRule(charRules);
          next += selected.successor;
        } else {
          next += char;
        }
      }
      
      current = next;
    }
    
    return current;
  }

  private selectRule(rules: LSystemRule[]): LSystemRule {
    if (rules.length === 1) {
      return rules[0];
    }
    
    const hasProbabilities = rules.some(r => r.probability !== undefined);
    
    if (!hasProbabilities) {
      return rules[Math.floor(Math.random() * rules.length)];
    }
    
    const random = Math.random();
    let cumulative = 0;
    
    for (const rule of rules) {
      const prob = rule.probability || (1 / rules.length);
      cumulative += prob;
      
      if (random <= cumulative) {
        return rule;
      }
    }
    
    return rules[rules.length - 1];
  }

  addRule(rule: LSystemRule): void {
    if (!this.rules.has(rule.predecessor)) {
      this.rules.set(rule.predecessor, []);
    }
    this.rules.get(rule.predecessor)!.push(rule);
  }

  setIterations(iterations: number): void {
    this.iterations = iterations;
  }
}

export class TreeGrowthSimulator {
  private config: Required<GrowthConfig>;
  private lSystem: LSystem;
  private branches: Branch[];
  private age: number;
  private currentPosition: THREE.Vector3;
  private currentSeason: SeasonalState;

  constructor(config: Partial<GrowthConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.lSystem = this.createDefaultLSystem();
    this.branches = [];
    this.age = 0;
    this.currentPosition = new THREE.Vector3(0, 0, 0);
    this.currentSeason = this.getSeasonalState('spring');
  }

  private createDefaultLSystem(): LSystem {
    const lSystem = new LSystem('F', [
      { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 0.5 },
      { predecessor: 'F', successor: 'F+F-[-F+F]+F', probability: 0.5 },
    ], 4);
    
    return lSystem;
  }

  grow(initialPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): Branch[] {
    this.branches = [];
    this.currentPosition.copy(initialPosition);
    this.age = 0;
    
    const instructions = this.lSystem.generate();
    this.interpretInstructions(instructions);
    
    return this.branches;
  }

  private interpretInstructions(instructions: string): void {
    const stack: { position: THREE.Vector3; direction: THREE.Vector3; thickness: number }[] = [];
    let position = this.currentPosition.clone();
    let direction = new THREE.Vector3(0, 1, 0);
    let thickness = 1.0;
    let length = 2.0;

    for (const char of instructions) {
      switch (char) {
        case 'F':
          const newPos = position.clone().add(direction.clone().multiplyScalar(length));
          
          const branch: Branch = {
            start: position.clone(),
            end: newPos,
            thickness,
            age: this.age,
            length,
            direction: direction.clone(),
            children: [],
            leafArea: 0,
          };
          
          this.branches.push(branch);
          position = newPos;
          length *= this.config.branchLengthDecay;
          thickness *= this.config.branchThicknessDecay;
          break;
          
        case '+':
          direction.applyAxisAngle(new THREE.Vector3(0, 0, 1), this.config.branchingAngle);
          break;
          
        case '-':
          direction.applyAxisAngle(new THREE.Vector3(0, 0, 1), -this.config.branchingAngle);
          break;
          
        case '[':
          stack.push({
            position: position.clone(),
            direction: direction.clone(),
            thickness,
          });
          break;
          
        case ']':
          const state = stack.pop();
          if (state) {
            position = state.position;
            direction = state.direction;
            thickness = state.thickness;
          }
          break;
      }
    }
  }

  applyEnvironmentalFactors(
    sunlight: THREE.Vector3,
    neighbors: THREE.Vector3[],
    time: number
  ): void {
    if (this.config.phototropism > 0) {
      for (const branch of this.branches) {
        const lightDir = sunlight.clone().normalize();
        const torque = lightDir.cross(branch.direction).multiplyScalar(this.config.phototropism);
        branch.direction.add(torque).normalize();
        
        branch.end.copy(branch.start).add(
          branch.direction.clone().multiplyScalar(branch.length)
        );
      }
    }

    if (this.config.gravitropism > 0) {
      const up = new THREE.Vector3(0, 1, 0);
      
      for (const branch of this.branches) {
        const torque = up.cross(branch.direction).multiplyScalar(this.config.gravitropism);
        branch.direction.add(torque).normalize();
        
        branch.end.copy(branch.start).add(
          branch.direction.clone().multiplyScalar(branch.length)
        );
      }
    }

    if (neighbors.length > 0 && this.config.competitionStrength > 0) {
      for (const branch of this.branches) {
        let competitionFactor = 1.0;
        
        for (const neighborPos of neighbors) {
          const dist = branch.start.distanceTo(neighborPos);
          
          if (dist < this.config.competitionRadius) {
            const factor = 1 - (dist / this.config.competitionRadius);
            competitionFactor -= factor * this.config.competitionStrength;
          }
        }
        
        competitionFactor = Math.max(0.1, competitionFactor);
        branch.leafArea *= competitionFactor;
      }
    }

    this.age += 1;
    
    if (this.config.seasonalVariation) {
      this.updateSeason(time);
      this.applySeasonalEffects();
    }
  }

  private updateSeason(time: number): void {
    const seasons: Array<'spring' | 'summer' | 'autumn' | 'winter'> = 
      ['spring', 'summer', 'autumn', 'winter'];
    const seasonIndex = Math.floor((time % 4)) as 0 | 1 | 2 | 3;
    const season = seasons[seasonIndex];
    
    this.currentSeason = this.getSeasonalState(season);
  }

  private getSeasonalState(season: string): SeasonalState {
    switch (season) {
      case 'spring':
        return {
          season: 'spring',
          leafColor: new THREE.Color(0x90EE90),
          leafDensity: 0.6,
          growthMultiplier: 1.2,
        };
      case 'summer':
        return {
          season: 'summer',
          leafColor: new THREE.Color(0x228B22),
          leafDensity: 1.0,
          growthMultiplier: 1.0,
        };
      case 'autumn':
        return {
          season: 'autumn',
          leafColor: new THREE.Color(0xFF4500),
          leafDensity: 0.7,
          growthMultiplier: 0.5,
        };
      case 'winter':
        return {
          season: 'winter',
          leafColor: new THREE.Color(0x8B4513),
          leafDensity: 0.1,
          growthMultiplier: 0.2,
        };
      default:
        return {
          season: 'spring',
          leafColor: new THREE.Color(0x90EE90),
          leafDensity: 0.6,
          growthMultiplier: 1.2,
        };
    }
  }

  private applySeasonalEffects(): void {
    for (const branch of this.branches) {
      branch.leafArea = branch.leafArea * 0.5 + 
        (branch.length * branch.thickness * this.currentSeason.leafDensity) * 0.5;
    }
  }

  generateMesh(): THREE.Group {
    const group = new THREE.Group();
    
    for (const branch of this.branches) {
      const length = branch.start.distanceTo(branch.end);
      const geometry = new THREE.CylinderGeometry(
        branch.thickness * 0.5,
        branch.thickness * 0.3,
        length,
        8
      );
      
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08, 0.5, 0.2),
        roughness: 0.9,
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      
      const midpoint = new THREE.Vector3().lerpVectors(branch.start, branch.end, 0.5);
      mesh.position.copy(midpoint);
      mesh.lookAt(branch.end);
      mesh.rotateX(Math.PI / 2);
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      group.add(mesh);
      
      if (branch.children.length === 0 && branch.leafArea > 0.1) {
        const leafGroup = this.createLeaves(branch);
        group.add(leafGroup);
      }
    }
    
    return group;
  }

  private createLeaves(branch: Branch): THREE.Group {
    const group = new THREE.Group();
    const leafCount = Math.floor(branch.leafArea * 10);
    
    const geometry = new THREE.SphereGeometry(0.2, 6, 6);
    const material = new THREE.MeshStandardMaterial({
      color: this.currentSeason.leafColor,
      roughness: 0.8,
      transparent: true,
      opacity: 0.9,
    });
    
    for (let i = 0; i < leafCount; i++) {
      const leaf = new THREE.Mesh(geometry, material);
      
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * branch.length,
        (Math.random() - 0.5) * branch.length,
        (Math.random() - 0.5) * branch.length
      );
      
      leaf.position.copy(branch.end).add(offset);
      leaf.scale.setScalar(0.5 + Math.random() * 0.5);
      
      group.add(leaf);
    }
    
    return group;
  }

  getConfig(): GrowthConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<GrowthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getAge(): number {
    return this.age;
  }

  getCurrentSeason(): SeasonalState {
    return { ...this.currentSeason };
  }
}

export default TreeGrowthSimulator;
