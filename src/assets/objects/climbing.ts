/**
 * Climbing Plants & Organic Scatters Generator
 * 
 * Procedural generation of climbing plants, vines, and organic scatter objects.
 * Includes ivy, vines, pine cones, pine needles, slime mold, and chopped trees.
 */

import {
  BufferGeometry,
  Vector3,
  MathUtils,
  CatmullRomCurve3,
  TubeGeometry,
  SphereGeometry,
  CylinderGeometry,
  ConeGeometry,
  BoxGeometry,
  Mesh,
  InstancedMesh,
  Matrix4,
  Color,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BaseAssetGenerator, AssetParams, LODLevel } from './base-generator';
import { GeometryUtils } from '../../core/geometry-utils';

/**
 * Parameters for climbing plant generation
 */
export interface ClimbingPlantParams extends AssetParams {
  /** Type of climbing plant */
  plantType: 'ivy' | 'vine' | 'creeper' | 'liana' | 'passion_vine';
  /** Length of the vine in meters */
  length: number;
  /** Thickness of main stem */
  stemThickness: number;
  /** Number of branches */
  branchCount: number;
  /** Leaf density (0-1) */
  leafDensity: number;
  /** Leaf size */
  leafSize: number;
  /** Curliness factor for tendrils */
  curliness: number;
  /** Growth direction bias */
  growthDirection: Vector3;
  /** Attachment points for climbing */
  attachmentPoints?: Vector3[];
  /** Surface normal for wall climbing */
  surfaceNormal?: Vector3;
}

/**
 * Parameters for organic scatter objects
 */
export interface OrganicScatterParams extends AssetParams {
  /** Type of scatter object */
  scatterType: 'pine_cone' | 'pine_needle' | 'acorn' | 'leaf_litter' | 'twig' | 'slime_mold';
  /** Scale variation */
  scaleVariation: number;
  /** Count for instanced rendering */
  count: number;
  /** Distribution radius */
  distributionRadius: number;
  /** Specific parameters based on type */
  coneLength?: number;
  coneWidth?: number;
  needleLength?: number;
  needleCount?: number;
  slimeSpread?: number;
  slimeBlobs?: number;
}

/**
 * Base class for climbing plant generators
 */
export class ClimbingPlantGenerator extends BaseAssetGenerator<ClimbingPlantParams> {
  protected readonly defaultParams: ClimbingPlantParams = {
    plantType: 'ivy',
    length: 2.0,
    stemThickness: 0.02,
    branchCount: 5,
    leafDensity: 0.3,
    leafSize: 0.05,
    curliness: 0.5,
    growthDirection: new Vector3(0, 1, 0),
    ...BaseAssetGenerator.defaultParams,
  };

  generate(params: Partial<ClimbingPlantParams>): Mesh {
    const finalParams = this.mergeParams(this.defaultParams, params);
    this.seedRandom(params.seed);

    let geometry: BufferGeometry;

    switch (finalParams.plantType) {
      case 'ivy':
        geometry = this.generateIvy(finalParams);
        break;
      case 'vine':
        geometry = this.generateVine(finalParams);
        break;
      case 'creeper':
        geometry = this.generateCreeper(finalParams);
        break;
      case 'liana':
        geometry = this.generateLiana(finalParams);
        break;
      case 'passion_vine':
        geometry = this.generatePassionVine(finalParams);
        break;
      default:
        geometry = this.generateIvy(finalParams);
    }

    const material = this.createPlantMaterial(params.seed);
    const mesh = new Mesh(geometry, material);
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      assetType: 'climbing_plant',
      plantType: finalParams.plantType,
      semanticTags: ['plant', 'climbing', 'vegetation', finalParams.plantType],
      lodLevels: this.generateLODLevels(geometry, params.lodDistance || 20),
      collisionGeometry: this.createCollisionGeometry(geometry),
    };

