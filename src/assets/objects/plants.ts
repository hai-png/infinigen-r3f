/**
 * InfiniGen R3F Port - Plant Generators
 * 
 * Procedural generation of plants, trees, and vegetation
 * Based on original InfiniGen plant generators from Princeton VL
 * 
 * Categories:
 * - Trees (broadleaf, coniferous, palm)
 * - Cacti (columnar, globular, prickly pear)
 * - Small Plants (fern, succulent, snake plant)
 * - Mushrooms (cap, stem variants)
 * - Leaves (broadleaf, pine, ginkgo, maple)
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetParams, LODLevel } from './base-generator';
import { GeometryUtils } from '../../geometry/geometry-utils';

export interface PlantParams extends AssetParams {
  // Growth parameters
  height?: number;
  width?: number;
  age?: number; // 0-1, affects size and complexity
  
  // Branching parameters
  branchCount?: number;
  branchLength?: number;
  branchAngle?: number;
  branchCurvature?: number;
  
  // Leaf parameters
  leafDensity?: number;
  leafSize?: number;
  leafSpread?: number;
  
  // Trunk parameters
  trunkThickness?: number;
  trunkHeight?: number;
  trunkTaper?: number;
  
  // Variation
  seed?: number;
}

/**
 * Base class for all plant generators
 * Implements L-system inspired growth algorithms
 */
export abstract class BasePlantGenerator extends BaseAssetGenerator<PlantParams> {
  protected defaultParams: PlantParams = {
    ...super.defaultParams,
    height: 2.0,
    width: 1.5,
    age: 0.5,
    branchCount: 5,
    branchLength: 0.8,
    branchAngle: Math.PI / 6,
    branchCurvature: 0.2,
    leafDensity: 0.7,
    leafSize: 0.15,
    leafSpread: Math.PI / 4,
    trunkThickness: 0.1,
    trunkHeight: 0.5,
    trunkTaper: 0.6,
    seed: undefined,
  };

  protected validateParams(params: PlantParams): PlantParams {
    return {
      ...this.defaultParams,
      ...params,
      height: Math.max(0.1, params.height ?? this.defaultParams.height!),
      width: Math.max(0.1, params.width ?? this.defaultParams.width!),
      age: THREE.MathUtils.clamp(params.age ?? this.defaultParams.age!, 0, 1),
      branchCount: Math.max(1, params.branchCount ?? this.defaultParams.branchCount!),
      leafDensity: THREE.MathUtils.clamp(params.leafDensity ?? this.defaultParams.leafDensity!, 0, 1),
      leafSize: Math.max(0.01, params.leafSize ?? this.defaultParams.leafSize!),
      trunkThickness: Math.max(0.01, params.trunkThickness ?? this.defaultParams.trunkThickness!),
    };
  }

  /**
   * Generate a branching structure using recursive algorithm
   */
  protected generateBranchStructure(
    rng: () => number,
    depth: number,
    maxDepth: number,
    startRadius: number,
    length: number,
    angle: number
  ): THREE.Group {
    const group = new THREE.Group();
    
    if (depth >= maxDepth || length < 0.05) {
      return group;
    }

    // Create trunk/branch segment
    const taper = Math.pow(0.7, depth);
    const endRadius = startRadius * taper;
    const segmentLength = length * (0.7 + rng() * 0.3);
    
    const branchGeometry = this.createTaperedCylinder(
      startRadius,
      endRadius,
      segmentLength,
      8
    );
    
    const branchMaterial = this.getMaterial('wood');
    const branch = new THREE.Mesh(branchGeometry, branchMaterial);
    branch.position.y = segmentLength / 2;
    branch.castShadow = true;
    branch.receiveShadow = true;
    group.add(branch);

    // Generate child branches
    const branchProbability = 0.7 - (depth / maxDepth) * 0.3;
    const numBranches = depth === 0 ? 3 : (rng() < branchProbability ? Math.floor(rng() * 2) + 1 : 0);
    
    for (let i = 0; i < numBranches; i++) {
      const childGroup = new THREE.Group();
      
      // Calculate branch angle with variation
      const azimuthalAngle = (Math.PI * 2 / numBranches) * i + rng() * 0.5;
      const polarAngle = angle * (0.5 + rng() * 0.5);
      
      childGroup.rotation.z = polarAngle;
      childGroup.rotation.y = azimuthalAngle;
      childGroup.position.y = segmentLength * 0.9;
      
      // Recursive generation
      const childBranches = this.generateBranchStructure(
        rng,
        depth + 1,
        maxDepth,
        endRadius,
        length * 0.7,
        angle * 0.8
      );
      
      childGroup.add(childBranches);
      group.add(childGroup);
    }

    return group;
  }

  /**
   * Create a tapered cylinder geometry
   */
  protected createTaperedCylinder(
    topRadius: number,
    bottomRadius: number,
    height: number,
    radialSegments: number = 8
  ): THREE.CylinderGeometry {
    return new THREE.CylinderGeometry(
      topRadius,
      bottomRadius,
      height,
      radialSegments,
      1,
      false
    );
  }

