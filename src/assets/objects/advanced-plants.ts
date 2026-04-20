/**
 * Advanced Plant Generators - Phase 3D
 * Corals, Monocots, Tropical Plants, and Climbing Plants
 * 
 * Based on InfiniGen's procedural plant generation system
 */

import * as THREE from 'three';
import { BaseAssetGenerator, AssetOptions, LODLevel } from './base-generator';
import { generateSeed, seededRandom } from '../../utils/random-utils';
import { createMaterialZones } from '../../materials/material-zones';

// ============================================================================
// CORAL GENERATORS
// ============================================================================

export interface CoralOptions extends AssetOptions {
  coralType: 'elkhorn' | 'fan' | 'star' | 'tube' | 'brain' | 'fire';
  size: number;
  branchCount: number;
  branchLength: number;
  branchThickness: number;
  complexity: number;
  colorVariation: number;
  polypDensity: number;
  growthPattern: 'radial' | 'planar' | 'columnar' | 'encrusting';
}

export class CoralGenerator extends BaseAssetGenerator<CoralOptions> {
  protected readonly defaultOptions: CoralOptions = {
    coralType: 'elkhorn',
    size: 1.0,
    branchCount: 8,
    branchLength: 0.5,
    branchThickness: 0.08,
    complexity: 3,
    colorVariation: 0.15,
    polypDensity: 0.3,
    growthPattern: 'radial',
    seed: Math.random(),
    lodLevels: [0.5, 0.25, 0.1],
    generateCollision: true,
    semanticTags: ['coral', 'underwater', 'organic'],
  };

  generate(options?: Partial<CoralOptions>): THREE.Group {
    const opts = { ...this.defaultOptions, ...options };
    const seed = opts.seed ?? generateSeed();
    const group = new THREE.Group();
    
    // Set semantic tags
    this.setSemanticTags(group, [
      'coral',
      opts.coralType,
      opts.growthPattern,
      'underwater',
      'marine-life'
    ]);

    switch (opts.coralType) {
      case 'elkhorn':
        this.generateElkhornCoral(group, opts, seed);
        break;
      case 'fan':
        this.generateFanCoral(group, opts, seed);
        break;
      case 'star':
        this.generateStarCoral(group, opts, seed);
        break;
      case 'tube':
        this.generateTubeCoral(group, opts, seed);
        break;
      case 'brain':
        this.generateBrainCoral(group, opts, seed);
        break;
      case 'fire':
        this.generateFireCoral(group, opts, seed);
        break;
    }

    // Generate LODs
    this.generateLODs(group, opts);

    // Generate collision geometry
    if (opts.generateCollision) {
      this.generateCollisionGeometry(group, opts);
    }

    return group;
  }