    return mesh;
  }

  /**
   * Generate ivy with characteristic lobed leaves and aerial roots
   */
  private generateIvy(params: ClimbingPlantParams): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    const mainStem = this.generateStemCurve(params.length, params.stemThickness, params.curliness, params.growthDirection);
    geometries.push(mainStem.geometry);

    // Generate branches
    const branchCount = params.branchCount + Math.floor(this.random() * 3);
    for (let i = 0; i < branchCount; i++) {
      const t = this.random() * 0.8;
      const branchLength = params.length * 0.3 * (0.5 + this.random() * 0.5);
      const branchThickness = params.stemThickness * 0.6;
      
      const branchDir = new Vector3(
        (this.random() - 0.5) * 2,
        this.random() * 0.5,
        (this.random() - 0.5) * 2
      ).normalize();
      
      const branch = this.generateBranch(
        mainStem.curve.getPoint(t),
        branchDir,
        branchLength,
        branchThickness,
        params.curliness * 0.7
      );
      geometries.push(branch.geometry);

      // Add leaves along branch
      if (params.leafDensity > 0) {
        this.addLeavesAlongCurve(
          branch.curve,
          params.leafDensity,
          params.leafSize * 0.8,
          'ivy',
          geometries
        );
      }
    }

    // Add leaves along main stem
    this.addLeavesAlongCurve(
      mainStem.curve,
      params.leafDensity,
      params.leafSize,
      'ivy',
      geometries
    );

    // Add aerial roots
    this.addAerialRoots(mainStem.curve, geometries);

    return mergeGeometries(geometries, true);
  }

  /**
   * Generate generic vine with tendrils
   */
  private generateVine(params: ClimbingPlantParams): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    
    const mainVine = this.generateStemCurve(params.length, params.stemThickness, params.curliness, params.growthDirection);
    geometries.push(mainVine.geometry);

    // Generate tendrils that curl around supports
    const tendrilCount = params.branchCount * 2;
    for (let i = 0; i < tendrilCount; i++) {
      const t = this.random() * 0.9;
      const tendrilLength = params.length * 0.15 * (0.5 + this.random() * 0.5);
      
      const tendril = this.generateTendril(
        mainVine.curve.getPoint(t),
        tendrilLength,
        params.stemThickness * 0.3,
        params.curliness * 1.5
      );
      geometries.push(tendril.geometry);
    }

    // Add leaves
    this.addLeavesAlongCurve(
      mainVine.curve,
      params.leafDensity * 0.7,
      params.leafSize,
      'heart',
      geometries
    );

    return mergeGeometries(geometries, true);
  }

  /**
   * Generate creeper with adhesive pads
   */
  private generateCreeper(params: ClimbingPlantParams): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    
    const creeper = this.generateStemCurve(params.length * 0.7, params.stemThickness * 1.2, params.curliness * 0.5, params.growthDirection);
    geometries.push(creeper.geometry);

    // Add adhesive pads
    const padCount = Math.floor(params.length * 3);
    const padGeometry = new CircleGeometry(params.stemThickness * 2, 8);
    
    for (let i = 0; i < padCount; i++) {
      const t = i / padCount;
      const point = creeper.curve.getPoint(t);
      const pad = new Mesh(padGeometry);
      pad.position.copy(point);
      pad.lookAt(point.clone().add(params.growthDirection));
      pad.scale.set(1, 1, 0.01);
      
      pad.updateMatrix();
      geometries.push(pad.geometry);
    }

    // Add small leaves
    this.addLeavesAlongCurve(
      creeper.curve,
      params.leafDensity * 0.5,
      params.leafSize * 0.6,
      'oval',
      geometries
    );

    return mergeGeometries(geometries, true);
  }

  /**
   * Generate liana (thick tropical vine)
   */
  private generateLiana(params: ClimbingPlantParams): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    
    // Lianas are thicker and less curly
    const lianaParams = {
      ...params,
      stemThickness: params.stemThickness * 2,
      curliness: params.curliness * 0.3,
    };
    
    const mainLiana = this.generateStemCurve(params.length, lianaParams.stemThickness, lianaParams.curliness, params.growthDirection);
    geometries.push(mainLiana.geometry);

    // Add secondary vines
    const secondaryCount = params.branchCount;
    for (let i = 0; i < secondaryCount; i++) {
      const t = this.random() * 0.7;
      const secondaryLength = params.length * 0.4 * (0.5 + this.random() * 0.5);
      
      const secondary = this.generateBranch(
        mainLiana.curve.getPoint(t),
        new Vector3((this.random() - 0.5) * 2, 0, (this.random() - 0.5) * 2).normalize(),
        secondaryLength,
        lianaParams.stemThickness * 0.7,
        lianaParams.curliness * 0.5
      );
      geometries.push(secondary.geometry);
    }

    // Add large tropical leaves
    this.addLeavesAlongCurve(
      mainLiana.curve,
      params.leafDensity * 0.4,
      params.leafSize * 1.5,
      'tropical',
      geometries
    );

    return mergeGeometries(geometries, true);
  }

  /**
   * Generate passion vine with distinctive flowers
   */
  private generatePassionVine(params: ClimbingPlantParams): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    
    const vine = this.generateStemCurve(params.length, params.stemThickness, params.curliness, params.growthDirection);
    geometries.push(vine.geometry);

    // Add tendrils
    const tendrilCount = params.branchCount;
    for (let i = 0; i < tendrilCount; i++) {
      const t = this.random() * 0.8;
      const tendril = this.generateTendril(
        vine.curve.getPoint(t),
        params.length * 0.2,
        params.stemThickness * 0.4,
        params.curliness * 2
      );
      geometries.push(tendril.geometry);
    }

    // Add passion flower leaves (3-lobed)
    this.addLeavesAlongCurve(
      vine.curve,
      params.leafDensity,
      params.leafSize,
      'passion',
      geometries
    );

    // Add occasional flowers
    const flowerCount = Math.floor(params.length * 0.5);
    for (let i = 0; i < flowerCount; i++) {
      const t = 0.3 + this.random() * 0.6;
      const flower = this.generatePassionFlower(params.leafSize * 0.8);
      const point = vine.curve.getPoint(t);
      flower.position.copy(point);
      flower.updateMatrix();
      geometries.push(flower.geometry);
    }

    return mergeGeometries(geometries, true);
  }

  /**
   * Generate a curved stem using CatmullRomCurve3
   */
  private generateStemCurve(
    length: number,
    thickness: number,
    curliness: number,
    direction: Vector3
  ): { curve: CatmullRomCurve3; geometry: BufferGeometry } {
    const pointCount = 20;
    const points: Vector3[] = [new Vector3(0, 0, 0)];

    for (let i = 1; i < pointCount; i++) {
      const t = i / pointCount;
      const progress = t * length;
      
      const offset = new Vector3(
        (this.random() - 0.5) * curliness,
        progress / length * direction.y * length,
        (this.random() - 0.5) * curliness
      );
      
      if (direction.x !== 0) offset.x += direction.x * progress;
      if (direction.z !== 0) offset.z += direction.z * progress;
      
      points.push(offset);
    }

    const curve = new CatmullRomCurve3(points);
    curve.tension = 0.5;
    
    const geometry = new TubeGeometry(curve, 16, thickness, 6, false);
    return { curve, geometry };
  }

  /**
   * Generate a branch off a main stem
   */
  private generateBranch(
    startPoint: Vector3,
    direction: Vector3,
    length: number,
    thickness: number,
    curliness: number
  ): { curve: CatmullRomCurve3; geometry: BufferGeometry } {
    const pointCount = 15;
    const points: Vector3[] = [startPoint.clone()];

    for (let i = 1; i < pointCount; i++) {
      const t = i / pointCount;
      const progress = t * length;
      
      const offset = direction.clone().multiplyScalar(progress);
      offset.x += (this.random() - 0.5) * curliness * t;
      offset.z += (this.random() - 0.5) * curliness * t;
      offset.y += this.random() * curliness * 0.5 * t;
      
      points.push(offset);
    }

    const curve = new CatmullRomCurve3(points);
    curve.tension = 0.5;
    
    const geometry = new TubeGeometry(curve, 12, thickness, 6, false);
    return { curve, geometry };
  }

  /**
   * Generate a curling tendril
   */
  private generateTendril(
    startPoint: Vector3,
    length: number,
    thickness: number,
    curliness: number
  ): { curve: CatmullRomCurve3; geometry: BufferGeometry } {
    const pointCount = 25;
    const points: Vector3[] = [startPoint.clone()];

    for (let i = 1; i < pointCount; i++) {
      const t = i / pointCount;
      const angle = t * Math.PI * 4 * curliness;
      const radius = length * 0.3 * (1 - t);
      
      const offset = new Vector3(
        Math.cos(angle) * radius,
        t * length * 0.5,
        Math.sin(angle) * radius
      );
      
      points.push(startPoint.clone().add(offset));
    }

    const curve = new CatmullRomCurve3(points);
    curve.tension = 0.5;
    
    const geometry = new TubeGeometry(curve, 20, thickness, 6, false);
    return { curve, geometry };
  }

  /**
   * Add leaves along a curve
   */
  private addLeavesAlongCurve(
    curve: CatmullRomCurve3,
    density: number,
    size: number,
    leafType: string,
    geometries: BufferGeometry[]
  ) {
    const leafCount = Math.floor(curve.getLength() * density * 10);
    
    for (let i = 0; i < leafCount; i++) {
      const t = this.random();
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      
      const leaf = this.generateLeaf(size, leafType);
      leaf.position.copy(point);
      
      // Orient leaf perpendicular to stem
      const up = new Vector3(0, 1, 0);
      const axis = new Vector3().crossVectors(tangent, up).normalize();
      const angle = Math.acos(tangent.dot(up));
      leaf.quaternion.setFromAxisAngle(axis, angle);
      
      leaf.updateMatrix();
      geometries.push(leaf.geometry);
    }
  }

  /**
   * Generate individual leaf geometry
   */
  private generateLeaf(size: number, type: string): Mesh {
    let shape;
    
    switch (type) {
      case 'ivy':
        shape = this.createIvyLeafShape(size);
        break;
      case 'heart':
        shape = this.createHeartLeafShape(size);
        break;
      case 'oval':
        shape = this.createOvalLeafShape(size);
        break;
      case 'tropical':
        shape = this.createTropicalLeafShape(size);
        break;
      case 'passion':
        shape = this.createPassionLeafShape(size);
        break;
      default:
        shape = this.createOvalLeafShape(size);
    }

    const geometry = new ExtrudeGeometry(shape, {
      depth: size * 0.05,
      bevelEnabled: true,
      bevelThickness: size * 0.01,
      bevelSize: size * 0.01,
      bevelSegments: 2,
    });

    const mesh = new Mesh(geometry);
    return mesh;
  }

  /**
   * Create ivy leaf shape (lobed)
   */
  private createIvyLeafShape(size: number) {
    const shape = new THREE.Shape();
    const points = 20;
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = size * (0.5 + 0.3 * Math.sin(angle * 3));
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.8;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    return shape;
  }

  /**
   * Create heart-shaped leaf
   */
  private createHeartLeafShape(size: number) {
    const shape = new THREE.Shape();
    const points = 30;
    
    for (let i = 0; i <= points; i++) {
      const t = (i / points) * Math.PI * 2;
      const x = size * Math.sin(t);
      const y = size * (Math.cos(t) - 0.5 * Math.cos(2 * t));
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    return shape;
  }

  /**
   * Create oval leaf shape
   */
  private createOvalLeafShape(size: number) {
    const shape = new THREE.Shape();
    shape.ellipse(0, 0, size, size * 0.6);
    return shape;
  }

  /**
   * Create tropical leaf shape (large, palmate)
   */
  private createTropicalLeafShape(size: number) {
    const shape = new THREE.Shape();
    const points = 24;
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = size * (0.7 + 0.3 * Math.cos(angle * 5));
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.9;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    return shape;
  }

  /**
   * Create passion flower leaf shape (3-lobed)
   */
  private createPassionLeafShape(size: number) {
    const shape = new THREE.Shape();
    const points = 36;
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = size * (0.6 + 0.4 * Math.sin(angle * 3 + Math.PI / 2));
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.8;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    return shape;
  }

  /**
   * Add aerial roots for ivy
   */
  private addAerialRoots(curve: CatmullRomCurve3, geometries: BufferGeometry[]) {
    const rootCount = Math.floor(curve.getLength() * 2);
    
    for (let i = 0; i < rootCount; i++) {
      const t = this.random();
      const point = curve.getPoint(t);
      const rootLength = 0.05 + this.random() * 0.1;
      const rootThickness = 0.005;
      
      const rootGeometry = new CylinderGeometry(rootThickness, rootThickness * 0.5, rootLength, 6);
      const root = new Mesh(rootGeometry);
      root.position.copy(point);
      root.rotation.x = Math.PI / 2;
      root.updateMatrix();
      
      geometries.push(root.geometry);
    }
  }

  /**
   * Generate passion flower
   */
  private generatePassionFlower(size: number): Mesh {
    const geometries: BufferGeometry[] = [];
    
    // Petals
    const petalCount = 5;
    const petalGeometry = this.createPetalGeometry(size * 0.4);
    for (let i = 0; i < petalCount; i++) {
      const petal = new Mesh(petalGeometry);
      petal.rotation.z = (i / petalCount) * Math.PI * 2;
      petal.updateMatrix();
      geometries.push(petal.geometry);
    }
    
    // Corona filaments
    const filamentGeometry = new CylinderGeometry(0.01, 0.01, size * 0.3, 6);
    const filamentCount = 20;
    for (let i = 0; i < filamentCount; i++) {
      const filament = new Mesh(filamentGeometry);
      const angle = (i / filamentCount) * Math.PI * 2;
      const radius = size * 0.2;
      filament.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      filament.rotation.x = Math.PI / 4;
      filament.updateMatrix();
      geometries.push(filament.geometry);
    }
    
    const merged = mergeGeometries(geometries, true);
    return new Mesh(merged);
  }

  /**
   * Create petal geometry
   */
  private createPetalGeometry(size: number): BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(size * 0.5, size * 0.5, 0, size);
    shape.quadraticCurveTo(-size * 0.5, size * 0.5, 0, 0);
    
    return new ExtrudeGeometry(shape, {
      depth: size * 0.02,
      bevelEnabled: false,
    });
  }

  /**
   * Create plant material
   */
  private createPlantMaterial(seed?: number): THREE.MeshStandardMaterial {
    this.seedRandom(seed);
    
    const greenVariants = [
      new Color(0x2d5a27),
      new Color(0x3d6b36),
      new Color(0x4a7c43),
      new Color(0x568750),
      new Color(0x1a3d1a),
    ];
    
    const baseColor = greenVariants[Math.floor(this.random() * greenVariants.length)];
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }
}

