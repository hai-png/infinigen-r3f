import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../core/util/math/index';

export interface ArchwayParams {
  type: 'round' | 'pointed' | 'segmental' | 'elliptical' | 'parabolic' | 'trefoil';
  width: number;
  height: number;
  depth: number;
  style: 'classical' | 'gothic' | 'modern' | 'islamic' | 'romanesque';
  material: 'stone' | 'brick' | 'concrete' | 'wood' | 'plaster';
  hasKeystone: boolean;
  hasColumns: boolean;
  columnStyle: 'doric' | 'ionic' | 'corinthian' | 'simple';
  decorativeMolding: boolean;
  color: string;
}

export class ArchwayGenerator extends BaseObjectGenerator<ArchwayParams> {
  protected defaultParams: ArchwayParams = {
    type: 'round',
    width: 2.0,
    height: 3.0,
    depth: 0.5,
    style: 'classical',
    material: 'stone',
    hasKeystone: true,
    hasColumns: false,
    columnStyle: 'ionic',
    decorativeMolding: true,
    color: '#d4c5b0',
  };

  generate(params: Partial<ArchwayParams> = {}): THREE.Group {
    const finalParams = { ...this.defaultParams, ...params };
    this.validateParams(finalParams);
    
    const group = new THREE.Group();
    const seed = new SeededRandom(this.seed);
    
    // Generate arch shape
    this.createArch(group, finalParams, seed);
    
    // Add keystone if requested
    if (finalParams.hasKeystone) {
      this.addKeystone(group, finalParams, seed);
    }
    
    // Add columns if requested
    if (finalParams.hasColumns) {
      this.addColumns(group, finalParams, seed);
    }
    
    // Add decorative molding
    if (finalParams.decorativeMolding) {
      this.addMolding(group, finalParams, seed);
    }
    
    return group;
  }

  private createArch(group: THREE.Group, params: ArchwayParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const segments = 32;
    
    switch (params.type) {
      case 'round':
        this.createRoundArch(group, params, material, segments);
        break;
      case 'pointed':
        this.createPointedArch(group, params, material, segments);
        break;
      case 'segmental':
        this.createSegmentalArch(group, params, material, segments);
        break;
      case 'elliptical':
        this.createEllipticalArch(group, params, material, segments);
        break;
      case 'parabolic':
        this.createParabolicArch(group, params, material, segments);
        break;
      case 'trefoil':
        this.createTrefoilArch(group, params, material, segments);
        break;
    }
  }