  /**
   * Generate leaf cluster
   */
  protected generateLeafCluster(
    rng: () => number,
    position: THREE.Vector3,
    count: number,
    spread: number,
    leafGeometry: THREE.BufferGeometry,
    material: THREE.Material
  ): THREE.Group {
    const cluster = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const leaf = new THREE.Mesh(leafGeometry, material);
      
      // Random position within spread
      const angle1 = rng() * Math.PI * 2;
      const angle2 = rng() * Math.PI * 2;
      const radius = rng() * spread;
      
      leaf.position.x = position.x + Math.sin(angle1) * Math.cos(angle2) * radius;
      leaf.position.y = position.y + rng() * spread * 0.5;
      leaf.position.z = position.z + Math.cos(angle1) * Math.cos(angle2) * radius;
      
      // Random rotation
      leaf.rotation.set(
        rng() * Math.PI,
        rng() * Math.PI * 2,
        rng() * Math.PI
      );
      
      // Random scale variation
      const scale = 0.8 + rng() * 0.4;
      leaf.scale.setScalar(scale);
      
      leaf.castShadow = true;
      cluster.add(leaf);
    }
    
    return cluster;
  }

  /**
   * Get bark/wood material based on plant type
   */
  protected getWoodMaterial(type: string, rng: () => number): THREE.MeshStandardMaterial {
    const baseColor = this.getWoodColor(type, rng);
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.8 + rng() * 0.2,
      metalness: 0.0,
    });
  }

  protected getWoodColor(type: string, rng: () => number): THREE.Color {
    const colors: Record<string, [number, number, number]> = {
      oak: [0.4, 0.3, 0.2],
      pine: [0.35, 0.25, 0.15],
      birch: [0.8, 0.75, 0.7],
      maple: [0.45, 0.35, 0.25],
      palm: [0.5, 0.45, 0.4],
      default: [0.4, 0.3, 0.2],
    };
    
    const base = colors[type] || colors.default;
    const variation = 0.1 * (rng() - 0.5);
    
    return new THREE.Color(
      Math.max(0, Math.min(1, base[0] + variation)),
      Math.max(0, Math.min(1, base[1] + variation)),
      Math.max(0, Math.min(1, base[2] + variation))
    );
  }

  /**
   * Get leaf material based on plant type
   */
  protected getLeafMaterial(type: string, rng: () => number): THREE.MeshStandardMaterial {
    const baseColor = this.getLeafColor(type, rng);
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.6 + rng() * 0.3,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  protected getLeafColor(type: string, rng: () => number): THREE.Color {
    const colors: Record<string, [number, number, number]> = {
      green: [0.2, 0.5, 0.15],
      darkGreen: [0.1, 0.35, 0.1],
      lightGreen: [0.3, 0.6, 0.2],
      yellowGreen: [0.4, 0.6, 0.2],
      red: [0.5, 0.15, 0.15],
      orange: [0.6, 0.35, 0.1],
      default: [0.2, 0.5, 0.15],
    };
    
    const base = colors[type] || colors.default;
    const variation = 0.1 * (rng() - 0.5);
    
    return new THREE.Color(
      Math.max(0, Math.min(1, base[0] + variation)),
      Math.max(0, Math.min(1, base[1] + variation)),
      Math.max(0, Math.min(1, base[2] + variation))
    );
  }
}

/**
 * Tree Generator - Broadleaf and Coniferous trees
 */
export class TreeGenerator extends BasePlantGenerator {
  static readonly TYPES = ['oak', 'maple', 'birch', 'pine', 'palm'] as const;
  static readonly FORMS = ['broadleaf', 'conical', 'weeping', 'round', 'columnar'] as const;

  generate(params: PlantParams & { 
    treeType?: typeof TreeGenerator.TYPES[number];
    form?: typeof TreeGenerator.FORMS[number];
  }): THREE.Group {
    const validatedParams = this.validateParams(params);
    const rng = this.getRng(validatedParams.seed);
    
    const treeType = params.treeType || TreeGenerator.TYPES[Math.floor(rng() * TreeGenerator.TYPES.length)];
    const form = params.form || TreeGenerator.FORMS[Math.floor(rng() * TreeGenerator.FORMS.length)];
    
    const tree = new THREE.Group();
    
    // Generate trunk
    const trunkHeight = validatedParams.trunkHeight! * validatedParams.height!;
    const trunkBaseRadius = validatedParams.trunkThickness! * (1 + validatedParams.age!);
    const trunkTopRadius = trunkBaseRadius * validatedParams.trunkTaper!;
    
    const trunkGeometry = this.createTaperedCylinder(
      trunkTopRadius,
      trunkBaseRadius,
      trunkHeight,
      12
    );
    
    const trunkMaterial = this.getWoodMaterial(treeType, rng);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);
    
    // Generate crown/canopy based on form
    const canopyGroup = new THREE.Group();
    canopyGroup.position.y = trunkHeight;
    
    switch (form) {
      case 'broadleaf':
        this.generateBroadleafCanopy(canopyGroup, validatedParams, treeType, rng);
        break;
      case 'conical':
        this.generateConicalCanopy(canopyGroup, validatedParams, treeType, rng);
        break;
      case 'weeping':
        this.generateWeepingCanopy(canopyGroup, validatedParams, treeType, rng);
        break;
      case 'round':
        this.generateRoundCanopy(canopyGroup, validatedParams, treeType, rng);
        break;
      case 'columnar':
        this.generateColumnarCanopy(canopyGroup, validatedParams, treeType, rng);
        break;
    }
    
    tree.add(canopyGroup);
    
    // Add semantic tags
    this.addSemanticTags(tree, {
      category: 'plant',
      subcategory: 'tree',
      treeType,
      form,
      height: validatedParams.height!,
    });
    
    // Generate LODs
    this.generateLODs(tree, validatedParams);
    