/**
 * Organic scatter generator for ground cover objects
 */
export class OrganicScatterGenerator extends BaseAssetGenerator<OrganicScatterParams> {
  protected readonly defaultParams: OrganicScatterParams = {
    scatterType: 'pine_cone',
    scaleVariation: 0.3,
    count: 50,
    distributionRadius: 5.0,
    coneLength: 0.15,
    coneWidth: 0.08,
    needleLength: 0.03,
    needleCount: 3,
    slimeSpread: 0.5,
    slimeBlobs: 10,
    ...BaseAssetGenerator.defaultParams,
  };

  generate(params: Partial<OrganicScatterParams>): InstancedMesh | Mesh {
    const finalParams = this.mergeParams(this.defaultParams, params);
    this.seedRandom(params.seed);

    switch (finalParams.scatterType) {
      case 'pine_cone':
        return this.generatePineCones(finalParams);
      case 'pine_needle':
        return this.generatePineNeedles(finalParams);
      case 'acorn':
        return this.generateAcorns(finalParams);
      case 'leaf_litter':
        return this.generateLeafLitter(finalParams);
      case 'twig':
        return this.generateTwigs(finalParams);
      case 'slime_mold':
        return this.generateSlimeMold(finalParams);
      default:
        return this.generatePineCones(finalParams);
    }
  }

