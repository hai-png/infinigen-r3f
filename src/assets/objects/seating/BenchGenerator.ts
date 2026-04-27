import { BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
/**
 * Bench Generator
 * 
 * Procedural generation of benches including
 * park benches, garden benches, indoor benches,
 * picnic tables, and storage benches.
 * 
 * @module BenchGenerator
 */

import * as THREE from 'three';
import { createNoise3D, NoiseFunction3D } from 'simplex-noise';

export type BenchType = 'park' | 'garden' | 'indoor' | 'picnic' | 'storage' | 'swings' | 'memorial';
export type BenchMaterial = 'wood' | 'metal' | 'concrete' | 'stone' | 'composite' | 'wrought_iron';
export type BenchStyle = 'traditional' | 'modern' | 'rustic' | 'ornate' | 'minimal';

export interface BenchParams extends BaseGeneratorConfig {
  type: BenchType;
  material: BenchMaterial;
  style: BenchStyle;
  length: number;
  width: number;
  height: number;
  seatHeight: number;
  backrestHeight: number;
  armrests: boolean;
  backrest: boolean;
  color: THREE.Color;
  secondaryColor?: THREE.Color;
  slatCount: number;
  decorative: boolean;
}

export interface BenchResult {
  mesh: THREE.Group;
  params: BenchParams;
}

export class BenchGenerator {
  private noise: NoiseFunction3D;

  constructor() {
    this.noise = createNoise3D();
  }

  /**
   * Generate a bench
   */
  generate(params: Partial<BenchParams> = {}): BenchResult {
    const finalParams: BenchParams = {
      type: params.type || 'park',
      material: params.material || 'wood',
      style: params.style || 'traditional',
      length: params.length || 1.8,
      width: params.width || 0.5,
      height: params.height || 0.85,
      seatHeight: params.seatHeight || 0.45,
      backrestHeight: params.backrestHeight || 0.8,
      armrests: params.armrests ?? true,
      backrest: params.backrest ?? true,
      color: params.color || new THREE.Color(0x8b6f47),
      secondaryColor: params.secondaryColor,
      slatCount: params.slatCount || 5,
      decorative: params.decorative || false
    };

    if (!finalParams.secondaryColor) {
      finalParams.secondaryColor = finalParams.color.clone().multiplyScalar(0.7);
    }

    const group = new THREE.Group();

    // Create legs
    const legs = this.createLegs(finalParams);
    group.add(legs);

    // Create seat
    const seat = this.createSeat(finalParams);
    group.add(seat);

    // Create backrest if requested
    if (finalParams.backrest) {
      const backrest = this.createBackrest(finalParams);
      group.add(backrest);
    }

    // Create armrests if requested
    if (finalParams.armrests) {
      const armrests = this.createArmrests(finalParams);
      group.add(armrests);
    }

    // Add decorative elements
    if (finalParams.decorative) {
      const decorations = this.createDecorations(finalParams);
      group.add(decorations);
    }

    // Special handling for specific types
    if (finalParams.type === 'picnic') {
      const table = this.createPicnicTable(finalParams);
      group.add(table);
    } else if (finalParams.type === 'storage') {
      const storage = this.createStorageBox(finalParams);
      group.add(storage);
    } else if (finalParams.type === 'swings') {
      const swing = this.createSwingBench(finalParams);
      group.add(swing);
    }

    return {
      mesh: group,
      params: finalParams
    };
  }

  /**
   * Create bench legs
   */
  private createLegs(params: BenchParams): THREE.Group {
    const group = new THREE.Group();
    const legCount = params.length > 2.5 ? 4 : 2;
    const legSpacing = params.length / (legCount - 1 || 1);

    for (let i = 0; i < legCount; i++) {
      const x = -params.length / 2 + i * legSpacing;
      
      let leg: THREE.Mesh;
      
      switch (params.style) {
        case 'ornate':
          leg = this.createOrnateLeg(params);
          break;
        case 'modern':
        case 'minimal':
          leg = this.createModernLeg(params);
          break;
        case 'rustic':
          leg = this.createRusticLeg(params);
          break;
        default:
          leg = this.createTraditionalLeg(params);
      }
      
      leg.position.x = x;
      group.add(leg);
    }

    // Add stretcher bars between legs
    if (legCount > 2) {
      const stretcher = this.createStretcher(params, legCount);
      group.add(stretcher);
    }

    return group;
  }

  /**
   * Create traditional turned leg
   */
  private createTraditionalLeg(params: BenchParams): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.04, 0.06, params.seatHeight, 8);
    const material = this.getMaterial(params.material, params.color);
    const leg = new THREE.Mesh(geometry, material);
    leg.position.y = params.seatHeight / 2;
    leg.castShadow = true;
    return leg;
  }

  /**
   * Create ornate decorative leg
   */
  private createOrnateLeg(params: BenchParams): THREE.Group {
    const group = new THREE.Group();
    
    // Main leg shaft
    const shaftGeometry = new THREE.CylinderGeometry(0.03, 0.05, params.seatHeight * 0.6, 8);
    const material = params.material === 'wrought_iron' 
      ? this.getWroughtIronMaterial(params.secondaryColor!)
      : this.getMaterial(params.material, params.color);
    const shaft = new THREE.Mesh(shaftGeometry, material);
    shaft.position.y = params.seatHeight * 0.5;
    group.add(shaft);

    // Decorative foot
    const footGeometry = new THREE.SphereGeometry(0.07, 8, 8);
    const foot = new THREE.Mesh(footGeometry, material);
    foot.position.y = params.seatHeight * 0.07;
    group.add(foot);

    // Decorative top
    const topGeometry = new THREE.TorusGeometry(0.06, 0.015, 8, 16);
    const top = new THREE.Mesh(topGeometry, material);
    top.rotation.x = Math.PI / 2;
    top.position.y = params.seatHeight * 0.9;
    group.add(top);

    return group;
  }

  /**
   * Create modern simple leg
   */
  private createModernLeg(params: BenchParams): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(0.08, params.seatHeight, 0.08);
    const material = params.material === 'metal' || params.material === 'wrought_iron'
      ? this.getMetalMaterial(params.secondaryColor || params.color)
      : this.getMaterial(params.material, params.color);
    const leg = new THREE.Mesh(geometry, material);
    leg.position.y = params.seatHeight / 2;
    leg.castShadow = true;
    return leg;
  }

  /**
   * Create rustic log-style leg
   */
  private createRusticLeg(params: BenchParams): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.07, 0.09, params.seatHeight, 7);
    const material = this.getWoodMaterial(params.color, true);
    const leg = new THREE.Mesh(geometry, material);
    leg.position.y = params.seatHeight / 2;
    leg.castShadow = true;
    return leg;
  }

  /**
   * Create seat surface
   */
  private createSeat(params: BenchParams): THREE.Group {
    const group = new THREE.Group();

    if (params.type === 'picnic') {
      // Picnic table uses planks
      const plankCount = params.slatCount;
      const plankWidth = params.width / plankCount;

      for (let i = 0; i < plankCount; i++) {
        const plank = this.createSlat(params, params.length, plankWidth - 0.01);
        plank.position.set(
          -params.length / 2 + params.length / 2,
          params.seatHeight,
          -params.width / 2 + i * plankWidth + plankWidth / 2
        );
        group.add(plank);
      }
    } else {
      // Standard bench with slats
      for (let i = 0; i < params.slatCount; i++) {
        const slat = this.createSlat(params, params.length, 0.08);
        const spacing = (params.width - 0.1) / (params.slatCount - 1 || 1);
        slat.position.set(
          0,
          params.seatHeight,
          -params.width / 2 + i * spacing
        );
        group.add(slat);
      }
    }

    // Add seat frame underneath
    const frame = this.createSeatFrame(params);
    group.add(frame);

    return group;
  }

  /**
   * Create individual slat
   */
  private createSlat(params: BenchParams, length: number, width: number): THREE.Mesh {
    const thickness = params.material === 'metal' ? 0.02 : 0.03;
    const geometry = new THREE.BoxGeometry(length, thickness, width);
    const material = this.getMaterial(params.material, params.color);
    const slat = new THREE.Mesh(geometry, material);
    slat.castShadow = true;
    slat.receiveShadow = true;
    return slat;
  }

  /**
   * Create seat support frame
   */
  private createSeatFrame(params: BenchParams): THREE.Group {
    const group = new THREE.Group();
    
    // Side rails
    const railGeometry = new THREE.BoxGeometry(params.length, 0.04, 0.06);
    const material = this.getMaterial(params.material, params.secondaryColor!);
    
    const leftRail = new THREE.Mesh(railGeometry, material);
    leftRail.position.set(0, params.seatHeight - 0.05, -params.width / 2 + 0.03);
    group.add(leftRail);
    
    const rightRail = new THREE.Mesh(railGeometry, material);
    rightRail.position.set(0, params.seatHeight - 0.05, params.width / 2 - 0.03);
    group.add(rightRail);

    // Cross supports
    const crossCount = 2;
    for (let i = 0; i < crossCount; i++) {
      const crossGeometry = new THREE.BoxGeometry(0.06, 0.04, params.width - 0.12);
      const cross = new THREE.Mesh(crossGeometry, material);
      cross.position.set(
        -params.length / 2 + params.length / (crossCount + 1) * (i + 1),
        params.seatHeight - 0.05,
        0
      );
      group.add(cross);
    }

    return group;
  }

  /**
   * Create backrest
   */
  private createBackrest(params: BenchParams): THREE.Group {
    const group = new THREE.Group();
    const backrestSlats = Math.floor(params.backrestHeight / 0.1);

    for (let i = 0; i < backrestSlats; i++) {
      const slat = this.createSlat(params, params.length, 0.06);
      slat.position.set(
        0,
        params.seatHeight + 0.1 + i * 0.1,
        -params.width / 2 - 0.03
      );
      slat.rotation.x = -0.1; // Slight recline
      group.add(slat);
    }

    // Backrest supports
    const supportGeometry = new THREE.BoxGeometry(0.05, params.backrestHeight, 0.03);
    const material = this.getMaterial(params.material, params.secondaryColor!);
    
    const supportPositions = [-params.length / 2 + 0.1, 0, params.length / 2 - 0.1];
    supportPositions.forEach(x => {
      const support = new THREE.Mesh(supportGeometry, material);
      support.position.set(x, params.seatHeight + params.backrestHeight / 2, -params.width / 2);
      support.rotation.x = -0.1;
      group.add(support);
    });

    return group;
  }

  /**
   * Create armrests
   */
  private createArmrests(params: BenchParams): THREE.Group {
    const group = new THREE.Group();

    const armrestGeometry = new THREE.BoxGeometry(0.08, 0.06, params.width + 0.1);
    const material = this.getMaterial(params.material, params.color);

    // Left armrest
    const leftArm = new THREE.Mesh(armrestGeometry, material);
    leftArm.position.set(-params.length / 2, params.seatHeight + 0.15, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    // Right armrest
    const rightArm = new THREE.Mesh(armrestGeometry, material);
    rightArm.position.set(params.length / 2, params.seatHeight + 0.15, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // Armrest supports
    if (params.style === 'ornate' || params.style === 'traditional') {
      const supportGeometry = new THREE.CylinderGeometry(0.02, 0.03, 0.15, 8);
      const supportMaterial = this.getMaterial(params.material, params.secondaryColor!);
      
      [leftArm, rightArm].forEach(arm => {
        const support = new THREE.Mesh(supportGeometry, supportMaterial);
        support.position.copy(arm.position).add(new THREE.Vector3(0, -0.1, 0));
        group.add(support);
      });
    }

    return group;
  }

  /**
   * Create stretcher bar between legs
   */
  private createStretcher(params: BenchParams, legCount: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(params.length * 0.8, 0.04, 0.04);
    const material = this.getMaterial(params.material, params.secondaryColor!);
    const stretcher = new THREE.Mesh(geometry, material);
    stretcher.position.y = params.seatHeight * 0.2;
    return stretcher;
  }

  /**
   * Create decorative elements
   */
  private createDecorations(params: BenchParams): THREE.Group {
    const group = new THREE.Group();

    if (params.style === 'ornate' || params.material === 'wrought_iron') {
      // Add scrollwork to sides
      const scrollGeometry = new THREE.TorusGeometry(0.1, 0.01, 8, 16, Math.PI);
      const material = this.getWroughtIronMaterial(params.secondaryColor!);
      
      const leftScroll = new THREE.Mesh(scrollGeometry, material);
      leftScroll.position.set(-params.length / 2 + 0.15, params.seatHeight * 0.5, 0);
      leftScroll.rotation.z = Math.PI / 2;
      group.add(leftScroll);

      const rightScroll = new THREE.Mesh(scrollGeometry, material);
      rightScroll.position.set(params.length / 2 - 0.15, params.seatHeight * 0.5, 0);
      rightScroll.rotation.z = -Math.PI / 2;
      group.add(rightScroll);
    }

    if (params.type === 'memorial') {
      // Add memorial plaque
      const plaqueGeometry = new THREE.BoxGeometry(0.3, 0.15, 0.01);
      const plaqueMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        roughness: 0.3,
        metalness: 0.8
      });
      const plaque = new THREE.Mesh(plaqueGeometry, plaqueMaterial);
      plaque.position.set(0, params.seatHeight + 0.3, -params.width / 2 - 0.01);
      group.add(plaque);
    }

    return group;
  }

  /**
   * Create picnic table extension
   */
  private createPicnicTable(params: BenchParams): THREE.Group {
    const group = new THREE.Group();
    
    // Create second bench on opposite side
    const secondBench = this.createSeat({ ...params, width: params.width });
    secondBench.position.z = params.width + 0.3;
    group.add(secondBench);

    // Create tabletop
    const tableHeight = params.seatHeight + 0.3;
    const tabletopGroup = new THREE.Group();
    
    for (let i = 0; i < params.slatCount + 2; i++) {
      const plank = this.createSlat(params, params.length, 0.12);
      plank.position.set(
        0,
        tableHeight,
        -params.width / 2 + i * 0.12
      );
      tabletopGroup.add(plank);
    }
    
    group.add(tabletopGroup);

    return group;
  }

  /**
   * Create storage box under seat
   */
  private createStorageBox(params: BenchParams): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(
      params.length - 0.1,
      0.3,
      params.width - 0.1
    );
    const material = this.getMaterial(params.material, params.secondaryColor!);
    const box = new THREE.Mesh(geometry, material);
    box.position.set(0, 0.15, 0);
    return box;
  }

  /**
   * Create swing bench frame
   */
  private createSwingBench(params: BenchParams): THREE.Group {
    const group = new THREE.Group();
    
    // Create A-frame supports
    const frameHeight = 2.5;
    const frameWidth = params.length + 0.4;
    
    const postGeometry = new THREE.CylinderGeometry(0.08, 0.1, frameHeight, 8);
    const material = this.getWoodMaterial(params.color, params.style === 'rustic');
    
    // Left A-frame
    const leftFrame = new THREE.Group();
    const leftPost1 = new THREE.Mesh(postGeometry, material);
    leftPost1.position.set(-frameWidth / 2, frameHeight / 2, -0.3);
    leftPost1.rotation.z = 0.15;
    leftFrame.add(leftPost1);
    
    const leftPost2 = new THREE.Mesh(postGeometry, material);
    leftPost2.position.set(-frameWidth / 2, frameHeight / 2, 0.3);
    leftPost2.rotation.z = -0.15;
    leftFrame.add(leftPost2);
    
    const leftCrossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, frameWidth, 8), material);
    leftCrossbar.rotation.z = Math.PI / 2;
    leftCrossbar.position.y = frameHeight * 0.9;
    leftFrame.add(leftCrossbar);
    
    group.add(leftFrame);

    // Right A-frame (mirrored)
    const rightFrame = leftFrame.clone();
    rightFrame.position.x = frameWidth;
    group.add(rightFrame);

    // Top beam
    const topBeamGeometry = new THREE.CylinderGeometry(0.1, 0.1, frameWidth, 8);
    const topBeam = new THREE.Mesh(topBeamGeometry, material);
    topBeam.rotation.z = Math.PI / 2;
    topBeam.position.set(frameWidth / 2, frameHeight, 0);
    group.add(topBeam);

    // Swing chains/ropes
    const chainMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.4,
      metalness: 0.8
    });
    
    const chainGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.8, 6);
    const chainPositions = [
      [-params.length / 2 + 0.2, frameHeight - 0.4, -params.width / 2],
      [params.length / 2 - 0.2, frameHeight - 0.4, -params.width / 2]
    ];
    
    chainPositions.forEach(pos => {
      const chain = new THREE.Mesh(chainGeometry, chainMaterial);
      chain.position.set(...pos);
      group.add(chain);
    });

    return group;
  }

  /**
   * Get appropriate material
   */
  private getMaterial(materialType: BenchMaterial, color: THREE.Color): THREE.Material {
    switch (materialType) {
      case 'wood':
        return this.getWoodMaterial(color, false);
      case 'metal':
        return this.getMetalMaterial(color);
      case 'concrete':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.9,
          metalness: 0
        });
      case 'stone':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.8,
          metalness: 0
        });
      case 'composite':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1
        });
      case 'wrought_iron':
        return this.getWroughtIronMaterial(color);
      default:
        return this.getWoodMaterial(color, false);
    }
  }

  /**
   * Get wood material
   */
  private getWoodMaterial(color: THREE.Color, rustic: boolean): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: rustic ? 0.8 : 0.6,
      metalness: 0
    });
  }

  /**
   * Get metal material
   */
  private getMetalMaterial(color: THREE.Color): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.8
    });
  }

  /**
   * Get wrought iron material
   */
  private getWroughtIronMaterial(color: THREE.Color): THREE.Material {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.9
    });
  }

  /**
   * Generate a row of benches
   */
  generateRow(
    count: number,
    spacing: number,
    params: Partial<BenchParams> = {}
  ): THREE.Group {
    const group = new THREE.Group();

    for (let i = 0; i < count; i++) {
      const bench = this.generate(params);
      bench.mesh.position.x = i * (params.length || 1.8 + spacing);
      group.add(bench.mesh);
    }

    return group;
  }
}

export default BenchGenerator;