  private generateElkhornCoral(group: THREE.Group, opts: CoralOptions, seed: number): void {
    const rng = seededRandom(seed);
    const branches: THREE.Vector3[] = [];

    // Generate main branches with antler-like pattern
    for (let i = 0; i < opts.branchCount; i++) {
      const angle = rng() * Math.PI * 2;
      const height = rng() * opts.size * 0.6;
      const radius = rng() * opts.size * 0.4;
      
      branches.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      ));
    }

    // Create branched structure
    const branchGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    for (const branch of branches) {
      // Main branch
      this.createTaperedBranch(
        positions, normals, uvs,
        new THREE.Vector3(0, 0, 0),
        branch,
        opts.branchThickness,
        opts.branchThickness * 0.4,
        rng,
        opts.complexity
      );

      // Secondary branches
      const numSecondary = Math.floor(rng() * 3) + 2;
      for (let j = 0; j < numSecondary; j++) {
        const secondaryAngle = rng() * Math.PI * 2;
        const secondaryLength = rng() * opts.branchLength * 0.6;
        const startPoint = branch.clone().lerp(new THREE.Vector3(0, 0, 0), rng() * 0.5 + 0.3);
        
        const endPoint = new THREE.Vector3(
          startPoint.x + Math.cos(secondaryAngle) * secondaryLength,
          startPoint.y + rng() * secondaryLength * 0.5,
          startPoint.z + Math.sin(secondaryAngle) * secondaryLength
        );

        this.createTaperedBranch(
          positions, normals, uvs,
          startPoint,
          endPoint,
          opts.branchThickness * 0.6,
          opts.branchThickness * 0.2,
          rng,
          opts.complexity - 1
        );
      }
    }

    branchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    branchGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    branchGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    branchGeometry.computeVertexNormals();

    const material = this.createCoralMaterial(opts, 'elkhorn');
    const mesh = new THREE.Mesh(branchGeometry, material);
    group.add(mesh);
  }

  private generateFanCoral(group: THREE.Group, opts: CoralOptions, seed: number): void {
    const rng = seededRandom(seed);
    const fanGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create fan-shaped lattice structure
    const fanWidth = opts.size * 0.8;
    const fanHeight = opts.size;
    const resolution = Math.floor(opts.complexity * 8);

    // Vertical ribs
    for (let i = 0; i <= resolution; i++) {
      const t = i / resolution;
      const x = (t - 0.5) * fanWidth;
      const curve = Math.sin(t * Math.PI) * fanWidth * 0.2;
      
      for (let j = 0; j < resolution; j++) {
        const u = j / resolution;
        const y = u * fanHeight;
        const thickness = opts.branchThickness * (1 - u * 0.5);
        
        // Add lattice connections
        if (i % 2 === 0 && j % 2 === 0) {
          const nextX = ((i + 1) / resolution - 0.5) * fanWidth;
          const nextCurve = Math.sin((i + 1) / resolution * Math.PI) * fanWidth * 0.2;
          
          this.createLatticeConnection(
            positions, normals, uvs,
            new THREE.Vector3(x + curve, y, 0),
            new THREE.Vector3(nextX + nextCurve, y, 0),
            thickness,
            rng
          );
        }
      }
    }

    fanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fanGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    fanGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    fanGeometry.computeVertexNormals();

    const material = this.createCoralMaterial(opts, 'fan');
    const mesh = new THREE.Mesh(fanGeometry, material);
    group.add(mesh);
  }

  private generateStarCoral(group: THREE.Group, opts: CoralOptions, seed: number): void {
    const rng = seededRandom(seed);
    const starGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create star-shaped polyps in clusters
    const numClusters = Math.floor(opts.branchCount * 1.5);
    const polypSize = opts.branchThickness * 2;

    for (let i = 0; i < numClusters; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = rng() * opts.size * 0.5;
      const height = rng() * opts.size * 0.3;
      
      const centerX = Math.cos(angle) * radius;
      const centerZ = Math.sin(angle) * radius;
      const centerY = height;

      // Create star polyp with 5-8 arms
      const numArms = Math.floor(rng() * 4) + 5;
      for (let arm = 0; arm < numArms; arm++) {
        const armAngle = (arm / numArms) * Math.PI * 2;
        const armLength = polypSize * (0.5 + rng() * 0.5);
        
        const endPoint = new THREE.Vector3(
          centerX + Math.cos(armAngle) * armLength,
          centerY + rng() * polypSize * 0.3,
          centerZ + Math.sin(armAngle) * armLength
        );

        this.createPolyp(
          positions, normals, uvs,
          new THREE.Vector3(centerX, centerY, centerZ),
          endPoint,
          polypSize * 0.3,
          rng
        );
      }
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    starGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    starGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    starGeometry.computeVertexNormals();

    const material = this.createCoralMaterial(opts, 'star');
    const mesh = new THREE.Mesh(starGeometry, material);
    group.add(mesh);
  }

  private generateTubeCoral(group: THREE.Group, opts: CoralOptions, seed: number): void {
    const rng = seededRandom(seed);
    const tubeGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create vertical tube structures
    const numTubes = opts.branchCount;
    const tubeRadius = opts.branchThickness;
    const tubeHeight = opts.size / numTubes * 2;

    for (let i = 0; i < numTubes; i++) {
      const angle = (i / numTubes) * Math.PI * 2;
      const radius = opts.size * 0.3 * (0.5 + rng() * 0.5);
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = tubeHeight * (0.7 + rng() * 0.6);

      // Create tube with flared opening
      this.createTube(
        positions, normals, uvs,
        new THREE.Vector3(x, 0, z),
        tubeRadius,
        tubeRadius * 1.3,
        height,
        rng,
        opts.complexity
      );
    }

    tubeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    tubeGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    tubeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tubeGeometry.computeVertexNormals();

    const material = this.createCoralMaterial(opts, 'tube');
    const mesh = new THREE.Mesh(tubeGeometry, material);
    group.add(mesh);
  }

  private generateBrainCoral(group: THREE.Group, opts: CoralOptions, seed: number): void {
    const rng = seededRandom(seed);
    const brainGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create dome shape with convoluted surface
    const domeRadius = opts.size * 0.5;
    const resolution = opts.complexity * 12;
    const grooveDepth = opts.branchThickness * 0.5;

    for (let i = 0; i < resolution; i++) {
      const theta = (i / resolution) * Math.PI;
      for (let j = 0; j < resolution; j++) {
        const phi = (j / resolution) * Math.PI * 2;
        
        // Add convolution noise
        const noise = Math.sin(theta * 20 + phi * 10) * grooveDepth;
        const radius = domeRadius + noise;

        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.cos(theta);
        const z = radius * Math.sin(theta) * Math.sin(phi);

        positions.push(x, y, z);
        
        // Normal points outward from center
        const normal = new THREE.Vector3(x, y, z).normalize();
        normals.push(normal.x, normal.y, normal.z);
        
        uvs.push(j / resolution, i / resolution);
      }
    }

    // Create indices for proper mesh topology
    const indices: number[] = [];
    for (let i = 0; i < resolution - 1; i++) {
      for (let j = 0; j < resolution - 1; j++) {
        const a = i * resolution + j;
        const b = a + 1;
        const c = (i + 1) * resolution + j;
        const d = c + 1;

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    brainGeometry.setIndex(indices);
    brainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    brainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    brainGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    brainGeometry.computeVertexNormals();

    const material = this.createCoralMaterial(opts, 'brain');
    const mesh = new THREE.Mesh(brainGeometry, material);
    group.add(mesh);
  }

  private generateFireCoral(group: THREE.Group, opts: CoralOptions, seed: number): void {
    const rng = seededRandom(seed);
    const fireGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create branching, flame-like structures
    const numBranches = opts.branchCount * 2;
    
    for (let i = 0; i < numBranches; i++) {
      const baseAngle = (i / numBranches) * Math.PI * 2;
      const baseRadius = rng() * opts.size * 0.3;
      
      const startPoint = new THREE.Vector3(
        Math.cos(baseAngle) * baseRadius,
        0,
        Math.sin(baseAngle) * baseRadius
      );

      // Create upward curving branch
      const height = opts.size * (0.5 + rng() * 0.5);
      const curves = Math.floor(rng() * 3) + 2;
      
      let currentPoint = startPoint.clone();
      let currentThickness = opts.branchThickness;
      
      for (let c = 0; c < curves; c++) {
        const curveAngle = rng() * Math.PI * 2;
        const curveLength = height / curves * (0.8 + rng() * 0.4);
        const curveUp = rng() * height / curves * 0.5;
        
        const endPoint = new THREE.Vector3(
          currentPoint.x + Math.cos(curveAngle) * curveLength,
          currentPoint.y + curveUp,
          currentPoint.z + Math.sin(curveAngle) * curveLength
        );

        this.createFlameBranch(
          positions, normals, uvs,
          currentPoint,
          endPoint,
          currentThickness,
          currentThickness * 0.5,
          rng
        );

        currentPoint = endPoint;
        currentThickness *= 0.7;
      }
    }

    fireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    fireGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    fireGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    fireGeometry.computeVertexNormals();

    const material = this.createCoralMaterial(opts, 'fire');
    const mesh = new THREE.Mesh(fireGeometry, material);
    group.add(mesh);
  }

  private createTaperedBranch(
    positions: number[],
    normals: number[],
    uvs: number[],
    start: THREE.Vector3,
    end: THREE.Vector3,
    startRadius: number,
    endRadius: number,
    rng: () => number,
    segments: number
  ): void {
    const direction = end.clone().sub(start);
    const length = direction.length();
    direction.normalize();

    const radialSegments = 8;
    const tubularSegments = Math.max(segments, 4);

    for (let i = 0; i <= tubularSegments; i++) {
      const t = i / tubularSegments;
      const radius = startRadius + (endRadius - startRadius) * t;
      const point = start.clone().add(direction.clone().multiplyScalar(t * length));

      // Add some noise for organic look
      const noise = rng() * radius * 0.2;
      point.x += (rng() - 0.5) * noise;
      point.z += (rng() - 0.5) * noise;

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        // Create perpendicular vectors
        const tangent = direction.clone();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

        const vertex = point.clone()
          .add(normal.multiplyScalar(x))
          .add(binormal.multiplyScalar(y));

        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(j / radialSegments, t);
      }
    }

    // Generate indices
    for (let i = 0; i < tubularSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (radialSegments + 1) + j;
        const d = c + 1;

        positions.push(
          positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
          positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
          positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]
        );
        positions.push(
          positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
          positions[d * 3], positions[d * 3 + 1], positions[d * 3 + 2],
          positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]
        );
      }
    }
  }

  private createCoralMaterial(opts: CoralOptions, type: string): THREE.Material {
    const baseColors: Record<string, THREE.Color> = {
      elkhorn: new THREE.Color(0xD4A574),
      fan: new THREE.Color(0xFF6B6B),
      star: new THREE.Color(0x4ECDC4),
      tube: new THREE.Color(0x95E1D3),
      brain: new THREE.Color(0xF5DEB3),
      fire: new THREE.Color(0xFF4500),
    };

    const baseColor = baseColors[type] || new THREE.Color(0xFFFFFF);
    
    // Add variation
    const variation = opts.colorVariation;
    baseColor.r += (Math.random() - 0.5) * variation;
    baseColor.g += (Math.random() - 0.5) * variation;
    baseColor.b += (Math.random() - 0.5) * variation;

    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.7,
      metalness: 0.1,
      bumpScale: 0.02,
    });
  }

  private createLatticeConnection(
    positions: number[],
    normals: number[],
    uvs: number[],
    start: THREE.Vector3,
    end: THREE.Vector3,
    thickness: number,
    rng: () => number
  ): void {
    // Simplified lattice connection
    const mid = start.clone().lerp(end, 0.5);
    mid.x += (rng() - 0.5) * thickness;
    mid.y += (rng() - 0.5) * thickness;
    mid.z += (rng() - 0.5) * thickness;

    positions.push(
      start.x, start.y, start.z,
      mid.x, mid.y, mid.z,
      end.x, end.y, end.z
    );

    const normal = new THREE.Vector3(0, 1, 0);
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
    uvs.push(0, 0, 0.5, 0.5, 1, 0);
  }

  private createPolyp(
    positions: number[],
    normals: number[],
    uvs: number[],
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    rng: () => number
  ): void {
    // Simple polyp cylinder
    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      positions.push(
        start.x + x, start.y, start.z + z,
        end.x + x * 0.8, end.y, end.z + z * 0.8
      );
      
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(i / segments, 0, i / segments, 1);
    }
  }

  private createTube(
    positions: number[],
    normals: number[],
    uvs: number[],
    center: THREE.Vector3,
    bottomRadius: number,
    topRadius: number,
    height: number,
    rng: () => number,
    segments: number
  ): void {
    const radialSegments = 12;
    const heightSegments = Math.max(segments, 4);

    for (let i = 0; i <= heightSegments; i++) {
      const t = i / heightSegments;
      const y = t * height;
      const radius = bottomRadius + (topRadius - bottomRadius) * t;

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        positions.push(center.x + x, y, center.z + z);
        normals.push(Math.cos(angle), 0, Math.sin(angle));
        uvs.push(j / radialSegments, t);
      }
    }
  }

  private createFlameBranch(
    positions: number[],
    normals: number[],
    uvs: number[],
    start: THREE.Vector3,
    end: THREE.Vector3,
    startRadius: number,
    endRadius: number,
    rng: () => number
  ): void {
    // Flame-like curved branch
    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = start.clone().lerp(end, t);
      const radius = startRadius + (endRadius - startRadius) * t;

      // Add flame-like waviness
      const wave = Math.sin(t * Math.PI * 4) * radius * 0.3;
      point.x += wave * (rng() - 0.5);
      point.z += wave * (rng() - 0.5);

      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        positions.push(point.x + x, point.y, point.z + z);
        normals.push(Math.cos(angle), 0, Math.sin(angle));
        uvs.push(j / 6, t);
      }
    }
  }
}