    // Generate collision geometry
    this.generateCollisionGeometry(tree, validatedParams);
    
    return tree;
  }

  private generateBroadleafCanopy(
    group: THREE.Group,
    params: PlantParams,
    treeType: string,
    rng: () => number
  ): void {
    const branchStructure = this.generateBranchStructure(
      rng,
      0,
      4,
      params.trunkThickness! * 0.8,
      params.branchLength! * params.width!,
      params.branchAngle!
    );
    group.add(branchStructure);
    
    // Generate leaves at branch ends
    const leafGeometry = this.createLeafGeometry('broadleaf', params.leafSize!, rng);
    const leafMaterial = this.getLeafMaterial('green', rng);
    
    const leafCount = Math.floor(50 * params.leafDensity! * params.age!);
    const positions = this.getBranchEndPositions(branchStructure);
    
    positions.forEach((pos, idx) => {
      if (idx % 3 === 0) { // Sample positions
        const cluster = this.generateLeafCluster(
          rng,
          pos,
          Math.floor(leafCount / positions.length) * 3,
          params.leafSpread!,
          leafGeometry,
          leafMaterial
        );
        group.add(cluster);
      }
    });
  }

  private generateConicalCanopy(
    group: THREE.Group,
    params: PlantParams,
    treeType: string,
    rng: () => number
  ): void {
    // Pine/fir tree style - layered cones
    const layers = 5 + Math.floor(params.age! * 3);
    const coneHeight = (params.height! - params.trunkHeight!) / layers;
    
    for (let i = 0; i < layers; i++) {
      const layerY = params.trunkHeight! + i * coneHeight;
      const layerRadius = params.width! * (1 - i / layers) * (0.5 + rng() * 0.3);
      
      const coneGeometry = new THREE.ConeGeometry(
        layerRadius,
        coneHeight * 1.2,
        8
      );
      
      const material = this.getLeafMaterial('darkGreen', rng);
      const cone = new THREE.Mesh(coneGeometry, material);
      cone.position.y = layerY + coneHeight / 2;
      cone.castShadow = true;
      group.add(cone);
    }
  }

  private generateWeepingCanopy(
    group: THREE.Group,
    params: PlantParams,
    treeType: string,
    rng: () => number
  ): void {
    // Weeping willow style - drooping branches
    const branchCount = 15 + Math.floor(params.age! * 10);
    
    for (let i = 0; i < branchCount; i++) {
      const angle = (Math.PI * 2 / branchCount) * i + rng() * 0.3;
      const branchLength = params.branchLength! * params.width! * (0.7 + rng() * 0.3);
      
      const branchGroup = new THREE.Group();
      branchGroup.rotation.y = angle;
      
      // Curved branch
      const points = [];
      const segments = 10;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = Math.sin(angle) * branchLength * t;
        const y = -branchLength * 0.5 * t * t; // Drooping curve
        const z = Math.cos(angle) * branchLength * t;
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.02, 6, false);
      
      const material = this.getWoodMaterial(treeType, rng);
      const branch = new THREE.Mesh(tubeGeometry, material);
      branchGroup.add(branch);
      
      // Add hanging leaves
      const leafGeometry = this.createLeafGeometry('narrow', params.leafSize! * 0.7, rng);
      const leafMaterial = this.getLeafMaterial('lightGreen', rng);
      
      for (let k = 0; k < 5; k++) {
        const t = 0.3 + rng() * 0.7;
        const pos = curve.getPoint(t);
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        leaf.position.copy(pos);
        leaf.rotation.y = rng() * Math.PI * 2;
        leaf.rotation.x = -Math.PI / 4;
        group.add(leaf);
      }
      
      group.add(branchGroup);
    }
  }

  private generateRoundCanopy(
    group: THREE.Group,
    params: PlantParams,
    treeType: string,
    rng: () => number
  ): void {
    // Spherical canopy
    const sphereRadius = params.width! * 0.8;
    const leafGeometry = this.createLeafGeometry('round', params.leafSize!, rng);
    const leafMaterial = this.getLeafMaterial('green', rng);
    
    // Generate leaves in spherical distribution
    const leafCount = Math.floor(100 * params.leafDensity! * params.age!);
    
    for (let i = 0; i < leafCount; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = sphereRadius * (0.5 + rng() * 0.5);
      
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      
      leaf.lookAt(new THREE.Vector3(0, 0, 0));
      leaf.rotation.x += Math.PI / 2;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }

  private generateColumnarCanopy(
    group: THREE.Group,
    params: PlantParams,
    treeType: string,
    rng: () => number
  ): void {
    // Columnar/tree like cypress - narrow and tall
    const height = params.height! - params.trunkHeight!;
    const radius = params.width! * 0.3;
    
    const coneGeometry = new THREE.ConeGeometry(
      radius,
      height,
      8
    );
    
    const material = this.getLeafMaterial('darkGreen', rng);
    const cone = new THREE.Mesh(coneGeometry, material);
    cone.position.y = height / 2;
    cone.castShadow = true;
    group.add(cone);
  }

  private createLeafGeometry(
    shape: 'broadleaf' | 'narrow' | 'round' | 'pine',
    size: number,
    rng: () => number
  ): THREE.BufferGeometry {
    switch (shape) {
      case 'broadleaf': {
        // Oval leaf shape
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(size * 0.5, -size * 0.3, size, 0);
        shape.quadraticCurveTo(size * 0.5, size * 0.3, 0, 0);
        shape.quadraticCurveTo(-size * 0.5, size * 0.3, -size, 0);
        shape.quadraticCurveTo(-size * 0.5, -size * 0.3, 0, 0);
        
        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
      }
      
      case 'narrow': {
        // Long narrow leaf (willow-style)
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(size * 0.3, -size * 0.1, size * 2, 0);
        shape.quadraticCurveTo(size * 0.3, size * 0.1, 0, 0);
        
        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
      }
      
      case 'round': {
        // Circular leaf
        const geometry = new THREE.CircleGeometry(size, 8);
        return geometry;
      }
      
      case 'pine': {
        // Needle-like
        const geometry = new THREE.CylinderGeometry(0.01, 0.01, size * 2, 4);
        return geometry;
      }
      
      default: {
        const geometry = new THREE.CircleGeometry(size, 8);
        return geometry;
      }
    }
  }

  private getBranchEndPositions(group: THREE.Group): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry.type === 'CylinderGeometry') {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        
        // Check if this is near the end of a branch
        if (child.position.y > child.geometry.parameters.height * 0.8) {
          positions.push(worldPos.clone());
        }
      }
    });
    
    return positions;
  }
}

