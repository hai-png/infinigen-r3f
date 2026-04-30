/**
 * MirrorGenerator - Procedural mirror generation with various frame styles
 * Generates wall mirrors, standing mirrors, decorative mirrors
 */
import {
  Group,
  Mesh,
  PlaneGeometry,
  BoxGeometry,
  CylinderGeometry,
  TorusGeometry,
  SphereGeometry,
  Material,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  MathUtils
} from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { NoiseUtils } from '../../utils/NoiseUtils';

export type MirrorStyle = 'wall' | 'standing' | 'vanity' | 'decorative' | 'round' | 'oval' | 'sunburst';
export type MirrorFrameStyle = 'simple' | 'ornate' | 'modern' | 'vintage' | 'rustic' | 'gilded';
export type MirrorShape = 'rectangular' | 'square' | 'round' | 'oval' | 'arched' | 'custom';

export interface MirrorConfig {
  style: MirrorStyle;
  frameStyle: MirrorFrameStyle;
  shape: MirrorShape;
  width: number;
  height: number;
  frameWidth: number;
  frameThickness: number;
  hasStand: boolean;
  seed?: number;
}

export class MirrorGenerator extends BaseObjectGenerator<MirrorConfig> {
  protected readonly defaultParams: MirrorConfig = {
    style: 'wall',
    frameStyle: 'simple',
    shape: 'rectangular',
    width: 0.8,
    height: 1.2,
    frameWidth: 0.05,
    frameThickness: 0.03,
    hasStand: false,
    seed: undefined
  };

  private noise: NoiseUtils;

  constructor() {
    super();
    this.noise = new NoiseUtils();
  }

  getDefaultConfig(): MirrorConfig {
    return { ...this.defaultParams };
  }

  generate(params: Partial<MirrorConfig> = {}): Group {
    const finalParams = { ...this.defaultParams, ...params };
    if (finalParams.seed !== undefined) {
      this.noise.setSeed(finalParams.seed);
    }

    const group = new Group();
    
    // Create mirror glass
    this.createMirrorGlass(group, finalParams);
    
    // Create frame
    this.createFrame(group, finalParams);
    
    // Add stand if requested
    if (finalParams.hasStand || finalParams.style === 'standing') {
      this.createStand(group, finalParams);
    }

    return group;
  }

  private createMirrorGlass(group: Group, params: MirrorConfig): void {
    let geometry: BufferGeometry;
    
    switch (params.shape) {
      case 'round':
        geometry = this.createCircularGlass(params.width / 2, params.height / 2);
        break;
      case 'oval':
        geometry = this.createOvalGlass(params.width / 2, params.height / 2);
        break;
      case 'arched':
        geometry = this.createArchedGlass(params.width, params.height);
        break;
      default:
        geometry = new PlaneGeometry(params.width, params.height, 1, 1);
    }
    
    const glassMat = new MeshPhysicalMaterial({
      color: 0xe8e8e8,
      metalness: 0.9,
      roughness: 0.05,
      transmission: 0.0,
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03
    });
    
    const glass = new Mesh(geometry, glassMat);
    group.add(glass);
  }

  private createCircularGlass(radiusX: number, radiusY: number): BufferGeometry {
    const segments = 64;
    const geometry = new PlaneGeometry(1, 1, segments, segments);
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] * radiusX;
      const y = positions[i + 1] * radiusY;
      const dist = Math.sqrt(x * x + y * y);
      