// ============================================================================
// MONOCOT GENERATORS
// ============================================================================

export interface MonocotOptions extends AssetOptions {
  monocotType: 'agave' | 'banana' | 'kelp' | 'palm' | 'yucca' | 'dracaena';
  size: number;
  leafCount: number;
  leafLength: number;
  leafWidth: number;
  curvature: number;
  trunkHeight: number;
  trunkThickness: number;
}

export class MonocotGenerator extends BaseAssetGenerator<MonocotOptions> {
  protected readonly defaultOptions: MonocotOptions = {
    monocotType: 'palm',
    size: 2.0,
    leafCount: 12,
    leafLength: 1.5,
    leafWidth: 0.3,
    curvature: 0.3,
    trunkHeight: 1.0,
    trunkThickness: 0.15,
    seed: Math.random(),
    lodLevels: [0.5, 0.25, 0.1],
    generateCollision: true,
    semanticTags: ['monocot', 'plant', 'tropical'],
  };

  generate(options?: Partial<MonocotOptions>): THREE.Group {
    const opts = { ...this.defaultOptions, ...options };
    const seed = opts.seed ?? generateSeed();
    const group = new THREE.Group();

    this.setSemanticTags(group, [
      'monocot',
      opts.monocotType,
      'plant',
      'tropical'
    ]);

    switch (opts.monocotType) {
      case 'agave':
        this.generateAgave(group, opts, seed);
        break;
      case 'banana':
        this.generateBanana(group, opts, seed);
        break;
      case 'kelp':
        this.generateKelp(group, opts, seed);
        break;
      case 'palm':
        this.generatePalm(group, opts, seed);
        break;
      case 'yucca':
        this.generateYucca(group, opts, seed);
        break;
      case 'dracaena':
        this.generateDracaena(group, opts, seed);
        break;
    }

    this.generateLODs(group, opts);
    if (opts.generateCollision) {
      this.generateCollisionGeometry(group, opts);
    }

    return group;
  }