/**
 * Cactus Generator - Desert plants
 */
export class CactusGenerator extends BasePlantGenerator {
  static readonly TYPES = ['columnar', 'globular', 'pricklyPear', 'barrel', 'saguaro'] as const;

  generate(params: PlantParams & {
    cactusType?: typeof CactusGenerator.TYPES[number];
  }): THREE.Group {
    const validatedParams = this.validateParams(params);
    const rng = this.getRng(validatedParams.seed);
    
    const cactusType = params.cactusType || CactusGenerator.TYPES[Math.floor(rng() * CactusGenerator.TYPES.length)];
    
    const cactus = new THREE.Group();
    
    switch (cactusType) {
      case 'columnar':
        this.generateColumnarCactus(cactus, validatedParams, rng);
        break;
      case 'globular':
        this.generateGlobularCactus(cactus, validatedParams, rng);
        break;
      case 'pricklyPear':
        this.generatePricklyPearCactus(cactus, validatedParams, rng);
        break;
      case 'barrel':
        this.generateBarrelCactus(cactus, validatedParams, rng);
        break;
      case 'saguaro':
        this.generateSaguaroCactus(cactus, validatedParams, rng);
        break;
    }
    
    // Add spines
    this.addSpines(cactus, validatedParams, rng);
    
    // Add semantic tags
    this.addSemanticTags(cactus, {
      category: 'plant',
      subcategory: 'cactus',
      cactusType,
      height: validatedParams.height!,
    });
    
    // Generate LODs
    this.generateLODs(cactus, validatedParams);
    
    // Generate collision geometry
    this.generateCollisionGeometry(cactus, validatedParams);
    
    return cactus;
  }

  private generateColumnarCactus(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const segments = 5 + Math.floor(params.age! * 5);
    const segmentHeight = params.height! / segments;
    let currentRadius = params.width! * 0.3;
    
    for (let i = 0; i < segments; i++) {
      const radius = currentRadius * (0.9 + rng() * 0.2);
      const geometry = new THREE.CylinderGeometry(
        radius * 0.9,
        radius,
        segmentHeight,
        12
      );
      
      const material = this.getCactusMaterial(rng);
      const segment = new THREE.Mesh(geometry, material);
      segment.position.y = i * segmentHeight + segmentHeight / 2;
      segment.castShadow = true;
      segment.receiveShadow = true;
      group.add(segment);
      
      currentRadius *= 0.97;
    }
  }

  private generateGlobularCactus(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const radius = params.width! * 0.6;
    
    // Spherical body
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    
    // Deform to make it slightly irregular
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const distortion = 0.1 * (rng() - 0.5);
      positions[i] = x * (1 + distortion);
      positions[i + 1] = y * (1 + distortion * 0.5);
      positions[i + 2] = z * (1 + distortion);
    }
    
    geometry.computeVertexNormals();
    
