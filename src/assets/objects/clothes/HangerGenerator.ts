import { BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
/**
 * Hanger Generator
 * 
 * Procedural clothing hangers for wardrobes and closets.
 * Generates various hanger types with realistic proportions and materials.
 * 
 * Features:
 * - Multiple hanger types (wire, wooden, plastic, padded, specialty)
 * - Various hook styles
 * - Material variations
 * - Suit, shirt, dress, and pants hangers
 * - Optional clips and bars
 * - LOD support for performance
 */

import * as THREE from 'three';

export type HangerType = 'wire' | 'wooden' | 'plastic' | 'padded' | 'suit' | 'dress' | 'pants' | 'skirt';
export type HangerMaterial = 'metal' | 'wood' | 'plastic' | 'velvet' | 'satin' | 'chrome';
export type HookStyle = 'standard' | 'swivel' | 'rounded' | 'angled';

export interface HangerParams extends BaseGeneratorConfig {
  // Type and style
  hangerType: HangerType;
  hookStyle: HookStyle;
  material: HangerMaterial;
  
  // Dimensions
  width: number;
  shoulderHeight: number;
  hookHeight: number;
  
  // Features
  hasBar: boolean;
  hasClips: boolean;
  clipCount: number;
  paddingThickness: number;
  
  // Appearance
  color: THREE.Color;
  finish: 'matte' | 'glossy' | 'satin' | 'textured';
  
  // Performance
  lodLevel: number;
}

const DEFAULT_HANGER_PARAMS: HangerParams = {
  hangerType: 'wooden',
  hookStyle: 'swivel',
  material: 'wood',
  width: 0.45,
  shoulderHeight: 0.15,
  hookHeight: 0.2,
  hasBar: true,
  hasClips: false,
  clipCount: 2,
  paddingThickness: 0.02,
  color: new THREE.Color(0x8b4513),
  finish: 'satin',
  lodLevel: 0,
};

/**
 * Hanger Generator Class
 */
export class HangerGenerator {
  private params: HangerParams;
  private group: THREE.Group;
  private materials: Map<string, THREE.Material>;

  constructor(params: Partial<HangerParams> = {}) {
    this.params = { ...DEFAULT_HANGER_PARAMS, ...params };
    this.group = new THREE.Group();
    this.materials = new Map();
    
    this.generate();
  }

  /**
   * Generate the complete hanger
   */
  generate(): THREE.Group {
    this.group.clear();
    this.materials.clear();
    
    // Create materials
    this.createMainMaterial();
    this.createHookMaterial();
    
    // Build structure
    this.createHook();
    this.createNeck();
    this.createShoulders();
    
    if (this.params.hasBar) {
      this.createBar();
    }
    
    if (this.params.hasClips) {
      this.createClips();
    }
    
    return this.group;
  }

  /**
   * Create main body material
   */
  private createMainMaterial(): void {
    let material: THREE.Material;
    
    const roughnessMap: Record<string, number> = {
      matte: 0.7,
      glossy: 0.1,
      satin: 0.3,
      textured: 0.5,
    };
    
    const metalnessMap: Record<HangerMaterial, number> = {
      metal: 0.8,
      wood: 0.0,
      plastic: 0.1,
      velvet: 0.0,
      satin: 0.0,
      chrome: 0.95,
    };

    if (this.params.material === 'velvet' || this.params.material === 'satin') {
      // Fabric-like material for padded hangers
      material = new THREE.MeshStandardMaterial({
        color: this.params.color,
        roughness: 0.9,
        metalness: 0,
        name: 'padding',
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: this.params.color,
        roughness: roughnessMap[this.params.finish],
        metalness: metalnessMap[this.params.material],
        name: 'main',
      });
    }

    this.materials.set('main', material);
  }

  /**
   * Create hook material (usually metal)
   */
  private createHookMaterial(): void {
    const material = new THREE.MeshStandardMaterial({
      color: this.params.material === 'chrome' ? 0xc0c0c0 : 0x888888,
      roughness: 0.2,
      metalness: 0.9,
      name: 'hook',
    });

    this.materials.set('hook', material);
  }

  /**
   * Create the hook
   */
  private createHook(): void {
    const hookMaterial = this.materials.get('hook')!;
    
    if (this.params.hookStyle === 'standard') {
      // Simple J-hook
      const hookCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, this.params.shoulderHeight + this.params.hookHeight, 0),
        new THREE.Vector3(0, this.params.shoulderHeight + this.params.hookHeight * 0.7, 0.05),
        new THREE.Vector3(0, this.params.shoulderHeight, 0.08)
      );
      
      const hookGeometry = new THREE.TubeGeometry(hookCurve, 16, 0.015, 8, false);
      const hook = new THREE.Mesh(hookGeometry, hookMaterial);
      this.group.add(hook);
      
    } else if (this.params.hookStyle === 'swivel') {
      // Swivel hook with base
      const swivelBaseGeometry = new THREE.CylinderGeometry(0.03, 0.025, 0.04, 16);
      const swivelBase = new THREE.Mesh(swivelBaseGeometry, hookMaterial);
      swivelBase.position.y = this.params.shoulderHeight + this.params.hookHeight * 0.3;
      this.group.add(swivelBase);
      
      // Hook curve
      const hookCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, this.params.shoulderHeight + this.params.hookHeight, 0),
        new THREE.Vector3(0, this.params.shoulderHeight + this.params.hookHeight * 0.6, 0.06),
        new THREE.Vector3(0, this.params.shoulderHeight + this.params.hookHeight * 0.3, 0.1)
      );
      
      const hookGeometry = new THREE.TubeGeometry(hookCurve, 16, 0.015, 8, false);
      const hook = new THREE.Mesh(hookGeometry, hookMaterial);
      this.group.add(hook);
      
    } else if (this.params.hookStyle === 'rounded') {
      // Smooth rounded hook
      const hookCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, this.params.shoulderHeight + this.params.hookHeight, 0),
        new THREE.Vector3(0.02, this.params.shoulderHeight + this.params.hookHeight * 0.8, 0),
        new THREE.Vector3(0.04, this.params.shoulderHeight + this.params.hookHeight * 0.5, 0.02),
        new THREE.Vector3(0.03, this.params.shoulderHeight + this.params.hookHeight * 0.2, 0.06),
      ]);
      
      const hookGeometry = new THREE.TubeGeometry(hookCurve, 20, 0.018, 8, false);
      const hook = new THREE.Mesh(hookGeometry, hookMaterial);
      this.group.add(hook);
      
    } else if (this.params.hookStyle === 'angled') {
      // Angled hook for better visibility
      const hookCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0.02, this.params.shoulderHeight + this.params.hookHeight, 0),
        new THREE.Vector3(0.03, this.params.shoulderHeight + this.params.hookHeight * 0.7, 0.04),
        new THREE.Vector3(0.02, this.params.shoulderHeight, 0.08)
      );
      
      const hookGeometry = new THREE.TubeGeometry(hookCurve, 16, 0.015, 8, false);
      const hook = new THREE.Mesh(hookGeometry, hookMaterial);
      this.group.add(hook);
    }
  }

  /**
   * Create the neck (center part connecting hook to shoulders)
   */
  private createNeck(): void {
    const mainMaterial = this.materials.get('main')!;
    
    if (this.params.hangerType === 'wire') {
      // Thin wire neck
      const neckGeometry = new THREE.CylinderGeometry(0.008, 0.008, this.params.hookHeight * 0.3, 8);
      const neck = new THREE.Mesh(neckGeometry, mainMaterial);
      neck.position.y = this.params.shoulderHeight + this.params.hookHeight * 0.15;
      this.group.add(neck);
      
    } else if (this.params.hangerType === 'padded') {
      // Thick padded neck
      const neckGeometry = new THREE.CapsuleGeometry(0.04, this.params.hookHeight * 0.3, 4, 8);
      const neck = new THREE.Mesh(neckGeometry, mainMaterial);
      neck.position.y = this.params.shoulderHeight + this.params.hookHeight * 0.15;
      this.group.add(neck);
      
    } else {
      // Standard neck
      const neckGeometry = new THREE.BoxGeometry(0.06, this.params.hookHeight * 0.3, 0.025);
      const neck = new THREE.Mesh(neckGeometry, mainMaterial);
      neck.position.y = this.params.shoulderHeight + this.params.hookHeight * 0.15;
      this.group.add(neck);
    }
  }

  /**
   * Create the shoulder arms
   */
  private createShoulders(): void {
    const mainMaterial = this.materials.get('main')!;
    const halfWidth = this.params.width / 2;
    
    if (this.params.hangerType === 'wire') {
      // Wire hanger - bent wire shape
      const shoulderCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, this.params.shoulderHeight, 0),
        new THREE.Vector3(halfWidth * 0.3, this.params.shoulderHeight * 0.9, 0.02),
        new THREE.Vector3(halfWidth * 0.7, this.params.shoulderHeight * 0.7, 0.03),
        new THREE.Vector3(halfWidth, this.params.shoulderHeight * 0.5, 0.02),
      ]);
      
      const geometry = new THREE.TubeGeometry(shoulderCurve, 20, 0.008, 8, false);
      
      // Left shoulder
      const leftShoulder = new THREE.Mesh(geometry, mainMaterial);
      this.group.add(leftShoulder);
      
      // Right shoulder (mirrored)
      const rightShoulderCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, this.params.shoulderHeight, 0),
        new THREE.Vector3(-halfWidth * 0.3, this.params.shoulderHeight * 0.9, 0.02),
        new THREE.Vector3(-halfWidth * 0.7, this.params.shoulderHeight * 0.7, 0.03),
        new THREE.Vector3(-halfWidth, this.params.shoulderHeight * 0.5, 0.02),
      ]);
      
      const rightGeometry = new THREE.TubeGeometry(rightShoulderCurve, 20, 0.008, 8, false);
      const rightShoulder = new THREE.Mesh(rightGeometry, mainMaterial);
      this.group.add(rightShoulder);
      
    } else if (this.params.hangerType === 'dress') {
      // Wider curved shoulders for dresses
      this.createCurvedShoulder(mainMaterial, halfWidth, 0.03);
      
    } else if (this.params.hangerType === 'suit') {
      // Contoured suit hanger shoulders
      this.createContouredShoulder(mainMaterial, halfWidth);
      
    } else if (this.params.hangerType === 'padded') {
      // Thick padded shoulders
      this.createPaddedShoulder(mainMaterial, halfWidth);
      
    } else {
      // Standard straight/slightly curved shoulders
      this.createStandardShoulder(mainMaterial, halfWidth);
    }
  }

  /**
   * Create standard shoulder
   */
  private createStandardShoulder(material: THREE.Material, halfWidth: number): void {
    const shoulderGeometry = new THREE.BoxGeometry(this.params.width, 0.02, 0.04);
    const shoulders = new THREE.Mesh(shoulderGeometry, material);
    shoulders.position.y = this.params.shoulderHeight;
    
    // Taper the ends
    shoulders.scale.x = 1;
    shoulders.rotation.z = 0.05;
    
    this.group.add(shoulders);
  }

  /**
   * Create curved shoulder for dress hangers
   */
  private createCurvedShoulder(material: THREE.Material, halfWidth: number, thickness: number): void {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, this.params.shoulderHeight, 0),
      new THREE.Vector3(halfWidth * 0.5, this.params.shoulderHeight * 0.95, 0.02),
      new THREE.Vector3(halfWidth, this.params.shoulderHeight * 0.8, 0.03)
    );
    
    const geometry = new THREE.TubeGeometry(curve, 20, thickness, 8, false);
    
    // Left side
    const leftShoulder = new THREE.Mesh(geometry, material);
    this.group.add(leftShoulder);
    
    // Right side (mirrored)
    const rightCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, this.params.shoulderHeight, 0),
      new THREE.Vector3(-halfWidth * 0.5, this.params.shoulderHeight * 0.95, 0.02),
      new THREE.Vector3(-halfWidth, this.params.shoulderHeight * 0.8, 0.03)
    );
    
    const rightGeometry = new THREE.TubeGeometry(rightCurve, 20, thickness, 8, false);
    const rightShoulder = new THREE.Mesh(rightGeometry, material);
    this.group.add(rightShoulder);
  }

  /**
   * Create contoured shoulder for suit hangers
   */
  private createContouredShoulder(material: THREE.Material, halfWidth: number): void {
    const points: THREE.Vector3[] = [];
    const segments = 30;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = halfWidth * t;
      const y = this.params.shoulderHeight - Math.sin(t * Math.PI) * 0.03;
      const z = Math.sin(t * Math.PI * 2) * 0.02;
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 30, 0.035, 8, false);
    
    // Left side
    const leftShoulder = new THREE.Mesh(geometry, material);
    this.group.add(leftShoulder);
    
    // Right side (mirrored)
    const rightPoints = points.map(p => new THREE.Vector3(-p.x, p.y, p.z));
    const rightCurve = new THREE.CatmullRomCurve3(rightPoints);
    const rightGeometry = new THREE.TubeGeometry(rightCurve, 30, 0.035, 8, false);
    const rightShoulder = new THREE.Mesh(rightGeometry, material);
    this.group.add(rightShoulder);
  }

  /**
   * Create padded shoulder
   */
  private createPaddedShoulder(material: THREE.Material, halfWidth: number): void {
    const paddingRadius = this.params.paddingThickness + 0.02;
    
    // Left padded arm
    const leftCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, this.params.shoulderHeight, 0),
      new THREE.Vector3(halfWidth * 0.5, this.params.shoulderHeight * 0.95, 0.01),
      new THREE.Vector3(halfWidth, this.params.shoulderHeight * 0.85, 0.02)
    );
    
    const leftGeometry = new THREE.TubeGeometry(leftCurve, 20, paddingRadius, 8, false);
    const leftShoulder = new THREE.Mesh(leftGeometry, material);
    this.group.add(leftShoulder);
    
    // Right padded arm
    const rightCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, this.params.shoulderHeight, 0),
      new THREE.Vector3(-halfWidth * 0.5, this.params.shoulderHeight * 0.95, 0.01),
      new THREE.Vector3(-halfWidth, this.params.shoulderHeight * 0.85, 0.02)
    );
    
    const rightGeometry = new THREE.TubeGeometry(rightCurve, 20, paddingRadius, 8, false);
    const rightShoulder = new THREE.Mesh(rightGeometry, material);
    this.group.add(rightShoulder);
  }

  /**
   * Create the cross bar (for pants/skirts)
   */
  private createBar(): void {
    const mainMaterial = this.materials.get('main')!;
    const barY = this.params.shoulderHeight * 0.3;
    
    if (this.params.hangerType === 'pants' || this.params.hangerType === 'skirt') {
      // Lower positioned bar
      const barGeometry = new THREE.CylinderGeometry(0.012, 0.012, this.params.width * 0.8, 8);
      const bar = new THREE.Mesh(barGeometry, mainMaterial);
      bar.position.y = barY;
      this.group.add(bar);
      
      // Support rods
      const supportGeometry = new THREE.CylinderGeometry(0.008, 0.008, this.params.shoulderHeight * 0.7, 8);
      
      const leftSupport = new THREE.Mesh(supportGeometry, mainMaterial);
      leftSupport.position.set(-this.params.width * 0.35, barY + this.params.shoulderHeight * 0.35, 0);
      this.group.add(leftSupport);
      
      const rightSupport = new THREE.Mesh(supportGeometry, mainMaterial);
      rightSupport.position.set(this.params.width * 0.35, barY + this.params.shoulderHeight * 0.35, 0);
      this.group.add(rightSupport);
      
    } else {
      // Standard bar
      const barGeometry = new THREE.CylinderGeometry(0.01, 0.01, this.params.width * 0.7, 8);
      const bar = new THREE.Mesh(barGeometry, mainMaterial);
      bar.position.y = barY;
      this.group.add(bar);
    }
  }

  /**
   * Create clips for pants/skirt hangers
   */
  private createClips(): void {
    const mainMaterial = this.materials.get('main')!;
    const clipMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.4,
      metalness: 0.7,
      name: 'clip',
    });
    
    const clipPositions = [
      { x: -this.params.width * 0.3, y: this.params.shoulderHeight * 0.3 },
      { x: this.params.width * 0.3, y: this.params.shoulderHeight * 0.3 },
    ];
    
    clipPositions.forEach((pos) => {
      // Clip base
      const baseGeometry = new THREE.BoxGeometry(0.06, 0.015, 0.025);
      const base = new THREE.Mesh(baseGeometry, clipMaterial);
      base.position.set(pos.x, pos.y, 0);
      this.group.add(base);
      
      // Clip jaw
      const jawGeometry = new THREE.BoxGeometry(0.05, 0.01, 0.02);
      const jaw = new THREE.Mesh(jawGeometry, clipMaterial);
      jaw.position.set(pos.x, pos.y - 0.02, 0.015);
      jaw.rotation.x = 0.2;
      this.group.add(jaw);
      
      // Spring mechanism (simplified)
      if (this.params.lodLevel < 2) {
        const springGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8);
        const spring = new THREE.Mesh(springGeometry, clipMaterial);
        spring.position.set(pos.x, pos.y - 0.01, 0);
        spring.rotation.x = Math.PI / 2;
        this.group.add(spring);
      }
    });
  }

  /**
   * Get the generated group
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Update parameters and regenerate
   */
  updateParams(params: Partial<HangerParams>): void {
    this.params = { ...this.params, ...params };
    this.generate();
  }

  /**
   * Export to JSON
   */
  toJSON(): Record<string, any> {
    return {
      type: 'Hanger',
      params: {
        ...this.params,
        color: this.params.color.getHex(),
      },
    };
  }
}

export default HangerGenerator;