  private generateAgave(group: THREE.Group, opts: MonocotOptions, seed: number): void {
    const rng = seededRandom(seed);
    const rosetteGroup = new THREE.Group();

    // Agave has thick, fleshy leaves in a rosette pattern
    for (let i = 0; i < opts.leafCount; i++) {
      const angle = (i / opts.leafCount) * Math.PI * 2;
      const leaf = this.createAgaveLeaf(opts, rng);
      leaf.rotation.y = angle;
      leaf.rotation.x = Math.PI / 6; // Tilt outward
      rosetteGroup.add(leaf);
    }

    group.add(rosetteGroup);
  }

  private generateBanana(group: THREE.Group, opts: MonocotOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Create pseudostem (trunk)
    const trunk = this.createTrunk(opts.trunkHeight, opts.trunkThickness, rng);
    group.add(trunk);

    // Large banana leaves at top
    for (let i = 0; i < opts.leafCount; i++) {
      const angle = (i / opts.leafCount) * Math.PI * 2 + rng() * 0.3;
      const leaf = this.createBananaLeaf(opts, rng);
      leaf.position.y = opts.trunkHeight * 0.8;
      leaf.rotation.y = angle;
      leaf.rotation.x = Math.PI / 4 + rng() * 0.2;
      group.add(leaf);
    }
  }

  private generateKelp(group: THREE.Group, opts: MonocotOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Kelp has long, flowing fronds
    for (let i = 0; i < opts.leafCount; i++) {
      const frond = this.createKelpFrond(opts, rng);
      frond.position.x = (rng() - 0.5) * opts.size * 0.3;
      frond.position.z = (rng() - 0.5) * opts.size * 0.3;
      group.add(frond);
    }
  }