    const material = this.getCactusMaterial(rng);
    const body = new THREE.Mesh(geometry, material);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
  }

  private generatePricklyPearCactus(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Generate paddle-shaped segments
    const padCount = 3 + Math.floor(params.age! * 4);
    
    for (let i = 0; i < padCount; i++) {
      const padWidth = params.width! * (0.5 + rng() * 0.3);
      const padHeight = padWidth * 1.2;
      const padThickness = padWidth * 0.15;
      
      // Create flattened ellipsoid for pad
      const geometry = new THREE.SphereGeometry(1, 16, 16);
      geometry.scale(padWidth / 2, padHeight / 2, padThickness / 2);
      
      const material = this.getCactusMaterial(rng);
      const pad = new THREE.Mesh(geometry, material);
      
      // Position pads in branching pattern
      if (i === 0) {
        pad.position.y = padHeight / 2;
      } else {
        const angle = rng() * Math.PI * 2;
        const distance = padWidth * 0.5;
        pad.position.x = Math.cos(angle) * distance;
        pad.position.z = Math.sin(angle) * distance;
        pad.position.y = padHeight * 0.3;
        pad.rotation.z = (rng() - 0.5) * 0.5;
      }
      
      pad.castShadow = true;
      pad.receiveShadow = true;
      group.add(pad);
    }
  }

  private generateBarrelCactus(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const height = params.height!;
    const radius = params.width! * 0.7;
    
    // Barrel shape - wider in the middle
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(radius * 1.2, height * 0.3, radius, height * 0.5);
    shape.quadraticCurveTo(radius * 1.2, height * 0.7, 0, height);
    shape.lineTo(0, height);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.LatheGeometry(shape.getPoints(), 16);
    
    const material = this.getCactusMaterial(rng);
    const barrel = new THREE.Mesh(geometry, material);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
  }

  private generateSaguaroCactus(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Main column
    const mainHeight = params.height! * 0.8;
    const mainRadius = params.width! * 0.25;
    
    const mainGeometry = new THREE.CylinderGeometry(
      mainRadius * 0.9,
      mainRadius,
      mainHeight,
      12
    );
    
    const material = this.getCactusMaterial(rng);
    const mainColumn = new THREE.Mesh(mainGeometry, material);
    mainColumn.position.y = mainHeight / 2;
    mainColumn.castShadow = true;
    mainColumn.receiveShadow = true;
    group.add(mainColumn);
    
    // Arms (only for mature cacti)
    if (params.age! > 0.5) {
      const armCount = Math.floor((params.age! - 0.5) * 4);
      
      for (let i = 0; i < armCount; i++) {
        const armHeight = mainHeight * (0.3 + rng() * 0.3);
        const armY = mainHeight * (0.4 + rng() * 0.4);
        const armAngle = (Math.PI * 2 / armCount) * i;
        
        const armGeometry = new THREE.CylinderGeometry(
          mainRadius * 0.4,
          mainRadius * 0.5,
          armHeight,
          8
        );
        
        const arm = new THREE.Mesh(armGeometry, material);
        arm.position.set(
          Math.cos(armAngle) * mainRadius,
          armY,
          Math.sin(armAngle) * mainRadius
        );
        arm.rotation.z = -Math.PI / 4;
        arm.rotation.y = armAngle;
        arm.castShadow = true;
        group.add(arm);
      }
    }
  }

  private getCactusMaterial(rng: () => number): THREE.MeshStandardMaterial {
    const greenVariation = 0.1 * (rng() - 0.5);
    
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.3 + greenVariation, 0.5 + greenVariation, 0.2),
      roughness: 0.7,
      metalness: 0.0,
    });
  }

  private addSpines(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Add spine clusters (simplified as small cylinders)
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: 0x888844,
      roughness: 0.8,
      metalness: 0.0,
    });
    
    const spineCount = Math.floor(50 * params.leafDensity!);
    
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material === spineMaterial) return;
      
      for (let i = 0; i < spineCount / 10; i++) {
        const spineGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4);
        const spine = new THREE.Mesh(spineGeometry, spineMaterial);
        
        // Random position on surface
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        
        spine.position.copy(worldPos);
        spine.position.x += (rng() - 0.5) * params.width! * 0.1;
        spine.position.y += (rng() - 0.5) * params.height! * 0.1;
        spine.position.z += (rng() - 0.5) * params.width! * 0.1;
        
        spine.rotation.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
        group.add(spine);
      }
    });
  }
}

/**
 * Small Plant Generator - Ferns, succulents, houseplants
 */
export class SmallPlantGenerator extends BasePlantGenerator {
  static readonly TYPES = ['fern', 'succulent', 'snakePlant', 'spiderPlant', 'aloe'] as const;

  generate(params: PlantParams & {
    plantType?: typeof SmallPlantGenerator.TYPES[number];
  }): THREE.Group {
    const validatedParams = this.validateParams(params);
    const rng = this.getRng(validatedParams.seed);
    
    const plantType = params.plantType || SmallPlantGenerator.TYPES[Math.floor(rng() * SmallPlantGenerator.TYPES.length)];
    
    const plant = new THREE.Group();
    
    switch (plantType) {
      case 'fern':
        this.generateFern(plant, validatedParams, rng);
        break;
      case 'succulent':
        this.generateSucculent(plant, validatedParams, rng);
        break;
      case 'snakePlant':
        this.generateSnakePlant(plant, validatedParams, rng);
        break;
      case 'spiderPlant':
        this.generateSpiderPlant(plant, validatedParams, rng);
        break;
      case 'aloe':
        this.generateAloe(plant, validatedParams, rng);
        break;
    }
    
    // Add semantic tags
    this.addSemanticTags(plant, {
      category: 'plant',
      subcategory: 'smallPlant',
      plantType,
      height: validatedParams.height!,
    });
    
    // Generate LODs
    this.generateLODs(plant, validatedParams);
    
    // Generate collision geometry
    this.generateCollisionGeometry(plant, validatedParams);
    
    return plant;
  }