  private createRoundArch(group: THREE.Group, params: ArchwayParams, material: THREE.Material, segments: number): void {
    const radius = params.width / 2;
    const archThickness = params.depth;
    const archHeight = radius;
    
    // Create extruded arch shape
    const shape = new THREE.Shape();
    const startAngle = Math.PI;
    const endAngle = 0;
    
    shape.absarc(0, 0, radius, startAngle, endAngle, false);
    shape.absarc(0, 0, radius - archThickness, endAngle, startAngle, true);
    
    const extrudeSettings = { depth: params.depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const arch = new THREE.Mesh(geometry, material);
    arch.position.set(params.width / 2, archHeight, 0);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  private createPointedArch(group: THREE.Group, params: ArchwayParams, material: THREE.Material, segments: number): void {
    const halfWidth = params.width / 2;
    const archHeight = params.height * 0.6;
    
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    
    // Gothic pointed arch curves
    const controlX = -halfWidth * 0.5;
    const controlY = archHeight * 0.8;
    shape.quadraticCurveTo(controlX, controlY, 0, archHeight);
    shape.quadraticCurveTo(halfWidth * 0.5, controlY, halfWidth, 0);
    
    // Inner curve
    const innerOffset = params.depth;
    shape.lineTo(halfWidth - innerOffset, 0);
    shape.quadraticCurveTo(halfWidth * 0.5, controlY * 0.9, 0, archHeight - innerOffset);
    shape.quadraticCurveTo(-halfWidth * 0.5, controlY * 0.9, -halfWidth + innerOffset, 0);
    shape.closePath();
    
    const extrudeSettings = { depth: params.depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const arch = new THREE.Mesh(geometry, material);
    arch.position.set(params.width / 2, 0, 0);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  private createSegmentalArch(group: THREE.Group, params: ArchwayParams, material: THREE.Material, segments: number): void {
    const radius = params.width * 0.75;
    const archHeight = radius * 0.3;
    
    const shape = new THREE.Shape();
    const startAngle = Math.PI - Math.asin(params.width / (2 * radius));
    const endAngle = Math.asin(params.width / (2 * radius));
    
    shape.absarc(0, -radius * 0.3, radius, startAngle, endAngle, false);
    shape.absarc(0, -radius * 0.3, radius - params.depth, endAngle, startAngle, true);
    
    const extrudeSettings = { depth: params.depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const arch = new THREE.Mesh(geometry, material);
    arch.position.set(params.width / 2, archHeight, 0);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  private createEllipticalArch(group: THREE.Group, params: ArchwayParams, material: THREE.Material, segments: number): void {
    const halfWidth = params.width / 2;
    const archHeight = params.height * 0.5;
    
    const shape = new THREE.Shape();
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI;
      const x = -halfWidth + halfWidth * 2 * (i / segments);
      const y = archHeight * Math.sin(t);
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    // Inner ellipse
    for (let i = segments; i >= 0; i--) {
      const t = (i / segments) * Math.PI;
      const x = -halfWidth + params.depth + halfWidth * 2 * (i / segments);
      const y = (archHeight - params.depth) * Math.sin(t);
      shape.lineTo(x, y);
    }
    
    shape.closePath();
    
    const extrudeSettings = { depth: params.depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const arch = new THREE.Mesh(geometry, material);
    arch.position.set(params.width / 2, 0, 0);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  private createParabolicArch(group: THREE.Group, params: ArchwayParams, material: THREE.Material, segments: number): void {
    const halfWidth = params.width / 2;
    const archHeight = params.height * 0.6;
    
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    
    // Parabolic curve: y = a*x^2
    const a = archHeight / (halfWidth * halfWidth);
    for (let i = 1; i <= segments; i++) {
      const x = -halfWidth + (params.width / segments) * i;
      const y = a * x * x;
      shape.lineTo(x, y);
    }
    
    // Inner parabola
    const innerA = (archHeight - params.depth) / ((halfWidth - params.depth) ** 2);
    for (let i = segments - 1; i >= 0; i--) {
      const x = -halfWidth + params.depth + (params.width - 2 * params.depth) * (i / segments);
      const y = innerA * x * x;
      shape.lineTo(x, y);
    }
    
    shape.closePath();
    
    const extrudeSettings = { depth: params.depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const arch = new THREE.Mesh(geometry, material);
    arch.position.set(params.width / 2, 0, 0);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  private createTrefoilArch(group: THREE.Group, params: ArchwayParams, material: THREE.Material, segments: number): void {
    const halfWidth = params.width / 2;
    const archHeight = params.height * 0.7;
    
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    
    // Three-lobed pattern
    const lobeRadius = params.width / 6;
    
    // Left lobe
    shape.absarc(-halfWidth / 2, archHeight * 0.5, lobeRadius, Math.PI, 0, false);
    // Center lobe
    shape.absarc(0, archHeight, lobeRadius, Math.PI, 0, false);
    // Right lobe
    shape.absarc(halfWidth / 2, archHeight * 0.5, lobeRadius, Math.PI, 0, false);
    
    shape.lineTo(halfWidth, 0);
    shape.lineTo(-halfWidth, 0);
    shape.closePath();
    
    const extrudeSettings = { depth: params.depth, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const arch = new THREE.Mesh(geometry, material);
    arch.position.set(params.width / 2, 0, 0);
    arch.rotation.x = Math.PI / 2;
    group.add(arch);
  }

  private addKeystone(group: THREE.Group, params: ArchwayParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const keystoneWidth = params.depth * 1.5;
    const keystoneHeight = params.depth * 1.2;
    
    let keystoneGeo: THREE.BufferGeometry;
    
    if (params.style === 'gothic') {
      keystoneGeo = new THREE.ConeGeometry(keystoneWidth / 2, keystoneHeight, 4);
    } else if (params.style === 'islamic') {
      keystoneGeo = new THREE.SphereGeometry(keystoneWidth / 2, 8, 8);
    } else {
      keystoneGeo = new THREE.BoxGeometry(keystoneWidth, keystoneHeight, params.depth + 0.1);
    }
    
    const keystone = new THREE.Mesh(keystoneGeo, material);
    keystone.position.set(params.width / 2, params.height * 0.6, params.depth / 2 + 0.05);
    group.add(keystone);
  }

  private addColumns(group: THREE.Group, params: ArchwayParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const columnHeight = params.height;
    const columnRadius = params.depth * 0.4;
    
    // Left column
    const leftColumn = this.createColumn(columnHeight, columnRadius, params.columnStyle, material);
    leftColumn.position.set(0, columnHeight / 2, 0);
    group.add(leftColumn);
    
    // Right column
    const rightColumn = this.createColumn(columnHeight, columnRadius, params.columnStyle, material);
    rightColumn.position.set(params.width, columnHeight / 2, 0);
    group.add(rightColumn);
  }

  private createColumn(height: number, radius: number, style: string, material: THREE.Material): THREE.Group {
    const column = new THREE.Group();
    
    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(radius * 0.9, radius, height * 0.7, 8);
    const shaft = new THREE.Mesh(shaftGeo, material);
    shaft.position.y = height * 0.35;
    column.add(shaft);
    
    // Base
    const baseGeo = new THREE.CylinderGeometry(radius * 1.2, radius * 1.3, height * 0.1, 8);
    const base = new THREE.Mesh(baseGeo, material);
    base.position.y = height * 0.05;
    column.add(base);
    
    // Capital
    let capitalGeo: THREE.BufferGeometry;
    if (style === 'doric') {
      capitalGeo = new THREE.CylinderGeometry(radius * 1.1, radius * 1.2, height * 0.15, 8);
    } else if (style === 'ionic') {
      capitalGeo = new THREE.BoxGeometry(radius * 2.5, height * 0.15, radius * 1.5);
    } else if (style === 'corinthian') {
      capitalGeo = new THREE.CylinderGeometry(radius * 1.2, radius * 1.3, height * 0.2, 12);
    } else {
      capitalGeo = new THREE.CylinderGeometry(radius, radius * 1.1, height * 0.1, 8);
    }
    
    const capital = new THREE.Mesh(capitalGeo, material);
    capital.position.y = height * 0.775;
    column.add(capital);
    
    return column;
  }

  private addMolding(group: THREE.Group, params: ArchwayParams, seed: SeededRandom): void {
    const material = this.getMaterial(params);
    const moldingDepth = params.depth + 0.1;
    
    // Simple decorative band around arch
    const shape = new THREE.Shape();
    const radius = params.width / 2 + 0.05;
    const startAngle = Math.PI;
    const endAngle = 0;
    
    shape.absarc(0, 0, radius, startAngle, endAngle, false);
    shape.absarc(0, 0, radius - 0.05, endAngle, startAngle, true);
    
    const extrudeSettings = { depth: 0.05, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const molding = new THREE.Mesh(geometry, material);
    molding.position.set(params.width / 2, params.height * 0.5, -0.025);
    molding.rotation.x = Math.PI / 2;
    group.add(molding);
  }

  private getMaterial(params: ArchwayParams): THREE.Material {
    const color = new THREE.Color(params.color);
    
    if (params.material === 'stone' || params.material === 'concrete') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.9,
      });
    } else if (params.material === 'brick') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.95,
      });
    } else if (params.material === 'wood') {
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.7,
      });
    } else {
      // Plaster
      return new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.6,
      });
    }
  }

  protected validateParams(params: ArchwayParams): void {
    if (params.width < 1.0 || params.width > 8.0) {
      throw new Error('Archway width must be between 1.0 and 8.0 meters');
    }
    if (params.height < 2.0 || params.height > 10.0) {
      throw new Error('Archway height must be between 2.0 and 10.0 meters');
    }
  }
}