  private generatePalm(group: THREE.Group, opts: MonocotOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Palm trunk
    const trunk = this.createPalmTrunk(opts.trunkHeight, opts.trunkThickness, rng);
    group.add(trunk);

    // Palm fronds
    for (let i = 0; i < opts.leafCount; i++) {
      const angle = (i / opts.leafCount) * Math.PI * 2;
      const frond = this.createPalmFrond(opts, rng);
      frond.position.y = opts.trunkHeight;
      frond.rotation.y = angle;
      frond.rotation.x = Math.PI / 3;
      group.add(frond);
    }
  }

  private generateYucca(group: THREE.Group, opts: MonocotOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Yucca trunk
    const trunk = this.createTrunk(opts.trunkHeight * 0.5, opts.trunkThickness, rng);
    group.add(trunk);

    // Stiff, sword-like leaves
    for (let i = 0; i < opts.leafCount; i++) {
      const angle = (i / opts.leafCount) * Math.PI * 2;
      const leaf = this.createYuccaLeaf(opts, rng);
      leaf.position.y = opts.trunkHeight * 0.8;
      leaf.rotation.y = angle;
      leaf.rotation.x = Math.PI / 6;
      group.add(leaf);
    }
  }

  private generateDracaena(group: THREE.Group, opts: MonocotOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Dracaena trunk with branching
    const trunk = this.createBranchingTrunk(opts, rng);
    group.add(trunk);

    // Long, narrow leaves at branch ends
    for (let i = 0; i < opts.leafCount; i++) {
      const angle = (i / opts.leafCount) * Math.PI * 2;
      const leaf = this.createDracaenaLeaf(opts, rng);
      leaf.position.y = opts.trunkHeight;
      leaf.rotation.y = angle;
      leaf.rotation.x = Math.PI / 4;
      group.add(leaf);
    }
  }