      if (dist > Math.min(radiusX, radiusY)) {
        positions[i] = 0;
        positions[i + 1] = 0;
        positions[i + 2] = -1000; // Hide vertex
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  private createOvalGlass(radiusX: number, radiusY: number): BufferGeometry {
    const segments = 64;
    const geometry = new PlaneGeometry(1, 1, segments, segments);
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const normalizedDist = Math.sqrt(x * x + y * y);
      
      // Ellipse equation: (x/a)^2 + (y/b)^2 <= 1
      const ellipseDist = Math.sqrt(
        Math.pow(x / radiusX, 2) + Math.pow(y / radiusY, 2)
      );
      
      if (ellipseDist > 1) {
        positions[i] = 0;
        positions[i + 1] = 0;
        positions[i + 2] = -1000;
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  private createArchedGlass(width: number, height: number): BufferGeometry {
    const segments = 32;
    const geometry = new PlaneGeometry(width, height, segments, segments);
    const positions = geometry.attributes.position.array as Float32Array;
    const archHeight = height * 0.3;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      
      // Cut off top corners for arch
      if (y > height / 2 - archHeight) {
        const archY = y - (height / 2 - archHeight);
        const archRadius = width / 2;
        const xOffset = Math.sqrt(Math.max(0, archRadius * archRadius - archY * archY));
        
        if (Math.abs(x) > xOffset) {
          positions[i] = 0;
          positions[i + 1] = 0;
          positions[i + 2] = -1000;
        }
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  private createFrame(group: Group, params: MirrorConfig): void {
    const frameMat = this.getFrameMaterial(params.frameStyle);
    
    switch (params.shape) {
      case 'round':
        this.createRoundFrame(group, params, frameMat);
        break;
      case 'oval':
        this.createOvalFrame(group, params, frameMat);
        break;
      default:
        this.createRectangularFrame(group, params, frameMat);
    }
  }

  private createRectangularFrame(group: Group, params: MirrorConfig, material: Material): void {
    const { width, height, frameWidth, frameThickness } = params;
    
    // Top and bottom
    const horizontalGeom = new BoxGeometry(width + frameWidth * 2, frameWidth, frameThickness);
    const topFrame = new Mesh(horizontalGeom, material);
    topFrame.position.y = height / 2 + frameWidth / 2;
    group.add(topFrame);
    
    const bottomFrame = new Mesh(horizontalGeom, material);
    bottomFrame.position.y = -height / 2 - frameWidth / 2;
    group.add(bottomFrame);
    
    // Left and right
    const verticalGeom = new BoxGeometry(frameWidth, height, frameThickness);
    const leftFrame = new Mesh(verticalGeom, material);
    leftFrame.position.x = -width / 2 - frameWidth / 2;
    group.add(leftFrame);
    
    const rightFrame = new Mesh(verticalGeom, material);
    rightFrame.position.x = width / 2 + frameWidth / 2;
    group.add(rightFrame);
    
    // Add ornate details if requested
    if (params.frameStyle === 'ornate' || params.frameStyle === 'gilded') {
      this.addOrnateDetails(group, params, material);
    }
  }

  private createRoundFrame(group: Group, params: MirrorConfig, material: Material): void {
    const outerRadius = Math.max(params.width, params.height) / 2 + params.frameWidth;
    const innerRadius = Math.max(params.width, params.height) / 2;
    const thickness = params.frameThickness;
    
    // Create torus for round frame
    const torusRadius = (outerRadius + innerRadius) / 2;
    const tubeRadius = (outerRadius - innerRadius) / 2;
    
    const frameGeom = new TorusGeometry(torusRadius, tubeRadius, 16, 64);
    const frame = new Mesh(frameGeom, material);
    frame.rotation.x = Math.PI / 2;
    group.add(frame);
    
    // Add decorative elements for ornate styles
    if (params.frameStyle === 'ornate' || params.frameStyle === 'gilded') {
      this.addRoundOrnaments(group, torusRadius, material);
    }
  }

  private createOvalFrame(group: Group, params: MirrorConfig, material: Material): void {
    // Approximate oval with scaled torus
    const outerRadiusX = params.width / 2 + params.frameWidth;
    const outerRadiusY = params.height / 2 + params.frameWidth;
    const innerRadiusX = params.width / 2;
    const innerRadiusY = params.height / 2;
    
    const avgRadius = (outerRadiusX + outerRadiusY + innerRadiusX + innerRadiusY) / 4;
    const tubeRadius = (outerRadiusX - innerRadiusX + outerRadiusY - innerRadiusY) / 4;
    
    const frameGeom = new TorusGeometry(avgRadius, tubeRadius, 16, 64);
    const frame = new Mesh(frameGeom, material);
    frame.rotation.x = Math.PI / 2;
    frame.scale.set(
      (outerRadiusX + innerRadiusX) / (2 * avgRadius),
      (outerRadiusY + innerRadiusY) / (2 * avgRadius),
      1
    );
    group.add(frame);
  }

  private addOrnateDetails(group: Group, params: MirrorConfig, material: Material): void {
    const cornerSize = params.frameWidth * 1.5;
    const cornerGeom = new BoxGeometry(cornerSize, cornerSize, params.frameThickness * 1.2);
    
    const corners = [
      [-params.width / 2 - params.frameWidth / 2, params.height / 2 + params.frameWidth / 2],
      [params.width / 2 + params.frameWidth / 2, params.height / 2 + params.frameWidth / 2],
      [-params.width / 2 - params.frameWidth / 2, -params.height / 2 - params.frameWidth / 2],
      [params.width / 2 + params.frameWidth / 2, -params.height / 2 - params.frameWidth / 2]
    ];
    
    corners.forEach(pos => {
      const corner = new Mesh(cornerGeom, material);
      corner.position.set(pos[0], pos[1], 0);
      group.add(corner);
    });
    
    // Add center ornaments on top and bottom
    if (params.frameStyle === 'gilded') {
      const ornamentGeom = new SphereGeometry(params.frameWidth * 0.8, 16, 16);
      const topOrnament = new Mesh(ornamentGeom, material);
      topOrnament.position.y = params.height / 2 + params.frameWidth;
      group.add(topOrnament);
      
      const bottomOrnament = new Mesh(ornamentGeom, material);
      bottomOrnament.position.y = -params.height / 2 - params.frameWidth;
      group.add(bottomOrnament);
    }
  }

  private addRoundOrnaments(group: Group, radius: number, material: Material): void {
    const ornamentCount = 8;
    const ornamentGeom = new SphereGeometry(0.03, 16, 16);
    
    for (let i = 0; i < ornamentCount; i++) {
      const angle = (i / ornamentCount) * Math.PI * 2;
      const ornament = new Mesh(ornamentGeom, material);
      ornament.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      );
      group.add(ornament);
    }
  }

  private createStand(group: Group, params: MirrorConfig): void {
    const standMat = new MeshStandardMaterial({
      color: 0x4a4a4a,
      metalness: 0.7,
      roughness: 0.3
    });
    
    // Base
    const baseGeom = new BoxGeometry(params.width * 0.6, 0.02, params.frameThickness * 3);
    const base = new Mesh(baseGeom, standMat);
    base.position.y = -params.height / 2 - 0.01;
    group.add(base);
    
    // Support legs
    const legGeom = new CylinderGeometry(0.01, 0.01, 0.15, 8);
    const legAngle = Math.PI / 6;
    
    const leftLeg = new Mesh(legGeom, standMat);
    leftLeg.rotation.x = legAngle;
    leftLeg.position.set(-params.width * 0.2, -params.height / 2 - 0.075, params.frameThickness);
    group.add(leftLeg);
    
    const rightLeg = new Mesh(legGeom, standMat);
    rightLeg.rotation.x = legAngle;
    rightLeg.position.set(params.width * 0.2, -params.height / 2 - 0.075, params.frameThickness);
    group.add(rightLeg);
  }

  private getFrameMaterial(style: MirrorFrameStyle): Material {
    const configs = {
      simple: { color: 0x2a2a2a, roughness: 0.5, metalness: 0.3 },
      ornate: { color: 0x8B4513, roughness: 0.4, metalness: 0.2 },
      modern: { color: 0x1a1a1a, roughness: 0.2, metalness: 0.8 },
      vintage: { color: 0x654321, roughness: 0.6, metalness: 0.1 },
      rustic: { color: 0x5c4033, roughness: 0.8, metalness: 0.0 },
      gilded: { color: 0xffd700, roughness: 0.2, metalness: 0.9 }
    };
    
    const config = configs[style];
    return new MeshStandardMaterial(config);
  }

  getVariations(count: number = 4, baseConfig?: Partial<MirrorConfig>): THREE.Object3D[] {
    const variations: THREE.Object3D[] = [];

    const styles: MirrorStyle[] = ['wall', 'standing', 'vanity', 'decorative'];
    const frameStyles: MirrorFrameStyle[] = ['simple', 'ornate', 'modern', 'vintage', 'rustic', 'gilded'];
    const shapes: MirrorShape[] = ['rectangular', 'square', 'round', 'oval', 'arched'];
    
    const configs: MirrorConfig[] = [];
    for (let i = 0; i < count; i++) {
      const style = styles[Math.floor(Math.random() * styles.length)];
      configs.push({
        style,
        frameStyle: frameStyles[Math.floor(Math.random() * frameStyles.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        width: 0.5 + Math.random() * 1.0,
        height: 0.8 + Math.random() * 1.2,
        frameWidth: 0.03 + Math.random() * 0.08,
        frameThickness: 0.02 + Math.random() * 0.04,
        hasStand: style === 'standing' || Math.random() > 0.7,
        seed: Math.floor(Math.random() * 10000)
      });
    }

    for (let i = 0; i < count && i < configs.length; i++) {
      const config = baseConfig ? { ...configs[i], ...baseConfig } : configs[i];
      variations.push(this.generate(config));
    }
    
    return variations;
  }
}