  private generateFern(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const frondCount = 8 + Math.floor(params.age! * 12);
    const frondLength = params.height! * 0.6;
    
    const leafMaterial = this.getLeafMaterial('lightGreen', rng);
    
    for (let i = 0; i < frondCount; i++) {
      const angle = (Math.PI * 2 / frondCount) * i + rng() * 0.2;
      const frondGroup = new THREE.Group();
      frondGroup.rotation.y = angle;
      
      // Frond stem (curved)
      const points = [];
      const segments = 15;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = 0;
        const y = frondLength * t;
        const z = Math.sin(t * Math.PI) * frondLength * 0.2; // Arch
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const curve = new THREE.CatmullRomCurve3(points);
      const stemGeometry = new THREE.TubeGeometry(curve, 15, 0.01, 6, false);
      const stem = new THREE.Mesh(stemGeometry, leafMaterial);
      frondGroup.add(stem);
      
      // Leaflets along the frond
      const leafletCount = 10 + Math.floor(rng() * 10);
      for (let k = 0; k < leafletCount; k++) {
        const t = 0.1 + (k / leafletCount) * 0.8;
        const point = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        
        const leafletGeometry = this.createLeafGeometry('narrow', params.leafSize! * 0.5, rng);
        const leaflet = new THREE.Mesh(leafletGeometry, leafMaterial);
        
        leaflet.position.copy(point);
        leaflet.position.x += (rng() - 0.5) * 0.05;
        
        // Align with frond direction
        leaflet.lookAt(point.clone().add(tangent));
        
        // Alternate sides
        if (k % 2 === 0) {
          leaflet.position.x += 0.03;
        } else {
          leaflet.position.x -= 0.03;
        }
        
        frondGroup.add(leaflet);
      }
      
      group.add(frondGroup);
    }
  }

  private generateSucculent(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Rosette pattern of thick leaves
    const leafCount = 12 + Math.floor(params.age! * 12);
    const leafMaterial = this.getLeafMaterial('green', rng);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (Math.PI * 2 / leafCount) * i;
      const layer = Math.floor(i / 6);
      const radius = 0.1 + layer * 0.05;
      
      // Fleshy leaf shape
      const leafGeometry = new THREE.SphereGeometry(params.leafSize!, 8, 8);
      leafGeometry.scale(1, 0.5, 2);
      
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.position.set(
        Math.cos(angle) * radius,
        layer * 0.02,
        Math.sin(angle) * radius
      );
      leaf.rotation.y = angle;
      leaf.rotation.x = -Math.PI / 6 - layer * 0.1;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }

  private generateSnakePlant(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Upright sword-shaped leaves
    const leafCount = 5 + Math.floor(params.age! * 5);
    const leafHeight = params.height! * 0.8;
    const leafWidth = params.width! * 0.3;
    
    const leafMaterial = this.getLeafMaterial('darkGreen', rng);
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (Math.PI * 2 / leafCount) * i + rng() * 0.1;
      
      // Sword-shaped leaf
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(leafWidth / 2, leafHeight * 0.3);
      shape.lineTo(0, leafHeight);
      shape.lineTo(-leafWidth / 2, leafHeight * 0.3);
      shape.lineTo(0, 0);
      
      const leafGeometry = new THREE.ShapeGeometry(shape);
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      
      leaf.position.y = leafHeight * 0.1;
      leaf.rotation.y = angle;
      leaf.rotation.x = -0.1;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }

  private generateSpiderPlant(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Arching narrow leaves
    const leafCount = 10 + Math.floor(params.age! * 10);
    const leafLength = params.height! * 0.7;
    const leafWidth = params.width! * 0.1;
    
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.4, 0.6, 0.3),
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (Math.PI * 2 / leafCount) * i;
      
      // Create arching leaf
      const points = [];
      const segments = 10;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = Math.sin(angle) * leafLength * t * (1 - t * 0.3);
        const y = leafLength * t * 0.8;
        const z = Math.cos(angle) * leafLength * t * (1 - t * 0.3);
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const curve = new THREE.CatmullRomCurve3(points);
      const leafGeometry = new THREE.TubeGeometry(curve, 10, leafWidth / 2, 6, false);
      
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.castShadow = true;
      group.add(leaf);
    }
  }

  private generateAloe(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    // Thick, toothed leaves in rosette
    const leafCount = 12 + Math.floor(params.age! * 8);
    const leafLength = params.height! * 0.6;
    const leafWidth = params.width! * 0.2;
    
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.35, 0.55, 0.25),
      roughness: 0.5,
    });
    
    for (let i = 0; i < leafCount; i++) {
      const angle = (Math.PI * 2 / leafCount) * i;
      const layer = Math.floor(i / 4);
      const radius = layer * 0.05;
      
      // Cone-shaped leaf
      const leafGeometry = new THREE.ConeGeometry(
        leafWidth * (1 - layer * 0.1),
        leafLength * (1 - layer * 0.15),
        6
      );
      
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.position.set(
        Math.cos(angle) * radius,
        layer * 0.03,
        Math.sin(angle) * radius
      );
      leaf.rotation.y = angle;
      leaf.rotation.x = -Math.PI / 4 - layer * 0.1;
      leaf.rotation.z = (rng() - 0.5) * 0.2;
      leaf.castShadow = true;
      group.add(leaf);
    }
  }
}

/**
 * Mushroom Generator - Fungi
 */
export class MushroomGenerator extends BasePlantGenerator {
  static readonly TYPES = ['button', 'shiitake', 'morel', 'chanterelle', 'flyAgaric'] as const;