  private createAgaveLeaf(opts: MonocotOptions, rng: () => number): THREE.Mesh {
    const leafLength = opts.leafLength * opts.size;
    const leafWidth = opts.leafWidth * opts.size;
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(leafLength * 0.3, leafWidth * 0.8, leafLength, 0);
    shape.quadraticCurveTo(leafLength * 0.3, -leafWidth * 0.8, 0, 0);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: leafWidth * 0.3,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 2,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6B8E23,
      roughness: 0.6,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private createBananaLeaf(opts: MonocotOptions, rng: () => number): THREE.Mesh {
    const leafLength = opts.leafLength * opts.size * 1.5;
    const leafWidth = opts.leafWidth * opts.size * 2;

    const geometry = new THREE.PlaneGeometry(leafLength, leafWidth, 16, 8);
    const positions = geometry.attributes.position.array;

    // Add curvature and waviness
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const t = (x + leafLength / 2) / leafLength;
      
      // Curve along length
      positions[i + 1] += Math.sin(t * Math.PI) * leafLength * opts.curvature;
      
      // Wavy edges
      if (Math.abs(positions[i + 2]) > leafWidth * 0.8) {
        positions[i + 1] += Math.sin(t * Math.PI * 8) * 0.05;
      }
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x228B22,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  private createKelpFrond(opts: MonocotOptions, rng: () => number): THREE.Mesh {
    const frondLength = opts.leafLength * opts.size * 2;
    const frondWidth = opts.leafWidth * opts.size;

    const geometry = new THREE.PlaneGeometry(frondWidth, frondLength, 8, 16);
    const positions = geometry.attributes.position.array;

    // Flowing underwater motion
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const t = y / frondLength;
      
      positions[i] += Math.sin(t * Math.PI * 3) * frondWidth * opts.curvature;
      positions[i + 2] += Math.cos(t * Math.PI * 2) * frondWidth * opts.curvature;
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x556B2F,
      roughness: 0.7,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private createPalmTrunk(height: number, thickness: number, rng: () => number): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(
      thickness * 0.8,
      thickness,
      height,
      12,
      8
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.9,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createPalmFrond(opts: MonocotOptions, rng: () => number): THREE.Mesh {
    const frondLength = opts.leafLength * opts.size;
    
    // Create feather-like palm frond
    const rachisLength = frondLength * 0.8;
    const pinnaeCount = 20;

    const group = new THREE.Group();

    // Central rachis
    const rachis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, rachisLength, 6),
      new THREE.MeshStandardMaterial({ color: 0x654321 })
    );
    rachis.rotation.x = Math.PI / 2;
    group.add(rachis);

    // Pinnae (leaflets)
    for (let i = 0; i < pinnaeCount; i++) {
      const t = i / pinnaeCount;
      const pinnaLength = opts.leafWidth * opts.size * (0.5 + t * 0.5);
      const position = t * rachisLength - rachisLength / 2;

      const pinna = new THREE.Mesh(
        new THREE.BoxGeometry(pinnaLength, 0.02, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x228B22 })
      );
      pinna.position.set(position, 0, 0.03);
      pinna.rotation.z = -Math.PI / 6 - t * Math.PI / 6;
      group.add(pinna);

      // Mirror on other side
      const pinna2 = pinna.clone();
      pinna2.position.z = -0.03;
      pinna2.rotation.z = Math.PI / 6 + t * Math.PI / 6;
      group.add(pinna2);
    }

    return new THREE.Mesh(
      this.mergeGeometries(group),
      new THREE.MeshStandardMaterial({ color: 0x228B22 })
    );
  }

  private createYuccaLeaf(opts: MonocotOptions, rng: () => number): THREE.Mesh {
    const leafLength = opts.leafLength * opts.size * 0.8;
    const leafWidth = opts.leafWidth * opts.size * 0.5;

    const geometry = new THREE.ConeGeometry(leafWidth, leafLength, 4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8FBC8F,
      roughness: 0.5,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private createDracaenaLeaf(opts: MonocotOptions, rng: () => number): THREE.Mesh {
    const leafLength = opts.leafLength * opts.size;
    const leafWidth = opts.leafWidth * opts.size * 0.3;

    const geometry = new THREE.PlaneGeometry(leafWidth, leafLength, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2E8B57,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private createTrunk(height: number, thickness: number, rng: () => number): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(
      thickness * 0.9,
      thickness,
      height,
      8,
      4
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x654321,
      roughness: 0.8,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createBranchingTrunk(opts: MonocotOptions, rng: () => number): THREE.Group {
    const group = new THREE.Group();
    
    // Main trunk
    const mainTrunk = this.createTrunk(opts.trunkHeight * 0.6, opts.trunkThickness, rng);
    group.add(mainTrunk);

    // Branches
    const numBranches = 3;
    for (let i = 0; i < numBranches; i++) {
      const angle = (i / numBranches) * Math.PI * 2;
      const branch = this.createTrunk(
        opts.trunkHeight * 0.4,
        opts.trunkThickness * 0.6,
        rng
      );
      branch.position.y = opts.trunkHeight * 0.6;
      branch.position.x = Math.cos(angle) * opts.trunkThickness * 2;
      branch.position.z = Math.sin(angle) * opts.trunkThickness * 2;
      branch.rotation.z = Math.PI / 6;
      branch.rotation.y = angle;
      group.add(branch);
    }

    return group;
  }

  private mergeGeometries(group: THREE.Group): THREE.BufferGeometry {
    // Simplified merge - in production use BufferGeometryUtils
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometries.push(child.geometry);
      }
    });
    
    // Return first geometry as placeholder
    return geometries[0] || new THREE.PlaneGeometry();
  }
}

// ============================================================================
// TROPICAL PLANT GENERATORS
// ============================================================================

export interface TropicalPlantOptions extends AssetOptions {
  plantType: 'coconut_palm' | 'areca_palm' | 'bird_of_paradise' | 'heliconia' | 'ginger' | 'plumeria';
  size: number;
  trunkHeight: number;
  canopySpread: number;
  leafDensity: number;
  flowering: boolean;
}

export class TropicalPlantGenerator extends BaseAssetGenerator<TropicalPlantOptions> {
  protected readonly defaultOptions: TropicalPlantOptions = {
    plantType: 'coconut_palm',
    size: 3.0,
    trunkHeight: 2.0,
    canopySpread: 2.5,
    leafDensity: 0.7,
    flowering: false,
    seed: Math.random(),
    lodLevels: [0.5, 0.25, 0.1],
    generateCollision: true,
    semanticTags: ['tropical', 'plant', 'palm'],
  };

  generate(options?: Partial<TropicalPlantOptions>): THREE.Group {
    const opts = { ...this.defaultOptions, ...options };
    const seed = opts.seed ?? generateSeed();
    const group = new THREE.Group();

    this.setSemanticTags(group, [
      'tropical',
      opts.plantType,
      'plant',
      opts.flowering ? 'flowering' : 'non-flowering'
    ]);

    switch (opts.plantType) {
      case 'coconut_palm':
        this.generateCoconutPalm(group, opts, seed);
        break;
      case 'areca_palm':
        this.generateArecaPalm(group, opts, seed);
        break;
      case 'bird_of_paradise':
        this.generateBirdOfParadise(group, opts, seed);
        break;
      case 'heliconia':
        this.generateHeliconia(group, opts, seed);
        break;
      case 'ginger':
        this.generateGinger(group, opts, seed);
        break;
      case 'plumeria':
        this.generatePlumeria(group, opts, seed);
        break;
    }

    this.generateLODs(group, opts);
    if (opts.generateCollision) {
      this.generateCollisionGeometry(group, opts);
    }

    return group;
  }

  private generateCoconutPalm(group: THREE.Group, opts: TropicalPlantOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Tall, slender trunk with slight curve
    const trunk = this.createCurvedTrunk(opts.trunkHeight, 0.15 * opts.size, rng);
    group.add(trunk);

    // Coconut palm fronds
    const frondCount = Math.floor(opts.leafDensity * 15);
    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2 + rng() * 0.2;
      const frond = this.createCoconutFrond(opts, rng);
      frond.position.y = opts.trunkHeight;
      frond.rotation.y = angle;
      frond.rotation.x = Math.PI / 3 + rng() * 0.1;
      group.add(frond);
    }

    // Optional coconuts
    if (opts.size > 2.0) {
      this.addCoconuts(group, opts, rng);
    }
  }

  private generateArecaPalm(group: THREE.Group, opts: TropicalPlantOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Multiple bamboo-like stems
    const stemCount = 5;
    for (let i = 0; i < stemCount; i++) {
      const height = opts.trunkHeight * (0.6 + rng() * 0.4);
      const stem = this.createBambooStem(height, 0.08 * opts.size, rng);
      stem.position.x = (rng() - 0.5) * opts.canopySpread * 0.3;
      stem.position.z = (rng() - 0.5) * opts.canopySpread * 0.3;
      group.add(stem);
    }

    // Areca fronds
    const frondCount = Math.floor(opts.leafDensity * 20);
    for (let i = 0; i < frondCount; i++) {
      const frond = this.createArecaFrond(opts, rng);
      frond.position.y = opts.trunkHeight * (0.7 + rng() * 0.3);
      frond.rotation.y = rng() * Math.PI * 2;
      frond.rotation.x = Math.PI / 4;
      group.add(frond);
    }
  }

  private generateBirdOfParadise(group: THREE.Group, opts: TropicalPlantOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Short stems
    const stemHeight = opts.trunkHeight * 0.3;
    const stem = this.createTrunk(stemHeight, 0.05 * opts.size, rng);
    group.add(stem);

    // Large banana-like leaves
    const leafCount = Math.floor(opts.leafDensity * 8);
    for (let i = 0; i < leafCount; i++) {
      const leaf = this.createBirdOfParadiseLeaf(opts, rng);
      leaf.position.y = stemHeight * 0.5;
      leaf.rotation.y = (i / leafCount) * Math.PI * 2;
      leaf.rotation.x = Math.PI / 6;
      group.add(leaf);
    }

    // Flowers
    if (opts.flowering) {
      this.addBirdOfParadiseFlower(group, opts, rng);
    }
  }

  private generateHeliconia(group: THREE.Group, opts: TropicalPlantOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Heliconia stem
    const stem = this.createTrunk(opts.trunkHeight * 0.5, 0.04 * opts.size, rng);
    group.add(stem);

    // Large leaves
    const leafCount = Math.floor(opts.leafDensity * 6);
    for (let i = 0; i < leafCount; i++) {
      const leaf = this.createHeliconiaLeaf(opts, rng);
      leaf.position.y = opts.trunkHeight * 0.3 * (i / leafCount);
      leaf.rotation.y = (i / leafCount) * Math.PI * 2;
      leaf.rotation.x = Math.PI / 4;
      group.add(leaf);
    }

    // Hanging flower bracts
    if (opts.flowering) {
      this.addHeliconiaFlower(group, opts, rng);
    }
  }

  private generateGinger(group: THREE.Group, opts: TropicalPlantOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Ginger stalks
    const stalkCount = 8;
    for (let i = 0; i < stalkCount; i++) {
      const height = opts.trunkHeight * (0.5 + rng() * 0.5);
      const stalk = this.createTrunk(height, 0.03 * opts.size, rng);
      stalk.position.x = (rng() - 0.5) * opts.canopySpread * 0.2;
      stalk.position.z = (rng() - 0.5) * opts.canopySpread * 0.2;
      group.add(stalk);
    }

    // Lance-shaped leaves
    const leafCount = Math.floor(opts.leafDensity * 12);
    for (let i = 0; i < leafCount; i++) {
      const leaf = this.createGingerLeaf(opts, rng);
      leaf.position.y = opts.trunkHeight * 0.5;
      leaf.rotation.y = rng() * Math.PI * 2;
      leaf.rotation.x = Math.PI / 6;
      group.add(leaf);
    }

    // Flower cones
    if (opts.flowering) {
      this.addGingerFlower(group, opts, rng);
    }
  }

  private generatePlumeria(group: THREE.Group, opts: TropicalPlantOptions, seed: number): void {
    const rng = seededRandom(seed);

    // Branching structure
    const trunk = this.createBranchingTrunk(
      { ...opts, trunkHeight: opts.trunkHeight, trunkThickness: 0.1 },
      rng
    );
    group.add(trunk);

    // Clusters of leaves at branch ends
    const leafClusterCount = 10;
    for (let i = 0; i < leafClusterCount; i++) {
      const cluster = this.createPlumeriaLeafCluster(opts, rng);
      cluster.position.y = opts.trunkHeight * (0.5 + rng() * 0.5);
      cluster.rotation.y = rng() * Math.PI * 2;
      group.add(cluster);
    }

    // Fragrant flowers
    if (opts.flowering) {
      this.addPlumeriaFlowers(group, opts, rng);
    }
  }

  private createCurvedTrunk(height: number, radius: number, rng: () => number): THREE.Mesh {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3((rng() - 0.5) * height * 0.2, height * 0.5, (rng() - 0.5) * height * 0.2),
      new THREE.Vector3((rng() - 0.5) * height * 0.1, height, (rng() - 0.5) * height * 0.1)
    );

    const geometry = new THREE.TubeGeometry(curve, 8, radius, 8, false);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.9,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createCoconutFrond(opts: TropicalPlantOptions, rng: () => number): THREE.Mesh {
    // Similar to palm frond but longer and more curved
    return new THREE.Mesh(
      new THREE.PlaneGeometry(opts.canopySpread * 0.3, opts.trunkHeight * 0.8),
      new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide })
    );
  }