  /**
   * Generate scattered pine cones
   */
  private generatePineCones(params: OrganicScatterParams): InstancedMesh {
    const coneGeometry = this.createPineConeGeometry(
      params.coneLength!,
      params.coneWidth!
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: new Color(0x8b6f47),
      roughness: 0.9,
      metalness: 0.0,
    });
    
    const mesh = new InstancedMesh(coneGeometry, material, params.count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < params.count; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * params.distributionRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const scale = 0.5 + this.random() * params.scaleVariation;
      
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(
        this.random() * Math.PI,
        this.random() * Math.PI * 2,
        this.random() * Math.PI
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.userData = {
      assetType: 'organic_scatter',
      scatterType: 'pine_cone',
      semanticTags: ['scatter', 'organic', 'pine_cone', 'ground_cover'],
      count: params.count,
    };
    
    return mesh;
  }

  /**
   * Generate pine needles
   */
  private generatePineNeedles(params: OrganicScatterParams): InstancedMesh {
    const needleGeometry = this.createPineNeedleGeometry(params.needleLength!);
    
    const material = new THREE.MeshStandardMaterial({
      color: new Color(0x3d5a2f),
      roughness: 0.8,
      metalness: 0.0,
    });
    
    const totalNeedles = params.count * params.needleCount!;
    const mesh = new InstancedMesh(needleGeometry, material, totalNeedles);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < totalNeedles; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * params.distributionRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      dummy.position.set(x, 0.01, z);
      dummy.rotation.set(
        Math.PI / 2 + this.random() * 0.2,
        this.random() * Math.PI * 2,
        this.random() * Math.PI
      );
      dummy.scale.setScalar(0.5 + this.random() * params.scaleVariation);
      dummy.updateMatrix();
      
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.userData = {
      assetType: 'organic_scatter',
      scatterType: 'pine_needle',
      semanticTags: ['scatter', 'organic', 'pine_needle', 'ground_cover'],
      count: totalNeedles,
    };
    
    return mesh;
  }

  /**
   * Generate acorns
   */
  private generateAcorns(params: OrganicScatterParams): InstancedMesh {
    const acornGeometry = this.createAcornGeometry(0.04, 0.03);
    
    const material = new THREE.MeshStandardMaterial({
      color: new Color(0x6b4423),
      roughness: 0.7,
      metalness: 0.0,
    });
    
    const mesh = new InstancedMesh(acornGeometry, material, params.count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < params.count; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * params.distributionRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(
        this.random() * Math.PI,
        this.random() * Math.PI * 2,
        this.random() * Math.PI
      );
      dummy.scale.setScalar(0.5 + this.random() * params.scaleVariation);
      dummy.updateMatrix();
      
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.userData = {
      assetType: 'organic_scatter',
      scatterType: 'acorn',
      semanticTags: ['scatter', 'organic', 'acorn', 'ground_cover'],
      count: params.count,
    };
    
    return mesh;
  }

  /**
   * Generate leaf litter
   */
  private generateLeafLitter(params: OrganicScatterParams): InstancedMesh {
    const leafGeometry = this.createLeafLitterGeometry(0.05);
    
    const colors = [
      new Color(0x8b7355),
      new Color(0xa0826d),
      new Color(0xb8956a),
      new Color(0xc4a777),
      new Color(0x8b6f47),
    ];
    
    const material = new THREE.MeshStandardMaterial({
      color: colors[Math.floor(this.random() * colors.length)],
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    
    const mesh = new InstancedMesh(leafGeometry, material, params.count * 3);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < params.count * 3; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * params.distributionRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      dummy.position.set(x, 0.01, z);
      dummy.rotation.set(
        Math.PI / 2,
        this.random() * Math.PI * 2,
        this.random() * Math.PI
      );
      dummy.scale.setScalar(0.5 + this.random() * params.scaleVariation);
      dummy.updateMatrix();
      
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.userData = {
      assetType: 'organic_scatter',
      scatterType: 'leaf_litter',
      semanticTags: ['scatter', 'organic', 'leaf_litter', 'ground_cover'],
      count: params.count * 3,
    };
    
    return mesh;
  }

  /**
   * Generate twigs
   */
  private generateTwigs(params: OrganicScatterParams): InstancedMesh {
    const twigGeometry = this.createTwigGeometry(0.08, 0.005);
    
    const material = new THREE.MeshStandardMaterial({
      color: new Color(0x5c4033),
      roughness: 0.8,
      metalness: 0.0,
    });
    
    const mesh = new InstancedMesh(twigGeometry, material, params.count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    
    for (let i = 0; i < params.count; i++) {
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * params.distributionRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(
        this.random() * Math.PI,
        this.random() * Math.PI * 2,
        this.random() * Math.PI
      );
      dummy.scale.setScalar(0.5 + this.random() * params.scaleVariation);
      dummy.updateMatrix();
      
      mesh.setMatrixAt(i, dummy.matrix);
    }
    
    mesh.userData = {
      assetType: 'organic_scatter',
      scatterType: 'twig',
      semanticTags: ['scatter', 'organic', 'twig', 'ground_cover'],
      count: params.count,
    };
    
    return mesh;
  }

  /**
   * Generate slime mold blobs
   */
  private generateSlimeMold(params: OrganicScatterParams): Mesh {
    const geometries: BufferGeometry[] = [];
    
    const blobCount = params.slimeBlobs!;
    const spread = params.slimeSpread!;
    
    const colors = [
      new Color(0xffd700),
      new Color(0xffa500),
      new Color(0xffff00),
      new Color(0x9acd32),
    ];
    
    const baseColor = colors[Math.floor(this.random() * colors.length)];
    
    for (let i = 0; i < blobCount; i++) {
      const angle = (i / blobCount) * Math.PI * 2;
      const radius = this.random() * spread * 0.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const blobSize = 0.05 + this.random() * 0.1;
      const blobGeometry = new SphereGeometry(blobSize, 8, 8);
      
      const blob = new Mesh(blobGeometry);
      blob.position.set(x, blobSize * 0.5, z);
      blob.scale.set(1, 0.5, 1);
      blob.updateMatrix();
      
      geometries.push(blob.geometry);
    }
    
    const mergedGeometry = mergeGeometries(geometries, true);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.3,
      metalness: 0.0,
      transparent: true,
      opacity: 0.8,
    });
    
    const mesh = new Mesh(mergedGeometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    mesh.userData = {
      assetType: 'organic_scatter',
      scatterType: 'slime_mold',
      semanticTags: ['scatter', 'organic', 'slime_mold', 'fungus'],
      blobCount: blobCount,
    };
    
    return mesh;
  }

  /**
   * Create pine cone geometry
   */
  private createPineConeGeometry(length: number, width: number): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    
    // Central core
    const coreGeometry = new CylinderGeometry(width * 0.3, width * 0.4, length, 8);
    geometries.push(coreGeometry);
    
    // Scales
    const scaleCount = 12;
    for (let i = 0; i < scaleCount; i++) {
      const t = i / scaleCount;
      const y = -length / 2 + t * length;
      const scaleWidth = width * (0.5 + 0.5 * Math.sin(t * Math.PI));
      
      const scaleGeometry = new ConeGeometry(scaleWidth, 0.03, 5);
      const scale = new Mesh(scaleGeometry);
      scale.position.set(0, y, width * 0.4);
      scale.rotation.x = Math.PI / 3;
      scale.updateMatrix();
      
      geometries.push(scale.geometry);
    }
    
    return mergeGeometries(geometries, true);
  }

  /**
   * Create pine needle geometry
   */
  private createPineNeedleGeometry(length: number): BufferGeometry {
    const geometry = new CylinderGeometry(0.003, 0.002, length, 6);
    return geometry;
  }

  /**
   * Create acorn geometry
   */
  private createAcornGeometry(bodySize: number, capSize: number): BufferGeometry {
    const geometries: BufferGeometry[] = [];
    
    // Body (nut)
    const bodyGeometry = new SphereGeometry(bodySize, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const body = new Mesh(bodyGeometry);
    body.position.y = -bodySize * 0.5;
    body.updateMatrix();
    geometries.push(body.geometry);
    
    // Cap
    const capGeometry = new SphereGeometry(capSize, 8, 8, 0, Math.PI * 2, 0, Math.PI / 3);
    const cap = new Mesh(capGeometry);
    cap.position.y = bodySize * 0.3;
    cap.scale.set(1.2, 0.5, 1.2);
    cap.updateMatrix();
    geometries.push(cap.geometry);
    
    return mergeGeometries(geometries, true);
  }

  /**
   * Create leaf litter geometry
   */
  private createLeafLitterGeometry(size: number): BufferGeometry {
    const shape = new THREE.Shape();
    const points = 12;
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = size * (0.7 + 0.3 * Math.sin(angle * 3));
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.8;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    return new ExtrudeGeometry(shape, {
      depth: size * 0.02,
      bevelEnabled: false,
    });
  }

  /**
   * Create twig geometry
   */
  private createTwigGeometry(length: number, radius: number): BufferGeometry {
    const points: Vector3[] = [
      new Vector3(0, 0, 0),
      new Vector3((this.random() - 0.5) * 0.02, length * 0.5, (this.random() - 0.5) * 0.02),
      new Vector3((this.random() - 0.5) * 0.03, length, (this.random() - 0.5) * 0.03),
    ];
    
    const curve = new CatmullRomCurve3(points);
    const geometry = new TubeGeometry(curve, 8, radius, 6, false);
    return geometry;
  }
}

// Export convenience functions
export function createClimbingPlant(params: Partial<ClimbingPlantParams> = {}): Mesh {
  const generator = new ClimbingPlantGenerator();
  return generator.generate(params);
}

export function createOrganicScatter(params: Partial<OrganicScatterParams> = {}): InstancedMesh | Mesh {
  const generator = new OrganicScatterGenerator();
  return generator.generate(params);
}

export { ClimbingPlantGenerator, OrganicScatterGenerator };