  generate(params: PlantParams & {
    mushroomType?: typeof MushroomGenerator.TYPES[number];
  }): THREE.Group {
    const validatedParams = this.validateParams(params);
    const rng = this.getRng(validatedParams.seed);
    
    const mushroomType = params.mushroomType || MushroomGenerator.TYPES[Math.floor(rng() * MushroomGenerator.TYPES.length)];
    
    const mushroom = new THREE.Group();
    
    switch (mushroomType) {
      case 'button':
        this.generateButtonMushroom(mushroom, validatedParams, rng);
        break;
      case 'shiitake':
        this.generateShiitakeMushroom(mushroom, validatedParams, rng);
        break;
      case 'morel':
        this.generateMorelMushroom(mushroom, validatedParams, rng);
        break;
      case 'chanterelle':
        this.generateChanterelleMushroom(mushroom, validatedParams, rng);
        break;
      case 'flyAgaric':
        this.generateFlyAgaricMushroom(mushroom, validatedParams, rng);
        break;
    }
    
    // Add semantic tags
    this.addSemanticTags(mushroom, {
      category: 'plant',
      subcategory: 'mushroom',
      mushroomType,
      height: validatedParams.height!,
    });
    
    // Generate LODs
    this.generateLODs(mushroom, validatedParams);
    
    // Generate collision geometry
    this.generateCollisionGeometry(mushroom, validatedParams);
    
    return mushroom;
  }

  private generateButtonMushroom(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const capRadius = params.width! * 0.5;
    const stemHeight = params.height! * 0.5;
    const stemRadius = params.trunkThickness!;
    
    // Cap (hemisphere)
    const capGeometry = new THREE.SphereGeometry(capRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.7,
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = stemHeight;
    cap.castShadow = true;
    group.add(cap);
    
    // Stem
    const stemGeometry = new THREE.CylinderGeometry(
      stemRadius * 0.8,
      stemRadius,
      stemHeight,
      8
    );
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0xF5DEB3,
      roughness: 0.6,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = stemHeight / 2;
    stem.castShadow = true;
    group.add(stem);
    
    // Gills (underside of cap)
    const gillCount = 20;
    const gillMaterial = new THREE.MeshStandardMaterial({
      color: 0xD2B48C,
      roughness: 0.8,
    });
    
    for (let i = 0; i < gillCount; i++) {
      const angle = (Math.PI * 2 / gillCount) * i;
      const gillGeometry = new THREE.BoxGeometry(0.02, 0.05, capRadius * 0.8);
      const gill = new THREE.Mesh(gillGeometry, gillMaterial);
      gill.position.set(
        Math.cos(angle) * capRadius * 0.5,
        stemHeight - 0.03,
        Math.sin(angle) * capRadius * 0.5
      );
      gill.rotation.y = angle;
      group.add(gill);
    }
  }

  private generateShiitakeMushroom(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const capRadius = params.width! * 0.6;
    const stemHeight = params.height! * 0.4;
    const stemRadius = params.trunkThickness! * 1.2;
    
    // Flat cap
    const capGeometry = new THREE.SphereGeometry(capRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.8,
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = stemHeight + capRadius * 0.3;
    cap.castShadow = true;
    group.add(cap);
    
    // Thick stem
    const stemGeometry = new THREE.CylinderGeometry(
      stemRadius,
      stemRadius * 1.1,
      stemHeight,
      8
    );
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0xD2B48C,
      roughness: 0.7,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = stemHeight / 2;
    stem.castShadow = true;
    group.add(stem);
  }

  private generateMorelMushroom(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const totalHeight = params.height!;
    const capHeight = totalHeight * 0.6;
    const stemHeight = totalHeight * 0.4;
    
    // Honeycomb cap
    const capGeometry = new THREE.ConeGeometry(
      params.width! * 0.4,
      capHeight,
      8
    );
    
    // Add honeycomb texture via vertex displacement
    const positions = capGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const noise = Math.sin(positions[i] * 20) * Math.cos(positions[i + 1] * 20) * 0.02;
      positions[i] += noise;
      positions[i + 1] += noise;
      positions[i + 2] += noise;
    }
    
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.9,
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = stemHeight + capHeight / 2;
    cap.castShadow = true;
    group.add(cap);
    
    // Hollow stem
    const stemGeometry = new THREE.CylinderGeometry(
      params.trunkThickness!,
      params.trunkThickness! * 1.2,
      stemHeight,
      8
    );
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0xF5DEB3,
      roughness: 0.6,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = stemHeight / 2;
    stem.castShadow = true;
    group.add(stem);
  }

  private generateChanterelleMushroom(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const totalHeight = params.height!;
    
    // Funnel-shaped cap that merges with stem
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(params.width! * 0.3, totalHeight * 0.3, params.width! * 0.6, totalHeight * 0.7);
    shape.quadraticCurveTo(params.width! * 0.4, totalHeight * 0.9, 0, totalHeight);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.LatheGeometry(shape.getPoints(), 16);
    
    const material = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      roughness: 0.7,
    });
    
    const mushroom = new THREE.Mesh(geometry, material);
    mushroom.castShadow = true;
    group.add(mushroom);
  }

  private generateFlyAgaricMushroom(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const capRadius = params.width! * 0.6;
    const stemHeight = params.height! * 0.6;
    const stemRadius = params.trunkThickness!;
    
    // Red cap with white spots
    const capGeometry = new THREE.SphereGeometry(capRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.5);
    const capMaterial = new THREE.MeshStandardMaterial({
      color: 0xDC143C,
      roughness: 0.6,
    });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = stemHeight;
    cap.castShadow = true;
    group.add(cap);
    
    // White spots on cap
    const spotCount = 8;
    const spotMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.8,
    });
    
    for (let i = 0; i < spotCount; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = rng() * Math.PI / 4;
      const spotRadius = 0.05 + rng() * 0.05;
      
      const spotGeometry = new THREE.SphereGeometry(spotRadius, 8, 8);
      const spot = new THREE.Mesh(spotGeometry, spotMaterial);
      
      spot.position.set(
        capRadius * 0.8 * Math.sin(phi) * Math.cos(theta),
        stemHeight + capRadius * 0.9 * Math.cos(phi),
        capRadius * 0.8 * Math.sin(phi) * Math.sin(theta)
      );
      
      group.add(spot);
    }
    
    // Stem with ring
    const stemGeometry = new THREE.CylinderGeometry(
      stemRadius * 0.8,
      stemRadius,
      stemHeight,
      8
    );
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFF0,
      roughness: 0.5,
    });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = stemHeight / 2;
    stem.castShadow = true;
    group.add(stem);
    
    // Ring (annulus)
    const ringGeometry = new THREE.TorusGeometry(stemRadius * 1.3, 0.02, 8, 16);
    const ring = new THREE.Mesh(ringGeometry, stemMaterial);
    ring.position.y = stemHeight * 0.7;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
}