  private addCoconuts(group: THREE.Group, opts: TropicalPlantOptions, rng: () => number): void {
    const coconutCount = Math.floor(rng() * 6) + 3;
    for (let i = 0; i < coconutCount; i++) {
      const coconut = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 * opts.size, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
      );
      coconut.position.y = opts.trunkHeight - 0.2;
      coconut.position.x = (rng() - 0.5) * 0.3;
      coconut.position.z = (rng() - 0.5) * 0.3;
      group.add(coconut);
    }
  }

  private createBambooStem(height: number, radius: number, rng: () => number): THREE.Mesh {
    const segments = Math.floor(height * 4);
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 8, segments);
    
    // Add bamboo nodes
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const segmentIndex = Math.floor((y + height / 2) / (height / segments));
      if (segmentIndex % 2 === 0) {
        positions[i] *= 1.05;
        positions[i + 2] *= 1.05;
      }
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xC4A484,
      roughness: 0.6,
    });

    return new THREE.Mesh(geometry, material);
  }

  private createArecaFrond(opts: TropicalPlantOptions, rng: () => number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(opts.canopySpread * 0.2, opts.trunkHeight * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x32CD32, side: THREE.DoubleSide })
    );
  }

  private createBirdOfParadiseLeaf(opts: TropicalPlantOptions, rng: () => number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(opts.canopySpread * 0.3, opts.trunkHeight * 0.6),
      new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide })
    );
  }

  private addBirdOfParadiseFlower(group: THREE.Group, opts: TropicalPlantOptions, rng: () => number): void {
    const flower = new THREE.Group();
    
    // Orange sepals
    const sepal = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0xFF4500 })
    );
    flower.add(sepal);

    // Blue petals
    const petal = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.2, 4),
      new THREE.MeshStandardMaterial({ color: 0x4169E1 })
    );
    petal.position.y = 0.2;
    flower.add(petal);

    flower.position.y = opts.trunkHeight * 0.8;
    group.add(flower);
  }

  private createHeliconiaLeaf(opts: TropicalPlantOptions, rng: () => number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(opts.canopySpread * 0.25, opts.trunkHeight * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide })
    );
  }

  private addHeliconiaFlower(group: THREE.Group, opts: TropicalPlantOptions, rng: () => number): void {
    const flower = new THREE.Group();
    
    // Red bracts
    for (let i = 0; i < 5; i++) {
      const bract = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.05, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xDC143C })
      );
      bract.position.y = i * 0.08;
      bract.rotation.x = Math.PI / 6;
      flower.add(bract);
    }

    flower.position.y = opts.trunkHeight * 0.8;
    flower.rotation.x = Math.PI / 2;
    group.add(flower);
  }

  private createGingerLeaf(opts: TropicalPlantOptions, rng: () => number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.PlaneGeometry(opts.canopySpread * 0.15, opts.trunkHeight * 0.4),
      new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide })
    );
  }

  private addGingerFlower(group: THREE.Group, opts: TropicalPlantOptions, rng: () => number): void {
    const flower = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xFF69B4 })
    );
    flower.position.y = opts.trunkHeight * 0.7;
    group.add(flower);
  }

  private createPlumeriaLeafCluster(opts: TropicalPlantOptions, rng: () => number): THREE.Group {
    const cluster = new THREE.Group();
    const leafCount = 8;

    for (let i = 0; i < leafCount; i++) {
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide })
      );
      leaf.rotation.y = (i / leafCount) * Math.PI * 2;
      leaf.rotation.x = Math.PI / 6;
      cluster.add(leaf);
    }

    return cluster;
  }

  private addPlumeriaFlowers(group: THREE.Group, opts: TropicalPlantOptions, rng: () => number): void {
    const flowerCount = 5;
    for (let i = 0; i < flowerCount; i++) {
      const flower = new THREE.Group();
      
      // Five petals
      for (let p = 0; p < 5; p++) {
        const petal = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xFFFACD })
        );
        petal.position.x = Math.cos((p / 5) * Math.PI * 2) * 0.15;
        petal.position.z = Math.sin((p / 5) * Math.PI * 2) * 0.15;
        flower.add(petal);
      }

      // Yellow center
      const center = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xFFD700 })
      );
      flower.add(center);

      flower.position.y = opts.trunkHeight * (0.6 + rng() * 0.4);
      flower.position.x = (rng() - 0.5) * 0.5;
      flower.position.z = (rng() - 0.5) * 0.5;
      group.add(flower);
    }
  }
}

// Export all generators
export {
  CoralGenerator,
  MonocotGenerator,
  TropicalPlantGenerator,
};