/**
 * Leaf Generator - Individual leaf types for scattering
 */
export class LeafGenerator extends BasePlantGenerator {
  static readonly TYPES = ['broadleaf', 'pine', 'ginkgo', 'maple', 'oak', 'palm'] as const;

  generate(params: PlantParams & {
    leafType?: typeof LeafGenerator.TYPES[number];
  }): THREE.Group {
    const validatedParams = this.validateParams(params);
    const rng = this.getRng(validatedParams.seed);
    
    const leafType = params.leafType || LeafGenerator.TYPES[Math.floor(rng() * LeafGenerator.TYPES.length)];
    
    const leaf = new THREE.Group();
    
    switch (leafType) {
      case 'broadleaf':
        this.generateBroadleaf(leaf, validatedParams, rng);
        break;
      case 'pine':
        this.generatePineNeedle(leaf, validatedParams, rng);
        break;
      case 'ginkgo':
        this.generateGinkgoLeaf(leaf, validatedParams, rng);
        break;
      case 'maple':
        this.generateMapleLeaf(leaf, validatedParams, rng);
        break;
      case 'oak':
        this.generateOakLeaf(leaf, validatedParams, rng);
        break;
      case 'palm':
        this.generatePalmFrond(leaf, validatedParams, rng);
        break;
    }
    
    // Add semantic tags
    this.addSemanticTags(leaf, {
      category: 'plant',
      subcategory: 'leaf',
      leafType,
      size: validatedParams.leafSize!,
    });
    
    return leaf;
  }

  private generateBroadleaf(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const shape = new THREE.Shape();
    const size = params.leafSize!;
    
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(size * 0.5, -size * 0.3, size, 0);
    shape.quadraticCurveTo(size * 0.5, size * 0.3, 0, size);
    shape.quadraticCurveTo(-size * 0.5, size * 0.3, -size, 0);
    shape.quadraticCurveTo(-size * 0.5, -size * 0.3, 0, 0);
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = this.getLeafMaterial('green', rng);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  private generatePineNeedle(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const needleLength = params.leafSize! * 3;
    const needleRadius = 0.01;
    
    const geometry = new THREE.CylinderGeometry(
      needleRadius,
      needleRadius,
      needleLength,
      6
    );
    
    const material = this.getLeafMaterial('darkGreen', rng);
    
    const needle = new THREE.Mesh(geometry, material);
    needle.rotation.x = Math.PI / 2;
    needle.castShadow = true;
    group.add(needle);
  }

  private generateGinkgoLeaf(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const shape = new THREE.Shape();
    const size = params.leafSize!;
    
    // Fan-shaped with wavy edge
    shape.moveTo(0, 0);
    
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const angle = -Math.PI / 2 + t * Math.PI;
      const radius = size * (0.8 + 0.2 * Math.sin(t * Math.PI * 3));
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius + size * 0.5);
    }
    
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = this.getLeafMaterial('yellowGreen', rng);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);
  }

  private generateMapleLeaf(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const shape = new THREE.Shape();
    const size = params.leafSize!;
    
    // Star-shaped maple leaf
    const points = 5;
    const outerRadius = size;
    const innerRadius = size * 0.4;
    
    for (let i = 0; i <= points * 2; i++) {
      const angle = (Math.PI * 2 / (points * 2)) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = this.getLeafMaterial('red', rng);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);
  }

  private generateOakLeaf(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const shape = new THREE.Shape();
    const size = params.leafSize!;
    
    // Lobed oak leaf
    shape.moveTo(0, 0);
    
    const lobes = 5;
    for (let i = 0; i <= lobes; i++) {
      const t = i / lobes;
      const x = size * (t * 2 - 1);
      const y = Math.sin(t * Math.PI) * size * 0.5 + (i === 0 || i === lobes ? 0 : size * 0.2);
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = this.getLeafMaterial('green', rng);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);
  }

  private generatePalmFrond(
    group: THREE.Group,
    params: PlantParams,
    rng: () => number
  ): void {
    const frondLength = params.leafSize! * 4;
    const frondWidth = params.leafSize! * 0.5;
    
    // Long narrow frond
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(frondWidth / 2, frondLength * 0.3);
    shape.lineTo(0, frondLength);
    shape.lineTo(-frondWidth / 2, frondLength * 0.3);
    shape.lineTo(0, 0);
    
    const geometry = new THREE.ShapeGeometry(shape);
    const material = this.getLeafMaterial('green', rng);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);
  }
}

// Export all plant generators
export const plantGenerators = {
  TreeGenerator,
  CactusGenerator,
  SmallPlantGenerator,
  MushroomGenerator,
  LeafGenerator,
};

export type { PlantParams };
